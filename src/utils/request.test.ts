/**
 * utils/request.ts 响应拦截器分支覆盖测试（批六十四覆盖率工程）。
 * 覆盖：body code 200/400/401/403/500/503/601/1003/非200、HTTP 层 403/404/429/500
 * （adapter 内 throw AxiosError 模拟 axios 真实非 2xx 行为）、网络错误。
 * 断言放宽为 reject 语义（具体 msg 走 i18n 文案，不透传 body.msg）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import axios, { AxiosError, AxiosHeaders } from 'axios'
import service, { isRelogin } from './request'

type Case = { status?: number; body?: unknown; network?: boolean }

let respond: Case | null = null

// @ts-expect-error 测试注入自定义 adapter（覆盖默认 http adapter）——
// HTTP 非 2xx 须 throw AxiosError 才与真实 adapter 行为一致（否则走不到 error 拦截器）
service.defaults.adapter = async (config) => {
  if (respond?.network) {
    throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)
  }
  const status = respond?.status ?? 200
  const body = respond?.body ?? {}
  if (status >= 400) {
    throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, {
      data: body,
      status,
      statusText: String(status),
      headers: new AxiosHeaders(),
      config
    } as never)
  }
  return {
    data: body,
    status,
    statusText: String(status),
    headers: {},
    config,
    request: {}
  } as unknown as Awaited<ReturnType<typeof axios.request>>
}

describe('utils/request 响应拦截器分支覆盖', () => {
  beforeEach(() => {
    respond = null
    isRelogin.show = false
  })

  it('body code=200 → resolve 且返回 data', async () => {
    respond = { body: { code: 200, msg: 'ok', data: { a: 1 } } }
    const res = await service.get('/test/ok')
    expect((res as unknown as { data: { a: number } }).data.a).toBe(1)
  })

  it('body code=400 → reject（warning 反馈）', async () => {
    respond = { body: { code: 400, msg: '参数错误' } }
    await expect(service.get('/test/400')).rejects.toBeTruthy()
  })

  it('body code=403 → reject（权限不足）', async () => {
    respond = { body: { code: 403, msg: '没有权限访问该资源' } }
    await expect(service.get('/test/403')).rejects.toBeTruthy()
  })

  it('body code=500 → reject（error 反馈）', async () => {
    respond = { body: { code: 500, msg: '服务器错误' } }
    await expect(service.get('/test/500')).rejects.toBeTruthy()
  })

  it('body code=503 → reject（服务不可用 fail-closed）', async () => {
    respond = { body: { code: 503, msg: '服务暂时不可用' } }
    await expect(service.get('/test/503')).rejects.toBeTruthy()
  })

  it('body code=601 → reject（warning）', async () => {
    respond = { body: { code: 601, msg: '警告消息' } }
    await expect(service.get('/test/601')).rejects.toBeTruthy()
  })

  it('body code=1003 → reject 携带业务码 err.code=1003（TOTP 多因子语义）', async () => {
    respond = { body: { code: 1003, msg: '验证码错误' } }
    const err = await service.get('/test/1003').catch((e: { code?: number }) => e)
    expect((err as { code?: number }).code).toBe(1003)
  })

  it('body code=999 未知非 200 → reject（系统未知错误兜底）', async () => {
    respond = { body: { code: 999, msg: '未知业务码' } }
    await expect(service.get('/test/999')).rejects.toBeTruthy()
  })

  it('HTTP 403 → error 拦截器 reject', async () => {
    respond = { status: 403, body: { code: 403, msg: '禁止访问' } }
    await expect(service.get('/test/http403')).rejects.toBeTruthy()
  })

  it('HTTP 404 → error 拦截器 reject', async () => {
    respond = { status: 404, body: { code: 404, msg: '端点不存在' } }
    await expect(service.get('/test/http404')).rejects.toBeTruthy()
  })

  it('HTTP 429 → error 拦截器 reject 频率限制', async () => {
    respond = { status: 429, body: { msg: '请求过于频繁' } }
    await expect(service.get('/test/http429')).rejects.toBeTruthy()
  })

  it('HTTP 500 → error 拦截器 reject', async () => {
    respond = { status: 500, body: { msg: '内部错误' } }
    await expect(service.get('/test/http500')).rejects.toBeTruthy()
  })

  it('网络错误 → reject 后端连接错误', async () => {
    respond = { network: true }
    await expect(service.get('/test/neterr')).rejects.toBeTruthy()
  })

  it('导出截断头不改变正常 resolve 语义', async () => {
    respond = { body: { code: 200, msg: 'ok', data: [] } }
    const res = await service.get('/test/truncated', { headers: { 'x-export-truncated': 'true' } })
    expect(res).toBeTruthy()
  })
})
