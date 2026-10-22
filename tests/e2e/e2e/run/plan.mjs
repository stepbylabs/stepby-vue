/**
 * 主套件分片口径派生器（纯函数；不读 argv、不启浏览器、不碰凭据）。
 *
 * 为什么要有这个文件（批八十四，根因是 b83 实测事故）：
 * b83 六段跑批时我把第 5 段手抄成 `--feature=97-116,118-120`，而 F117 在 b73 就已真实注册
 * ⇒ 该族 9 条判据**整轮没跑**，每段照样报绿。配方 §3.57.3 为它立过案，但给出的补救是一段
 * `node -e "…matchAll(/\{ id: (\d+), fn: /g)…"` 的手工命令——手工命令等于没有判据：
 * 它会随注册表写法漂移，且没有任何载体在"少跑一族"时把跑批判红。
 * deep-e2e 从 b79 起就有 `--plan`（唯一事实源 = `testFns`），主套件缺同一条腿，本文件补上。
 *
 * 四条口径是设计而非风格：
 * 1. **派生面只取注册表数组区**（`const features = [` 到与之配对的 `]`），不做全文正则——
 *    全文扫会把注释/字符串里的 `{ id: 1, fn: x }` 形状算成条目（本文件自检 ⑥ 钉住这一条），
 *    而注释里的形状是"讲解"，不是注册。
 * 2. **采集面下限 fail-closed**：区找不到、或区内条目 `< MIN_REGISTRY_ENTRIES` ⇒ FATAL。
 *    "扫不到条目"与"没有空洞"在结果里必须可区分（AGENTS 门禁全景 ②）。
 * 3. **漏读探测**：区内"条目形状数"（对象字面量数 / `id:` 数，剔注释后同文计数）必须等于读到的条数。
 *    这是本文件唯一能看见"写法漂出正则"的通道——漏读的那个编号压根不在集合里，
 *    所以 `1..max` 依然连续、`count === max` 依然成立，**形状判定对这一族是瞎的**（自检 ⑩ 钉住）。
 * 4. **连续性/重复/长度三方互证**：`1..max` 连续、无重复、`count === max`——与主套件运行时的
 *    注册表自检同一判据，因此"文本派生"与"运行时数组"可以互相对账（那条对账在 main.mjs 里，
 *    它把本文件的派生结果与真实数组比；两者不一致 = 注册表写法漂出了派生口径，必须当场红）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 注册表数组区的起点（主套件里就是这一行；缩进不参与判定） */
