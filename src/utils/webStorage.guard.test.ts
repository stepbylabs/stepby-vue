/**
 * 静态守卫：浏览器存储只能经 `@/utils/webStorage` 这一条通道访问（b89 项 8）。
 *
 * ## 立案取证（本轮实测，不是推断）
 *
 * 改造前 `src/**` 生产码里有 **18 处**裸 `localStorage.*` / `sessionStorage.*`，分散在
 * 6 个文件、各有三种互不相同的"防御姿势"：
 *
 * | 形状 | 站点 | 坏在哪 |
 * |---|---|---|
 * | `if (!localStorage) return` | plugins/cache.ts（两份复制粘贴） | 挡的是"全局对象不存在"（只在非浏览器环境成立）。Safari 隐私模式 / Chrome「阻止站点数据」下**读这个属性本身就抛 SecurityError**，守卫表达式自己先炸 |
 * | `try { … } catch { /* ignore *\/ }` | CookieConsent、oauth.ts | 把失败吞成"什么都没发生"：handoff 存不下仍提示"登录后自动绑定"，用户照做之后绑定无声丢失 |
 * | **一处守卫都没有** | store/modules/lock.ts（7 处）、routerError.ts（2 处） | 配额满时 `setItem` 抛 `QuotaExceededError` 直接穿到调用点；`removeItem` 全仓**一处**守卫都没有 |
 *
 * `routerError.ts` 那一处最说明问题：它在 `router.onError` 里读 `sessionStorage`，
 * 于是**"chunk 加载失败"这条兜底路径自己会抛**——白屏从"资源 404"变成"兜底逻辑崩了"。
 * 而同一个函数用 `sessionStorage` 当"最多刷一次"的循环防护：存储被禁时防护消失，
 * 剩下的就是无限刷新（自造 DDoS）。
 *
 * ## 判据
 *
 * 掩码后的代码视图里出现 `(window.)?(local|session)Storage` 后跟 `.` 或 `[` ⇒ 违规。
 * 唯一允许的文件 = 通道本身（下表，逐条带自足理由）。
 *
 * 面：递归 `src/**` 的 `.ts` + `.vue`（`.vue` 只取 `<script>` 区间，模板与样式等长置空——
 * 理由与"globalProperties 不得再挂存储"那条锁见 `e2eSuiteScanKit::blankOutsideVueScripts`）。
 * 视图单测与 jsdom polyfill 不进来（它们**必须**能碰全局对象本身，否则没法伪造浏览器）。
 *
 * ## 为什么不做成"棘轮往下爬"
 *
 * 本批把 18 处**全部**收敛完了，所以现行值是 0 而不是"从 18 起降"。
 * 一个已经归零的集合签成棘轮基线，等于给"下次再裸写一处"预留了合法通道（AGENTS 前言 ⑯(c)
 * 同族：前置条件不成立的判据是负资产）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  blankOutsideVueScripts,
  collectByExt,
  EXCLUDED_DIRS,
  lineNumberAt,
  muteNonCode,
  plantInVueScript
} from './e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

/** 通道本身的文件名（相对 `src`）——唯一允许裸访问生产存储的地方 */
const CHANNEL_FILE = 'utils/webStorage.ts'

interface AllowedSite {
  /** 相对 `src` 的路径 */
  file: string
  /** 逐条自足的理由（禁止"同上"类跨条目指代：条目集合一变，指代就指向另一条理由） */
  why: string
}

/**
 * 豁免表。条目必须**逐条自足**——这条纪律在本仓有四张 JS 侧表由
 * `tests/e2e/producer-kit.mjs::selfContainedWhyViolation` 统一执行；TS 侧守卫与它是两个世界
 * （`.mjs` 不能被 `vue-tsc` 解析的 TS 用例安全 import），所以这里各写一份**同样口径**的判据，
 * 并由下面那条"坏理由必须被抓"的用例证它真的生效（同 AGENTS 前言 ㉘）。
 */
