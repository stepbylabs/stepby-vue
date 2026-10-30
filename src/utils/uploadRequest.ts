/**
 * `el-upload` 的自定义传输（`:http-request`）单一实现（b138）。
 *
 * ## 为什么需要这一层
 *
 * EP 的 `<el-upload :action>` 用**组件内部自己的 XHR** 发请求，绕开 `utils/request`：
 * 没有超时上限、失败没有追踪号、401 不会触发统一重新登录。而这类通道源码里连
 * `fetch(`/`axios(` 都没有 ⇒ `directChannel.guard` 的静态面结构上看不见它（该守卫文件头
 * 已登记这条局限）。所以收编必须发生在**接线处**：每个上传组件挂 `:http-request`，
 * 由本函数统一发请求。
 *
 * ## 口径
 *
 * - 请求走 `utils/request`：令牌、`CONTROL_REQUEST_TIMEOUT`、追踪号、401 会话失效全部统一；
 * - **刻意不 reject**：EP 对返回 Promise 的 `http-request` 会自行 `.then(options.onSuccess, options.onError)`，
 *   抛出会让同一次失败既走 EP 的 onError（触发 `:on-error`）又走调用方提示（两条措辞不同的 toast）；
 * - 返回 `{ failed, sessionExpired }` 而不是布尔：调用方要据此决定"要不要补一条提示"——
 *   401 已由拦截器弹出重新登录框，再补一句"上传失败"只是噪声；其它失败拦截器**不弹 toast**
 *   （只进错误面板），所以组件必须自己给一次可见结局（AGENTS ㊷①：失败不得冒充"什么都没发生"）。
 */
import type { UploadRequestOptions } from 'element-plus'
import request from '@/utils/request'

/** EP 期望的 onError 参数类型（从 EP 自身签名派生，不深导入 `element-plus/es/…/ajax`——内部路径会漂） */
export type UploadFailureArg = Parameters<UploadRequestOptions['onError']>[0]

/** 请求层拒绝是否属于"会话过期"（拦截器已弹统一重新登录框，组件不必再提示） */
export function isSessionExpiryError(err: unknown): boolean {
  return (err as { httpStatus?: number } | null | undefined)?.httpStatus === 401
}

/**
 * 把请求层拒绝折算成 EP 期望的 onError 参数：三个字段取真实值
 * （`status` 来自拦截器附加的 `httpStatus`，拿不到记 0；EP 只用它复位内部状态）。
 * 新建对象而不是改写原错误——原错误可能已被 errorHub 引用（b124 追踪号闭环）。
 */
export function toUploadFailure(err: unknown): UploadFailureArg {
  return Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
    status: (err as { httpStatus?: number })?.httpStatus ?? 0,
    method: 'post',
    url: ''
  })
}

export interface UploadOutcome {
  failed: boolean
  /** 401：拦截器已给结局，调用方不要再提示 */
  sessionExpired: boolean
}

export interface UploadOnceInit {
  /** 后端路径（不含 `VITE_APP_BASE_API`，由 `utils/request` 统一拼基址） */
  url: string
  /** 追加 query（如 Excel 导入的 `updateSupport`） */
  params?: Record<string, string | number>
  /** 追加表单字段（组件自有 `:data` 之外的部分） */
  fields?: Record<string, unknown>
}

function appendFields(fd: FormData, fields: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    fd.append(key, typeof value === 'string' ? value : String(value))
  }
}

/**
 * 发包并驱动 EP 的 onSuccess / onError。文件字段名固定为 `file`（后端所有上传端点一致）。
 *
 * `options.data`（模板上的 `:data`）与 `init.fields` 合并：前者是调用方按行传入的业务字段，
 * 后者是组件自己的（如导入的覆盖开关），冲突时后者优先（组件语义比外部传参更具体）。
 */
export async function uploadViaRequest(options: UploadRequestOptions, init: UploadOnceInit): Promise<UploadOutcome> {
  const formData = new FormData()
  formData.append('file', options.file as File)
  appendFields(formData, { ...(options.data ?? {}), ...(init.fields ?? {}) })

  try {
    const res = await request({ url: init.url, method: 'post', data: formData, params: init.params })
    options.onSuccess(res)
    return { failed: false, sessionExpired: false }
  } catch (err) {
    options.onError(toUploadFailure(err))
    return { failed: true, sessionExpired: isSessionExpiryError(err) }
  }
}