const REGISTRY_HEAD_RE = /^\s*const features\s*=\s*\[/m

/**
 * 数组区内的一条注册：`{ id: 117, fn: testFeature117 }`。
 * `[^{}]*` 是为了让**多行写法、尾部逗号、条目里多一个键**照样进面：分片边界既然由文本派生，
 * 文本口径比注册表写法窄一档时，少的那一族就静默不跑——正是 b83 的事故形状，只是那次坏在人手抄，
 * 这次会坏在口径本身。残留盲区（键序颠倒、`id` 取变量、嵌套对象）不靠这条正则穷举，
 * 由 `deriveFeatureIds` 的漏读探测 + `main.mjs` 的运行时数组对账两条腿收敛。
 */
const ENTRY_RE = /\{\s*id:\s*(\d+)\s*,\s*fn:\s*[A-Za-z0-9_$]+[^{}]*/g

/** 采集面下限：真实注册表 144 条，低于此数一律按"派生坏了"处理，不得读成"就这几个功能" */
export const MIN_REGISTRY_ENTRIES = 100

/** 分段默认宽度：144 功能 ⇒ 6 段（与 b82/b83 的实跑分段一致，纯展示口径，不是判据） */
export const DEFAULT_SEGMENT_SIZE = 24

/**
 * 从源码文本里切出注册表数组区。
 * 用**方括号深度**配对（忽略字符串/模板里的括号——数组区内只有 `{ id, fn }` 字面量，
 * 出现未配对括号的写法本文件会被自检 ⑤ 判 FATAL，而不是悄悄少取一段）。
 * @returns {{region: string, reason: string} } region 为空串时 reason 说明为什么
 */
export function registryRegion(text) {
  const src = String(text ?? '')
  const head = REGISTRY_HEAD_RE.exec(src)
  if (!head) return { region: '', reason: '源码里找不到 `const features = [` 这一行（注册表改名或换写法？）' }
  const i = src.indexOf('[', head.index)
  if (i < 0) return { region: '', reason: '`const features = [` 之后找不到左方括号' }
  let depth = 0
  for (let p = i; p < src.length; p++) {
    const ch = src[p]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return { region: src.slice(i, p + 1), reason: '' }
    }
  }
  return { region: '', reason: '注册表数组的方括号未配对（截断了？）' }
}

/** 派生面用"剔注释后的数组区"——注释里的 `{ id: 999, fn: ghost }` 是讲解，不是注册；
 *  计数与匹配必须用**同一份文本**，否则漏读探测会自己造出假阳性。 */
function stripRegionComments(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

/** 派生注册编号（升序去重由调用方判，这里忠实反映文本里的每一条）
 *  `min` 是给自检留的合成口径：真实调用一律用默认下限，自检里"测空洞"的用例把下限降到 1，
 *  免得两条判据在同一条用例里纠缠（下限本身由 ④ 单独双向钉住）。
 */
export function deriveFeatureIds(text, min = MIN_REGISTRY_ENTRIES) {
  const { region, reason } = registryRegion(text)
  if (!region) return { ids: [], regionChars: 0, fatal: reason }
  const face = stripRegionComments(region)
  const ids = [...face.matchAll(ENTRY_RE)].map((m) => Number(m[1]))
  if (ids.length === 0) {
    return {
      ids: [],
      regionChars: region.length,
      fatal: `注册表区取到 ${region.length} 字符却一条 \`{ id: N, fn: … }\` 都没匹配上（写法变了）`
    }
  }
  // 漏读探测：区里"看起来是一条注册"的形状数（对象字面量数 / `id:` 数）必须等于读到的条数。
  // 不相等就是派生口径比注册表写法窄——这种偏差**不会**表现为空洞（漏读的那个编号根本不在集合里，
  // 于是 1..max 照样连续），只会表现为"这一族每轮都少跑"。宁可 FATAL 让人改写法，不得静默少一族。
  const objTok = (face.match(/\{/g) || []).length
  const idTok = (face.match(/\bid\s*:/g) || []).length
  const shapeTok = Math.max(objTok, idTok)
  if (shapeTok > ids.length) {
    return {
      ids,
      regionChars: region.length,
      fatal:
        `注册表区里有 ${shapeTok} 处"条目形状"（对象字面量 ${objTok} / \`id:\` ${idTok}），` +
        `但派生口径只读到 ${ids.length} 条——差 ${shapeTok - ids.length} 条会在分片里静默消失。` +
        `派生器认的写法是 \`{ id: <数字字面量>, fn: <名字>, …\`\n（键序颠倒 / id 取变量 / 嵌套对象都不认：改写法，或把这条注册拆成一行）`
    }
  }
  if (ids.length < min) {
    return {
      ids,
      regionChars: region.length,
      fatal: `派生到 ${ids.length} 条，低于采集面下限 ${min}——"扫不全"不得读成"没有空洞"`
    }
  }
  return { ids, regionChars: region.length, fatal: '' }
}

/**
 * 编号集合的形状判定（纯函数，与 main.mjs 运行时自检共用同一口径）。
 * @returns {{count:number, maxId:number, dups:number[], holes:number[], ok:boolean, problems:string[]}}
 */
export function registryShape(ids) {
  const list = [...(ids ?? [])].map(Number).filter((n) => Number.isFinite(n))
  const count = list.length
  if (count === 0) {
    return {
      count: 0,
      maxId: 0,
      dups: [],
      holes: [],
      ok: false,
      problems: ['编号集合为空——注册表没派生出来，任何"连续"结论都不成立']
    }
  }
  const seen = new Set()
  const dups = []
  for (const id of list)
    if (seen.has(id)) dups.push(id)
    else seen.add(id)
  const maxId = Math.max(...seen)
  const holes = []
  for (let i = 1; i <= maxId; i++) if (!seen.has(i)) holes.push(i)
  const problems = []
  if (dups.length) problems.push(`重复编号=${[...new Set(dups)].sort((a, b) => a - b).join(',')}`)
  if (holes.length) problems.push(`未注册编号=${holes.sort((a, b) => a - b).join(',')}`)
  if (count !== maxId)
    problems.push(`条目数 ${count} 与最大编号 ${maxId} 不吻合（重复与空洞会互相抵消成假绿，故必须三方互证）`)
  return { count, maxId, dups, holes, ok: problems.length === 0, problems }
}

/**
 * 由编号集合打分片口径。有问题时**不返回分片**（照抄一份"看起来能用"的分片，
 * 就是把少跑一族这件事继续往下传）。
 */
export function planSegments(ids, size = DEFAULT_SEGMENT_SIZE) {
  const shape = registryShape(ids)
  if (!shape.ok) return { ok: false, shape, ranges: [] }
  const width = Number.isFinite(size) && size >= 1 ? Math.floor(size) : DEFAULT_SEGMENT_SIZE
  const ranges = []
  for (let s = 1; s <= shape.maxId; s += width) {
    const to = Math.min(s + width - 1, shape.maxId)
    ranges.push({ from: s, to, spec: `--feature=${s}-${to}` })
  }
  return { ok: true, shape, ranges }
}

/** 给人抄的那几行（命令本体不含启动目录假设——路径由调用方所在目录决定，见 AGENTS ⑯(b)） */
export function planText(plan, entryName = 'main.mjs') {
  const lines = [
    `功能总数 ${plan.shape.count}（唯一事实源 = ${entryName} 里的 features 数组，最大编号 ${plan.shape.maxId}）`,
    `分片口径：${plan.ranges.map((r) => r.spec).join(' / ')}`,
    `分段求和必须等于 ${plan.shape.count}；单段 EXIT 凭证逐段落盘（run-detached / SEG 行），否则这段结论不作数`
  ]
  return lines.join('\n')
}

// ==================== 自检（合成双向 + 真实文件正控）====================

const CASES = [
  {
    name: '① 干净编号（1..5 连续）必须放行并按宽度切片',
    run: () => {
      const p = planSegments([1, 2, 3, 4, 5], 4)
      return (
        p.ok && p.ranges.length === 2 && p.ranges[0].spec === '--feature=1-4' && p.ranges[1].spec === '--feature=5-5'
      )
    }
  },
  {
    name: '② 文本里有空洞必须点名那个编号，且不得给出分片',
    run: () => {
      const r = deriveFeatureIds(synth([1, 2, 4]), 1)
      const p = planSegments(r.ids, 24)
      return (
        r.fatal === '' && p.ok === false && p.shape.holes.join() === '3' && p.ranges.length === 0 && r.ids.length === 3
      )
    }
  },
  {
    name: '③ 有重复必须点名（重复 + 空洞同时存在时两条都要报，不得互相抵消）',
    run: () => {
      const p = planSegments([1, 1, 3], 24)
      return p.ok === false && p.shape.dups.join() === '1' && p.shape.holes.join() === '2'
    }
  },
  {
    name: '④ 采集面下限：低于 MIN_REGISTRY_ENTRIES 必须 FATAL（"扫不全"≠"没空洞"）',
    run: () => {
      const r = deriveFeatureIds(synth([1, 2, 3]))
      return r.fatal.includes('采集面下限') && r.ids.length === 3
    }
  },
  {
    name: '⑤ 找不到注册表头（改名/换写法）必须 FATAL 并说清找的是什么',
    run: () => {
      const r = deriveFeatureIds('const featureList = [\n  { id: 1, fn: a },\n]\n')
      return r.fatal.includes('const features') && r.ids.length === 0
    }
  },
  {
    name: '⑥ 数组区之外的同形状文本不得计入（注释里的讲解不是注册）',
    run: () => {
      const text = `// 历史写法 { id: 999, fn: ghost } 已废弃\nconst features = [\n  { id: 1, fn: a },\n]\n// 尾部注释 { id: 998, fn: ghost2 }\n`
      const ids = deriveFeatureIds(text).ids
      return ids.length === 1 && ids.includes(1) && !ids.includes(998) && !ids.includes(999)
    }
  },
  {
    name: '⑦ 条数与最大编号不吻合必须单独成一条（[1,2,2,3]：重复 2 + 条数 4≠最大 3，两条同报）',
    run: () => {
      const s = registryShape([1, 2, 2, 3])
      return (
        s.ok === false &&
        s.dups.join() === '2' &&
        s.holes.length === 0 &&
        s.problems.length === 2 &&
        s.problems.some((p) => p.includes('条目数 4 与最大编号 3'))
      )
    }
  },
  {
    name: '⑧ 空集合不得判"连续"（恒真是本仓最贵的缺陷形态）',
    run: () => {
      const s = registryShape([])
      return s.ok === false && s.problems.length === 1
    }
  },
  {
    name: '⑨ 写法漂移不得少一族：多行 / 尾逗号 / 条目里多一个键都必须进面',
    run: () => {
      const text = `const features = [\n  {\n    id: 1,\n    fn: testFeature1,\n  },\n  { id: 2, fn: testFeature2, owner: 'x' },\n  { id: 3, fn: testFeature3 }\n]\n`
      const r = deriveFeatureIds(text, 1)
      return r.fatal === '' && r.ids.join() === '1,2,3'
    }
  },
  {
    name: '⑩ 派生口径读不懂的注册必须 FATAL 点名（漏读探测），不得静默少一条',
    run: () => {
      // 键序颠倒：运行时数组里它是合法的一条注册，文本口径却读不到 ⇒ 1..max 仍"连续"，
      // 因为漏读的那个编号压根不在集合里。只有漏读探测能发现。
      const r = deriveFeatureIds(`const features = [\n  { id: 1, fn: a },\n  { fn: b, id: 2 }\n]\n`, 1)
      return (
        r.fatal.includes('静默消失') &&
        r.fatal.includes('对象字面量 2') &&
        r.ids.join() === '1' &&
        planSegments(r.ids, 24).ok === true // 反证：形状判定看不见这一族，必须靠探测
      )
    }
  }
]

/** 合成一份"恰好这些编号"的注册表文本（不含数组区外的条目，除注释里那条诱饵） */
function synth(ids) {
  const lines = ids.map((i) => `  { id: ${i}, fn: testFeature${i} },`).join('\n')
  return `const features = [\n${lines}\n]\n// 注释里的 { id: 4242, fn: ghost } 不得进面\n`
}

/**
 * @param {() => string} readReal 由调用方给出"读真实 main.mjs"的函数（本模块不假设启动目录）
 */
export function planSelftest(readReal) {
  let bad = 0
  for (const c of CASES) {
    let ok = false
    let err = ''
    try {
      ok = c.run() === true
    } catch (e) {
      err = `（抛错：${String(e).slice(0, 80)}）`
    }
    if (!ok) bad++
    console.log(`  ${ok ? '✅ [OK]' : '❌ [BAD]'} ${c.name}${err}`)
  }
  // 真实文件正控：派生不出真注册表 ⇒ 上面全绿也没有意义（"扫不到"不得读成"没问题"）
  let realOk = false
  let realMsg = ''
  try {
    const r = deriveFeatureIds(readReal())
    const s = registryShape(r.ids)
    realOk = !r.fatal && s.ok
    realMsg = r.fatal || `${s.count} 条，编号 1..${s.maxId}`
  } catch (e) {
    realMsg = `读真实注册表失败：${String(e).slice(0, 90)}`
  }
  if (!realOk) bad++
  console.log(`  ${realOk ? '✅ [OK]' : '❌ [BAD]'} ⑪ 真实 main.mjs 的注册表必须能派生且连续 —— ${realMsg}`)
  if (bad > 0) {
    console.error(`❌ SYNTH_FAIL：主套件分片派生 ${bad} 条不符——禁用 --plan 作为分段依据`)
    return 1
  }
  console.log(`SYNTH_OK 主套件分片派生 ${CASES.length + 1} 条双向（合成 ${CASES.length} + 真实正控 1）`)
  return 0
}

/**
 * 直接执行入口：`node tests/e2e/e2e/run/plan.mjs --selftest`。
 * 只在"被当作脚本跑"时动作（被 import 时零副作用）——本模块同时是主套件的 `--plan` 后端，
 * import 期执行 argv 会把调用方的自检洗成对方的结论（AGENTS 门禁全景里
 * "判据脚本之间只能共享纯函数，不能 import 入口脚本"那条的同族）。
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv[2]
  if (flag === '--selftest') {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const real = path.resolve(here, '..', '..', 'main.mjs')
    process.exitCode = planSelftest(() => fs.readFileSync(real, 'utf8'))
  } else {
    console.error('用法：node tests/e2e/e2e/run/plan.mjs --selftest')
    process.exitCode = 2
  }
}
