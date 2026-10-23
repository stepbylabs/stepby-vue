/**
 * 静态守卫：接入 `useCrudTable` 时**不得**用桩函数填 API 槽位（批八十七，见台账 b87 §9）。
 *
 * ## 立的案
 *
 * 批八十六收口期只读排查实测：8 个只读页向 `useCrudTable` 注入 **25 处**
 * `getApi/addApi/updateApi/deleteApi: () => Promise.resolve({})`。而组合子契约里
 * `getApi/addApi/updateApi` 早就是可选字段（`UseCrudTableOptions`，由 `hasFormApis`
 * 与只读返回值重载双重表达），`deleteApi`/`deleteTipKey` 当时是唯一必填——
 * 于是"必填"这一条把桩写进了生产码。逐页核对的结论是这批桩**结构上不可达**
 * （8 个页面没有一个解构 `handleAdd/handleUpdate/submitForm`；4 个 `deleteApi` 桩页面
 * 也都没解构组合子的 `handleDelete`，删除走的是页面自己的真实 API），
 * 所以不是"用户已经点到的假功能"，而是**下一个改动会被这些桩骗过去**：
 * 谁往这类页面加一个"新增/删除"按钮并接上组合子处理器，`Promise.resolve({})` 会
 * 让请求"成功"、列表不刷新、toast 报"操作成功"——真机与判据同时全绿。
 * 本批改造：`deleteApi`/`deleteTipKey` 改可选；四个流程入口在缺能力时 `modal.msgError`
 * 报错而非静默 return（静默 = "点了没反应"，与按钮失灵同形）。
 *
 * ## 三条腿
 *
 * 1. 真实树：调用 `useCrudTable` 的文件里，五个 API 槽位赋值为桩函数 ⇒ 0 处。
 * 2. 合成双向：三种桩形状（`() => Promise.resolve({})`、`(ids) => Promise.resolve({})`、
 *    `async () => ({})`）与跨行桩必须被抓；真实 API 引用、非槽位的 `Promise.resolve`、
 *    注释/字符串里的反例文本、以及 `defaultForm: () => ({})` 这类**合法**空对象工厂
 *    必须**不报**（判据做窄不做宽——"任何 `() => ({})` 都红"会把必填的 defaultForm 全标违规，
 *    照着提示改就是把事实签成与判据一致）。
 * 3. 差异法活性：对每个调用点文件末尾插一条合成违规，命中数必须恰好 +1
 *    （证明扫描器对这些文件真在读，而不是恒 0）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { muteNonCode } from '@/utils/e2eSuiteScanKit'

/** 仓根按本文件位置反推（src/composables 的上两层），与其余守卫同一口径 */
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

/** 组合子的五个 API 槽位名：listApi 一并钉住（列表桩 = 页面永远看不到真实数据） */
const API_SLOTS = ['listApi', 'getApi', 'addApi', 'updateApi', 'deleteApi']

/** 采集面里的一个文件 */
interface ScannedFile {
  /** 相对仓根路径（报告可读） */
  rel: string
  /** 绝对路径 */
  abs: string
}

function walk(dir: string, out: ScannedFile[] = []): ScannedFile[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      walk(abs, out)
      continue
    }
    if (!/\.(?:vue|ts)$/.test(name)) continue
    if (/\.test\.ts$/.test(name)) continue
    out.push({ rel: abs.slice(VUE_ROOT.length + 1).replace(/\\/g, '/'), abs })
  }
  return out
}

/** 一个槽位的值最多读多少字符（真实槽位值都在几十字符内；越界说明扫描器走偏了） */
const MAX_VALUE_CHARS = 240

/** 桩形状：槽位值不经过任何真实请求就产出"成功" */
const STUB_VALUE_RES: RegExp[] = [
  /Promise\.resolve\s*\(/, // () => Promise.resolve({})
  /=>\s*\(\s*\{\s*\}\s*\)/, // async () => ({})
  /=>\s*\{\s*\}/ // () => {}（连返回值都没有）
]

/**
 * 换行处的收尾判据：下一行"看起来是另一个属性"或"是闭合括号"时，当前值到此为止。
 * 不这么止的话，接口声明里以**换行**（而非逗号）分隔的属性会被粘成一个值
 * （`useCrudTable.ts` 的 `getApi: (id: number | string) => Promise<unknown>` 就是这一形）；
 * 而真正的跨行桩 `updateApi: () =>\n    Promise.resolve({})` 下一行不是属性 ⇒ 照常读进去。
 */
const NEXT_LINE_STOP_RE = /^\s*(?:[A-Za-z_$][\w$]*\??\s*:|[)}])/

