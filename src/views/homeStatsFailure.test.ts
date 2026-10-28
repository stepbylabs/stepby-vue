/**
 * 经典首页登录统计的"失败时效"回归锁（b109）。
 *
 * 立的案：`loadLoginStats` 失败时只置 `chartError`，横幅是一句无时效的"图表加载失败"，
 * 看不出屏上的曲线与汇总数字是几点的；也没有序号守卫，连点刷新时先发后到会覆盖新结果。
 * 本文件钉住：成功过再失败带截止时刻、从未成功显示失败文案、后发先回。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  setOption: vi.fn()
}))

vi.mock('@/utils/request', () => ({
  default: (...a: unknown[]) => hoisted.request(...a)
}))

vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    getChart: async () => ({ setOption: hoisted.setOption }),
    withDark: (_chart: unknown, option: unknown) => option,
    resize: vi.fn()
  }),
  readCssVar: (_name: string, fallback: string) => fallback
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => ({ isDark: false })
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

import Home from './index.vue'

const stubs = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-link': { template: '<a><slot /></a>' },
  'el-divider': { template: '<div />' },
  'el-collapse': { template: '<div><slot /></div>' },
  'el-collapse-item': { template: '<div><slot /></div>' },
  Transition: { template: '<div><slot /></div>' },
  transition: { template: '<div><slot /></div>' },
  DataLine: true,
  WarningFilled: true,
  Promotion: true,
  ChatDotRound: true,
  Money: true
}

const globalOptions = { stubs, directives: { loading: {} } }

const rows = [{ date: '2026-10-27', success: 3, fail: 1 }]

type Vm = {
  chartError: boolean
  chartErrorText: string
  lastSuccessAt: number | null
  totalSuccess: number
  loadLoginStats: () => Promise<void>
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__APP_VERSION__', '0.0.0-test')
  hoisted.request.mockResolvedValue({ data: rows })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountReady(): Promise<VueWrapper> {
  const w = mount(Home, { global: globalOptions })
  await flushPromises()
  return w
}

function vmOf(w: VueWrapper): Vm {
  return w.vm as unknown as Vm
}

describe('经典首页：登录统计失败必须说明"几点的数据"', () => {
  it('成功过再失败 ⇒ 旧汇总保留，横幅带 HH:mm:ss', async () => {
    const w = await mountReady()
    const vm = vmOf(w)
    const loadedAt = vm.lastSuccessAt
    expect(vm.totalSuccess).toBe(3)
    expect(loadedAt).toBeGreaterThan(0)

    hoisted.request.mockRejectedValueOnce(new Error('down'))
    await vm.loadLoginStats()
    await flushPromises()

    expect(vm.chartError).toBe(true)
    expect(vm.totalSuccess).toBe(3)
    expect(vm.lastSuccessAt).toBe(loadedAt)
    expect(vm.chartErrorText).toContain('common.staleDataHintAt:')
    expect(vm.chartErrorText).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(w.text()).toContain('common.staleDataHintAt:')
  })

  it('从未成功就失败 ⇒ 文案为"加载失败"，不谎称有时刻', async () => {
    hoisted.request.mockRejectedValueOnce(new Error('down'))
    const w = await mountReady()
    const vm = vmOf(w)

    expect(vm.chartError).toBe(true)
    expect(vm.lastSuccessAt).toBeNull()
    expect(vm.chartErrorText).toBe('dashboard.chartLoadFail')
    expect(w.text()).not.toContain('common.staleDataHintAt:')
  })

  it('后发先回：旧请求晚到不得覆盖新结果', async () => {
    const slow = deferred<{ data: typeof rows }>()
    hoisted.request
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ data: [{ date: '2026-10-28', success: 9, fail: 0 }] })
    const w = mount(Home, { global: globalOptions })
    await flushPromises()
    const vm = vmOf(w)
    await vm.loadLoginStats()
    await flushPromises()
    expect(vm.totalSuccess).toBe(9)

    slow.resolve({ data: rows })
    await flushPromises()
    expect(vm.totalSuccess).toBe(9)
    expect(vm.chartError).toBe(false)
  })
})
