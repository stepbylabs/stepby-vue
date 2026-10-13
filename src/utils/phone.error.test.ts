import { describe, it, expect, vi } from 'vitest'

// ============================================================================
// phone.ts 防御性 catch 分支
// ============================================================================
// phone.ts 对 libphonenumber-js 的调用包了 try/catch 兜底：
//   isValidPhoneNumber / isPossiblePhoneNumber / AsYouType 任一抛异常时
//   分别返回 false / false / 归一化结果，保证页面不因第三方库异常而崩溃。
// 真实输入几乎不会触发（库对未知地区等返回 false 而非抛错），因此这里
// mock 库让其抛异常，专门验证 catch 兜底逻辑真实生效。
// ============================================================================

vi.mock('libphonenumber-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('libphonenumber-js')>()
  return {
    ...actual,
    isValidPhoneNumber: vi.fn(() => {
      throw new Error('boom')
    }),
    isPossiblePhoneNumber: vi.fn(() => {
      throw new Error('boom')
    }),
    AsYouType: class {
      input(_text: string): string {
        throw new Error('boom')
      }
    }
  }
})

import { isValidPhoneByRegion, isPossiblePhoneByRegion, formatPhoneByRegion } from './phone'

describe('phone - libphonenumber-js 抛异常时走 catch 兜底', () => {
  it('isValidPhoneByRegion 捕获异常返回 false', () => {
    expect(isValidPhoneByRegion('13800138000', 'CN')).toBe(false)
  })

  it('isPossiblePhoneByRegion 捕获异常返回 false', () => {
    expect(isPossiblePhoneByRegion('13800138000', 'CN')).toBe(false)
  })

  it('formatPhoneByRegion 捕获异常回退为归一化结果', () => {
    expect(formatPhoneByRegion('138-0013-8000', 'CN')).toBe('13800138000')
  })
})
