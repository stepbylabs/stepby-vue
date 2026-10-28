/**
 * Service Worker 运行时缓存策略的形状锁（b115）
 *
 * 立的案（真机取证，b115 台账 §1）：旧策略把服务端标了 `Cache-Control: no-store` 的
 * API 响应写进 `stepby-api`（断网回放 200/744B/3ms），并按扩展名把**受鉴权**的
 * `/uploads/**` 预览图写进 `stepby-static`（断网回放 200/70B/4ms）；全仓 `caches.delete`
 * 一处都没有 ⇒ 缓存活过会话边界。
 *
 * 判据不读源码文本，而是**调用产出规则的那个纯函数**，把真实的 `urlPattern` 跑一遍：
 * - **样本一律是绝对 URL**：workbox 的 `RegExpRoute` 拿 `request.url`（`http://host/…`）去 `.test()`。
 *   b115 自曝过一次：规则写成 `^/static/`（路径形态）在真实运行时**永不命中**，而当时的单测
 *   喂的是相对路径 ⇒ 死规则照常绿。夹具的形状必须等于生产码真实产出的形状（前言 ㉓）。
 * - API 基址从 `.env.*` 派生（含空基址的嵌入档），逐个断言"没有任何规则命中"；
 * - 对照组：显式 opt-in 档**必须**命中（证明匹配器与 URL 样本都真的受约束）；
 * - `/uploads/**` 在**两档**都不得命中；公共静态目录必须命中（缓存能力没被砍掉）；
 * - 合成违规（扩展名规则、裸 API 规则、路径形态锚点）必须被抓到（判据自身可证伪）；
 * - 接线反查收窄到**函数体**（㊴：不了整份文件，否则别的字面量会把变异洗绿）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, posix } from 'node:path'
import { API_URL_PATTERN, PUBLIC_STATIC_URL_PATTERN, buildRuntimeCaching } from '../../vite/plugins/pwaRuntimeCaching'
import { API_CACHE, LEGACY_SW_CACHES, PUBLIC_STATIC_CACHE } from './swCache'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
}

/** 解析 `.env.*`：只取 `KEY = 'value'` 形态的生效行，注释与空行忽略 */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

/** 采集面：仓库里所有档位的 API 基址（含空串的嵌入档——它由"不命中"这件事本身证明） */
function apiBases(): Array<{ file: string; base: string }> {
  return ['.env.development', '.env.production', '.env.staging', '.env.embedded', '.env.analyze'].map((f) => ({
    file: f,
    base: parseEnv(read(f)).VITE_APP_BASE_API ?? ''
  }))
}

interface Rule {
  urlPattern: RegExp
  handler: string
  method?: string
  options?: Record<string, unknown>
}

/** 判据本体：哪些规则会拦到这个 URL（传进来的必须是绝对 URL，与 workbox 的真实输入同形） */
function matchingRules(rules: Rule[], url: string): Rule[] {
  return rules.filter((r) => r.urlPattern instanceof RegExp && r.urlPattern.test(url))
}

/** 判据自己的 origin 样本：只用于拼绝对 URL，不参与"是否必须命中"的判定 */
const ORIGIN = 'http://localhost:8080'

const LIST_URL = '/system/user/list?pageNum=1&pageSize=10'
const UPLOAD_URL = '/uploads/0/file/9b1c-probe.png'
const PUBLIC_ASSET_URLS = ['/static/js/index-abc123.js', '/static/webp/login.webp', '/pwa/icon.svg']

const absolute = (path: string): string => `${ORIGIN}${path}`

