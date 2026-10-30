/**
 * 全量轮数据集的**窗口自证**闸（批七十九轮 2 抽成共享模块）。
 *
 * 为什么单独一个文件而不是从 `endpoint-coverage.mjs` import：那两个判据脚本都是
 * "import 即执行"（模块底部直接跑 `main()` / 按 argv 自检），复用它的导出会让被依赖方
 * 把 argv 当成自己的命令行——实测 `request-storm --selftest` 一 import 就打出了
 * endpoint-coverage 的自检结果并 `process.exit(0)`，自己的判据一条没跑却"绿"了。
 * 这与台账里"collect-warnings import 期要凭据，故不入 run-gates 清单"是同一类约束：
 * **判据脚本之间共享的只能是"import 时无副作用"的模块**，不能是入口脚本。
 * 读数据集文件（`readFullRunWindow`）这类 IO 也在允许范围内——约束是**不在 import 时
 * 执行**，不是禁 IO；它只被调用方在自己的判定路径上调用。
 */
import fs from 'node:fs'
import path from 'node:path'

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
 * 数据集必须是**跑完的全量轮**产物。以下判据缺一不可：
 * ① `full === true`——分段轮（`--range=` / `--feature=`）的键集合是子集，拿它判"没变化"
 *    等于把"没跑"读成"没变差"（RUN-RECIPE §3.63）；
 * ② **计划数 = 入场数**——b82 实测：全量轮跑到 M38 浏览器崩溃，runner 里的 `break` 一旦生效，
 *    后面的模块连 `moduleStats` 都不会有；只判 ③ 会漏掉这一支，所以两个计数必须相等。
 * ③ **每个入场模块都产出了判定行**——同一轮里"进了模块但一条判定都没有"= 空跑。
 *    `full` 证明的是"不是分段轮"，不证明"跑完了"；后两者必须由执行计数自证。
 * ④ **本轮没有环境性网络中断**（b89 项 15）。
 * 旧格式（没有这些字段）一律拒绝：宁要一声"重跑"，不要一个静默偏低的面。
 *
 * b95：判据**收集全部缺口**而不是抛第一条（两个消费方——`assertFullRun` 与
 * `console-allowlist-audit` / `click-failure-audit` 的输入闸——共用这一份实现）。
 * 原先 console/click 两个脚本各自只判 `modulesPlanned === modulesAttempted`，
 * 把"0 判定空跑"与"整轮环境性断网"两条通道漏在门外：它们与"没跑"在数据集里同形。
 *
 * @returns {string[]} 缺口列表；空数组 = 通过
 */
export function executionCompletenessGaps(dataset, fileLabel = '(内存对象)') {
  const gaps = []
  if (dataset.full !== true) {
    gaps.push(
      `数据集未标记 full（实际 ${JSON.stringify(dataset.full)}，${fileLabel}）——分段跑的键集合是子集，` +
        `用它判覆盖/风暴会把"没跑"读成"没变差"（RUN-RECIPE §3.63）`
    )
  }
  const planned = dataset.modulesPlanned
  const attempted = dataset.modulesAttempted
  const empty = dataset.modulesWithZeroVerdicts
  if (!Number.isInteger(planned) || planned <= 0 || !Number.isInteger(attempted) || !Array.isArray(empty)) {
    gaps.push(
      `数据集没有执行完整性字段（modulesPlanned / modulesAttempted / modulesWithZeroVerdicts，${fileLabel}）——` +
        `旧格式无法证明"每个模块都真的跑了"，拒绝作为数据源。请用当前 runner 重跑一轮全量。`
    )
  } else {
    if (attempted !== planned) {
      gaps.push(
        `本轮提前终止：计划 ${planned} 个模块、实际入场 ${attempted} 个（${fileLabel}）——` +
          `剩下的模块从未执行，据此判覆盖等于把"没跑"读成"没变差"。请先修执行环境（内存/并行编译/浏览器失联）再重跑全量。`
      )
    }
    if (empty.length > 0) {
      gaps.push(
        `本轮有 ${empty.length}/${planned} 个模块产出 0 条判定（模块号：${empty.slice(0, 12).join(',')}${empty.length > 12 ? ' …' : ''}，${fileLabel}）` +
          `——这是**崩溃/浏览器失联**的全量轮，覆盖面只是前若干个模块；` +
          `不得据此判覆盖或重生成基线，请先修执行环境再重跑全量。`
      )
    }
  }
  if (Array.isArray(dataset.rows) && dataset.totalVerdictRows === 0) {
    gaps.push(`本轮判定行总数为 0（${fileLabel}）——采集器或执行环境已坏，结论不作数`)
  }
  /**
   * ④ **本轮没有环境性网络中断**（b89 项 15）。实测断面：b89 全量轮跑到 M85 时 Windows 挂起网卡 I/O，
   * 一条判据收 15720 条 `net::ERR_NETWORK_IO_SUSPENDED`，而 M85 隔离复跑 13✅/❌0 —— 那一轮的
   * 覆盖面、请求密度、触达集合全部**被断网期间的失败污染**（"请求没打到"与"端点没被覆盖"在数据里同形）。
   * 取不到该字段同样拒绝（与上面 `modulesPlanned` 那条同一口径：旧格式无法证明的事，不作数）。
   */
  const envAbort = dataset.envNetworkAbort
  if (!Number.isInteger(envAbort) || envAbort < 0) {
    gaps.push(
      `数据集没有环境性网络中断计数字段（envNetworkAbort，${fileLabel}）——` +
        `无法证明本轮没被"网卡挂起 ⇒ 全量请求失败"污染，拒绝作为数据源。请用当前 runner 重跑一轮全量。`
    )
  } else if (envAbort > 0) {
    gaps.push(
      `本轮有 ${envAbort} 条环境性网络中断（${fileLabel}）——断网期间的请求失败会把"没打到"读成"未覆盖"，` +
        `覆盖面与密度都不可用。这是复跑一轮的活，不是改产品或放松阈值的活（runner 侧同一轮会打 🛑 并 EXIT=2）。`
    )
  }
  return gaps
}

