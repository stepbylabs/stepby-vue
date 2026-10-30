/**
 * 后端日志判据（b81 新增）。
 *
 * 为什么需要它：后端有按日轮转日志，但此前没有任何判据消费 WARN/ERROR——
 * 全量跑完后只能人工 grep，"看一眼觉得正常"就过去了。这与 request-storm 的
 * "采了不判=没采"同形：日志写了不等于有人看；而 WARN 里既有设计内负路径
 * （权限拒绝、能力位关闭），也可能藏着真实缺陷（连接失败、后台任务异常）。
 *
 * 判据形状：
 *   · ERROR：默认**零容忍**；确属设计内的错误必须逐条进 `backend-log-allowlist.json`
 *     并写清 why（与 endpoint-coverage-reasons 同一条纪律：理由必须是可核对的条目）。
 *   · WARN：同样逐条登记；未登记的 WARN ⇒ `--gate` 红。
 *   · 非 tracing 行（panic / stderr 裸输出）：一律视为异常输入，`--gate` 红——
 *     这些行在旧流程里最容易从 grep 的 `WARN|ERROR` 缝隙漏掉。
 *   · 空日志/文件不存在 ⇒ EXIT=2（"没跑"与"跑了且干净"必须可区分）。
 *   · 允许表**未命中**条目（b85 项 F）：本轮没再出现的登记 ⇒ 同样判红并必须撤销；
 *     `--retire-stale` 提供动作通道（真删文件并留痕，未命中为空时不碰文件）。
 *     只判"未登记的必须红"而不判"登记了却没再出现的必须撤销"，允许表就会随修复越积越多，
 *     最后没人敢删——endpoint-coverage / click-failure-audit / config-parity 都立过同一条。
 *   · **整机停顿**（b85 项 G）：窗口内出现 ≥20s 完全静默、且恢复瞬间 2s 内成簇（≥2 条）
 *     超时/fail-closed，或某条自带 `latency=` 横跨整段停顿 ⇒ `[FATAL] 本轮不作数` + **EXIT=2**，
 *     并**跳过**未登记/未命中两张清单（口径闸先于内容闸）。立案证据见 detectStalls 上方注释：
 *     那一轮 38 秒里连每 1.6s 一条、不碰数据库的 WebSocket 心跳都没写，闸门自己的 3s
 *     `tokio::time::timeout` 也没触发 ⇒ 定时器都不推进，是主机把进程冻住了。
 *     这一支为什么必须存在：把这种 503 登记进允许表=永久豁免"用户真实收到 503"；
 *     判成 EXIT=1 又会把人支使去"补登记"。唯一诚实的结论是"这一轮证明不了任何一侧"。
 *
 * 用法：
 *   node tests/e2e/backend-log-audit.mjs --selftest
 *   STEPBY_BACKEND_LOG=D:/.../logs/b81_r2.log node tests/e2e/backend-log-audit.mjs --gate
 *   node tests/e2e/backend-log-audit.mjs --log=... --since=2026-10-20T18:44:00Z --until=...
 *   node tests/e2e/backend-log-audit.mjs --log=... --gate --retire-stale
 *
 * 退出码：0 干净 / 1 有未登记信号、不可解析行或未命中登记 / 2 输入不可用**或本轮不作数**（停顿轮）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  duplicateWhyGroups,
  makeProducerLive,
  normalizeProducer,
  selfContainedWhyViolation,
  splitUnused
} from './producer-kit.mjs'
// 窗口解析与"与全量轮自证窗口相交"这两把闸与 oper-log-audit **共用一份实现**（b103）：
// oper 侧缺这道闸时，部分轮次里 82 条负路径登记会被报成"未命中 ⇒ 须撤销"，
// 而 `--retire-stale` 在 code=1 时会照常写文件 ⇒ 照提示做就是把真在用的登记一次删光。
import {
  readFullRunWindow,
  readPartialRunWindow,
  windowGapDetail,
  windowToEpoch,
  windowsOverlap
} from './dataset-window.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ALLOW = path.join(HERE, 'backend-log-allowlist.json')
// 判据的默认输入必须从脚本位置反推本仓根（AGENTS 前言②/⑯(b)）——producer 锚点指向的是
// **另一棵子仓**的源码，写死任何副本树都会让"生产者还在不在"这个问题得到错的答案。
const REPO_ROOT = path.resolve(HERE, '..', '..', '..')
// 条件型豁免的验证逻辑与 oper-log-audit **共用同一份**（producer-kit 是纯函数模块）
const PRODUCER_LIVE = makeProducerLive(REPO_ROOT)

const LINE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(.*)$/
// 日志里可能带 ANSI 颜色码；用 fromCharCode 构造 ESC，避免字面控制字符触发 eslint 的
// no-control-regex（字符本身是运行期数据，不是源码里的不可见字符）。
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/**
 * 解析 tracing 文本。续行（缩进/`at ...`）并入上一条；其余非 tracing 行进 unparsed。
 * 解析器是纯函数，供自检用合成文本驱动——判据自身的缺陷比缺检查更危险。
 *
 * `unparsed` 的条目带 `ts`：**它自己没有时间戳**（裸 panic/stderr 行正是靠这个特征抓出来的），
 * 所以时间取"它前面最近一条 tracing 记录"的时刻。日志是按时间顺序写的，这个近似足够把
 * 裸行归到正确的窗口里；文件最前面、任何记录之前的裸行 `ts=null`，按窗口内计（fail-closed：
 * 宁可多判一条红，也不能让一条真 panic 因为"定不了位"而被窗口筛掉）。
 */
export function parseLog(text) {
  const records = []
  const unparsed = []
  let cur = null
  let lastTs = null
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(ANSI_RE, '')
    if (!line.trim()) continue
    const m = LINE_RE.exec(line)
    if (m) {
      cur = { ts: m[1], level: m[2], msg: m[3], lines: 1 }
      records.push(cur)
      lastTs = m[1]
      continue
    }
    // 只认缩进/`at`/行号形态的续行。不能因为"上一条是 ERROR"就把任何裸行都吞进去——
    // panic / stderr 裸输出正是要从 tracing 缝隙里抓出来的东西，吞掉等于判据自盲。
    const continuation = /^\s+at\s|^\s+\d+:\s|^\s{2,}/.test(line)
    if (cur && continuation) {
      cur.msg += `\n${line}`
      cur.lines += 1
    } else {
      unparsed.push({ line, ts: lastTs })
    }
  }
  return { records, unparsed }
}

/**
 * 时间是否落在窗口内。`ts` 缺失或不可解析 ⇒ **算窗口内**（见 parseLog 那条 fail-closed 理由）。
 *
 * 这一条是 b85 收口时补的第三面：`classify`/`detectStalls` 各自内联了一份同样的比较，
 * 而**统计量（记录数、级别直方图、非 tracing 行数）从来没被窗口筛过**。收口复跑实测：
 * 同一窗口 `[06:17, 08:35]` 两次跑出"2852 条"与"3137 条"——差的 285 条全在 08:35 之后
 * （后端还在跑、日志还在写），结论不变但**文档抄住的数字一直在动**；更坏的一面是
 * `unparsed` 直接进判定，于是一轮收口之后发生的 panic 会把**上一轮**判红。
 */
export function withinWindowTs(ts, { sinceMs = null, untilMs = null } = {}) {
  if (ts === null || ts === undefined) return true
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return true
  if (sinceMs !== null && Number.isFinite(sinceMs) && t < sinceMs) return false
  if (untilMs !== null && Number.isFinite(untilMs) && t > untilMs) return false
  return true
}

/** 按 `.ts` 筛窗口——records 与 unparsed 共用（两份过滤器必漂，同 dataset-window 那条纪律）。 */
export function filterWindow(list, win) {
  return list.filter((x) => withinWindowTs(x.ts, win))
}

export function loadAllowlist(file = DEFAULT_ALLOW) {
  let body
  try {
    body = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`后端日志允许表不可用：${e.message}`)
  }
  if (!body || body.version !== 1) throw new Error('backend-log-allowlist.json version 必须为 1')
  if (!Array.isArray(body.entries)) throw new Error('backend-log-allowlist.json entries 必须是数组')
  const list = body.entries.map((e, i) => {
    const at = `entries[${i}]`
    if (!e || typeof e !== 'object') throw new Error(`${at} 不是对象`)
    if (e.level !== 'WARN' && e.level !== 'ERROR') throw new Error(`${at}.level 只能是 WARN/ERROR`)
    // 理由自足性判据与 oper-log-audit / endpoint-coverage **共用同一份**（producer-kit）
    const whyViolation = selfContainedWhyViolation(e.why)
    if (whyViolation) throw new Error(`${at}.why：${whyViolation}`)
    const why = String(e.why).trim()
    let re
    try {
      re = new RegExp(e.match)
    } catch (err) {
      throw new Error(`${at}.match 不是合法正则：${err.message}`)
    }
    // 条件型豁免的生产者锚点（批八十六）：形状不对必须抛，不能静默退化成
    // "永远算未命中"或"永远算活着"——两种退化都把撤销通道变成噪声或变成摆设。
    const producer = normalizeProducer(e.producer, at)
    // 日落豁免（b92，与 oper-log-audit 的 `until` 同口径）：只定性"缺陷已修复、但旧窗口里
    // 仍留着的历史行"。到点之后同类记录必须重新判红，条目本身也会因未命中进入退役通道——
    // 它不是永久白名单。形状坏必须抛，避免静默变成"永不生效"或"永远生效"。
    let until = null
    if (e.until !== undefined) {
      if (typeof e.until !== 'string' || !Number.isFinite(windowToEpoch(e.until))) {
        throw new Error(`${at}.until 必须是 YYYY-MM-DD HH:MM:SS（UTC），实际 ${JSON.stringify(e.until)}`)
      }
      until = e.until
    }
    return { level: e.level, match: String(e.match), re, why, producer, until }
  })
  // 集合级判据（b87）：同表内两条理由逐字相同 ⇒ 装载即抛（原先只有人工测量，没有锁）
  const dups = duplicateWhyGroups(list)
  if (dups.length) {
    throw new Error(
      `backend-log-allowlist.json 有 ${dups.length} 组逐字相同的 why（登记表必须逐条自足）：` +
        dups
          .slice(0, 3)
          .map(([t, c]) => `${c} 条 × 「${t.slice(0, 40)}」`)
          .join(' ｜ ')
    )
  }
  return list
}