describe('PWA 运行时缓存策略（b115）', () => {
  it('采集面自证：至少三个非空 API 基址被逐个核对', () => {
    const bases = apiBases()
    expect(bases.length, '五个环境档都要读得到').toBe(5)
    const nonEmpty = [...new Set(bases.filter((b) => b.base).map((b) => b.base))]
    expect(nonEmpty.length, '至少要覆盖 dev/prod/staging 三个前缀').toBeGreaterThanOrEqual(3)
    expect(nonEmpty.sort()).toEqual(['/dev-api', '/prod-api', '/stage-api'])
  })

  it('形状锁：真实规则的匹配器必须命中**绝对 URL**（路径形态的正则在此必红）', () => {
    const off = buildRuntimeCaching('off') as unknown as Rule[]
    const optIn = buildRuntimeCaching('network-first') as unknown as Rule[]
    // 每条规则自己的正样本（与下面"该命中/不该命中"的取样同源）
    expect(matchingRules(off, absolute('/static/webp/login.webp')), '公共静态规则必须能命中绝对 URL').toHaveLength(1)
    for (const { base } of apiBases()) {
      if (!base) continue
      expect(
        matchingRules(optIn, absolute(`${base}${LIST_URL}`)),
        `${base} 的 API 规则必须能命中绝对 URL`
      ).toHaveLength(1)
    }
    // 反证：把同一条规则写成"路径形态"锚点就一条都不命中 —— 这正是 b115 自曝的那个缺陷形状
    const pathFormRule: Rule = { urlPattern: /^\/(?:static|assets|pwa)\//, handler: 'StaleWhileRevalidate' }
    expect(matchingRules([pathFormRule], absolute('/static/webp/login.webp'))).toHaveLength(0)
  })

  it('默认档：没有任何规则命中任何档位的 API 列表 URL', () => {
    for (const mode of [undefined, '', 'off', 'oops']) {
      const rules = buildRuntimeCaching(mode) as unknown as Rule[]
      for (const { file, base } of apiBases()) {
        if (!base) continue
        const hits = matchingRules(rules, absolute(`${base}${LIST_URL}`))
        expect(
          hits.map((h) => h.handler),
          `${file} 的 ${base} 在默认档下不得命中任何缓存规则`
        ).toEqual([])
      }
    }
  })

  it('默认档：受鉴权的上传预览（含 png 扩展名）不得命中任何规则', () => {
    const rules = buildRuntimeCaching('off') as unknown as Rule[]
    expect(matchingRules(rules, absolute(UPLOAD_URL)).map((r) => r.handler)).toEqual([])
    // 反证：旧实现用的扩展名规则确实会命中它（否则上面的断言是空转的）
    const legacyExtensionRule: Rule = {
      urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|woff2?)$/,
      handler: 'StaleWhileRevalidate'
    }
    expect(matchingRules([legacyExtensionRule], absolute(UPLOAD_URL))).toHaveLength(1)
  })

  it('公共静态目录仍进缓存（缓存能力没被砍掉），且只认 200', () => {
    const rules = buildRuntimeCaching('off') as unknown as Rule[]
    for (const path of PUBLIC_ASSET_URLS) {
      const hits = matchingRules(rules, absolute(path))
      expect(hits, `${path} 必须命中公共静态规则`).toHaveLength(1)
      expect(hits[0].handler).toBe('StaleWhileRevalidate')
      expect(hits[0].options?.cacheName).toBe(PUBLIC_STATIC_CACHE)
      expect(hits[0].options?.cacheableResponse).toEqual({ statuses: [200] })
    }
    expect(PUBLIC_STATIC_URL_PATTERN.test(absolute(UPLOAD_URL))).toBe(false)
  })

  it('对照组：显式 opt-in 档必须命中 API（证明匹配器与样本真的受约束）', () => {
    const rules = buildRuntimeCaching('network-first') as unknown as Rule[]
    for (const { file, base } of apiBases()) {
      if (!base) continue
      const hits = matchingRules(rules, absolute(`${base}${LIST_URL}`))
      expect(
        hits.map((h) => h.handler),
        `${file} 的 ${base} 在 opt-in 档下必须命中`
      ).toEqual(['NetworkFirst'])
      expect(hits[0].options?.cacheName).toBe(API_CACHE)
      expect(hits[0].options?.cacheableResponse).toEqual({ statuses: [200] })
      expect(
        Number(hits[0].options?.expiration && (hits[0].options.expiration as Record<string, unknown>).maxAgeSeconds)
      ).toBeLessThanOrEqual(60)
    }
    // opt-in 档同样不得碰上传预览（只多了 API 一条，不是"把静态规则放宽"）
    expect(matchingRules(rules, absolute(UPLOAD_URL))).toEqual([])
  })

  it('合成违规必抓：裸 API 规则与扩展名规则都会被判据点名', () => {
    const bad: Rule[] = [
      { urlPattern: API_URL_PATTERN, handler: 'NetworkFirst' },
      { urlPattern: /\.(?:png|jpg)$/, handler: 'StaleWhileRevalidate' }
    ]
    expect(matchingRules(bad, absolute('/prod-api/system/user/list'))).toHaveLength(1)
    expect(matchingRules(bad, absolute('/uploads/0/file/a.png'))).toHaveLength(1)
  })

  it('接线反查（刀口收窄到函数体）：viteEnv 进 createPwa、main 启动回收、登录/登出各清一次', () => {
    const pwa = read('vite/plugins/pwa.ts')
    const pwaBody = functionBody(pwa, 'createPwaPlugin')
    expect(pwaBody, 'createPwaPlugin 必须调用 buildRuntimeCaching(').toContain('buildRuntimeCaching(')
    expect(pwaBody, '档位必须来自 viteEnv（不能写死）').toContain('viteEnv.VITE_PWA_API_CACHE')
    expect(pwaBody, '旧缓存名不得再出现在配置里').not.toContain("'stepby-api'")
    expect(pwaBody).not.toContain('"stepby-api"')

    const pluginsIndex = read('vite/plugins/index.ts')
    expect(functionBody(pluginsIndex, 'createVitePlugins'), 'createPwa 必须收到 viteEnv').toContain(
      'createPwa(viteEnv)'
    )

    const main = read('src/main.ts')
    expect(main, '启动必须回收历史档').toContain('purgeLegacySwCaches()')

    const user = read('src/store/modules/user.ts')
    expect(functionBody(user, 'applyLoginToken'), '登录成功必须清一次（换账号不继承上一个凭据的缓存）').toContain(
      'purgeSessionSwCaches('
    )
    expect(functionBody(user, 'logOut'), '登出必须清一次').toContain('purgeSessionSwCaches(')
  })

  it('历史档名字不得被新策略复用（否则启动回收会误删新档 / 新档继承旧数据）', () => {
    const names = [PUBLIC_STATIC_CACHE, API_CACHE, ...LEGACY_SW_CACHES]
    expect(new Set(names).size).toBe(names.length)
    const pwa = read('vite/plugins/pwa.ts')
    for (const legacy of LEGACY_SW_CACHES) {
      expect(pwa.includes(`'${legacy}'`), `pwa.ts 不得硬编码旧缓存名 ${legacy}`).toBe(false)
    }
    expect(posix.normalize('vite/plugins/pwa.ts')).toBe('vite/plugins/pwa.ts')
  })
})

