import { describe, expect, it, vi } from 'vitest'
import { useRemoteOptions } from './useRemoteOptions'
import { SERVER_MAX_PAGE_SIZE } from '@/utils/paging'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useRemoteOptions：远程候选源的四条义务（b134）', () => {
  it('成功 ⇒ 候选落地、关键字透传、未截断', async () => {
    const fetchPage = vi.fn(async () => ({ rows: ['a', 'b'], total: 2 }))
    const src = useRemoteOptions<string>(fetchPage)
    await src.search('  生产  ')
    expect(fetchPage).toHaveBeenCalledWith('生产', 1, SERVER_MAX_PAGE_SIZE)
    expect(src.options.value).toEqual(['a', 'b'])
    expect(src.truncated.value).toBe(false)
    expect(src.loadError.value).toBe(false)
    expect(src.loading.value).toBe(false)
  })

  it('total 大于已取行数 ⇒ truncated（不按请求值判）', async () => {
    const fetchPage = vi.fn(async () => ({ rows: Array.from({ length: 100 }, (_, i) => i), total: 120 }))
    const src = useRemoteOptions<number>(fetchPage)
    await src.search()
    expect(src.truncated.value).toBe(true)
  })

  it('total 恰等于行数（100/100）⇒ 未截断（按请求值判会误报）', async () => {
    // 这一条是上面那条的鉴别对：两种判据在"total 大于行数"上都得 true，
    // 只有"取满一整页且总数正好等于它"能把 `rows.length >= pageSize` 的误报区分出来。
    const fetchPage = vi.fn(async () => ({ rows: Array.from({ length: 100 }, (_, i) => i), total: 100 }))
    const src = useRemoteOptions<number>(fetchPage)
    await src.search()
    expect(src.truncated.value).toBe(false)
  })

  it('失败 ⇒ 候选清空 + loadError 置真 + loading 复位', async () => {
    const fetchPage = vi.fn(async () => {
      throw new Error('boom')
    })
    const src = useRemoteOptions<string>(fetchPage)
    await src.search('x')
    expect(src.options.value).toEqual([])
    expect(src.loadError.value).toBe(true)
    expect(src.loading.value).toBe(false)
  })

  it('retry 复用最后关键字，成功后恢复', async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ rows: ['ok'], total: 1 })
    const src = useRemoteOptions<string>(fetchPage)
    await src.search('abc')
    expect(src.loadError.value).toBe(true)
    await src.retry()
    expect(fetchPage).toHaveBeenLastCalledWith('abc', 1, SERVER_MAX_PAGE_SIZE)
    expect(src.options.value).toEqual(['ok'])
    expect(src.loadError.value).toBe(false)
  })

  it('后发先回 ⇒ 旧关键字的结果不得覆盖新关键字', async () => {
    const first = deferred<{ rows: string[]; total: number }>()
    const second = deferred<{ rows: string[]; total: number }>()
    const fetchPage = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const src = useRemoteOptions<string>(fetchPage)
    const p1 = src.search('old')
    const p2 = src.search('new')
    second.resolve({ rows: ['new-row'], total: 1 })
    await p2
    first.resolve({ rows: ['old-row'], total: 1 })
    await p1
    expect(src.options.value).toEqual(['new-row'])
    expect(src.keyword.value).toBe('new')
  })

  it('reset ⇒ 清空并让在飞响应失去写权', async () => {
    const pending = deferred<{ rows: string[]; total: number }>()
    const src = useRemoteOptions<string>(vi.fn().mockReturnValueOnce(pending.promise))
    const p = src.search('x')
    src.reset()
    pending.resolve({ rows: ['late'], total: 1 })
    await p
    expect(src.options.value).toEqual([])
    expect(src.loading.value).toBe(false)
  })
})
