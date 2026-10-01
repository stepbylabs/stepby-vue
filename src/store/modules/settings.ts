import defaultSettings from '@/settings'
import { useDark, useToggle } from '@vueuse/core'
import { useDynamicTitle } from '@/utils/dynamicTitle'
import { handleThemeStyle } from '@/utils/theme'
import cache from '@/plugins/cache'
import {
  DEFAULT_USER_PREFS,
  sanitizeUserPrefs,
  type UserPrefs
} from '@/utils/userPrefs'

const isDark = useDark()
const toggleDark = useToggle(isDark)

const {
  sideTheme,
  showSettings,
  navType,
  tagsView,
  tagsViewPersist,
  tagsIcon,
  tagsViewStyle,
  fixedHeader,
  sidebarLogo,
  dynamicTitle,
  footerVisible,
  footerContent
} = defaultSettings

// 安全解析 localStorage，防止脏数据导致模块加载失败
interface SettingsStorage {
  theme: string
  sideTheme: string
  navType: number
  tagsView: boolean
  tagsViewPersist: boolean
  tagsIcon: boolean
  tagsViewStyle: string
  fixedHeader: boolean
  sidebarLogo: boolean
  dynamicTitle: boolean
  footerVisible: boolean
}

let storageSetting: Partial<SettingsStorage> = {}
try {
  storageSetting = JSON.parse(localStorage.getItem('layout-setting') || '{}') || {}
} catch {
  storageSetting = {}
}

// 用户偏好设置（独立存储 key，便于扩展）
// sanitizeUserPrefs / USER_PREFS_KEYS / UserPrefs / DEFAULT_USER_PREFS 已抽离至 @/utils/userPrefs
// （P2 修复：JSON.parse 后做字段白名单过滤，只保留 UserPrefs 已知字段，
//  防止 localStorage 被注入未知键污染 store 状态）。

let userPrefs: Partial<UserPrefs> = {}
try {
  userPrefs = sanitizeUserPrefs(JSON.parse(localStorage.getItem('user-prefs') || '{}'))
} catch {
  userPrefs = {}
}

interface SettingsState {
  title: string
  theme: string
  sideTheme: string
  showSettings: boolean
  navType: number
  tagsView: boolean
  tagsViewPersist: boolean
  tagsViewStyle: string
  tagsIcon: boolean
  fixedHeader: boolean
  sidebarLogo: boolean
  dynamicTitle: boolean
  footerVisible: boolean
  footerContent: string
  /** 用户偏好设置 */
  userPrefs: UserPrefs
}

/** 默认快捷键映射 */
export const DEFAULT_HOTKEYS: Record<string, string> = {
  help: 'shift_slash',
  search: 'ctrl_k',
  fullscreen: 'ctrl_shift_f',
  lockScreen: 'ctrl_shift_l',
  toggleDark: 'ctrl_shift_d',
  settings: 'ctrl_shift_s',
  toggleSidebar: 'ctrl_shift_comma',
  cycleTheme: 'alt_t'
}

// 系统暗色模式监听器（单例，模块加载时初始化）
let systemDarkUnwatch: (() => void) | null = null

function setupSystemDarkWatcher(store: { userPrefs: UserPrefs; isDark: boolean; theme: string }) {
  if (systemDarkUnwatch) systemDarkUnwatch()
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent | MediaQueryList) => {
    if (!store.userPrefs.followSystemDark) return
    const wantDark = e.matches
    if (store.isDark !== wantDark) {
      // toggleDark(value) 设置指定值（非反转），会自动更新 isDark ref
      toggleDark(wantDark)
      nextTick(() => {
        handleThemeStyle(store.theme)
      })
    }
  }
  // 初始触发一次
  handler(mql)
  // 监听变化
  const listener = (e: MediaQueryListEvent) => handler(e)
  mql.addEventListener('change', listener)
  systemDarkUnwatch = () => mql.removeEventListener('change', listener)
}

/** 允许通过 changeSetting 修改的 key 白名单（防止任意 key 注入污染 store） */
const ALLOWED_SETTING_KEYS = new Set<keyof SettingsState>([
  'title',
  'theme',
  'sideTheme',
  'showSettings',
  'navType',
  'tagsView',
  'tagsViewPersist',
  'tagsViewStyle',
  'tagsIcon',
  'fixedHeader',
  'sidebarLogo',
  'dynamicTitle',
  'footerVisible',
  'footerContent'
])

