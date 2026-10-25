/**
 * 监控缓存三页的"失败态不骗人"回归锁（b91 N-90-4 / 键值详情）。
 *
 * 立的案（b90 §9 N-90-4）：列表非空时刷新失败，页面只弹一个 5 秒 Toast、旧数据留在原地，
 * 用户没有任何持续可见的信号能区分"这是刚刷新过的数据"与"这是上一次的旧数据"；
 * 键值详情更糟——点 B 键失败时右侧继续显示 A 键的值，页面把两个键的内容绑在了一起。
 *
 * 本文件钉四件事：
 * 1. 非空列表刷新失败：**保留旧数据**并出现顶部错误条（不再清空成"暂无数据"）；
 * 2. 空列表失败：仍走 `ListEmpty` 的「加载失败 + 重试」，与"暂无数据"分形；
 * 3. 切换缓存失败：旧缓存的键必须清掉，不得挂在新缓存名下；同缓存刷新失败才保留旧键；
 * 4. 键值详情失败：清掉上一个键的内容并给重试，成功后恢复。
 *
 * 只 mock 重依赖（API / modal / i18n）；页面自身逻辑全真实执行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  listCacheName: vi.fn(),
  listCacheKey: vi.fn(),
  getCacheValue: vi.fn(),
  clearCacheName: vi.fn(),
  clearCacheKey: vi.fn(),
  getPrefixStats: vi.fn(),
  getHotKeys: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('@/api/monitor/cache', () => ({
  listCacheName: (...a: unknown[]) => hoisted.listCacheName(...a),
  listCacheKey: (...a: unknown[]) => hoisted.listCacheKey(...a),
  getCacheValue: (...a: unknown[]) => hoisted.getCacheValue(...a),
  clearCacheName: (...a: unknown[]) => hoisted.clearCacheName(...a),
  clearCacheKey: (...a: unknown[]) => hoisted.clearCacheKey(...a),
  getPrefixStats: (...a: unknown[]) => hoisted.getPrefixStats(...a),
  getHotKeys: (...a: unknown[]) => hoisted.getHotKeys(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    confirm: vi.fn(() => Promise.resolve()),
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a)
  }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import CacheKeys from './CacheKeys.vue'
import CacheStats from './CacheStats.vue'

const stubs = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-table': {
    props: ['data'],
    template: '<div class="table-stub"><slot /><slot v-if="!data || data.length === 0" name="empty" /></div>'
  },
  'el-table-column': { template: '<div />' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}</div>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
  'list-empty': {
    props: ['loadError'],
    emits: ['retry'],
    template: '<div class="list-empty-stub" :data-error="String(loadError)"><slot /></div>'
  },
  // 内置 Transition 在 jsdom 里等 transitionend，会把 v-if 子树的出现推迟到断言之后；
  // 用透传桩把"状态变化 → DOM"这条链恢复成同步可观测（不改变被测组件的任何逻辑）。
  Transition: { template: '<div><slot /></div>' },
  transition: { template: '<div><slot /></div>' }
}

const globalOptions = {
  stubs: {
    ...stubs,
    Collection: true,
    Key: true,
    Document: true,
    Histogram: true,
    Warning: true,
    WarningFilled: true
  },
  directives: { hasPermi: {}, loading: {} }
}

function mountPage(component: typeof CacheKeys | typeof CacheStats) {
  return mount(component, { props: { active: true }, global: globalOptions })
}

interface KeysVm {
  cacheNames: Array<{ cacheName: string }>
  cacheKeys: string[]
  listError: boolean
  keysError: boolean
  listErrorBar: boolean
  keysErrorBar: boolean
  valueError: boolean
  valueLoading: boolean
  cacheForm: { cacheKey?: string; cacheValue?: string }
  nowCacheName: string
  getCacheNames: () => Promise<boolean>
  getCacheKeys: (row?: { cacheName: string }) => Promise<boolean>
  handleCacheValue: (key: string) => void
}

interface StatsVm {
  prefixStats: unknown[]
  hotKeys: unknown[]
  prefixError: boolean
  hotError: boolean
  prefixErrorBar: boolean
  hotErrorBar: boolean
  loadStats: () => void
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CacheKeys：刷新失败不得骗人', () => {
  it('初次加载失败：列表为空，走 ListEmpty 的加载失败态（不是暂无数据）', async () => {
    hoisted.listCacheName.mockRejectedValueOnce(new Error('net down'))
    const w = mountPage(CacheKeys)
    const vm = w.vm as unknown as KeysVm
    await vm.getCacheNames()
    await flushPromises()

    expect(vm.cacheNames).toEqual([])
    expect(vm.listError).toBe(true)
    // 空列表走 ListEmpty；顶部错误条只在"有旧数据"时出现
    expect(w.findAll('.cache-error-bar')).toHaveLength(0)
    expect(w.find('.list-empty-stub').attributes('data-error')).toBe('true')
  })

  it('成功加载后再失败：保留旧数据 + 顶部错误条；重试成功后错误条消失', async () => {
    hoisted.listCacheName.mockResolvedValueOnce({
      data: [{ cacheName: 'A' }, { cacheName: 'B' }]
    })
    const w = mountPage(CacheKeys)
    const vm = w.vm as unknown as KeysVm
    await vm.getCacheNames()
    await flushPromises()
    expect(vm.cacheNames).toHaveLength(2)
    expect(w.findAll('.cache-error-bar')).toHaveLength(0)

    hoisted.listCacheName.mockRejectedValueOnce(new Error('net down'))
    await vm.getCacheNames()
    await flushPromises()
    // 关键：旧数据不能被清空（清空后就退化成"暂无数据"）
    expect(vm.cacheNames.map((r) => r.cacheName)).toEqual(['A', 'B'])
    expect(vm.listError).toBe(true)
    const bar = w.find('.cache-error-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('common.loadFailed')

    hoisted.listCacheName.mockResolvedValueOnce({ data: [{ cacheName: 'C' }] })
    await bar.find('button').trigger('click')
    await flushPromises()
    expect(vm.listError).toBe(false)
    expect(w.findAll('.cache-error-bar')).toHaveLength(0)
    expect(vm.cacheNames.map((r) => r.cacheName)).toEqual(['C'])
  })

  it('切换到另一个缓存失败：不得把上一个缓存的键挂在新名字下', async () => {
    const w = mountPage(CacheKeys)
    const vm = w.vm as unknown as KeysVm

    hoisted.listCacheKey.mockResolvedValueOnce({ data: ['a:1', 'a:2'] })
    await vm.getCacheKeys({ cacheName: 'A' })
    await flushPromises()
    expect(vm.cacheKeys).toEqual(['a:1', 'a:2'])
    expect(vm.nowCacheName).toBe('A')

    hoisted.listCacheKey.mockRejectedValueOnce(new Error('net down'))
    await vm.getCacheKeys({ cacheName: 'B' })
    await flushPromises()
    expect(vm.nowCacheName).toBe('B')
    // 换目标失败：A 的键必须清掉，否则页面会把 A 的键标成 B 的
    expect(vm.cacheKeys).toEqual([])
    expect(vm.keysError).toBe(true)
    expect(w.findAll('.cache-error-bar')).toHaveLength(0)
    // 两张表的空态槽都在 DOM 里：缓存名表（无错误）在前，键表（本次失败）在后
    const empties = w.findAll('.list-empty-stub')
    expect(empties).toHaveLength(2)
    expect(empties[1].attributes('data-error')).toBe('true')

    hoisted.listCacheKey.mockResolvedValueOnce({ data: ['b:1'] })
    await vm.getCacheKeys()
    await flushPromises()
    expect(vm.keysError).toBe(false)
    expect(vm.cacheKeys).toEqual(['b:1'])
  })

  it('同一缓存刷新失败：保留旧键 + 顶部错误条（重试目标是同一个缓存）', async () => {
    const w = mountPage(CacheKeys)
    const vm = w.vm as unknown as KeysVm

    hoisted.listCacheKey.mockResolvedValueOnce({ data: ['a:1'] })
    await vm.getCacheKeys({ cacheName: 'A' })
    await flushPromises()

    hoisted.listCacheKey.mockRejectedValueOnce(new Error('net down'))
    await vm.getCacheKeys({ cacheName: 'A' })
    await flushPromises()
    expect(vm.cacheKeys).toEqual(['a:1'])
    expect(vm.keysError).toBe(true)
    expect(vm.nowCacheName).toBe('A')
    const bars = w.findAll('.cache-error-bar')
    expect(bars).toHaveLength(1)
    expect(bars[0].text()).toContain('common.loadFailed')
  })

  it('取值期间只显示加载态，不显示上一个键的内容；成功后恢复表单', async () => {
    const w = mountPage(CacheKeys)
    const vm = w.vm as unknown as KeysVm

    hoisted.listCacheKey.mockResolvedValueOnce({ data: ['k1', 'k2'] })
    await vm.getCacheKeys({ cacheName: 'A' })
    await flushPromises()

    hoisted.getCacheValue.mockResolvedValueOnce({
      data: { cacheName: 'A', cacheKey: 'k1', cacheValue: 'v1' }
    })
    vm.handleCacheValue('k1')
    await flushPromises()
    expect(vm.cacheForm.cacheKey).toBe('k1')

    let release: (v: unknown) => void = () => {}
    hoisted.getCacheValue.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    vm.handleCacheValue('k2')
    await flushPromises()
    // 表单已卸载（旧值不可见），加载态由 valueLoading 驱动
    expect(vm.valueLoading).toBe(true)
    expect(vm.cacheForm).toEqual({})
    expect(vm.valueError).toBe(false)
    expect(w.find('.cache-value-error').exists()).toBe(false)

    release({ data: { cacheName: 'A', cacheKey: 'k2', cacheValue: 'v2' } })
    await flushPromises()
    expect(vm.valueLoading).toBe(false)
    expect(vm.cacheForm.cacheKey).toBe('k2')
    expect(vm.cacheForm.cacheValue).toBe('v2')
  })

  it('键值详情失败：清掉上一个键的值并给重试；重试成功后恢复', async () => {
    const w = mountPage(CacheKeys)
    const vm = w.vm as unknown as KeysVm

    hoisted.listCacheKey.mockResolvedValueOnce({ data: ['k1', 'k2'] })
    await vm.getCacheKeys({ cacheName: 'A' })
    await flushPromises()

    hoisted.getCacheValue.mockResolvedValueOnce({
      data: { cacheName: 'A', cacheKey: 'k1', cacheValue: 'v1' }
    })
    vm.handleCacheValue('k1')
    await flushPromises()
    expect(vm.cacheForm.cacheKey).toBe('k1')
    expect(vm.cacheForm.cacheValue).toBe('v1')

    hoisted.getCacheValue.mockRejectedValueOnce(new Error('net down'))
    vm.handleCacheValue('k2')
    await flushPromises()
    // 关键：不得继续显示 k1 的值（页面会把两个键的内容绑在一起）
    expect(vm.cacheForm).toEqual({})
    expect(vm.valueError).toBe(true)
    const errBox = w.find('.cache-value-error')
    expect(errBox.exists()).toBe(true)

    hoisted.getCacheValue.mockResolvedValueOnce({
      data: { cacheName: 'A', cacheKey: 'k2', cacheValue: 'v2' }
    })
    await errBox.find('button').trigger('click')
    await flushPromises()
    expect(vm.valueError).toBe(false)
    expect(vm.cacheForm.cacheKey).toBe('k2')
    expect(vm.cacheForm.cacheValue).toBe('v2')
  })
})

describe('CacheStats：刷新失败保留旧数据并给持续可见的错误条', () => {
  it('成功加载后再失败：两张表都保留旧数据，各出现一条错误条', async () => {
    hoisted.getPrefixStats.mockResolvedValueOnce({
      data: [{ cacheName: 'p', keyCount: 1, memoryBytes: 10 }]
    })
    hoisted.getHotKeys.mockResolvedValueOnce({
      data: [{ key: 'h', keyType: 'string', memoryBytes: 10 }]
    })
    const w = mountPage(CacheStats)
    const vm = w.vm as unknown as StatsVm
    vm.loadStats()
    await flushPromises()
    expect(vm.prefixStats).toHaveLength(1)
    expect(vm.hotKeys).toHaveLength(1)
    expect(w.findAll('.cache-error-bar')).toHaveLength(0)

    hoisted.getPrefixStats.mockRejectedValueOnce(new Error('net down'))
    hoisted.getHotKeys.mockRejectedValueOnce(new Error('net down'))
    vm.loadStats()
    await flushPromises()
    expect(vm.prefixStats).toHaveLength(1)
    expect(vm.hotKeys).toHaveLength(1)
    expect(vm.prefixError).toBe(true)
    expect(vm.hotError).toBe(true)
    expect(vm.prefixErrorBar).toBe(true)
    expect(vm.hotErrorBar).toBe(true)
    const bars = w.findAll('.cache-error-bar')
    expect(bars).toHaveLength(2)
    for (const bar of bars) expect(bar.text()).toContain('common.loadFailed')
  })

  it('初次加载失败：两表为空时走 ListEmpty 的加载失败态', async () => {
    hoisted.getPrefixStats.mockRejectedValueOnce(new Error('net down'))
    hoisted.getHotKeys.mockRejectedValueOnce(new Error('net down'))
    const w = mountPage(CacheStats)
    const vm = w.vm as unknown as StatsVm
    vm.loadStats()
    await flushPromises()

    expect(vm.prefixStats).toEqual([])
    expect(vm.hotKeys).toEqual([])
    expect(vm.prefixErrorBar).toBe(false)
    expect(vm.hotErrorBar).toBe(false)
    expect(w.findAll('.cache-error-bar')).toHaveLength(0)
    const empties = w.findAll('.list-empty-stub')
    expect(empties).toHaveLength(2)
    for (const e of empties) expect(e.attributes('data-error')).toBe('true')
  })
})
