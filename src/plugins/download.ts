import { ElLoading } from 'element-plus'
import i18n from '@/i18n'
import { saveBlob } from '@/utils/saveBlob'
import { blobValidate } from '@/utils/stepby'
import { errorHub } from '@/utils/errorHub'
import { readBlobErrorBody } from '@/utils/blobError'
import { resolveApiErrorMessage } from '@/utils/apiError'
import { pickTraceId } from '@/utils/traceId'
import { blobRequest, failureText, type BlobFailure } from '@/utils/blobRequest'
import { FILE_DOWNLOAD_TIMEOUT } from '@/utils/timeouts'

/**
 * 下载族（b138：三条通道收编到 `utils/blobRequest`）。
 *
 * 改造前每条通道各自 `axios({...})` 一份：超时写着 `60000`（统一口径 `FILE_DOWNLOAD_TIMEOUT`
 * 是 600_000，差 10 倍——大型 `/common/download` 必然在第 60 秒被 abort）、失败结局各自手写、
 * 401 只报一句"未授权"而不走会话失效。现在请求、超时、错误解析、追踪号、401 全部由原语承担，
 * 本文件只保留下载特有的三件事：**全屏 loading 配对、文件名解析、HTTP 200 但非 blob 的错误体**。
 *
 * `FILE_DOWNLOAD_TIMEOUT` 从 `utils/timeouts` 取（不是 `utils/request`）：后者在模块顶层建
 * axios 实例并注册拦截器，为一个常量把整套请求栈拖进每个下载调用点的模块图与单测不划算。
 */

function reportFailure(failure: BlobFailure): void {
  errorHub.report('error', 'download', failureText(failure), failure.traceId)
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

function openLoading(): { close: () => void } {
  // 局部实例：并发下载时模块级单例会被后者覆盖引用，前者的遮罩永远关不掉（b71 实测）
  return ElLoading.service({
    text: i18n.global.t('common.downloading'),
    background: 'rgba(0, 0, 0, 0.7)'
  })
}

/** 保存失败要可见（空载荷/通道抛错），成功不弹"下载成功"（b112） */
export function saveAs(text: Blob, name: string): void {
  if (!saveBlob(text, name)) errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
}

/** HTTP 200 + 非 blob（legacy 自定义业务码 / HTML 网关页）：解析后上报，带追踪号 */
export async function printErrMsg(data: Blob, headers?: unknown): Promise<void> {
  const body = await readBlobErrorBody(data)
  const traceId = pickTraceId(body, headers)
  const hasBodyDetail = body?.code !== undefined || body?.msg !== undefined
  const base = hasBodyDetail ? resolveApiErrorMessage(body?.code, body?.msg) : i18n.global.t('common.downloadError')
  errorHub.report('error', 'download', base, traceId)
}

interface DownloadEntry {
  url: string
  params?: Record<string, string | number>
}

/**
 * 三个入口共用的执行骨架：loading 必关、失败不抛、非 blob 走错误体解析。
 * `mime` 只在 zip 通道覆盖（后端未给 Content-Type 时浏览器按扩展名猜，但显式声明更稳）。
 * `useHeaderName=false` 保留 zip 的既有语义：调用方给定名优先，响应头不参与命名。
 */
async function runDownload(
  entry: DownloadEntry,
  fallbackName: string,
  opts: { mime?: string; useHeaderName?: boolean } = {}
): Promise<void> {
  const loading = openLoading()
  try {
    const res = await blobRequest({ ...entry, responseType: 'blob', timeout: FILE_DOWNLOAD_TIMEOUT })
    if (!res.ok) {
      reportFailure(res.failure)
      return
    }
    if (!blobValidate(res.data)) {
      await printErrMsg(res.data, res.headers)
      return
    }
    const blob = opts.mime ? new Blob([res.data], { type: opts.mime }) : new Blob([res.data])
    const name =
      opts.useHeaderName === false ? fallbackName : resolveFilename(res.headers['download-filename'], fallbackName)
    saveAs(blob, name)
  } catch (e) {
    // 原语不抛；这里只兜住保存/解析环节的意外（例如宿主环境裁掉了 Blob 构造）
    if (import.meta.env.DEV) console.error('[download]', e)
    errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
  } finally {
    loading.close()
  }
}

export default {
  name(name: string, isDelete = true) {
    return runDownload({ url: '/common/download', params: { fileName: name, delete: String(isDelete) } }, name)
  },
  resource(resource: string) {
    // 回退名取资源路径最后一段（如 /profile/upload/x.png → x.png）
    return runDownload(
      { url: '/common/download/resource', params: { resource } },
      resource.split('/').pop() || resource
    )
  },
  zip(url: string, name: string) {
    return runDownload({ url }, name, { mime: 'application/zip', useHeaderName: false })
  },
  saveAs,
  printErrMsg
}
