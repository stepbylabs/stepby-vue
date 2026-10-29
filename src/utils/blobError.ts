/**
 * 读取 `responseType: 'blob'` 请求的**错误体**（b125：从 `utils/request` 抽出）。
 *
 * 导出族（xlsx / CSV / 备份）与 `plugins/download` 的三条下载通道都走 blob，axios 对
 * HTTP≥400 的 JSON 错误体同样按 blob 返回 ⇒ 直接读 `response.data.msg` 恒 `undefined`，
 * 用户看到的是"请求过于频繁"这类通用文案，而不是后端真正给的"导出任务繁忙（export:excel）"。
 *
 * 解析不出来（HTML 错误页 / 非 JSON / 空体）一律返回 `undefined`——"取不到"不得读成
 * "有一个空消息"，否则通用文案会被一条空串顶掉。
 *
 * 抽取理由：`utils/request` 与 `plugins/download` 是两条并行通道（后者裸用 axios），
 * 同一个解析器写两份必然漂。`utils/request` 仍原样 re-export，既有导入点不变。
 */
import { normalizeTraceId } from '@/utils/traceId'

export interface BlobErrorBody {
  code?: number
  msg?: string
  trace_id?: string
}

export async function readBlobErrorBody(data: unknown): Promise<BlobErrorBody | undefined> {
  const isBlob = typeof Blob !== 'undefined' && data instanceof Blob
  // 跨 realm 的 ArrayBuffer（jsdom 里 TextEncoder 的产物）用 instanceof 判不出来：
  // 实测 `new TextEncoder().encode('x').buffer instanceof ArrayBuffer === false`。
  // 按内部标签判定，避免"只支持 arraybuffer"这条支路在多环境下静默失效。
  const isArrayBuffer =
    typeof data === 'object' && data !== null && Object.prototype.toString.call(data) === '[object ArrayBuffer]'
  if (!isBlob && !isArrayBuffer) return undefined
  try {
    const text = isBlob ? await (data as Blob).text() : new TextDecoder().decode(data as ArrayBuffer)
    const parsed = JSON.parse(text) as { code?: unknown; msg?: unknown; trace_id?: unknown }
    const out: BlobErrorBody = {}
    if (typeof parsed.code === 'number') out.code = parsed.code
    if (typeof parsed.msg === 'string' && parsed.msg.trim() !== '') out.msg = parsed.msg
    // b124：blob 错误体同样带 trace_id（与 JSON 通道同源），不取的话导出族的报障
    // 就只能靠用户手抄屏幕上的通用文案——那正是这一族"写了没人接"的原始缺口。
    const traceId = normalizeTraceId(parsed.trace_id)
    if (traceId) out.trace_id = traceId
    return out.code === undefined && out.msg === undefined && out.trace_id === undefined ? undefined : out
  } catch {
    return undefined
  }
}
