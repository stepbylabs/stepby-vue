/**
 * `Retry-After` 解析与挂载契约测试（b83）
 *
 * 锁定的真实缺口：后端从本批起在**锁定/限流的 429** 上发 `Retry-After`
 * （`AppError::retry_after` + `SharedStore::ttl` 给出真实剩余秒数），但改造前
 * `src/utils/request.ts` 的 429 分支只做 `errorHub.report(...)` 后原样 reject
 * ——全 `src/` 没有任何 `response.headers` 读取点（实测 grep 0 命中）。
 * 头发出去没人接，等于把契约留在空气里：用户看到"请 10 分钟后再试"仍然可以
 * 无限重点"确定"，每次都换回一条 429 与一行失败审计。
 *
 * 两层都要测：
 * ① 纯函数（`parseRetryAfterSeconds`）：畸形输入的归一方向——本仓判据三次踩过
 *    `Number(null) === 0` 这一族"把取不到读成 0"（b79 汇总器、b82 棘轮、b82 三态），
 *    所以"取不到 ⇒ undefined"必须有反证，不能只测"给了就解析得出"。
 * ② 真实 service + 桩适配器（同 `request.upload.test.ts` 的口径）：证明挂载发生在
 *    **响应错误拦截器里**，而不是只有工具函数存在。只测 ① 时，拦截器漏挂照样全绿。
 */
import { describe, it, expect } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import service, { parseRetryAfterSeconds, RETRY_AFTER_HEADER } from '@/utils/request'

const NOW = Date.UTC(2026, 9, 21, 10, 0, 0)

describe('parseRetryAfterSeconds 纯函数', () => {
  it('delta-seconds：正整数秒采信', () => {
    expect(parseRetryAfterSeconds('120', NOW)).toBe(120)
    expect(parseRetryAfterSeconds(' 45 ', NOW)).toBe(45)
    expect(parseRetryAfterSeconds('1', NOW)).toBe(1)
  })

  it('取不到/非法一律 undefined，绝不回落成 0（0 会被 UI 读成"立刻可重试"）', () => {
    expect(parseRetryAfterSeconds(undefined, NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds(null, NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds('', NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds('   ', NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds('0', NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds('-5', NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds('abc', NOW)).toBeUndefined()
    // 数字类型不是 axios 头的形状；混进来必须当"没有"，不能被 Number() 洗白
    expect(parseRetryAfterSeconds(120 as unknown, NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds(Number.NaN as unknown, NOW)).toBeUndefined()
  })

  it('HTTP-date：未来采信、已过与非法不采信', () => {
    const future = new Date(NOW + 60_000).toUTCString()
    expect(parseRetryAfterSeconds(future, NOW)).toBe(60)
    expect(parseRetryAfterSeconds(new Date(NOW - 1000).toUTCString(), NOW)).toBeUndefined()
    expect(parseRetryAfterSeconds('Wed, 21 Oct 2015 07:28:00 GMT', NOW)).toBeUndefined()
  })

  it('上限夹到 86400：畸形大数不得把按钮锁到刷新为止', () => {
    expect(parseRetryAfterSeconds('999999999', NOW)).toBe(86400)
    expect(parseRetryAfterSeconds(new Date(NOW + 99 * 3600_000).toUTCString(), NOW)).toBe(86400)
    // 边界内原值不动（防止 clamp 写成 min(…, 86400) 之外的另一种截断）
    expect(parseRetryAfterSeconds('86400', NOW)).toBe(86400)
  })
})

describe('响应错误拦截器把秒数挂到 error 上（真实 service + 桩适配器）', () => {
  /**
   * 用桩适配器让请求真的走一遍「适配器 reject → 响应错误拦截器」全链路
   * （口径同 `request.upload.test.ts`：不去摸拦截器的私有结构——那种测试换个
   * axios 版本就红，而红出来的仍然是"测试自己坏了"）。
   */
  async function rejectWith(status: number, headers: Record<string, string>): Promise<unknown> {
    const prev = service.defaults.adapter
    service.defaults.adapter = async (config) => {
      const response = {
        status,
        statusText: String(status),
        headers,
        config,
        data: { code: status, msg: 'TOTP 验证失败次数过多，请 10 分钟后再试', status: 'error' }
      } as unknown as AxiosResponse
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response
      )
    }
    try {
      await service.get('/__retry_after_probe__')
      return undefined
    } catch (e) {
      return e
    } finally {
      service.defaults.adapter = prev
    }
  }

  it('429 + Retry-After ⇒ error.retryAfterSeconds 可读', async () => {
    const e = (await rejectWith(429, { [RETRY_AFTER_HEADER]: '57' })) as { retryAfterSeconds?: number }
    expect(e).toBeInstanceOf(AxiosError)
    expect(e.retryAfterSeconds).toBe(57)
  })

  it('429 无头 ⇒ 不挂该字段（不得凭空造一个默认退避时长）', async () => {
    const e = (await rejectWith(429, {})) as { retryAfterSeconds?: number }
    expect(e).toBeInstanceOf(AxiosError)
    expect(e.retryAfterSeconds).toBeUndefined()
  })

  it('对照组：400 带 Retry-After 也不挂——本批改的只有锁定/限流语义，不顺手扩大契约面', async () => {
    const e = (await rejectWith(400, { [RETRY_AFTER_HEADER]: '57' })) as { retryAfterSeconds?: number }
    expect(e).toBeInstanceOf(AxiosError)
    expect(e.retryAfterSeconds).toBeUndefined()
  })
})