const ALLOWED: AllowedSite[] = [
  {
    file: CHANNEL_FILE,
    why: '存储通道的唯一实现点：`window.localStorage` / `window.sessionStorage` 只允许在这里被读一次，其余全仓一律经它导出的 getItem/setItem/removeItem/getJSON/setJSON/storageAvailable'
  },
  {
    file: 'test/setup.ts',
    why: 'Vitest 的 jsdom 垫片：存储不可用时要**伪造一个 Storage 实现**挂回 globalThis，这必须直接接触全局对象本身，且该目录只被 vitest.config 的 setupFiles 引用，不进生产包'
  }
]

const WHY_MIN_LEN = 12
/**
 * 裸访问的判据形状。
 *
 * ⚠️ 这里**故意**不要求后面跟 `.` 或 `[`。第一版写的是 `localStorage\s*[.[])`，
 * 于是"通道自身"那条用例当场红：`return kind === 'local' ? window.localStorage : …`
 * 是把存储对象当**值**取走，一个字符都不差地绕过了判据——而别名取值正是最省事的绕过写法
 * （`const s = localStorage; s.setItem(…)` 里根本没有 `localStorage.`）。
 * 同类教训见前言 ⑬（"锁的输入非空且形状对"）与 ⑯(a)：新写判据必须先假设有洞。
 * `\b` 收尾保证 `localStorageCache` 这类同名变量不被误报。
 */
const RAW_STORAGE_RE = /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\b/g

function walkFiles(relDir: string): string[] {
  return [
    ...collectByExt(SRC_DIR, relDir, '.ts', EXCLUDED_DIRS),
    ...collectByExt(SRC_DIR, relDir, '.vue', EXCLUDED_DIRS)
  ].sort()
}

/** 采集面：全 src，剔掉视图/工具单测与通道本身 */
const FACE: string[] = (() => {
  const allowed = new Set(ALLOWED.map((a) => a.file))
  return walkFiles('').filter((rel) => !rel.endsWith('.test.ts') && !allowed.has(rel))
})()

/** 掩码后的采集视图（`.vue` 只保留 `<script>` 区间，保证行号仍对得上原文） */
function maskedView(rel: string, src: string): string {
  return muteNonCode(rel.endsWith('.vue') ? blankOutsideVueScripts(src) : src)
}

interface Hit {
  rel: string
  line: number
}

/** 纯判据：给一份源码，返回裸存储访问点的行号（真实树与合成夹具共用同一条路径） */
export function scanRawStorage(rel: string, src: string): Hit[] {
  const masked = maskedView(rel, src)
  const hits: Hit[] = []
  for (const m of masked.matchAll(RAW_STORAGE_RE)) {
    hits.push({ rel, line: lineNumberAt(masked, m.index ?? 0) })
  }
  return hits
}

/** 判"一条豁免理由是否自足"（短理由与跨条目指代都等于没登记） */
export function whyViolation(why: string): string | null {
  const text = (why ?? '').trim()
  if (text.length < WHY_MIN_LEN) return `理由长度 ${text.length} < ${WHY_MIN_LEN}（空/半句理由等于没登记）`
  if (/同上|见上|同上一条|同上条/.test(text)) return '理由使用跨条目指代（条目集合一变就指向另一条理由）'
  return null
}

