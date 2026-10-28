/**
 * 「只让最后一次请求的结局生效」的单一实现（b119）。
 *
 * ## 立的案
 *
 * 同一份逻辑在本仓有 **13 个文件 / 14 个手写计数器 / 15 个发起点**（HEAD 实测：
 * `++xSeq` / `++xId` / 裸 `++seq` 三类形态；`notificationId` 与 `tool/build` 的
 * `formId` 生成器不计），写法互不相同——模块级与实例级混用、单键与按 tab 分键的映射、
 * 有的两个发起点共用一个计数器。它们各自能工作，但每新增一页就多一份抄写，而
 * **11/13 个手写列表页一份都没有**（详见 `latestRequest.guard.test.ts` 的立案）：
 * 用户连按两次回车/翻页，先发的响应后到，表格显示 A 条件的行而搜索框写着 B，
 * 失败标记与 loading 也会被旧请求改写。
 * 本原语的目的不是"再写第 16 份"，而是让下一份无处可写（形状锁）。
 *
 * 竞态不会报错、不会留日志，只会在慢网/后端抖动时"表格内容与筛选条件对不上"，
 * 所以它必须由**单一原语**承载，而不是靠每个页面记得写对三段判断。
 *
 * ## 三条义务（缺一条就不是本原语）
 *
 * 1. **请求发起处**调 `begin()` 拿票据（同步，必须在第一个 `await` 之前）；
 * 2. 每个**落地处**（写数据、写错误态、关 loading）都用 `isCurrent(ticket)` 判一次
 *    —— 尤其 `finally`：旧请求把新请求的 `loading` 关掉是同一族的另一半；
 * 3. **查询身份变了**（换看板 / 换数据集 / 换统计窗口 = 换了问题）先 `invalidate()`，
 *    让在飞的旧请求作废，否则"下一次取数之前"旧响应仍会把旧结论写回来。
 *
 * `invalidate()` 与 `begin()` 分开是因为语义不同：换身份时屏上已经清空了旧快照，
 * 那一刻没有任何新请求可发（例如新看板没有卡片），但旧响应必须立刻失去写权。
 */
export interface LatestGuard {
  /** 开始一次新请求：此前所有在飞请求作废，返回本次票据 */
  begin(): number
  /** 本次票据是否仍是最新（true ⇒ 允许落地） */
  isCurrent(ticket: number): boolean
  /** 让所有在飞请求作废（换查询身份时用），不开始新请求 */
  invalidate(): void
}

export function createLatestGuard(): LatestGuard {
  let latest = 0
  return {
    begin: () => ++latest,
    isCurrent: (ticket: number) => ticket === latest,
    invalidate: () => {
      latest += 1
    }
  }
}
