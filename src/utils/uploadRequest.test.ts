/**
 * `utils/uploadRequest` 单元测试（b138）。
 *
 * 这是 `el-upload` 的 `:http-request` 单一实现：把 EP 内置 XHR 换成请求层。
 * 覆盖的是**契约**而不是组件：
 * - 请求形状：POST + FormData + 文件字段名固定 `file` + `:data` 与 `init.fields` 合并（后者优先）；
 * - 三档结局各自不同：成功 ⇒ onSuccess(res) 且不再 onError；失败 ⇒ onError 且**不 reject**
 *   （EP 会自行 `.then(onSuccess, onError)`，抛出会让同一次失败走两条提示）；
 * - 401 必须被识别成 `sessionExpired`（调用方据此不再补提示，拦截器已经弹了重新登录框）。
 *
 * 对照组的必要性：只断言"失败时 failed=true"会被"永远失败"满足，所以每组都配一条成功路径。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UploadRequestOptions } from 'element-plus'

const requestMock = vi.fn()
vi.mock('@/utils/request', () => ({ default: (...args: unknown[]) => requestMock(...args) }))

import { isSessionExpiryError, toUploadFailure, uploadViaRequest } from './uploadRequest'

function makeOptions(file = new File(['abc'], 'a.png', { type: 'image/png' }), data?: Record<string, unknown>) {
  const onSuccess = vi.fn()
  const onError = vi.fn()
  const options = {
    file,
    data,
    onSuccess,
    onError,
    onProgress: vi.fn(),
    filename: 'file',
    action: '/common/upload',
    method: 'post',
    headers: {}
  } as unknown as UploadRequestOptions
  return { options, onSuccess, onError }
}

function formOf(): FormData {
  return requestMock.mock.calls[0][0].data as FormData
}

describe('utils/uploadRequest · uploadViaRequest', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('成功：POST + FormData + 文件字段 file，onSuccess 拿到响应体，不调 onError', async () => {
    requestMock.mockResolvedValue({ code: 200, fileName: '/x.png' })
    const { options, onSuccess, onError } = makeOptions()

    const outcome = await uploadViaRequest(options, { url: '/common/upload' })

    expect(requestMock).toHaveBeenCalledTimes(1)
    const config = requestMock.mock.calls[0][0]
    expect(config.url).toBe('/common/upload')
    expect(config.method).toBe('post')
    expect(formOf().get('file')).toBeInstanceOf(File)
    expect(onSuccess).toHaveBeenCalledWith({ code: 200, fileName: '/x.png' })
    expect(onError).not.toHaveBeenCalled()
    expect(outcome).toEqual({ failed: false, sessionExpired: false })
  })

  it('附加字段：options.data 与 init.fields 合并，组件自有字段优先，null/undefined 不入表', async () => {
    requestMock.mockResolvedValue({ code: 200 })
    const { options } = makeOptions(undefined, { biz: 'user', keep: 1, skip: undefined, nope: null })

    await uploadViaRequest(options, { url: '/x', fields: { keep: 2, flag: true } })

    const fd = formOf()
    expect(fd.get('biz')).toBe('user')
    expect(fd.get('keep')).toBe('2') // 后者优先（组件语义比外部传参具体）
    expect(fd.get('flag')).toBe('true')
    expect(fd.has('skip')).toBe(false)
    expect(fd.has('nope')).toBe(false)
  })

  it('query：params 原样交给请求层（Excel 导入的 updateSupport）', async () => {
    requestMock.mockResolvedValue({ code: 200 })
    const { options } = makeOptions()

    await uploadViaRequest(options, { url: '/system/user/importData', params: { updateSupport: 1 } })

    expect(requestMock.mock.calls[0][0].params).toEqual({ updateSupport: 1 })
  })

  it('业务失败（HTTP 200 但请求层 reject）：onError 被调用且**不抛**，调用方拿到 failed', async () => {
    requestMock.mockRejectedValue(Object.assign(new Error('数据重复'), { httpStatus: 400 }))
    const { options, onSuccess, onError } = makeOptions()

    const outcome = await uploadViaRequest(options, { url: '/x' })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    const arg = onError.mock.calls[0][0] as { status?: number; method?: string; message?: string }
    expect(arg.status).toBe(400)
    expect(arg.method).toBe('post')
    expect(arg.message).toBe('数据重复')
    expect(outcome).toEqual({ failed: true, sessionExpired: false })
  })

  it('401：识别为 sessionExpired（拦截器已弹重新登录框，调用方不再补提示）', async () => {
    requestMock.mockRejectedValue(Object.assign(new Error('登录状态已过期'), { httpStatus: 401 }))
    const { options } = makeOptions()

    const outcome = await uploadViaRequest(options, { url: '/x' })

    expect(outcome).toEqual({ failed: true, sessionExpired: true })
  })

  it('网络中断（无 httpStatus）：failed 但不算会话过期，status 记为 0', async () => {
    requestMock.mockRejectedValue(new Error('Network Error'))
    const { options, onError } = makeOptions()

    const outcome = await uploadViaRequest(options, { url: '/x' })

    expect(outcome).toEqual({ failed: true, sessionExpired: false })
    expect((onError.mock.calls[0][0] as { status?: number }).status).toBe(0)
  })
})

describe('utils/uploadRequest · 判定纯函数', () => {
  it('isSessionExpiryError 只认 httpStatus === 401（旧形状 response.status 不再支持）', () => {
    expect(isSessionExpiryError({ httpStatus: 401 })).toBe(true)
    expect(isSessionExpiryError({ httpStatus: 403 })).toBe(false)
    expect(isSessionExpiryError({ response: { status: 401 } })).toBe(false)
    expect(isSessionExpiryError(null)).toBe(false)
    expect(isSessionExpiryError('401')).toBe(false)
  })

  it('toUploadFailure 产生 EP 期望的三个字段，且是新对象（不改写原错误）', () => {
    const origin = Object.assign(new Error('boom'), { httpStatus: 500 })
    const arg = toUploadFailure(origin) as { status: number; method: string; url: string; message: string }
    expect(arg.status).toBe(500)
    expect(arg.method).toBe('post')
    expect(arg.message).toBe('boom')
    expect(arg).not.toBe(origin)
    expect((origin as unknown as { status?: number }).status).toBeUndefined()
  })
})