/** 抛出版（保持既有调用方签名不变）。 */
export function assertFullRun(dataset, fileLabel) {
  const gaps = executionCompletenessGaps(dataset, fileLabel)
  if (gaps.length > 0) throw new Error(gaps.join('\n'))
}

// ---------------------------------------------------------------- 窗口相交闸（b103 抽成共享）
//
// 下面四个函数原先只有 `backend-log-audit.mjs` 有；b103 实测 `oper-log-audit` 缺同一道闸，
// 而它**后果更重**：部分轮次（只跑了几个 feature/module）里 82 条负路径登记全被报成
// "未命中 ⇒ 须撤销"，而 `--retire-stale` 在 code=1 时**会照常写文件**——照提示做就是
// 把 82 条真在用的登记一次删光（不可逆）。共用一份实现，禁止两份必漂。

/**
 * 解析时间串为 epoch 毫秒（UTC）。
 *
 * 三种形态：带时区后缀的 ISO（`Z` / `+08:00`）、裸 SQL 串（`YYYY-MM-DD HH:MM:SS[.fff]`，按 UTC）、
 * 其余一律 `NaN` —— 调用方必须**拒绝**而不是当"无窗口"（`NaN > 容差` 恒 false 一族）。
 */
export function windowToEpoch(value) {
  const s = String(value ?? '').trim()
  if (!s) return NaN
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return Date.parse(s)
  const iso = s.replace(' ', 'T')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return NaN
  return Date.parse(`${iso}Z`)
}

/**
 * 判定窗口与"最近一次 deep-e2e 全量轮的自证窗口"是否**有交集**（b88 收口立的口径闸）。
 *
 * 立案事实（b88 收口实测）：重启 :8080 之后跑非浏览器门禁，窗口里只有 96 条启动流量，
 * 判据照打"允许表未命中 15 条 ⇒ 必须撤销"——那 15 条 witness 全是 deep/main 的负路径，
 * 这一把里根本没有浏览器轮次。照着提示做就是把真在用的登记撤销（不可逆）。
 * 取向是**加闸而不是放宽**：不相交 ⇒ UNRUN（EXIT=2），并写明需要的动作。
 * 数据集取不到（`dsWin` 为 null）**不得**触发这一支：否则"缺数据集"被报成"窗口不对"。
 */
export function windowsOverlap(win, dsWin) {
  if (!dsWin) return true
  const a1 = Number.isFinite(win?.untilMs) ? win.untilMs : Infinity
  const b1 = Number.isFinite(dsWin?.untilMs) ? dsWin.untilMs : Infinity
  if (!Number.isFinite(win?.sinceMs) || !Number.isFinite(dsWin?.sinceMs)) return true
  return win.sinceMs <= b1 && a1 >= dsWin.sinceMs
}

