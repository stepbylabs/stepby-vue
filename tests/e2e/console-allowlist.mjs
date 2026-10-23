/**
 * console「状态码类无害噪声」登记表的装载与判形（批八十八 项 N-4）。
 *
 * 立案：这份表原先是 `deep-e2e.mjs` 里的一个内联字典（401/403/400/404 共 31 个 URL 前缀），
 * **一条都没有理由**，也没有任何判据管它——而 AGENTS 门禁表前言 ㉘ 立的正是这一族纪律
 * （"登记表必须逐条自足、跨条目指代等于没登记"），本仓已有四张表按这条改造过
 * （oper-log / backend-log / click-failure / endpoint-coverage），第五张表一直靠注释。
 * 内联的第二层代价是**看不见空条目**：一条永远匹配不到的豁免（被别的条目遮蔽，或对应行为
 * 早已改掉）与一条天天在用的豁免，在代码里长得一模一样。
 *
 * 本模块只提供纯函数与一次装载：入口脚本（`deep-e2e.mjs` 运行侧、`console-allowlist-audit.mjs`
 * 判据侧）各自决定何时读盘、何时判红。判据脚本之间不得互相 import 入口脚本
 * （实测过一次 `--selftest` 打进对方的 SYNTH_OK 并 process.exit(0)），所以形状判据住在这里。
 *
 * 匹配语义与外置前**逐字保持一致**：`String(url).includes(entry.url)` 的子串匹配、
 * 命中该状态码条目列表里的第一条即算无害。改变匹配语义必须与重跑权威轮同批（前言 ⑩）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { duplicateWhyGroups, selfContainedWhyViolation } from './producer-kit.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 默认输入由脚本位置反推本仓根（门禁表前言 ②：不得写死任何副本树） */
export const DEFAULT_ALLOWLIST_PATH = path.join(HERE, 'console-allowlist.json')

/** 状态码白名单：deep-e2e 的判定分支只可能问这四档，登记别的档位是死条目 */
export const ALLOWED_STATUS = [400, 401, 403, 404]

/**
 * 表自己的形状 + 理由判据（数组=违规说明，空数组=合格）。
 * 逐条点名到 `entries[i] (id)`，因为"表坏了"与"某条理由没写清"的修法完全不同。
 */
export function allowlistViolations(entries) {
  const out = []
  entries.forEach((e, i) => {
    const at = `entries[${i}]${e && e.id ? ` (${e.id})` : ''}`
    if (!e || typeof e !== 'object') {
      out.push(`${at} 不是对象`)
      return
    }
    if (!Number.isInteger(e.status) || !ALLOWED_STATUS.includes(e.status)) {
      out.push(
        `${at} 的 status 必须是 ${ALLOWED_STATUS.join('|')} 之一，实为 ${JSON.stringify(e.status)} ` +
          '⇒ 运行侧永远不会问这一档，登记它等于一条死条目'
      )
    }
    if (typeof e.url !== 'string' || !e.url.trim()) {
      out.push(`${at} 的 url 必须是非空字符串（空串在子串匹配下恒真 ⇒ 等于把整档状态码全部放行）`)
    } else if (/[*?%]|\{\w+\}/.test(e.url)) {
      out.push(`${at} 的 url "${e.url}" 含通配/占位形态：匹配是**子串**语义，写成通配结构上永远命中不了`)
    }
    if (typeof e.id !== 'string' || !e.id.trim()) {
      out.push(`${at} 缺 id：运行侧的命中计数与撤销通道都按 id 累计，没有 id 的条目不可审计`)
    }
    const why = selfContainedWhyViolation(e.why)
    if (why) out.push(`${at} 的 why 不合格：${why}`)
  })
  const ids = entries.map((e) => e && e.id)
  const dupIds = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))]
  if (dupIds.length) out.push(`id 必须唯一（命中计数按 id 累计）：重复 ${dupIds.join(', ')}`)
  for (const [text, n] of duplicateWhyGroups(entries)) {
    out.push(
      `重复理由组 ${n} 条 ⇒ 逐字相同的两段文案只登记了一次，条目集合一变就分不清各自的理由：${String(text).slice(0, 40)}…`
    )
  }
  return out
}

