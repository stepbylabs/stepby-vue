/**
 * 会话标识降级矩阵（b124）
 *
 * 三个方向都得有：正常摘要 / 能力缺失 / **能力存在但被拒绝**（新修的那一档）。
 * 最后一种是真实故障：`subtle.digest` 返回 Promise，`if (!subtle)` 挡不住它的拒绝，
 * 拒绝会逸出 async 函数并打断"我的会话"面板的取数链。
 */
import { describe, expect, it } from 'vitest'
import { identifyToken } from '@/utils/sessionToken'

const TOKEN = 'abcdefgh-ijklmnop-12345678'
const TAIL = TOKEN.slice(-8)

describe('identifyToken', () => {
  it('subtle 可用：返回 64 位十六进制摘要，且不降级', async () => {
    const out = await identifyToken(TOKEN, crypto.subtle)
    expect(out.degraded).toBe(false)
    expect(out.hash).toMatch(/^[0-9a-f]{64}$/)
    // 同输入同结果（SHA-256 的确定性是"当前会话"匹配的前提）
    const again = await identifyToken(TOKEN, crypto.subtle)
    expect(again.hash).toBe(out.hash)
  })

  it('能力缺失（非安全上下文）：尾 8 位 + degraded', async () => {
    const out = await identifyToken(TOKEN, undefined)
    expect(out).toEqual({ hash: TAIL, degraded: true })
  })

  it('能力存在但 digest 拒绝：同样降级而不是把拒绝抛给调用方（b124 修复的缺陷形状）', async () => {
    const rejecting = {
      digest: () => Promise.reject(new Error('NotAllowedError'))
    } as unknown as SubtleCrypto
    await expect(identifyToken(TOKEN, rejecting)).resolves.toEqual({ hash: TAIL, degraded: true })
  })

  it('digest 同步抛错也不得逸出', async () => {
    const throwing = {
      digest: () => {
        throw new Error('sync boom')
      }
    } as unknown as SubtleCrypto
    await expect(identifyToken(TOKEN, throwing)).resolves.toEqual({ hash: TAIL, degraded: true })
  })
})
