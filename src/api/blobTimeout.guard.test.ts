/**
 * 静态守卫：**长任务与下载的等待上限必须显式声明**（批九十九）。
 *
 * ## 立的案
 *
 * 全局 axios timeout 是 30s。而备份创建 / 恢复的后端子进程硬超时是 300s
 * （`sys_backup_service.rs::BACKUP_TIMEOUT_SECS`）⇒ 一个**正在正常工作**的大库备份
 * 会在第 30 秒被前端 abort，用户只看到通用错误；更糟的是恢复被 abort 后服务端仍在跑，
 * 用户一重试就撞上「恢复进行中」互斥锁（b99 实测 43MB+ 备份必然超时）。
 * 同一形态在下载族（备份文件 / 归档 JSONL / 审计 CSV / 存储代理文件）也在：
 * 传输时长由文件大小决定，30s 与"文件多大"毫无关系。
 *
 * ## 判据形状（为什么钉常量而不是钉数字）
 *
 * 每个 `responseType: 'blob'` 的请求必须显式写 `timeout: FILE_DOWNLOAD_TIMEOUT`；
 * 长任务端点必须写 `timeout: LONG_TASK_TIMEOUT`。**禁止**写字面量（`30000`/`0`）：
 * 同一个语义的两个数字一旦散落在各 API 文件里，下次调服务端上限时必然只改一处。
 * 时间上限与后端 `BACKUP_TIMEOUT_SECS` 的关系也由本守卫跨仓对账（读不到 Rust 常量
 * 直接失败——"取不到"不得读成"没有约束"）。
 *
 * ## 采集面与掩码
 *
 * b138 起采集面是**全 `src/**`（`.ts` + `.vue`，排除 `*.test.ts`）**。原来只扫 `src/api/**`
 * 是一个代价高昂的盲区：`plugins/download.ts` 的三处 `timeout: 60000` 与 `views/**` 里的
 * 裸 `fetch` 导出通道都不在面内——统一口径是 600_000（10 倍差距），大型下载必然在第 60 秒
 * 被 abort，而守卫一直在报"0 违规"（采集面按目录枚举的老毛病，b83/b89 同族）。
 *
 * 算子也从"匹配 `request(` 调用"改成"**按 `responseType: 'blob'` 所在的对象字面量**判定"：
 * 前者看不见 `axios({...})`、`blobRequest({...})` 这些非 `request(` 形态（正是缺陷藏身处），
 * 后者对所有调用形态一视同仁。注释里写 `responseType: 'blob'` 不算站点（`muteNonCode`
 * 只抹注释、保留字符串——`'blob'` 是字面量，抹掉字符串这条腿就空了）。
 * 对象边界（花括号匹配）另用抹掉字符串的视图，避免 URL/正则里的括号干扰配对。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { muteNonCode } from '@/utils/e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')
const API_DIR = resolve(VUE_ROOT, 'src/api')
const REQUEST_TS = resolve(VUE_ROOT, 'src/utils/request.ts')
// b138：两个等待上限常量移到零依赖的 utils/timeouts（request.ts 仍 re-export）
const TIMEOUTS_TS = resolve(VUE_ROOT, 'src/utils/timeouts.ts')
const AXUM_BACKUP_SERVICE = resolve(VUE_ROOT, '..', 'stepby-axum', 'src', 'service', 'sys_backup_service.rs')
// 长任务档派生输入的第二个预算（IP 库镜像下载）住在这里，不在档位文件里
const AXUM_IP_SERVICE = resolve(VUE_ROOT, '..', 'stepby-axum', 'src', 'service', 'ip_location_service.rs')
// b140：服务端现在有了**分档**的请求层超时，前端等待上限必须比对的是"那一档"，
// 而不是子进程预算——两者的差是 handler 在预算之外的落库/清缓存/审计时间。
const AXUM_REQUEST_TIMEOUT = resolve(VUE_ROOT, '..', 'stepby-axum', 'src', 'middleware', 'request_timeout.rs')

const rel = (p: string) => p.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')

function collectSources(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) collectSources(abs, out)
    else if (
      ent.isFile() &&
      (ent.name.endsWith('.ts') || ent.name.endsWith('.vue')) &&
      !ent.name.endsWith('.test.ts')
    ) {
      out.push(abs)
    }
  }
  return out.sort()
}

/**
 * 扫描一段源码里的 blob 请求配置。
 * `file` 只用于报错文案；纯函数，合成夹具与真实文件共用这一份实现。
 *
 * 判定单位是**含 `responseType: 'blob'` 的对象字面量**（不是某个函数名）：
 * `request({...})` / `axios({...})` / `blobRequest({...})` / `service.post(url, params, {...})`
 * 都在同一判据下，新增调用形态不会静默逃出采集面。
 */
