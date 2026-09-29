// stepby-axum 字段级审计 diff 的前端解析（Tier-S #2）
//
// 中间件对成功的 PUT 请求逐字段计算 before→after 差异，写入 sys_oper_log.oper_diff
// （JSON 数组 [{field,old,new}]）。详情页优先展示该权威结果；对无 oper_diff 的
// 历史日志回退到旧的启发式对比（operParam vs jsonResult），保证老数据仍可展示。

/** 单字段变更条目 */
export interface DiffItem {
  field: string
  oldVal: string
  newVal: string
  changed: boolean
}

/** 后端 oper_diff 数组的单条记录结构 */
interface RawDiffEntry {
  field?: unknown
  old?: unknown
  new?: unknown
}

/** 将任意 JSON 值格式化为展示字符串：字符串原样，对象/数组 JSON 化，null/undefined 空串 */
export function formatDiffValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

/**
 * 解析服务端权威的字段级差异（sys_oper_log.oper_diff）。
 *
 * 输入为 JSON 数组字符串 [{field,old,new}]；非法 JSON / 非数组 / 空数组返回 []。
 * 敏感字段值在后端已脱敏为 "***"，此处原样展示。
 */
export function parseOperDiff(operDiff?: string | null): DiffItem[] {
  if (!operDiff) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(operDiff)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const list: DiffItem[] = []
  for (const entry of parsed as RawDiffEntry[]) {
    if (!entry || typeof entry !== 'object') continue
    const field = typeof entry.field === 'string' ? entry.field : ''
    if (!field) continue
    const oldVal = formatDiffValue(entry.old)
    const newVal = formatDiffValue(entry.new)
    list.push({ field, oldVal, newVal, changed: oldVal !== newVal })
  }
  return list
}

/** 判断字段名是否敏感（与后端脱敏类别对齐，用于启发式回退时跳过） */
const SENSITIVE_RE = /password|pwd|token|secret|salt|apikey|api_key|phone|mobile|idcard|idno|email|bankcard|cardnumber/i

/**
 * 历史日志的回退启发式：对比请求参数（operParam，视作"旧"）与返回结果
 * （jsonResult.data，视作"新"）中的同名基础类型字段。仅对无 oper_diff 的旧数据使用。
 */
export function heuristicDiff(operParam?: string, jsonResult?: string): DiffItem[] {
  let oldObj: Record<string, unknown> = {}
  let newObj: Record<string, unknown> = {}
  try {
    if (operParam) oldObj = JSON.parse(operParam)
  } catch {
    /* 非合法 JSON，跳过 */
  }
  try {
    if (jsonResult) {
      const res = JSON.parse(jsonResult)
      newObj = (res && (res as Record<string, unknown>).data) || res || {}
    }
  } catch {
    /* 非合法 JSON，跳过 */
  }
  if (typeof oldObj !== 'object' || oldObj === null) oldObj = {}
  if (typeof newObj !== 'object' || newObj === null) newObj = {}

  const fields = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  const list: DiffItem[] = []
  for (const field of fields) {
    if (SENSITIVE_RE.test(field)) continue
    const oldVal = oldObj[field]
    const newVal = newObj[field]
    if (typeof oldVal === 'object' && oldVal !== null) continue
    if (typeof newVal === 'object' && newVal !== null) continue
    const oldStr = oldVal == null ? '' : String(oldVal)
    const newStr = newVal == null ? '' : String(newVal)
    if (oldStr === newStr) continue
    list.push({ field, oldVal: oldStr, newVal: newStr, changed: true })
  }
  return list
}
