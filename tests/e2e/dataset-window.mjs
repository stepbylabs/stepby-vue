/**
 * 全量轮数据集的**窗口自证**闸（批七十九轮 2 抽成共享模块）。
 *
 * 为什么单独一个文件而不是从 `endpoint-coverage.mjs` import：那两个判据脚本都是
 * "import 即执行"（模块底部直接跑 `main()` / 按 argv 自检），复用它的导出会让被依赖方
 * 把 argv 当成自己的命令行——实测 `request-storm --selftest` 一 import 就打出了
 * endpoint-coverage 的自检结果并 `process.exit(0)`，自己的判据一条没跑却"绿"了。
 * 这与台账里"collect-warnings import 期要凭据，故不入 run-gates 清单"是同一类约束：
 * **判据脚本之间共享的只能是纯函数模块**，不能是入口脚本。
 */

/**
 * 从数据集对象里取本轮请求窗口（UTC 裸文本，与 `sys_oper_log.oper_time` 同口径）。
 *
 * 人抄窗口踩过一次：本地 UTC+8 上把本地时间当 UTC 传，窗口内一行都没有也照样报
 * "覆盖 0 条"，看起来像覆盖退化，实际是输入被挪出了区间。缺字段一律硬失败，
 * 不得回落到"不设窗口"（那等于"谁打过都算覆盖"）。
 */
export function readWindow(dataset, fileLabel = '(内存对象)') {
  if (
    typeof dataset.windowStart !== 'string' ||
    typeof dataset.windowEnd !== 'string' ||
    !dataset.windowStart ||
    !dataset.windowEnd
  ) {
    throw new Error(
      `数据集没有 windowStart/windowEnd（旧格式，${fileLabel}）——重跑一轮 deep-e2e 全量，` +
        `让 runner 把本轮起止写进数据集（endpoint-coverage 做历史对账时另可显式给 --since=/--until=；` +
        `request-storm 判的是**本轮自己**的出网次数，没有"任意窗口"这回事）。` +
        `不得把窗口退化成"不设限"`
    )
  }
  if (dataset.windowStart >= dataset.windowEnd) {
    throw new Error(`窗口方向可疑：windowStart=${dataset.windowStart} 不早于 windowEnd=${dataset.windowEnd}`)
  }
  return { since: dataset.windowStart, until: dataset.windowEnd }
}

/** 数据集必须是**全量轮**产物：分段轮是子集，拿它判"没变化"等于把"没跑"读成"没问题"。 */
export function assertFullRun(dataset, fileLabel) {
  if (dataset.full !== true) {
    throw new Error(
      `数据集未标记 full（实际 ${JSON.stringify(dataset.full)}，${fileLabel}）——分段跑的键集合是子集，` +
        `用它判覆盖/风暴会把"没跑"读成"没变差"（RUN-RECIPE §3.63）`
    )
  }
}
