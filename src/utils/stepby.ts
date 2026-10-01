/**
 * 通用js方法封装处理
 * Copyright (c) 2026 Stepby
 */

import i18n from '@/i18n'
import type { DictOption } from '@/types'

/**
 * 时区偏移标签（DST 安全，绝不硬编码）。
 * 基于给定日期的本地时区偏移生成 "GMT+8" / "GMT-5" / "GMT+5:30" / "GMT+0"。
 * 默认取当前时间；传入具体日期可得到该日期所处时区（含夏令时偏移）的正确标签。
 * 用于时间展示时标注"此时间是哪个时区的本地时间"，消除跨区域协作/排障的时区歧义。
 */
export function tzOffsetLabel(date: Date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const mm = m ? ':' + String(m).padStart(2, '0') : ''
  return `GMT${sign}${h}${mm}`
}

// 日期格式化
export function parseTime(
  time: string | number | Date | null | undefined,
  pattern?: string,
  tz: boolean = false
): string | null {
  if (arguments.length === 0 || !time) {
    return null
  }
  const format = pattern || '{y}-{m}-{d} {h}:{i}:{s}'
  let date: Date
  if (typeof time === 'object') {
    date = time
  } else {
    if (typeof time === 'string' && /^[0-9]+$/.test(time)) {
      time = parseInt(time)
    } else if (typeof time === 'string') {
      if (time.includes('T')) {
        // 后端 UTC 时间戳（ISO 8601，无时区标记）→ 追加 Z 按 UTC 解析为本地展示
        time = time.replace(new RegExp(/\.[\d]{3}/gm), '')
        if (!time.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(time)) {
          time = time + 'Z'
        }
      } else {
        // 空格分隔的本地串（前端日期选择器 / 本地显示串，如 2024-01-01 12:30:45）→ 按本地解释
        time = time.replace(new RegExp(/-/gm), '/')
      }
    }
    if (typeof time === 'number' && time.toString().length === 10) {
      time = time * 1000
    }
    date = new Date(time)
  }
  const formatObj: Record<string, number> = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
    a: date.getDay()
  }
  const time_str = format.replace(/{(y|m|d|h|i|s|a)+}/g, (result, key) => {
    const value = formatObj[key]
    // Note: getDay() returns 0 on Sunday
    if (key === 'a') {
      const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
      return i18n.global.t(`time.weekdays.${weekdayKeys[value]}`)
    }
    if (result.length > 0 && value < 10) {
      return '0' + value
    }
    // v8 ignore next —— 能走到此处 value 必 >= 10（<10 已被上方补零分支拦截），|| 0 兜底恒不触发
    return String(value || 0)
  })
  // 仅当格式含时间分量（时/分/秒）才追加时区后缀；纯日期展示不加（避免误导为某时刻）
  if (tz && /{(h|i|s)}/.test(format)) {
    return `${time_str} ${tzOffsetLabel(date)}`
  }
  return time_str
}

// 表单重置
// 已移除：调用方应改用 useTemplateRef 直接持有 ref 并调用 .value?.resetFields()。
// 例如：
//   const formRef = useTemplateRef('formRef')
//   formRef.value?.resetFields()

// 添加日期范围
export function addDateRange<T extends Record<string, unknown>>(
  params: T,
  dateRange: string[] | undefined,
  propName?: string
): T & { params: Record<string, string | undefined> } {
  const search = params as T & { params: Record<string, string | undefined> }
  search.params =
    typeof search.params === 'object' && search.params !== null && !Array.isArray(search.params)
      ? (search.params as Record<string, string | undefined>)
      : {}
  const range = Array.isArray(dateRange) ? dateRange : []
  if (typeof propName === 'undefined') {
    search.params['beginTime'] = range[0]
    search.params['endTime'] = range[1]
  } else {
    search.params['begin' + propName] = range[0]
    search.params['end' + propName] = range[1]
  }
  return search
}

// 回显数据字典
export function selectDictLabel(
  datas: DictOption[] | Record<string, DictOption>,
  value: string | number | undefined
): string {
  if (value === undefined) {
    return ''
  }
  const actions: string[] = []
  const keys = Object.keys(datas)
  keys.some((key) => {
    const item = (datas as Record<string, DictOption>)[key]
    if (item && item.value == '' + value) {
      actions.push(item.label)
      return true
    }
    return false
  })
  if (actions.length === 0) {
    actions.push('' + value)
  }
  return actions.join('')
}

