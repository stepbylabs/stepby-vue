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
