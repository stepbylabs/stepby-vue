/**
 * e2e 统一信息捕获工具包（capture-kit）
 *
 * 目标：解决 e2e 失败时「信息不全、无法定位」的问题——任何一条断言失败，
 * 报告里都必须带上当时页面上的全部可观测证据：
 *
 *   ① 页面 Toast / Notification / MessageBox 文本（用户实际看到的提示）
 *   ② 失败请求（HTTP >= 400）的 URL + 状态码 + 响应体 msg（后端给的真实原因）
 *   ③ 慢请求（超过阈值）列表（性能退化线索）
 *   ④ console error / pageerror（同步镜像，随时可读）
 *   ⑤ 失败瞬间的 URL / 页面文本 / 登录态 / 截图 / DOM 快照
 *   ⑥ 被吞掉的异常（swallow）——即 `.catch(() => {})` 处本应暴露的错误
 *   ⑦ 后端日志 ERROR/WARN 摘要（跨脚本共用）
 *
 * 设计约束：record() 是同步函数，无法 await。因此采用「浏览器 → Node 侧实时镜像」
 * 方案：注入脚本通过 exposeBinding 把 Toast 文本实时回传，Node 侧数组始终是最新的，
 * record() 里可以同步读取；需要 await 的取证（截图 / URL / DOM 文本）走
 * pendingFailures 队列，由 flushFailureSnapshots() 在下一个 await 点补写。
 *
 * 用法：
 *   import { createCaptureHub, summarizeBackendLogErrors } from './capture-kit.mjs'
 *   const hub = createCaptureHub(page, { tag: 'M12' })
 *   // 断言失败时（同步）：
 *   hub.noteFailure(entry)          // entry 为 results 中的条目对象
 *   // 每个模块/功能结束（异步）：
 *   await hub.flush('M12')
 *
 * @module tests/e2e/capture-kit
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * 后端日志目录默认值：**锚定到本文件位置**，与 `process.cwd()` 无关。
 *
 * b73 轮 10 发现的静默失效：旧写法用 `path.resolve(process.cwd(), '..', 'stepby-axum', 'logs')`
 * 与 main.mjs 的 `'../../stepby-axum/logs'`，两者都随启动目录漂移。RUN-RECIPE 规定的
 * main.mjs 启动目录是 `tests/e2e` ⇒ 解析出 `stepby-vue/stepby-axum/logs`（不存在）⇒
 * `existsSync` 为假直接 return ⇒ **"后端日志异常摘要"这一路捕获通道从未输出过任何东西**，
 * 且失败无声。deep-e2e 从仓根启动才恰好命中，于是同一份代码一处有效一处失效。
 * 现在：目录不存在时不再静默返回，而是通过 `missing` 字段让调用方**打印出来**。
 */
export const DEFAULT_BACKEND_LOG_DIR = path.resolve(HERE, '..', '..', '..', 'stepby-axum', 'logs')

/** 解析后端日志目录（环境变量优先，绝对/相对都按当前目录解析） */
export function resolveBackendLogDir() {
  const raw = process.env.STEPBY_BACKEND_LOG_DIR
  return raw ? path.resolve(raw) : DEFAULT_BACKEND_LOG_DIR
}

