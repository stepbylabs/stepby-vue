/**
 * 错误码 → 前端兜底文案（b125 重构）。
 *
 * ## 为什么不再是 Proxy
 *
 * 原实现是一个 `Proxy`，取**任意**键都返回 `errorCode.default`（`target[prop] || target['default']`），
 * 本意是"没登记也别给空串"。但调用点的写法是 `errorCode[code] || data.msg || errorCode.default`，
 * 于是中段**结构性不可达**：后端 `msg` 永远被"系统未知错误"顶掉（`plugins/download.test.ts`
 * 曾把这条缺陷写成期望）。判据是**未登记键必须回 `undefined`**，让调用方知道自己没拿到映射，
 * 而不是拿到一个看起来像映射结果的兜底值——"取不到"被读成"有值"正是 `Number(null) === 0` 那一族。
 *
 * 现在只暴露两个函数，映射表本身不再可被下标访问：
 * - `translateErrorCode(code)`：已登记码 → 当前语言文案；未登记/非数值 → `undefined`；
 * - `defaultErrorMessage()`：兜底文案（`errorCode.default`）。
 *
 * 组合它们的**唯一**出口是 `utils/apiError.resolveApiErrorMessage`（后端 msg 优先，
 * 映射码与 default 依次兜底）；生产码不得再直接拼这三种来源。
 */
import i18n from '@/i18n'

const errorCodeKeyMap: Record<string, string> = {
  '400': 'errorCode.400',
  '401': 'errorCode.401',
  '403': 'errorCode.403',
  '404': 'errorCode.404',
  '409': 'errorCode.409',
  '422': 'errorCode.422',
  '429': 'errorCode.429',
  '500': 'errorCode.500',
  '503': 'errorCode.503',
  default: 'errorCode.default'
}

/** 已登记的标准码 → 当前语言文案；未登记（含非数值）返回 `undefined` */
export function translateErrorCode(code: unknown): string | undefined {
  if (typeof code !== 'number' || !Number.isFinite(code)) return undefined
  const key = errorCodeKeyMap[String(code)]
  return key === undefined ? undefined : i18n.global.t(key)
}

/** 兜底文案：永远可翻译，不会返回空串 */
export function defaultErrorMessage(): string {
  return i18n.global.t(errorCodeKeyMap.default)
}
