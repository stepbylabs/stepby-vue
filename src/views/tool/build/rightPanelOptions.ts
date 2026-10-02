/**
 * 表单构建器右侧属性面板：静态选项配置
 * 集中管理日期/颜色/对齐等下拉选项，避免与组件模板耦合
 */
import { inputComponents, selectComponents } from '@/utils/generator/config'

export interface OptionItem {
  label: string
  value: string
}

/** 日期时间格式映射（week 依赖 i18n，因此用函数延迟求值） */
export function createDateTimeFormat(t: (key: string) => string): Record<string, string> {
  return {
    date: 'YYYY-MM-DD',
    week: t('build.rightPanel.weekFormat'),
    month: 'YYYY-MM',
    year: 'YYYY',
    datetime: 'YYYY-MM-DD HH:mm:ss',
    daterange: 'YYYY-MM-DD',
    monthrange: 'YYYY-MM',
    datetimerange: 'YYYY-MM-DD HH:mm:ss'
  }
}

export function createDateTypeOptions(t: (key: string) => string): OptionItem[] {
  return [
    { label: t('build.rightPanel.dateType.date'), value: 'date' },
    { label: t('build.rightPanel.dateType.week'), value: 'week' },
    { label: t('build.rightPanel.dateType.month'), value: 'month' },
    { label: t('build.rightPanel.dateType.year'), value: 'year' },
    { label: t('build.rightPanel.dateType.datetime'), value: 'datetime' }
  ]
}

export function createDateRangeTypeOptions(t: (key: string) => string): OptionItem[] {
  return [
    { label: t('build.rightPanel.dateType.daterange'), value: 'daterange' },
    { label: t('build.rightPanel.dateType.monthrange'), value: 'monthrange' },
    { label: t('build.rightPanel.dateType.datetimerange'), value: 'datetimerange' }
  ]
}

export function createColorFormatOptions(): OptionItem[] {
  return [
    { label: 'hex', value: 'hex' },
    { label: 'rgb', value: 'rgb' },
    { label: 'rgba', value: 'rgba' },
    { label: 'hsv', value: 'hsv' },
    { label: 'hsl', value: 'hsl' }
  ]
}

export function createJustifyOptions(): OptionItem[] {
  return [
    { label: 'start', value: 'start' },
    { label: 'end', value: 'end' },
    { label: 'center', value: 'center' },
    { label: 'space-around', value: 'space-around' },
    { label: 'space-between', value: 'space-between' }
  ]
}

/** 表单组件配置（来自 utils/generator/config.js 的未类型化 JS 数组元素） */
export interface ComponentConfig {
  label: string
  tag: string
  tagIcon: string
  [key: string]: unknown
}

export interface TagGroup {
  label: string
  options: ComponentConfig[]
}

export function createTagList(t: (key: string) => string): TagGroup[] {
  return [
    { label: t('build.rightPanel.tagGroup.input'), options: inputComponents },
    { label: t('build.rightPanel.tagGroup.select'), options: selectComponents }
  ]
}
