/**
 * deep-e2e 运行器（runMain）
 *
 * 职责：遍历 deep-e2e.mjs 注册的 testFns（模块 1..N），逐模块创建页面/登录/执行，
 * 汇总 state.results 并输出每模块统计与总计。支持 deep-e2e.mjs 侧已解析的过滤约定：
 *   --headless            无头模式（CONFIG.headless，默认开启）
 *   --headed              显式有头模式（人工观察浏览器时使用）
 *   --feature=N / --module N   只跑单个模块
 *   --range=67-75         跑模块区间
 *   --except=13,29        排除指定模块
 *   --feature=1-20,51     集合过滤（main.mjs 同款语法：逗号分段 + 连字符区间）
 *
 * 韧性约定：连续 2 个模块登录失败即判定登录链路不可用，提前终止剩余模块。
 *
 * 模块签名约定（deep-e2e.mjs）：
 *   标准：  async function testModuleN(page, consoleErrors, pageErrors)
 *   token： async function testModuleN(page, consoleErrors, pageErrors, token)   → 7,12,14,21,26,28,31,32,70
 *   browser：async function testModuleN(browser, consoleErrors, pageErrors)      → 13,29,39,67（自管页面）
 *   第四参 browser：testModule23(page, consoleErrors, pageErrors, browser)
 *
 * 退出码：0 = 全部通过；1 = 存在失败检查。
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { summarizeBackendLogErrors } from '../../capture-kit.mjs'

let chromium
try {
  const require = createRequire(import.meta.url)
  chromium = require('playwright').chromium
} catch {
  const { execSync } = await import('node:child_process')
  const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
  const globalRequire = createRequire(`file://${globalRoot}/_`)
  chromium = globalRequire('playwright').chromium
}

/** 需要 API token 第四参的模块集合 */
const TOKEN_MODULES = new Set([7, 12, 14, 21, 26, 28, 31, 32, 70])
/** 首参为 browser 的模块（自管页面/独立上下文，runner 不提供 page） */
const BROWSER_FIRST_MODULES = new Set([13, 29, 39, 67])
/** 第四参需要 browser 的模块 */
const BROWSER_EXTRA_MODULES = new Set([23])

/** 解析 --feature=1-20,51 同款集合语法 */
function parseFeatureSet(spec) {
  const ids = new Set()
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    for (let i = a; i <= b; i++) ids.add(i)
  }
  return ids.size > 0 ? ids : null
}

/** 依据 CONFIG 过滤器判断模块是否入选 */
function moduleSelected(id, config) {
  if (config.except && config.except.includes(id)) return false
  if (config.featureFilter instanceof Set) return config.featureFilter.has(id)
  if (config.featureFilter != null) return config.featureFilter === id
  if (config.featureRange) {
    const { start, end } = config.featureRange
    return id >= start && id <= end
  }
  return true
}

