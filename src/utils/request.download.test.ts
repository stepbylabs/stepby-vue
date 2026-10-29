/**
 * 通用下载通道的失败结局（b125）。
 *
 * `download()` 走真实 `service`（`responseType: 'blob'`），因此失败有两种形状：
 * - **HTTP 200 + JSON 错误体**：拦截器按 blob 早返回，解析与上报发生在 `download()` 自己；
 * - **HTTP ≥400 / 网络中断**：拦截器已解析成可读文案并上报（source='api'），
 *   `download()` 的 catch **不得再补一条"下载失败"**——同一次失败两条不同措辞，
 *   正是 errorHub 想消除的"一串弹窗"。
 *
 * 改造前的可证伪缺陷：JSON 分支写 `errorCode[code] || msg || default`，而 errorCode 是
 * 恒返回 default 的 Proxy ⇒ 后端 msg 永远不透出；catch 分支只报通用文案。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import service, { download } from '@/utils/request'
import { errorHub } from '@/utils/errorHub'
import i18n from '@/i18n'

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

    await download('/system/user/importTemplate', {}, 'template.xlsx')

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

    await expect(download('/export/x', {}, 'x.xlsx')).resolves.toBeUndefined()
    expect(errorHub.issues[0]).toMatchObject({ source: 'download', message: t('common.downloadError') })
  })

  it('HTTP 403：拦截器已给出可读文案与追踪号，下载通道不得再补一条"下载失败"', async () => {
    restore = stubAdapter(
      rejectWith(403, blobOf('<html>Forbidden</html>', 'text/html'), { 'x-request-id': 'rid-dl-403' })
    )

    await expect(download('/export/forbidden', {}, 'forbidden.xlsx')).resolves.toBeUndefined()

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

    await expect(download('/export/net', {}, 'net.xlsx')).resolves.toBeUndefined()

    expect(errorHub.issues).toHaveLength(1)
    expect(errorHub.issues[0]).toMatchObject({ source: 'api', message: t('common.backendConnectionError') })
    expect(errorHub.issues.some((i) => i.source === 'download')).toBe(false)
  })
})