/** 允许表条目的身份键（"未命中"判据与退役通道必须认同一个键，否则两处口径会漂）。 */
export function allowKey(e) {
  return `${e.level}|${e.match}|${e.until ?? ''}`
}

/**
 * 把本轮未命中的条目从允许表里删掉（动作通道；`unused` 为空时**不写文件**，
 * 免得每轮跑批都把 mtime 抖一遍）。返回被删的原始条目以便留痕。
 *
 * 按原始文本的 `level|match` 比对（`loadAllowlist` 会给条目挂上编译后的 `re`，
 * 但写回去的必须是原始 JSON 形状——把 `re` 序列化进文件就是往仓库里写 RegExp 的残渣）。
 */
export function retireStale(file, unused) {
  if (!unused.length) return []
  const body = JSON.parse(fs.readFileSync(file, 'utf8'))
  const drop = new Set(unused.map((e) => allowKey({ level: e.level, match: String(e.match), until: e.until })))
  const kept = []
  const removed = []
  for (const e of body.entries) {
    if (drop.has(allowKey({ level: e.level, match: String(e.match), until: e.until }))) removed.push(e)
    else kept.push(e)
  }
  fs.writeFileSync(file, JSON.stringify({ ...body, entries: kept }, null, 2) + '\n', 'utf8')
  return removed
}

/**
 * 条件型豁免的"生产者仍在"验证（批八十六）。
 *
 * 为什么 项 F 的"本轮没再出现 ⇒ 必须撤销"对这一族是错的：有些 WARN 的触发条件是**时刻/量级**
 * 而不是每轮都发生——实测两例：
 *   · `错过 03:00 调度窗口，启动期补跑一轮保留期清理`：只有当 `retention:last_success_at`
 *     缺失或距今 ≥20h 才打。b86 收口窗口 14:22–18:20Z 内**一条 retention 日志都没有**
 *     （`grep -c "保留期清理\|retention" = 0`），因为上一批刚跑过补跑、标记是新的；
 *     而每天第一个批次的启动必然再打一次。
 *   · `slow statement … FROM "sys_audit_change" … LIMIT ?`：导出那条批量读要**真的慢过 1s**
 *     才出现；本轮该页 0 行慢查询（`grep -c "slow statement.*sys_audit_change" = 0`）。
 * 撤销它们的后果不是"少一条豁免"，而是**下一次条件成立时判据报红、把人支使去补登记**——
 * 而补回的还是同一句理由。这就是 ⑯(c) 禁止的形状：给一个"本轮不可能出现"的分支编豁免。
 *
 * 判据因此改问**真正想问的问题**：这条豁免是"废条目"还是"本轮条件未成立"？
 * 前者=产生它的代码已经不在了（可从源码文本证伪），后者=代码还在、条件没凑巧。
 * 验证不了（文件缺失/锚点空/锚点找不到）一律按未命中计——"取不到"不得读成"没问题"（⑧同族）。
 *
 * @param {{file?: string, contains?: string}|undefined} producer
 * @returns {{live: boolean, note: string}}
 */
export function producerLive(producer) {
  return PRODUCER_LIVE(producer)
}

/**
 * 按级别 + 消息正则匹配允许表；返回未登记项、已登记项与**本轮未命中的条目**。
 *
 * `unused` 这一支是批八十五 项 F 补的：允许表是"本轮对账"，不是永久白名单。
 * 只判"未登记的必须红"而不判"登记了却没再出现的必须撤销"，条目就会随着代码修复越积越多，
 * 最后没人敢删——同一形态在 endpoint-coverage / click-failure-audit / config-parity 三处
 * 都立过案（且都配了 `--retire-stale` 动作通道：只打提示、没有动作通道的信号等于没判）。
 */
export function classify(records, allow, { since = null, until = null, verify = producerLive } = {}) {
  const win = {
    sinceMs: since ? Date.parse(since) : null,
    untilMs: until ? Date.parse(until) : null
  }
  const unknown = []
  const allowed = []
  const matched = new Set()
  let scanned = 0
  for (const r of records) {
    if (r.level !== 'WARN' && r.level !== 'ERROR') continue
    if (!withinWindowTs(r.ts, win)) continue
    scanned += 1
    const hit = allow.find(
      (e) =>
        e.level === r.level &&
        e.re.test(r.msg) &&
        // 日落豁免只覆盖 until 之前的记录；记录时刻取不到 ⇒ 不得借用日落豁免（fail-closed）
        (!e.until || windowToEpoch(r.ts) < windowToEpoch(e.until))
    )
    if (hit) {
      matched.add(allowKey(hit))
      allowed.push({ ...r, why: hit.why, until: hit.until ?? null })
    } else unknown.push(r)
  }
  const staleAll = allow.filter((e) => !matched.has(allowKey(e)))
  // 未命中集合只留"真的没理由再留着"的条目；条件型（producer 锚点仍在源码里）另立一类，
  // 既不计红也不静默（`held` 逐条打印验证凭据）。分法与 oper-log-audit 共用 producer-kit。
  const { unused, held } = splitUnused(staleAll, verify)
  return { unknown, allowed, unused, held, scanned }
}

function summarize(records) {
  const byLevel = {}
  for (const r of records) byLevel[r.level] = (byLevel[r.level] || 0) + 1
  return byLevel
}

/**
 * ==================== 整机停顿判据（批八十五 项 G） ====================
 *
 * 立案证据（`logs/b85_r1.log`，b85 全量 deep 轮）：05:11:30.103 之后日志**整整 37.7 秒
 * 一个字都没有**——连每 1.6 秒一条、完全不碰数据库的 WebSocket 建立/关闭都停了，调度器的
 * 下一个 tick 也没打；05:12:07.861 起 7 条 ERROR/WARN 挤在**4 毫秒内**同时冒出来
 * （auth 闸门查询超时 ×1、fail-closed 拒绝 ×1、`response failed … 503` ×3、
 * pool timed out ×2、slow statement ×1），三条 503 的 latency 分别是 36245/35176/33488 ms。
 *
 * 这三条数字合起来是决定性的：**闸门自己的 3 秒 `tokio::time::timeout` 在那 37 秒里从未触发**
 * （若触发了，三条会在各自起点 +3s 的**不同时刻**被拒，而不是挤在同一毫秒）。定时器不推进
 * ⇒ 异步运行时整体没被调度 ⇒ 不是连接池、不是慢 SQL、不是我们的代码路径。同一窗口从测试侧
 * 看也是同一形状：`[05:11:36] ❌ M30 i18n` → `[05:12:06] safeGoto 第 1 次导航超时 30000ms`，
 * 而 M31 报 `net::ERR_NETWORK_CHANGED` ×5——客户端和服务端**同时**冻住。两条用例单独复跑
 * 在同一产物上全绿（M30 8✅ / M31 13✅）。
 *
 * 为什么不能登记进允许表：那张表的语义是"这条**设计内**失败会发生"。把一次主机层面的
 * 冻结签成设计内，等于给"用户真实收到 503"编了一个永远豁免的理由——下一次真出 503
 * 也被这条洗掉。所以正确动作不是"登记加一条"，而是**判成本轮不作数**（EXIT=2 UNRUN）：
 * 既不是通过，也不是缺陷，而是"这一轮证明不了任何一侧"（AGENTS ⑥ 三态：没跑 ≠ 干净）。
 *
 * 停顿的判据形状取"日志自己作证"的两条硬事实，不取"看起来像"：
 *   (a) 恢复瞬间的记录自带 `latency=N ms` 且 N ≥ 0.8 × 停顿长度 ⇒ 这条请求**横跨**整段停顿；
 *   (b) 恢复瞬间 2 秒内**成簇**（≥2 条）出现超时/fail-closed 族 ⇒ 被压住的批次一起冒头。
 * 只有一条超时行、前面又正好安静（套件之间的自然空闲），不按停顿处理，照常判未登记——
 * 放宽到"有 gap 就算"会把真回归也一起豁免掉，那是把判据关掉。
 *
 * **进程重启接缝不是停顿**（b102）：多进程拼接日志（收口轮重启 `:8080` 之后要覆盖到
 * 前一轮 deep 全量的 witness 面，见 ㊱）里，两段之间必然有一段"日志没在写"的空洞，
 * 而新进程启动时恰好会成簇打出 `权限 fail-closed 模式已启用` + 冷启动 `slow statement`。
 * 实测（`logs/b102_union.log`，14:46:30 → 19:26:17 静默 16787s）这条被判定成"整机停顿
 * ⇒ 本轮不作数"，给出的处置是"确认主机没有并行负载…然后重跑"——**指错了方向**：
 * 那段时间主机好好的，是后端进程被停掉去重新构建了。
 * 判别证据是决定性的：真冻结是**同一进程**被挂起后继续写，恢复行不可能是进程启动标记；
 * 反过来，第一条就是 `stepby_axum::logger` 的初始化行 ⇒ 上一个进程已经退出。
 * 因此接缝只豁免"成簇"这一支；若某条自带 `latency=` 横跨整段停顿（在飞请求的计时字段
 * 证明进程一直活着），仍然判停顿——两条证据互相排斥，标记不得把硬证据洗掉。
 */
