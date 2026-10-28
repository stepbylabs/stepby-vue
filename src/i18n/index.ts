/**
 * i18n 国际化配置
 *
 * 支持 zh-CN（默认）和 en-US 两种语言，语言切换通过 webStorage 持久化。
 *
 * ## b121：en-US 按需加载
 *
 * 历史：两份语言包（各 ~180KB raw）都静态 import，`i18n` chunk 因此 99KB gzip
 * 全部进首屏——而中文用户的绝大多数会话一次也不会切到英文。现在 zh-CN 静态内置
 * （默认与 fallback），en-US 改为 `import()`：只有"已保存 en-US"或用户主动切换时
 * 才下载（预期 ~40KB gzip 移出首屏）。
 *
 * 由此产生的三条语义（缺一条就是新的假成功）：
 *
 * 1. **启动前必须加载完**：`main.ts` 在 `app.use(router)` 之前 `await ensureInitialLocale()`，
 *    否则 permission 守卫会用中文标题渲染第一帧（语言闪烁）；
 * 2. **切换失败不得报成功**：`setLanguage` 返回 `{ ok, applied, persisted }`，
 *    加载失败保留原语言（`ok=false`），持久化失败仍切换但 `persisted=false`；
 * 3. **连点竞态只让最后一次生效**：切换是异步的（两次点击 = 两个在途加载），
 *    用 b119 的 `createLatestGuard` 发放票据，旧票据加载完成不得覆盖新选择。
 *
 * 非法持久化值（例如别处写入的 `fr`）回落 zh-CN 且不改写存储——读取侧只接受两个已知值。
 */
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import { getItem, setItem } from '@/utils/webStorage'
import { announceLanguageChanged } from '@/utils/crossTab'
import { createLatestGuard } from '@/composables/latestRequest'

export type AppLocale = 'zh-CN' | 'en-US'

const DEFAULT_LOCALE: AppLocale = 'zh-CN'
const LANGUAGE_STORAGE_KEY = 'language'

/** 语言包加载上限：超时不阻塞启动/切换（chunk 仍可能在后台加载完成，但不改变已生效语言） */
const LOCALE_LOAD_TIMEOUT_MS = 8000

/** 语言包的消息形状以 zh-CN 为准（en-US 的叶子键集合由 i18n-keys.test.ts 钉为一致） */
type LocaleMessages = typeof zhCN
type LocaleModule = { default: LocaleMessages }

const localeLoaders: Record<Exclude<AppLocale, 'zh-CN'>, () => Promise<LocaleModule>> = {
  'en-US': () => import('./locales/en-US')
}

const i18n = createI18n({
  legacy: false, // Composition API 模式
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': zhCN
  }
})

/** 已装载的语言包（zh-CN 随模块静态内置） */
const loadedLocales = new Set<AppLocale>([DEFAULT_LOCALE])
/** 在途加载（并发去重：切语言与启动初始化可能同时触发同一个包） */
const pendingLoads = new Map<AppLocale, Promise<boolean>>()

/** 读取持久化语言：只接受已知值，其余一律按默认语言处理（不改写存储） */
function readSavedLocale(): AppLocale {
  const raw = getItem(LANGUAGE_STORAGE_KEY)
  return raw === 'zh-CN' || raw === 'en-US' ? raw : DEFAULT_LOCALE
}

