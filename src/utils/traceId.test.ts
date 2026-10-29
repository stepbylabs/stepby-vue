/**
 * 请求追踪号（b124）：后端在每个失败响应里带 `trace_id`（body）+ `X-Request-Id`（header），
 * 两者同源同值。改造前全前端**没有任何读取点**——用户报障时只能描述"我点了个保存然后报错了"，
 * 运维拿不到能对上日志的 ID（`stepby_axum::middleware::request_id` 生成的 UUID 只在服务端留痕）。
 *
 * 本文件只测纯函数的归一方向；"拦截器真的用了它"由 `request.traceId.test.ts` 的真实 service 证明。
 * 两个方向都必须有反证：合法 UUID 采信，非字符串 / 空串 / 超长 / 控制字符一律 undefined
 * ——否则一个带换行的"ID"会被拼进 toast 与复制按钮，既能撑破界面也可能污染日志（C.9 同源）。
 */
import { describe, expect, it } from 'vitest'
import {
  TRACE_ID_HEADER,
  TRACE_ID_MAX_LEN,
  attachTraceId,
  normalizeTraceId,
  pickTraceId,
  readTraceIdFromBody,
  readTraceIdFromHeaders
} from '@/utils/traceId'

const UUID = '3c054e4f-c0e0-44f1-bc4d-3c29de98b6f6'

describe('normalizeTraceId', () => {
  it('采信普通 UUID 并去掉首尾空白', () => {
    expect(normalizeTraceId(UUID)).toBe(UUID)
    expect(normalizeTraceId(`  ${UUID}\n`)).toBe(UUID)
  })

  it('取不到/坏形状一律 undefined（不得读成空串 ID）', () => {
    expect(normalizeTraceId(undefined)).toBeUndefined()
    expect(normalizeTraceId(null)).toBeUndefined()
    expect(normalizeTraceId(123)).toBeUndefined()
    expect(normalizeTraceId('')).toBeUndefined()
    expect(normalizeTraceId('   ')).toBeUndefined()
    expect(normalizeTraceId('a'.repeat(TRACE_ID_MAX_LEN + 1))).toBeUndefined()
  })

  it('含空白或控制字符的 ID 不采信（会被拼进 toast / 复制按钮 / 日志）', () => {
    expect(normalizeTraceId('trace 1')).toBeUndefined()
    expect(normalizeTraceId('trace\n1')).toBeUndefined()
    expect(normalizeTraceId('trace\u0000')).toBeUndefined()
    expect(normalizeTraceId('trace\u007f')).toBeUndefined()
  })

  it('边界：恰好 128 字符采信', () => {
    const id = 'a'.repeat(TRACE_ID_MAX_LEN)
    expect(normalizeTraceId(id)).toBe(id)
  })
})

describe('readTraceIdFromBody / readTraceIdFromHeaders / pickTraceId', () => {
  it('body.trace_id 优先于响应头', () => {
    expect(readTraceIdFromBody({ trace_id: 'body-id' })).toBe('body-id')
    expect(pickTraceId({ trace_id: 'body-id' }, { [TRACE_ID_HEADER]: 'header-id' })).toBe('body-id')
  })

  it('body 取不到回落到响应头（网关 HTML 错误页只有头这一条通道）', () => {
    expect(readTraceIdFromBody(null)).toBeUndefined()
    expect(readTraceIdFromBody([])).toBeUndefined()
    expect(readTraceIdFromBody('trace_id')).toBeUndefined()
    expect(readTraceIdFromHeaders({ [TRACE_ID_HEADER]: 'header-id' })).toBe('header-id')
    expect(readTraceIdFromHeaders({ 'X-Request-Id': 'camel-id' })).toBe('camel-id')
    expect(pickTraceId('<html>502</html>', { [TRACE_ID_HEADER]: 'header-id' })).toBe('header-id')
  })

  it('axios 头的 get() 通道可用时优先走 get（真实 AxiosHeaders 的形状）', () => {
    const headers = { get: (name: string) => (name === TRACE_ID_HEADER ? 'via-get' : undefined) }
    expect(readTraceIdFromHeaders(headers)).toBe('via-get')
  })

  it('两路都没有 ⇒ undefined（不得凭空生成一个 ID）', () => {
    expect(pickTraceId({ code: 500, msg: 'x' })).toBeUndefined()
    expect(pickTraceId(undefined, {})).toBeUndefined()
    expect(readTraceIdFromHeaders(undefined)).toBeUndefined()
    expect(readTraceIdFromHeaders(null)).toBeUndefined()
  })
})

describe('attachTraceId', () => {
  it('有 ID 时挂到 Error 上，无 ID 时原样返回（不写空字段）', () => {
    const withId = attachTraceId(new Error('boom'), UUID)
    expect(withId.traceId).toBe(UUID)
    const without = attachTraceId(new Error('boom'), undefined)
    expect(without).toBeInstanceOf(Error)
    expect((without as { traceId?: string }).traceId).toBeUndefined()
    expect('traceId' in without).toBe(false)
  })
})