const STALL_GAP_SECS = 20
const STALL_RECOVER_SECS = 2
// 超时/fail-closed 族。判据只用于"这一条是不是被冻结压住的积压"，不用于定罪，
// 所以宁可写得宽一点——宽了的代价是本轮 UNRUN（要重跑），不是"通过"。
const STALL_FAMILY_RE = /(查询超时|fail-closed|Connection pool timed out|slow statement|timed out|Timeout)/i

/** 这一条是否横跨停顿；返回理由文本，不是则 null。 */
export function stallArtifactReason(msg, gapMs) {
  const lat = /latency=(\d+)\s*ms/.exec(msg)
  if (lat && Number(lat[1]) >= gapMs * 0.8) return `latency=${lat[1]}ms 横跨整段停顿`
  if (STALL_FAMILY_RE.test(msg)) return '超时/fail-closed 族在恢复瞬间成簇'
  return null
}

/**
 * 进程启动标记：tracing 第一行由 `stepby_axum::logger` 打出（`main.rs` 里初始化后
 * 立刻落一行）。**同一进程被挂起后恢复不可能重新打这一行** ⇒ 它把"进程重启接缝"
 * 与"主机冻结"分开。判据只认这个模块名，不认 `INFO` 级别（启动流水里 INFO 很多，
 * 拿级别当标记等于"有 gap 就豁免"）。
 */
export function isProcessStartMarker(msg) {
  return /stepby_axum::logger:/.test(String(msg || ''))
}

/**
 * 在**窗口内**的记录上找整机停顿。gap 用全部级别量（冻结时什么都不写），
 * 证据只看 WARN/ERROR。返回 `[{from,to,gapSecs,artifacts:[…]}]`，空数组 = 本轮没有停顿。
 */
export function detectStalls(
  records,
  { gapSecs = STALL_GAP_SECS, recoverSecs = STALL_RECOVER_SECS, since = null, until = null } = {}
) {
  const win = {
    sinceMs: since ? Date.parse(since) : null,
    untilMs: until ? Date.parse(until) : null
  }
  // 与 classify 共用 `withinWindowTs`，但这里**额外**要求时间戳可解析：gap 是减法算出来的，
  // 一条定不了位的记录会把 NaN 喂进比较（`NaN >= 20000` 恒 false ⇒ 静默漏判停顿）。
  const inWin = records.filter((r) => Number.isFinite(Date.parse(r.ts)) && withinWindowTs(r.ts, win))
  const stalls = []
  for (let i = 1; i < inWin.length; i++) {
    const prev = Date.parse(inWin[i - 1].ts)
    const cur = Date.parse(inWin[i].ts)
    const gapMs = cur - prev
    if (!(gapMs >= gapSecs * 1000)) continue
    const hits = []
    for (let j = i; j < inWin.length; j++) {
      if ((Date.parse(inWin[j].ts) - cur) / 1000 > recoverSecs) break
      const r = inWin[j]
      if (r.level !== 'WARN' && r.level !== 'ERROR') continue
      const reason = stallArtifactReason(r.msg, gapMs)
      if (reason) hits.push({ ...r, reason })
    }
    const crossing = hits.some((h) => h.reason.startsWith('latency='))
    // 进程重启接缝：恢复行是 logger 初始化 ⇒ 这段静默是"上一个进程已退出"，不是主机冻结。
    // 只豁免成簇那一支（理由见上方段落）；`crossing` 是进程一直在飞的硬证据，照常判停顿。
    const restartSeam = isProcessStartMarker(inWin[i].msg)
    if (crossing || (hits.length >= 2 && !restartSeam)) {
      stalls.push({
        from: inWin[i - 1].ts,
        to: inWin[i].ts,
        gapSecs: Math.round(gapMs / 1000),
        artifacts: hits
      })
      i += hits.length
    }
  }
  return stalls
}

export function stallSummary(stalls) {
  return stalls
    .map((s) => `${s.from}→${s.to} 静默 ${s.gapSecs}s（恢复瞬间 ${s.artifacts.length} 条超时/fail-closed 挤在一起）`)
    .join('；')
}

// 窗口解析（windowToEpoch）与"与最近一次全量轮自证窗口相交"闸（windowsOverlap /
// windowGapDetail / readFullRunWindow / readPartialRunWindow）自 b103 起住在
// `dataset-window.mjs`（b134 起文案只经 windowGapDetail 一个出口）：
// `oper-log-audit` 此前**没有**这道闸，收口跑部分轮窗口时 82 条负路径登记被报成
// "未命中 ⇒ 须撤销"，而 `--retire-stale` 在 code=1 时照常写文件（不可逆）。
// 两份实现必漂（AGENTS §6），所以抽成共享模块、两侧都从这里 import。
// 立案事实与文案原样保留在 dataset-window.mjs 的注释里。

function gateState({
  file,
  records,
  unparsed,
  unknown,
  unused = [],
  stalls = [],
  fileTotal = null,
  win = null,
  dsWin = null,
  partialWin = null
}) {
  if (!fs.existsSync(file)) return { code: 2, detail: `日志不存在：${file}` }
  if (fileTotal === 0) return { code: 2, detail: `日志为空（没有任何 tracing 记录）：${file}` }
  // 口径闸（b88 收口）：窗口里没有那轮浏览器套件的流量时，"未命中/未登记"两张清单都不作数——
  // 详见 windowsOverlap 上方那段立案事实。排在"窗口内零记录"之前：两者同时成立时，
  // 报"窗口里什么都没有"会把人支使去查文件，而正确答案是"窗口选错了轮次"。
  if (win && !windowsOverlap(win, dsWin)) {
    return { code: 2, detail: windowGapDetail(win, dsWin, partialWin) }
  }
  if (records.length === 0) {
    // 「日志为空」与「日志非空但这一轮的窗口里什么都没有」是两个不同的动作：前者查产物，
    // 后者查窗口串（多半是把上一轮的时间抄错了方向）。合成一个文案会把人支使错地方。
    return {
      code: 2,
      detail: `窗口内没有任何 tracing 记录（该文件共 ${fileTotal ?? '未知'} 条，全在窗口外）：${file} ⇒ 本轮不作数`
    }
  }
  // 口径闸排在内容闸之前（AGENTS ⑨）：本轮连定时器都没推进时，"未登记 N 条"报出来
  // 只会把人往"去登记"的方向支使，而正确答案是"重跑这一轮"。
  if (stalls.length) {
    return {
      code: 2,
      detail: `检测到 ${stalls.length} 次整机停顿：${stallSummary(stalls)} ⇒ 本轮不作数`
    }
  }
  const bad = unknown.length + unparsed.length + unused.length
  return {
    code: bad ? 1 : 0,
    detail: `${records.length} 条记录 / 未登记 ${unknown.length} 条 / 非 tracing 行 ${unparsed.length} 条 / 未命中允许表 ${unused.length} 条`
  }
}

