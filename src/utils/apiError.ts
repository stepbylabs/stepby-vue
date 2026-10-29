/**
 * 失败文案的**唯一解析出口**（b125）。
 *
 * ## 立的案（实测，不是推断）
 *
 * `utils/errorCode` 的 Proxy 原先对**任意**键都回 `errorCode.default`
 * （`get` 钩子写的是 `target[prop] || target['default']`），于是两处调用点
 * （`utils/request` 成功拦截器、`plugins/download.printErrMsg`）里的
 * `errorCode[code] || data.msg || errorCode.default` 中段**结构上永远不可达**：
 * 连 `code=1003/601/自建码` 这类**没有前端映射**的业务码，后端 `msg` 也一律被
 * "系统未知错误"顶掉。仓库里甚至有两个单测把这条缺陷写成了期望
 * （`plugins/download.test.ts`：「未命中回落 default，故 rspObj.msg 实际不透出」）——
 * 测试锁住的是现状而不是目标，正是 b124「不可达兜底」的同一族。
 *
 * ## 取向：后端 `msg` 优先，映射码是兜底
 *
 * - 后端 `msg` 就是给用户看的那句话（来自后端 `tr!` 的 i18n 键，不是原始异常串），
 *   它比前端按码写的通用文案**更具体**：`429 + "导出任务繁忙（export:excel），请 30 秒后重试"`
 *   里有"哪个入口忙、多久能重试"，`errorCode.429` 只有"请求过于频繁"。
 * - 同一件事的文案不能由"碰巧走哪条通道"决定：HTTP 状态码路径
 *   （`utils/request` 错误拦截器）历来是 `backendMsg || 通用文案`，b98 的导出闸判据
 *   就是钉这个的；把业务码路径也统一成同一优先级，才不会出现
 *   "真实 429 看得到入口名、包在 HTTP 200 里就看不到"这种随部署档位漂移的口径。
 * - **映射码仍然必要**：网关/代理产生的 502/504、只有状态码没有体的
 *   `restful` 响应、以及旧后端只发 `code` 的历史形态，都靠它给出一句可翻译的话。
 * - 都没有才回落 `errorCode.default`：它永远可翻译，不会返回空串。
 */
import { defaultErrorMessage, translateErrorCode } from '@/utils/errorCode'

/**
 * 解析失败提示文案。
 *
 * @param code 业务码（body.code）或 HTTP 状态码；非有限数值视为"未归类"
 * @param backendMsg 后端 `body.msg`（空串/非字符串忽略）
 */
export function resolveApiErrorMessage(code: unknown, backendMsg?: unknown): string {
  const msg = typeof backendMsg === 'string' && backendMsg.trim() !== '' ? backendMsg : undefined
  if (msg) return msg
  return translateErrorCode(code) ?? defaultErrorMessage()
}
