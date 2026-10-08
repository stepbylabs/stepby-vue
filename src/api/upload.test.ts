/**
 * G-10 分片上传前端单元测试（批次十八）
 *
 * 覆盖：
 * - 纯函数：shouldChunk 阈值分流 / calcParts 分片数 / calcMissing 缺失索引 / sliceParts 切片
 * - 编排器 uploadFileChunked（mock axios 网络层——功能正确性由 e2e F98 真链路兜底验证）：
 *   快乐路径全链路 / 断点续传（首轮部分失败 → session 查缺失 → 补传）/ 最终失败 abort 清理
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const axiosMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    post: (...args: unknown[]) => axiosMock('POST', ...args),
    get: (...args: unknown[]) => axiosMock('GET', ...args),
    delete: (...args: unknown[]) => axiosMock('DELETE', ...args)
  }
}))

// getToken 依赖 cookie——测试环境无登录态，mock 返回固定 token
vi.mock('@/utils/auth', () => ({ getToken: () => 'test-token' }))

import { calcMissing, calcParts, shouldChunk, sliceParts, uploadFileChunked } from './upload'

describe('G-10 分片上传 · 纯函数', () => {
  it('shouldChunk：8MB 阈值边界（≤ 阈值单请求，> 阈值分片）', () => {
    expect(shouldChunk(8 * 1024 * 1024)).toBe(false)
    expect(shouldChunk(8 * 1024 * 1024 + 1)).toBe(true)
    expect(shouldChunk(1024 * 1024 * 1024)).toBe(true)
  })

  it('calcParts：向上取整且至少 1 片', () => {
    expect(calcParts(0)).toBe(1)
    expect(calcParts(1)).toBe(1)
    expect(calcParts(11 * 1024 * 1024)).toBe(3) // 5MB 片：5+5+1
    expect(calcParts(10 * 1024 * 1024)).toBe(2)
  })

  it('calcMissing：全部索引 - 已收索引（升序）', () => {
    expect(calcMissing(5, [0, 2, 4])).toEqual([1, 3])
    expect(calcMissing(3, [])).toEqual([0, 1, 2])
    expect(calcMissing(3, [0, 1, 2])).toEqual([])
  })

  it('sliceParts：末片可小于片大小', () => {
    const blob = new Blob(['A'.repeat(11)], { type: 'application/octet-stream' })
    const parts = sliceParts(blob, 3, 5)
    expect(parts).toHaveLength(3)
    expect(parts[0].size).toBe(5)
    expect(parts[1].size).toBe(5)
    expect(parts[2].size).toBe(1)
  })
})

describe('G-10 分片上传 · 编排器 uploadFileChunked', () => {
  /** 构造 axios mock 响应（AjaxResult 包套形状，与后端序列化一致） */
  function ok(data: unknown) {
    return Promise.resolve({ data: { code: 200, msg: 'ok', data } })
  }

  beforeEach(() => {
    axiosMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('快乐路径：init → 3 片（含索引与切片大小）→ complete，进度到达 100', async () => {
    const file = new File(['A'.repeat(11)], 'it-chunk.bin', { type: 'application/octet-stream' })
    // 4 字节片：11 = 4+4+3 → 3 片

    axiosMock.mockImplementation((method: string, url: string, body?: unknown) => {
      if (method === 'POST' && url.includes('/chunk/init')) {
        return ok({ sessionId: 'sid-1', chunkSize: 4, ttlSecs: 7200 })
      }
      if (method === 'POST' && url.includes('/chunk/part')) {
        const form = body as FormData
        expect(form.get('sessionId')).toBe('sid-1')
        return ok({ sessionId: 'sid-1', received: 1, totalParts: 3, complete: false })
      }
      if (method === 'GET' && url.includes('/chunk/session/')) {
        return ok({ sessionId: 'sid-1', received: 3, totalParts: 3, complete: true, receivedIndexes: [0, 1, 2] })
      }
      if (method === 'POST' && url.includes('/chunk/complete')) {
        return ok({ code: 200, msg: 'ok', url: '/uploads/file/x.bin', fileName: '/uploads/file/x.bin', newFileName: 'x.bin', originalFilename: 'it-chunk.bin' })
      }
      return Promise.reject(new Error(`unexpected ${method} ${url}`))
    })

    const progresses: number[] = []
    const result = await uploadFileChunked(file, { onProgress: (p) => progresses.push(p), partSize: 4 })

    expect(result.url).toBe('/uploads/file/x.bin')
    expect(result.code).toBe(200)
    // 3 片全部上传
    const partCalls = axiosMock.mock.calls.filter(([m, u]) => m === 'POST' && String(u).includes('/chunk/part'))
    expect(partCalls).toHaveLength(3)
    const indexes = partCalls.map(([, , body]) => Number((body as FormData).get('partIndex'))).sort((a, b) => a - b)
    expect(indexes).toEqual([0, 1, 2])
    // 首片内容与切片一致（multipart 里 blob 序列化不可直接比对——此处验证 file 字段存在）
    expect((partCalls[0][2] as FormData).get('file')).toBeTruthy()
    // 进度单调到最后 100
    expect(progresses[progresses.length - 1]).toBe(100)
  })

  it('断点续传：首轮部分片失败 → session 查缺失 → 只补缺失片 → complete', async () => {
    const file = new File(['B'.repeat(11)], 'it-resume.bin', { type: 'application/octet-stream' })
    // 服务端权威状态：part 成功即入集合（index=1 首次调用模拟网络失败不入集合）
    const receivedSet = new Set<number>()
    const attempted = new Set<number>()

    axiosMock.mockImplementation((method: string, url: string, body?: unknown) => {
      if (method === 'POST' && url.includes('/chunk/init')) {
        return ok({ sessionId: 'sid-2', chunkSize: 4, ttlSecs: 7200 })
      }
      if (method === 'POST' && url.includes('/chunk/part')) {
        const form = body as FormData
        const idx = Number(form.get('partIndex'))
        if (idx === 1 && !attempted.has(idx)) {
          // 模拟 index=1 首次调用网络失败（与并发时序无关）
          attempted.add(idx)
          return Promise.reject(new Error('network glitch'))
        }
        receivedSet.add(idx)
        return ok({ sessionId: 'sid-2', received: receivedSet.size, totalParts: 3, complete: false })
      }
      if (method === 'GET' && url.includes('/chunk/session/')) {
        const received = Array.from(receivedSet).sort((a, b) => a - b)
        return ok({ sessionId: 'sid-2', received: received.length, totalParts: 3, complete: received.length === 3, receivedIndexes: received })
      }
      if (method === 'POST' && url.includes('/chunk/complete')) {
        expect(receivedSet.size).toBe(3)
        return ok({ code: 200, msg: 'ok', url: '/uploads/file/y.bin', fileName: '/uploads/file/y.bin', newFileName: 'y.bin', originalFilename: 'it-resume.bin' })
      }
      return Promise.reject(new Error(`unexpected ${method} ${url}`))
    })

    const result = await uploadFileChunked(file, { partSize: 4 })
    expect(result.url).toBe('/uploads/file/y.bin')
    // index=1 的 part 调用恰好 2 次（首轮失败 1 次 + 续传补传 1 次）
    const part1Calls = axiosMock.mock.calls.filter(
      ([m, u, b]) => m === 'POST' && String(u).includes('/chunk/part') && Number((b as FormData).get('partIndex')) === 1
    )
    expect(part1Calls).toHaveLength(2)
    // 无 abort（最终成功）
    const aborts = axiosMock.mock.calls.filter(([m, u]) => m === 'DELETE' && String(u).includes('/chunk/'))
    expect(aborts).toHaveLength(0)
  })

  it('最终失败：持续失败 → abort 清理会话（孤儿分片由服务端定时任务兜底）', async () => {
    const file = new File(['C'.repeat(11)], 'it-fail.bin', { type: 'application/octet-stream' })

    axiosMock.mockImplementation((method: string, url: string) => {
      if (method === 'POST' && url.includes('/chunk/init')) {
        return ok({ sessionId: 'sid-3', chunkSize: 4, ttlSecs: 7200 })
      }
      if (method === 'POST' && url.includes('/chunk/part')) {
        return Promise.reject(new Error('server down'))
      }
      if (method === 'GET' && url.includes('/chunk/session/')) {
        return ok({ sessionId: 'sid-3', received: 0, totalParts: 3, complete: false, receivedIndexes: [] })
      }
      if (method === 'DELETE' && url.includes('/chunk/')) {
        return Promise.resolve({ data: { code: 200, msg: 'ok' } })
      }
      return Promise.reject(new Error(`unexpected ${method} ${url}`))
    })

    await expect(uploadFileChunked(file, { partSize: 4 })).rejects.toThrow()
    // 三轮（首轮 + RESUME_ROUNDS=2）后放弃 → abort 恰好 1 次
    const aborts = axiosMock.mock.calls.filter(([m, u]) => m === 'DELETE' && String(u).includes('/chunk/'))
    expect(aborts).toHaveLength(1)
    // 无 complete 调用（从未收齐）
    const completes = axiosMock.mock.calls.filter(([m, u]) => m === 'POST' && String(u).includes('/chunk/complete'))
    expect(completes).toHaveLength(0)
  })
})
