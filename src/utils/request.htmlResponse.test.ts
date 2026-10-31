/**
 * HTML 200 不得冒充成功（b143）
 *
 * 立案缺陷：同源嵌入部署时，后端根挂载点的兜底曾对**任意**未匹配路径返回
 * `index.html` + 200（b143 后端已按"是否浏览器导航"分派收口）。但前端这一侧
 * 同族缺陷独立成立：axios 把整段 HTML 当**字符串** data，而成功拦截器
 * `const code = data.code || 200` 恒为 200 ⇒ 调用方拿到"成功但空数据"：
 * `rows` / `data` 读出 undefined，页面渲染成空表，失败被藏进成功形状里。
 *
 * 判据四层（缺一即"看着像修好"）：
 * ① HTML 200 ⇒ 必须 reject，文案是 i18n 统一出口，追踪号来自响应头；
 * ② 对照组：正常 JSON 200 必须照常 resolve（证明 guard 不是"把一切都拒掉"）；
 * ③ blob 通道不受影响（下载 HTML 文件的合法通道，已在拦截器上方分流）；
 * ④ 取不到追踪号时**不得凭空造一个**（与 traceId 工具同口径）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AxiosResponse } from 'axios'
import service from '@/utils/request'
import { errorHub } from '@/utils/errorHub'
import i18n from '@/i18n'

const TRACE = 'b143-html-trace'

type TracedError = Error & { traceId?: string }

function makeResponse(
  data: unknown,
  contentType: string,
  opts: { headers?: Record<string, string>; responseType?: string } = {}
): AxiosResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': contentType, ...(opts.headers ?? {}) },
    config: {} as AxiosResponse['config'],
    request: { responseType: opts.responseType },
    data
  } as unknown as AxiosResponse
}

/** 用桩适配器把请求真跑一遍「适配器 → 响应拦截器」，返回成功值或逸出的错误 */
async function run(
  data: unknown,
  contentType: string,
  opts: { headers?: Record<string, string>; responseType?: string } = {}
): Promise<{ ok: true; value: unknown } | { ok: false; error: TracedError }> {
  const prev = service.defaults.adapter
  service.defaults.adapter = async (config) => {
    const res = makeResponse(data, contentType, opts)
    res.config = config
    return res
  }
  try {
    const value = await service.get('/__html_response_probe__', {
      responseType: (opts.responseType as 'blob' | undefined) ?? 'json'
    })
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: e as TracedError }
  } finally {
    service.defaults.adapter = prev
  }
}

beforeEach(() => {
  errorHub.clear()
  errorHub.setToastHandler(() => {})
})

afterEach(() => {
  errorHub.setToastHandler(null)
})

describe('① HTML 200 必须被拒绝（不再按空数据成功）', () => {
  it('content-type=text/html + 字符串体 ⇒ reject，文案走 i18n 统一出口', async () => {
    const r = await run('<!DOCTYPE html><html><body><div id="app"></div></body></html>', 'text/html; charset=utf-8', {
      headers: { 'x-request-id': TRACE }
    })
    expect(r.ok, 'HTML 200 不得 resolve').toBe(false)
    const err = (r as { ok: false; error: TracedError }).error
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe(i18n.global.t('common.unexpectedResponse'))
    // 追踪号来自响应头，与后端 X-Request-Id 同源
    expect(err.traceId).toBe(TRACE)
    // 同一次失败必须落在错误面板（可复制报障）
    const issues = errorHub.issues
    expect(issues.length).toBe(1)
    expect(issues[0].message).toContain(i18n.global.t('common.unexpectedResponse'))
    expect(issues[0].traceId).toBe(TRACE)
  })

  it('④ 响应头没有追踪号时不得凭空造 ID', async () => {
    const r = await run('<html><body>502 Bad Gateway</body></html>', 'text/html')
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: TracedError }).error.traceId).toBeUndefined()
  })
})

describe('② 对照组：正常 JSON 通道必须照常成功', () => {
  it('application/json + body.code=200 ⇒ resolve 原始体', async () => {
    const body = { code: 200, msg: '操作成功', rows: [{ id: 1 }], total: 1 }
    const r = await run(body, 'application/json;charset=UTF-8')
    expect(r.ok).toBe(true)
    expect((r as { ok: true; value: unknown }).value).toEqual(body)
  })
})

describe('③ blob 通道不受 HTML 判据影响', () => {
  it('responseType=blob + content-type=text/html ⇒ 仍返回 Blob（合法下载通道）', async () => {
    const blob = new Blob(['<html>report</html>'], { type: 'text/html' })
    const r = await run(blob, 'text/html', { responseType: 'blob' })
    expect(r.ok, 'blob 通道不得被 HTML 判据拦下').toBe(true)
    expect((r as { ok: true; value: unknown }).value).toBe(blob)
  })
})
