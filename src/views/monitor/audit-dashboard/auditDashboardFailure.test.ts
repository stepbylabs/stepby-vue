/**
 * 审计大屏的"失败不得骗人"回归锁（b109）。
 *
 * 立的案：
 * ① 告警状态取数失败时 `loadAlarm` 只写 DEV console，面板落到 `alarmData=null` ⇒ 显示
 *    "暂无数据"——在**异常告警**卡片上，这句话会被读成"没有异常"，是比缺功能更坏的方向；
 * ② 六块图表共用一句"图表加载失败"，不说明屏上旧图是**几点的、哪个统计窗口**的；
 * ③ 换 7/14/30 天窗口时旧图形不清，失败时上一个窗口的曲线顶着新窗口的标题；
 * ④ 全程无序号守卫，快速切换窗口时先发后到会覆盖后发结局。
 * 本文件钉住：告警失败可见且可重试、成功过再失败带截止时刻、换窗口先清旧图、后发先回。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  getAlarmStatus: vi.fn(),
  clear: vi.fn(),
  setOption: vi.fn()
}))

vi.mock('@/utils/request', () => ({
  default: (...a: unknown[]) => hoisted.request(...a)
}))

vi.mock('@/api/monitor/operlog', () => ({
  getAlarmStatus: (...a: unknown[]) => hoisted.getAlarmStatus(...a)
}))

vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    getChart: async () => ({
      setOption: hoisted.setOption,
      clear: hoisted.clear,
      on: vi.fn(),
      off: vi.fn(),
      resize: vi.fn()
    }),
    withDark: (_chart: unknown, option: unknown) => option
  }),
  readCssVar: (_name: string, fallback: string) => fallback
}))

vi.mock('@/composables/useMotion', () => ({
  useMotionPresets: () => ({ fadeInUp: {}, staggerChildren: () => ({}) })
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => ({ isDark: false })
}))

vi.mock('@/utils/dict', () => ({
  useDict: () => ({ sys_oper_type: ref([]) })
}))

vi.mock('./useComplianceReport', () => ({
  useComplianceReport: () => ({
    exporting: ref(false),
    lastBusinessTypes: ref([]),
    handleExportPdf: vi.fn(),
    handlePieChartClick: vi.fn()
  })
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${String(p.time)}` : k)
    })
  }
})

import AuditDashboard from './index.vue'
import AlarmPanel from './AlarmPanel.vue'

const stubs = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<div><slot /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="alert-stub" :data-type="type">{{ title }}<slot /></div>'
  },
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': {
    props: ['description'],
    template: '<div class="empty-stub">{{ description }}</div>'
  }
}

const globalOptions = {
  stubs,
  directives: { loading: {}, hasPermi: {}, motion: {} }
}

const statsVo = {
  summary: { total: 120, success: 110, fail: 10 },
  businessTypes: [{ businessType: 1, count: 5 }],
  topOperators: [{ operName: 'admin', count: 7 }],
  topModules: [{ moduleName: 'system', count: 9 }],
  daily: [{ date: '2026-10-27', success: 1, fail: 0 }]
}

const alarmOk = {
  data: {
    config: { windowMinutes: 60, failThreshold: 5, failRateThreshold: 10 },
    totalInWindow: 10,
    failInWindow: 0,
    failRate: 0,
    failRateAlarm: false,
    operatorBursts: [],
    moduleBursts: [],
    alertTriggered: false
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.request.mockImplementation((cfg: { url: string }) =>
    cfg.url === '/monitor/operlog/stats-by-type'
      ? Promise.resolve({ data: { insert: 1, update: 2, delete: 3, other: 4 } })
      : Promise.resolve({ data: statsVo })
  )
  hoisted.getAlarmStatus.mockResolvedValue(alarmOk)
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Vm = {
  days: number
  chartError: boolean
  chartErrorText: string
  statsLoaded: boolean
  statsLastSuccessAt: number | null
  lastDaily: Array<{ date: string }>
  stats: { totalOps: number }
  loadStats: () => Promise<void>
}

async function mountReady(): Promise<VueWrapper> {
  const w = mount(AuditDashboard, { global: globalOptions })
  await flushPromises()
  return w
}

describe('审计大屏：取数失败不得被读成"没有异常 / 没有数据"', () => {
  it('告警状态从未取到 ⇒ 失败态 + 重试，且不得显示"暂无数据"；重试成功后恢复', async () => {
    hoisted.getAlarmStatus.mockRejectedValueOnce(new Error('down'))
    const w = await mountReady()
    const alarm = w.findComponent(AlarmPanel)
    expect(alarm.text()).toContain('auditDashboard.alarm.loadFail')
    expect(alarm.text()).toContain('common.retry')
    expect(alarm.text()).not.toContain('common.noData')

    hoisted.getAlarmStatus.mockResolvedValueOnce(alarmOk)
    alarm.vm.$emit('retry')
    await flushPromises()
    expect(alarm.text()).toContain('auditDashboard.alarm.normal')
    expect(alarm.text()).not.toContain('auditDashboard.alarm.loadFail')
  })

  it('成功过再失败 ⇒ 旧图旧值保留，文案为"几点的数据"', async () => {
    const w = await mountReady()
    const vm = w.vm as unknown as Vm
    expect(vm.chartError).toBe(false)
    expect(vm.lastDaily.length).toBe(1)
    expect(vm.statsLastSuccessAt).toBeGreaterThan(0)

    hoisted.request.mockRejectedValueOnce(new Error('down'))
    await vm.loadStats()
    await flushPromises()

    expect(vm.chartError).toBe(true)
    // 旧图数据没有被清空
    expect(vm.lastDaily.length).toBe(1)
    // 文案带截止时刻，而不是一句无时效的"加载失败"
    expect(vm.chartErrorText).toContain('common.staleDataHintAt:')
    expect(vm.chartErrorText).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(w.text()).toContain('common.staleDataHintAt:')
  })

  it('换统计窗口先清旧图：新窗口失败时不得让旧窗口的曲线顶着新标题', async () => {
    const w = await mountReady()
    const vm = w.vm as unknown as Vm
    expect(vm.lastDaily.length).toBe(1)

    hoisted.request.mockRejectedValueOnce(new Error('down'))
    vm.days = 14
    await flushPromises()

    expect(vm.chartError).toBe(true)
    expect(vm.lastDaily).toEqual([])
    expect(vm.stats.totalOps).toBe(0)
    expect(vm.statsLoaded).toBe(false)
    expect(vm.statsLastSuccessAt).toBeNull()
    // 换窗口的第一件事是清画布（旧窗口图形不得留在新窗口标题下）
    expect(hoisted.clear).toHaveBeenCalled()
    // 从未在新窗口成功过 ⇒ 文案是"加载失败"，不能谎称"显示的是某时刻数据"
    expect(vm.chartErrorText).toBe('dashboard.chartLoadFail')
  })

  it('后发先回：先发的旧窗口请求晚到也不得覆盖新窗口结果', async () => {
    const slow = deferred<{ data: typeof statsVo }>()
    let statsCalls = 0
    hoisted.request.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/monitor/operlog/stats-by-type') {
        return Promise.resolve({ data: { insert: 0, update: 0, delete: 0, other: 0 } })
      }
      statsCalls += 1
      if (statsCalls === 1) return slow.promise
      return Promise.resolve({
        data: { ...statsVo, daily: [{ date: '2026-10-20', success: 99, fail: 0 }] }
      })
    })

    const w = mount(AuditDashboard, { global: globalOptions })
    await flushPromises()
    const vm = w.vm as unknown as Vm
    vm.days = 14
    await flushPromises()
    expect(vm.lastDaily).toEqual([{ date: '2026-10-20', success: 99, fail: 0 }])

    // 旧窗口请求晚到：数据、时刻、错误态都不得被它改写
    slow.resolve({ data: { ...statsVo, daily: [{ date: '2026-10-01', success: 1, fail: 0 }] } })
    await flushPromises()
    expect(vm.lastDaily).toEqual([{ date: '2026-10-20', success: 99, fail: 0 }])
    expect(vm.chartError).toBe(false)
  })
})
