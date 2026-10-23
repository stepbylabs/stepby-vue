/**
 * 静态守卫：读取类 API 必须声明载荷类型（`AjaxResult<T>` / `TableDataInfo<T>`），
 * 且 `getConfigKey` 的返回**不得读 `msg`**（批八十七，根因取证见台账 b86 §6）。
 *
 * ## 立的案
 *
 * `views/system/user/index.vue` 把 `getConfigKey('sys.user.initPassword')` 的 `response.msg`
 * 当初始密码用。后端这一支是 `AjaxResult::success(value)`：生效值在 **data**，`msg` 恒是
 * "操作成功"文案。当时 `src/api/system/config.ts` 的 `getConfigKey` 返回裸 `AjaxResult`
 * （`data?: unknown`），类型层看不见"这里有一个字符串载荷"，所以调用点读错字段**没有任何信号**
 * ——界面显示"操作成功"四个字，看着像有值。
 *
 * ## 判据为什么只做"读取类"，不做全量棘轮（本批实测，不是文风偏好）
 *
 * 原本立项写的是"裸 `Promise<AjaxResult>` 棘轮（基线 132，只许降）"。动手前先数了一遍，
 * 前提**不成立**：`src/api/**` 现有 122 处裸返回，逐条按动词归类是
 * `del* 32 / update* 22 / add* 14 / change* 9 / clean* 6 / revoke* 4 / …`——**全是写操作**。
 * 写操作的成功响应结构上就没有载荷（`data` 缺席），把它们逐个补成 `AjaxResult<unknown>`
 * 是纯文本改动、零信号；而 3 处看着像取值的裸站点（`testChannel` / `dataScope` / `verifyTotp`）
 * 读实现后确认只消费"成/败"，也不带载荷。
 * 反过来，**读取类**动词（`get|list|query|select|check|is|have|count|fetch|load` 前缀）
 * 的 123 处声明里，裸返回是 **0** 处——这条线今天本来就踩着，说明它是这个仓的实际约定，
 * 只是从来没有判据钉住（`getConfigKey` 那处正是靠批八十六人工发现才补上的）。
 * 所以这里钉的是"0 处违规 + 采集面自证"，不是"从 132 往下爬"。
 * 判据做窄不做宽的另一半理由在控制组里：`mutator 裸返回必须不报`——去掉这条，
 * 下一次有人加一个 `delXxx(): Promise<AjaxResult>` 就红在无关处，照着提示补 `<unknown>`
 * 等于把事实签成与判据一致。
 *
 * ## 三条腿
 *
 * 1. 读取类声明不得出现裸 `Promise<AjaxResult>` / `Promise<TableDataInfo>`（含 `cachedApi`
 *    包装的内层箭头注解，那正是 `getConfigKey` 的真实形状）。
 * 2. `getConfigKey` 的结果绑定名不得被读 `.msg`——把 b86 §6 那个具体错误形状钉死。
 * 3. 采集面自证（读取类声明数下限、已带泛型下限、两处真实消费点必须读到 `.data`）+
 *    合成双向：裸 getter 必须被抓、typed getter 与 mutator 裸返回必须不被抓、
 *    注释/字符串里的反例文本不算站点（共用 `e2eSuiteScanKit` 的掩码器，两份实现必漂）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { lineHits, muteNonCode } from '@/utils/e2eSuiteScanKit'

/** 仓根按本文件位置反推（src/api 的上两层），与其余守卫同一口径 */
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API_DIR = resolve(VUE_ROOT, 'src/api')
const SRC_DIR = resolve(VUE_ROOT, 'src')

/** 读取类动词前缀：这一族的成功响应**必然**带载荷，类型层必须写出载荷是什么 */
const READER_PREFIX = /^(?:get|list|query|select|check|is|have|count|fetch|load)/

/** 裸泛型（无 `<…>`）的两个响应包装类型——`data`/`rows` 落到 `unknown`，调用点读错字段无信号 */
const BARE_GENERIC_RE = /\bPromise<\s*(?:AjaxResult|TableDataInfo)\s*>/g

/** 顶层 `export function|const NAME` 声明起点（掩码后文本上行首匹配，避免字面量里的伪边界） */
const DECL_START_RE = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z0-9_$]+)/gm

interface ReaderDecl {
  name: string
  file: string
  /** 裸 `Promise<AjaxResult>` / `Promise<TableDataInfo>` 出现的行号（1-based） */
  bareLines: number[]
  /** 是否带显式泛型载荷（`Promise<AjaxResult<…>>` 形态） */
  typed: boolean
}

