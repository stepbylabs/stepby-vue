import axios, { type AxiosResponse } from 'axios'
import { ElLoading } from 'element-plus'
import { saveBlob } from '@/utils/saveBlob'
import i18n from '@/i18n'
import { getToken } from '@/utils/auth'
import { blobValidate } from '@/utils/stepby'
import { errorHub } from '@/utils/errorHub'
import { readBlobErrorBody } from '@/utils/blobError'
import { resolveApiErrorMessage } from '@/utils/apiError'
import { pickTraceId } from '@/utils/traceId'

const baseURL = import.meta.env.VITE_APP_BASE_API

/**
 * 下载失败的用户可见文案（b125）。
 *
 * 改造前三条通道的 `.catch` 一律只报 `common.downloadError`：HTTP 403/404/500 与网关
 * HTML 页全都长成同一句话，且**没有追踪号**——b124 只把 traceId 接进了 `utils/request`
 * 主通道，这条裸 axios 的并行通道被漏在外面（23 个调用点）。
 *
 * 解析优先级（与 `utils/request` 主通道共用 `resolveApiErrorMessage`）：
 * 1. 后端 `msg` ⇒ 原样使用（它比按码写的通用文案具体：429 带"哪个入口忙、多久能重试"）；
 * 2. 只有错误体/HTTP 状态码 ⇒ 用标准码映射（403 ⇒ "当前操作没有权限" 比"下载失败"更准确）；
 * 3. 都没有（网络中断 / DNS / 网关 HTML 页）⇒ `common.downloadError`。
 *
 * 追踪号来自体（`trace_id`）或头（`X-Request-Id`），作为 `errorHub` 的独立字段上报——
 * 弹窗里的后缀由 errorHub 统一渲染，消息本身不再拼一遍（否则同一条会带两个追踪号）。
 */
async function buildDownloadFailure(error: unknown): Promise<{ message: string; traceId?: string }> {
  const response = (error as { response?: { status?: number; data?: unknown; headers?: unknown } })?.response
  const body = await readBlobErrorBody(response?.data)
  const traceId = pickTraceId(body ?? response?.data, response?.headers)
  const hasBodyDetail = body?.code !== undefined || body?.msg !== undefined
  const base =
    hasBodyDetail || response?.status
      ? resolveApiErrorMessage(body?.code ?? response?.status, body?.msg)
      : i18n.global.t('common.downloadError')
  return { message: base, traceId }
}

/** 上报下载失败（loading 的关闭由调用方在自己的 finally 里做，避免两条收尾路径漂移） */
async function reportDownloadFailure(error: unknown): Promise<void> {
  const { message, traceId } = await buildDownloadFailure(error)
  errorHub.report('error', 'download', message, traceId)
}

/**
 * 解析响应头 download-filename（后端 Content-Disposition 的 filename* 派生值）。
 *
 * 缺失/为空时回退 fallback —— 原先直接 `decodeURIComponent(undefined)` 会得到字符串
 * "undefined"，用户拿到一个叫 undefined 的文件；
 * 百分号编码非法（如截断的 %E4%BF，decodeURIComponent 抛 URIError）时原样返回，
 * 绝不让整条下载链路因文件名而抛错丢掉已取到的有效 blob。
 */
function resolveFilename(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default {
  name(name: string, isDelete = true) {
    // P0 修复：添加 loading 提示和错误处理，与 zip 方法保持一致
    // 使用局部变量：避免并发下载时模块级 loading 实例被覆盖
    const downloadLoadingInstance = ElLoading.service({
      text: i18n.global.t('common.downloading'),
      background: 'rgba(0, 0, 0, 0.7)'
    })
    const url = baseURL + '/common/download?fileName=' + encodeURIComponent(name) + '&delete=' + isDelete
    axios({
      method: 'get',
      url: url,
      responseType: 'blob',
      timeout: 60000,
      headers: { Authorization: 'Bearer ' + getToken() }
    })
      .then((res: AxiosResponse<Blob>) => {
        const isBlob = blobValidate(res.data)
        if (isBlob) {
          const blob = new Blob([res.data])
          this.saveAs(blob, resolveFilename(res.headers['download-filename'], name))
        } else {
          void this.printErrMsg(res.data, res.headers)
        }
        downloadLoadingInstance.close()
      })
      .catch((r: unknown) => {
        if (import.meta.env.DEV) console.error('[download]', (r as { message?: string })?.message || r)
        void reportDownloadFailure(r).finally(() => downloadLoadingInstance.close())
      })
  },
  resource(resource: string) {
    // P0 修复：添加 loading 提示和错误处理，与 zip 方法保持一致
    // 使用局部变量：避免并发下载时模块级 loading 实例被覆盖
    const downloadLoadingInstance = ElLoading.service({
      text: i18n.global.t('common.downloading'),
      background: 'rgba(0, 0, 0, 0.7)'
    })
    const url = baseURL + '/common/download/resource?resource=' + encodeURIComponent(resource)
    axios({
      method: 'get',
      url: url,
      responseType: 'blob',
      timeout: 60000,
      headers: { Authorization: 'Bearer ' + getToken() }
    })
      .then((res: AxiosResponse<Blob>) => {
        const isBlob = blobValidate(res.data)
        if (isBlob) {
          const blob = new Blob([res.data])
          // 回退名取资源路径最后一段（如 /profile/upload/x.png → x.png）
          this.saveAs(blob, resolveFilename(res.headers['download-filename'], resource.split('/').pop() || resource))
        } else {
          void this.printErrMsg(res.data, res.headers)
        }
        downloadLoadingInstance.close()
      })
      .catch((r: unknown) => {
        if (import.meta.env.DEV) console.error('[download resource]', (r as { message?: string })?.message || r)
        void reportDownloadFailure(r).finally(() => downloadLoadingInstance.close())
      })
  },
  zip(url: string, name: string) {
    const downloadUrl = baseURL + url
    // 使用局部变量：避免并发下载时模块级 loading 实例被覆盖
    const downloadLoadingInstance = ElLoading.service({
      text: i18n.global.t('common.downloading'),
      background: 'rgba(0, 0, 0, 0.7)'
    })
    axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'blob',
      timeout: 60000,
      headers: { Authorization: 'Bearer ' + getToken() }
    })
      .then((res: AxiosResponse<Blob>) => {
        const isBlob = blobValidate(res.data)
        if (isBlob) {
          const blob = new Blob([res.data], { type: 'application/zip' })
          this.saveAs(blob, name)
        } else {
          void this.printErrMsg(res.data, res.headers)
        }
        downloadLoadingInstance.close()
      })
      .catch((r: unknown) => {
        if (import.meta.env.DEV) console.error('[download zip]', (r as { message?: string })?.message || r)
        void reportDownloadFailure(r).finally(() => downloadLoadingInstance.close())
      })
  },
  saveAs(text: Blob, name: string) {
    // 统一走 utils/saveBlob：空载荷/通道抛错必须可见，且成功不弹"下载成功"
    if (!saveBlob(text, name)) errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
  },
  /** HTTP 200 + 非 blob 错误体（legacy 自定义业务码 / HTML 网关页）：解析后上报，带追踪号 */
  async printErrMsg(data: Blob, headers?: unknown) {
    const body = await readBlobErrorBody(data)
    const traceId = pickTraceId(body, headers)
    const hasBodyDetail = body?.code !== undefined || body?.msg !== undefined
    const base = hasBodyDetail ? resolveApiErrorMessage(body?.code, body?.msg) : i18n.global.t('common.downloadError')
    errorHub.report('error', 'download', base, traceId)
  }
}