/** 响应体截取长度上限（避免报告过大） */
const BODY_SNIPPET_MAX = 500
/** 页面文本截取长度上限 */
const TEXT_SNIPPET_MAX = 400
/** 慢请求阈值（毫秒） */
const SLOW_REQUEST_MS = 3000
/** 每条失败条目最多附带的证据条数 */
const EVIDENCE_LIMIT = 3
/** 单模块失败请求样本上限（汇总对账需要全量，见 netFails 注入处注释） */
const NET_FAIL_LIMIT = 200
/** 部分失败通道的读体上限：只读 JSON 且不超过该长度（成功请求一律读体会拖慢全量跑批） */
const PARTIAL_BODY_MAX = 20000
/** 部分失败通道只认写请求——读接口（列表/轮询）本就允许"部分数据缺失"，混进来全是噪声 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

/**
 * 「HTTP 200 但响应体里写着失败」判据（批七十九新增捕获面）。
 *
 * 为什么现有通道看不见这一族：`netFails` 只在 `status >= 400` 时读体（性能决定，注释就写在
 * 注入处）。而本仓后端**批量操作**是刻意设计成"整体 200 + 逐项结果"的，例如
 * `POST /monitor/online/batchLogout` 返回 `{code:200, data:{successCount, failed:[{code,msg,…}]}}`
 * （`stepby-axum/src/handler/monitor_online_handler.rs:599-606`）——一条会话撤不掉时，
 * HTTP 层、`body.code` 层、Toast 层全都可能是绿的，只有 `data.failed` 里有真相。
 *
 * 判据刻意做窄（宁少不噪）：写请求 + HTTP < 400 + `body.code === 200` + 明细字段非空。
 * 返回 `null` 表示"不是部分失败"，调用方不得据此判红——本通道是**枚举 + 逐条对账**，
 * 与 netFails 同一口径（负路径用例本来就会故意制造部分失败）。
 *
 * @returns {{kind: string, failedCount: number, sample: string} | null}
 */
export function detectPartialFailure(method, status, contentType, text) {
  if (!WRITE_METHODS.has(String(method || '').toUpperCase())) return null
  if (!(status >= 200 && status < 400)) return null
  if (!/json/i.test(String(contentType || ''))) return null
  if (!text || text.length > PARTIAL_BODY_MAX) return null
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || body.code !== 200) return null
  const data = body.data
  if (!data || typeof data !== 'object') return null
  const pick = (arr) =>
    `部分失败 ${arr.length} 项：${arr
      .slice(0, 2)
      .map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x)).slice(0, 120))
      .join(' ; ')}`
  if (Array.isArray(data.failed) && data.failed.length > 0) {
    return { kind: 'failed[]', failedCount: data.failed.length, sample: pick(data.failed) }
  }
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return { kind: 'errors[]', failedCount: data.errors.length, sample: pick(data.errors) }
  }
  // `successCount` + `failCount` 形态（没有明细数组时的兜底）
  const failCount = [data.failCount, data.failedCount, data.fail].find((v) => typeof v === 'number')
  if (typeof failCount === 'number' && failCount > 0) {
    return {
      kind: 'failCount',
      failedCount: failCount,
      sample: `successCount=${data.successCount ?? '?'} failCount=${failCount}`
    }
  }
  return null
}

/**
 * 在页面上注册全部捕获通道
 *
 * @param {import('playwright').Page} page - Playwright 页面对象
 * @param {object} [options] - 配置
 * @param {string} [options.tag] - 标识前缀（模块名/功能号），用于截图命名
 * @param {boolean} [options.screenshot] - 失败时是否自动截图，默认 true
 * @param {string} [options.shotDir] - 截图输出目录，默认 tests/e2e/screenshots
 * @param {number} [options.slowMs] - 慢请求阈值
 * @returns {object} 捕获中枢（hub）
 */