function selftest() {
  const fails = []
  // 条数由脚本自己数着打（`ran`）：原先打的是硬编码 13，加一条用例文档就永远对不上，
  // 少一条也不会报——同"文件数由脚本自己打印，文档不抄数"那条纪律。
  let ran = 0
  const check = (name, cond, detail) => {
    ran++
    if (!cond) fails.push(`${name}${detail ? `：${detail}` : ''}`)
  }
  const allow = [
    { level: 'WARN', re: /Redis 配置被忽略/, why: 'local 档部署选择' },
    { level: 'ERROR', re: /已知后台任务失败/, why: '合成控制组' }
  ].map((e) => ({ ...e, match: e.re.source }))

  const text = [
    '2026-10-20T00:00:01.000000Z  INFO stepby_axum::x: src\\x.rs:1: 启动',
    '2026-10-20T00:00:02.000000Z  WARN stepby_axum::x: src\\x.rs:2: Redis 配置被忽略（cache.mode=local）',
    '2026-10-20T00:00:03.000000Z  WARN stepby_axum::x: src\\x.rs:3: 没登记过的告警',
    '2026-10-20T00:00:04.000000Z  ERROR stepby_axum::x: src\\x.rs:4: 某个失败',
    '    at handler.rs:10',
    "thread 'main' panicked at src/x.rs:9"
  ].join('\n')
  const parsed = parseLog(text)
  check('INFO/WARN/ERROR 四条记录被解析', parsed.records.length === 4, `实际 ${parsed.records.length}`)
  check('panic 裸行必须进 unparsed', parsed.unparsed.length === 1, JSON.stringify(parsed.unparsed))
  check(
    '裸行必须带上"它前面最近一条记录"的时刻（窗口筛裸行靠这个，缺了就永远只能算全文件）',
    parsed.unparsed[0]?.ts === '2026-10-20T00:00:04.000000Z',
    JSON.stringify(parsed.unparsed[0])
  )
  const errorRec = parsed.records.find((r) => r.level === 'ERROR')
  check('ERROR 续行并入消息', errorRec?.msg.includes('at handler.rs:10'), errorRec?.msg)
  const c = classify(parsed.records, allow)
  check('允许表命中 WARN 不报', c.allowed.length === 1, JSON.stringify(c.allowed.map((x) => x.msg)))
  check(
    '未登记 WARN 必须报',
    c.unknown.some((x) => x.level === 'WARN')
  )
  check(
    '未登记 ERROR 必须报',
    c.unknown.some((x) => x.level === 'ERROR')
  )
  check('INFO 不参与判定', !c.unknown.some((x) => x.level === 'INFO'))

  // 窗口过滤：只取 00:00:02 之后的 WARN
  const w = classify(parsed.records, allow, { since: '2026-10-20T00:00:02Z' })
  check('窗口过滤生效', w.scanned === 3, `实际 ${w.scanned}`)

  // 允许表**未命中**对账（b85 项 F）：条目是本轮对账，不是永久白名单。
  // 夹具里 ERROR 那条从未被打中 ⇒ 必须点名撤销；而打中的 WARN 条不得进未命中集合
  // （这一对互为对照组：只判"有未命中"判不出"把全部条目都算成未命中"这种实现）。
  check(
    '未命中的允许表条目必须点名（登记了但本轮没再出现=必须撤销）',
    c.unused.length === 1 && c.unused[0].level === 'ERROR',
    JSON.stringify(c.unused.map((e) => e.match))
  )
  check('命中的条目不得算未命中（否则退役通道会把活条目一起删掉）', !c.unused.some((e) => e.match.includes('Redis')))
  const hitErr = [
    ...parsed.records,
    { ts: '2026-10-20T00:00:05.000000Z', level: 'ERROR', msg: '已知后台任务失败：xyz' }
  ]
  check('补一条打中的 ERROR 后未命中集合必须清空', classify(hitErr, allow).unused.length === 0)
  check(
    '未命中必须把判定拉成 EXIT=1（只打提示没有动作=没判）',
    gateState({ file: DEFAULT_ALLOW, records: parsed.records, unparsed: [], unknown: [], unused: c.unused }).code === 1
  )

  // 条件型豁免（批八十六）：触发条件是**时刻/量级**而非"每轮都有"的条目，本轮没出现 ≠ 废条目。
  // 判据因此改问"产生它的代码还在不在"；验证不了（锚点缺失/读不到/找不到）一律按未命中计——
  // "取不到"不得读成"没问题"（前言 ⑧ 同族）。夹具与真函数两侧都要双向（注入桩判逻辑，
  // 真函数判文件读取这一路）。
  {
    const condEntry = {
      level: 'WARN',
      match: '条件型保留期补跑',
      re: /条件型保留期补跑/,
      why: '只在标记缺失/超 20h 的那一次启动出现',
      producer: { file: 'x/mod.rs', contains: '错过 03:00' }
    }
    const condAllow = [...allow, condEntry]
    const liveVer = () => ({ live: true, note: '生产者仍在' })
    const deadVer = () => ({ live: false, note: '锚点找不到' })
    const cl = classify(parsed.records, condAllow, { verify: liveVer })
    check(
      '条件型条目未触发而生产者仍在 ⇒ 不得进未命中',
      !cl.unused.some((e) => String(e.match).includes('条件型')),
      JSON.stringify(cl.unused.map((e) => e.match))
    )
    check(
      '且必须进 held 留痕（不判红也不静默）',
      cl.held.some((e) => String(e.match).includes('条件型') && e.heldNote === '生产者仍在')
    )
    const cdead = classify(parsed.records, condAllow, { verify: deadVer })
    check(
      '生产者锚点验证不过 ⇒ 必须照常按未命中点名',
      cdead.unused.some((e) => String(e.match).includes('条件型'))
    )
    check(
      '验证不过时不得同时进 held（否则同一条目有两个结论）',
      !cdead.held.some((e) => String(e.match).includes('条件型'))
    )
    check(
      '没有 producer 的条目语义不变（仍进未命中，条数与 项 F 那一对完全一致）',
      cl.unused.filter((e) => !e.producer).length === c.unused.length,
      `${cl.unused.filter((e) => !e.producer).length} vs ${c.unused.length}`
    )
    // 对照组：这条条件型豁免**真的被打中**时，既不进未命中也不进 held——
    // 防的是"挂了 producer 就永远不会算未命中"（那等于把 项 F 的撤销通道对这一族关掉）。
    const fired = [
      ...parsed.records,
      { ts: '2026-10-20T00:00:06.000000Z', level: 'WARN', msg: '条件型保留期补跑：本轮真出现' }
    ]
    const cf = classify(fired, condAllow, { verify: liveVer })
    check(
      '打中的条件型条目不得进未命中也不得进 held',
      !cf.unused.some((e) => String(e.match).includes('条件型')) &&
        !cf.held.some((e) => String(e.match).includes('条件型'))
    )
    check(
      'held 不参与退出码（只有未登记/裸行/未命中拉红）',
      gateState({ file: DEFAULT_ALLOW, records: parsed.records, unparsed: [], unknown: [], unused: [], held: cl.held })
        .code === 0
    )
    // 装载侧：producer 形状坏了必须**抛**（静默退化成"永远未命中"= 撤销通道乱删活条目；
    // 退化成"永远活着"= 废条目永久免疫），而合法形状必须原样带出 file/contains。
    {
      const tmpAllow = path.join(HERE, '_tmp_backend_allow_shape.json')
      const base = { version: 1, generatedAt: 'x', source: 'y', entries: [] }
      const write = (producer) =>
        fs.writeFileSync(
          tmpAllow,
          JSON.stringify({
            ...base,
            entries: [{ level: 'WARN', match: 'a', why: '为什么是设计内信号（够长）', producer }]
          })
        )
      try {
        write({ file: 'x.rs', contains: '锚点' })
        const okLoad = loadAllowlist(tmpAllow)
        check(
          '合法 producer 必须原样带出（classify 依赖它分叉）',
          okLoad[0].producer?.file === 'x.rs' && okLoad[0].producer?.contains === '锚点'
        )
        for (const bad of [
          ['非对象', 'producer'],
          ['缺 file', { contains: '锚点' }],
          ['file 空白', { file: '  ', contains: '锚点' }],
          ['锚点空串（能匹配任何文本）', { file: 'x.rs', contains: '' }],
          ['锚点非字符串', { file: 'x.rs', contains: 7 }]
        ]) {
          write(bad[1])
          let threw = false
          try {
            loadAllowlist(tmpAllow)
          } catch {
            threw = true
          }
          check(`producer 形状坏（${bad[0]}）必须抛而不是静默降级`, threw)
        }
        write(undefined)
        check('没有 producer 的条目照常装载（原语义不变）', loadAllowlist(tmpAllow)[0].producer === undefined)
      } finally {
        fs.rmSync(tmpAllow, { force: true })
      }
    }
  }
  // 日落豁免（b92，与 oper-log-audit 的 `until` 同口径）：只覆盖 until 之前的历史记录；
  // 到点之后同类记录必须重新判红，且窗口完全越过 until 后条目必须进未命中（退役通道仍有效）。
  {
    const sunsetWhy = 'b92 收口前的夹具域名触发的历史告警，夹具已改确定性负路径，本条目只覆盖旧窗口'
    const sunset = [
      { level: 'WARN', match: 'DNS 故障历史行', re: /DNS 故障历史行/, why: sunsetWhy, until: '2026-10-20 00:00:03' }
    ]
    const rows = [
      { ts: '2026-10-20T00:00:02.500000Z', level: 'WARN', msg: 'DNS 故障历史行（旧夹具）' },
      { ts: '2026-10-20T00:00:03.500000Z', level: 'WARN', msg: 'DNS 故障历史行（日落之后）' }
    ]
    const cs = classify(rows, sunset)
    check('until 之前的记录必须被日落豁免覆盖', cs.allowed.length === 1, JSON.stringify(cs.allowed.map((x) => x.ts)))
    check(
      'until 之后同类记录必须重新判红（日落不是永久白名单）',
      cs.unknown.length === 1 && String(cs.unknown[0].ts).includes('03.500000'),
      JSON.stringify(cs.unknown.map((x) => x.ts))
    )
    const csLate = classify(rows, sunset, { since: '2026-10-20T00:00:03Z' })
    check(
      '窗口完全越过 until 后条目必须进未命中（退役通道仍有效）',
      csLate.unused.length === 1 && csLate.unknown.length === 1,
      `unused=${csLate.unused.length} unknown=${csLate.unknown.length}`
    )
    const noTs = [{ ts: '无法解析', level: 'WARN', msg: 'DNS 故障历史行（时刻取不到）' }]
    const csNoTs = classify(noTs, sunset)
    check(
      '记录时刻取不到时不得借用日落豁免（fail-closed）',
      csNoTs.unknown.length === 1 && csNoTs.allowed.length === 0,
      JSON.stringify(csNoTs)
    )
    // 装载侧：until 形状坏必须抛；合法值必须原样带出。
    const tmp = path.join(HERE, '_tmp_backend_until.json')
    const write = (until) =>
      fs.writeFileSync(
        tmp,
        JSON.stringify({
          version: 1,
          entries: [{ level: 'WARN', match: 'a', why: '为什么是设计内信号（够长）', until }]
        })
      )
    try {
      write('2026-10-20 00:00:03')
      check('合法 until 必须原样带出（classify 依赖它）', loadAllowlist(tmp)[0].until === '2026-10-20 00:00:03')
      for (const bad of ['2026/10/20', '昨天', 123, '']) {
        write(bad)
        let threw = ''
        try {
          loadAllowlist(tmp)
        } catch (e) {
          threw = String(e.message)
        }
        check(`until 形状坏（${JSON.stringify(bad)}）必须抛并点名字段`, threw.includes('.until'), threw)
      }
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  // 真函数（不注入桩）：临时文件正反两判 + 三条 fail-closed 形状 + 真实树上的锚点正控。
  {
    const tmp = path.join(HERE, '_tmp_backend_producer.rs')
    fs.writeFileSync(tmp, 'fn main() { tracing::warn!("错过 03:00 调度窗口，启动期补跑一轮保留期清理") }\n', 'utf8')
    const rel = path.relative(REPO_ROOT, tmp).split(path.sep).join('/')
    try {
      const ok = producerLive({ file: rel, contains: '错过 03:00 调度窗口' })
      check('真函数：文件里确有锚点 ⇒ live', ok.live === true, ok.note)
      const no = producerLive({ file: rel, contains: '这句话源码里没有' })
      check('真函数：锚点找不到 ⇒ 不 live（条目确实过期）', no.live === false, no.note)
      check('真函数：缺 file ⇒ 不 live', producerLive({ contains: 'x' }).live === false)
      check(
        '真函数：锚点是空串 ⇒ 不 live（空串能匹配任何文本，必须挡在门外）',
        producerLive({ file: rel, contains: '' }).live === false
      )
      check(
        '真函数：文件不存在 ⇒ 不 live 而不是抛错',
        producerLive({ file: 'nope/none.rs', contains: 'x' }).live === false
      )
      check('真函数：没有 producer ⇒ 不 live（原语义保持）', producerLive(undefined).live === false)
      // 正控：本批实际写进允许表的两条锚点，必须在真实源码里找得到——
      // 锚点写错（改了文案没同步）就是"登记了但验证永真/永假"的废条目。
      check(
        '正控：保留期补跑锚点仍在调度器源码里',
        producerLive({ file: 'stepby-axum/src/scheduler/mod.rs', contains: '错过 03:00' }).live === true
      )
      check(
        '正控：变更留痕导出函数仍在服务层',
        producerLive({
          file: 'stepby-axum/src/service/sys_audit_change_service.rs',
          contains: 'pub async fn export_changes'
        }).live === true
      )
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }

  // 退役通道：写在判定之后，且 unused 为空时不得碰文件
  {
    const tmp = path.join(HERE, '_tmp_backend_retire.json')
    fs.writeFileSync(
      tmp,
      JSON.stringify(
        { version: 1, entries: allow.map((e) => ({ level: e.level, match: e.match, why: e.why })) },
        null,
        2
      )
    )
    const before = fs.readFileSync(tmp, 'utf8')
    const removed = retireStale(tmp, c.unused)
    const after = JSON.parse(fs.readFileSync(tmp, 'utf8'))
    check(
      '退役通道必须真删掉未命中条目并留痕',
      removed.length === 1 && after.entries.length === 1,
      `removed=${removed.length} 剩=${after.entries.length}`
    )
    check('退役后剩下的必须是命中的那条', after.entries[0]?.level === 'WARN', JSON.stringify(after.entries))
    check('退役写回必须是原始形状（不得把编译后的 RegExp 落进仓库）', !('re' in after.entries[0]))
    const again = fs.readFileSync(tmp, 'utf8')
    retireStale(tmp, [])
    check('没有未命中时不得改动文件（空集也要写一遍就是每轮抖 mtime）', fs.readFileSync(tmp, 'utf8') === again)
    check(
      '退役必须减少条目而不是增加（写回后允许表只可能更严）',
      after.entries.length < allow.length,
      `${after.entries.length} vs ${allow.length}`
    )
    void before
    fs.unlinkSync(tmp)
  }

  // 窗口串的**时区口径**（b83）：日志时间戳是 UTC，数据集窗口是 naive-UTC 文本。
  // `Date.parse('2026-10-20 00:00:02')` 在 UTC+8 上按本地时区解释 ⇒ 窗口前移 8 小时，
  // 会把上一轮的 WARN/ERROR 扫进本轮判定（b79 实测过同形错误的代价）。四条双向：
  const epochNaive = windowToEpoch('2026-10-20 00:00:02')
  const epochZ = windowToEpoch('2026-10-20T00:00:02Z')
  check('naive 串必须按 UTC 解析（与带 Z 的同刻）', epochNaive === epochZ, `${epochNaive} vs ${epochZ}`)
  check(
    '带偏移的串必须按偏移解析',
    windowToEpoch('2026-10-20T08:00:02+08:00') === epochZ,
    String(windowToEpoch('2026-10-20T08:00:02+08:00'))
  )
  check('垃圾串必须返回 NaN（不得读成"无窗口"）', Number.isNaN(windowToEpoch('昨天下午')))
  check('空串必须返回 NaN', Number.isNaN(windowToEpoch('')))
  // 同一份夹具按 naive-UTC 窗口过滤，结果必须与带 Z 的完全一致（判据不受调用方写法影响）
  const wNaive = classify(parsed.records, allow, {
    since: new Date(epochNaive).toISOString()
  })
  check('naive 窗口与 Z 窗口必须扫到同一条数', wNaive.scanned === w.scanned, `${wNaive.scanned} vs ${w.scanned}`)

  let badAllowIdx = 0

  // 允许表自身必须拒绝坏形状；每条都必须**因为自己那一处**被拒（断言抛出的话里点名哪个字段），
  // 否则"级别坏了"会被"理由太短"抢先抛出而照样 non-zero ⇒ 用例绿着没约束到被测那一支（前言 ⑩）。
  const OK_WHY = '这是一条自足的理由，写明为什么这个信号是设计内的'
  for (const [name, entries, expectInMsg] of [
    ['级别表外', [{ level: 'INFO', match: 'x', why: OK_WHY }], '.level'],
    ['缺理由', [{ level: 'WARN', match: 'x', why: '' }], '.why'],
    ['坏正则', [{ level: 'WARN', match: '(', why: OK_WHY }], '.match'],
    // b87 起三处登记表共用 producer-kit 的同一条自足性判据
    ['同上类跨条目指代', [{ level: 'WARN', match: 'x', why: `${OK_WHY}，同上一条` }], '同上'],
    ['以见上条开头', [{ level: 'WARN', match: 'x', why: '见上条同一判据，只是换个模块' }], '指代'],
    ['短到没有信息量', [{ level: 'WARN', match: 'x', why: '设计内信号短' }], '个字符'],
    [
      '同表内两条逐字相同的理由',
      [
        { level: 'WARN', match: '^a$', why: OK_WHY },
        { level: 'ERROR', match: '^b$', why: OK_WHY }
      ],
      '组'
    ],
    [
      'producer 锚点为空串',
      [{ level: 'WARN', match: 'x', why: OK_WHY, producer: { file: 'a.rs', contains: '' } }],
      'contains'
    ]
  ]) {
    let threw = ''
    // 文件名只用序号：用例名带中文，Windows 上按名字落盘容易撞非法字符（b87 在 oper 侧实测踩过）
    const tmp = path.join(HERE, `_tmp_allow_bad_${++badAllowIdx}.json`)
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries }))
    try {
      loadAllowlist(tmp)
    } catch (e) {
      threw = String(e.message)
    } finally {
      fs.unlinkSync(tmp)
    }
    check(`允许表坏形状必须拒绝：${name}`, threw.includes(expectInMsg), `抛出的话是「${threw}」`)
  }
  // 正控：指向测试用例的"参见"不是跨条目指代 ⇒ 必须放行（误伤会逼人把理由写短）
  {
    const tmp = path.join(HERE, '_tmp_allow_ok_xref.json')
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        version: 1,
        entries: [{ level: 'WARN', match: '^slow acquire$', why: '池排队超过 sqlx 阈值即打，参见 M88 的 latency 断言' }]
      })
    )
    let threw = ''
    try {
      loadAllowlist(tmp)
    } catch (e) {
      threw = String(e.message)
    } finally {
      fs.unlinkSync(tmp)
    }
    check('合法"参见某用例"的理由必须放行（正控，防判据扩大化）', threw === '', `抛出的话是「${threw}」`)
  }
  // 真实树正控：已提交允许表必须装载得过（新判据把存量 21 条洗红就是判据坏了）
  {
    const loaded = loadAllowlist()
    check('真实允许表在新自足性判据下必须装载得过', loaded.length >= 20, `装载 ${loaded.length} 条`)
    check(
      '真实允许表里挂了 producer 锚点的条目必须都验得过（锚点腐化等于把条件型豁免变成摆设）',
      loaded.filter((e) => e.producer).every((e) => producerLive(e.producer).live),
      `锚点条目 ${loaded.filter((e) => e.producer).length} 条`
    )
  }

  // 空日志不得判绿
  const emptyFile = path.join(HERE, '_tmp_backend_empty.log')
  fs.writeFileSync(emptyFile, '')
  try {
    const st = gateState({ file: emptyFile, records: [], unparsed: [], unknown: [], fileTotal: 0 })
    check('空日志必须 EXIT=2（没跑 ≠ 跑干净）', st.code === 2 && /日志为空/.test(st.detail), JSON.stringify(st))
    // 文件非空但窗口里没有东西 ⇒ 同样 EXIT=2，但文案必须指"窗口"（动作是改时间串），
    // 不能写成"日志为空"（动作是查产物）——两条不同的处置不能被一句话糊住
    const stWin = gateState({ file: emptyFile, records: [], unparsed: [], unknown: [], fileTotal: 12 })
    check(
      '窗口内零记录必须与"日志为空"分文案（两者动作不同）',
      stWin.code === 2 && /窗口内/.test(stWin.detail) && !/日志为空/.test(stWin.detail),
      JSON.stringify(stWin)
    )
  } finally {
    fs.unlinkSync(emptyFile)
  }
  const badState = gateState({
    file: DEFAULT_ALLOW,
    records: parsed.records,
    unparsed: parsed.unparsed,
    unknown: c.unknown
  })
  check('存在未登记/裸行必须 EXIT=1', badState.code === 1, JSON.stringify(badState))

  // ==================== 口径闸：判定窗口必须真的盖住那轮浏览器套件（b88 收口）====================
  // 立案形状（本轮实测）：收口期重建并重启 :8080 之后跑非浏览器门禁，日志里只有 96 条启动流量，
  // 判据照打"允许表未命中 15 条 ⇒ 必须撤销"。照着提示做就是把 15 条真在用的登记撤销，
  // 下一轮浏览器套件当场判成"未登记 15 条"（前言 ⑨ 的"把人支使去把事实签反"第四个断面）。
  {
    const ds = {
      sinceMs: Date.parse('2026-10-20T00:00:00Z'),
      untilMs: Date.parse('2026-10-20T02:00:00Z')
    }
    const miss = [{ level: 'WARN', match: '租户闸门拒绝登录', why: '负路径用例每次都产生一条' }]
    const before = {
      sinceMs: Date.parse('2026-10-19T23:00:00Z'),
      untilMs: Date.parse('2026-10-19T23:30:00Z')
    }
    const stGap = gateState({
      file: DEFAULT_ALLOW,
      records: parsed.records,
      unparsed: [],
      unknown: [],
      unused: miss,
      win: before,
      dsWin: ds
    })
    check(
      '窗口整段早于那轮浏览器套件 ⇒ 必须 UNRUN 且文案点名"不相交"（不得判成"未命中该撤销"）',
      stGap.code === 2 && /不相交/.test(stGap.detail) && !/必须撤销/.test(stGap.detail),
      JSON.stringify(stGap)
    )
    const stHit = gateState({
      file: DEFAULT_ALLOW,
      records: parsed.records,
      unparsed: [],
      unknown: [],
      unused: miss,
      win: { sinceMs: Date.parse('2026-10-20T01:00:00Z'), untilMs: Date.parse('2026-10-20T01:30:00Z') },
      dsWin: ds
    })
    check(
      '窗口盖住那轮时同样的未命中必须照常判红（口径闸不得反过来把真信号洗绿）',
      stHit.code === 1,
      JSON.stringify(stHit)
    )
    check(
      '窗口终点缺失（到文件末尾）时按"覆盖到最新"算，必须判相交',
      windowsOverlap({ sinceMs: Date.parse('2026-10-20T01:00:00Z'), untilMs: null }, ds)
    )
    check(
      '窗口起点恰好等于那轮的终点 ⇒ 边界不得因抖动误判 UNRUN',
      windowsOverlap({ sinceMs: ds.untilMs, untilMs: ds.untilMs + 1000 }, ds)
    )
    check(
      '数据集取不到（dsWin=null）时**不得**触发这一支——"缺数据集"不能被报成"窗口不对"',
      windowsOverlap(before, null) === true
    )
    check(
      '窗口串不可解析时不得读成"不相交"（NaN 参与比较恒 false 那一族，前言 ⑧）',
      windowsOverlap({ sinceMs: NaN, untilMs: NaN }, ds) === true
    )
    // b134：不相交的两个成因要给出不同的动作。窗口里跑过**分段轮**（浏览器确实跑过，
    // 只是没跑全量）⇒ 必须要求"跑一轮全量 deep-e2e"；把它们混成一句"先跑一轮浏览器套件"，
    // 照着做就是重跑一遍刚跑过的套件（AGENTS ⑨：文案指错方向 = 把人支使去把事实签反）。
    const partial = {
      sinceMs: Date.parse('2026-10-19T23:10:00Z'),
      untilMs: Date.parse('2026-10-19T23:20:00Z'),
      modules: 1,
      source: '合成夹具'
    }
    const stPartial = gateState({
      file: DEFAULT_ALLOW,
      records: parsed.records,
      unparsed: [],
      unknown: [],
      unused: miss,
      win: before,
      dsWin: ds,
      partialWin: partial
    })
    check(
      '不相交且窗口里跑过分段轮 ⇒ 文案点名"分段轮"并要求跑一轮全量 deep-e2e（不得让人重跑浏览器套件）',
      stPartial.code === 2 &&
        /分段轮/.test(stPartial.detail) &&
        /全量/.test(stPartial.detail) &&
        !/先跑一轮浏览器套件/.test(stPartial.detail),
      JSON.stringify(stPartial)
    )
    check(
      '分段轮窗口与判定窗口不相交 ⇒ 必须退回旧文案（别处的分段轮不得当成本轮证据）',
      /先跑一轮浏览器套件/.test(
        windowGapDetail(before, ds, {
          ...partial,
          sinceMs: Date.parse('2026-10-18T01:00:00Z'),
          untilMs: Date.parse('2026-10-18T02:00:00Z')
        })
      ) &&
        !/分段轮/.test(
          windowGapDetail(before, ds, {
            ...partial,
            sinceMs: Date.parse('2026-10-18T01:00:00Z'),
            untilMs: Date.parse('2026-10-18T02:00:00Z')
          })
        )
    )
    check(
      '没有分段轮数据集（partialWin=null）时文案保持原样（缺数据集不得被说成"跑过分段轮"）',
      /先跑一轮浏览器套件/.test(windowGapDetail(before, ds, null))
    )
    // 装载侧：`readPartialRunWindow` 必须区分"没有这个文件"与"文件在、但那是全量轮"——
    // 拿一份 full:true 的数据集当分段轮证据，会把"该跑全量"错报成"已经跑过分段"。
    {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blwa-partial-'))
      const shots = path.join(tmpRoot, 'screenshots')
      fs.mkdirSync(shots)
      const target = path.join(shots, 'deep-e2e-reqstats.incremental.json')
      try {
        check('分段轮数据集不存在 ⇒ null（不得按"有分段轮"处理）', readPartialRunWindow(tmpRoot) === null)
        fs.writeFileSync(
          target,
          JSON.stringify({
            full: true,
            windowStart: '2026-10-20 01:00:00.000',
            windowEnd: '2026-10-20 02:00:00.000',
            modulesPlanned: 96
          })
        )
        check('full:true 的数据集不得当成分段轮证据', readPartialRunWindow(tmpRoot) === null)
        fs.writeFileSync(
          target,
          JSON.stringify({
            full: false,
            windowStart: '2026-10-20 01:00:00.000',
            windowEnd: '2026-10-20 02:00:00.000',
            modulesPlanned: 3
          })
        )
        const ok = readPartialRunWindow(tmpRoot)
        check(
          '合法分段轮数据集必须带出窗口与模块数',
          ok && ok.modules === 3 && Number.isFinite(ok.sinceMs) && Number.isFinite(ok.untilMs),
          JSON.stringify(ok)
        )
        fs.writeFileSync(
          target,
          JSON.stringify({
            full: false,
            windowStart: '不是时刻',
            windowEnd: '2026-10-20 02:00:00.000',
            modulesPlanned: 3
          })
        )
        check('窗口串不可解析 ⇒ null（取不到时刻不得读成"有分段轮"）', readPartialRunWindow(tmpRoot) === null)
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true })
      }
    }
  }

  // ==================== 统计量的窗口对账（b85 收口）====================
  // 事故形状：同一窗口两次跑出 2852 → 3137 条——后端在收口之后继续写同一个文件，
  // 而"记录 N / 级别直方图 / 非 tracing 行"三个量全在**整份文件**上统计。
  // 前者只是文档抄住的数字一直动；后者是真判定被污染：窗口外的一条 panic 会把上一轮判红。
  {
    const twoWindow = [
      '2026-10-20T00:00:01.000000Z  INFO a: 窗口内一条',
      '2026-10-20T01:00:00.000000Z  INFO a: 窗口外一条',
      '2026-10-20T01:00:01.000000Z ERROR a: 窗口外一条真失败',
      "thread 'main' panicked at src/y.rs:1"
    ].join('\n')
    const tp = parseLog(twoWindow)
    const w2 = { sinceMs: Date.parse('2026-10-20T00:00:00Z'), untilMs: Date.parse('2026-10-20T00:00:30Z') }
    const recsIn = filterWindow(tp.records, w2)
    check(
      '记录计数只算窗口内（否则"本轮 N 条"每次跑都不同）',
      recsIn.length === 1,
      JSON.stringify(recsIn.map((r) => r.ts))
    )
    check(
      '级别直方图同口径（窗口外的 ERROR 不得出现在本轮统计里）',
      JSON.stringify(summarize(recsIn)) === JSON.stringify({ INFO: 1 }),
      JSON.stringify(summarize(recsIn))
    )
    check(
      '窗口外的裸行不得让本轮判红（同一条 panic 不属于这一轮）',
      filterWindow(tp.unparsed, w2).length === 0 && tp.unparsed.length === 1,
      JSON.stringify(tp.unparsed)
    )
    // 对照组：把窗口推到包含那条 panic 的时刻 ⇒ 必须被抓到。
    // 只判"排除"判不出"一律排除"这种实现（同 ⑳b 的对照组纪律）。
    const w3 = { sinceMs: Date.parse('2026-10-20T00:59:00Z'), untilMs: null }
    check(
      '对照组：同一份文本把窗口挪到裸行之后必须计入（不得退化成"裸行一律排除"）',
      filterWindow(tp.unparsed, w3).length === 1 && filterWindow(tp.records, w3).length === 2,
      JSON.stringify({ bare: filterWindow(tp.unparsed, w3).length, rec: filterWindow(tp.records, w3).length })
    )
    // 文件最开头、任何记录之前的裸行定不了位 ⇒ 必须按窗口内计（fail-closed）
    const headBare = parseLog(
      ["thread 'main' panicked at src/z.rs:1", '2026-10-20T05:00:00.000000Z  INFO a: 之后才有记录'].join('\n')
    )
    check(
      '定不了位的裸行必须算窗口内（宁可多判一条红，也不能让真 panic 因为"没时间戳"被筛掉）',
      headBare.unparsed[0]?.ts === null && filterWindow(headBare.unparsed, w2).length === 1,
      JSON.stringify(headBare.unparsed)
    )
    check(
      '窗口内零记录时 classify 的扫描数也必须为 0（三处共用同一个过滤器，不得各写一份）',
      classify(tp.records, allow, { since: '2026-10-20T00:00:00Z', until: '2026-10-20T00:00:30Z' }).scanned === 0,
      String(classify(tp.records, allow, { since: '2026-10-20T00:00:00Z', until: '2026-10-20T00:00:30Z' }).scanned)
    )
  }

  // ==================== 整机停顿判据（项 G）：合成双向，逐条对照 ====================
  // 真实事故形状（logs/b85_r1.log 原文摘出，消息逐字保留）：05:11:30 之后 37.7s 全静默，
  // 05:12:07.861 起 7 条挤在 4ms 内，三条 503 的 latency 36245/35176/33488ms。
  const stallLines = [
    '2026-10-22T05:11:28.523340Z  INFO stepby_axum::handler::ws_handler: ws.rs:287: WebSocket 连接建立 user_id=1',
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask: 无启用告警规则，本轮评估跳过',
    '2026-10-22T05:12:07.861232Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求；redis 档=Redis 查询/local 档=业务库查询） request_id=1825437f',
    '2026-10-22T05:12:07.862185Z ERROR tower_http::trace::on_failure: on_failure.rs:93: response failed classification=Status code: 503 Service Unavailable latency=36245 ms',
    '2026-10-22T05:12:07.864716Z ERROR stepby_axum::middleware::auth: auth.rs:114: Redis 黑名单/pwd_ver 查询失败（fail-closed 拒绝请求） error=共享态后端操作失败: Failed to acquire connection from pool: Connection pool timed out'
  ]
  const stallParsed = parseLog(stallLines.join('\n'))
  const s1 = detectStalls(stallParsed.records)
  check('整机停顿必须被抓到（37s 全静默 + 恢复瞬间成簇）', s1.length === 1, JSON.stringify(s1.map((x) => x.gapSecs)))
  check(
    '停顿的 artifact 只收 WARN/ERROR，INFO 恢复行不得算进去',
    s1[0]?.artifacts.length === 3 && s1[0]?.gapSecs === 38,
    `实得 ${s1[0]?.artifacts.length} 条 / gap ${s1[0]?.gapSecs}s`
  )
  check(
    '带 latency 横跨停顿的那条必须给出"横跨"理由（这是最硬的一支）',
    s1[0]?.artifacts.some((a) => a.reason.startsWith('latency=36245ms')),
    JSON.stringify(s1[0]?.artifacts.map((a) => a.reason))
  )
  const stallState = gateState({
    file: DEFAULT_ALLOW,
    records: stallParsed.records,
    unparsed: [],
    unknown: classify(stallParsed.records, allow).unknown,
    unused: [],
    stalls: s1
  })
  check(
    '停顿轮必须判 EXIT=2（不作数），既不是通过也不是"未登记"——把环境事故登记成设计内=下次真 503 也被洗掉',
    stallState.code === 2 && /不作数/.test(stallState.detail),
    JSON.stringify(stallState)
  )
  // 反脆弱 1：同样三条 ERROR 但**没有停顿** ⇒ 必须照常判未登记（环境判据不得吞掉真失败）
  const noGapText = stallLines
    .map((l, i) => (i >= 2 ? l.replace('2026-10-22T05:12:07', `2026-10-22T05:11:3${i - 1}`) : l))
    .join('\n')
  const noGapParsed = parseLog(noGapText)
  const s2 = detectStalls(noGapParsed.records)
  const c2 = classify(noGapParsed.records, allow)
  check(
    '反脆弱：同样的三条 ERROR 但无停顿时必须判未登记（不得"看谁都像环境"）',
    s2.length === 0 && c2.unknown.length === 3,
    `实得 stalls=${s2.length} unknown=${c2.unknown.length}`
  )
  // 反脆弱 2：恢复后 10 秒才出现的 ERROR 属于"停顿之后的真失败"，照常判
  const lateOnly = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:12:30.000000Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求）'
  ]
  check(
    '反脆弱：gap 之后 2 秒以外才出现的超时行必须照常判（恢复后的真失败不得被豁免）',
    detectStalls(parseLog(lateOnly.join('\n')).records).length === 0,
    '实得没有停顿才对'
  )
  // 反脆弱 3：只有 1 条超时行、且不带横跨停顿的 latency ⇒ 证据不足，按真失败判
  const single = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:12:07.000000Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求）'
  ]
  check(
    '反脆弱：孤零零一条超时行不足以定性停顿（单条按未登记判，避免"有 gap 就豁免"）',
    detectStalls(parseLog(single.join('\n')).records).length === 0,
    '实得没有停顿才对'
  )
  // 反脆弱 4：19s 的短 gap（阈值以下）不触发——阈值参与判定，不得"看谁都像"
  const shortGap = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:11:49.103210Z ERROR stepby_axum::middleware::auth: auth.rs:104: auth 闸门查询超时（fail-closed 拒绝请求）',
    '2026-10-22T05:11:49.203210Z ERROR tower_http::trace::on_failure: on_failure.rs:93: response failed classification=Status code: 503 Service Unavailable latency=36245 ms'
  ]
  check(
    '反脆弱：阈值（20s）以下的静默不得算停顿（否则任何一次 DB 抖动都成了"环境"）',
    detectStalls(parseLog(shortGap.join('\n')).records).length === 0,
    '实得没有停顿才对'
  )
  // 反脆弱 5：自然空闲（两套件之间）没有 WARN/ERROR ⇒ 不得报停顿
  const idle = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:20:00.000000Z  INFO stepby_axum::handler::auth: 登录成功 user_name=admin'
  ]
  check(
    '反脆弱：长时间空闲但没有任何 WARN/ERROR 必须不报（空闲≠停顿）',
    detectStalls(parseLog(idle.join('\n')).records).length === 0
  )
  // 反脆弱 6：窗口外的停顿不得影响本轮判定（跨轮日志文件是常态：logs/app.log 天天轮转）
  const outside = detectStalls(stallParsed.records, { since: '2026-10-22T05:12:07.500000Z' })
  check('窗口外的静默不得算进本轮（since 之后第一条与停顿无关）', outside.length === 0, JSON.stringify(outside))
  // 单条 latency 横跨也必须成立（最硬的一支不依赖成簇）
  const oneCross = [
    '2026-10-22T05:11:30.103210Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-22T05:12:07.000000Z ERROR tower_http::trace::on_failure: on_failure.rs:93: response failed classification=Status code: 503 Service Unavailable latency=36245 ms'
  ]
  const sCross = detectStalls(parseLog(oneCross.join('\n')).records)
  check(
    '一条 latency 横跨停顿即成立（成簇只是第二条证据，不得当唯一门槛）',
    sCross.length === 1,
    JSON.stringify(sCross)
  )
  // 进程重启接缝（b102 实测形状：14:46:30 → 19:26:17 静默 16787s，恢复行是 logger 初始化，
  // 随后 2 秒内成簇打出 fail-closed 启动 WARN + 冷启动 slow statement）
  const seam = [
    '2026-10-27T14:46:30.104645Z  INFO stepby_axum::scheduler: mod.rs:364: 内置任务 alertEvalTask 跳过',
    '2026-10-27T19:26:17.599236Z  INFO stepby_axum::logger: src\\logger.rs:88: 日志初始化完成 level=INFO',
    '2026-10-27T19:26:17.700000Z  WARN sqlx::query: logger.rs:121: slow statement: execution time exceeded slow threshold',
    '2026-10-27T19:26:17.800000Z  WARN stepby_axum::router: src\\router\\mod.rs:256: 权限 fail-closed 模式已启用（permission_deny_by_default=true）'
  ]
  check(
    '进程重启接缝不得算停顿（恢复行是 logger 初始化 ⇒ 上一个进程已退出，不是主机冻结）；' +
      '否则拼接日志每轮都判"不作数"并把人支使去查一台根本没有冻住的主机',
    detectStalls(parseLog(seam.join('\n')).records).length === 0,
    JSON.stringify(detectStalls(parseLog(seam.join('\n')).records))
  )
  // 反向：同样的接缝形状但恢复行**不是**启动标记（同一进程被挂起后继续）⇒ 照常判停顿。
  // 这一支是上一条的对照，缺了它"接缝豁免"会退化成"有 gap 就不报"。
  const reseam = seam.map((l) =>
    l.includes('stepby_axum::logger') ? l.replace('stepby_axum::logger', 'stepby_axum::handler::run') : l
  )
  check(
    '同样的 16787s 静默 + 成簇，但恢复行不是进程启动标记 ⇒ 必须照常判整机停顿',
    detectStalls(parseLog(reseam.join('\n')).records).length === 1,
    JSON.stringify(detectStalls(parseLog(reseam.join('\n')).records))
  )
  // 硬证据优先：某条 latency 横跨整段停顿 ⇒ 进程一直在飞，启动标记不得把它洗成接缝
  // （`latency` 与 gap 同为毫秒：4h39m 的静默要横跨它，得是 ≈1679 万毫秒的在飞请求）
  const seamCross = [
    seam[0],
    '2026-10-27T19:26:17.599236Z  INFO stepby_axum::logger: src\\logger.rs:88: 日志初始化完成 level=INFO',
    '2026-10-27T19:26:17.700000Z ERROR tower_http::trace::on_failure: on_failure.rs:93: response failed classification=Status code: 503 Service Unavailable latency=16790000 ms'
  ]
  check(
    '接缝豁免不得洗掉横跨停顿的 latency 硬证据（两条证据互斥，硬的那条优先）',
    detectStalls(parseLog(seamCross.join('\n')).records).length === 1,
    JSON.stringify(detectStalls(parseLog(seamCross.join('\n')).records))
  )

  if (fails.length) {
    console.error(`SYNTH_FAIL 后端日志判据 ${fails.length} 条：`)
    for (const f of fails) console.error(`  · ${f}`)
    process.exit(1)
  }
  console.log(
    `SYNTH_OK 后端日志判据 ${ran} 条双向（解析/续行/窗口过滤/窗口时区口径/统计量窗口对账/允许表形状/未命中对账/退役通道/空日志与窗口内零记录/未登记必红/整机停顿必判不作数 + 各种"不得算成停顿"的反脆弱，含进程重启接缝与它的两向对照）`
  )
  process.exit(0)
}