/** 窗口的展示形（凭证行与 FATAL 文案共用，两份必漂） */
export function fmtWindow(w) {
  const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19) + 'Z' : '（到末尾）')
  return `${iso(w.sinceMs)} → ${iso(w.untilMs)}`
}

/** 不相交时那条"本轮不作数"的话（gateState 与 main 共用一份） */
export function overlapGapDetail(win, dsWin) {
  return (
    `判定窗口 ${fmtWindow(win)} 与最近一次 deep-e2e 全量轮的自证窗口 ${fmtWindow(dsWin)} **不相交**` +
    ` ⇒ 这一把里没有浏览器轮次流量，允许表里 witness 那些负路径的条目结构上不可能出现` +
    `（"未命中 N 条"是**窗口选错**，不是豁免该撤销）⇒ 本轮不作数；` +
    `需要的动作：把 --since/--until 给成覆盖那轮的范围，或先跑一轮浏览器套件`
  )
}

/**
 * 不相交、但窗口里**确实跑过分段轮**时的那句话（b134）。
 *
 * 立案：增量轮跑了 main + deep 定点 + a11y（浏览器确实跑过），`overlapGapDetail` 却说
 * "这一把里没有浏览器轮次流量"并让人"先跑一轮浏览器套件"——照做就是重跑一遍刚跑过的套件，
 * 而真正缺的是**全量** deep 轮。结论（UNRUN）不变，指向的动作必须换。
 * 触发条件：与全量轮窗口不相交 **且** 与最近一次分段轮窗口相交。
 */
export function partialRunDetail(win, partial) {
  return (
    `判定窗口 ${fmtWindow(win)} 与最近一次 deep-e2e 全量轮的自证窗口 **不相交**，` +
    `窗口内只有**分段轮**流量（${partial.source}：${partial.modules} 个模块 / ${fmtWindow(partial)}）` +
    ` ⇒ 全量轮才产生的 witness 负路径结构上不会出现（"未命中 N 条"是**窗口选错**，不是豁免该撤销）⇒ 本轮不作数；` +
    `需要的动作：跑一轮**全量** deep-e2e（分段轮不算），或把窗口给成覆盖最近一次全量轮的范围`
  )
}

/** 两条不相交文案的单一入口（两个判据脚本与各自 main 都走这里，两份实现必漂） */
export function windowGapDetail(win, dsWin, partialWin = null) {
  if (partialWin && windowsOverlap(win, partialWin)) return partialRunDetail(win, partialWin)
  return overlapGapDetail(win, dsWin)
}

/**
 * 读"最近一次 deep-e2e **全量**轮"的自证窗口（`screenshots/deep-e2e-reqstats.json`）。
 * 非全量轮（`full !== true`）或缺字段一律返回 `null` —— 部分轮次的窗口**不能**拿来当
 * "这轮应该出现哪些负路径"的证据（那一轮本来就没跑那些模块）。
 */
export function readFullRunWindow(dir) {
  let data = null
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, 'screenshots', 'deep-e2e-reqstats.json'), 'utf8'))
  } catch {
    return null
  }
  if (!data || data.full !== true || !data.windowStart || !data.windowEnd) return null
  return {
    since: data.windowStart,
    until: data.windowEnd,
    source: `${path.basename(path.join(dir, 'screenshots', 'deep-e2e-reqstats.json'))} 自证字段`
  }
}

/**
 * 读"最近一次 deep-e2e **分段**轮"的自证窗口（`…reqstats.incremental.json`）。
 * 只用于区分"窗口里根本没有浏览器流量"与"跑过浏览器、只是分段轮"；**不得**拿它当
 * "witness 应该出现"的证据（那一轮本来就没跑那些模块）。取不到 ⇒ null（不触发那一条）。
 */
export function readPartialRunWindow(dir) {
  const file = path.join(dir, 'screenshots', 'deep-e2e-reqstats.incremental.json')
  let data = null
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!data || data.full === true || !data.windowStart || !data.windowEnd) return null
  const sinceMs = windowToEpoch(data.windowStart)
  const untilMs = windowToEpoch(data.windowEnd)
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs)) return null
  return {
    sinceMs,
    untilMs,
    modules: Number(data.modulesPlanned) || 0,
    source: `${path.basename(file)} 自证字段`
  }
}
