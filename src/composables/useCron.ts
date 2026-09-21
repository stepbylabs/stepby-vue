/**
 * Crontab 组件共享逻辑 composable（R6-VUE-22）
 *
 * 抽取自 src/components/Crontab/*.vue 子组件共享的工具函数与常量，
 * 避免在多个子组件中重复定义相同的解析/校验逻辑。
 *
 * 设计原则：
 * - 仅抽取无状态的纯函数与常量，不引入跨组件的响应式状态
 *   （各子组件的 radioValue/cycle01 等状态因字段差异较大，保留在组件内部）
 * - 保持原有行为完全一致，仅做组织结构的 DRY 化
 */

import type { CronValue } from '@/types/cron'

/** 默认 cron 值（与原各子组件 props.cron.default 一致） */
export const DEFAULT_CRON_VALUE: CronValue = {
  second: '*',
  min: '*',
  hour: '*',
  day: '*',
  month: '*',
  week: '?',
  year: ''
}

/**
 * 表单选项的子组件校验数字格式（原 index.vue 中的 checkNumber）
 *
 * 规则：
 * 1. 取整（向下取整）
 * 2. 限制在 [minLimit, maxLimit] 区间内
 */
export function checkNumber(value: number, minLimit: number, maxLimit: number): number {
  value = Math.floor(value)
  if (value < minLimit) {
    value = minLimit
  } else if (value > maxLimit) {
    value = maxLimit
  }
  return value
}

/** 判断是否为通配符 "*" */
export function isWildcard(value: string): boolean {
  return value === '*'
}

/** 判断是否为不指定 "?" */
export function isUnspecified(value: string): boolean {
  return value === '?'
}

/** 判断是否为空字符串（年字段使用空表示"不填"） */
export function isEmpty(value: string): boolean {
  return value === ''
}

/** 判断是否为周期表达式（包含 "-"） */
export function isCycle(value: string): boolean {
  return value.indexOf('-') > -1
}

/** 判断是否为步长表达式（包含 "/"） */
export function isAverage(value: string): boolean {
  return value.indexOf('/') > -1
}

/** 判断是否为工作日表达式（包含 "W"，仅日字段使用） */
export function isWorkday(value: string): boolean {
  return value.indexOf('W') > -1
}

/** 判断是否为最后一天表达式（值为 "L"） */
export function isLastDay(value: string): boolean {
  return value === 'L'
}

/** 判断是否为 "#" 周表达式（包含 "#"，仅周字段使用） */
export function isWeekHash(value: string): boolean {
  return value.indexOf('#') > -1
}

/** 判断是否为 "L" 后缀表达式（包含 "L"，仅周字段使用） */
export function isLastWeek(value: string): boolean {
  return value.indexOf('L') > -1
}

/**
 * 解析周期表达式（如 "0-5" -> [0, 5]）
 *
 * 注意：调用方需先用 isCycle 判断，否则可能得到 NaN。
 */
export function parseCycle(value: string): [number, number] {
  const arr = value.split('-')
  return [Number(arr[0]), Number(arr[1])]
}

/**
 * 解析步长表达式（如 "0/5" -> [0, 5]）
 *
 * 注意：调用方需先用 isAverage 判断，否则可能得到 NaN。
 */
export function parseAverage(value: string): [number, number] {
  const arr = value.split('/')
  return [Number(arr[0]), Number(arr[1])]
}

/**
 * 解析指定列表表达式（如 "1,2,3" -> [1, 2, 3]，自动去重）
 *
 * 注意：调用方需先排除通配符/不指定/周期/步长等情况，否则单字符如 "*" 会被解析为 [NaN]。
 */
export function parseList(value: string): number[] {
  // L2: 先剔除空/空白 token 再 Number，避免 Number('')===0 让空字符串被误当作有效值 0。
  // 之后再 filter NaN，保证无效输入（非数字字符）不会产生 NaN 元素。
  return [
    ...new Set(
      value
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token !== '')
        .map(Number)
        .filter((n) => !isNaN(n))
    )
  ]
}

/**
 * 解析完整 cron 表达式字符串为 CronValue 对象
 *
 * 合法表达式至少 6 位（秒 分 时 日 月 周），第 7 位（年）可选。
 * 不合法或为空时返回 null，调用方应据此判断是否使用默认值。
 */
export function parseCronExpression(expression: string): CronValue | null {
  if (!expression) {
    return null
  }
  const arr = expression.split(/\s+/)
  if (arr.length < 6) {
    return null
  }
  return {
    second: arr[0],
    min: arr[1],
    hour: arr[2],
    day: arr[3],
    month: arr[4],
    week: arr[5],
    year: arr[6] ? arr[6] : ''
  }
}

/**
 * 将 CronValue 对象序列化为 cron 表达式字符串
 *
 * 当 year 为空时，省略末尾的空格与年字段（与原 index.vue 实现一致）。
 */
export function stringifyCronValue(value: CronValue): string {
  return (
    value.second +
    ' ' +
    value.min +
    ' ' +
    value.hour +
    ' ' +
    value.day +
    ' ' +
    value.month +
    ' ' +
    value.week +
    (value.year === '' ? '' : ' ' + value.year)
  )
}

/**
 * Crontab 子组件共享的 composable 入口
 *
 * 返回所有共享工具函数与常量，便于在子组件中按需调用：
 *
 * ```ts
 * const { checkNumber, parseCycle, parseList } = useCron()
 * ```
 *
 * 也可直接按具名导入使用（推荐，Tree-shaking 更友好）：
 *
 * ```ts
 * import { checkNumber, parseCycle } from '@/composables/useCron'
 * ```
 */
export function useCron() {
  return {
    defaultValue: DEFAULT_CRON_VALUE,
    checkNumber,
    isWildcard,
    isUnspecified,
    isEmpty,
    isCycle,
    isAverage,
    isWorkday,
    isLastDay,
    isWeekHash,
    isLastWeek,
    parseCycle,
    parseAverage,
    parseList,
    parseCronExpression,
    stringifyCronValue
  }
}

/** 便捷类型再导出，方便子组件单行导入 */
export type { CronValue, CronFieldName } from '@/types/cron'
