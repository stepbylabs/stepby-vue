/**
 * 缓存概览页的"失败与时效"回归锁（b109）。
 *
 * 立的案：`CacheOverview.getList()` 初次失败时 `cache` 仍为 null，模板走的是
 * `v-if="!cache?.info"` 的「Redis 未连接」空态 —— 一次网络故障被显示成"Redis 未连接"；
 * 成功过再失败时只留一句无时效的"图表加载失败"，看不出屏上的信息是几点的。
 * 本文件钉住：
 * ① 从未取到过数据就失败 ⇒ 失败文案（不得冒充"未连接"）+ 重试；
 * ② 成功过再失败 ⇒ 旧信息保留 + 横幅写明"几点的数据"（含 HH:mm:ss）；
 * ③ 后发先回：旧请求晚到不得覆盖新结果。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getCache: vi.fn(),
  setOption: vi.fn(),
  resize: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('@/api/monitor/cache', () => ({
  getCache: (...a: unknown[]) => hoisted.getCache(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    loading: vi.fn(),
    closeLoading: vi.fn(),
    msgError: (...a: unknown[]) => hoisted.msgError(...a)
  }
}))

vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    // 形状必须等于真实 ECharts 实例：组件在挂载后 100ms 会调 `instance.resize()`，
    // 少了它这条定时器会在**别的测试文件**里炸（b112 全量轮实测：cacheOverview 自身
    // 3 条全绿，却把整个 vitest 判成 1 failed —— 夹具形状与生产形状不符，绿着坏）
    getChart: async () => ({ setOption: hoisted.setOption, resize: hoisted.resize }),
    withDark: (_chart: unknown, option: unknown) => option,
    waitForRef: async (get: () => HTMLElement | null) => get(),
    resize: vi.fn()
  })
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

import CacheOverview from './CacheOverview.vue'

const stubs = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}<slot /></div>' },
  'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}<slot /></div>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' },
  'el-icon': { template: '<span><slot /></span>' },
  Transition: { template: '<div><slot /></div>' },
  transition: { template: '<div><slot /></div>' },
  Monitor: true,
  PieChart: true,
  Odometer: true,
  WarningFilled: true
}

const globalOptions = { stubs, directives: { loading: {} } }

const cacheData = (dbSize: number) => ({
  data: {
    info: { redis_version: '7.0', used_memory_human: '10M', tcp_port: '6379' },
    dbSize,
    commandStats: [{ name: 'get', value: '1' }]
  }
})

type Vm = {
  cache: { dbSize: number } | null
  chartError: boolean
  lastSuccessAt: number | null
  staleHint: string
  getList: () => void
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

// 挂载过的 wrapper 必须在文件结束前卸载：组件里有一个 100ms 的 resize 定时器，
// 不卸载就会在本文件跑完之后才触发，把异常记到当时正在跑的**另一个文件**头上（同 ㉓）
const mounted: VueWrapper[] = []

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.useRealTimers()
})

async function mountReady(): Promise<VueWrapper> {
  const w = mount(CacheOverview, { global: globalOptions })
  mounted.push(w)
  await flushPromises()
  return w
}

function vmOf(w: VueWrapper): Vm {
  return w.vm as unknown as Vm
}

describe('缓存概览：失败不得冒充"Redis 未连接"，陈旧必须有时刻', () => {
  it('从未取到过数据就失败 ⇒ 显示失败文案（不是"未连接"）并可重试', async () => {
    hoisted.getCache.mockRejectedValueOnce(new Error('down'))
    const w = await mountReady()

    expect(vmOf(w).cache).toBeNull()
    expect(w.find('.empty-stub').text()).toContain('dashboard.chartLoadFail')
    expect(w.find('.empty-stub').text()).not.toContain('cache.tip.notConnected')

    hoisted.getCache.mockResolvedValueOnce(cacheData(3))
    await w.find('.empty-stub button').trigger('click')
    await flushPromises()
    expect(vmOf(w).cache?.dbSize).toBe(3)
    expect(w.find('.empty-stub').exists()).toBe(false)
  })

  it('成功过再失败 ⇒ 旧信息保留 + 横幅写明"几点的数据"', async () => {
    hoisted.getCache.mockResolvedValueOnce(cacheData(3))
    const w = await mountReady()
    const vm = vmOf(w)
    const loadedAt = vm.lastSuccessAt
    expect(vm.cache?.dbSize).toBe(3)
    expect(loadedAt).toBeGreaterThan(0)

    hoisted.getCache.mockRejectedValueOnce(new Error('down'))
    vm.getList()
    await flushPromises()

    expect(vm.cache?.dbSize).toBe(3)
    expect(vm.chartError).toBe(true)
    expect(vm.lastSuccessAt).toBe(loadedAt)
    expect(w.text()).toContain('common.staleDataHintAt:')
    expect(w.text()).toMatch(/\d{2}:\d{2}:\d{2}/)
    // 不得把旧信息抹成"未连接"
    expect(w.text()).not.toContain('cache.tip.notConnected')
  })

  it('后发先回：先发的旧请求晚到不得覆盖新结果', async () => {
    const slow = deferred<{ data: unknown }>()
    hoisted.getCache.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(cacheData(2))
    const w = mount(CacheOverview, { global: globalOptions })
    mounted.push(w)
    await flushPromises()
    const vm = vmOf(w)
    vm.getList()
    await flushPromises()
    expect(vm.cache?.dbSize).toBe(2)

    slow.resolve(cacheData(1))
    await flushPromises()
    expect(vm.cache?.dbSize).toBe(2)
    expect(vm.chartError).toBe(false)
  })
})