function collectSources(dir: string, exts: string[], out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) collectSources(abs, exts, out)
    else if (ent.isFile() && exts.some((e) => ent.name.endsWith(e)) && !ent.name.endsWith('.test.ts')) out.push(abs)
  }
  return out.sort()
}

/** API 声明面：`.ts`（本仓 api 模块没有 `.vue`） */
const collectTs = (dir: string) => collectSources(dir, ['.ts'])

/**
 * 切出每条 export 声明的正文：到下一条 `export` 为止。
 * 在**掩码后**的文本上切——掩码保持逐字节等长，所以行号仍然可信。
 */
function splitDeclarations(masked: string): Array<{ name: string; index: number; body: string }> {
  const marks: Array<{ name: string; index: number }> = []
  for (const m of masked.matchAll(DECL_START_RE)) marks.push({ name: m[1], index: m.index })
  return marks.map((mark, i) => {
    const end = marks[i + 1]?.index ?? masked.length
    return { name: mark.name, index: mark.index, body: masked.slice(mark.index, end) }
  })
}

/** 扫描一个文件的读取类声明，返回裸泛型站点 */
function scanReaders(src: string, file: string): ReaderDecl[] {
  const masked = muteNonCode(src)
  return splitDeclarations(masked)
    .filter((d) => READER_PREFIX.test(d.name))
    .map((d) => ({
      name: d.name,
      file,
      bareLines: lineHits(d.body, BARE_GENERIC_RE).map((l) => l + src.slice(0, d.index).split('\n').length - 1),
      typed: /\bPromise<\s*(?:AjaxResult|TableDataInfo)</.test(d.body)
    }))
}

const rel = (p: string) => p.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')
const apiFiles = collectTs(API_DIR)
const readers = apiFiles.flatMap((f) => scanReaders(readFileSync(f, 'utf8'), rel(f)))

/**
 * 第二条腿：`getConfigKey(...)` 的返回值绑定名，随后不得被读 `.msg`。
 * 两种真实形状都要认（b86 修复后的两处消费点各用一种）：
 * `const res = await getConfigKey(…)` 与 `getConfigKey(…).then((response: …) => …)`。
 */
