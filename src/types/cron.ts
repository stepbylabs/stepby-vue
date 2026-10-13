/**
 * Crontab 组件相关类型定义（R6-VUE-23）
 *
 * 抽取自 src/components/Crontab/*.vue 子组件共享的类型，集中维护避免散落重复定义。
 */

/** Cron 表达式字段名（与 CronValue 的键一一对应） */
export type CronFieldName = 'second' | 'min' | 'hour' | 'day' | 'month' | 'week' | 'year'

/** Cron 表达式各字段值（均为字符串形式，如 "*" / "0-5" / "1,2,3" / "0/5" / "?"） */
export interface CronValue {
  second: string
  min: string
  hour: string
  day: string
  month: string
  week: string
  year: string
}

/** Crontab 子组件的 cron 属性校验函数签名（由父组件通过 props.check 注入） */
export type CronCheckFn = (value: number, minLimit: number, maxLimit: number) => number

/** Crontab 子组件统一的 props 形状 */
export interface CrontabChildProps {
  cron: CronValue
  check: CronCheckFn
}

/** Crontab 子组件统一的 emits 形状 */
export interface CrontabChildEmits {
  (e: 'update', name: CronFieldName, value: string, from: string): void
}

/** Crontab 父组件的 hideComponent 配置项（用于隐藏指定字段的 Tab） */
export type CrontabHideComponent = CronFieldName[]

/**
 * CronField 通用字段组件的配置（R6-VUE-24 / P2 去重）
 *
 * 替代原 second/min/hour/day/month/week/year 七个近乎逐字重复的子组件，
 * 用一个配置驱动的 <CronField> 复用全部「数字 Cron 字段」逻辑。
 * 配置仅描述各字段的差异（边界、i18n 文案、特殊选项、跨字段联动），
 * 共享的响应式逻辑集中在 CronField.vue 内部，保证行为与原组件 100% 一致。
 */
export interface CronFieldI18n {
  /** 通配符单选文案（如 "*"） */
  wildcard: string
  /** 空值单选文案（年字段专用，通常表示"不填年份"，原始 radio 文本为 everyYear） */
  empty?: string
  /** 不指定单选文案（日/周字段专用，"?"） */
  unspecified?: string
  /** 周期 From 文案（如 "周期从"） */
  cycleFrom: string
  /** 周期单位后缀文案（无则留空，不渲染） */
  cycleUnit?: string
  /** 步长 From 文案（如 "从"） */
  rangeFrom: string
  /** 步长起始文案（如 "开始"） */
  avgStart?: string
  /** 步长执行文案（如 "执行"） */
  avgExecute?: string
  /** 工作日前缀文案（日字段专用） */
  monthlyPrefix?: string
  /** 工作日后缀文案（日字段专用，"最近的工作日"） */
  nearestWorkday?: string
  /** 最后一天文案（日字段专用，"本月最后一天"） */
  lastDayOfMonth?: string
  /** 第几周前缀文案（周字段专用） */
  nthWeekPrefix?: string
  /** 第几周后缀文案（周字段专用） */
  nthWeekSuffix?: string
  /** 最后一周文案（周字段专用） */
  lastWeekOfMonth?: string
  /** 指定多选文案 */
  specify: string
  /** 多选占位符 */
  multiPlaceholder: string
}

/** CronField 指定选项的命名列表项（月/周） */
export interface CronNamedItem {
  key: number
  value: string
}

/** CronField 各字段初始值（对应原各子组件的 ref 初值） */
export interface CronFieldInit {
  cycle01: number
  cycle02: number
  average01: number
  average02: number
  weekday: number
  workday: number
}

export interface CronFieldConfig {
  /** 字段名（与 CronValue 键一一对应，用于 emit 的 name 与读取 cron[field]） */
  field: CronFieldName
  /** 各文案的 i18n key */
  i18n: CronFieldI18n
  /** 指定选项来源：'range' 数值范围 / 'list' 命名列表（月/周） */
  optionMode: 'range' | 'list'
  /** 命名列表类型（'list' 模式时生效） */
  namedList?: 'week' | 'month'
  /** 范围元素个数（'range' 模式时生效） */
  optionCount?: number
  /** 范围选项值偏移（最终值 = item + offset） */
  optionValueOffset?: number
  /** 多选上限 */
  multipleLimit: number
  /** 周期/average 输入下界（cycle01 / average01 的最小值） */
  cycleMin: number
  /** 周期起点输入上界（cycle01 的最大值，如秒=58、月=11） */
  cycleMax1: number
  /** 周期终点输入上界（cycle02 的最大值，如秒=59、月=12） */
  cycleMax2: number
  /** average 起点输入上界（average01 的最大值，通常为 cycleMax1，周 nth 为 4） */
  avgMax1: number
  /** 默认选中的单选值（canonical 编号） */
  defaultRadio: number
  /** checkCopy 默认值（指定项为空时回退填充） */
  checkCopyDefault: number
  /** 各 ref 初值 */
  init: CronFieldInit
  /** 是否支持空值（年字段） */
  allowEmpty?: boolean
  /** 是否支持不指定 "?"（日/周字段） */
  allowUnspecified?: boolean
  /** 是否支持步长（秒/分/时/日/月/年） */
  allowAverage?: boolean
  /** 是否支持工作日 "W"（日字段） */
  allowWorkday?: boolean
  /** 是否支持本月最后一天 "L"（日字段） */
  allowLastDay?: boolean
  /** 是否支持第几周 "#"（周字段） */
  allowNthWeek?: boolean
  /** 是否支持最后一周 "L"（周字段） */
  allowLastWeek?: boolean
  /** 周期选项是否用下拉选择（周字段专用） */
  cycleUseSelect?: boolean
  /** 步长第二项是否用下拉选择（周 nth 专用） */
  avgSecondUseSelect?: boolean
  /** average 输出是否用 "#" 分隔（周 nth 专用），否则用 "/" */
  averageUseHash?: boolean
  /** average 第二项上界是否固定为 cycleMax2（周 nth 专用），否则为 cycleMax2 - average01 */
  averageSecondMaxFixed?: boolean
  /** 跨字段联动的兄弟字段（日↔周），联动规则：本字段非"不指定"时兄弟置 "?"，为"不指定"时兄弟置 "*" */
  siblingField?: CronFieldName
  /** 解析时若兄弟为通配则将其归零（时字段专用：hour 解析时若 min/second 为 "*" 则置 "0"） */
  emitSiblingZeroOnParse?: boolean
}