/**
 * 提取"桩槽位"命中行号（1 基）。
 * 只对**确实调用过 `useCrudTable`** 的文件判：桩只有作为这个组合子的槽位才是桩，
 * 别处的 `Promise.resolve({})`（例如把回调包成 Promise）与本案无关。
 * 判据读掩码后的文本——注释与字符串字面量里的反例不算站点
 * （与其余守卫共用同一个掩码器，两份实现必漂）。
 *
 * 取值**按字符推进、按括号深度定界**，不按行锚定：
 * 行锚定的写法（前一版）抓不到 `{ listApi: listPost, getApi: () => Promise.resolve({}) }`
 * 这种被 prettier 折成一行的对象字面量——那是**假阴性**，正是本守卫要防的形状。
 * 深度为 0 时遇到 `,` 或 `}`/`)` 即收尾，所以 `addDateRange(params, dateRange.value)`
 * 里的逗号不会提前截断，`defaultForm: () => ({})` 也不会被算进上一个槽位。
 */
function stubHits(text: string): number[] {
  if (!text.includes('useCrudTable')) return []
  const masked = muteNonCode(text)
  const slotRe = new RegExp(`(?:${API_SLOTS.join('|')})\\s*:\\s*`, 'g')
  const hits: number[] = []
  for (const m of masked.matchAll(slotRe)) {
    const start = (m.index ?? 0) + m[0].length
    let depth = 0
    let end = start
    for (; end < masked.length && end - start < MAX_VALUE_CHARS; end++) {
      const c = masked[end]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break
        depth--
      } else if (c === ',' && depth === 0) break
      else if (c === '\n' && depth === 0) {
        const nl = masked.slice(end + 1, end + 1 + 80)
        const nextLine = nl.slice(nl.search(/[^\s]/))
        if (NEXT_LINE_STOP_RE.test(nextLine)) break
      }
    }
    const value = masked.slice(start, end)
    if (STUB_VALUE_RES.some((re) => re.test(value))) {
      hits.push(masked.slice(0, m.index).split('\n').length)
    }
  }
  return hits
}

const allFiles = walk(SRC_DIR)
const crudFiles = allFiles.filter((f) => readFileSync(f.abs, 'utf8').includes('useCrudTable'))

