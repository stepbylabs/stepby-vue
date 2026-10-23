/**
 * 侧边栏主题的**前端唯一事实源**。
 *
 * 为什么需要这个模块（批八十六 项 N-1）：`sys.index.sideTheme` 在 §5.23 之后是一个
 * "参数页可见可编辑、但零消费者"的死键——前端主题全部走 localStorage，后端改了没人读。
 * 本批把它做成真旋钮：登录后按**租户层生效值**作为侧边栏主题缺省。
 *
 * 于是"合法取值"这件事在三个地方要用到（设置抽屉的三个卡片、主题编辑器的单选、
 * store 消费平台值时的校验）。此前它们是三份各自的内联字面量
 * （`Settings/index.vue` 三张卡片、`ThemeEditor/index.vue` 三个 radio、
 * `handleReset` 里写死的 `'theme-auto'`）——加一档就要改三处，漏一处的表现是
 * "选了但不生效"，与本仓反复立案的"两处各写一份必漂"同族。
 *
 * 与服务端 `governance::SIDE_THEME_DOMAIN` 的关系：两份集合按各自语言的类型系统各存一份
 * （跨 crate/跨包的常量无法共享），因此**两条通道都要有**，各判一侧的漂移方向：
 * - 静态集合相等：由 `governance::tests::side_theme_domain_matches_frontend_mirror` 读这两个
 *   文件比集合（同 `common::tenant::matrix_matches_ledger_doc` 的跨仓对账通道）。它抓的是
 *   "后端加一档、前端镜像没跟上"——那种状态下服务层放行新值、前端认不出来 ⇒ "管理员改了参数、
 *   界面毫无反馈"，正是本批 N-1 要消灭的死键形态，而真浏览器判据看不见它（不遍历整个集合）。
 * - 真值跨边界生效：由 e2e F45 在真浏览器里把平台值改成 `theme-dark` 后验侧栏 class 真的变了，
 *   判的是接线而不是文本（写了没接线 = 没写）。
 */
import defaultSettings from '@/settings'

/** 合法取值（顺序 = 设置抽屉里的展示顺序） */
export const SIDE_THEME_OPTIONS = ['theme-auto', 'theme-dark', 'theme-light'] as const

export type SideThemeOption = (typeof SIDE_THEME_OPTIONS)[number]

/** 出厂缺省（与 `src/settings.ts` 同源，不在本文件重述字面量） */
export const DEFAULT_SIDE_THEME: string = defaultSettings.sideTheme

/** 平台参数的键名（服务端注册表 `Coverage::Free` 的首项） */
export const SIDE_THEME_CONFIG_KEY = 'sys.index.sideTheme'

/**
 * "用户显式选择过侧边栏主题"的 localStorage 标记键。
 *
 * 为什么需要标记而不是直接看 `layout-setting` 里的值：`persistLayoutSetting()` 会把
 * **当前全部**布局设置写回存档（用户只调了 tagsView 也会带上 sideTheme），
 * 于是"存档里有 sideTheme"不等于"用户选过 sideTheme"——用它做优先级判据，
 * 平台缺省会在第一次无关的设置后被永久忽略。
 * 与 `followSystemDark` 的 `stepby_fsd_user_set` 同一形态（见 store/modules/settings.ts）。
 */
export const SIDE_THEME_USER_SET_KEY = 'stepby_sidetheme_user_set'

/** 值是否落在合法集合内（逐字比较：值最终写进 CSS 类名，大小写/空白变体是另一个类） */
export function isSideThemeOption(value: unknown): value is SideThemeOption {
  return typeof value === 'string' && (SIDE_THEME_OPTIONS as readonly string[]).includes(value)
}

/** 用户是否显式选择过（读取失败一律按"没选过"= 让平台缺省继续管用，fail-safe） */
export function hasUserChosenSideTheme(): boolean {
  try {
    return localStorage.getItem(SIDE_THEME_USER_SET_KEY) === '1'
  } catch {
    return false
  }
}

/** 打上"用户显式选择过"的标记（写失败不阻断主题切换——只是下次仍会被平台缺省覆盖） */
export function markUserChoseSideTheme(): void {
  try {
    localStorage.setItem(SIDE_THEME_USER_SET_KEY, '1')
  } catch {
    /* 隐私模式/配额满：外观偏好不得阻断交互 */
  }
}
