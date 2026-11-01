/**
 * 通用下载通道的失败结局（b125 / b146）。
 *
 * `download()` 走真实 `service`（`responseType: 'blob'`），因此失败有两种形状：
 * - **HTTP 200 + JSON 错误体**：拦截器按 blob 早返回，解析与上报发生在 `download()` 自己；
 * - **HTTP ≥400 / 网络中断**：拦截器已解析成可读文案并上报（source='api'），
 *   `download()` 的 catch **不得再补一条"下载失败"**——同一次失败两条不同措辞，
 *   正是 errorHub 想消除的"一串弹窗"。
 *
 * 改造前的可证伪缺陷：JSON 分支写 `errorCode[code] || msg || default`，而 errorCode 是
 * 恒返回 default 的 Proxy ⇒ 后端 msg 永远不透出；catch 分支只报通用文案。
 *
 * b146 追加的第二轴：**结局必须由返回值给**。四条失败出口过去都 resolve（签名
 * `Promise<void>`），调用点于是把"没抛异常"当成成功——同一屏幕同时出现失败理由与
 * "导出成功"，`operlog` 页"失败时保留对话框"的分支结构上永不成立。本文件原先三条
 * `resolves.toBeUndefined()` 正是把那个缺陷写成了期望（㉓ 同族），现逐条改回 `false`，
 * 并补成功轴的两条正控（真载荷 ⇒ true；截断标记 ⇒ 仍 true 且提示截断）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import service, { download } from '@/utils/request'
import { errorHub } from '@/utils/errorHub'
import i18n from '@/i18n'

const { saveAsMock } = vi.hoisted(() => ({
  saveAsMock: vi.fn<(blob: Blob, name: string) => void>(() => {})
}))
vi.mock('file-saver', () => ({ saveAs: (blob: Blob, name: string) => saveAsMock(blob, name) }))

const t = i18n.global.t

const blobOf = (body: string, type: string): Blob => new Blob([body], { type })

function stubAdapter(handler: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>): () => void {
  const prev = service.defaults.adapter
  service.defaults.adapter = handler as typeof service.defaults.adapter
  return () => {
    service.defaults.adapter = prev
  }
}

function rejectWith(
  status: number,
  data: unknown,
  headers: Record<string, string> = {}
): (config: InternalAxiosRequestConfig) => Promise<AxiosResponse> {
  return async (config) => {
    const response = {
      status,
      statusText: String(status),
      headers,
      config,
      request: { responseType: 'blob' },
      data
    } as unknown as AxiosResponse
    throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response)
  }
}

describe('request.download 失败结局', () => {
  let restore: (() => void) | null = null

  beforeEach(() => {
    errorHub.clear()
    errorHub.setToastHandler(() => {})
    vi.clearAllMocks()
  })
  afterEach(() => {
    restore?.()
    restore = null
    errorHub.clear()
    errorHub.setToastHandler(null)
  })

  it('HTTP 200 + JSON 错误体：后端 msg 优先（旧 Proxy 让它结构性不可达）', async () => {
    restore = stubAdapter(
      async (config) =>
        ({
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: { responseType: 'blob' },
          data: blobOf(
            JSON.stringify({ code: 601, msg: '模板已被停用，请先在模板管理里启用', trace_id: 'tid-dl-1' }),
            'application/json'
          )
        }) as unknown as AxiosResponse
    )

    // 结局必须是 false：JSON 错误体不是文件，调用点据此收回"导出成功"（b146）
    await expect(download('/system/user/importTemplate', {}, 'template.xlsx')).resolves.toBe(false)
    expect(saveAsMock).not.toHaveBeenCalled()

    expect(errorHub.issues).toHaveLength(1)
    expect(errorHub.issues[0]).toMatchObject({
      level: 'error',
      source: 'download',
      message: '模板已被停用，请先在模板管理里启用',
      traceId: 'tid-dl-1'
    })
  })

  it('HTTP 200 + 非 JSON 错误体：回落通用文案且不抛错', async () => {
    restore = stubAdapter(
      async (config) =>
        ({
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: { responseType: 'blob' },
          data: blobOf('<html>gateway</html>', 'application/json')
        }) as unknown as AxiosResponse
    )

    await expect(download('/export/x', {}, 'x.xlsx')).resolves.toBe(false)
    expect(errorHub.issues[0]).toMatchObject({ source: 'download', message: t('common.downloadError') })
  })

  it('HTTP 403：拦截器已给出可读文案与追踪号，下载通道不得再补一条"下载失败"', async () => {
    restore = stubAdapter(
      rejectWith(403, blobOf('<html>Forbidden</html>', 'text/html'), { 'x-request-id': 'rid-dl-403' })
    )

    await expect(download('/export/forbidden', {}, 'forbidden.xlsx')).resolves.toBe(false)

    // 恰好一条：source='api'（拦截器），带状态码对应文案与追踪号
    expect(errorHub.issues).toHaveLength(1)
    expect(errorHub.issues[0]).toMatchObject({
      source: 'api',
      message: t('common.noPermission'),
      traceId: 'rid-dl-403'
    })
    expect(errorHub.issues.some((i) => i.source === 'download')).toBe(false)
  })

  it('网络中断（无响应）：拦截器报连接失败，下载通道同样不重复上报', async () => {
    restore = stubAdapter(async (config) => {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {})
    })

    await expect(download('/export/net', {}, 'net.xlsx')).resolves.toBe(false)

    expect(errorHub.issues).toHaveLength(1)
    expect(errorHub.issues[0]).toMatchObject({ source: 'api', message: t('common.backendConnectionError') })
    expect(errorHub.issues.some((i) => i.source === 'download')).toBe(false)
  })

  // ---------------- 成功轴（b146）：`true` 到底能证明到哪一步 ----------------

  it('真载荷：交给保存通道并返回 true，全程不得产生任何失败记录', async () => {
    restore = stubAdapter(
      async (config) =>
        ({
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: { responseType: 'blob' },
          data: blobOf('PK\x03\x04 fake xlsx bytes', 'application/vnd.ms-excel')
        }) as unknown as AxiosResponse
    )

    await expect(download('/system/user/export', {}, 'user.xlsx')).resolves.toBe(true)
    expect(saveAsMock).toHaveBeenCalledTimes(1)
    expect(saveAsMock.mock.calls[0][1]).toBe('user.xlsx')
    expect(errorHub.issues).toHaveLength(0)
  })

  it('截断标记：文件确实交出去了 ⇒ 仍为 true，但必须让用户看见"结果不完整"', async () => {
    const truncated = blobOf('a,b\r\n1,2\r\n', 'application/vnd.ms-excel') as Blob & {
      _truncated?: boolean
    }
    truncated._truncated = true
    restore = stubAdapter(
      async (config) =>
        ({
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: { responseType: 'blob' },
          data: truncated
        }) as unknown as AxiosResponse
    )
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: () => {} }) as never)

    await expect(download('/monitor/operlog/export', {}, 'operlog.xlsx')).resolves.toBe(true)
    expect(warning).toHaveBeenCalledWith(t('common.exportTruncated'))

    warning.mockRestore()
  })

  // ⚠ 每条用例的 url 必须互不相同：`request.ts` 的防重复提交闸比较的是
  // **上一条请求的 url + data**（`sessionObj`，interval 内同 url 同 data 直接 reject），
  // 而这些用例的 `params` 都是 `{}`——复用同一个 url 会让后一条被闸拦掉，
  // 红在夹具的碰撞上而不是红在判据上（本文件第一轮实测即如此）。
  it('0 字节载荷：不是"下载成功"，而是 false + 一条可见失败（旧契约在这里同样 resolve）', async () => {
    restore = stubAdapter(
      async (config) =>
        ({
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: { responseType: 'blob' },
          data: new Blob([], { type: 'application/vnd.ms-excel' })
        }) as unknown as AxiosResponse
    )

    await expect(download('/system/dept/export', {}, 'empty.xlsx')).resolves.toBe(false)
    expect(saveAsMock).not.toHaveBeenCalled()
    expect(errorHub.issues[0]).toMatchObject({ source: 'download', message: t('common.downloadError') })
  })

  it('保存通道抛错（隐私模式 / 配额被拒）：折算成 false 并留一条可见失败', async () => {
    saveAsMock.mockImplementationOnce(() => {
      throw new Error('SecurityError')
    })
    restore = stubAdapter(
      async (config) =>
        ({
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: { responseType: 'blob' },
          data: blobOf('payload', 'application/vnd.ms-excel')
        }) as unknown as AxiosResponse
    )

    await expect(download('/system/post/export', {}, 'post.xlsx')).resolves.toBe(false)
    expect(errorHub.issues[0]).toMatchObject({ source: 'download', message: t('common.downloadError') })
  })
})
