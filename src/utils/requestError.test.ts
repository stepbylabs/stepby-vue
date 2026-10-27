/**
 * 请求层标记的**产出形状**契约（批一百零三）。
 *
 * 消费侧（`ErrorBoundary`）按标记决定"保留页面还是卸载"，所以标记必须覆盖**全部**
 * 拒绝形状——拦截器里有四条互不相同的出口（原样 axios error / 业务码重写 Error /
 * 会话过期 Error / 网络错误），漏掉任何一条，那条路径上的页面就仍会被整页卸载。
 *
 * 判据：真实 service + 桩适配器（口径同 `request.retryAfter.test.ts`），逐个形状断言
 * `isRequestLayerError(err) === true`；另配反证——组件自己抛的普通 Error 不得带标记
 * （否则边界会把渲染错误也放过去）。
 */
import { describe, it, expect } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import service, { isRelogin } from '@/utils/request'
import { isRequestLayerError } from '@/utils/requestError'

function stubAdapter(handler: (config: unknown) => Promise<AxiosResponse> | AxiosResponse) {
  const prev = service.defaults.adapter
  service.defaults.adapter = async (config) => handler(config)
  return () => {
    service.defaults.adapter = prev
  }
}

function resp(config: unknown, status: number, data: unknown): AxiosResponse {
  return {
    status,
    statusText: 'OK',
    headers: {},
    config: config as never,
    request: {},
    data
  } as unknown as AxiosResponse
}

async function rejectionOf(url: string): Promise<unknown> {
  try {
    await service.get(url)
    return undefined
  } catch (e) {
    return e
  }
}

describe('请求层拒绝标记的产出形状', () => {
  it('HTTP 400（原样 axios error）带标记', async () => {
    const restore = stubAdapter((config) => {
      throw new AxiosError(
        'Bad Request',
        AxiosError.ERR_BAD_REQUEST,
        config as never,
        {},
        resp(config, 400, { msg: '参数错' })
      )
    })
    try {
      const err = await rejectionOf('/__probe_http_400__')
      expect(err).toBeInstanceOf(Error)
      expect(isRequestLayerError(err)).toBe(true)
    } finally {
      restore()
    }
  })

  it('HTTP 200 + body.code=500（业务码重写 Error）带标记', async () => {
    const restore = stubAdapter((config) => resp(config, 200, { code: 500, msg: '内部错误' }))
    try {
      const err = await rejectionOf('/__probe_body_500__')
      expect(err).toBeInstanceOf(Error)
      expect(isRequestLayerError(err)).toBe(true)
    } finally {
      restore()
    }
  })

  it('会话过期（401 重写 Error）带标记，且 httpStatus 仍在', async () => {
    const restore = stubAdapter((config) => {
      throw new AxiosError(
        'Unauthorized',
        AxiosError.ERR_BAD_REQUEST,
        config as never,
        {},
        resp(config, 401, { code: 401, msg: '会话过期' })
      )
    })
    // 401 会弹"重新登录"确认框（等待用户选择）⇒ 复用既有抑制开关，避免用例挂满超时
    const prevShow = isRelogin.show
    isRelogin.show = true
    try {
      const err = (await rejectionOf('/__probe_401__')) as Error & { httpStatus?: number }
      expect(isRequestLayerError(err)).toBe(true)
      expect(err.httpStatus).toBe(401)
    } finally {
      isRelogin.show = prevShow
      restore()
    }
  })

  it('网络错误带标记', async () => {
    const restore = stubAdapter((config) => {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config as never, {})
    })
    try {
      const err = await rejectionOf('/__probe_network__')
      expect(err).toBeInstanceOf(Error)
      expect(isRequestLayerError(err)).toBe(true)
    } finally {
      restore()
    }
  })

  it('组件自己抛的普通 Error 不带标记（反证：边界不会把渲染错误也放过）', () => {
    expect(isRequestLayerError(new Error('render boom'))).toBe(false)
    expect(isRequestLayerError('cancel')).toBe(false)
    expect(isRequestLayerError({ message: 'x' })).toBe(false)
  })
})