const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    title: '',
    theme: storageSetting.theme || '#409EFF',
    sideTheme: storageSetting.sideTheme || sideTheme,
    showSettings: showSettings,
    navType: storageSetting.navType === undefined ? navType : storageSetting.navType,
    tagsView: storageSetting.tagsView === undefined ? tagsView : storageSetting.tagsView,
    tagsViewPersist: storageSetting.tagsViewPersist === undefined ? tagsViewPersist : storageSetting.tagsViewPersist,
    tagsIcon: storageSetting.tagsIcon === undefined ? tagsIcon : storageSetting.tagsIcon,
    tagsViewStyle: storageSetting.tagsViewStyle === undefined ? tagsViewStyle : storageSetting.tagsViewStyle,
    fixedHeader: storageSetting.fixedHeader === undefined ? fixedHeader : storageSetting.fixedHeader,
    sidebarLogo: storageSetting.sidebarLogo === undefined ? sidebarLogo : storageSetting.sidebarLogo,
    dynamicTitle: storageSetting.dynamicTitle === undefined ? dynamicTitle : storageSetting.dynamicTitle,
    footerVisible: storageSetting.footerVisible === undefined ? footerVisible : storageSetting.footerVisible,
    footerContent: footerContent,
    userPrefs: (() => {
      const merged = { ...DEFAULT_USER_PREFS, ...userPrefs }
      // 真机核查存量迁移：followSystemDark 旧默认为 false，系统暗色下亮色页面会被
      // 国产浏览器夜间模式强制反色（vivo 实锤大片异常蓝背景）。存档中 followSystemDark
      // 为 false 且用户从未显式设置过（无标记）→ 升级为新默认 true；显式设置过的尊重选择。
      try {
        const hasArchive = !!localStorage.getItem('user-prefs')
        const userExplicit = localStorage.getItem('stepby_fsd_user_set') === '1'
        if (hasArchive && !userExplicit && merged.followSystemDark === false) {
          merged.followSystemDark = true
        }
      } catch {
        /* ignore */
      }
      return merged
    })()
  }),
  getters: {
    /** 当前是否为暗色模式（响应式 getter，跟随 useDark() 的 ref 变化） */
    isDark: (): boolean => isDark.value
  },
  actions: {
    // 修改布局设置
    changeSetting(data: { key: string; value: unknown }) {
      const { key, value } = data
      // 白名单校验：仅允许预定义的 setting key 被修改，防止任意 key 注入污染 store
      if (ALLOWED_SETTING_KEYS.has(key as keyof SettingsState)) {
        const k = key as keyof SettingsState
        // 经 ALLOWED_SETTING_KEYS 白名单收窄后，key 必然是 SettingsState 的已知属性，
        // 用类型化索引赋值去除 `as any`，保留类型安全与响应式更新
        // 经 ALLOWED_SETTING_KEYS 白名单收窄后，key 必然是 SettingsState 的已知属性。
        // 联合 key 的索引赋值在 TS 中目标类型会被推断为 never，故先桥接到
        // Record<keyof SettingsState, unknown> 再赋值（value 为 unknown，类型安全，无需 as any）。
        ;(this as SettingsState as Record<keyof SettingsState, unknown>)[k] = value
        // P2 修复：主题/侧栏主题变更时实时应用主题样式（修复此前快捷键改主题"换色不全"）
        if (k === 'theme' || k === 'sideTheme') {
          handleThemeStyle(this.theme)
        }
        // P2 修复：写回 localStorage，保证刷新后不丢失（与 Settings 抽屉 saveSetting 行为一致）
        this.persistLayoutSetting()
      } else {
        if (import.meta.env.DEV) console.warn('[settings] Unknown setting key:', key)
      }
    },
    // 持久化布局设置到 localStorage（与 Settings 抽屉 saveSetting 共用结构，避免重复实现）
    persistLayoutSetting() {
      const layoutSetting = {
        tagsView: this.tagsView,
        tagsIcon: this.tagsIcon,
        tagsViewStyle: this.tagsViewStyle,
        tagsViewPersist: this.tagsViewPersist,
        fixedHeader: this.fixedHeader,
        sidebarLogo: this.sidebarLogo,
        dynamicTitle: this.dynamicTitle,
        footerVisible: this.footerVisible,
        sideTheme: this.sideTheme,
        theme: this.theme
      }
      cache.local.set('layout-setting', JSON.stringify(layoutSetting))
    },
    // 设置网页标题
    setTitle(title: string) {
      this.title = title
      useDynamicTitle()
    },
    // 切换暗黑模式
    toggleTheme() {
      // useDark() 返回的 isDark 是响应式 ref，toggleDark() 内部会反转其值
      // 不能手动设置 this.isDark（会导致双重反转）
      toggleDark()
      nextTick(() => {
        handleThemeStyle(this.theme)
      })
    },
    // 更新用户偏好设置
    updateUserPrefs(prefs: Partial<UserPrefs>) {
      this.userPrefs = { ...this.userPrefs, ...prefs }
      cache.local.setJSON('user-prefs', this.userPrefs)
      // 存量迁移配套：用户显式设置过 followSystemDark 后写标记，此后升级迁移不再触碰该值
      if (prefs.followSystemDark !== undefined) {
        try {
          localStorage.setItem('stepby_fsd_user_set', '1')
        } catch {
          /* ignore */
        }
        // 如果切换了 followSystemDark，重新注册监听
        if (prefs.followSystemDark) {
          setupSystemDarkWatcher(this)
        } else if (systemDarkUnwatch) {
          systemDarkUnwatch()
          systemDarkUnwatch = null
        }
      }
    },
    // 初始化系统暗色模式监听（在 App.vue 或 layout onMounted 调用）
    initSystemDarkWatcher() {
      if (this.userPrefs.followSystemDark) {
        setupSystemDarkWatcher(this)
      }
    }
  }
})

export default useSettingsStore
