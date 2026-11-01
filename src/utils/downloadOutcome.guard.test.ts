/**
 * 「下载/导出的成功话必须由结局驱动」的形状守卫（b146）。
 *
 * 立的案（HEAD 实测四处同族，症状互不相干、成因同一句话——"Promise 没抛异常"被当成"这次成了"）：
 * 1. `composables/useExport.ts`：`download().then(() => msgSuccess(successKey))`，而旧
 *    `download()` 在 **HTTP 200 + JSON 错误体 / 0 字节载荷 / 保存通道被拒 / 请求层失败**
 *    四类出口上全部 resolve ⇒ 同一屏幕同时有"后端失败理由"（errorHub）与"导出成功"；
 * 2. `composables/useCrudTable.ts::exportRaw`：`then(() => …>800ms 就说成功)`，30 个列表页共享；
 * 3. `views/monitor/operlog/index.vue`：靠 `.catch` "保留对话框以便重试"，而旧契约**从不 reject**
 *    ⇒ 那条 catch 结构上走不到，失败时对话框照样关（R12 的修复实际空转）；
 * 4. `views/system/backup/index.vue::handleSelfExport`：只发 create 请求、把响应丢掉就说
 *    "导出成功"——用户手里没有任何文件（对照 `views/system/tenant` 的 create → download 完整链）。
 *
 * 五条规则（采集面**由事实派生**，不按文件名枚举）：
 * - R1 `.then(` 接在下载调用上、回调体里说成功 ⇒ 该回调必须**带形参并被条件引用**
 *   （`then((ok) => { if (ok && …) })`）；无参回调或参而不用 ⇒ 违规。
 * - R2 `await download…(` 没有把返回值接住（前面不是 `= `），而同一函数体里说成功 ⇒ 违规。
 * - R3 签名锁：`request.ts::download` 与 `api/system/backup.ts::downloadBackup` 必须声明
 *   `Promise<boolean>`——退回 `void`/`Blob` 就是"结局没有出口"，R1/R2 会同时失去判据对象。
 * - R4 接线反查（**计数**，不是"文件里出现过"）：逐站点钉住真实闸门形态（AGENTS ㉞(c)/66(c)：
 *   "提到过一次"证明不了每个入口都接了）。
 * - R5 单通道锁：`useExport.ts` 不得再出现 `msgError(`，`UseExportOptions` 不得再声明
 *   `errorKey`——同一次失败只许一条提示（b125 ⑤），且那条 `.catch` 跑在生产码产不出的形状上。
 *
 * 每条规则都配"合成违规必被抓 + 合规反例不误报"，R1 另配**逐文件差异法活性**（往每个受约束
 * 文件末尾插一条合成违规，命中数必须恰好 +1）与采集面自证，否则"一条都没扫到"与
 * "扫到了且干净"在报告里同形（AGENTS ⑥/⑬）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..')

function collect(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) collect(full, out)
    else if (ent.name.endsWith('.vue')) out.push(full)
    // 判据只针对生产码：测试文件里的合成夹具不是"页面怎么写"的证据
    else if (ent.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(ent.name)) out.push(full)
  }
  return out
}

function relOf(full: string): string {
  return path.relative(SRC, full).split(path.sep).join('/')
}

/**
 * 只抹**注释**（`//`、`/* … *\/`、HTML 注释），字符串内容保留。
 *
 * 为什么不用 `loadBeforeWrite.guard` 那份"注释+字符串一起抹"的实现：本守卫的 R4 锚点
 * 里带 i18n 键字符串（`t('tenant.exportSuccess')`），抹掉字符串就没法逐站点核对。
 * 反过来 R1/R2 的结构匹配也不依赖字符串遮蔽——被禁形态是"回调写法"，不是某个字面量。
 * 注释必须抹：本批新写的注释里就完整描述了 `.then(() => msgSuccess(...))` 这一旧形状
 * （㉘"反例的字符必须落在掩码序列之外"的反面：判据的说明文字自己就是最大的假阳性来源）。
 */
