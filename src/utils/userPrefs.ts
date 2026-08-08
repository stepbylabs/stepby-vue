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
  'sessionTimeout'
]

/** 用户偏好默认值 */
export const DEFAULT_USER_PREFS: UserPrefs = {
  defaultPageSize: 10,
  defaultSortOrder: 'desc',
  autoRefreshInterval: 0,
  followSystemDark: false,
  tableDensity: 'default',
  timezone: 'Asia/Shanghai',
  customHotkeys: {},
  watermarkEnabled: false,
  sessionTimeout: 30
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
