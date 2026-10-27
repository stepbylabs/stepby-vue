/**
 * 导出族的错误体契约（b98）
 *
 * 立案形状：导出族（xlsx / 审计 CSV / 备份）都走 `responseType: 'blob'`，axios 对
 * HTTP≥400 的 **JSON 错误体同样按 blob 返回**。改造前错误拦截器直接读
 * `response.data.msg` ⇒ 恒 `undefined`，用户只看到"请求过于频繁/无权限"这类通用
 * 文案——b98 刚给导出加的资源闸（闸满 429 + 点名 `export:excel` + Retry-After）
 * 在界面上等于只剩一句"请求过于频繁"，"哪个入口忙、什么时候能重试"全丢了。
 *
 * 三层：① 纯函数对 JSON / 非 JSON / 空消息 / 非二进制的归一；② 真实 service +
 * 桩适配器证明拦截器**真的用了**它（只测纯函数时，漏接线照样全绿）；③ 对照组：
 * HTML 错误页必须回落通用文案且不得是空串。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import service, { readBlobErrorBody } from '@/utils/request'
import { errorHub } from '@/utils/errorHub'
import i18n from '@/i18n'

describe('readBlobErrorBody 纯函数', () => {
  it('JSON Blob 与 ArrayBuffer 都能还原 code/msg', async () => {
    const blob = new Blob([JSON.stringify({ code: 429, msg: '导出任务繁忙' })], {
      type: 'application/json'
    })
    expect(await readBlobErrorBody(blob)).toEqual({ code: 429, msg: '导出任务繁忙' })
    const buf = new TextEncoder().encode(JSON.stringify({ msg: 'x' })).buffer
    expect(await readBlobErrorBody(buf)).toEqual({ msg: 'x' })
  })

  it('非 JSON / 空消息 / 非二进制一律 undefined（取不到不得读成空消息）', async () => {
    expect(await readBlobErrorBody(new Blob(['<html>502 Bad Gateway</html>']))).toBeUndefined()
    expect(await readBlobErrorBody(new Blob([JSON.stringify({ msg: '   ' })]))).toBeUndefined()
    expect(await readBlobErrorBody(undefined)).toBeUndefined()
    expect(await readBlobErrorBody({ msg: 'plain-object' })).toBeUndefined()
    // 只有 code 也是有效信息（例如 restful 档的真实状态码）
    expect(await readBlobErrorBody(new Blob([JSON.stringify({ code: 500 })]))).toEqual({
      code: 500
    })
  })
})

/** 用桩适配器让请求真走一遍「适配器 reject → 响应错误拦截器」全链路 */
async function rejectWithBlob(status: number, body: Blob): Promise<unknown> {
  const prev = service.defaults.adapter
  service.defaults.adapter = async (config) => {
    const response = {
      status,
      statusText: String(status),
      headers: {},
      config,
      // 成功拦截器第一句读 res.request.responseType（blob 侧道），错误路径同形状
      request: { responseType: 'blob' },
      data: body
    } as unknown as AxiosResponse
    throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response)
  }
  try {
    await service.get('/__blob_error_probe__', { responseType: 'blob' })
    return undefined
  } catch (e) {
    return e
  } finally {
    service.defaults.adapter = prev
  }
}

describe('响应错误拦截器读取 blob 错误体（真实 service + 桩适配器）', () => {
  beforeEach(() => errorHub.clear())
  afterEach(() => errorHub.clear())

  it('429 JSON 体：errorHub 收到后端真实文案，而不是通用「请求过于频繁」', async () => {
    const msg = '导出任务繁忙（export:excel），请 30 秒后重试'
    const err = await rejectWithBlob(429, new Blob([JSON.stringify({ code: 429, msg })], { type: 'application/json' }))
    expect(err).toBeTruthy()
    expect(errorHub.issues[0]?.message).toBe(msg)
  })

  it('对照组：HTML 体回落通用文案，且不得出现空消息', async () => {
    await rejectWithBlob(429, new Blob(['<html>502 Bad Gateway</html>']))
    const generic = i18n.global.t('common.tooManyRequests')
    expect(errorHub.issues[0]?.message).toBe(generic)
    expect(errorHub.issues[0]?.message.trim()).not.toBe('')
  })
})
