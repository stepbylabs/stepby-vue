/**
 * 运行监控页的"失败态不骗人"回归锁（b92 N-92-2）。
 *
 * 立的案：慢请求/错误聚合/Redis 五路取数全部 `.catch(() => {})`，网络故障时页面把
 * "统计卡片 0、表格暂无数据"当成成功形状展示；`handleRefresh` 更是先弹"刷新成功"
 * 再发请求（b90 ② 的同一条纪律）。本文件钉四件事：
 * 1. 初次加载失败：空列表走 ListEmpty 的「加载失败 + 重试」，统计/Redis 有顶部错误条；
 * 2. 成功后再失败：**保留旧数据**并出现持续错误条，重试成功后错误条消失；
 * 3. 刷新提示必须等结局：有任一路失败就不得弹"刷新成功"；
 * 4. Redis 失败单独可见且不覆盖旧值。
 *
 * 只 mock API / modal / i18n；页面逻辑全真实执行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  listSlowSql: vi.fn(),
  slowSqlStats: vi.fn(),
  clearSlowSql: vi.fn(),
  listErrorLog: vi.fn(),
  errorLogStats: vi.fn(),
  clearErrorLog: vi.fn(),
  redisStats: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('@/api/monitor/observability', () => ({
  listSlowSql: (...a: unknown[]) => hoisted.listSlowSql(...a),
  slowSqlStats: (...a: unknown[]) => hoisted.slowSqlStats(...a),
  clearSlowSql: (...a: unknown[]) => hoisted.clearSlowSql(...a),
  listErrorLog: (...a: unknown[]) => hoisted.listErrorLog(...a),
  errorLogStats: (...a: unknown[]) => hoisted.errorLogStats(...a),
  clearErrorLog: (...a: unknown[]) => hoisted.clearErrorLog(...a),
  redisStats: (...a: unknown[]) => hoisted.redisStats(...a)
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

import Observability from './index.vue'

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
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-progress': { template: '<div />' },
  pagination: { props: ['total'], template: '<div class="pagination-stub" />' },
  'list-empty': {
    props: ['loadError'],
    emits: ['retry'],
    template: '<div class="list-empty-stub" :data-error="String(loadError)"><slot /></div>'
  }
}

const globalOptions = {
  stubs,
  directives: { hasPermi: {}, loading: {} }
}

interface SlowStats {
  count: number
  avgMs: number
  maxMs: number
  over1s: number
  thresholdMs: number
  topPaths: Array<{ path: string; count: number; avgMs: number; maxMs: number }>
}

interface ErrorStats {
  total: number
  byModule: Array<{ name: string; count: number }>
  byLevel: Array<{ name: string; count: number }>
}

interface ObsVm {
  slowList: unknown[]
  slowTotal: number
  slowListError: boolean
  slowStats: SlowStats | null
  slowStatsError: boolean
  errorList: unknown[]
  errorListError: boolean
  errorStats: ErrorStats | null
  errorStatsError: boolean
  redis: Record<string, unknown> | null
  redisError: boolean
  slowListErrorBar: boolean
  slowStatsErrorBar: boolean
  errorListErrorBar: boolean
  errorStatsErrorBar: boolean
  statsErrorBar: boolean
  getSlowList: () => Promise<boolean>
  getSlowStats: () => Promise<boolean>
  getErrorList: () => Promise<boolean>
  getErrorStats: () => Promise<boolean>
  getRedisStats: () => Promise<boolean>
  handleRefresh: () => Promise<void>
}

const slowRow = { method: 'GET', path: '/a', status: 200, durationMs: 1200, at: 't' }
const errorRow = { at: 't', level: 'ERROR', module: 'm', requestId: 'r', path: '/a', message: 'boom' }
const slowStatsData: SlowStats = {
  count: 1,
  avgMs: 10,
  maxMs: 20,
  over1s: 1,
  thresholdMs: 1000,
  topPaths: [{ path: '/a', count: 1, avgMs: 10, maxMs: 20 }]
}
const errorStatsData: ErrorStats = {
  total: 1,
  byModule: [{ name: 'm', count: 1 }],
  byLevel: [{ name: 'ERROR', count: 1 }]
}
const redisData = {
  storeKind: 'local',
  uptimeSeconds: '1',
  usedMemoryBytes: '1',
  connectedClients: '0',
  keyspaceHits: '0',
  keyspaceMisses: '0'
}

function resolveAll(): void {
  hoisted.listSlowSql.mockResolvedValue({ rows: [slowRow], total: 1 })
  hoisted.slowSqlStats.mockResolvedValue({ data: slowStatsData })
  hoisted.listErrorLog.mockResolvedValue({ rows: [errorRow], total: 1 })
  hoisted.errorLogStats.mockResolvedValue({ data: errorStatsData })
  hoisted.redisStats.mockResolvedValue({ data: redisData })
}

function rejectAll(): void {
  hoisted.listSlowSql.mockRejectedValue(new Error('net down'))
  hoisted.slowSqlStats.mockRejectedValue(new Error('net down'))
  hoisted.listErrorLog.mockRejectedValue(new Error('net down'))
  hoisted.errorLogStats.mockRejectedValue(new Error('net down'))
  hoisted.redisStats.mockRejectedValue(new Error('net down'))
}

async function mountPage() {
  const w = mount(Observability, { global: globalOptions })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('运行监控页：失败态不骗人', () => {
  it('初次加载失败：空列表走 ListEmpty 失败态，统计/Redis 有顶部错误条，且不冒充成功', async () => {
    rejectAll()
    const w = await mountPage()
    const vm = w.vm as unknown as ObsVm

    expect(vm.slowList).toEqual([])
    expect(vm.errorList).toEqual([])
    expect(vm.slowStats).toBeNull()
    expect(vm.errorStats).toBeNull()
    expect(vm.redis).toBeNull()
    expect(vm.slowListError).toBe(true)
    expect(vm.slowStatsError).toBe(true)
    expect(vm.errorListError).toBe(true)
    expect(vm.errorStatsError).toBe(true)
    expect(vm.redisError).toBe(true)
    expect(vm.statsErrorBar).toBe(true)

    // 空列表不显示"暂无数据"：慢列表 / Top 慢接口 / 错误列表 / 两个聚合卡各一处 ListEmpty
    const empties = w.findAll('.list-empty-stub')
    expect(empties).toHaveLength(5)
    for (const e of empties) expect(e.attributes('data-error')).toBe('true')

    // 非空错误条此时不存在（列表为空时由 ListEmpty 承担）；统计条一条
    expect(w.findAll('.observability-error-bar')).toHaveLength(1)
    expect(w.find('.observability-error-bar').text()).toContain('common.loadFailed')
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('成功后再失败：保留旧数据 + 各错误条出现；逐条重试成功后错误条消失', async () => {
    resolveAll()
    const w = await mountPage()
    const vm = w.vm as unknown as ObsVm
    expect(vm.slowList).toHaveLength(1)
    expect(vm.slowStats?.topPaths).toHaveLength(1)
    expect(vm.errorStats?.byModule).toHaveLength(1)
    expect(w.findAll('.observability-error-bar')).toHaveLength(0)

    rejectAll()
    await Promise.all([vm.getSlowList(), vm.getSlowStats(), vm.getErrorList(), vm.getErrorStats(), vm.getRedisStats()])
    await flushPromises()

    // 关键：五路旧数据都不得被清空（清空后就退化成"暂无数据"）
    expect(vm.slowList).toHaveLength(1)
    expect(vm.slowStats?.topPaths).toHaveLength(1)
    expect(vm.errorList).toHaveLength(1)
    expect(vm.errorStats?.byModule).toHaveLength(1)
    expect(vm.redis).not.toBeNull()
    expect(vm.slowListErrorBar).toBe(true)
    expect(vm.slowStatsErrorBar).toBe(true)
    expect(vm.errorListErrorBar).toBe(true)
    expect(vm.errorStatsErrorBar).toBe(true)
    expect(vm.statsErrorBar).toBe(true)

    const bars = w.findAll('.observability-error-bar')
    expect(bars).toHaveLength(5)
    for (const bar of bars) expect(bar.text()).toContain('common.loadFailed')

    // 顶部统计条的重试只重取三路统计（列表的两处错误仍保留）
    resolveAll()
    await bars[0].find('button').trigger('click')
    await flushPromises()
    expect(vm.slowStatsError).toBe(false)
    expect(vm.errorStatsError).toBe(false)
    expect(vm.redisError).toBe(false)
    expect(vm.statsErrorBar).toBe(false)
    expect(vm.slowListError).toBe(true)
    expect(vm.errorListError).toBe(true)
    expect(w.findAll('.observability-error-bar')).toHaveLength(2)

    // 列表重试走 ListEmpty / 错误条按钮，成功后错误条全部消失
    await w.findAll('.observability-error-bar')[0].find('button').trigger('click')
    await flushPromises()
    expect(vm.slowListError).toBe(false)
    await w.findAll('.observability-error-bar')[0].find('button').trigger('click')
    await flushPromises()
    expect(vm.errorListError).toBe(false)
    expect(w.findAll('.observability-error-bar')).toHaveLength(0)
  })

  it('刷新提示必须等结局：任一路失败不得弹"刷新成功"，全部成功才弹一次', async () => {
    resolveAll()
    const w = await mountPage()
    const vm = w.vm as unknown as ObsVm
    hoisted.msgSuccess.mockClear()

    rejectAll()
    await vm.handleRefresh()
    await flushPromises()
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()

    resolveAll()
    await vm.handleRefresh()
    await flushPromises()
    expect(hoisted.msgSuccess).toHaveBeenCalledTimes(1)
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('observability.refreshSuccess')
  })

  it('翻页/筛选失败：旧行仍在 + 顶部错误条；重试成功后清掉', async () => {
    resolveAll()
    const w = await mountPage()
    const vm = w.vm as unknown as ObsVm
    expect(vm.slowList).toHaveLength(1)

    hoisted.listSlowSql.mockRejectedValueOnce(new Error('net down'))
    await vm.getSlowList()
    await flushPromises()
    expect(vm.slowList).toHaveLength(1)
    expect(vm.slowListErrorBar).toBe(true)
    const bar = w.find('.observability-error-bar')
    expect(bar.text()).toContain('common.loadFailed')

    hoisted.listSlowSql.mockResolvedValueOnce({ rows: [slowRow, slowRow], total: 2 })
    await bar.find('button').trigger('click')
    await flushPromises()
    expect(vm.slowListError).toBe(false)
    expect(vm.slowTotal).toBe(2)
    expect(w.findAll('.observability-error-bar')).toHaveLength(0)
  })

  it('Redis 失败单独可见且不覆盖旧值；重试后恢复', async () => {
    resolveAll()
    const w = await mountPage()
    const vm = w.vm as unknown as ObsVm
    expect(vm.redis?.storeKind).toBe('local')

    hoisted.redisStats.mockRejectedValueOnce(new Error('net down'))
    await vm.getRedisStats()
    await flushPromises()
    expect(vm.redis?.storeKind).toBe('local')
    expect(vm.redisError).toBe(true)
    expect(vm.statsErrorBar).toBe(true)

    hoisted.redisStats.mockResolvedValueOnce({ data: { ...redisData, storeKind: 'redis' } })
    await vm.getRedisStats()
    await flushPromises()
    expect(vm.redis?.storeKind).toBe('redis')
    expect(vm.redisError).toBe(false)
    expect(vm.statsErrorBar).toBe(false)
  })
})
