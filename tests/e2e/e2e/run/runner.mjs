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
import { fileURLToPath } from 'node:url'
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

/** SKIP 棘轮基线文件（与套件同目录，提交进仓；只允许下降） */
// 必须用 fileURLToPath 把 `file:///…` 转成真实路径：此前直接 `path.dirname(import.meta.url)`
// 在 Windows 上产出 `…\tests\e2e\file:\D:\…\deep-e2e-skip-baseline.json`，`existsSync` 恒 false
// ⇒ 每次都走"基线缺失，本轮不强制"分支，棘轮从 b74 起**从未真正生效**（b78 全量跑批实证：
// 41 SKIP 低于 48 基线却只打印"缺失"）。判据"没跑"与"跑了且干净"必须可区分。
const SKIP_BASELINE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'deep-e2e-skip-baseline.json'
)

/** 读基线；文件不存在返回 null（调用方据此"不强制但响亮提示"，不得静默当 0） */
function readSkipBaseline() {
  try {
    const raw = JSON.parse(fs.readFileSync(SKIP_BASELINE_PATH, 'utf-8'))
    return typeof raw.total === 'number' ? raw.total : null
  } catch {
    return null
  }
}

/**
 * SKIP 棘轮的比较式（抽成纯函数供自检直接调用，`--gate` 语义与收紧入口共用同一份）。
 * 返回 `{ ratchetBroken, writeAllowed }`：
 *  - `ratchetBroken`：本轮 SKIP **高于**基线 ⇒ 判红（只许降不许升）。
 *  - `writeAllowed` ：收紧入口能否回写。基线缺失时可写（首次生成）；否则只允许**持平或下降**。
 * 两者必须分开：`skipRatchetBroken` 只影响退出码，而退出码只活在这次终端里；
 * 若在退步轮上照样回写，基线文件本身就被抬高了，下一轮读到的是被放松后的新天花板。
 * 非数值一律视为退步（"取不到数"不得读成"没有退步"）。
 */
export function skipRatchet(baseline, now) {
  if (typeof now !== 'number') {
    // 本轮取不到数 = 判据断电 ⇒ fail-closed，不得读成"没有退步"
    return { ratchetBroken: true, writeAllowed: false }
  }
  if (typeof baseline !== 'number') {
    // 基线缺失/不可读：本轮就是来生成它（调用方另外负责"没带 --update-skip-baseline 就判红"）
    return { ratchetBroken: false, writeAllowed: true }
  }
  return { ratchetBroken: now > baseline, writeAllowed: now <= baseline }
}