/** 取具名函数/方法的函数体（含花括号），跳过参数默认值、字符串与注释里的括号 */
function functionBody(source: string, name: string): string {
  const marker = new RegExp(`(?:function\\s+${name}\\s*\\(|(?:async\\s+)?${name}\\s*\\()`, 'g')
  const m = marker.exec(source)
  if (!m) throw new Error(`找不到函数 ${name}`)
  // 先跨过参数表（`viteEnv: Record<string, string> = {}` 这类默认值里就有花括号）
  const parenStart = source.indexOf('(', m.index)
  const parenEnd = matchDelimiter(source, parenStart, '(', ')')
  const braceStart = source.indexOf('{', parenEnd)
  if (braceStart < 0) throw new Error(`函数 ${name} 没有函数体`)
  const braceEnd = matchDelimiter(source, braceStart, '{', '}')
  return source.slice(braceStart, braceEnd + 1)
}

/** 从 open 位置开始匹配成对分隔符，跳过字符串与注释 */
function matchDelimiter(source: string, open: number, left: string, right: string): number {
  let depth = 0
  let i = open
  let quote: string | null = null
  while (i < source.length) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') i += 2
      else {
        if (ch === quote) quote = null
        i += 1
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      i += 1
      continue
    }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      i = nl < 0 ? source.length : nl + 1
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i)
      i = end < 0 ? source.length : end + 2
      continue
    }
    if (ch === left) depth += 1
    else if (ch === right) {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  throw new Error(`分隔符 ${left}${right} 未闭合（起点 ${open}）`)
}
