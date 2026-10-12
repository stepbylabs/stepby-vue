/**
 * i18n 国际化配置
 *
 * 支持 zh-CN（默认）和 en-US 两种语言
 * 语言切换通过 useSettingsStore 或 localStorage('language') 持久化
 */
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import cache from '@/plugins/cache'

// 从 localStorage 读取用户上次选择的语言，默认中文
const savedLang = cache.local.get('language') || 'zh-CN'

// 启动即同步 <html lang>：否则刷新后 lang 回落为浏览器默认，与 localStorage 语言不一致
if (typeof document !== 'undefined') {
  document.documentElement.lang = savedLang
}

const i18n = createI18n({
  legacy: false, // Composition API 模式
  locale: savedLang,
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

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

/** 切换语言并持久化 */
export function setLanguage(lang: 'zh-CN' | 'en-US'): void {
  i18n.global.locale.value = lang
  cache.local.set('language', lang)
  // 同步 Element Plus 语言
  document.documentElement.lang = lang
}

/** 获取当前语言 */
export function getLanguage(): 'zh-CN' | 'en-US' {
  return i18n.global.locale.value as 'zh-CN' | 'en-US'
}
