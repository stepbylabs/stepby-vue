import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// 重依赖 mock：避免真实加载 element-plus / i18n / request（fork worker 超时）
// ---------------------------------------------------------------------------
const { download, modal, t } = vi.hoisted(() => ({
  download: vi.fn<(u: string, p: Record<string, unknown>, f: string) => Promise<unknown>>(),
  modal: {
    msgSuccess: vi.fn(),
    msgError: vi.fn(),
    confirm: vi.fn()
  },
  t: vi.fn((key: string) => key)
}))
vi.mock('@/utils/request', () => ({ download }))
vi.mock('@/plugins/modal', () => ({ default: modal }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t }) }))

import { useExport } from './useExport'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

let consoleError: ReturnType<typeof vi.spyOn>

describe('composables/useExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleError.mockRestore()
  })

  it('初始 downloadLoading 为 false', () => {
    const { downloadLoading } = useExport('/u', 'pre')
    expect(downloadLoading.value).toBe(false)
  })

  it('成功导出：默认文件名规则并管理 loading，未配 successKey 不提示', async () => {
    download.mockResolvedValueOnce({})
    const { downloadLoading, handleExport } = useExport('/monitor/logininfor/export', 'logininfor')
    handleExport({ status: '0' })
    expect(downloadLoading.value).toBe(true)
    expect(download).toHaveBeenCalledWith(
      '/monitor/logininfor/export',
      { status: '0' },
      expect.stringMatching(/^logininfor_\d+\.xlsx$/)
    )
    await flush()
    expect(downloadLoading.value).toBe(false)
    expect(modal.msgSuccess).not.toHaveBeenCalled()
    expect(modal.msgError).not.toHaveBeenCalled()
  })

  it('使用显式传入的文件名', () => {
    download.mockResolvedValueOnce({})
    const { handleExport } = useExport('/u', 'pre')
    handleExport({ b: 2 }, 'real-name.xlsx')
    expect(download).toHaveBeenCalledWith('/u', { b: 2 }, 'real-name.xlsx')
  })

  it('默认 params 为空对象', () => {
    download.mockResolvedValueOnce({})
    const { handleExport } = useExport('/u', 'pre')
    handleExport()
    expect(download).toHaveBeenCalledWith('/u', {}, expect.stringMatching(/^pre_\d+\.xlsx$/))
  })

  it('配置 successKey 时成功提示', async () => {
    download.mockResolvedValueOnce({})
    const { handleExport } = useExport('/u', 'pre', { successKey: 'export.ok' })
    handleExport()
    await flush()
    expect(modal.msgSuccess).toHaveBeenCalledWith('export.ok')
    expect(modal.msgError).not.toHaveBeenCalled()
  })

  it('失败时使用默认错误 key 提示并复位 loading', async () => {
    download.mockRejectedValueOnce(new Error('fail'))
    const { downloadLoading, handleExport } = useExport('/u', 'pre')
    handleExport()
    await flush()
    expect(modal.msgError).toHaveBeenCalledWith('common.downloadError')
    expect(modal.msgSuccess).not.toHaveBeenCalled()
    expect(downloadLoading.value).toBe(false)
  })

  it('失败时使用自定义错误 key 提示', async () => {
    download.mockRejectedValueOnce(new Error('fail'))
    const { handleExport } = useExport('/u', 'pre', { errorKey: 'export.customError' })
    handleExport({ x: 1 })
    await flush()
    expect(modal.msgError).toHaveBeenCalledWith('export.customError')
  })

  it('handleExport 返回 void', () => {
    download.mockResolvedValueOnce({})
    const { handleExport } = useExport('/u', 'pre')
    expect(handleExport({})).toBeUndefined()
  })
})