describe('useCrudTable 桩 API 守卫', () => {
  it('① 真实树：调用 useCrudTable 的文件里桩槽位必须为 0 处', () => {
    const report: string[] = []
    for (const f of crudFiles) {
      for (const line of stubHits(readFileSync(f.abs, 'utf8'))) report.push(`${f.rel}:${line}`)
    }
    expect(report, `桩 API 回流：\n${report.join('\n')}`).toEqual([])
  })

  it('② 采集面自证：调用点与文件面不得静默为空', () => {
    // 扫描器读不到文件时"0 违规"是自说自话（只期望抛错等于没测）
    expect(allFiles.length, `src 采集面 ${allFiles.length} 个文件，低于下限`).toBeGreaterThanOrEqual(300)
    expect(crudFiles.length, `调用 useCrudTable 的文件仅 ${crudFiles.length} 个`).toBeGreaterThanOrEqual(30)
    // 本批删过桩的 8 个页面必须进采集面（漏一个 = 那一页的桩回流不受约束）
    for (const rel of [
      'src/views/monitor/frontendError/index.vue',
      'src/views/monitor/logininfor/index.vue',
      'src/views/monitor/online/index.vue',
      'src/views/monitor/operlog/index.vue',
      'src/views/system/auditChange/index.vue',
      'src/views/system/backup/index.vue',
      'src/views/system/file/index.vue',
      'src/views/system/notice-center/index.vue'
    ]) {
      expect(
        crudFiles.map((f) => f.rel),
        `页面 ${rel} 必须进采集面`
      ).toContain(rel)
    }
    console.warn(
      `[stubApiGuard] 采集面 src ${allFiles.length} 个文件 / 调用 useCrudTable ${crudFiles.length} 个 / 桩 0 处`
    )
  })

  it('③ 合成：四种桩形状必须被抓', () => {
    const cases: Array<[string, string, number]> = [
      ['箭头无参 + Promise.resolve', `useCrudTable<Post>({ listApi: listPost, getApi: () => Promise.resolve({}) })`, 1],
      [
        '箭头带参 + Promise.resolve',
        `useCrudTable<Post>({ listApi: listPost, deleteApi: (ids) => Promise.resolve({}) })`,
        1
      ],
      ['async 空对象', `useCrudTable<Post>({ listApi: listPost, addApi: async () => ({}) })`, 1],
      ['跨行桩', `useCrudTable<Post>({\n  listApi: listPost,\n  updateApi: () =>\n    Promise.resolve({})\n})`, 1],
      [
        '两行都桩（多条命中必须逐条点名）',
        `useCrudTable<Post>({\n  getApi: () => Promise.resolve({}),\n  deleteApi: () => {}\n})`,
        2
      ]
    ]
    for (const [name, src, expectHits] of cases) {
      const hits = stubHits(src)
      expect(hits, `${name} 必须被抓`).toHaveLength(expectHits)
    }
  })

  it('④ 合成反例：真实 API、非槽位、必填的 defaultForm、注释与字符串必须不报', () => {
    const ok: Array<[string, string]> = [
      [
        '真实 API 引用',
        `useCrudTable<Post>({ listApi: listPost, getApi: getPost, addApi: addPost, updateApi: updatePost, deleteApi: delPost })`
      ],
      [
        '多行真实 API（跨行也不得误判）',
        `useCrudTable<Post>({\n  listApi: (params) =>\n    listPost(params),\n  deleteApi: (ids) => delPost(ids)\n})`
      ],
      [
        '必填的 defaultForm 空对象工厂',
        `useCrudTable<Post>({ listApi: listPost, deleteApi: delPost, idField: 'postId', defaultForm: () => ({}) as Post })`
      ],
      [
        '槽位后面的 defaultForm: () => ({})（续行必须止步）',
        `useCrudTable<Post>({\n  getApi: () =>\n    getPost(),\n  defaultForm: () => ({}) as Post\n})`
      ],
      ['非槽位的 Promise.resolve', `useCrudTable<Post>({ listApi: listPost })\nconst ping = () => Promise.resolve({})`],
      ['注释里的反例', `useCrudTable<Post>({ listApi: listPost })\n// 曾经的形状：getApi: () => Promise.resolve({})`],
      ['字符串里的反例', `useCrudTable<Post>({ listApi: listPost })\nconst doc = 'getApi: () => Promise.resolve({})'`],
      // 接口里属性以**换行**分隔（组合子自身就是这一形）：取值必须在换行处止步。
      // 这里把 `() => ({})` 放在**后面**的属性上——止步逻辑一旦失效就会被粘进 getApi 的值里
      // 而误报，这一条专门钉住"扫描器贪吃"的退化方向。前缀 useCrudTable 是入口条件，缺了它整个文件不进面。
      [
        '接口形：换行分隔 + 后随空对象工厂',
        `useCrudTable<Post>({ listApi: listPost })\nexport interface O {\n  getApi: (id: number | string) => Promise<unknown>\n  addApi: (data: Post) => Promise<unknown>\n  defaultForm: () => ({}) as Post\n}`
      ]
    ]
    for (const [name, src] of ok) {
      expect(stubHits(src), `${name} 不得误报`).toEqual([])
    }
  })

  it('⑤ 差异法活性：每个调用点文件末尾插一条合成违规，命中必须 +1', () => {
    const synthetic = `\nconst __probe = useCrudTable<Post>({ listApi: listPost, getApi: () => Promise.resolve({}) })\n`
    const missed: string[] = []
    for (const f of crudFiles) {
      const text = readFileSync(f.abs, 'utf8')
      const before = stubHits(text).length
      const after = stubHits(text + synthetic).length
      if (after !== before + 1) missed.push(`${f.rel}: ${before} → ${after}`)
    }
    expect(missed, `插入合成违规后命中数未 +1 的文件：\n${missed.join('\n')}`).toEqual([])
  })

  it('⑥ 组合子侧：缺能力必须报错而不是静默（四个入口都有反馈通道）', () => {
    // 判据读的是组合子正文：四个流程入口各有一条 reportMissingCapability 短路，
    // 摘掉任何一条 = "按钮存在但没注入 API" 重新退化成静默无动作
    const src = readFileSync(join(SRC_DIR, 'composables', 'useCrudTable.ts'), 'utf8')
    expect((src.match(/reportMissingCapability\(\)/g) || []).length).toBe(5) // 1 定义 + 4 调用
    expect(src).toContain("t('common.crudCapabilityMissing')")
    expect(src).toMatch(/deleteApi\?:/)
    expect(src).toMatch(/deleteTipKey\?:/)
  })
})
