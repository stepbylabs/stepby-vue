/**
 * 条件型豁免的共同实现（批八十七抽出）。
 *
 * 为什么要有这个文件：允许表里有一类条目，它对应的信号**只在某个条件成立时才产生**
 * （错过 03:00 的保留期补跑、真的慢过 1s 的导出、连接池排队超过 sqlx 阈值……）。
 * 对这类条目，"本轮没出现"不是"它废了"的证据——撤销它的后果是条件再次成立时判红，
 * 把人支使去补回同一句理由，比留着更糟（批八十六在 `backend-log-audit` 上实测到这个形态）。
 * 解法不是豁免"未命中"这件事，而是把"条目是否还有生产者"变成一个**可验证的事实**：
 * 锚点仍在源码里 ⇒ `held`（不判红、逐条打凭据）；锚点找不到 / 文件读不到 / 没挂锚点 ⇒ 照旧 `unused` 判红。
 *
 * 为什么两份判据必须共用这一份：`backend-log-audit` 与 `oper-log-audit` 的允许表同构，
 * 两处各写一份验证逻辑必然漂（本仓为这条已立过至少四次案，见 `dataset-window.mjs` 的同一条纪律）。
 *
 * 边界（刻意的）：
 * - 本文件只能是**纯函数**，不得 import 任何入口脚本——入口按 `argv` 立即执行，
 *   import 它会把调用方的自检洗成对方的结论（AGENTS 前言 ⑥/⑬ 实测踩过）。
 * - `REPO_ROOT` 由调用方给，不在这里猜：判据的默认输入必须从**各自脚本位置**反推本仓根。
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * 允许表条目的 `producer` 字段形状校验：坏了必须在装载时就抛，
 * 不得让它带着"永远匹配得上"的形状进入判定（空串锚点 = `includes('')` 恒真 = 判据关掉）。
 *
 * @param {unknown} raw 原始条目里的 producer
 * @param {string} at 报错定位（文件名 + 第几条）
 * @returns {{file: string, contains: string} | undefined}
 */
export function normalizeProducer(raw, at) {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object') throw new Error(`${at}.producer 必须是对象`)
  if (typeof raw.file !== 'string' || !raw.file.trim()) throw new Error(`${at}.producer.file 必须是非空字符串`)
  if (typeof raw.contains !== 'string' || !raw.contains.trim())
    throw new Error(`${at}.producer.contains 必须是非空字符串（空串能匹配任何文本，等于把判据关掉）`)
  return { file: raw.file.trim(), contains: raw.contains }
}

/**
 * 生成一个"生产者是否仍在源码里"的验证函数。
 *
 * fail-closed：所有拿不到证据的情形一律返回 `live: false`，并带上**可以照着做**的理由
 * （读不到文件 / 锚点已消失 / 没有锚点）——"验证不了"绝不允许被读成"还在"。
 *
 * @param {string} repoRoot 仓根（调用方按自己的脚本位置反推）
 * @returns {(producer?: {file: string, contains: string}) => {live: boolean, note: string}}
 */
export function makeProducerLive(repoRoot) {
  return function producerLive(producer) {
    if (!producer || typeof producer !== 'object') return { live: false, note: '没有 producer 锚点' }
    const { file, contains } = producer
    if (!file || typeof file !== 'string') return { live: false, note: 'producer.file 缺失 ⇒ 验证不了' }
    if (!contains || typeof contains !== 'string') return { live: false, note: 'producer.contains 为空 ⇒ 验证不了' }
    const abs = path.resolve(repoRoot, file)
    let text = ''
    try {
      text = fs.readFileSync(abs, 'utf8')
    } catch (err) {
      return { live: false, note: `读不到 ${abs}：${err.code || err.message}` }
    }
    return text.includes(contains)
      ? { live: true, note: `生产者仍在 ${file}（锚点已核）` }
      : { live: false, note: `${file} 里已找不到锚点 ⇒ 条目确实过期` }
  }
}

/**
 * 把"本轮未命中"的条目分成两拨：`unused`（确实没理由再留，判红并可退役）与
 * `held`（条件型且生产者已核实仍在，不判红但逐条留痕）。
 *
 * 判定方向刻意取保守：只有**验证通过**才算 held；验证失败必须回到 unused，
 * 否则"挂个锚点"就成了绕过未命中判定的通道。
 *
 * @param {Array<any>} staleAll 本轮未命中的条目
 * @param {(producer: any) => {live: boolean, note: string}} verify 生产者验证函数
 * @returns {{unused: any[], held: any[]}}
 */
