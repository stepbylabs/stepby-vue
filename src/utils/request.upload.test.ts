/**
 * utils/request 上传载荷契约测试（b71 回归锁）
 *
 * 锁定的真实缺陷（浏览器实证，2026-10-16）：
 * `service.defaults.headers['Content-Type'] = 'application/json;charset=utf-8'` 是**实例顶层默认头**，
 * 会合并进每一个请求（包括 FormData 上传）。axios 1.20 的 `transformRequest` 见
 * 「JSON 头 + FormData」会走 `formDataToJSON` 把 FormData 序列化成 JSON ——
 * 实测请求体只剩 `{"file":{"uid":1792149854495}}`（文件字节整体丢失），后端 multipart 解析 400
 * （`Invalid 'boundary' for 'multipart/form-data' request`）。
 * 而 `xhr` 适配器里"FormData 时移除 Content-Type"的分支发生在 transformRequest **之后**
 * （resolveConfig 判的是已变成字符串的 data），因此救不回来。
 * 手动写 `Content-Type: multipart/form-data` 同样不行：boundary 只有浏览器在头缺省时才补
 * （MarkdownEditor 曾这样写，图片上传必然 400）。
 *
 * 口径：拦截器把上传载荷（FormData / Blob / File）的 Content-Type 置 `false`
 * ——`AxiosHeaders.toJSON` 会过滤 null/undefined/false ⇒ 头不发出，且不会被 dispatchRequest
 * 的 `application/x-www-form-urlencoded` 缺省补值（rewrite=false 仅在头缺省时生效）重新覆盖。
 *
 * 用真实 axios 实例 + 桩适配器：桩适配器看到的 config 已跑完「请求拦截器 → transformRequest」，
 * 与浏览器实际发出的载荷/头一致（除 resolveConfig 的 FormData 分支外无其他差异）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import service from '@/utils/request'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type Captured = { config: InternalAxiosRequestConfig; wire: Record<string, unknown> }

/** 复刻 xhr 适配器取头的方式：toJSON 过滤 null/undefined/false 才是真正上线的头 */
function wireHeaders(headers: unknown): Record<string, unknown> {
  const obj = (headers as { toJSON: () => Record<string, unknown> }).toJSON()
  return { ...obj }
}

function contentTypeOf(captured: Captured): unknown {
  return Object.keys(captured.wire).find((k) => k.toLowerCase() === 'content-type')
    ? captured.wire[
        Object.keys(captured.wire).find((k) => k.toLowerCase() === 'content-type') as string
      ]
    : undefined
}

let last: Captured | null = null
const originalAdapter = service.defaults.adapter

beforeAll(() => {
  service.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    last = { config, wire: wireHeaders(config.headers) }
    return Promise.resolve({
      data: { code: 200, msg: 'ok', data: { url: '/uploads/0/x.txt' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      // 响应拦截器会读 res.request.responseType（blob 分支判定），桩需给出 XHR 形状
      request: {}
    })
  }
})

afterAll(() => {
  service.defaults.adapter = originalAdapter
})

/** 用例结束后清掉"重复提交"会话缓存，避免同 URL+同载荷被拦截器提前 reject */
function clearRepeatSubmit(): void {
  sessionStorage.removeItem('sessionObj')
}

describe('上传载荷的 Content-Type 契约', () => {
  it('FormData 上传：头不上线，且 data 仍是 FormData（不被序列化成 JSON）', async () => {
    clearRepeatSubmit()
    const form = new FormData()
    form.append('file', new Blob(['hello b71\n'], { type: 'text/plain' }), 'probe.txt')
    await service.post('/system/file/upload', form)

    expect(last).not.toBeNull()
    // 决定性断言：文件字段仍在 FormData 里（回归时此处会变成 JSON 字符串，文件丢失）
    expect(last!.config.data).toBe(form)
    expect(contentTypeOf(last!)).toBeUndefined()
    expect(JSON.stringify(last!.config.data)).not.toContain('"uid"')
  })

  it('Blob/File 载荷同样不写 Content-Type（头像/裁剪图等直接投 Blob 的链路）', async () => {
    clearRepeatSubmit()
    const blob = new Blob(['raw image bytes'], { type: 'image/png' })
    await service.post('/system/user/profile/avatar', blob)
    expect(last!.config.data).toBe(blob)
    expect(contentTypeOf(last!)).toBeUndefined()
  })

  it('普通 JSON 载荷仍保留实例默认头（修复不得把 L4 默认值一起删掉）', async () => {
    clearRepeatSubmit()
    await service.post('/system/file/delete', { fileName: 'a.txt' })
    expect(typeof last!.config.data).toBe('string')
    expect(contentTypeOf(last!)).toBe('application/json;charset=utf-8')
  })
})

describe('全仓上传头写法守卫（同族散点收干净）', () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        walk(p, out)
      } else if (/\.(ts|vue)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        out.push(p)
      }
    }
    return out
  }

  it('源码中不存在手写 Content-Type: multipart/form-data 的请求头（必丢 boundary）', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const text = fs.readFileSync(file, 'utf8')
      if (/Content-Type['"]?\s*[:=]\s*['"]multipart\/form-data/.test(text)) {
        offenders.push(path.relative(SRC, file))
      }
    }
    expect(offenders).toEqual([])
  })
})