export function scanBlobRequests(src: string, file: string): string[] {
  const codeOnly = muteNonCode(src)
  const keepStrings = muteNonCode(src, { keepStrings: true })
  if (codeOnly.length !== src.length || keepStrings.length !== src.length) {
    throw new Error(`${file}: 掩码长度不变式被打破，行号不再可信`)
  }
  const out: string[] = []
  for (const m of keepStrings.matchAll(/responseType\s*:\s*['"]blob['"]/g)) {
    const at = m.index ?? 0
    const open = findEnclosingBrace(codeOnly, at)
    if (open < 0) {
      out.push(`${file}: ${locOf(codeOnly, at)} responseType: 'blob' 不在对象字面量内（无法判定超时边界）`)
      continue
    }
    const close = matchBrace(codeOnly, open)
    if (close < 0) {
      out.push(`${file}: ${locOf(codeOnly, open)} 对象字面量未闭合（扫描器无法判定配置边界）`)
      continue
    }
    // 类型声明不是"请求配置"：`interface X { responseType: 'blob'; timeout: number }`
    // 这类形状没有（也不该有）FILE_DOWNLOAD_TIMEOUT，误判它会让守卫红在自己的类型上。
    if (isTypeLiteral(codeOnly, open)) continue
    const args = keepStrings.slice(open + 1, close)
    const timeoutMatch = /timeout\s*:\s*([A-Za-z0-9_.$]+|\d+)/.exec(args)
    const ok = timeoutMatch?.[1] === 'FILE_DOWNLOAD_TIMEOUT'
    if (!ok) {
      const expr = timeoutMatch ? timeoutMatch[1] : null
      out.push(
        `${file}: ${locOf(codeOnly, at)} blob 请求必须写 timeout: FILE_DOWNLOAD_TIMEOUT` +
          `（实际 ${expr === null ? '未声明' : `timeout: ${expr}`}）`
      )
    }
  }
  return out
}

/** 该对象字面量是否是 `interface X {` / `type X = {` 的类型体（不是请求配置） */
function isTypeLiteral(masked: string, open: number): boolean {
  const head = masked.slice(Math.max(0, open - 80), open)
  return /(?:interface\s+[A-Za-z0-9_$]+|type\s+[A-Za-z0-9_$]+(?:\s*<[^>]*>)?\s*=)\s*$/.test(head)
}

/** 从 `at` 向前找**包住它**的对象字面量左花括号；找不到返回 -1 */
function findEnclosingBrace(masked: string, at: number): number {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    const c = masked[i]
    if (c === '}') depth++
    else if (c === '{') {
      if (depth === 0) return i
      depth--
    }
  }
  return -1
}

/** 从 `open`（指向 `{`）出发做花括号匹配，返回 `}` 的下标；找不到返回 -1 */
function matchBrace(masked: string, open: number): number {
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    const c = masked[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function locOf(masked: string, index: number): string {
  return `第 ${masked.slice(0, index).split('\n').length} 行`
}

/** 切出单个 export 声明的正文（到下一条 export 为止），用于核对长任务端点 */
function declarationBody(masked: string, name: string): string | undefined {
  const start = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm').exec(masked)
  if (!start) return undefined
  const rest = masked.slice(start.index + start[0].length)
  const next = /^export\s+/m.exec(rest)
  return rest.slice(0, next ? next.index : rest.length)
}

/**
 * 解析 Rust 侧 `LONG_RUNNING_ROUTES` 的路由模板，折算成前端 `url:` 应当写的字面量。
 *
 * 折算规则只有一条：`{param}` 段在前端是字符串拼接（`'/system/backup/restore/' + id`），
 * 所以**删掉占位段本身、保留其前面的 `/`**。不做前缀匹配——`/system/backup/list`
 * 与 `/system/backup` 是两条不同档的路由，前缀匹配会把默认档的调用点也拖进长档判据，
 * 结局是每轮误红、然后有人来放宽它（AGENTS 前言 ⑯(c)）。
 */
export function parseLongTierUrlLiterals(rustText: string): string[] {
  const block = /const\s+LONG_RUNNING_ROUTES[^=]*=\s*&\[[\s\S]*?\];/.exec(rustText)
  if (!block) {
    throw new Error('Rust 侧没有解析到 LONG_RUNNING_ROUTES ⇒ 判据源缺失，不得静默放行')
  }
  // 刀口只能落在代码上：这份文件把模板字符串**也写进了文档注释**（如
  // `GET /system/backup/download/{backupId}`），逐行剔注释后才检索，否则注释里的
  // 反例会被判成登记条目（b89 前言 ⑬ / governance sideTheme 镜像锁同一条纪律）。
  const code = block[0]
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !(t.startsWith('//') || t.startsWith('///') || t.startsWith('//!') || t.startsWith('*'))
    })
    .join('\n')
  const out: string[] = []
  for (const m of code.matchAll(/"([^"]+)"/g)) {
    const template = m[1]
    if (!template.startsWith('/')) continue
    out.push(template.replace(/\{[^}]*\}/g, ''))
  }
  if (out.length === 0) {
    throw new Error(`LONG_RUNNING_ROUTES 解析出 0 条模板 ⇒ 解析通道腐化：${code.slice(0, 200)}`)
  }
  return out
}

