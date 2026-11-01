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
    download.mockResolvedValueOnce(true)
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
    download.mockResolvedValueOnce(true)
    const { handleExport } = useExport('/u', 'pre')
    handleExport({ b: 2 }, 'real-name.xlsx')
    expect(download).toHaveBeenCalledWith('/u', { b: 2 }, 'real-name.xlsx')
  })

  it('默认 params 为空对象', () => {
    download.mockResolvedValueOnce(true)
    const { handleExport } = useExport('/u', 'pre')
    handleExport()
    expect(download).toHaveBeenCalledWith('/u', {}, expect.stringMatching(/^pre_\d+\.xlsx$/))
  })

  it('模板裸绑传入的事件对象既不得当查询条件、也不得当文件名（与 useCrudTable 同族设防）', () => {
    download.mockResolvedValueOnce(true)
    const { handleExport } = useExport('/u', 'pre')
    ;(handleExport as (params?: unknown, filename?: unknown) => void)(new Event('click'))
    expect(download).toHaveBeenCalledWith('/u', {}, expect.stringMatching(/^pre_\d+\.xlsx$/))
  })

  it('非 Event 的普通对象仍按查询条件透传（上一把锁不得过宽把真筛选也丢掉）', () => {
    download.mockResolvedValueOnce(true)
    const { handleExport } = useExport('/u', 'pre')
    handleExport({ deptId: 103, status: '0' })
    expect(download.mock.calls[0][1]).toEqual({ deptId: 103, status: '0' })
  })

  it('配置 successKey 时成功提示', async () => {
    download.mockResolvedValueOnce(true)
    const { handleExport } = useExport('/u', 'pre', { successKey: 'export.ok' })
    handleExport()
    await flush()
    expect(modal.msgSuccess).toHaveBeenCalledWith('export.ok')
    expect(modal.msgError).not.toHaveBeenCalled()
  })

  // 失败轴的两条旧用例（`mockRejectedValueOnce` + 断言 `msgError(errorKey)`）**已删**：
  // 真实 `download()` 自 b146 起把四类失败统一折算成 `resolve(false)`，从不 reject，
  // 而"同一次失败只许一条提示"（b125 ⑤）要求页面侧不再补一条通用失败。
  // 也就是说那两条用例跑在一条**生产码产不出来的形状**上（㉓），并且把
  // `errorKey` 这个从未生效的选项当成了有效契约。改用下面两条按事实驱动的用例。
  it('下载未认账（false）：不得说成功、不得自己补一条失败提示，loading 仍复位', async () => {
    download.mockResolvedValueOnce(false)
    const { downloadLoading, handleExport } = useExport('/u', 'pre', { successKey: 'export.ok' })
    handleExport()
    await flush()
    expect(modal.msgSuccess).not.toHaveBeenCalled()
    expect(modal.msgError).not.toHaveBeenCalled()
    expect(downloadLoading.value).toBe(false)
  })

  it('成功轴对照组：true 才说成功（上一条不是"永远不说成功"）', async () => {
    download.mockResolvedValueOnce(true)
    const { downloadLoading, handleExport } = useExport('/u', 'pre', { successKey: 'export.ok' })
    handleExport()
    await flush()
    expect(modal.msgSuccess).toHaveBeenCalledWith('export.ok')
    expect(downloadLoading.value).toBe(false)
  })

  it('handleExport 返回 void', () => {
    download.mockResolvedValueOnce(true)
    const { handleExport } = useExport('/u', 'pre')
    expect(handleExport({})).toBeUndefined()
  })
})