export function createCaptureHub(page, options = {}) {
  const {
    tag = 'x',
    screenshot: enableShot = true,
    shotDir = path.join(process.cwd(), 'tests', 'e2e', 'screenshots'),
    slowMs = SLOW_REQUEST_MS
  } = options

  /** 最近 Toast 文本（最新在后） */
  const toasts = []
  /** 最近失败请求 {method,url,status,body} */
  const netFails = []
  /** 批七十九：HTTP 200 但响应体带失败明细的**写请求**（部分失败静默族） */
  const bizPartials = []
  /** 最近慢请求 {method,url,ms} */
  const slowReqs = []
  /** 最近 console error / pageerror */
  const consoleErrs = []
  /** 被吞掉的异常 {label,message,at} */
  const swallowed = []
  /** 待补写取证上下文的失败条目 */
  const pendingFailures = []
  /** Toast 回传通道名（每页唯一，避免多页互相覆盖） */
  const bindingName = `__captureToast_${Math.random().toString(36).slice(2, 8)}`

  // ---- ① Toast / Notification / MessageBox 文本回传 ----
  // exposeBinding 必须在页面导航前注册；回调在 Node 侧执行，因此 toasts 始终最新。
  // 注意：exposeBinding 属于 BrowserContext（不是 Page），必须先取 context()
  const initPromise = page
    .context()
    .exposeBinding(bindingName, (_source, text) => {
      if (typeof text === 'string' && text.trim()) {
        toasts.push(text.trim().replace(/\s+/g, ' ').slice(0, 200))
        if (toasts.length > 30) toasts.shift()
      }
    })
    .catch(() => {})
    .then(() =>
      page.addInitScript(
        ([name]) => {
          const seen = new WeakSet()
          const report = (el) => {
            if (!el || seen.has(el)) return
            seen.add(el)
            const text = (el.innerText || el.textContent || '').trim()
            if (text) window[name](text)
          }
          const scan = () => {
            const sels = '.el-message, .el-notification, .el-message-box, .el-dialog__body .el-result__title'
            document.querySelectorAll(sels).forEach(report)
          }
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scan)
          } else {
            scan()
          }
          const mo = new MutationObserver((muts) => {
            for (const m of muts) {
              for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue
                if (n.matches?.('.el-message, .el-notification, .el-message-box')) report(n)
                const inner = n.querySelector?.('.el-message, .el-notification, .el-message-box')
                if (inner) report(inner)
              }
            }
          })
          // 注意：addInitScript 在文档创建之前执行，此时 documentElement/body 可能仍为 null，
          // 直接 observe 会抛 "parameter 1 is not of type 'Node'"（该错误会污染「无控制台错误」断言）。
          // document 本身恒为合法 Node，故以它为观察根节点。
          mo.observe(document, { childList: true, subtree: true })
        },
        [bindingName]
      )
    )
    .catch(() => {})

  // ---- ② 失败请求（含响应体 msg）+ ③ 慢请求 + ⑦ 每动作请求数分布（批七十四 T5）----
  const startedAt = new Map()
  /**
   * 每动作请求数：`当前动作标签` × `方法 + 归一化端点` → 次数。
   *
   * 为什么本批**只采集不判红**（b73 §5.3-4 移交项）：现有 11 路捕获没有一路监
   * "同一个页面动作发出了几次同类请求"，而重复提交/循环触发/守卫失效正是这一形状。
   * 没有实测分布就设阈值，等于再造一条噪声通道污染 `❌0` 基线——所以先落盘分布，
   * 阈值由数据定下一次再升级为硬判据。归一化沿用日志聚合口径（数字/UUID → N），
   * 否则 `/system/user/12` 与 `/system/user/13` 会被算成两种端点。
   */
  const requestCounts = new Map()
  let actionTag = 'load'
  /**
   * **文档级导航计数**（b79 收口第三轮，N-13 的采集前提）。一个模块的 `load` 桶里
   * "某端点被打 103 次"同时受两件事驱动：**这个模块访问了几页** 与 **机器快慢（轮询轮次）**，
   * 所以对总数设阈值一定随环境翻红（b74 实测 Top8 全是这一类，因此当时只落盘不判）。
   * 唯一能洗掉"页数"因子的分母是导航数 ⇒ 在这里采出来，由 `request-storm.mjs` 按
   * `次数 / max(1, 导航数)` 判。`framenavigated` 对**每个 frame**都触发，只有 main frame
   * 的 http(s) 导航才算"访问了一个页面"（子 iframe、`about:blank` 一律不计——
   * 少计会让密度偏高，属可发现的错；把非页面事件计进去会让密度偏低，属发现不了的错）。
   */
  let navCount = 0
  page.on('framenavigated', (frame) => {
    try {
      if (frame !== page.mainFrame()) return
      const proto = new URL(frame.url()).protocol
      if (proto === 'http:' || proto === 'https:') navCount += 1
    } catch {
      /* 解析不出 URL 的导航不计（见上：宁可少计） */
    }
  })
  const normalizeEndpoint = (url) => {
    let pathname = url
    const q = pathname.indexOf('?')
    if (q >= 0) pathname = pathname.slice(0, q)
    try {
      pathname = new URL(pathname).pathname
    } catch {
      /* 相对路径形态（非本项目入参），原样使用 */
    }
    return pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'N').replace(/\d+/g, 'N')
  }
  page.on('request', (req) => {
    startedAt.set(req, Date.now())
    const key = `${actionTag} | ${req.method()} ${normalizeEndpoint(req.url())}`
    requestCounts.set(key, (requestCounts.get(key) || 0) + 1)
  })
  page.on('response', async (resp) => {
    try {
      const req = resp.request()
      const t0 = startedAt.get(req)
      if (t0) {
        const ms = Date.now() - t0
        if (ms >= slowMs) {
          slowReqs.push({ method: req.method(), url: resp.url(), ms })
          if (slowReqs.length > 20) slowReqs.shift()
        }
        startedAt.delete(req)
      }
      if (resp.status() >= 400) {
        // 只在失败时读 body：成功请求读 body 会拖慢整体运行
        const body = await resp.text().catch(() => '')
        netFails.push({
          method: req.method(),
          url: resp.url().replace(/\?.*$/, '?…'),
          status: resp.status(),
          body: (body || '').replace(/\s+/g, ' ').slice(0, BODY_SNIPPET_MAX)
        })
        // 上限 200（原 30）：汇总阶段要拿失败请求与负路径断言**逐条对账**，
        // 截断样本会让"11 条只显示 4 条"这类观测缺口无法闭合（b73 轮 14 实证）。
        if (netFails.length > NET_FAIL_LIMIT) netFails.shift()
      } else if (WRITE_METHODS.has(req.method().toUpperCase())) {
        // 批七十九：写请求的 200 响应才读体（读接口一律不读，控制成本），
        // 用来抓"整体成功、局部失败"这一族——它在 HTTP 层完全隐形。
        const head = await resp
          .text()
          .then((t) => t.slice(0, PARTIAL_BODY_MAX + 1))
          .catch(() => '')
        const hit = detectPartialFailure(req.method(), resp.status(), resp.headers()['content-type'] || '', head)
        if (hit) {
          bizPartials.push({
            method: req.method(),
            url: resp.url().replace(/\?.*$/, '?…'),
            status: resp.status(),
            ...hit,
            at: actionTag
          })
          if (bizPartials.length > NET_FAIL_LIMIT) bizPartials.shift()
        }
      }
    } catch {
      /* 捕获通道自身不得影响测试执行 */
    }
  })

  // ---- ④ console error / pageerror 镜像 ----
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return
    const text = msg.text()
    if (!text) return
    consoleErrs.push(`[${msg.type()}] ${text.slice(0, 200)}`)
    if (consoleErrs.length > 40) consoleErrs.shift()
  })
  page.on('pageerror', (err) => {
    consoleErrs.push(`[pageerror] ${String(err?.message || err).slice(0, 200)}`)
    if (consoleErrs.length > 40) consoleErrs.shift()
  })

  /**
   * 记录一处「被吞掉的异常」（供 .catch(() => {}) 位置调用）
   *
   * @param {string} label - 发生位置标签（如 'M12.closeDialog'）
   * @param {unknown} err - 错误对象
   */
  function noteSwallowed(label, err) {
    swallowed.push({ label, message: String(err?.message || err).slice(0, 160), at: Date.now() })
    if (swallowed.length > 60) swallowed.shift()
  }

  /**
   * 包装一个 promise，吞掉异常但留下证据（替代裸 `.catch(() => {})`）
   *
   * @template T
   * @param {Promise<T>} promise - 可能失败的 promise
   * @param {string} label - 位置标签
   * @param {T} [fallback] - 失败时的返回值
   * @returns {Promise<T|undefined>}
   */
  async function swallow(promise, label, fallback = undefined) {
    try {
      return await promise
    } catch (err) {
      noteSwallowed(label, err)
      return fallback
    }
  }

  /**
   * 断言失败时登记取证（同步，可在 record() 内直接调用）
   * 立即写入同步可得的证据（Toast / 失败请求 / 慢请求 / console），
   * 并把条目放入 pendingFailures 等待异步补写 URL / 文本 / 截图。
   *
   * @param {object} entry - results 中的条目对象（会被就地补充 evidence 字段）
   * @returns {object} entry 本身，便于链式使用
   */
  function noteFailure(entry) {
    if (!entry) return entry
    const recentToasts = toasts.slice(-EVIDENCE_LIMIT)
    const recentNet = netFails.slice(-EVIDENCE_LIMIT)
    const recentSlow = slowReqs.slice(-EVIDENCE_LIMIT)
    const recentConsole = consoleErrs.slice(-EVIDENCE_LIMIT)
    const parts = []
    if (recentToasts.length) parts.push(`toast=[${recentToasts.join(' | ')}]`)
    if (recentNet.length) {
      parts.push(
        `net=[${recentNet.map((n) => `${n.method} ${n.status} ${n.url}${n.body ? ` :: ${n.body.slice(0, 160)}` : ''}`).join(' | ')}]`
      )
    }
    if (recentConsole.length) parts.push(`console=[${recentConsole.join(' | ')}]`)
    if (recentSlow.length) parts.push(`slow=[${recentSlow.map((s) => `${s.ms}ms ${s.url}`).join(' | ')}]`)
    entry.evidence = parts.join(' ;; ')
    pendingFailures.push(entry)
    if (pendingFailures.length > 40) pendingFailures.shift()
    return entry
  }

  /**
   * 在异步点补写失败条目的上下文（URL / 页面文本 / 登录态 / 截图）
   * 必须在同一个 page 仍然打开时调用（通常在每个模块/功能结束后）。
   *
   * @param {string} [flushTag] - 截图名前缀
   * @returns {Promise<number>} 本次补写的条目数
   */
  async function flush(flushTag = tag) {
    if (!pendingFailures.length) return 0
    const batch = pendingFailures.splice(0, pendingFailures.length)
    let url = ''
    let text = ''
    let token = ''
    try {
      const snap = await page.evaluate(() => ({
        url: location.href,
        text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, TEXT_SNIPPET_MAX),
        token: !!(
          localStorage.getItem('Admin-Token') ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('Admin-Token')
        )
      }))
      url = snap.url
      text = snap.text
      token = snap.token ? 'yes' : 'no'
    } catch {
      /* 页面已关闭则跳过取证 */
    }
    let shotPath = ''
    if (enableShot) {
      try {
        if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true })
        shotPath = path.join(shotDir, `fail-${flushTag}-${Date.now()}.png`)
        await page.screenshot({ path: shotPath, fullPage: false })
      } catch {
        shotPath = ''
      }
    }
    for (const entry of batch) {
      const extras = []
      if (url) extras.push(`url=${url}`)
      extras.push(`token=${token || 'unknown'}`)
      if (text) extras.push(`pageText="${text}"`)
      if (shotPath) extras.push(`shot=${path.basename(shotPath)}`)
      entry.evidence = `${entry.evidence || ''}${entry.evidence ? ' ;; ' : ''}${extras.join(' ;; ')}`
    }
    return batch.length
  }

  /**
   * 输出本次运行被吞掉的异常汇总（用于发现 .catch 掩盖的真问题）
   *
   * @returns {string[]} 汇总行
   */
  function swallowedReport() {
    if (!swallowed.length) return []
    const byLabel = new Map()
    for (const s of swallowed) {
      const cur = byLabel.get(s.label) || { count: 0, sample: s.message }
      cur.count++
      byLabel.set(s.label, cur)
    }
    return Array.from(byLabel.entries()).map(([label, v]) => `    · ${label} ×${v.count} — ${v.sample}`)
  }

  return {
    /** 归属标签（M<id>）：汇总阶段把失败请求归因到模块，负路径对账才能逐条闭合 */
    tag,
    initPromise,
    toasts,
    netFails,
    bizPartials,
    slowReqs,
    consoleErrs,
    swallowed,
    noteFailure,
    noteSwallowed,
    swallow,
    flush,
    swallowedReport,
    /** 当前失败请求条数（供汇总判断） */
    get netFailCount() {
      return netFails.length
    },
    /** 本轮该 hub 的**文档级导航数**（`request-storm` 的每导航均值分母） */
    get navCount() {
      return navCount
    },
    /** 「200 但部分失败」条数（枚举 + 逐条对账，不单独判红） */
    get bizPartialCount() {
      return bizPartials.length
    },
    /** 批七十四 T5：标记"从现在起的请求属于哪个动作"（用例在动作前调用一次） */
    beginAction(name) {
      actionTag = String(name || 'unnamed').slice(0, 60)
    },
    /** 批七十四 T5：本轮 `(动作, 方法 端点)` 请求数分布快照（按次数降序） */
    requestStatSnapshot() {
      return Array.from(requestCounts.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    }
  }
}