/** 写基线（`--update-skip-baseline` 专用：跑完一轮全量后收紧棘轮） */
function writeSkipBaseline(total, at) {
  fs.writeFileSync(
    SKIP_BASELINE_PATH,
    `${JSON.stringify({ total, generatedAt: new Date().toISOString(), note: at }, null, 2)}\n`,
    'utf-8'
  )
}
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
  /**
   * 本轮窗口起点（b73 轮 9）：后端日志摘要只统计此刻之后的 ERROR/WARN。
   * 取 runMain 入口而非模块循环起点，确保浏览器启动/登录阶段的日志同样可归因。
   */
  const roundStartMs = Date.now()

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
      log(`────── 模块 ${id} 结束：✅ ${stat.pass} / ❌ ${stat.fail}${stat.error ? '（含执行异常）' : ''} ──────`)
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

  // ==================== 批七十四 T2/T3：SKIP 必须分类，"工具坏了"不得洗成 SKIP ====================
  //
  // 历史形状：`catch ⇒ recordSkip('探针/导航自身异常')`。断言工具自己抛错时**什么都不知道**，
  // 却把一个 SKIP 记进"1053✅ / ❌0"的绿基线里——harness 永久坏掉，套件永远全绿。
  // 现在按 reason 分两桶：
  //   · TOOL_BROKEN（探针/导航/断言工具/evaluate 自身异常）⇒ **必须为 0**，否则退出码 1；
  //   · 业务跳过（无数据 / 能力位关 / 环境未启用）⇒ 计入 SKIP 棘轮基线。
  // 棘轮只在**全量跑批**上强制：分段跑的 skip 数是子集，与全量基线不可比（比较即假信号）。
  const skipRows = results.filter((r) => r.passed === null)
  const TOOL_BROKEN_RE = /探针自身异常|导航自身异常|断言工具异常|evaluate 失败|工具异常|harness/
  const toolBroken = skipRows.filter((r) => TOOL_BROKEN_RE.test(String(r.detail || '')))
  const businessSkip = skipRows.length - toolBroken.length
  const isFullRun = !config.featureFilter && !config.featureRange && !(config.except && config.except.length > 0)
  log(
    `SKIP 分桶: 业务跳过 ${businessSkip} / 工具自曝 ${toolBroken.length}` +
      `${isFullRun ? '' : '（分段跑，棘轮不强制）'}`
  )
  if (toolBroken.length > 0) {
    log('❌ 工具自曝明细（这些 SKIP 不代表产品状态，必须修 harness 或让断言真判红）:')
    for (const r of toolBroken.slice(0, 20)) {
      log(`  · [M${r.module}] ${r.name} — ${String(r.detail || '').slice(0, 120)}`)
    }
  }
  // SKIP 棘轮：基线只允许下降（新增跳过＝有断言被降级成"不算失败"）
  // 比较式一律走 `skipRatchet`（与收紧入口、自检同源），本处只做"打印哪种文案"
  let skipRatchetBroken = false
  if (isFullRun) {
    const baseline = readSkipBaseline()
    const verdict = skipRatchet(baseline, skipRows.length)
    if (baseline === null) {
      // 基线缺失 = 棘轮**没有跑**，不能记成"通过"（b78 前此处只打 ⚠ 不判红，
      // 而路径 bug 让它恒缺 ⇒ 棘轮静默空转了一整批）。唯一例外：本次就是来生成基线的。
      // 这一支的判红**与 skipRatchet 无关**（它对"基线缺失"给的是 writeAllowed=true，
      // 语义是"允许首建"，不是"允许通过"）——抽比较式时别把它一起抽掉。
      if (config.updateSkipBaseline) {
        log('ℹ SKIP 棘轮基线缺失，本轮按 --update-skip-baseline 生成')
      } else {
        skipRatchetBroken = true
        log(
          `❌ SKIP 棘轮基线缺失/不可读（${SKIP_BASELINE_PATH}）——判据没有跑，` +
            `不得记为通过；生成：node tests/e2e/deep-e2e.mjs --update-skip-baseline`
        )
      }
    } else if (verdict.ratchetBroken) {
      skipRatchetBroken = true
      log(`❌ SKIP 棘轮回退：本轮 ${skipRows.length} > 基线 ${baseline}（只许降不许升）`)
    } else if (skipRows.length < baseline) {
      log(
        `✅ SKIP 低于基线（${skipRows.length} < ${baseline}）——请 ` +
          `node tests/e2e/deep-e2e.mjs --update-skip-baseline 收紧基线`
      )
    }
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
    // 旧写法每个 hub 只取最后 2 条、再整体截到 12 行 → "总数 11"只显示 4 行，
    // 而门禁判据是"失败请求须与负路径断言逐条对账"，抽样打印使它无法执行（b73 轮 14 实证观测缺口）。
    // 现在按模块归因全量列出（同 hub 内同 URL+状态重复计数由聚合行给出），并全量落盘供轮后复核。
    const kinds = new Map()
    for (const h of hubs) {
      for (const n of h.netFails || []) {
        const key = `${h.tag || 'x'}|${n.method} ${n.status} ${n.url} ${n.body || ''}`
        kinds.set(key, (kinds.get(key) || 0) + 1)
      }
    }
    const lines = [...kinds.entries()].map(([key, count]) => {
      const at = key.indexOf('|')
      const tag = key.slice(0, at)
      const rest = key.slice(at + 1)
      return `    · [${tag}] ${rest}${count > 1 ? ` ×${count}` : ''}`
    })
    const NET_PRINT_CAP = 60
    for (const s of lines.slice(0, NET_PRINT_CAP)) log(s)
    if (lines.length > NET_PRINT_CAP) {
      log(`    · （其余 ${lines.length - NET_PRINT_CAP} 种已折叠，全量见 net 清单 JSON）`)
    }
    try {
      const netDump = []
      for (const h of hubs) for (const n of h.netFails || []) netDump.push({ tag: h.tag || 'x', ...n })
      const netPath = path.join(config.screenshotDir, `deep-e2e-net-${Date.now()}.json`)
      fs.writeFileSync(netPath, JSON.stringify(netDump, null, 2), 'utf-8')
      log(`失败请求全量清单已写入: ${netPath}`)
    } catch {
      log('⚠️ 失败请求清单写盘失败（不影响退出码）')
    }
  }
  // 批七十九新增捕获面：HTTP 200 但响应体里写着"一部分失败"的写请求。
  // 这一族对 netFails（只看 >=400）、body.code（只看非 200）与 Toast 全都隐形，
  // 典型是批量接口"整体 200 + 逐项结果"（如 batchLogout 的 `{successCount, failed:[…]}`）。
  // 与失败请求同口径：**枚举 + 逐条对账**，不单独判红（负路径用例本来就会故意造部分失败）。
  const partialRows = []
  for (const h of hubs) for (const p of h.bizPartials || []) partialRows.push({ tag: h.tag || 'x', ...p })
  log(`部分失败响应（HTTP 200 且 body 带失败明细）总数: ${partialRows.length}`)
  if (partialRows.length > 0) {
    const pkinds = new Map()
    for (const p of partialRows) {
      const key = `${p.tag}|${p.method} ${p.status} ${p.url}|${p.kind}|${p.at || 'load'}`
      const cur = pkinds.get(key)
      if (cur) cur.n++
      else pkinds.set(key, { n: 1, sample: p.sample })
    }
    // 键里已含"模块|方法 状态 端点|形态|所属动作"，样本单独带一份失败明细首两项
    for (const [key, v] of [...pkinds.entries()].sort((a, b) => b[1].n - a[1].n)) {
      log(`    · ${key} ×${v.n} — ${v.sample}`)
    }
    try {
      const pPath = path.join(config.screenshotDir, `deep-e2e-partial-${Date.now()}.json`)
      fs.writeFileSync(pPath, JSON.stringify(partialRows, null, 2), 'utf-8')
      log(`部分失败全量清单已写入: ${pPath}`)
    } catch {
      log('⚠️ 部分失败清单写盘失败（不影响退出码）')
    }
  }
  // ==================== 批七十四 T5：每动作请求数分布落盘（只采集，不判红）====================
  // 阈值必须由实测分布定，所以先把全轮数据写出来；本文件不进退出码判据。
  try {
    const reqStats = []
    for (const h of hubs) {
      if (typeof h.requestStatSnapshot !== 'function') continue
      for (const row of h.requestStatSnapshot()) reqStats.push({ tag: h.tag || 'x', navs: h.navCount ?? 0, ...row })
    }
    reqStats.sort((a, b) => b.count - a.count)
    // **全量轮与分段轮写不同文件**（b79）：本文件是将来"接口风暴"判据的唯一数据源，
    // 若单模块复跑（`--feature=25`）也往同一个路径写，就会把全站分布覆盖成 27 行——
    // 实测踩过：本批为验证 M25 重写而单跑一轮，`deep-e2e-reqstats.json` 只剩 M25 的动作。
    // 与 `collect-warnings` 基线的 `full: true`、`tenant-audit.incremental.*` 同口径：
    // "没跑全量"与"跑了且干净"必须可区分，且部分数据不得覆盖全站数据。
    const reqPath = path.join(
      config.screenshotDir,
      isFullRun ? 'deep-e2e-reqstats.json' : 'deep-e2e-reqstats.incremental.json'
    )
    /**
     * 本轮请求窗口（UTC 裸文本，与 `sys_oper_log.oper_time` 同口径——实测该列是 UTC：
     * `max(oper_time)=2026-10-20 02:29` 而本地是 10:29）。写进数据集，`endpoint-coverage`
     * 因此能**自己取窗口**做服务端触达对账，而不必让人手抄时间串（抄错方向就是把窗口
     * 前挪 8 小时，b79 实测这类错误在两条判据上都出现过）。
     */
    const utcNaive = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
    fs.writeFileSync(
      reqPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          full: isFullRun,
          windowStart: utcNaive(roundStartMs),
          windowEnd: utcNaive(Date.now()),
          rows: reqStats
        },
        null,
        2
      ),
      'utf-8'
    )
    const top = reqStats
      .slice(0, 8)
      .map((r) => `[${r.tag}] ${r.key} ×${r.count}`)
      .join('\n')
    log(`每动作请求数分布已落盘（共 ${reqStats.length} 类，Top8:\n${top}\n）: ${reqPath}`)
  } catch (e) {
    log(`⚠ 请求数分布写盘失败（不影响退出码）: ${e.message}`)
  }

  log(`被吞掉的异常种类: ${swallowedLines.length}`)
  // 被"收窄后仍放行"的噪声也要报数：放行不等于消失（b78 收窄了 IMG 全量豁免）
  if (typeof state.getAvatarImgNoise === 'function') {
    const n = state.getAvatarImgNoise()
    if (n > 0) log(`已放行的头像空 src 噪声: ${n} 条（IMG→/user/profile，见 deep-e2e.mjs 头部说明）`)
  }
  for (const s of swallowedLines.slice(0, 20)) log(s)
  try {
    const backend = summarizeBackendLogErrors({ sinceMs: roundStartMs })
    if (backend.missing) {
      log(`⚠️ 后端日志捕获通道失效：目录不可读或无 app.log（${backend.logDir}）——本轮后端异常未采集`)
    } else {
      log(
        `后端日志 ERROR/WARN 种类: ${backend.lines.length}（本轮窗口 ${backend.files.join(' + ') || '无文件'}，` +
          `窗口内 ${backend.total} 条 / 窗口前已排除 ${backend.excluded} 条）`
      )
      for (const s of backend.lines.slice(0, 20)) log(s)
    }
  } catch {
    log('后端日志摘要不可用（跳过）')
  }

  // 棘轮收紧入口（跑完一轮**全量**后执行）：把实测 SKIP 写回基线
  if (config.updateSkipBaseline) {
    if (!isFullRun) {
      log('❌ --update-skip-baseline 只允许在**全量跑批**上使用（分段跑的 SKIP 是子集，写进去等于放松基线）')
      return 2
    }
    // **只许降**必须由写入这一步自己守住：上面 `skipRows.length > baseline` 已经置了
    // skipRatchetBroken（退出码会非 0），但原写法仍会先无条件回写文件 ⇒ 一次"红着的收紧跑批"
    // 就把基线抬高了一格，而退出码 1 只活在这次终端里，下一次跑批读到的是被放松后的新基线。
    // 这类"失败路径上仍然落盘"正是棘轮被静默放松的唯一通道（b79 自查发现）。
    const prev = readSkipBaseline()
    if (!skipRatchet(prev, skipRows.length).writeAllowed) {
      log(
        `❌ 拒绝放松棘轮：本轮 SKIP ${skipRows.length} > 基线 ${prev}，基线文件**未改动**。` +
          `先查多出来的 SKIP 是"判据没执行"还是"环境缺失"，修完再收紧`
      )
      return 1
    }
    writeSkipBaseline(skipRows.length, 'deep-e2e 全量实测')
    log(`✅ SKIP 棘轮基线已更新为 ${skipRows.length}`)
  }

  return totalFail > 0 || toolBroken.length > 0 || skipRatchetBroken ? 1 : 0
}