function getConfigKeyViolations(src: string, file: string): string[] {
  const masked = muteNonCode(src)
  const names = new Set<string>()
  for (const m of masked.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:await\s+)?getConfigKey\s*\(/g)) {
    names.add(m[1])
  }
  for (const m of masked.matchAll(/getConfigKey\s*\([^()]*\)\s*\.then\s*\(\s*\(?([A-Za-z0-9_$]+)/g)) {
    names.add(m[1])
  }
  const out: string[] = []
  for (const name of names) {
    const lines = lineHits(masked, new RegExp(`\\b${name}\\s*\\.\\s*msg\\b`, 'g'))
    for (const line of lines) out.push(`${file}:${line} ${name}.msg`)
  }
  return out
}

/**
 * 消费点面：`.ts` **与 `.vue`**。
 * 这一条是变异证伪逼出来的：第一版只收 `.ts`，于是把 `views/system/user/index.vue` 的
 * `response.data` 改回 `response.msg`（正是 b86 §6 那个缺陷形状）后 msg 腿**照常绿**——
 * 所有真实消费点都在 `.vue` 里，只收 `.ts` 的采集面等于这条腿从来没跑过。
 */
const srcFiles = collectSources(SRC_DIR, ['.ts', '.vue'])

describe('API 载荷类型守卫 · 读取类必须声明泛型 + getConfigKey 不得读 msg', () => {
  it('采集面自证：读取类声明收进 >= 100 条，且其中带泛型的 >= 60 条', () => {
    // 下限挡的是"扫描器自己坏了"这一支：刀口取不到声明时 readers 会是空集，
    // 那条 0 违规的判据就同时被"约定成立"与"什么都没扫"两种相反状态满足。
    expect(readers.length, `读取类声明条数（实测 ${readers.length}）`).toBeGreaterThanOrEqual(100)
    expect(apiFiles.length, `src/api 下生产 .ts 文件数`).toBeGreaterThanOrEqual(50)
    const typed = readers.filter((r) => r.typed).length
    expect(typed, `其中显式带 <T> 的条数（实测 ${typed}）`).toBeGreaterThanOrEqual(60)
    // 条数由守卫自打：台账/AGENTS 只引用这一行，不抄数（抄一次就漂一次，见 b83 前言 ⑮ 的同一自曝）
    console.warn(
      `[ajaxResultType] 采集面 ${apiFiles.length} 个 .ts / 读取类声明 ${readers.length} 条 ` +
        `（带泛型 ${typed}）/ 裸返回 0 处 / msg 站点 0 处 / msg 腿文件面 ${srcFiles.length} 个`
    )
    // msg 腿的采集面必须真的含 `.vue`：真实消费点全在视图里，视图没进面 = 这条腿没跑
    expect(
      srcFiles.filter((f) => f.endsWith('.vue')).length,
      'src 下 .vue 生产文件数（msg 腿的消费点宿主）'
    ).toBeGreaterThanOrEqual(100)
    expect(
      srcFiles.some((f) => rel(f) === 'src/views/system/user/index.vue'),
      'user 视图必须在 msg 腿的采集面里'
    ).toBe(true)
  })

  it('真实树：读取类声明 0 处裸 Promise<AjaxResult> / Promise<TableDataInfo>', () => {
    const violations = readers.filter((r) => r.bareLines.length > 0)
    expect(
      violations.map((v) => `${v.file} → ${v.name}:${v.bareLines.join(',')}`),
      '读取类 API 的载荷类型必须在返回注解里写出来（`data?: unknown` 让调用点读错字段毫无信号，见 b86 §6）'
    ).toEqual([])
  })

  it('真实树：getConfigKey 的结果没有被任何站点当 .msg 读', () => {
    const hits = srcFiles.flatMap((f) => getConfigKeyViolations(readFileSync(f, 'utf8'), rel(f)))
    expect(hits, '`getConfigKey` 生效值在 data，msg 恒是提示文案（b86 §6 实测缺陷）').toEqual([])
  })

  it('真实树正控：两处消费点与声明侧的修复都还在（不是"扫描面为空所以绿"）', () => {
    for (const s of ['src/permission.ts', 'src/views/system/user/index.vue']) {
      const src = readFileSync(resolve(VUE_ROOT, s), 'utf8')
      expect(src, `${s} 必须真的调用 getConfigKey`).toMatch(/getConfigKey\s*\(/)
    }
    // 声明侧：b86 §6 的修复必须仍是 `AjaxResult<string>`，退成裸返回时第 2 条腿与这条同时红
    expect(
      muteNonCode(readFileSync(resolve(VUE_ROOT, 'src/api/system/config.ts'), 'utf8')),
      'getConfigKey 的返回类型必须带 <string>'
    ).toMatch(/Promise<\s*AjaxResult<\s*string\s*>\s*>/)
    // 掩码后的读取形状必须数得到，且**就是 b86 修掉的那两行**（按名字匹配会撞上同文件里
    // 其它同名绑定——实测 user/index.vue 有 4 处 `response.data`，所以判据锚到赋值目标）
    const maskedUser = muteNonCode(readFileSync(resolve(VUE_ROOT, 'src/views/system/user/index.vue'), 'utf8'))
    expect(
      lineHits(maskedUser, /\binitPassword\.value\s*=\s*response\.data\b/g).length,
      'user/index.vue 必须把 data 当初始密码'
    ).toBe(1)
    const maskedGuard = muteNonCode(readFileSync(resolve(VUE_ROOT, 'src/permission.ts'), 'utf8'))
    expect(
      lineHits(maskedGuard, /\bapplyPlatformSideTheme\(\s*res\?\.data\s*\)/g).length,
      'permission.ts 必须把 data 交给主题旋钮'
    ).toBe(1)
  })

  it('每个被扫文件的掩码长度不变式（报在第 N 行这句话本身必须可信）', () => {
    let checked = 0
    for (const f of new Set([...apiFiles, ...srcFiles])) {
      const src = readFileSync(f, 'utf8')
      expect(muteNonCode(src).length, `${rel(f)} 掩码后长度必须与原文相等`).toBe(src.length)
      checked++
    }
    expect(checked, '逐文件长度对账的次数').toBeGreaterThanOrEqual(apiFiles.length)
  })

  it('控制组：刀口双向有效（裸 getter 必须抓到；typed、写操作、注释反例必须不抓）', () => {
    const cases: Array<{ title: string; src: string; bare: number; msg: number }> = [
      {
        title: '裸 Promise<AjaxResult> 的 getXxx ⇒ 必须命中 1 处',
        src: `export function getInitPassword(): Promise<AjaxResult> {\n  return request({ url: '/x', method: 'get' })\n}\n`,
        bare: 1,
        msg: 0
      },
      {
        title: '裸 Promise<TableDataInfo> 的 listXxx ⇒ 必须命中 1 处',
        src: `export function listThings(): Promise<TableDataInfo> {\n  return request({ url: '/x', method: 'get' })\n}\n`,
        bare: 1,
        msg: 0
      },
      {
        title: 'cachedApi 包装：外层无注解、内层箭头裸 ⇒ 必须命中 1 处（getConfigKey 的真实形状）',
        src: `export const getConfigValue = cachedApi(\n  (k: string) => \`c:\${k}\`,\n  (k: string): Promise<AjaxResult> => request({ url: '/x/' + k, method: 'get' })\n)\n`,
        bare: 1,
        msg: 0
      },
      {
        title: '带泛型的 getXxx ⇒ 必须 0 命中',
        src: `export function getConfig(configId: number): Promise<AjaxResult<SysConfig>> {\n  return request({ url: '/x', method: 'get' })\n}\n`,
        bare: 0,
        msg: 0
      },
      {
        title: '写操作裸返回 ⇒ 必须 0 命中（判据做窄：del/update/add 结构上无载荷）',
        src: `export function delConfig(configId: number | string): Promise<AjaxResult> {\n  return request({ url: '/x', method: 'delete' })\n}\nexport function updateConfig(data: SysConfig): Promise<AjaxResult> {\n  return request({ url: '/x', method: 'put', data })\n}\nexport function addConfig(data: SysConfig): Promise<AjaxResult> {\n  return request({ url: '/x', method: 'post', data })\n}\n`,
        bare: 0,
        msg: 0
      },
      {
        title: '注释与字符串里的反例文本 ⇒ 必须 0 命中（掩码器在位）',
        src: `// export function getLegacy(): Promise<AjaxResult> { … } 旧写法说明\nexport function getReal(): Promise<AjaxResult<string>> {\n  const doc = 'Promise<AjaxResult> 只是文档里的例子'\n  void doc\n  return request({ url: '/x', method: 'get' })\n}\n`,
        bare: 0,
        msg: 0
      },
      {
        title: 'await 绑定后读 .msg ⇒ msg 腿必须命中 1 处',
        src: `const res = await getConfigKey('sys.user.initPassword')\npassword.value = res.msg\n`,
        bare: 0,
        msg: 1
      },
      {
        title: '.then((response) => …) 里读 response.msg ⇒ msg 腿必须命中 1 处（b86 原缺陷形状）',
        src: `getConfigKey('sys.user.initPassword')\n  .then((response: AjaxResult<string>) => {\n    initPassword.value = response.msg\n  })\n`,
        bare: 0,
        msg: 1
      },
      {
        title: '读 .data 不报；别的 API 的 res.msg 不在本条腿范围内 ⇒ msg 腿 0 命中',
        src: `const res = await getConfigKey('sys.index.sideTheme')\nstore.apply(res.data)\nconst other = await listConfig(query)\nmodal.msgError(other.msg)\n`,
        bare: 0,
        msg: 0
      },
      {
        title: 'getConfigKey 的说明文字里写着 response.msg ⇒ 掩码后不得算站点',
        src: `// 此前这里读 response.msg，等于把提示文案当口令（批八十六取证的缺陷）\nconst response = await getConfigKey('a.b')\nvoid response.data\n`,
        bare: 0,
        msg: 0
      }
    ]

    let bareCaught = 0
    let msgCaught = 0
    for (const c of cases) {
      const found = scanReaders(c.src, 'synthetic.ts').reduce((n, r) => n + r.bareLines.length, 0)
      const msgHits = getConfigKeyViolations(c.src, 'synthetic.ts')
      bareCaught += c.bare
      msgCaught += c.msg
      // 行号可信性：命中数对上的同时，报出来的行必须落在被禁文本那一行
      if (c.bare) {
        const line = scanReaders(c.src, 'synthetic.ts').find((r) => r.bareLines.length)?.bareLines[0]
        expect(line, `${c.title} —— 命中行号`).toBeLessThanOrEqual(c.src.split('\n').length)
      }
      expect(found, c.title).toBe(c.bare)
      expect(msgHits.length, c.title).toBe(c.msg)
    }
    // 正控总量自证：两组各必须真有"必须被抓"的用例，否则上面全部 0 命中也是"绿"
    expect(bareCaught, '必须被抓到的裸返回用例数').toBeGreaterThanOrEqual(3)
    expect(msgCaught, '必须被抓到的 msg 用例数').toBeGreaterThanOrEqual(2)
  })

  it('差异法活性：往真实文件末尾追加一条裸 getter，命中数必须 +1', () => {
    const file = resolve(API_DIR, 'system/config.ts')
    const src = readFileSync(file, 'utf8')
    const before = scanReaders(src, rel(file)).reduce((n, r) => n + r.bareLines.length, 0)
    const after = scanReaders(
      src +
        `\nexport function getSyntheticProbe(configKey: string): Promise<AjaxResult> {\n  return request({ url: '/x', method: 'get' })\n}\n`,
      rel(file)
    ).reduce((n, r) => n + r.bareLines.length, 0)
    expect(before, '真实树这一条必须先是 0').toBe(0)
    expect(after - before, '插入一条合成违规后增量').toBe(1)
  })
})