/**
 * 后端日志行首的 tracing 时间戳（UTC RFC3339，可带 6 位小数）→ epoch ms。
 * 解析不出来返回 NaN（调用方按"不可归因"处理，宁可丢弃也不要把历史行当本轮信号）。
 */
function parseLogTimestamp(line) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?/.exec(line)
  if (!m) return NaN
  // 无时缀的日志行按 UTC 解释（后端 tracing 层输出 naive-UTC，与项目时间基一致）
  return Date.parse(`${m[1]}T${m[2]}${m[3] || 'Z'}`)
}

/**
 * 默认聚合键归一（b73 轮 9）：削 ANSI → 削时间戳 → 归一 request_id / UUID / 数字。
 * 不做这层归一时，同一个消息形状会因每请求不同的 request_id 裂成"一条一种"，
 * 实测 unscoped 438 行聚成 766 型（几乎每型 ×1），计数排序失去"抓高频共性问题"的意义。
 * 先削 ANSI：修复前落盘的历史日志里 `request_id` 两侧带 ESC 码，不归一就匹配不到
 * `request_id=` 前缀（product 侧已在 logger.rs 关闭 span 层 ANSI，这里是消费端的纵深防御，
 * 让历史日志与新日志一样可聚合）。
 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g
const DEFAULT_KEY_SANITIZER = (line) =>
  line
    .replace(ANSI_RE, '')
    .replace(/^\d{4}-\d{2}-\d{2}[T\s][\d:.,]+Z?\s*/, '')
    .replace(/request_id=[0-9a-fA-F-]+/g, 'request_id=N')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'N')
    .replace(/\d+/g, 'N')
    .slice(0, 160)