/**
 * 从 Rust 侧解析长任务档的秒数（`LONG_RUNNING_TIMEOUT_SECS`，必须由预算派生）。
 *
 * 入参是**多份** Rust 原文：档位本身写在 `middleware/request_timeout.rs`，而它派生所用的
 * 两个内部预算分别住在各自的 service 文件里。单读一个文件时 `BACKUP_TIMEOUT_SECS` 读不到
 * ⇒ 判据红在自己的输入上（AGENTS 前言 ⑬"锁的输入非空且形状对"与结论对是两件事）。
 */
export function parseLongTierSeconds(sources: string[]): number {
  const rustText = sources.join('\n')
  if (sources.length === 0) throw new Error('长任务档的判据源清单为空 ⇒ 不得据此判定')
  const m = /const\s+LONG_RUNNING_TIMEOUT_SECS\s*:\s*u64\s*=\s*([^;]+);/.exec(rustText)
  if (!m) throw new Error('读不到 LONG_RUNNING_TIMEOUT_SECS ⇒ 判据源缺失')
  // 这一版是**表达式**（MAX_INTERNAL_BUDGET + SLACK），不是裸数字：按关系求值，
  // 记数字会让服务端调预算而前端这一侧永远读着旧值（AGENTS ⑰"只能判语义不能判字节"）。
  const budget = /const\s+MAX_INTERNAL_BUDGET_SECS[^=]*=[\s\S]*?;\s*\n?/.exec(rustText)
  const slack = /const\s+TIMEOUT_SLACK_SECS\s*:\s*u64\s*=\s*(\d+)/.exec(rustText)
  const backup = /const\s+BACKUP_TIMEOUT_SECS\s*:\s*u64\s*=\s*(\d+)/.exec(rustText)
  const ip = /const\s+IP_DOWNLOAD_TIMEOUT_SECS\s*:\s*u64\s*=\s*(\d+)/.exec(rustText)
  if (!slack || !backup || !ip || !budget) throw new Error('长任务档的派生输入读不全 ⇒ 不得据此判定')
  return Math.max(Number(backup[1]), Number(ip[1])) + Number(slack[1])
}

