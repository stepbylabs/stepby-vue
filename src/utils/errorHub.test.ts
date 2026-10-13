import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 共享的 ElMessage mock 引用：既提供给 element-plus 模块 mock，也可在测试内断言
const { ElMessage } = vi.hoisted(() => ({ ElMessage: vi.fn() }))

// 避免真实加载 element-plus 与整个 i18n（pinia/stores 等重依赖），否则 fork worker 初始化超时
vi.mock('element-plus', () => ({ ElMessage }))
vi.mock('@/i18n', () => ({
  default: { global: { t: (key: string, _params?: Record<string, unknown>) => key } }
}))

import { errorHub, type MonitorIssue } from '@/utils/errorHub'

// ============================================================================
// 前端错误监控中心 errorHub
// ============================================================================
// 通过 setToastHandler 注入捕获器代替真实 ElMessage，验证：
// - 相同错误在去重窗口内合并计数（不重复刷屏）
// - 同一 flush 窗口内的多条提示聚合为"一条"弹窗（消除一串弹窗）
// - 聚合按最高严重度分级（error > warning > info）
// - subscribe / clear 行为
// flush/去重依赖 setTimeout，用 vi.useFakeTimers 控制。
// ============================================================================

type ToastCall = { level: string; source: string; count: number; message: string }
const calls: ToastCall[] = []

describe('errorHub', () => {
  beforeEach(() => {
    calls.length = 0
    ElMessage.mockClear()
    errorHub.clear()
    errorHub.setToastHandler((level, source, count, message) => {
      calls.push({ level, source, count, message })
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    errorHub.clear()
    errorHub.setToastHandler(null)
  })

  async function flush(): Promise<void> {
    // 600ms flush 窗口 + 若干余量
    await vi.advanceTimersByTimeAsync(1000)
  }

  describe('report 聚合弹窗', () => {
    it('单条错误只弹一次，保留原文', async () => {
      errorHub.report('error', 'api', '服务器内部错误')
      await flush()

      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({
        level: 'error',
        count: 1,
        message: '服务器内部错误'
      })
    })

    it('并发多条不同错误聚合为一条，按最高严重度展示并分别计数', async () => {
      errorHub.report('warning', 'api', '参数缺失')
      errorHub.report('error', 'api', '服务器内部错误')
      errorHub.report('info', 'api', '加载完成')
      await flush()

      expect(calls).toHaveLength(1)
      // 最高严重度为 error
      expect(calls[0].level).toBe('error')
      expect(calls[0].count).toBe(3)
      // 聚合文案经由 i18n 生成（此处断言非空即可）
      expect(calls[0].message.length).toBeGreaterThan(0)
    })

    it('相同错误在去重窗口内合并为一条弹窗，不重复弹出', async () => {
      errorHub.report('error', 'api', '服务不可用')
      errorHub.report('error', 'api', '服务不可用')
      errorHub.report('error', 'api', '服务不可用')
      await flush()

      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ level: 'error', count: 3 })
    })
  })

  describe('record 只记录不弹窗', () => {
    it('record 不触发 toast 弹窗', async () => {
      errorHub.record('error', 'global', '全局错误')
      await flush()

      expect(calls).toHaveLength(0)
      expect(errorHub.issues.length).toBe(1)
    })
  })

  describe('issues 记录与去重', () => {
    it('相同源+级别+文案在去重窗口内合并为一条记录并递增 count', () => {
      errorHub.record('warning', 'api', '参数校验失败')
      errorHub.record('warning', 'api', '参数校验失败')
      errorHub.record('warning', 'api', '参数校验失败')

      expect(errorHub.issues).toHaveLength(1)
      expect(errorHub.issues[0].count).toBe(3)
    })

    it('不同源同为 error 视为不同记录', () => {
      errorHub.record('error', 'api', '保存失败')
      errorHub.record('error', 'vue', '保存失败')

      expect(errorHub.issues).toHaveLength(2)
    })
  })

  describe('subscribe / clear', () => {
    it('subscribe 能收到问题列表变更并格式化为 MonitorIssue', () => {
      const listener = vi.fn((list: MonitorIssue[]) => {
        void list
      })
      const unsub = errorHub.subscribe(listener)

      errorHub.record('error', 'api', '错误A')
      expect(listener).toHaveBeenCalled()
      const list = listener.mock.calls.at(-1)?.[0] || []
      expect(list[0]).toMatchObject({ level: 'error', source: 'api', message: '错误A', count: 1 })

      unsub()
      errorHub.record('warning', 'api', '错误B')
      const callsBefore = listener.mock.calls.length
      expect(listener.mock.calls.length).toBe(callsBefore)
    })

    it('clear 清空记录并通知订阅者', () => {
      errorHub.record('error', 'api', '错误A')
      expect(errorHub.issues).toHaveLength(1)

      errorHub.clear()
      expect(errorHub.issues).toHaveLength(0)
    })
  })

  describe('clear 清理挂起的 flush 定时器', () => {
    it('report 调度了 flush 定时器后立即 clear，不触发弹窗', async () => {
      errorHub.report('error', 'api', '待清理错误')
      // flush 定时器已调度但未触发
      errorHub.clear()
      expect(errorHub.issues).toHaveLength(0)

      await flush()
      expect(calls).toHaveLength(0)
    })
  })

  describe('MAX_ISSUES 上限截断', () => {
    it('超过 200 条时仅保留最新 200 条', () => {
      for (let i = 0; i < 205; i++) {
        errorHub.record('error', 'api', `错误-${i}`)
      }
      expect(errorHub.issues).toHaveLength(200)
    })
  })

  describe('默认 ElMessage 弹窗路径', () => {
    it('未注入 toastHandler 时走 ElMessage 渲染', async () => {
      errorHub.setToastHandler(null)
      errorHub.report('error', 'api', '默认弹窗')
      await flush()

      expect(ElMessage).toHaveBeenCalledWith(expect.objectContaining({ message: '默认弹窗', type: 'error' }))
    })

    it('warning 级别走 ElMessage 且 duration 为 5000', async () => {
      errorHub.setToastHandler(null)
      errorHub.report('warning', 'api', '警告弹窗')
      await flush()

      expect(ElMessage).toHaveBeenCalledWith(
        expect.objectContaining({ message: '警告弹窗', type: 'warning', duration: 5000 })
      )
    })
  })
})