/**
 * 汇总后端日志中的 ERROR / 异常 WARN（跨脚本共用）
 *
 * 从给定日志目录读取 app.log*，抽取 ERROR/WARN 行并去重计数。
 * 未找到日志时返回空结构（不报错，避免日志缺失导致测试失败）。
 *
 * **b73 轮 9 窗口化改造**：原先"读最新两个文件全量 + 聚合"会把**历史轮次/历史日期**的
 * ERROR 混进本轮报告（实证：模块 29 轮次报出 ×9 `tower_http on_failure 503`，逐条核对
 * 时间戳全属 2026-10-15，与本轮无关，白白消耗一轮归因）。现在：
 *   - 传 `sinceMs`（本轮开跑时刻）⇒ 只统计时间戳落在窗口内的行，窗口前条目单独计数回报；
 *   - 文件选择按 mtime 过滤（历史滚动文件整体不读，省 IO 且消除跨轮误读），
 *     仍覆盖"轮次内跨零点滚动"的多文件场景；
 *   - 不传 sinceMs 时保持旧行为（全量尾部），供人工巡检历史使用。
 * 原先 main.mjs 里另有一份"尾部 800 行"实现，两份口径会漂移且长轮次漏读；
 * 现 main.mjs 改为调用本函数（`warnPattern` 保留其"只报可疑 WARN"的窄口径）。
 *
 * @param {object} [options] - 配置
 * @param {string} [options.logDir] - 日志目录，默认 `resolveBackendLogDir()`（锚定文件位置，非 cwd）
 * @param {number} [options.maxLines] - 最多返回行数，默认 20
 * @param {number|null} [options.sinceMs] - 窗口起点（epoch ms）；null = 不过滤
 * @param {RegExp|null} [options.warnPattern] - WARN 行需命中的关键词；null = 全部 WARN 都算
 * @param {Function|null} [options.keySanitizer] - 聚合键定制（默认归一 request_id/UUID/数字后截断）
 * @returns {{lines: string[], items: Array<[string, number]>, total: number, excluded: number, files: string[], windowStart: number|null, missing: boolean, logDir: string}}
 */