/**
 * 扫描一段源码里**落在长任务档上的调用点**，逐个判它有没有写 `timeout: LONG_TASK_TIMEOUT`。
 *
 * 立的案（b140）：`updateIpLocationNow` 走的是普通 JSON 通道、没有 `responseType: 'blob'`，
 * 于是 blob 那条腿看不见它，而它服务端等的是 300s 下载——前端读的是全局 30s，
 * 客户端第 30 秒就撤，服务端 handler future 被丢弃、下载停在中间态、更新锁留到 TTL。
 * 判据因此**由服务端档位派生采集面**，而不是由"哪个请求长得像下载"猜。
 */
export function scanLongTierSites(src: string, file: string, literals: string[]): string[] {
  const codeOnly = muteNonCode(src)
  const keepStrings = muteNonCode(src, { keepStrings: true })
  if (codeOnly.length !== src.length || keepStrings.length !== src.length) {
    throw new Error(`${file}: 掩码长度不变式被打破，行号不再可信`)
  }
  const out: string[] = []
  for (const m of keepStrings.matchAll(/url\s*:\s*(['"])((\/[^'"]*))\1/g)) {
    const literal = m[3]
    if (!literals.includes(literal)) continue
    const at = m.index ?? 0
    const open = findEnclosingBrace(codeOnly, at)
    if (open < 0) {
      out.push(`${file}: ${locOf(codeOnly, at)} 长任务路由的 url 不在对象字面量内（无法判定超时边界）`)
      continue
    }
    const close = matchBrace(codeOnly, open)
    if (close < 0) {
      out.push(`${file}: ${locOf(codeOnly, open)} 配置对象未闭合（扫描器无法判定边界）`)
      continue
    }
    if (isTypeLiteral(codeOnly, open)) continue
    const args = keepStrings.slice(open + 1, close)
    const timeoutMatch = /timeout\s*:\s*([A-Za-z0-9_.$]+|\d+)/.exec(args)
    if (timeoutMatch?.[1] !== 'LONG_TASK_TIMEOUT') {
      const expr = timeoutMatch ? timeoutMatch[1] : null
      out.push(
        `${file}: ${locOf(codeOnly, at)} ${literal} 落在服务端长任务档上，调用点必须写 ` +
          `timeout: LONG_TASK_TIMEOUT（实际 ${expr === null ? '未声明，走全局 30s' : `timeout: ${expr}`}）`
      )
    }
  }
  return out
}

// b138：采集面 = 全 src/**（.ts + .vue），不再只扫 src/api/**——
// `plugins/download.ts` 与 `views/**` 里的直连通道正是此前漏掉的缺陷藏身处。
const sourceFiles = collectSources(SRC_DIR)
const blobViolations = sourceFiles.flatMap((f) => scanBlobRequests(readFileSync(f, 'utf8'), rel(f)))

// b140：长任务档的采集面**由服务端档位派生**，不是由人枚举"哪些接口算长任务"。
// Rust 侧新增/改名一条档位模板，这里立刻多/少一个受判站点——漏登记与静默失配都会红。
const RUST_TIMEOUT_SRC = readFileSync(AXUM_REQUEST_TIMEOUT, 'utf8')
const longTierLiterals = parseLongTierUrlLiterals(RUST_TIMEOUT_SRC)
const longTierViolations = sourceFiles.flatMap((f) =>
  scanLongTierSites(readFileSync(f, 'utf8'), rel(f), longTierLiterals)
)

describe('长任务 / 下载超时契约守卫', () => {
  it('采集面自证：真实树至少 4 个 blob 下载站点，且 0 处违规', () => {
    // 下限挡"扫描器自己坏了"：0 命中必须同时来自"约定成立"与"确实扫过"，否则判据恒绿
    const sites = sourceFiles.reduce((n, f) => {
      const masked = muteNonCode(readFileSync(f, 'utf8'), { keepStrings: true })
      return n + (masked.match(/responseType\s*:\s*['"]blob['"]/g)?.length ?? 0)
    }, 0)
    expect(sourceFiles.length, `采集面必须覆盖全 src（实测 ${sourceFiles.length} 个文件）`).toBeGreaterThanOrEqual(400)
    expect(sites, `src/** 下 blob 下载站点数（实测 ${sites}）`).toBeGreaterThanOrEqual(4)
    console.warn(
      `[blobTimeout] 采集面 ${sourceFiles.length} 个 .ts/.vue / blob 站点 ${sites} / 违规 ${blobViolations.length}`
    )
    expect(
      blobViolations,
      '下载族一律走 FILE_DOWNLOAD_TIMEOUT：30s 全局超时会 abort 大文件，timeout:0 会让挂死连接永不释放'
    ).toEqual([])
  })

  it('request.ts 的 download() 默认值必须在 ...config 之前（可被调用点覆盖）', () => {
    const src = readFileSync(REQUEST_TS, 'utf8')
    const masked = muteNonCode(src)
    const open = masked.indexOf('service.post(url, params, {')
    expect(open, 'download() 必须仍由 service.post(url, params, {…}) 构造').toBeGreaterThan(0)
    const braceStart = masked.indexOf('{', open)
    const close = (() => {
      let depth = 0
      for (let i = braceStart; i < masked.length; i++) {
        if (masked[i] === '{') depth++
        else if (masked[i] === '}') {
          depth--
          if (depth === 0) return i
        }
      }
      return -1
    })()
    expect(close, 'download() 的配置对象必须闭合').toBeGreaterThan(braceStart)
    const config = masked.slice(braceStart, close)
    const timeoutAt = config.indexOf('timeout: FILE_DOWNLOAD_TIMEOUT')
    const spreadAt = config.indexOf('...config')
    expect(timeoutAt, 'download() 必须显式声明 timeout: FILE_DOWNLOAD_TIMEOUT').toBeGreaterThanOrEqual(0)
    expect(spreadAt, 'download() 必须保留 ...config 覆盖通道').toBeGreaterThan(timeoutAt)
  })

  it('前端上限与后端 BACKUP_TIMEOUT_SECS 对账（跨仓事实，读不到即失败）', () => {
    const src = readFileSync(AXUM_BACKUP_SERVICE, 'utf8')
    const m = /const\s+BACKUP_TIMEOUT_SECS\s*:\s*u64\s*=\s*(\d+)\s*;/.exec(src)
    expect(m, 'sys_backup_service.rs 里的 BACKUP_TIMEOUT_SECS 必须可解析（判据源缺失不得静默放行）').not.toBeNull()
    const backendSecs = Number(m![1])
    const requestTs = muteNonCode(readFileSync(TIMEOUTS_TS, 'utf8'))
    const longTask = /export\s+const\s+LONG_TASK_TIMEOUT\s*=\s*([\d_]+)/.exec(requestTs)
    const downloadT = /export\s+const\s+FILE_DOWNLOAD_TIMEOUT\s*=\s*([\d_]+)/.exec(requestTs)
    // b138：常量定义已迁到 utils/timeouts（request.ts 只 re-export），判据源随之改读新文件
    expect(longTask, 'utils/timeouts.ts 必须导出 LONG_TASK_TIMEOUT').not.toBeNull()
    expect(downloadT, 'utils/timeouts.ts 必须导出 FILE_DOWNLOAD_TIMEOUT').not.toBeNull()
    const longTaskMs = Number(longTask![1].replace(/_/g, ''))
    const downloadMs = Number(downloadT![1].replace(/_/g, ''))
    // 前端必须等得比服务端久：等于则边界抖动会随机 abort 一个已成功的任务
    expect(longTaskMs, `前端长任务上限 ${longTaskMs}ms 必须严格大于后端 ${backendSecs}s`).toBeGreaterThan(
      backendSecs * 1000
    )
    expect(downloadMs, '下载上限必须大于长任务上限（传输时长不受服务端处理时长约束）').toBeGreaterThanOrEqual(
      longTaskMs
    )

    // b140 新增的一腿：前端上限必须大于**服务端请求层的长任务档**（不只是子进程预算）。
    // 原先这一侧只比 `BACKUP_TIMEOUT_SECS`，而服务端真正的天花板是固定 120s 的传输层超时——
    // "前端必须等得比服务端久"这句注释所依赖的事实从来没被核对过，于是 330s 的前端上限对着
    // 120s 的服务端超时：先撤的是服务端，而它一撤就会 `kill_on_drop` 杀掉半截恢复。
    const tierSecs = parseLongTierSeconds([
      RUST_TIMEOUT_SRC,
      readFileSync(AXUM_BACKUP_SERVICE, 'utf8'),
      readFileSync(AXUM_IP_SERVICE, 'utf8')
    ])
    expect(
      longTaskMs,
      `前端长任务上限 ${longTaskMs}ms 必须严格大于服务端请求层长任务档 ${tierSecs}s（方向错了会杀掉服务端正在跑的子进程）`
    ).toBeGreaterThan(tierSecs * 1000)
  })

  it('真实树：备份创建 / 恢复 / 租户自助导出都声明 LONG_TASK_TIMEOUT', () => {
    const masked = muteNonCode(readFileSync(resolve(API_DIR, 'system/backup.ts'), 'utf8'))
    for (const name of ['createBackup', 'restoreBackup', 'selfExportTenantPackage']) {
      const body = declarationBody(masked, name)
      expect(body, `backup.ts 必须仍有 ${name}`).toBeDefined()
      expect(body, `${name} 必须写 timeout: LONG_TASK_TIMEOUT（后端子进程可跑到 300s）`).toMatch(
        /timeout\s*:\s*LONG_TASK_TIMEOUT/
      )
    }
  })

  it('长任务档采集面自证：档位模板折算成 url 字面量，且已知站点必须全在面里', () => {
    // 由服务端派生的三条必须都在（IP 库那条正是 b140 新发现的漏网站点）
    for (const literal of ['/system/backup', '/system/backup/restore/', '/system/ipLocation/update']) {
      expect(longTierLiterals, `档位模板折算后必须含 ${literal}`).toContain(literal)
    }
    expect(longTierLiterals.length, '折算出的模板数必须与 Rust 登记表同数').toBeGreaterThanOrEqual(3)
  })

  it('真实树：落在长任务档上的每个调用点都声明 LONG_TASK_TIMEOUT', () => {
    expect(longTierViolations, `长任务调用点违规：\n${longTierViolations.join('\n')}`).toEqual([])
  })

  it('长任务腿的刀口双向有效（少写/写错必须抓；注释与类型声明不得误报）', () => {
    const literals = ['/system/backup/restore/', '/system/ipLocation/update']
    // ① 没写 timeout（b140 修前的 ipLocation 形状）⇒ 必须命中 1 处
    const missing = scanLongTierSites(
      `export function f(): Promise<AjaxResult> {\n  return request({\n    url: '/system/ipLocation/update',\n    method: 'post'\n  })\n}\n`,
      'a.ts',
      literals
    )
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain('未声明，走全局 30s')
    // ② 写了别的数字 ⇒ 同样必须命中，并在文案里点名实际值
    const wrong = scanLongTierSites(
      `export function f() {\n  return request({\n    url: '/system/ipLocation/update',\n    timeout: 30000\n  })\n}\n`,
      'b.ts',
      literals
    )
    expect(wrong).toHaveLength(1)
    expect(wrong[0]).toContain('timeout: 30000')
    // ③ 合规站点必须不报
    expect(
      scanLongTierSites(
        `export function f() {\n  return request({\n    url: '/system/ipLocation/update',\n    timeout: LONG_TASK_TIMEOUT\n  })\n}\n`,
        'c.ts',
        literals
      )
    ).toEqual([])
    // ④ 注释里提到该 url 不算站点
    expect(scanLongTierSites(`// url: '/system/ipLocation/update'\nexport const x = 1\n`, 'd.ts', literals)).toEqual([])
    // ⑤ 不在档位上的同族路径不得被牵连（前缀匹配会把 /system/backup/list 拖进来＝每轮误红）
    expect(
      scanLongTierSites(
        `export function f() {\n  return request({\n    url: '/system/backup/list',\n    method: 'get'\n  })\n}\n`,
        'e.ts',
        literals
      )
    ).toEqual([])
  })

  it('控制组：刀口双向有效（缺声明/字面量/0 必须抓；带常量、非 blob、注释反例必须不抓）', () => {
    const cases: Array<{ title: string; src: string; count: number }> = [
      {
        title: 'blob 请求未声明 timeout ⇒ 必须命中 1 处（b99 缺陷形状）',
        src: `export function dl(id: number): Promise<Blob> {\n  return request({\n    url: '/x/' + id,\n    method: 'get',\n    responseType: 'blob'\n  })\n}\n`,
        count: 1
      },
      {
        title: 'blob 请求写 timeout: 0（挂死连接永不释放）⇒ 必须命中 1 处',
        src: `export function dl(): Promise<Blob> {\n  return request({ url: '/x', method: 'get', responseType: 'blob', timeout: 0 })\n}\n`,
        count: 1
      },
      {
        title: 'blob 请求写全局同值字面量 30000 ⇒ 必须命中 1 处（数字散落即会漂移）',
        src: `export function dl(): Promise<Blob> {\n  return request({ url: '/x', method: 'get', responseType: 'blob', timeout: 30000 })\n}\n`,
        count: 1
      },
      {
        title: 'blob 请求带 FILE_DOWNLOAD_TIMEOUT ⇒ 必须 0 命中',
        src: `export function dl(): Promise<Blob> {\n  return request({\n    url: '/x',\n    method: 'get',\n    responseType: 'blob',\n    timeout: FILE_DOWNLOAD_TIMEOUT\n  })\n}\n`,
        count: 0
      },
      {
        title: '普通 JSON 请求不写 timeout ⇒ 必须 0 命中（判据做窄：30s 对查询是合理的）',
        src: `export function list(q: Q): Promise<TableDataInfo<Row>> {\n  return request({ url: '/x/list', method: 'get', params: q })\n}\n`,
        count: 0
      },
      {
        title: '注释里提到 responseType: blob ⇒ 必须 0 命中（掩码器在位）',
        src: `// 参考：request({ responseType: 'blob' }) 的旧写法没有超时声明\nexport function list(q: Q): Promise<TableDataInfo<Row>> {\n  return request({ url: '/x/list', method: 'get', params: q })\n}\n`,
        count: 0
      },
      {
        title: 'blob 请求里带嵌套对象参数 ⇒ 仍然必须识别（括号配对不被内层花括号带偏）',
        src: `export function dl(): Promise<Blob> {\n  return request({\n    url: '/x',\n    method: 'post',\n    data: { a: 1, b: { c: 2 } },\n    responseType: 'blob'\n  })\n}\n`,
        count: 1
      }
    ]

    let caught = 0
    for (const c of cases) {
      const hits = scanBlobRequests(c.src, 'synthetic.ts')
      caught += c.count
      expect(hits.length, c.title).toBe(c.count)
    }
    // 正控总量：必须真有"应当被抓"的用例，否则上面全是 0 命中同样"绿"
    expect(caught, '必须被抓到的违规用例数').toBeGreaterThanOrEqual(3)
  })

  it('差异法活性：往真实 backup.ts 末尾追加一条无超时的 blob 请求，命中必须 +1', () => {
    const file = resolve(API_DIR, 'system/backup.ts')
    const src = readFileSync(file, 'utf8')
    expect(scanBlobRequests(src, rel(file)).length, '真实树这一条必须先是 0').toBe(0)
    const after = scanBlobRequests(
      src +
        `\nexport function downloadProbe(): Promise<Blob> {\n  return request({ url: '/x', method: 'get', responseType: 'blob' })\n}\n`,
      rel(file)
    )
    expect(after.length, '插入一条合成违规后增量').toBe(1)
  })
})