export function maskComments(code: string): string {
  const out = code.split('')
  const blank = (i: number) => {
    if (code[i] !== '\n') out[i] = ' '
  }
  let i = 0
  while (i < code.length) {
    const c = code[i]
    const nxt = code.slice(i, i + 4)
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') blank(i++)
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      while (i < code.length && code.slice(i, i + 2) !== '*/') blank(i++)
      blank(i++)
      blank(i++)
      continue
    }
    if (nxt === '<!--') {
      while (i < code.length && code.slice(i, i + 3) !== '-->') blank(i++)
      for (let k = 0; k < 3 && i < code.length; k++, i++) blank(i)
      continue
    }
    // 字符串与模板串原样保留，但要**跳过**其内容，免得串里的 `//` 被当成注释起点
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    i++
  }
  return out.join('')
}

const SUCCESS_CLAIM = /(msgSuccess|ElMessage\.success|\$modal\.msgSuccess)\s*\(/

/** 下载族调用（`download(` / `downloadBackup(`），排除同名但不同通道的 `downloadChart(` 等 */
const CALL_RE =
  /(?<![\w.](?:Chart|Template|Blob|Backup|Url|File))(?:\bdownload|\bdownloadBackup)\s*\(\s*[^)]*?\)\s*\.then\s*\(/g

interface ThenSite {
  thenOpen: number
  param: string
  body: string
}

/** 从 `.then(` 的左括号起，取出回调形参文本与回调体（花括号配平；表达式回调也接住）。 */
function parseThen(masked: string, thenOpen: number): ThenSite | null {
  let i = thenOpen + '('.length
  // 形参：`(a, b) =>` / `a =>` / `function (a)` / `() =>`
  let paramText = ''
  if (masked[i] === '(') {
    let depth = 0
    const start = i
    while (i < masked.length) {
      if (masked[i] === '(') depth++
      else if (masked[i] === ')') {
        depth--
        if (depth === 0) break
      }
      i++
    }
    paramText = masked.slice(start + 1, i)
    i++
  }
  const fnKeyword = /^\s*function\b/.test(masked.slice(i)) ? 'function'.length : 0
  if (fnKeyword) i += fnKeyword
  if (!paramText && /^\s*[\w$]+\s*=>/.test(masked.slice(i))) {
    const m = /^\s*([\w$]+)\s*=>/.exec(masked.slice(i))
    paramText = m ? m[1] : ''
    i += m ? m[0].length : 0
  }
  while (i < masked.length && /[\s=]>/.test(masked[i])) i++
  if (masked[i] !== '{') {
    // 表达式回调：取到语句结束（`)` 或 `,`），当成"体"
    const start = i
    let depth = 0
    while (i < masked.length) {
      const ch = masked[i]
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') {
        if (depth === 0) break
        depth--
      } else if (ch === ',' && depth === 0) break
      i++
    }
    return { thenOpen, param: paramText.trim(), body: masked.slice(start, i) }
  }
  let depth = 0
  const start = i
  while (i < masked.length) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}') {
      depth--
      if (depth === 0) return { thenOpen, param: paramText.trim(), body: masked.slice(start, i + 1) }
    }
    i++
  }
  return null
}

