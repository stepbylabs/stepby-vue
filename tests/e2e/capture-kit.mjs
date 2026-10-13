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

/** 响应体截取长度上限（避免报告过大） */
const BODY_SNIPPET_MAX = 500
/** 页面文本截取长度上限 */
const TEXT_SNIPPET_MAX = 400
/** 慢请求阈值（毫秒） */
const SLOW_REQUEST_MS = 3000
/** 每条失败条目最多附带的证据条数 */
const EVIDENCE_LIMIT = 3

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

  // ---- ② 失败请求（含响应体 msg）+ ③ 慢请求 ----
  const startedAt = new Map()
  page.on('request', (req) => {
    startedAt.set(req, Date.now())
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
        if (netFails.length > 30) netFails.shift()
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
    initPromise,
    toasts,
    netFails,
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
    }
  }
}

/**
 * 汇总后端日志中的 ERROR / 异常 WARN（跨脚本共用）
 *
 * 从给定日志目录读取最新的 app.log*，抽取 ERROR/WARN 行并去重计数。
 * 未找到日志时返回空数组（不报错，避免日志缺失导致测试失败）。
 *
 * @param {object} [options] - 配置
 * @param {string} [options.logDir] - 日志目录，默认 stepby-axum/logs
 * @param {number} [options.maxLines] - 最多返回行数，默认 20
 * @returns {string[]} 汇总行（含数量前缀）
 */
export function summarizeBackendLogErrors(options = {}) {
  const {
    logDir = path.resolve(process.cwd(), '..', 'stepby-axum', 'logs'),
    maxLines = 20
  } = options
  let files = []
  try {
    files = fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith('app.log'))
      .map((f) => ({ f, p: path.join(logDir, f), m: fs.statSync(path.join(logDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
  } catch {
    return []
  }
  if (!files.length) return []
  const lines = []
  for (const { p } of files.slice(0, 2)) {
    try {
      const content = fs.readFileSync(p, 'utf8')
      lines.push(...content.split('\n'))
    } catch {
      /* 忽略不可读日志 */
    }
  }
  const hits = lines.filter((l) => /\bERROR\b/.test(l) || /\bWARN\b/.test(l))
  const counter = new Map()
  for (const l of hits) {
    const key = l.replace(/^\d{4}-\d{2}-\d{2}[T\s][\d:.,]+/, '').slice(0, 180)
    counter.set(key, (counter.get(key) || 0) + 1)
  }
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxLines)
    .map(([text, n]) => `    · ×${n} ${text}`)
}