// 回显数据字典（字符串、数组）
export function selectDictLabels(
  datas: DictOption[] | Record<string, DictOption>,
  value: string | number | (string | number)[] | undefined,
  separator?: string
): string {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return ''
  }
  let valueStr: string
  if (Array.isArray(value)) {
    valueStr = value.join(',')
  } else {
    valueStr = '' + value
  }
  const actions: string[] = []
  const currentSeparator = undefined === separator ? ',' : separator
  const temp = valueStr.split(currentSeparator)
  Object.keys(valueStr.split(currentSeparator)).some((val) => {
    let match = false
    Object.keys(datas).some((key) => {
      const item = (datas as Record<string, DictOption>)[key]
      if (item && item.value == '' + temp[Number(val)]) {
        actions.push(item.label + currentSeparator)
        match = true
      }
    })
    if (!match) {
      actions.push(temp[Number(val)] + currentSeparator)
    }
  })
  return actions.join('').substring(0, actions.join('').length - 1)
}

// 字符串格式化(%s )
// 注意：使用 rest 参数时，第一个 %s 对应 args[0]（原基于 arguments 的实现
// 下标从 1 开始是因为 arguments[0] 是格式化串本身；rest 参数已剔除该串，故从 0 开始）。
export function sprintf(str: string, ...args: unknown[]): string {
  let flag = true,
    i = 0
  str = str.replace(/%s/g, function () {
    const arg = args[i++]
    if (typeof arg === 'undefined') {
      flag = false
      return ''
    }
    return String(arg)
  })
  return flag ? str : ''
}

// 转换字符串，undefined,null等转化为""
export function parseStrEmpty(str: unknown): string {
  if (!str || str == 'undefined' || str == 'null') {
    return ''
  }
  return String(str)
}

// 数据合并
export function mergeRecursive<T extends Record<string, unknown>>(
  source: T,
  target: Partial<T> | Record<string, unknown>
): T {
  for (const p in target) {
    try {
      const targetVal = (target as Record<string, unknown>)[p]
      if (targetVal && typeof targetVal === 'object' && targetVal.constructor === Object) {
        const srcVal = (source as Record<string, unknown>)[p]
        ;(source as Record<string, unknown>)[p] = mergeRecursive(
          (srcVal && typeof srcVal === 'object' ? srcVal : {}) as Record<string, unknown>,
          targetVal as Record<string, unknown>
        )
      } else {
        ;(source as Record<string, unknown>)[p] = targetVal
      }
    } catch {
      ;(source as Record<string, unknown>)[p] = (target as Record<string, unknown>)[p]
    }
  }
  return source
}

/**
 * 构造树型结构数据
 * @param data 数据源
 * @param id id字段 默认 'id'
 * @param parentId 父节点字段 默认 'parentId'
 * @param children 孩子节点字段 默认 'children'
 */
export function handleTree<T>(data: T[], id?: string, parentId?: string, children?: string): T[] {
  const config = {
    id: id || 'id',
    parentId: parentId || 'parentId',
    childrenList: children || 'children'
  }

  // 内部按 Record<string, unknown> 处理（仅用于字段访问，不改变对外类型 T）
  const arr = data as unknown as Record<string, unknown>[]
  const childrenListMap: Record<string, Record<string, unknown>> = {}
  const tree: Record<string, unknown>[] = []
  for (const d of arr) {
    const idVal = d[config.id]
    childrenListMap[String(idVal)] = d
    if (!d[config.childrenList]) {
      d[config.childrenList] = [] as unknown[]
    }
  }

  for (const d of arr) {
    const parentKey = String(d[config.parentId])
    const parentObj = childrenListMap[parentKey]
    if (!parentObj) {
      tree.push(d)
    } else {
      ;(parentObj[config.childrenList] as unknown[]).push(d)
    }
  }
  return tree as unknown as T[]
}

/**
 * 参数处理
 * @param params  参数
 */
export function transParams(params: Record<string, unknown>): string {
  let result = ''
  for (const propName of Object.keys(params)) {
    const value = params[propName]
    const part = encodeURIComponent(propName) + '='
    if (value !== null && value !== '' && typeof value !== 'undefined') {
      if (typeof value === 'object' && value !== null) {
        const objValue = value as Record<string, unknown>
        for (const key of Object.keys(objValue)) {
          if (objValue[key] !== null && objValue[key] !== '' && typeof objValue[key] !== 'undefined') {
            const params = propName + '[' + key + ']'
            const subPart = encodeURIComponent(params) + '='
            result += subPart + encodeURIComponent(String(objValue[key])) + '&'
          }
        }
      } else {
        result += part + encodeURIComponent(String(value)) + '&'
      }
    }
  }
  return result
}

// 返回项目路径
export function getNormalPath(p: string): string {
  if (p.length === 0 || !p || p == 'undefined') {
    return p
  }
  const res = p.replace('//', '/')
  if (res[res.length - 1] === '/') {
    return res.slice(0, res.length - 1)
  }
  return res
}

// 验证是否为 blob 格式
// 后端（或中间代理/网关）可能将 JSON 响应标记为 application/json;charset=utf-8，
// 仅精确比较会漏判导致把 JSON 错误响应当作文件下载，故按前缀匹配。
export function blobValidate(data: Blob): boolean {
  return !data.type.toLowerCase().startsWith('application/json')
}
