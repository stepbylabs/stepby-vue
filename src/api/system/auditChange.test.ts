/**
 * 审计留痕导出契约：截断必须可见。
 *
 * 后端在行数触及 `EXPORT_MAX_ROWS` 时回 `X-Export-Truncated: true`，拦截器把它
 * 挂到 Blob 的 `_truncated` 上。本测试钉住"API 层真的消费了它"——只加响应头而
 * 前端不读，等于审计员拿到一份看起来完整的半份数据。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock, saveAsMock, warningMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  saveAsMock: vi.fn(),
  warningMock: vi.fn()
}))

vi.mock('@/utils/request', () => ({ default: requestMock }))
vi.mock('file-saver', () => ({ saveAs: saveAsMock }))
vi.mock('element-plus', () => ({ ElMessage: { warning: warningMock } }))
vi.mock('@/i18n', () => ({ default: { global: { t: (k: string) => k } } }))

import { exportAuditChange } from '@/api/system/auditChange'

function blobWithTruncation(truncated: boolean): Blob {
  const blob = new Blob(['a,b\r\n1,2\r\n']) as Blob & { _truncated?: boolean }
  if (truncated) blob._truncated = true
  return blob
}

describe('exportAuditChange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('截断标记存在时保存并提示用户', async () => {
    const blob = blobWithTruncation(true)
    requestMock.mockResolvedValue(blob)

    const out = await exportAuditChange({})

    expect(out).toBe(blob)
    expect(saveAsMock).toHaveBeenCalledWith(blob, expect.stringMatching(/^audit_change_\d+\.csv$/))
    expect(warningMock).toHaveBeenCalledWith('common.exportTruncated')
  })

  it('无截断标记时不打扰用户（对照组：判据不得恒为真）', async () => {
    const blob = blobWithTruncation(false)
    requestMock.mockResolvedValue(blob)

    await exportAuditChange({})

    expect(saveAsMock).toHaveBeenCalledTimes(1)
    expect(warningMock).not.toHaveBeenCalled()
  })
})