/**
 * 结构性遮蔽：同一状态下两条 URL 互为子串 ⇒ 排在**后面**的那条永远轮不到
 * （命中取列表里第一条）。这类条目不会报错，只会每轮"未被使用"——所以在装载时就判掉，
 * 而不是等一轮跑批来发现（`--update-baseline` 那一路更不该把它签成事实）。
 */
export function shadowedEntries(entries) {
  const out = []
  entries.forEach((a, i) => {
    entries.forEach((b, j) => {
      if (j <= i || a.status !== b.status) return
      if (!a.url || !b.url) return
      if (b.url.includes(a.url) || a.url.includes(b.url)) {
        out.push(
          `${b.id} 被 ${a.id} 遮蔽（"${a.url}" 与 "${b.url}" 互为子串，列表按顺序取第一条命中）⇒ 后者结构性不可命中`
        )
      }
    })
  })
  return out
}

/**
 * 读盘并校验；任何一条不合格直接抛（调用方的退出码走 EXIT=2 那一路）。
 * "没登记"与"表坏了"必须可区分，所以每条抛错都点名是哪一份文件的哪一处。
 */
export function loadConsoleAllowlist(file = DEFAULT_ALLOWLIST_PATH) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `console 豁免表缺失：${file} —— 没有表不等于没有豁免：运行侧会把状态码噪声一律判红，而"表没了"这件事本身必须响亮`
    )
  }
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`console 豁免表 JSON 坏：${file} —— ${e.message}`)
  }
  const entries = doc && Array.isArray(doc.entries) ? doc.entries : null
  if (!entries || entries.length === 0) {
    throw new Error(
      `console 豁免表 entries 缺失或为空：${file} ⇒ 空表会让所有状态码噪声一起判红，与"本轮真的一条没有"在退出码上同形`
    )
  }
  const bad = allowlistViolations(entries)
  if (bad.length) {
    throw new Error(`console 豁免表不合格（${bad.length} 处）：\n  ${bad.join('\n  ')}`)
  }
  const shadow = shadowedEntries(entries)
  if (shadow.length) {
    throw new Error(
      `console 豁免表存在结构性遮蔽（${shadow.length} 对）：\n  ${shadow.join('\n  ')}\n  遮蔽不会报错，只会让条目每轮"未被使用"——修表（合并或改窄），不要加条目`
    )
  }
  const byStatus = new Map()
  for (const e of entries) {
    if (!byStatus.has(e.status)) byStatus.set(e.status, [])
    byStatus.get(e.status).push(e)
  }
  // `version`/`note` 必须随装载一起返回：退役通道要把整张表重写回盘，
  // 只带 entries 的写法会顺手把表头说明与版本号洗掉（一次"删三条"的动作改掉整份文件的自述）。
  return { entries, byStatus, file, version: doc.version ?? 1, note: doc.note ?? '' }
}

/** 按**这条消息自己的** URL 找登记条目（b87 的逐条口径：不做集合连坐） */
export function matchEntry(byStatus, status, url) {
  const list = byStatus.get(status)
  if (!list) return null
  const s = String(url || '')
  if (!s) return null
  return list.find((e) => s.includes(e.url)) || null
}

/** 集合兜底口径：本页累积的 URL 必须**全部**落在登记表里才放行（兜底不得变成主通道） */
export function matchEveryUrl(byStatus, status, urls) {
  const list = [...(urls || [])]
  if (list.length === 0) return null
  const hits = []
  for (const u of list) {
    const e = matchEntry(byStatus, status, u)
    if (!e) return null
    hits.push(e)
  }
  return hits
}
