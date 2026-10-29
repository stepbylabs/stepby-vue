/**
 * 请求追踪号闭环契约测试（b124）
 *
 * 立案证据：后端从 G-13a 起在每个失败响应 body 里带 `trace_id`、响应头里带同值的
 * `X-Request-Id`（`src/middleware/request_id.rs` 优先生成/复用，`common/error.rs` 落 body），
 * 而全前端 `src/` 改造前没有任何读取点——用户报障时只能描述"点了个保存然后报错"，
 * 运维拿不到能对上 `tracing` 日志的 ID。**头发出去没人接，等于把契约留在空气里**（同 b83
 * `Retry-After` 的立案形状）。
 *
 * 判据分三层：
 * ① 成功拦截器的 `body.code` 通道（legacy 档 + restful 档的业务码）——记录与拒绝的错误都带 ID；
 * ② 错误拦截器的三条来源：JSON 体 / 只有响应头（网关 HTML 错误页）/ blob 错误体；
 * ③ 取不到时**不得凭空造 ID**，且 `/login` 的 401 原有文案语义不变（本批只加后缀与字段）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import service, { readBlobErrorBody } from '@/utils/request'
import { errorHub } from '@/utils/errorHub'
import i18n from '@/i18n'

type TracedError = Error & { traceId?: string; code?: number }

const TRACE = '3c054e4f-c0e0-44f1-bc4d-3c29de98b6f6'

function stubAdapter(response: AxiosResponse, opts: { reject: boolean }): void {
  service.defaults.adapter = async (config) => {
    response.config = config
    // 成功拦截器第一句读 res.request.responseType（blob 侧道），桩适配器必须给
    response.request = response.request ?? {}
    if (opts.reject) {
      throw new AxiosError(
        `Request failed with status code ${response.status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response
      )
    }
    return response
  }
}

async function run(response: AxiosResponse, reject = false): Promise<TracedError | undefined> {
  const prev = service.defaults.adapter
  stubAdapter(response, { reject })
  try {
    await service.get('/__trace_id_probe__', { responseType: response.request?.responseType })
    return undefined
  } catch (e) {
    return e as TracedError
  } finally {
    service.defaults.adapter = prev
  }
}

/** 用 history.pushState 改 pathname：拦截器读 window.location.pathname 分派文案 */
async function atPath<T>(p: string, fn: () => Promise<T>): Promise<T> {
  const prev = window.location.pathname
  window.history.pushState({}, '', p)
  try {
    return await fn()
  } finally {
    window.history.pushState({}, '', prev)
  }
}

beforeEach(() => {
  errorHub.clear()
  // 弹窗走注入器：本文件断言的是"记录里有什么"，不是"界面怎么画"
  errorHub.setToastHandler(() => {})
})
afterEach(() => {
  errorHub.clear()
  errorHub.setToastHandler(null)
})

describe('① 成功拦截器：HTTP 200 + body.code 失败', () => {
  it('body.trace_id 进入监控记录与拒绝错误的 traceId（前端可展示/可复制）', async () => {
    const e = await run({
      status: 200,
      statusText: 'OK',
      headers: {},
      request: {},
      // 500 走 errorCode 映射的通用文案（既有口径）；本判据只关心 traceId 是否贯通
      data: { code: 500, msg: 'ignored', trace_id: TRACE }
    } as unknown as AxiosResponse)
    const expected = i18n.global.t('errorCode.500')

    expect(e).toBeInstanceOf(Error)
    expect(e?.message).toBe(expected)
    expect(e?.traceId).toBe(TRACE)
    expect(errorHub.issues[0]?.message).toBe(expected)
    expect(errorHub.issues[0]?.traceId).toBe(TRACE)
  })

  it('反证：body 没有 trace_id 时两处都不得凭空出现 ID', async () => {
    const e = await run({
      status: 200,
      statusText: 'OK',
      headers: {},
      request: {},
      data: { code: 500, msg: '后端内部错误' }
    } as unknown as AxiosResponse)

    expect(e?.traceId).toBeUndefined()
    expect(errorHub.issues[0]?.traceId).toBeUndefined()
  })
})

describe('② 错误拦截器：三个来源', () => {
  it('JSON 错误体：body.trace_id 与响应头同源，取 body 值', async () => {
    const e = await run(
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'x-request-id': 'header-id' },
        request: {},
        data: { code: 500, msg: '数据库连接失败', trace_id: TRACE }
      } as unknown as AxiosResponse,
      true
    )

    expect(e?.message).not.toBe('')
    expect(e?.traceId).toBe(TRACE)
    expect(errorHub.issues[0]?.traceId).toBe(TRACE)
  })

  it('只有响应头（网关 HTML 错误页）：仍能拿到 ID', async () => {
    const e = await run(
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'x-request-id': TRACE },
        request: {},
        data: '<html>502 Bad Gateway</html>'
      } as unknown as AxiosResponse,
      true
    )

    expect(e?.traceId).toBe(TRACE)
    expect(errorHub.issues[0]?.traceId).toBe(TRACE)
  })

  it('blob 错误体（导出族）：readBlobErrorBody 带出 trace_id，拦截器从体里取', async () => {
    const body = new Blob([JSON.stringify({ code: 429, msg: '导出任务繁忙', trace_id: TRACE })], {
      type: 'application/json'
    })
    expect(await readBlobErrorBody(body)).toMatchObject({ code: 429, trace_id: TRACE })

    const e = await run(
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        request: { responseType: 'blob' },
        data: body
      } as unknown as AxiosResponse,
      true
    )

    expect(e?.traceId).toBe(TRACE)
    expect(errorHub.issues[0]?.message).toBe('导出任务繁忙')
    expect(errorHub.issues[0]?.traceId).toBe(TRACE)
  })

  it('两路都取不到 ⇒ traceId 保持 undefined（不得读成空串或凭空生成）', async () => {
    const e = await run(
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        request: {},
        data: { code: 500, msg: '未知错误' }
      } as unknown as AxiosResponse,
      true
    )

    expect(e?.traceId).toBeUndefined()
    expect(errorHub.issues[0]?.traceId).toBeUndefined()
  })
})

describe('③ /login 401：原语义不变，错误对象带上追踪号', () => {
  it('reject 的 Error 仍是后端文案（不是 axios 原文），且带 traceId', async () => {
    await atPath('/login', async () => {
      const e = await run(
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'x-request-id': TRACE },
          request: {},
          data: { code: 401, msg: '用户名或密码错误', trace_id: TRACE }
        } as unknown as AxiosResponse,
        true
      )

      expect(e?.message).toBe('用户名或密码错误')
      expect(e?.traceId).toBe(TRACE)
      expect((e as { httpStatus?: number }).httpStatus, '凭据错误不得被标成会话过期').toBeUndefined()
    })
  })
})
