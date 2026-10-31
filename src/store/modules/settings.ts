import defaultSettings from '@/settings'
import { useDark, useToggle } from '@vueuse/core'
import { applyDynamicTitle } from '@/utils/dynamicTitle'
import { handleThemeStyle } from '@/utils/theme'
import cache from '@/plugins/cache'
import { getItem, getJSON, setItem } from '@/utils/webStorage'
import { DEFAULT_USER_PREFS, sanitizeUserPrefs, type UserPrefs } from '@/utils/userPrefs'
import {
  DEFAULT_SIDE_THEME,
  hasUserChosenSideTheme,
  isSideThemeOption,
  markUserChoseSideTheme
} from '@/utils/sideTheme'

const isDark = useDark()
const toggleDark = useToggle(isDark)

const {
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

// 存储读取一律走 `@/utils/webStorage`（b89 项 8）：`localStorage` 这个属性**本身**
// 在隐私模式/站点数据被禁时会抛 SecurityError，而原先外层那句 `try` 只包住了
// `JSON.parse`——读句柄那一步在 try 之内只是因为整段在模块顶层被 try 覆盖，
// 一旦有人把 `!localStorage` 当守卫（cache.ts 的原形状）就会漏。
// `getJSON` 自带"脏数据 → null 并清行"，`getItem` 自带"句柄坏了 → null"，都不抛。
const storageSetting: Partial<SettingsStorage> = getJSON<Partial<SettingsStorage>>('layout-setting') ?? {}

// 用户偏好设置（独立存储 key，便于扩展）
// sanitizeUserPrefs / USER_PREFS_KEYS / UserPrefs / DEFAULT_USER_PREFS 已抽离至 @/utils/userPrefs
// （P2 修复：JSON.parse 后做字段白名单过滤，只保留 UserPrefs 已知字段，
//  防止 localStorage 被注入未知键污染 store 状态）。
const userPrefs: Partial<UserPrefs> = sanitizeUserPrefs(getJSON<Record<string, unknown>>('user-prefs') ?? {})

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
    // 批八十六 N-1：存档值必须过值域。`sideTheme` 最终写进 CSS 类名
    // （`Sidebar/index.vue` 的 `:class="sideTheme"`），一个被注入的怪串等于往 DOM 里
    // 塞一个未知类；不在合法集合内一律回落出厂缺省（fail-safe：宁可不换肤）。
    sideTheme: isSideThemeOption(storageSetting.sideTheme) ? storageSetting.sideTheme : DEFAULT_SIDE_THEME,
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
      // 取不到存储时 `getItem` 回 null ⇒ hasArchive=false ⇒ 什么都不改（fail-safe，不抛）。
      const hasArchive = !!getItem('user-prefs')
      const userExplicit = getItem('stepby_fsd_user_set') === '1'
      if (hasArchive && !userExplicit && merged.followSystemDark === false) {
        merged.followSystemDark = true
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
        // sideTheme 走专用通道：除赋值外还要做值域校验与"用户显式选择"打标记
        //（真旋钮的优先级判据，见 `setUserSideTheme`），不得在这里另写一份语义
        if (k === 'sideTheme') {
          this.setUserSideTheme(value)
          return
        }
        // 经 ALLOWED_SETTING_KEYS 白名单收窄后，key 必然是 SettingsState 的已知属性，
        // 用类型化索引赋值去除 `as any`，保留类型安全与响应式更新
        // 经 ALLOWED_SETTING_KEYS 白名单收窄后，key 必然是 SettingsState 的已知属性。
        // 联合 key 的索引赋值在 TS 中目标类型会被推断为 never，故先桥接到
        // Record<keyof SettingsState, unknown> 再赋值（value 为 unknown，类型安全，无需 as any）。
        ;(this as SettingsState as Record<keyof SettingsState, unknown>)[k] = value
        // P2 修复：主色变更时实时应用主题样式（修复此前快捷键改主题"换色不全"）。
        // sideTheme 不在此列——它在上面走专用通道并已 return，`setUserSideTheme`
        // 自己负责重涂，这里再判一次就是"同一件事两处各写一份"。
        if (k === 'theme') {
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
      // b124：值由 store 传入，util 不再反向 import store（原循环依赖）
      applyDynamicTitle({ dynamicTitle: this.dynamicTitle, title })
    },
    /**
     * 用户显式选择侧边栏主题（设置抽屉卡片 / 主题编辑器单选的唯一入口）。
     *
     * 与直接 `changeSetting({ key: 'sideTheme' })` 的区别是它同时做三件事：
     * 值域校验、落盘、以及**打"用户选过"标记**。标记是真旋钮优先级链的关键：
     * 平台参数 `sys.index.sideTheme` 只作为"用户没选过时的缺省"，
     * 用户选过之后必须永久尊重用户，否则平台改一次就把所有人的选择洗掉。
     */
    setUserSideTheme(value: unknown): boolean {
      if (!isSideThemeOption(value)) {
        if (import.meta.env.DEV) console.warn('[settings] Illegal sideTheme:', value)
        return false
      }
      this.sideTheme = value
      handleThemeStyle(this.theme)
      this.persistLayoutSetting()
      markUserChoseSideTheme()
      return true
    },
    /**
     * 应用平台/租户下发的侧边栏主题缺省（批八十六 N-1 让 `sys.index.sideTheme` 成真旋钮）。
     *
     * 三条判据顺序即语义：① 用户显式选过 ⇒ 不动（尊重个人选择）；② 值不在前端值域 ⇒ 不动
     * （后端已有值域闸门，这里是**边界防御**：万一存量库里还留着历史脏值，
     * 也不能把未知串写进类名）；③ 其余照用。
     *
     * 刻意**不**写 localStorage：平台缺省不是用户的选择，写进去就等于把它冻成
     * "用户显式选择"，下次平台再改就再也不生效了。
     */
    applyPlatformSideTheme(raw: unknown): boolean {
      if (hasUserChosenSideTheme()) return false
      if (!isSideThemeOption(raw)) return false
      if (this.sideTheme === raw) return true
      this.sideTheme = raw
      handleThemeStyle(this.theme)
      return true
    },
    // 切换暗黑模式
    toggleTheme() {
      // 用户手动切换 = 显式接管主题：退出"跟随系统暗色"。
      // 否则 followSystemDark=true 时，整页刷新后 setupSystemDarkWatcher 的初始
      // handler 会按系统偏好强制回切，覆盖用户的手动选择（2026-10-02 M11 根因）。
      if (this.userPrefs.followSystemDark) {
        this.updateUserPrefs({ followSystemDark: false })
      }
      // useDark() 返回的 isDark 是响应式 ref，toggleDark() 内部会反转其值
      // 不能手动设置 this.isDark（会导致双重反转）
      toggleDark()
      nextTick(() => {
        handleThemeStyle(this.theme)
      })
    },
    // 更新用户偏好设置；返回 false = 只在本会话生效、没有落盘（b141）
    updateUserPrefs(prefs: Partial<UserPrefs>): boolean {
      this.userPrefs = { ...this.userPrefs, ...prefs }
      // 存储不可用 / 配额满时 setJSON 返回 false（b126 口径）——调用方据此决定能否报"已保存"，
      // 否则页面在隐私模式下提示"偏好已保存"、下次启动却退回旧值（假成功）
      const persisted = cache.local.setJSON('user-prefs', this.userPrefs)
      // 存量迁移配套：用户显式设置过 followSystemDark 后写标记，此后升级迁移不再触碰该值
      if (prefs.followSystemDark !== undefined) {
        // 写不进（配额满/隐私模式）不阻断本次切换——只是下次升级仍会被默认值碰一次
        setItem('stepby_fsd_user_set', '1')
        // 如果切换了 followSystemDark，重新注册监听
        if (prefs.followSystemDark) {
          setupSystemDarkWatcher(this)
        } else if (systemDarkUnwatch) {
          systemDarkUnwatch()
          systemDarkUnwatch = null
        }
      }
      return persisted
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
