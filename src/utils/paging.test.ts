import { describe, expect, it, vi } from 'vitest'
import { FETCH_ALL_MAX_ROWS, SERVER_MAX_PAGE_SIZE, fetchAllPages } from './paging'

function page<T>(rows: T[], total: number) {
  return { rows, total }
}

describe('fetchAllPages：按 total 拉全量并如实标注截断（b134）', () => {
  it('单页即可收齐 ⇒ 只请求一次', async () => {
    const fetchPage = vi.fn(async () => page(['a', 'b'], 2))
    const res = await fetchAllPages(fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(1, SERVER_MAX_PAGE_SIZE)
    expect(res).toEqual({ rows: ['a', 'b'], total: 2, truncated: false })
  })

  it('total=250 ⇒ 按 100/100/50 取满三页，页码递进且不丢行', async () => {
    const pages = [
      page(
        Array.from({ length: 100 }, (_, i) => i),
        250
      ),
      page(
        Array.from({ length: 100 }, (_, i) => 100 + i),
        250
      ),
      page(
        Array.from({ length: 50 }, (_, i) => 200 + i),
        250
      )
    ]
    const fetchPage = vi.fn(async (pageNum: number) => pages[pageNum - 1])
    const res = await fetchAllPages(fetchPage)
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
    expect(res.rows).toHaveLength(250)
    expect(res.rows[0]).toBe(0)
    expect(res.rows[249]).toBe(249)
    expect(res.truncated).toBe(false)
  })

  it('total 远超 maxRows ⇒ 只取到上限并标 truncated（不静默丢数据）', async () => {
    const fetchPage = vi.fn(async (pageNum: number) =>
      page(
        Array.from({ length: 100 }, (_, i) => pageNum * 100 + i),
        5000
      )
    )
    const res = await fetchAllPages(fetchPage, { maxRows: 250 })
    expect(res.rows).toHaveLength(250)
    expect(res.total).toBe(5000)
    expect(res.truncated).toBe(true)
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('中途出现空页 ⇒ 立即止损（total 与服务端不一致时不死循环）', async () => {
    const fetchPage = vi.fn(async (pageNum: number) => (pageNum === 1 ? page(['a'], 250) : page([], 250)))
    const res = await fetchAllPages(fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(res.rows).toEqual(['a'])
    expect(res.truncated).toBe(true)
  })

  it('响应不带 total ⇒ 按"单页即全量"处理，不无限翻页', async () => {
    const fetchPage = vi.fn(async () => ({ rows: ['x'] }))
    const res = await fetchAllPages(fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ rows: ['x'], total: 1, truncated: false })
  })

  it('请求值超过服务端上限 ⇒ 实际按 100 请求（超过会被后端静默钳制）', async () => {
    const fetchPage = vi.fn(async () => page(['a'], 1))
    await fetchAllPages(fetchPage, { pageSize: 500 })
    expect(fetchPage).toHaveBeenCalledWith(1, SERVER_MAX_PAGE_SIZE)
    expect(SERVER_MAX_PAGE_SIZE).toBe(100)
    expect(FETCH_ALL_MAX_ROWS).toBe(1000)
  })

  it('第二页失败 ⇒ 整体 reject，不拿半份数据冒充全量统计', async () => {
    const fetchPage = vi.fn(async (pageNum: number) => {
      if (pageNum === 1)
        return page(
          Array.from({ length: 100 }, (_, i) => i),
          250
        )
      throw new Error('network down')
    })
    await expect(fetchAllPages(fetchPage)).rejects.toThrow('network down')
  })
})
