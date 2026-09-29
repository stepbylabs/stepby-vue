/**
 * 用户偏好（UserPrefs）纯逻辑工具
 *
 * 将 sanitizeUserPrefs 等纯函数从 Pinia store 模块中抽离，便于独立单测，
 * 避免导入 store 时触发的浏览器副作用（useDark / localStorage / 主题样式等）。
 */

/** 用户偏好设置结构 */
export interface UserPrefs {
  /** 默认每页条数 */
  defaultPageSize: number
  /** 默认排序字段（asc/desc） */
  defaultSortOrder: 'asc' | 'desc'
  /** 列表自动刷新间隔（秒），0 表示禁用 */
  autoRefreshInterval: number
  /** 是否跟随系统暗色模式 */
  followSystemDark: boolean
  /** 表格密度 */
  tableDensity: 'comfortable' | 'default' | 'compact'
  /** 时区 */
  timezone: string
  /** 自定义快捷键映射 */
  customHotkeys: Record<string, string>
  /** TierS-4: 是否启用水印（全局叠加用户名+时间水印，防截图泄露） */
  watermarkEnabled: boolean
  /** TierB-2: 会话超时阈值（分钟），0 表示禁用，默认 30 分钟 */
  sessionTimeout: number
  /** UX-7: 列显隐偏好 —— 页面标识 → 可见列 key 列表（未记录的页面用列定义默认值） */
  tableColumns: Record<string, string[]>
  /** D8（UX-RESPONSIVE-PLAN 阶段三）：移动端表格卡片模式（手机档表格由横滚切换为逐行卡片；默认关=横滚） */
  mobileTableCards: boolean
}

/** 列表列定义（列显隐偏好的输入） */
export interface TableColumnDef {
  /** 列唯一标识（与模板中的列一一对应） */
  key: string
  /** 默认是否可见 */
  defaultVisible?: boolean
}

/**
 * 解析某页的可见列（纯函数，便于单测）
 *
 * 规则：
 * - 无存档 → 取列定义中 `defaultVisible !== false` 的列
 * - 有存档 → 仅保留「存档 ∩ 现有列定义」且按列定义顺序返回（列被改名/删除时自动失效，不残留脏 key）
 * - 存档为空数组 → 视为"全部隐藏"，但至少保留第一列，避免出现完全无列的空表格
 *
 * @param saved 存档的可见列 key 列表（可能 undefined）
 * @param columns 当前列定义（按显示顺序）
 */
export function resolveTableColumns(
  saved: string[] | undefined,
  columns: TableColumnDef[]
): string[] {
  const allKeys = columns.map((c) => c.key)
  if (!saved) {
    const defaults = columns.filter((c) => c.defaultVisible !== false).map((c) => c.key)
    return defaults.length ? defaults : allKeys.slice(0, 1)
  }
  const visible = allKeys.filter((k) => saved.includes(k))
  return visible.length ? visible : allKeys.slice(0, 1)
}

/** 用户偏好白名单键（sanitize 时只保留这些已知字段） */
export const USER_PREFS_KEYS: (keyof UserPrefs)[] = [
  'defaultPageSize',
  'defaultSortOrder',
  'autoRefreshInterval',
  'followSystemDark',
  'tableDensity',
  'timezone',
  'customHotkeys',
  'watermarkEnabled',
  'sessionTimeout',
  'tableColumns',
  'mobileTableCards'
]

/** 用户偏好默认值 */
export const DEFAULT_USER_PREFS: UserPrefs = {
  defaultPageSize: 10,
  defaultSortOrder: 'desc',
  autoRefreshInterval: 0,
  // 真机核查修复：默认跟随系统暗色——页面自适配暗色后，国产浏览器夜间模式检测到
  // 页面已适配即不再强制反色（亮色页面被 vivo 夜间模式反色成异常蓝黑，实锤）。
  // 现代应用标准行为（GitHub/VSCode 均默认跟随系统）。
  followSystemDark: true,
  tableDensity: 'default',
  timezone: 'Asia/Shanghai',
  customHotkeys: {},
  watermarkEnabled: false,
  sessionTimeout: 30,
  tableColumns: {},
  mobileTableCards: false
}

/**
 * 清洗用户偏好（P2 修复：字段白名单过滤）
 *
 * 从 localStorage 解析出的任意对象只保留 UserPrefs 已知字段，
 * 防止脏数据/未知键污染 store 状态（如原型污染或无效字段）。
 *
 * - 非对象或 null → 返回空对象 `{}`
 * - 对象 → 仅拷贝 `USER_PREFS_KEYS` 中的已知键，丢弃其余
 *
 * @param raw 来自 localStorage / 接口的未知来源数据
 * @returns 仅含白名单字段的部分偏好对象
 */
export function sanitizeUserPrefs(raw: unknown): Partial<UserPrefs> {
  if (typeof raw !== 'object' || raw === null) return {}
  const record = raw as Record<string, unknown>
  const result: Partial<UserPrefs> = {}
  for (const key of USER_PREFS_KEYS) {
    if (key in record) {
      ;(result as Record<string, unknown>)[key] = record[key]
    }
  }
  return result
}
