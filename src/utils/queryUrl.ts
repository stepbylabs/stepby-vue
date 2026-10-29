/**
 * 「查询条件 → URL query」的唯一实现（b131）。
 *
 * 此前两条写路径各写一份：`useCrudTable.syncUrlQuery` 已过滤非原始值，而
 * `views/system/user/index.vue` 手写的那份**没有**——于是 `addDateRange()` 注入的
 * `params: { beginTime, endTime }` 被 `String(v)` 序列化成 `params=[object+Object]`
 * 写进地址栏（真机 URL 实证：`/system/user?pageNum=1&pageSize=10&userName=…&params=[object+Object]`）。
 * 同一句纪律写两遍就有两个严格度（AGENTS ㉘），所以抽到这里，两边共用。
 *
 * 语义（与既有行为一致，只把"非原始值"的过滤从一处推广到两处）：
 * 1. `existing` 里不属于查询条件的键（页签、模式等页面状态）原样保留 —— 深链回跳不丢状态；
 * 2. `src` 只同步 string / number / boolean：对象容器（RuoYi 惯例的 `params`）序列化成
 *    `[object Object]` 是垃圾参数，既污染分享链接，又会被下次 restore 原样注回查询对象；
 * 3. 空值（undefined / null / ''）不写进 URL。
 */
export function buildUrlQuery(
  src: Record<string, unknown>,
  existing: Record<string, unknown> = {}
): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(existing)) {
    if (!(k in src) && v !== undefined && v !== null && v !== '') query[k] = String(v)
  }
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue
    query[k] = String(v)
  }
  return query
}
