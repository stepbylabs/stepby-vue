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
 * 只看 `.ts` 生产文件（`src/api/**`），注释里写 `responseType: 'blob'` 不算站点
 * （`muteNonCode` 只抹注释、保留字符串——`'blob'` 是字面量，抹掉字符串这条腿就空了）。
 * 对象边界（括号匹配）另用抹掉字符串的视图，避免 URL 里的括号干扰配对。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { muteNonCode } from '@/utils/e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API_DIR = resolve(VUE_ROOT, 'src/api')
const REQUEST_TS = resolve(VUE_ROOT, 'src/utils/request.ts')
const AXUM_BACKUP_SERVICE = resolve(VUE_ROOT, '..', 'stepby-axum', 'src', 'service', 'sys_backup_service.rs')

const rel = (p: string) => p.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')

function collectTs(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) collectTs(abs, out)
    else if (ent.isFile() && ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) out.push(abs)
  }
  return out.sort()
}

/** 从 `open`（指向 `(`）出发做括号匹配，返回 `)` 的下标；找不到返回 -1 */
function matchParen(masked: string, open: number): number {
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 扫描一段源码里的 blob 请求配置。
 * `file` 只用于报错文案；纯函数，合成夹具与真实文件共用这一份实现。
 */
export function scanBlobRequests(src: string, file: string): string[] {
  const codeOnly = muteNonCode(src)
  const keepStrings = muteNonCode(src, { keepStrings: true })
  if (codeOnly.length !== src.length || keepStrings.length !== src.length) {
    throw new Error(`${file}: 掩码长度不变式被打破，行号不再可信`)
  }
  const out: string[] = []
  for (const m of codeOnly.matchAll(/\brequest\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1
    const close = matchParen(codeOnly, open)
    if (close < 0) {
      out.push(`${file}: ${locOf(codeOnly, open)} request( 括号未闭合（扫描器无法判定配置边界）`)
      continue
    }
    const args = keepStrings.slice(open + 1, close)
    if (!/responseType\s*:\s*['"]blob['"]/.test(args)) continue
    const timeoutMatch = /timeout\s*:\s*([A-Za-z0-9_.$]+|\d+)/.exec(args)
    const ok = timeoutMatch?.[1] === 'FILE_DOWNLOAD_TIMEOUT'
    if (!ok) {
      const expr = timeoutMatch ? timeoutMatch[1] : null
      out.push(
        `${file}: ${locOf(codeOnly, open)} blob 请求必须写 timeout: FILE_DOWNLOAD_TIMEOUT` +
          `（实际 ${expr === null ? '未声明' : `timeout: ${expr}`}）`
      )
    }
  }
  return out
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

const apiFiles = collectTs(API_DIR)
const blobViolations = apiFiles.flatMap((f) => scanBlobRequests(readFileSync(f, 'utf8'), rel(f)))

describe('长任务 / 下载超时契约守卫', () => {
  it('采集面自证：真实树至少 3 个 blob 下载站点，且 0 处违规', () => {
    // 下限挡"扫描器自己坏了"：0 命中必须同时来自"约定成立"与"确实扫过"，否则判据恒绿
    const sites = apiFiles.reduce((n, f) => {
      const masked = muteNonCode(readFileSync(f, 'utf8'), { keepStrings: true })
      return n + (masked.match(/responseType\s*:\s*['"]blob['"]/g)?.length ?? 0)
    }, 0)
    expect(sites, `src/api 下 blob 下载站点数（实测 ${sites}）`).toBeGreaterThanOrEqual(3)
    console.warn(`[blobTimeout] 采集面 ${apiFiles.length} 个 .ts / blob 站点 ${sites} / 违规 ${blobViolations.length}`)
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
    const requestTs = muteNonCode(readFileSync(REQUEST_TS, 'utf8'))
    const longTask = /export\s+const\s+LONG_TASK_TIMEOUT\s*=\s*([\d_]+)/.exec(requestTs)
    const downloadT = /export\s+const\s+FILE_DOWNLOAD_TIMEOUT\s*=\s*([\d_]+)/.exec(requestTs)
    expect(longTask, 'request.ts 必须导出 LONG_TASK_TIMEOUT').not.toBeNull()
    expect(downloadT, 'request.ts 必须导出 FILE_DOWNLOAD_TIMEOUT').not.toBeNull()
    const longTaskMs = Number(longTask![1].replace(/_/g, ''))
    const downloadMs = Number(downloadT![1].replace(/_/g, ''))
    // 前端必须等得比服务端久：等于则边界抖动会随机 abort 一个已成功的任务
    expect(longTaskMs, `前端长任务上限 ${longTaskMs}ms 必须严格大于后端 ${backendSecs}s`).toBeGreaterThan(
      backendSecs * 1000
    )
    expect(downloadMs, '下载上限必须大于长任务上限（传输时长不受服务端处理时长约束）').toBeGreaterThanOrEqual(
      longTaskMs
    )
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