export function splitUnused(staleAll, verify) {
  const unused = []
  const held = []
  for (const e of staleAll) {
    if (!e.producer) {
      unused.push(e)
      continue
    }
    const r = verify(e.producer)
    if (r && r.live) held.push({ ...e, heldNote: r.note })
    else unused.push({ ...e, heldNote: (r && r.note) || '验证失败' })
  }
  return { unused, held }
}

/**
 * ==================== 登记表"理由必须逐条自足"（批八十七） ====================
 *
 * 立的案有三个同源断面，今天分散在三份判据里各写一遍（本仓的"两份实现必漂"这一族）：
 * - `endpoint-coverage` 只禁 `同上`（b79 立，AGENTS 前言 ⑩：条目集合一变，指代就指向另一条理由）；
 * - 两张日志允许表只判 `why.trim().length >= 10`；
 * - "重复文案组数 0 / 最短 why 25 字符"在 AGENTS 里是**一次人工测量**，没有任何锁——
 *   下一批有人复制粘贴同一句话，没有任何判据会红。
 *
 * 本批把四条规则收成一个纯函数，**四处**消费同一份（oper / backend 两张日志允许表、
 * `endpoint-coverage` 的未触达登记表、`click-failure-audit` 的点击形状表）：
 * ① 非空且 ≥12 字符（取四处的最严值——原先 click 是 12、另三处是 10，共用一份就取更紧的那个，
 *    实测存量最短 25 字符，不会把任何一条既有登记洗红）；
 * ② 不得出现跨条目指代（`同上 / 见上 / 见下 / 如上 / 如前 / 同前 / ditto / same as above`，
 *    anywhere 匹配，与 `endpoint-coverage` 既有口径一致并略加宽）；
 * ③ 不得**以**指代开头（`见上条 / 如上 / 如前 / 同前`）——`click-failure` 原先只把
 *    "整条 why 恰好等于『同上』"当违规，于是"同上一条同一判据，只是……"这种**更常见的**写法漏网；
 * ④ 同一份登记表内不得有两条**完全相同**的理由（④ 是集合级判据，单独成函数）。
 *
 * 抽这份共用实现的直接起因就是②③在四处口径不一致：同一句"登记表必须逐条自足"被写了四遍、
 * 四个严格度，最松的那一处等于把这条纪律关掉（本仓"两份实现必漂"的第五个断面）。
 *
 * 为什么不禁"参见"：`参见 deep-e2e M90 的 403/404 配对断言` 指的是**测试用例**，
 * 不是另一条登记条目——把合法引用一起 ban 掉，人会开始写短到没有信息量的理由
 * （判据做宽 ≠ 判据做严，同前言 ⑯(c) 的"放宽/收紧都要有事实依据"）。
 *
 * 实测（b87 收口断面）：oper 84 / backend 21 / endpoint 106 / click 1 条 ⇒
 * ① 最短 25~30 字符全部通过；②③ 抓到 1 条（oper 的 `POST ^/system/backup/self-export$`
 * 以"同上一条同一判据的另一种审计形状"开头，且它相邻的那条其实是 flow 端点——
 * 指代已经指向了别的条目，这正是这条规则预测的失效形状）；④ 四份表重复组均为 0。
 */
const XREF_ANYWHERE = /(同上|见上|见下|如上|如前|同前)/i
const XREF_EXACT = /^(same|same as above|ditto)$/i
const LEADING_XREF = /^(见上条|见上|如上|如前|同前|同上条)/

/**
 * 单条理由的自足性检查。
 * @returns {string | null} 违规时返回**可以照着改**的说明；合规则返回 null
 */
export function selfContainedWhyViolation(why) {
  const text = typeof why === 'string' ? why.trim() : ''
  if (!text) return 'why 为空 ⇒ 等于没登记'
  if (text.length < 12) return `why 只有 ${text.length} 个字符，不足以写清"为什么这是设计内"（下限 12）`
  if (XREF_EXACT.test(text)) return 'why 是跨条目指代：条目集合一变（新增/删除/排序），它就指向另一条理由'
  if (XREF_ANYWHERE.test(text)) return 'why 含"同上/见上/如上/如前"这类跨条目指代：条目集合一变，它就指向另一条理由'
  if (LEADING_XREF.test(text)) return 'why 以跨条目指代开头，必须逐条自足'
  return null
}

/**
 * 集合级判据：同一份表里不得有两条完全相同的理由。
 * 返回重复组 `[[text, count]]`（按出现次数降序）；空数组 = 没有共用文案。
 */
export function duplicateWhyGroups(entries) {
  const counts = new Map()
  for (const e of entries) {
    const text = String(e?.why ?? '').trim()
    if (!text) continue
    counts.set(text, (counts.get(text) || 0) + 1)
  }
  return [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
}
