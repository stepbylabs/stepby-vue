/**
 * 分页口径的单一事实源（b134）。
 *
 * 后端把任何列表请求的 `pageSize` 钳到 `stepby-axum/src/common/page.rs::MAX_PAGE_SIZE = 100`
 * （真机取证：请求 500 返回 100 行 / `total=17235`）。因此：
 * ① 前端请求超过该上限的值毫无意义，且会让"下拉已拉全"这个假设静默不成立；
 * ② 截断判据只能比 `rows.length < total`，写成 `rows.length >= 请求的 pageSize`
 *    在请求值大于服务端上限时**结构性永不成立**（三处真实站点曾如此）。
 */
export const SERVER_MAX_PAGE_SIZE = 100

/** 一次性拉全量的硬上限：超过即如实标记 `truncated`，不静默丢数据 */
export const FETCH_ALL_MAX_ROWS = 1000

export interface PageRows<T> {
  rows?: T[] | null
  total?: number
}

export interface AllRowsResult<T> {
  rows: T[]
  /** 服务端声明的总数（取不到时回退为已取行数） */
  total: number
  /** 总数大于已取行数：调用方必须把"只统计/只展示了前 N 条"显示给用户 */
  truncated: boolean
}

/**
 * 按 `total` 逐页拉全量（用于统计与本地筛选的下拉）。
 *
 * 中途任何一页失败都会 reject：全量统计/全量候选不允许拿半份数据冒充全量——
 * 部分结果比没有结果更危险（统计数字会看起来完全正常）。
 */
export async function fetchAllPages<T>(
  fetchPage: (pageNum: number, pageSize: number) => Promise<PageRows<T>>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<AllRowsResult<T>> {
  const pageSize = Math.min(Math.max(1, options.pageSize ?? SERVER_MAX_PAGE_SIZE), SERVER_MAX_PAGE_SIZE)
  const maxRows = Math.max(pageSize, options.maxRows ?? FETCH_ALL_MAX_ROWS)

  const first = await fetchPage(1, pageSize)
  const rows: T[] = [...(first.rows ?? [])]
  const declared = first.total
  const total = typeof declared === 'number' && Number.isFinite(declared) && declared >= 0 ? declared : rows.length

  let pageNum = 1
  while (rows.length < total && rows.length < maxRows) {
    pageNum += 1
    const page = await fetchPage(pageNum, pageSize)
    const next = page.rows ?? []
    // 空页止损：total 与服务端实际不一致时不得死循环
    if (next.length === 0) break
    rows.push(...next)
  }

  const capped = rows.length > maxRows ? rows.slice(0, maxRows) : rows
  return {
    rows: capped,
    total: Math.max(total, capped.length),
    truncated: total > capped.length
  }
}