/** R1：说成功的 `.then` 回调必须按结局分流。 */
export function ungatedSuccessThens(masked: string): string[] {
  const bad: string[] = []
  for (const m of masked.matchAll(CALL_RE)) {
    const thenOpen = masked.indexOf('.then(', m.index ?? 0) + '.then'.length
    const site = parseThen(masked, thenOpen)
    if (!site || !SUCCESS_CLAIM.test(site.body)) continue
    const param = site.param.replace(/:\s*[\w<>[\]{}|.,\s'"]+/g, '').trim()
    if (!param) {
      bad.push(`无参 .then 里说成功（结局被丢弃）：${site.body.slice(0, 60).trim()}`)
      continue
    }
    const head = param.split(',')[0].trim()
    const name = head.split('=')[0].trim()
    if (!new RegExp(`if\\s*\\(\\s*${name}\\b|${name}\\s*&&|${name}\\s*\\?`).test(site.body)) {
      bad.push(`.then(${name}) 带了结局却没有按它分流：${site.body.slice(0, 60).trim()}`)
    }
  }
  return bad
}

/**
 * R2：`await download…()` 不接返回值却说成功。
 *
 * 判据单位取"所在函数体"（从 `await` 往前最近的 `{` 起做花括号配平）——只看同一函数里的
 * 事实，不按整份文件猜，否则一个文件里两个函数会互相顶班。
 */
export function ungatedSuccessAwaits(masked: string): string[] {
  const bad: string[] = []
  const re = /await\s+(?:[\w./$]*\.)?(?:download|downloadBackup)\s*\(/g
  for (const m of masked.matchAll(re)) {
    const at = m.index ?? 0
    // "接住了"的形态：`const saved = await download…`
    const before = masked.slice(Math.max(0, at - 60), at).trimEnd()
    if (/=\s*$/.test(before)) continue
    const brace = masked.lastIndexOf('{', at)
    if (brace < 0) continue
    let depth = 0
    let end = Math.min(masked.length, brace + 8000)
    for (let i = brace; i < masked.length; i++) {
      if (masked[i] === '{') depth++
      else if (masked[i] === '}') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    const body = masked.slice(brace, end)
    if (SUCCESS_CLAIM.test(body)) {
      bad.push(`await 走通 ≠ 下载成功：结局没有接住，同一函数里却说成功`)
    }
  }
  return bad
}

interface Source {
  rel: string
  raw: string
  masked: string
}

const FILES: Source[] = collect(SRC).map((full) => {
  const raw = fs.readFileSync(full, 'utf8')
  return { rel: relOf(full), raw, masked: maskComments(raw) }
})

/** 只保留"真的有下载调用"的文件——采集面由事实派生，不按名字列表。 */
const DOWNLOAD_FILES = FILES.filter((f) => /(^|[^\w.])(?:download|downloadBackup)\s*\(/.test(f.masked))

// 拼接得到的锚点：判据源码里因此不出现完整字面量，正向 needle 也不会被"自己的说明文字"洗绿
const ANCHOR = {
  downloadSignature: 'Promise<boolean>',
  useExportGate: ['if (ok && successKey) modal.msgSuccess'].join(''),
  crudGate: ['if (ok && Date.now() - startedAt > 800) modal.msgSuccess'].join(''),
  operlogGate: ['if (ok) exportDialogVisible.value = false'].join(''),
  tenantGate: ['if (saved) proxy?.$modal.msgSuccess(t(', "'", 'tenant.exportSuccess', "'", '))'].join(''),
  selfExportGate: ['if (saved) modal.msgSuccess(t(', "'", 'backup.tip.selfExportSuccess', "'", '))'].join(''),
  requestReturns: 'return saved'
}

describe('下载/导出结局守卫（b146）', () => {
  it('采集面自证：受约束文件与两种形状都必须扫得到（否则"0 违规"没有判据对象）', () => {
    expect(
      DOWNLOAD_FILES.length,
      `下载族采集面只剩 ${DOWNLOAD_FILES.length} 个文件 ⇒ 扫描面塌了，不是"没有违规"`
    ).toBeGreaterThanOrEqual(8)
    const gated = DOWNLOAD_FILES.filter((f) => f.rel.startsWith('views/') || f.rel.startsWith('composables/'))
    expect(gated.length, '至少要有视图/组合子侧的调用点进面').toBeGreaterThanOrEqual(5)
    // 活性正控：合成坏形状必须被抓（这一条专门挡"解析器结构上永远打不中"）
    const synth = `download('/x', {}, 'a.xlsx').then(() => { modal.msgSuccess('ok') })`
    expect(ungatedSuccessThens(synth)).toHaveLength(1)
    const synthAwait = `async function h() { const r = await selfExport(); await download('/x', {}, 'a.xlsx'); modal.msgSuccess('ok') }`
    expect(ungatedSuccessAwaits(maskComments(synthAwait))).toHaveLength(1)
  })

  it('R1 真实树：说成功的 .then 一律按结局分流（0 违规）', () => {
    const offenders = DOWNLOAD_FILES.flatMap((f) => ungatedSuccessThens(f.masked).map((why) => `${f.rel}: ${why}`))
    expect(offenders, `未随结局分流的下载成功话:\n${offenders.join('\n')}`).toEqual([])
  })

  it('R2 真实树：await 走通不得被读成下载成功（0 违规）', () => {
    const offenders = DOWNLOAD_FILES.flatMap((f) => ungatedSuccessAwaits(f.masked).map((why) => `${f.rel}: ${why}`))
    expect(offenders, `把"请求返回"当"文件到手"的站点:\n${offenders.join('\n')}`).toEqual([])
  })

  it('R1 差异法活性：每个受约束文件末尾插一条合成违规，命中必须恰好 +1', () => {
    const synth = `\nconst __b146_probe = download('/probe', {}, 'p.xlsx').then(() => modal.msgSuccess('x'))\n`
    const rows: string[] = []
    let active = 0
    for (const f of DOWNLOAD_FILES) {
      const base = ungatedSuccessThens(f.masked).length
      const after = ungatedSuccessThens(f.masked + synth).length
      if (after === base + 1) active++
      else rows.push(`${f.rel}: 插入前 ${base}、插入后 ${after}`)
    }
    expect(active, `探针在 ${active}/${DOWNLOAD_FILES.length} 个文件上生效，空跑的文件:\n${rows.join('\n')}`).toBe(
      DOWNLOAD_FILES.length
    )
  })

  it('R3 签名锁：download / downloadBackup 必须把结局写进返回值', () => {
    const req = FILES.find((f) => f.rel === 'utils/request.ts')
    expect(req, 'utils/request.ts 必须在采集面里').toBeTruthy()
    const sig = /export function download\b[\s\S]{0,400}?\)\s*:\s*Promise<(\w+)>/.exec(req!.masked)
    expect(sig, 'download() 必须显式声明返回类型（void 与推断都不算"结局有出口"）').toBeTruthy()
    expect(sig![1], 'download() 的返回类型必须是 boolean——否则调用点无从分流').toBe('boolean')

    const backup = FILES.find((f) => f.rel === 'api/system/backup.ts')
    expect(backup, 'api/system/backup.ts 必须在采集面里').toBeTruthy()
    const bsig = /export function downloadBackup\b[\s\S]{0,300}?\)\s*:\s*Promise<(\w+)>/.exec(backup!.masked)
    expect(bsig, 'downloadBackup() 必须显式声明返回类型').toBeTruthy()
    expect(bsig![1], 'downloadBackup() 同样返回"是否交给保存通道"').toBe('boolean')
  })

  it('R4 接线反查（计数形态）：五个闸门站点必须都还在', () => {
    const has = (rel: string, needle: string) => {
      const f = FILES.find((x) => x.rel === rel)
      return f ? f.raw.split(needle).length - 1 : -1
    }
    const TABLE: Array<{ rel: string; needle: string; atLeast: number }> = [
      { rel: 'composables/useExport.ts', needle: ANCHOR.useExportGate, atLeast: 1 },
      { rel: 'composables/useCrudTable.ts', needle: ANCHOR.crudGate, atLeast: 1 },
      { rel: 'views/monitor/operlog/index.vue', needle: ANCHOR.operlogGate, atLeast: 1 },
      { rel: 'views/system/tenant/index.vue', needle: ANCHOR.tenantGate, atLeast: 1 },
      { rel: 'views/system/backup/index.vue', needle: ANCHOR.selfExportGate, atLeast: 1 },
      { rel: 'utils/request.ts', needle: ANCHOR.requestReturns, atLeast: 1 }
    ]
    const gaps = TABLE.map((t) => ({ ...t, got: has(t.rel, t.needle) })).filter((t) => t.got < t.atLeast)
    expect(gaps, `闸门站点缺失（-1 = 文件不在面里）:\n${JSON.stringify(gaps, null, 2)}`).toEqual([])
  })

  it('R5 单通道锁：useExport 不再自带一条失败提示，errorKey 这条死选项已撤', () => {
    const f = FILES.find((x) => x.rel === 'composables/useExport.ts')
    expect(f).toBeTruthy()
    expect(
      /modal\.msgError\s*\(/.test(f!.masked),
      '失败理由由 errorHub 单通道给（b125 ⑤）；页面再弹一条就是同一次失败两种措辞'
    ).toBe(false)
    expect(
      /errorKey\??:/.test(f!.masked),
      '`errorKey` 挂在一条结构上走不到的 .catch 上（旧 download 从不 reject）⇒ 已按 ⑮ 撤掉，\
       不得以"保留兼容"为名再挂回来'
    ).toBe(false)
  })

  it('R1 合规反例：带结局分流的三种写法都不得报', () => {
    const compliant = [
      `download('/x', {}, 'a.xlsx').then((ok: boolean) => { if (ok) modal.msgSuccess('y') })`,
      `downloadBackup(1).then((saved) => { if (saved) { modal.msgSuccess('y') } })`,
      `download('/x', {}, 'a.xlsx').then((ok) => ok && modal.msgSuccess('y'))`
    ].map((s) => [s, ungatedSuccessThens(maskComments(s))] as const)
    for (const [src, bad] of compliant) {
      expect(bad, `合规形状被误判: ${src}`).toEqual([])
    }
  })
})
