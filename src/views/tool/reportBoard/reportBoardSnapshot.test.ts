/**
 * 报表看板的"陈旧快照 / 查询身份 / 后发先回"（b109）。
 *
 * 立的案：刷新失败时 `refreshData` 把该数据源的数据点清空、而模板是
 * `v-if="failedSources.has(key)"` 直接换成"加载失败"占位 ⇒ **屏上已经画好的图连同旧结论一起消失**，
 * 一次网络抖动等于把看到的报表抹掉。同族还有两个缺口：
 * ① 换看板 / 换时间范围后失败，屏上留着的是**另一个看板或另一个范围**的数据（却没有任何标记）；
 * ② 没有序号守卫，快速切换时先发的请求后到会覆盖后发的结局。
 * 本文件钉住：
 * ① 成功过再失败 ⇒ 旧图保留 + 徽标写明"几点的数据"（含 HH:mm:ss）；
 * ② 从未成功过就失败 ⇒ 失败占位 + 重试入口（此时没有任何旧图可展示）；
 * ③ 换看板 / 换范围先丢快照，旧看板/旧范围的数据不得冒充新的；
 * ④ 后发先回：旧请求的成败一律作废。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'

interface SourcePoint {
  label: string
  value: number
}

const hoisted = vi.hoisted(() => ({
  listSources: vi.fn(),
  listBoards: vi.fn(),
  getSourceData: vi.fn(),
  setOption: vi.fn(),
  addBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn()
}))

vi.mock('@/api/tool/reportBoard', () => ({
  listSources: (...a: unknown[]) => hoisted.listSources(...a),
  listBoards: (...a: unknown[]) => hoisted.listBoards(...a),
  getSourceData: (...a: unknown[]) => hoisted.getSourceData(...a),
  addBoard: (...a: unknown[]) => hoisted.addBoard(...a),
  updateBoard: (...a: unknown[]) => hoisted.updateBoard(...a),
  deleteBoard: (...a: unknown[]) => hoisted.deleteBoard(...a)
}))

vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    getChart: async () => ({ setOption: hoisted.setOption }),
    withDark: (_chart: unknown, option: unknown) => option
  }),
  readCssVar: (_name: string, fallback: string) => fallback
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

import ReportBoard from './index.vue'

const stubs = {
  'el-card': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-switch': { template: '<span />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-empty': {
    props: ['description', 'imageSize'],
    template: '<div class="empty-stub">{{ description }}<slot /></div>'
  },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="alert-stub">{{ title }}<slot /></div>'
  }
}

const globalOptions = { stubs, directives: { loading: {}, hasPermi: {} } }

type Vm = {
  activeId: number | null
  range: string
  dataMap: Map<string, SourcePoint[]>
  failedSources: Set<string>
  sourceLoadedAt: Map<string, number>
  chartEls: Map<string, HTMLElement>
  boards: { id: number }[]
  pageLoadError: boolean
  refreshData: () => Promise<void>
  onBoardChange: () => Promise<void>
  onRangeChange: () => void
  loadPage: () => Promise<void>
  createBoard: () => Promise<void>
  saveBoard: () => Promise<void>
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

const card = (id: string, title: string, sourceKey: string) => ({
  id,
  title,
  chartType: 'line' as const,
  sourceKey,
  size: { w: 1 as const, h: 1 as const }
})

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.listSources.mockResolvedValue({
    data: [
      { sourceKey: 'sales', name: '销售' },
      { sourceKey: 'orders', name: '订单' }
    ]
  })
  hoisted.listBoards.mockResolvedValue({
    data: [
      { id: 1, name: '看板一', config: { cards: [card('c1', '销售额', 'sales')] } },
      { id: 2, name: '看板二', config: { cards: [card('c2', '订单量', 'orders')] } }
    ]
  })
  hoisted.getSourceData.mockResolvedValue({ data: { items: [{ label: 'x', value: 1 }] } })
})

async function mountReady(): Promise<VueWrapper> {
  const w = mount(ReportBoard, { global: globalOptions })
  await flushPromises()
  return w
}

function vmOf(w: VueWrapper): Vm {
  return w.vm as unknown as Vm
}

describe('报表看板：刷新失败不得抹掉屏幕上的旧结论', () => {
  it('成功过再失败 ⇒ 旧图保留，徽标写明"几点的数据"', async () => {
    const w = await mountReady()
    const vm = vmOf(w)
    expect(vm.failedSources.size).toBe(0)
    const loadedAt = vm.sourceLoadedAt.get('sales')
    expect(loadedAt).toBeGreaterThan(0)
    // 图表容器已挂载并渲染过
    expect(vm.chartEls.size).toBe(1)

    hoisted.getSourceData.mockRejectedValueOnce(new Error('down'))
    await vm.refreshData()
    await flushPromises()

    expect(vm.failedSources.has('sales')).toBe(true)
    // 旧数据点与截止时刻都保留 ⇒ 图表继续显示旧结论
    expect(vm.dataMap.get('sales')).toEqual([{ label: 'x', value: 1 }])
    expect(vm.sourceLoadedAt.get('sales')).toBe(loadedAt)
    // 屏上是"快照徽标"而不是失败占位
    const text = w.text()
    expect(text).toContain('reportBoard.staleSnapshot:')
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(text).not.toContain('reportBoard.dataLoadFail')
  })

  it('从未成功过就失败 ⇒ 失败占位 + 重试入口', async () => {
    hoisted.getSourceData.mockRejectedValueOnce(new Error('down'))
    const w = await mountReady()
    const vm = vmOf(w)

    expect(vm.failedSources.has('sales')).toBe(true)
    expect(vm.sourceLoadedAt.size).toBe(0)
    expect(vm.dataMap.get('sales')).toEqual([])
    expect(w.text()).toContain('reportBoard.dataLoadFail')
    expect(w.text()).not.toContain('reportBoard.staleSnapshot:')
  })

  it('换看板先丢快照：新看板取数失败不得留下旧看板的数据', async () => {
    const w = await mountReady()
    const vm = vmOf(w)
    expect(vm.sourceLoadedAt.has('sales')).toBe(true)

    hoisted.getSourceData.mockRejectedValueOnce(new Error('down'))
    vm.activeId = 2
    await vm.onBoardChange()
    await flushPromises()

    expect(vm.dataMap.has('sales')).toBe(false)
    expect(vm.sourceLoadedAt.size).toBe(0)
    expect(vm.failedSources.has('orders')).toBe(true)
    expect(w.text()).toContain('reportBoard.dataLoadFail')
    expect(w.text()).not.toContain('reportBoard.staleSnapshot:')
  })

  it('换时间范围先丢快照：新范围取数失败不得把 7d 的图当成 30d 的结果', async () => {
    const w = await mountReady()
    const vm = vmOf(w)
    expect(vm.sourceLoadedAt.has('sales')).toBe(true)

    hoisted.getSourceData.mockRejectedValueOnce(new Error('down'))
    vm.range = '30d'
    vm.onRangeChange()
    await flushPromises()

    expect(vm.dataMap.get('sales')).toEqual([])
    expect(vm.sourceLoadedAt.size).toBe(0)
    expect(w.text()).toContain('reportBoard.dataLoadFail')
    expect(w.text()).not.toContain('reportBoard.staleSnapshot:')
  })

  it('后发先回：先发的旧请求无论成败都不得覆盖后发的结局', async () => {
    const w = await mountReady()
    const vm = vmOf(w)

    const slow = deferred<{ data: { items: SourcePoint[] } }>()
    hoisted.getSourceData
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ data: { items: [{ label: 'new', value: 2 }] } })
    const first = vm.refreshData()
    const second = vm.refreshData()
    await second
    await flushPromises()
    expect(vm.dataMap.get('sales')).toEqual([{ label: 'new', value: 2 }])

    // 旧请求晚到的成功不得把新结果顶掉
    slow.resolve({ data: { items: [{ label: 'old', value: 1 }] } })
    await first
    await flushPromises()
    expect(vm.dataMap.get('sales')).toEqual([{ label: 'new', value: 2 }])
    expect(vm.failedSources.size).toBe(0)

    // 晚到的失败同样不得把页面打成失败态
    const slowFail = deferred<{ data: { items: SourcePoint[] } }>()
    hoisted.getSourceData
      .mockReturnValueOnce(slowFail.promise)
      .mockResolvedValueOnce({ data: { items: [{ label: 'newer', value: 3 }] } })
    const third = vm.refreshData()
    const fourth = vm.refreshData()
    await fourth
    slowFail.reject(new Error('late down'))
    await third
    await flushPromises()
    expect(vm.failedSources.size).toBe(0)
    expect(vm.dataMap.get('sales')).toEqual([{ label: 'newer', value: 3 }])
  })
})

describe('报表看板：首载失败与创建/保存的结局（b141）', () => {
  it('看板清单读取失败 ⇒ 失败提示 + 重试，不得显示「请先新建或选择一个看板」', async () => {
    hoisted.listBoards.mockRejectedValueOnce(new Error('down'))
    const w = await mountReady()
    expect(w.text()).toContain('common.loadFailed')
    expect(w.text()).not.toContain('reportBoard.noBoard')
    // 重试后恢复真实状态（不是靠刷新页面）
    await vmOf(w).loadPage()
    await flushPromises()
    expect(w.text()).not.toContain('common.loadFailed')
    expect(vmOf(w).activeId).toBe(1)
  })

  it('数据源白名单读取失败也算整页失败（白名单缺失时"能看不能存"是假可用）', async () => {
    hoisted.listSources.mockRejectedValueOnce(new Error('down'))
    const w = await mountReady()
    expect(w.text()).toContain('common.loadFailed')
    expect(vmOf(w).boards.length).toBe(0)
  })

  it('新建看板：取消（prompt 拒绝）不逸出、不发请求', async () => {
    const w = await mountReady()
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValueOnce('cancel')
    await expect(vmOf(w).createBoard()).resolves.toBeUndefined()
    expect(hoisted.addBoard).not.toHaveBeenCalled()
  })

  it('新建看板：200 但无看板载荷 ⇒ 提示"结果未知"，不得静默当成功', async () => {
    const w = await mountReady()
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValueOnce({ value: '新看板' } as never)
    hoisted.addBoard.mockResolvedValueOnce({ data: undefined })
    const warn = vi.spyOn(ElMessage, 'warning')
    await vmOf(w).createBoard()
    expect(hoisted.addBoard).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('reportBoard.createUnknown')
    expect(vmOf(w).boards.length).toBe(2)
  })

  it('保存看板失败：拒绝不逸出（拦截器提示），页面仍在', async () => {
    const w = await mountReady()
    hoisted.updateBoard.mockRejectedValueOnce(new Error('down'))
    await expect(vmOf(w).saveBoard()).resolves.toBeUndefined()
    expect(w.text()).toContain('reportBoard.title')
  })
})