export function summarizeBackendLogErrors(options = {}) {
  const {
    logDir = resolveBackendLogDir(),
    maxLines = 20,
    sinceMs = null,
    warnPattern = null,
    keySanitizer = null
  } = options
  // missing=true 表示"目录读不到 / 无 app.log 文件"——这是**捕获通道失效**，
  // 与"通道正常但本轮无异常"（missing=false, total=0）是两种完全不同的结论，
  // 调用方必须把前者打印出来，不得当成"干净"。（b73 轮 10 的静默失效就是这么漏掉的）
  const empty = {
    lines: [],
    items: [],
    total: 0,
    excluded: 0,
    files: [],
    windowStart: sinceMs ?? null,
    missing: true,
    logDir
  }
  let files = []
  try {
    files = fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith('app.log'))
      .map((f) => ({ f, p: path.join(logDir, f), m: fs.statSync(path.join(logDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
  } catch {
    return empty
  }
  if (!files.length) return empty
  // 时钟对齐容差：日志写盘与本地时钟可能有秒级偏差，窗口起点前 5 分钟内的文件仍要读
  const SKEW_MS = 5 * 60 * 1000
  const targets = sinceMs == null ? files.slice(0, 2) : files.filter((x) => x.m >= sinceMs - SKEW_MS).slice(0, 3)
  if (!targets.length) return empty
  const lines = []
  for (const { p } of targets) {
    try {
      const content = fs.readFileSync(p, 'utf8')
      lines.push(...content.split('\n'))
    } catch {
      /* 忽略不可读日志 */
    }
  }
  const isLevel = (l) => /\bERROR\b/.test(l) || (/\bWARN\b/.test(l) && (!warnPattern || warnPattern.test(l)))
  const hits = []
  let excluded = 0
  for (const l of lines) {
    if (!isLevel(l)) continue
    if (sinceMs == null) {
      hits.push(l)
      continue
    }
    const ts = parseLogTimestamp(l)
    if (Number.isFinite(ts) && ts >= sinceMs) hits.push(l)
    else excluded += 1 // 无时间戳或窗口前 ⇒ 不可归因，不计入本轮
  }
  const counter = new Map()
  const keyOf = keySanitizer || DEFAULT_KEY_SANITIZER
  for (const l of hits) {
    const key = keyOf(l)
    counter.set(key, (counter.get(key) || 0) + 1)
  }
  const items = Array.from(counter.entries()).sort((a, b) => b[1] - a[1])
  return {
    lines: items.slice(0, maxLines).map(([text, n]) => `    · ×${n} ${text}`),
    items,
    total: hits.length,
    excluded,
    files: targets.map((x) => x.f),
    windowStart: sinceMs ?? null,
    missing: false,
    logDir
  }
}