function main() {
  const args = process.argv.slice(2)
  // `--selftest` 的派发只在文件末尾那一条（旗标纪律扫描器 R3：原先这里还有一条同名派发，
  // 而 main() 只可能在 else 分支被调用 ⇒ 永远走不到；留着的代价是下一个人改错了地方）。
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null
  // `--gate` 必须显式给（原判据文档把它写进用法却无人读 ⇒ 加了不等于没加）。
  // 不给就当"这次不是来要结论的"，EXIT=2：不得把"没声明"读成"通过"，也不得读成"缺陷"。
  if (!args.includes('--gate')) {
    console.error('EXIT=2 必须显式加 --gate（本判据要求调用者声明这次要的是判定；未加 ⇒ 不作结论）')
    process.exit(2)
  }
  const envLog = process.env.STEPBY_BACKEND_LOG || ''
  const file = opt('log') || envLog
  if (!file) {
    console.error('EXIT=2 未提供日志：用 --log=... 或 STEPBY_BACKEND_LOG（没跑 ≠ 跑干净）')
    process.exit(2)
  }
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) {
    console.error(`EXIT=2 日志不存在：${abs}`)
    process.exit(2)
  }
  let allow
  const allowPath = opt('allow') || DEFAULT_ALLOW
  try {
    allow = loadAllowlist(allowPath)
  } catch (e) {
    console.error(`EXIT=2 ${e.message}`)
    process.exit(2)
  }
  // 窗口必填（与 oper-log-audit 同口径）：不给就不判——读着跨轮轮转的 `logs/app.log`
  // 判出来的既不是本轮的通过，也不是本轮的失败。缺省时从本轮数据集自证字段取，
  // 让人不必抄时间串（抄错方向=把上一轮扫进来）。
  const fromDs = readFullRunWindow(HERE)
  // 口径闸的输入：数据集自证窗口。取不到 ⇒ `dsWin = null` ⇒ 这一支**不得**触发
  // （"缺数据集"不得被报成"窗口不对"，那会把人支使去补数据集而不是改窗口）。
  const dsWin = fromDs ? { sinceMs: windowToEpoch(fromDs.since), untilMs: windowToEpoch(fromDs.until) } : null
  // 只有"窗口里跑过分段轮"时才换文案（结论仍是 UNRUN）：否则会让人重跑一遍刚跑过的套件
  const partialWin = readPartialRunWindow(HERE)
  const since = opt('since') || process.env.STEPBY_BACKEND_SINCE || fromDs?.since || ''
  const until = opt('until') || process.env.STEPBY_BACKEND_UNTIL || fromDs?.until || ''
  const sinceMs = windowToEpoch(since)
  const untilMs = windowToEpoch(until)
  if (!Number.isFinite(sinceMs)) {
    console.error(
      `EXIT=2 窗口起点缺失或不可解析：--since= / STEPBY_BACKEND_SINCE / screenshots/deep-e2e-reqstats.json 三处都没拿到可用值` +
        `（给的="${since || '空'}"；naive 串按 UTC 解释）`
    )
    process.exit(2)
  }
  if (until && !Number.isFinite(untilMs)) {
    console.error(`EXIT=2 窗口终点不可解析："${until}"`)
    process.exit(2)
  }
  console.log(
    `  窗口：${since} → ${until || '（到文件末尾）'}（来源：${opt('since') ? '--since' : process.env.STEPBY_BACKEND_SINCE ? 'STEPBY_BACKEND_SINCE' : fromDs ? fromDs.source : '—'}，按 UTC 解释）`
  )
  const parsed = parseLog(fs.readFileSync(abs, 'utf8'))
  const win = {
    since: new Date(sinceMs).toISOString(),
    until: untilMs ? new Date(untilMs).toISOString() : null
  }
  const winMs = { sinceMs, untilMs: Number.isFinite(untilMs) ? untilMs : null }
  // 统计量与判定一律只看窗口内（b85 收口）：收口之后后端还在往同一个文件里写，
  // 全文件计数让"记录 N"每次跑都变大（文档抄住的数字一直在动），
  // 而窗口外的一条裸 panic 会把**上一轮**判红——与 stall 那条"窗口外的静默不得算进本轮"同族。
  const recs = filterWindow(parsed.records, winMs)
  const bare = filterWindow(parsed.unparsed, winMs)
  const stalls = detectStalls(parsed.records, win)
  const { unknown, allowed, unused, held = [], scanned } = classify(parsed.records, allow, win)
  console.log(`后端日志：${abs}`)
  console.log(
    `  窗口内记录 ${recs.length} / 级别 ${JSON.stringify(summarize(recs))}` +
      (parsed.records.length === recs.length
        ? ''
        : `（全文件 ${parsed.records.length} 条，窗口外 ${parsed.records.length - recs.length} 条不参与判定）`)
  )
  console.log(
    `  WARN/ERROR 扫描 ${scanned} / 已登记 ${allowed.length} / 未登记 ${unknown.length} / 非 tracing 行 ${bare.length}` +
      `${parsed.unparsed.length === bare.length ? '' : `（全文件 ${parsed.unparsed.length}）`} / 允许表未命中 ${unused.length}` +
      `${held.length ? ` / 条件型豁免未触发但生产者仍在 ${held.length}` : ''} / 整机停顿 ${stalls.length} 次`
  )
  if (!windowsOverlap(winMs, dsWin)) {
    // 口径闸先于内容闸（AGENTS ⑨）：这一把里没有那轮浏览器流量，"未命中 15 条"报出来
    // 只会把人支使去撤销真在用的登记（b88 收口实测正是这个形状：重启 :8080 之后跑非浏览器门禁）。
    console.error(`❌ [FATAL] ${windowGapDetail(winMs, dsWin, partialWin)}（未登记/未命中两张清单已按口径闸跳过）`)
    process.exit(2)
  }
  for (const s of stalls) {
    console.log(`  ⏸ [整机停顿] ${s.from} → ${s.to} 静默 ${s.gapSecs}s，恢复瞬间 ${s.artifacts.length} 条：`)
    for (const a of s.artifacts.slice(0, 4)) {
      console.log(`      · [${a.level}] ${a.msg.split('\n')[0].slice(0, 150)}（${a.reason}）`)
    }
  }
  if (stalls.length) {
    // 口径闸先于内容闸（AGENTS 门禁全景 ⑨）：停顿轮里"未登记 7 条 / 未命中 15 条"这两张
    // 清单会把人支使去登记与退役，而正确动作只有一个——重跑。所以这里直接结束，不打内容清单。
    console.error(
      `❌ [FATAL] 本轮不作数：日志里有 ${stalls.length} 次整机停顿（阈值 ${STALL_GAP_SECS}s 静默 + 恢复瞬间成簇），` +
        `停顿期间定时器都不推进 ⇒ 这些 503/超时是冻结的积压，不是任何一侧的回归。` +
        `未登记/未命中清单已按口径闸跳过。处置：确认主机没有并行负载（内存 <2GB 会换页放大，见 RUN-RECIPE §3.36），` +
        `然后重跑这一轮——**不得**把它登记进允许表（那张表的语义是"这条设计内失败会发生"）。`
    )
    process.exit(2)
  }
  for (const u of unknown) {
    console.log(`  ❌ [${u.level}] ${u.ts} ${u.msg.split('\n')[0].slice(0, 200)}`)
  }
  for (const u of bare.slice(0, 20)) {
    console.log(`  ❌ [非 tracing] ${u.ts ?? '（文件开头，无法定时）'} ${u.line.slice(0, 200)}`)
  }
  const sunsetHits = allowed.filter((a) => a.until)
  if (sunsetHits.length) {
    console.log(
      `  ℹ [日落豁免] ${sunsetHits.length} 条历史行被 until 覆盖（到点后同类记录重新判红）：` +
        sunsetHits.map((a) => `${a.ts}→${a.until}`).join('；')
    )
  }
  for (const e of unused) {
    console.log(
      `  ❌ [允许表未命中] ${e.level} /${e.match}/ —— ${e.why}` +
        `（本轮没再出现${e.producer ? `，且生产者锚点验证不通过：${e.heldNote}` : '，必须撤销'}）`
    )
  }
  // 条件型豁免留痕不静默：不判红，但把"这轮为什么没有它"的验证凭据打在同一个屏幕上，
  // 免得下一批把它当成"从未出现过的废条目"（退役通道的语义是"生产者不在了"，不是"本轮没凑巧"）。
  for (const e of held) {
    console.log(`  ℹ [条件型豁免未触发] ${e.level} /${e.match}/ —— ${e.heldNote}`)
  }
  const st = gateState({
    file: abs,
    records: recs,
    unparsed: bare,
    unknown,
    unused,
    stalls,
    fileTotal: parsed.records.length,
    win: winMs,
    dsWin,
    partialWin
  })
  // 退役通道（批八十五 项 F）：只打提示没有动作 = 没判（AGENTS 门禁全景 ⑩）。
  // 写在判定**之后**、且只在数据集有效（code ≠ 2）时写——日志读不到时"未命中"根本无从谈起。
  if (args.includes('--retire-stale')) {
    if (st.code === 2) {
      console.error('EXIT=2 数据集无效（日志缺失/为空），退役判定不作数，允许表未改动')
      process.exit(2)
    }
    const retired = retireStale(allowPath, unused)
    console.log(
      retired.length
        ? `  🧹 已从允许表退役 ${retired.length} 条：${retired.map((e) => `${e.level}/${e.match}/`).join(' ')}`
        : '  🧹 本轮没有需要退役的条目（允许表逐条都还打得住）'
    )
    // 退役后重算一次：结论必须来自**改动后**的表，而不是改动前那次判定的残留
    const allow2 = loadAllowlist(allowPath)
    const again = classify(parsed.records, allow2, win)
    const st2 = gateState({
      file: abs,
      records: recs,
      unparsed: bare,
      unknown: again.unknown,
      unused: again.unused,
      stalls,
      fileTotal: parsed.records.length,
      win: winMs,
      dsWin,
      partialWin
    })
    if (st2.code !== 0) {
      console.error(`❌ 退役后仍有问题（未登记 ${again.unknown.length} 条）：${st2.detail}`)
      process.exit(st2.code)
    }
    console.log(`✅ 退役后复判通过：允许表 ${allow2.length} 条，全部本轮命中`)
    return
  }
  if (st.code !== 0) {
    console.error(`❌ 后端日志判据失败：${st.detail}`)
    process.exit(st.code)
  }
  console.log(`✅ 后端日志判据通过：${st.detail}（允许表 ${allow.length} 条，逐条带理由）`)
}

if (process.argv.includes('--selftest')) selftest()
else main()
