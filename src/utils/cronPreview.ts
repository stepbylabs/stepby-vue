/**
 * 受限 Cron 表达式解析与未来触发时间预览（零依赖，仅用标准 Date）
 * Copyright (c) 2026 Stepby
 *
 * 供定时任务新增/编辑弹窗的"未来 5 次触发时间"预览使用。
 * 后端实际调度使用 croner（见 stepby-axum Cargo.toml），本实现为其辅助提示，
 * 存在以下已知局限（误差可接受，解析失败时前端明确提示"无法解析"）：
 *
 * 1. 仅支持 6 字段（秒 分 时 日 月 周）+ 可选第 7 位年字段；
 *    支持 `*` `,` `-` `/` 数字与 `?`（`?` 等价 `*`），不支持 L W # 与星期英文名；
 * 2. 日/周互斥未按 Quartz 语义处理：日与周均显式指定时取 AND（Quartz 为 OR，
 *    croner 要求其一为 `?`）——两者都指定的表达式预览可能与实际调度有偏差；
 * 3. 周字段按 0-6 = 周日..周六 解析，7 视为周日（croner 兼容此写法；
 *    Quartz 方言 1=周日 的表达式在此口径下会偏移一天）；
 * 4. `n/step` 解释为"从 n 开始按步长到上限"（如 分 `5/10` = 5,15,25...59）。
 */

/** 单个字段的解析结果 */
interface CronField {
  /** 升序去重后的取值集合 */
  values: number[]
  /** 是否显式指定（非 `*`/`?`） */
  restricted: boolean
}

/** 生成年区间 [min, max] 的完整取值 */
function fullRange(min: number, max: number): number[] {
  const arr: number[] = []
  for (let v = min; v <= max; v++) arr.push(v)
  return arr
}

/**
 * 解析单个 cron 字段为取值集合
 *
 * @param expr 字段原文（已按空白切分）
 * @param min 合法最小值
 * @param max 合法最大值
 * @param normalize 可选的取值归一化（如周字段 7→0）
 * @returns 解析失败返回 null
 */
function parseField(
  expr: string,
  min: number,
  max: number,
  normalize?: (n: number) => number
): CronField | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  const isWildcard = trimmed === '*' || trimmed === '?'
  if (isWildcard) {
    return { values: fullRange(min, max), restricted: false }
  }
  const values = new Set<number>()
  for (const part of trimmed.split(',')) {
    const seg = part.trim()
    if (!seg) return null
    let body = seg
    let step = 1
    const slashIdx = seg.indexOf('/')
    if (slashIdx >= 0) {
      body = seg.slice(0, slashIdx)
      const stepStr = seg.slice(slashIdx + 1)
      if (!/^\d+$/.test(stepStr)) return null
      step = Number(stepStr)
      if (step < 1) return null
    }
    let start = min
    let end = max
    if (body !== '*' && body !== '') {
      const dashIdx = body.indexOf('-')
      if (dashIdx >= 0) {
        const a = body.slice(0, dashIdx)
        const b = body.slice(dashIdx + 1)
        if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null
        start = Number(a)
        end = Number(b)
      } else {
        if (!/^\d+$/.test(body)) return null
        start = Number(body)
        // "n/step"：从 n 开始按步长到上限；单独数字则取单值
        end = slashIdx >= 0 ? max : start
      }
    }
    if (start < min || end > max || start > end) return null
    for (let v = start; v <= end; v += step) {
      values.add(normalize ? normalize(v) : v)
    }
  }
  if (values.size === 0) return null
  return { values: [...values].sort((a, b) => a - b), restricted: true }
}

/**
 * 计算表达式未来的触发时间
 *
 * @param expression 6 字段（秒 分 时 日 月 周）cron 表达式，可选第 7 位年
 * @param count 最多返回的触发次数（默认 5）
 * @param from 起始时刻（默认当前时间，返回的触发时间严格晚于该时刻）
 * @returns 解析失败返回 null；表达式合法但区间内无触发返回空数组
 */
export function nextFireTimes(expression: string, count = 5, from: Date = new Date()): Date[] | null {
  if (count < 1) return []
  const parts = expression.trim().split(/\s+/)
  if (parts.length < 6 || parts.length > 7) return null

  const second = parseField(parts[0], 0, 59)
  const minute = parseField(parts[1], 0, 59)
  const hour = parseField(parts[2], 0, 23)
  const day = parseField(parts[3], 1, 31)
  const month = parseField(parts[4], 1, 12)
  // 周：0-6 = 周日..周六，7 归一化为周日
  const week = parseField(parts[5], 0, 7, (n) => (n === 7 ? 0 : n))
  if (!second || !minute || !hour || !day || !month || !week) return null

  // 可选年字段：`*` 视为不限；解析失败或超出合理区间则整体无效
  let years: number[] | null = null
  if (parts.length === 7 && parts[6] !== '*') {
    const yearField = parseField(parts[6], 1970, 2999)
    if (!yearField) return null
    years = yearField.values
  }

  const start = new Date(from.getTime())
  start.setMilliseconds(0)
  // 预览窗口：未来 5 年（覆盖常见的"2 月 30 日"类永不触发的表达式的判定）
  const endYear = start.getFullYear() + 5

  const result: Date[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  for (let d = new Date(cursor); d.getFullYear() < endYear; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const mo = d.getMonth() + 1
    const dayNum = d.getDate()
    const dow = d.getDay()

    if (years && !years.includes(y)) continue
    if (!month.values.includes(mo)) continue
    // 日/周简化处理（见文件头说明 2）：各自显式指定时分别参与匹配
    if (day.restricted && !day.values.includes(dayNum)) continue
    if (week.restricted && !week.values.includes(dow)) continue
    // 排除不合法日期（如非闰年的 2 月 29 日会被 Date 滚动到 3 月）
    if (new Date(y, mo - 1, dayNum).getDate() !== dayNum) continue

    // 首日跳过 start 之前的时刻，避免全量扫描当天 86400 个组合
    const sameDay =
      y === start.getFullYear() && mo === start.getMonth() + 1 && dayNum === start.getDate()
    for (const h of hour.values) {
      if (sameDay && h < start.getHours()) continue
      for (const mi of minute.values) {
        if (sameDay && h === start.getHours() && mi < start.getMinutes()) continue
        for (const s of second.values) {
          if (
            sameDay &&
            h === start.getHours() &&
            mi === start.getMinutes() &&
            s <= start.getSeconds()
          ) {
            continue
          }
          result.push(new Date(y, mo - 1, dayNum, h, mi, s))
          if (result.length >= count) return result
        }
      }
    }
  }
  return result
}