describe('存储单点守卫：裸 localStorage/sessionStorage 只允许出现在 webStorage 通道里', () => {
  it('采集面自证：面由事实派生、体量够大、豁免表内不得混进真实站点', () => {
    expect(FACE.length, 'src 下参与判据的文件数（腰斩即说明目录规则落后于事实）').toBeGreaterThanOrEqual(400)
    expect(
      FACE.filter((r) => r.endsWith('.vue')).length,
      '面内必须有 .vue（否则模板/脚本切分那半边从未被执行过）'
    ).toBeGreaterThanOrEqual(50)
    // 已知入口必须进面：这些文件本批刚从"裸访问"改成走通道
    for (const must of [
      'plugins/cache.ts',
      'store/modules/lock.ts',
      'store/modules/settings.ts',
      'utils/routerError.ts',
      'utils/oauth.ts',
      'utils/sideTheme.ts',
      'components/CookieConsent/index.vue',
      'views/oauthlogin.vue'
    ]) {
      expect(FACE, `扫描面必须包含 ${must}`).toContain(must)
    }
    // 剔除方向必须对：测试文件不得进面，通道文件不得进面
    expect(FACE.some((r) => r.endsWith('.test.ts'))).toBe(false)
    expect(FACE.includes(CHANNEL_FILE)).toBe(false)
    // 反向自证：面不是靠"扫不到文件"得到的 0 违规
    const totalChars = FACE.reduce((acc, rel) => acc + readFileSync(resolve(SRC_DIR, rel), 'utf8').length, 0)
    expect(totalChars, '采集面字符量（防"扫到空集合"那种恒绿）').toBeGreaterThan(100_000)
    console.warn(`[webStorage] 扫描面 ${FACE.length} 个文件（.ts + .vue）/ 裸存储访问 0 处 / 豁免 ${ALLOWED.length} 条`)
  })

  it('真实树：面内裸存储访问必须 0 处', () => {
    const violations: string[] = []
    for (const rel of FACE) {
      for (const hit of scanRawStorage(rel, readFileSync(resolve(SRC_DIR, rel), 'utf8'))) {
        violations.push(`${hit.rel}:${hit.line}`)
      }
    }
    expect(violations, `绕过 webStorage 通道的存储访问：\n${violations.join('\n')}`).toEqual([])
  })

  it('通道自身必须真的有那句裸访问（否则"唯一通道"是个空壳）', () => {
    // 排除是按**路径**做的，不是按内容：这条同时证两件事——
    // ① 判据认得这个形状（不是"正则写坏了所以全绿"）；② 排除条目真的在承重（摘掉就红）。
    const src = readFileSync(resolve(SRC_DIR, CHANNEL_FILE), 'utf8')
    const hits = scanRawStorage(CHANNEL_FILE, src)
    expect(hits.length, '通道内必须数得到裸 localStorage/sessionStorage 读取点').toBeGreaterThanOrEqual(1)
    // 且只允许集中在**同一行**：出现第二个行号 = 有人在通道里又开了一条侧门。
    // 锚点取**生产语句原文**（`rawStore` 那一行），不取"文件里第一个 window.localStorage"——
    // 后者落在模块文档第 10 行的反例说明里，而注释不参与判定，拿它当期望值会得到
    // "恒假比较 + 看起来像判据"的组合（前言 ⑯(a)：判据读的必须是全文与事实，不是显示段）。
    const anchor = "return kind === 'local' ? window.localStorage"
    expect(src).toContain(anchor)
    const lines = [...new Set(hits.map((h) => h.line))]
    expect(lines, `通道内的裸访问必须只出现在一处，实得行号 ${lines.join(',')}`).toEqual([
      lineNumberAt(src, src.indexOf(anchor))
    ])
  })

  it('豁免表逐条自足，且每条都指向真实存在的文件', () => {
    const bad: string[] = []
    for (const a of ALLOWED) {
      const v = whyViolation(a.why)
      if (v) bad.push(`${a.file}: ${v}`)
      // 豁免指向不存在的文件 = 那条豁免是给"未来的裸写站点"预留的合法通道
      expect(() => readFileSync(resolve(SRC_DIR, a.file), 'utf8'), `豁免条目 ${a.file} 的文件读不到`).not.toThrow()
    }
    expect(bad, `豁免理由不合格：\n${bad.join('\n')}`).toEqual([])
    expect(new Set(ALLOWED.map((a) => a.file)).size, '豁免表内文件路径不得重复登记').toBe(ALLOWED.length)
    // 正控（AGENTS 前言 ⑥：反脆弱必须配一条真能转红的用例）：坏形状必须被抓
    const caught = ['', '同上', '见上一条', 'ok', '  ', '同上一条同一判据'].map((w) => whyViolation(w)).filter(Boolean)
    expect(caught.length, '短理由与指代类理由都必须被拒').toBe(6)
    expect(whyViolation('这是足够长且逐条自足的一条理由')).toBeNull()
  })

  it('前提锁：globalProperties 不得把存储重新挂回模板可见的作用域', () => {
    // 本判据刻意不把 `.vue` 模板区间放进采集面，前提是 Vue 3 实例代理**不回落全局对象**
    // （模板里写 `localStorage.x` 取到 undefined）。这个前提一旦被人破坏（M-12 之前
    // globalProperties 上就挂着 $cache），"模板不算违规"立刻变成漏检——所以把它锁住而不是写在注释里。
    const plugins = readFileSync(resolve(SRC_DIR, 'plugins/index.ts'), 'utf8')
    const assignments = [...plugins.matchAll(/app\.config\.globalProperties\.\$?\w+\s*=\s*([^\n]+)/g)]
    expect(assignments.length, 'globalProperties 赋值站点必须数得到（这条判据不得空跑）').toBeGreaterThanOrEqual(1)
    for (const [, rhs] of assignments) {
      expect(rhs, `globalProperties 被挂上存储 ⇒ 模板进面的前提失效，本守卫必须扩面：${rhs}`).not.toMatch(
        /localStorage|sessionStorage/
      )
    }
  })

  it('合成双向 · 四种裸写形状全部必须被抓且报出真实行号', () => {
    const cases: Array<[string, string, number]> = [
      ['ts 里读', "import x from 'y'\nconst v = localStorage.getItem('k')\n", 2],
      ['ts 里写', 'sessionStorage.setItem("k", v)\n', 1],
      ['window 前缀', 'window.localStorage.removeItem(k)\n', 1],
      ['方括号取值', 'const s = window.sessionStorage["getItem"]\n', 1],
      [
        'vue 脚本里读',
        '<template>\n  <p>t</p>\n</template>\n\n<script setup lang="ts">\nlocalStorage.clear()\n</script>\n',
        6
      ]
    ]
    for (const [label, src, line] of cases) {
      const rel = label.includes('vue') ? 'synthetic/Probe.vue' : 'synthetic/probe.ts'
      const hits = scanRawStorage(rel, src)
      expect(hits.length, `${label}：期望 1 处`).toBe(1)
      expect(hits[0].line, `${label}：行号必须落在裸访问那一行`).toBe(line)
    }
  })

  it('合成双向 · 注释与字符串里的同名文本不得算违规', () => {
    const cases: Array<[string, string]> = [
      ['行注释', '// 原先这里是 localStorage.getItem(LOCK_KEY)、一处 try/catch 都没有\nconst a = 1\n'],
      ['块注释', '/** 配额满时 localStorage.setItem 会抛 QuotaExceededError */\nconst a = 1\n'],
      ['字符串字面量', "console.warn('不要用 sessionStorage.getItem 直接读')\n"],
      ['模板字符串', 'const doc = `window.localStorage 在本仓只允许出现一次`\n'],
      [
        'vue 模板属性（作用域里没有这个全局）',
        '<template>\n  <p title="localStorage.getItem 是反例">t</p>\n</template>\n<script setup lang="ts">\nconst a = 1\n</script>\n'
      ]
    ]
    for (const [label, src] of cases) {
      const rel = label.startsWith('vue') ? 'synthetic/Counter.vue' : 'synthetic/counter.ts'
      expect(scanRawStorage(rel, src), `反例形状被当成违规：${label}\n${src}`).toEqual([])
      // 反证文本必须真含关键字，否则这条只是空跑（同 e2eCwdPath 那条自证）
      expect(src).toMatch(/localStorage|sessionStorage/)
    }
    // 同一形状去掉注释外壳必须立刻被抓到（证"不参与"是掩码生效，不是判据没跑）
    expect(scanRawStorage('synthetic/counter.ts', 'localStorage.getItem(LOCK_KEY)\n').length).toBe(1)
  })

  // 共用掩码器的真实缺陷形状：`return /[",\r\n]/` 曾被当成除法，正则里的引号
  // 开启一段永不闭合的字符串 ⇒ 文件余下部分（含追加在末尾的合成违规）整片被掩掉。
  // 这条直接喂纯判据，不依赖任何真实文件当前是否恰好含这个形状。
  it('扫描器：关键字后的正则字面量不得吞掉文件余下部分', () => {
    const src =
      'function f(v: string) { return /[",\\r\\n]/.test(v) ? 1 : 2 }\n' + "const probe = localStorage.getItem('x')\n"
    const hits = scanRawStorage('synthetic/keywordRegex.ts', src)
    expect(hits).toHaveLength(1)
    expect(hits[0].line).toBe(2)
    // 反证：属性名不是关键字，不得因此把 `foo.return / 2` 后面的引号当正则吃掉
    const notRegex = 'const r = foo.return / 2\nconst s = localStorage.getItem("y")\n'
    expect(scanRawStorage('synthetic/propertyDivision.ts', notRegex)).toHaveLength(1)
  })

  it('刀口活性：每个能承载违规的被扫文件插入一条合成违规，命中数必须 +1', () => {
    const planted = "localStorage.getItem('__web_storage_guard_probe__')"
    let caught = 0
    const noScriptRegion: string[] = []
    const missed: string[] = []
    for (const rel of FACE) {
      const src = readFileSync(resolve(SRC_DIR, rel), 'utf8')
      const base = scanRawStorage(rel, src).length
      const mutated = rel.endsWith('.vue') ? plantInVueScript(src, planted) : `${src}\n${planted}\n`
      if (rel.endsWith('.vue') && mutated === src) {
        noScriptRegion.push(rel)
        continue
      }
      // 长度不变式：掩码只置空、不删字符 ⇒ 掩码后的行号仍等于原文行号。
      // 这条必须在**插入之后**判（插入内容本身含引号与括号，最容易把状态机带偏的就是它）。
      expect(maskedView(rel, mutated).length, `掩码改变了 ${rel} 的长度 ⇒ 本用例报出的行号不再可信`).toBe(
        mutated.length
      )
      if (scanRawStorage(rel, mutated).length === base + 1) {
        caught++
      } else {
        missed.push(rel)
      }
    }
    // 没有 `<script>` 的 SFC（实测只有 `components/ParentView/index.vue` 这种纯 `<router-view/>`
    // 壳）结构上承载不了存储调用——模板作用域里没有这个全局。放行它们，但**逐条核对成因**：
    // 只有"原文里真的一个 script 开始标签都没有"才允许落进这个桶，
    // 否则就是探针插失败却被读成"这个文件不需要覆盖"（AGENTS ⑥：不得把工具坏洗成豁免）。
    for (const rel of noScriptRegion) {
      expect(
        /<script\b/i.test(readFileSync(resolve(SRC_DIR, rel), 'utf8')),
        `${rel} 有 <script> 却没插进探针 ⇒ 活性自证的刀口坏了`
      ).toBe(false)
    }
    expect(caught, `每条合成违规都必须让命中数 +1；未被抓住的文件：${missed.join(', ') || '(无)'}`).toBe(
      FACE.length - noScriptRegion.length
    )
    console.warn(
      `[webStorage] 活性自证覆盖 ${caught}/${FACE.length} 个文件（另 ${noScriptRegion.length} 个无 <script> 区间，逐条核对过成因）`
    )
    // 差异法的对照：不插入时命中数必须仍是 base（防"任何改动都 +1"那种恒真好）
    const sample = FACE[0]
    const src = readFileSync(resolve(SRC_DIR, sample), 'utf8')
    expect(scanRawStorage(sample, src).length).toBe(0)
  })
})
