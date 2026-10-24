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

/**
 * 窗口末端必须带**不小于库的精度**（b82 实测的判据自伤）。
 *
 * `sys_oper_log.oper_time` 落库带小数秒（实测 `2026-10-21 05:12:01.454591800`），
 * 而 SQL 里 `oper_time <= ?` 是**字符串比较**：窗口末端若被截到整秒，
 * `'...05:12:01.4545' <= '...05:12:01'` 恒假 ⇒ 落在最后一秒内的行全被排除。
 * 结局不是报错而是**静默少判**：本轮最后一个模块（M90）的写入正好落在那一秒，
 * 同一轮里它 29✅，`endpoint-coverage` 却把它打的 5 个端点判成"未触达"。
 * 所以凡是"用数据集窗口去查带小数秒的列"的消费方，都必须先证精度够——
 * 不够就响亮拒绝，而不是替它把窗口放宽 1 秒（放宽会把别的东西一起放进来）。
 */
export function assertWindowPrecision(dataset, fileLabel = '(内存对象)') {
  for (const key of ['windowStart', 'windowEnd']) {
    const v = dataset[key]
    if (typeof v !== 'string' || !v) continue // 缺字段由 readWindow 负责，那里已响亮失败
    if (!/\.\d+/.test(v)) {
      throw new Error(
        `数据集的 ${key}=${JSON.stringify(v)} 只到整秒，而被查列（如 sys_oper_log.oper_time）带小数秒——` +
          `字符串比较会把落在最后一秒内的行全部排除，覆盖面会被静默少判（b82 实测：M90 的写入正好在 ` +
          `${fileLabel} 那一秒）。请用带毫秒的 runner 重跑一轮全量；` +
          `不得靠"把窗口放宽一秒"消化，那会把不属于本轮的行一起放进来。`
      )
    }
  }
}
/**
 * 数据集必须是**跑完的全量轮**产物。三道判据，缺一不可：
 * ① `full === true`——分段轮（`--range=` / `--feature=`）的键集合是子集，拿它判"没变化"
 *    等于把"没跑"读成"没变差"（RUN-RECIPE §3.63）；
 * ② **计划数 = 入场数**——b82 实测：全量轮跑到 M38 浏览器崩溃，runner 里的 `break` 一旦生效，
 *    后面的模块连 `moduleStats` 都不会有；只判 ③ 会漏掉这一支，所以两个计数必须相等。
 * ③ **每个入场模块都产出了判定行**——同一轮里"进了模块但一条判定都没有"= 空跑。
 *    `full` 证明的是"不是分段轮"，不证明"跑完了"；后两者必须由执行计数自证。
 * 旧格式（没有这些字段）一律拒绝：宁要一声"重跑"，不要一个静默偏低的面。
 */
export function assertFullRun(dataset, fileLabel) {
  if (dataset.full !== true) {
    throw new Error(
      `数据集未标记 full（实际 ${JSON.stringify(dataset.full)}，${fileLabel}）——分段跑的键集合是子集，` +
        `用它判覆盖/风暴会把"没跑"读成"没变差"（RUN-RECIPE §3.63）`
    )
  }
  const planned = dataset.modulesPlanned
  const attempted = dataset.modulesAttempted
  const empty = dataset.modulesWithZeroVerdicts
  if (!Number.isInteger(planned) || planned <= 0 || !Number.isInteger(attempted) || !Array.isArray(empty)) {
    throw new Error(
      `数据集没有执行完整性字段（modulesPlanned / modulesAttempted / modulesWithZeroVerdicts，${fileLabel}）——` +
        `旧格式无法证明"每个模块都真的跑了"，拒绝作为数据源。请用当前 runner 重跑一轮全量。`
    )
  }
  if (attempted !== planned) {
    throw new Error(
      `本轮提前终止：计划 ${planned} 个模块、实际入场 ${attempted} 个（${fileLabel}）——` +
        `剩下的模块从未执行，据此判覆盖等于把"没跑"读成"没变差"。请先修执行环境（内存/并行编译/浏览器失联）再重跑全量。`
    )
  }
  if (empty.length > 0) {
    throw new Error(
      `本轮有 ${empty.length}/${planned} 个模块产出 0 条判定（模块号：${empty.slice(0, 12).join(',')}${empty.length > 12 ? ' …' : ''}，${fileLabel}）` +
        `——这是**崩溃/浏览器失联**的全量轮，覆盖面只是前若干个模块；` +
        `不得据此判覆盖或重生成基线，请先修执行环境再重跑全量。`
    )
  }
  if (Array.isArray(dataset.rows) && dataset.totalVerdictRows === 0) {
    throw new Error(`本轮判定行总数为 0（${fileLabel}）——采集器或执行环境已坏，结论不作数`)
  }
  /**
   * ④ **本轮没有环境性网络中断**（b89 项 15）。实测断面：b89 全量轮跑到 M85 时 Windows 挂起网卡 I/O，
   * 一条判据收 15720 条 `net::ERR_NETWORK_IO_SUSPENDED`，而 M85 隔离复跑 13✅/❌0 —— 那一轮的
   * 覆盖面、请求密度、触达集合全部**被断网期间的失败污染**（"请求没打到"与"端点没被覆盖"在数据里同形）。
   * 取不到该字段同样拒绝（与上面 `modulesPlanned` 那条同一口径：旧格式无法证明的事，不作数）。
   */
  const envAbort = dataset.envNetworkAbort
  if (!Number.isInteger(envAbort) || envAbort < 0) {
    throw new Error(
      `数据集没有环境性网络中断计数字段（envNetworkAbort，${fileLabel}）——` +
        `无法证明本轮没被"网卡挂起 ⇒ 全量请求失败"污染，拒绝作为数据源。请用当前 runner 重跑一轮全量。`
    )
  }
  if (envAbort > 0) {
    throw new Error(
      `本轮有 ${envAbort} 条环境性网络中断（${fileLabel}）——断网期间的请求失败会把"没打到"读成"未覆盖"，` +
        `覆盖面与密度都不可用。这是复跑一轮的活，不是改产品或放松阈值的活（runner 侧同一轮会打 🛑 并 EXIT=2）。`
    )
  }
}