export async function runMain({ testFns, config, helpers, state }) {
  const { log, ensureDir, login, createPage, getApiToken, record, setHub, createCaptureHub } = helpers
  const { results, getPassCount, getFailCount } = state
  /** 各模块的捕获中枢，汇总阶段统一输出被吞异常与网络失败 */
  const hubs = []

  log('==========================================')
  log('stepby 深度端到端测试（deep-e2e）')
  log('==========================================')
  log(`配置: headless=${config.headless}, 模块总数=${Object.keys(testFns).length}`)

  ensureDir(config.screenshotDir)

  const ids = Object.keys(testFns)
    .map((k) => parseInt(k, 10))
    .filter((id) => moduleSelected(id, config))
    .sort((a, b) => a - b)

  if (ids.length === 0) {
    log('⚠️ 过滤后无模块可执行（检查 --feature/--range/--except 参数）')
    return 1
  }
  log(`待执行模块: ${ids.join(', ')}`)

  const browser = await chromium.launch({
    headless: config.headless !== false,
    slowMo: config.slowMo
  })

  let token = null
  try {
    token = await getApiToken()
  } catch (e) {
    log(`⚠️ 预取 API token 失败（token 类模块将降级）: ${e.message?.slice(0, 80)}`)
  }

  const startedAt = Date.now()
  const moduleStats = [] // { id, pass, fail, error }
  let loginFailStreak = 0 // 连续登录失败计数：≥2 视为环境不可用，提前终止避免全量刷屏

  try {
    for (const id of ids) {
      const fn = testFns[id]
      if (!fn) continue
      const before = results.length
      // 该模块此前的 pass/fail 基线（record 会实时累加全局计数）
      const passBefore = getPassCount()
      const failBefore = getFailCount()
      let errored = false
      log(`\n────── 模块 ${id} 开始 ──────`)
      try {
        if (BROWSER_FIRST_MODULES.has(id)) {
          // 自管页面模块：runner 只提供 browser 与全新错误收集数组
          await fn(browser, [], [])
          loginFailStreak = 0
        } else {
          const { page, consoleErrors, pageErrors } = await createPage(browser)
          // 注入统一信息捕获中枢：失败断言自动附带 Toast / 失败请求 / console 证据
          let hub = null
          if (typeof createCaptureHub === 'function' && typeof setHub === 'function') {
            hub = createCaptureHub(page, { tag: `M${id}`, shotDir: config.screenshotDir })
            hubs.push(hub)
            setHub(hub)
            await hub.initPromise.catch(() => {})
          }
          const loggedIn = await login(page)
          if (!loggedIn) {
            loginFailStreak += 1
            log(`❌ [M${id}] 登录失败，模块整体记为失败`)
            // 走 record 计数（直接 push results 不会累加 failCount，导致 exit 码失真）
            record(id, '登录', false, 'login 失败')
          } else {
            loginFailStreak = 0
            if (TOKEN_MODULES.has(id)) {
              await fn(page, consoleErrors, pageErrors, token)
            } else if (BROWSER_EXTRA_MODULES.has(id)) {
              await fn(page, consoleErrors, pageErrors, browser)
            } else {
              await fn(page, consoleErrors, pageErrors)
            }
          }
          // 模块结束：补写失败条目的 URL / 页面文本 / 截图（须在关闭页面前）
          if (hub) await hub.flush(`M${id}`).catch(() => {})
          if (typeof setHub === 'function') setHub(null)
          // 单模块页面即用即弃，防句柄泄漏
          const ctx = page.context()
          await ctx.close().catch(() => {})
        }
        if (loginFailStreak >= 2) {
          log(
            `\n⛔ 连续 ${loginFailStreak} 个模块登录失败，判定登录链路不可用（检查后端/前端服务、凭据环境变量、验证码配置），提前终止剩余 ${ids.length - ids.indexOf(id) - 1} 个模块`
          )
          break
        }
      } catch (err) {
        errored = true
        results.push({
          module: id,
          name: '模块执行异常',
          passed: false,
          detail: String(err?.message || err).slice(0, 200),
          stack: err?.stack ? String(err.stack).split('\n').slice(0, 15).join('\n') : ''
        })
        log(`❌ [M${id}] 模块执行异常: ${String(err?.message || err).slice(0, 160)}`)
      }
      const stat = {
        id,
        pass: getPassCount() - passBefore,
        fail: getFailCount() - failBefore,
        error: errored
      }
      moduleStats.push(stat)
      log(
        `────── 模块 ${id} 结束：✅ ${stat.pass} / ❌ ${stat.fail}${stat.error ? '（含执行异常）' : ''} ──────`
      )
    }
  } finally {
    await browser.close().catch(() => {})
  }

  // ==================== 汇总 ====================
  const totalPass = getPassCount()
  const totalFail = getFailCount()
  // SKIP 第三态：passed === null，既不计 pass 也不计 fail（不影响退出码，但不再伪装成通过）
  const totalSkip = results.filter((r) => r.passed === null).length
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1)

  log('\n==========================================')
  log('深度端到端测试汇总')
  log('==========================================')
  log(`耗时: ${durationSec}s | 模块: ${moduleStats.length} | 检查: ✅ ${totalPass} / ❌ ${totalFail}`)
  log(`跳过(SKIP): ${totalSkip}`)

  // 按模块分组统计 SKIP，输出最多的前 5 个模块：SKIP 集中处往往是「页面打不开/功能未启用」的真实缺口
  const skipByModule = new Map()
  for (const r of results) {
    if (r.passed !== null) continue
    skipByModule.set(r.module, (skipByModule.get(r.module) || 0) + 1)
  }
  if (skipByModule.size > 0) {
    const topSkip = [...skipByModule.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5)
    log(`SKIP 最多的模块 TOP5: ${topSkip.map(([id, n]) => `M${id}(${n})`).join(', ')}`)
  } else {
    log('SKIP 最多的模块 TOP5: 无')
  }

  const failedModules = moduleStats.filter((s) => s.fail > 0 || s.error)
  if (failedModules.length > 0) {
    log('失败模块明细:')
    for (const s of failedModules) {
      log(
        `  M${s.id}: ❌ ${s.fail}${s.error ? '（执行异常）' : ''} — ${results
          .filter((r) => r.module === s.id && r.passed === false)
          .slice(0, 5)
          .map((r) => r.name)
          .join(' | ')}`
      )
    }
    // 失败检查全量清单落盘，便于复盘（用 === false 排除 SKIP 第三态，避免跳过项混进失败清单）
    const failDump = results.filter((r) => r.passed === false)
    const dumpPath = path.join(config.screenshotDir, `deep-e2e-failures-${Date.now()}.json`)
    try {
      fs.writeFileSync(dumpPath, JSON.stringify(failDump, null, 2), 'utf-8')
      log(`失败清单已写入: ${dumpPath}`)
    } catch {
      log('⚠️ 失败清单写盘失败（不影响退出码）')
    }
  } else {
    log('✅ 全部模块通过')
  }

  // ==================== 信息捕获汇总（被吞异常 / 网络失败 / 后端日志）====================
  // 目的：把 .catch(() => {}) 掩盖的错误、失败请求、后端 ERROR 显式暴露，
  // 避免「断言全绿但底层已经报错」的假绿。
  const swallowedLines = []
  let netFailTotal = 0
  for (const h of hubs) {
    swallowedLines.push(...(h.swallowedReport?.() || []))
    netFailTotal += h.netFails?.length || 0
  }
  log('\n---- 信息捕获汇总 ----')
  log(`失败请求（HTTP>=400）总数: ${netFailTotal}`)
  if (netFailTotal > 0) {
    const samples = []
    for (const h of hubs) {
      for (const n of (h.netFails || []).slice(-2)) {
        samples.push(`    · ${n.method} ${n.status} ${n.url}${n.body ? ` :: ${n.body.slice(0, 120)}` : ''}`)
      }
    }
    for (const s of samples.slice(0, 12)) log(s)
  }
  log(`被吞掉的异常种类: ${swallowedLines.length}`)
  for (const s of swallowedLines.slice(0, 20)) log(s)
  try {
    const backendLines = summarizeBackendLogErrors()
    log(`后端日志 ERROR/WARN 种类: ${backendLines.length}`)
    for (const s of backendLines.slice(0, 20)) log(s)
  } catch {
    log('后端日志摘要不可用（跳过）')
  }

  return totalFail > 0 ? 1 : 0
}