function applyHtmlLang(locale: AppLocale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

/**
 * 缺失 key 兜底（vue-i18n v10 API：i18n.global.setMissingHandler）
 *
 * 当翻译 key 缺失时，记录 warning 并返回 key 本身作为兜底值，
 * 避免 vue-i18n 上抛导致布局区（ErrorBoundary 之外）崩溃 /500。
 *
 * 说明：vue-i18n v10 没有全局 `errorHandler`；
 * 报文编译错误通过布局区 `safeT`（`src/utils/safeI18n.ts`）逐调用 try/catch 兜底，
 * 二者配合根治布局区 i18n 报文异常崩溃。
 */
i18n.global.setMissingHandler((locale: string, key: string) => {
  // v8 ignore next —— DEV=false 分支仅在生产构建可达，Vitest 恒为 DEV 模式
  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing translation key (locale=${locale}): ${key}`)
  }
  // 返回 key 作为兜底，vue-i18n 会将其当作翻译结果使用，不再抛出
  return key
})

export default i18n

/**
 * 装载语言包（幂等 + 并发去重）。
 *
 * 失败只返回 false 并留痕，**不改变当前 locale**——调用方决定是否提示用户。
 */
export async function loadLocale(locale: AppLocale): Promise<boolean> {
  if (loadedLocales.has(locale)) return true
  const pending = pendingLoads.get(locale)
  if (pending) return pending
  const loader = localeLoaders[locale as keyof typeof localeLoaders]
  if (!loader) return false
  const task = loader()
    .then((mod) => {
      i18n.global.setLocaleMessage(locale, mod.default)
      loadedLocales.add(locale)
      return true
    })
    .catch((err) => {
      console.warn(`[i18n] 语言包加载失败（${locale}）`, err)
      return false
    })
    .finally(() => {
      pendingLoads.delete(locale)
    })
  pendingLoads.set(locale, task)
  return task
}

/** 带超时的装载：避免一个卡住的 chunk 请求把启动/切换永久挂在 load 上 */
async function loadLocaleWithTimeout(locale: AppLocale): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[i18n] 语言包加载超时（${locale}，${LOCALE_LOAD_TIMEOUT_MS}ms）`)
      resolve(false)
    }, LOCALE_LOAD_TIMEOUT_MS)
  })
  try {
    return await Promise.race([loadLocale(locale), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 启动引导：按持久化偏好装载语言包（必须在初始导航之前 await）。
 *
 * 加载失败/超时 ⇒ 本次以 zh-CN 启动，**保留用户偏好**（下次启动重试），
 * 并把 `<html lang>` 设成实际生效值（不能谎报 en）。
 */
export async function ensureInitialLocale(): Promise<AppLocale> {
  const saved = readSavedLocale()
  const effective = saved !== DEFAULT_LOCALE && (await loadLocaleWithTimeout(saved)) ? saved : DEFAULT_LOCALE
  if (effective !== DEFAULT_LOCALE) {
    i18n.global.locale.value = effective
  }
  applyHtmlLang(effective)
  if (effective !== saved) {
    console.warn(`[i18n] 已保存语言 ${saved} 未生效，本次以 ${effective} 启动（偏好保留，下次重试）`)
  }
  return effective
}

export interface LanguageSwitchResult {
  /** 语言包加载是否成功（false ⇒ 保留原语言，调用方应提示失败） */
  ok: boolean
  /** 本次是否真的生效（false ⇒ 被更晚的切换取代，调用方应静默） */
  applied: boolean
  /** 是否成功持久化（false ⇒ 本次会话生效，刷新后可能回退） */
  persisted: boolean
}

const switchGuard = createLatestGuard()
/**
 * 跨标签页应用用的独立票据（b122）。
 *
 * 与 `switchGuard` 分开：本地的用户点击必须**永远**赢过外来的同步。若两者共用一组票据，
 * "点完语言 A 后收到另一标签页同步 B 的事件"会让 B 覆盖用户刚选的 A——而用户此刻
 * 正看着 A 已生效。反过来，本地切换开始时应让在途的外来应用作废（见 setLanguage）。
 */
const externalGuard = createLatestGuard()

/** 切换结局的归一（组件只做「结局 → 提示」映射，不自行组合三个布尔） */
export type LanguageSwitchOutcome = 'failed' | 'superseded' | 'switched' | 'switched-not-persisted'

export function switchOutcome(result: LanguageSwitchResult): LanguageSwitchOutcome {
  if (!result.ok) return 'failed'
  if (!result.applied) return 'superseded'
  return result.persisted ? 'switched' : 'switched-not-persisted'
}

/** 切换语言并持久化；返回可区分的三种结局（失败 / 被取代 / 成功）。 */
export async function setLanguage(locale: AppLocale): Promise<LanguageSwitchResult> {
  const ticket = switchGuard.begin()
  // 用户刚刚做出了选择：任何更早开始的跨标签页应用都不得再覆盖它
  externalGuard.invalidate()
  const loaded = await loadLocaleWithTimeout(locale)
  if (!switchGuard.isCurrent(ticket)) {
    // 更晚的一次切换已经开始：旧调用既不改语言也不弹提示（避免"先报错后成功"）
    return { ok: true, applied: false, persisted: false }
  }
  if (!loaded) {
    return { ok: false, applied: false, persisted: false }
  }
  i18n.global.locale.value = locale
  applyHtmlLang(locale)
  const persisted = setItem(LANGUAGE_STORAGE_KEY, locale)
  // b122：其他标签页跟随。广播写的是另一条键，不会与语言键本身的写入互相回声。
  announceLanguageChanged(locale)
  return { ok: true, applied: true, persisted }
}

/**
 * 仅应用、不持久化：跨标签页同步的入口（b122）。
 *
 * 回写存储会造成两个标签页互相触发 storage 事件（A 写 → B 应用并回写 → A 再应用…），
 * 即使值相同也会在事件层来回弹；对方已经落过盘，这里只负责让本页追上。
 * 返回值：`true` = 已生效或本来就是该语言；`false` = 语言包加载失败（保持原语言）。
 */
export async function applyExternalLanguage(locale: AppLocale): Promise<boolean> {
  if (locale === getLanguage()) return true
  const ticket = externalGuard.begin()
  const loaded = await loadLocaleWithTimeout(locale)
  if (!externalGuard.isCurrent(ticket) || !loaded) return false
  i18n.global.locale.value = locale
  applyHtmlLang(locale)
  return true
}

/** 获取当前语言（值域归一：未知值一律按 zh-CN） */
export function getLanguage(): AppLocale {
  return i18n.global.locale.value === 'en-US' ? 'en-US' : 'zh-CN'
}
