/**
 * 报表图表卡的失败语义（b109）。
 *
 * 立的案：`ChartCard.load()` 失败时 `loadError` 只写进 ref、模板**从不渲染它**，同时
 * `rows.value = []` ⇒ 一次取数失败被显示成"无可渲染数据"（和真的没有数据一模一样），
 * 且已经画好的图/表连同旧结论一起被抹掉。本文件钉住：
 * ① 成功过再失败 ⇒ 旧值保留 + 横幅写明"几点的数据"（含 HH:mm:ss），不得出现空态/失败占位；
 * ② 从未成功过就失败 ⇒ 失败态 + 重试入口，不得伪装成空态；
 * ③ 换数据集（查询身份变了）⇒ 旧值先丢，失败时不得把上一个数据集的结果当成新的；
 * ④ 后发先回：旧请求的结局一律作废。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  previewDataset: vi.fn(),
  setOption: vi.fn()
}))

vi.mock('@/api/report', () => ({
  previewDataset: (...a: unknown[]) => hoisted.previewDataset(...a)
}))

vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    getChart: async () => ({ setOption: hoisted.setOption }),
    resize: vi.fn(),
    dispose: vi.fn()
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

import ChartCard from './ChartCard.vue'

const stubs = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': {
    props: ['data', 'size', 'maxHeight'],
    template: '<div class="table-stub">{{ JSON.stringify(data) }}</div>'
  },
  'el-table-column': { template: '<div />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-alert': {
    props: ['title'],
    template: '<div class="alert-stub">{{ title }}<slot /></div>'
  }
}

const globalOptions = { stubs }

const chart = (datasetId: number) => ({
  chartId: 'c1',
  chartType: 'table' as const,
  datasetId,
  title: '明细',
  span: 12 as const
})

type Vm = { reload: () => Promise<void> }

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
  hoisted.previewDataset.mockResolvedValue({
    data: { columns: ['amount'], rows: [{ amount: 10 }] }
  })
})

async function mountCard(datasetId = 1): Promise<VueWrapper> {
  const w = mount(ChartCard, { props: { chart: chart(datasetId) }, global: globalOptions })
  await flushPromises()
  return w
}

function vmOf(w: VueWrapper): Vm {
  return w.vm as unknown as Vm
}

describe('报表图表卡：取数失败不得伪装成"没有数据"', () => {
  it('成功过再失败 ⇒ 旧值保留 + 横幅写明"几点的数据"', async () => {
    const w = await mountCard()
    expect(w.find('.table-stub').text()).toContain('"amount":10')
    expect(w.text()).not.toContain('rp.chartLoadFail')

    hoisted.previewDataset.mockRejectedValueOnce(new Error('down'))
    await vmOf(w).reload()
    await flushPromises()

    // 旧表格继续展示（断言表格内容，不用整页文本——时钟 HH:mm:ss 里也可能出现 "10"）
    expect(w.find('.table-stub').text()).toContain('"amount":10')
    // 横幅说明时效（含时刻），而不是空态或失败占位
    expect(w.text()).toContain('common.staleDataHintAt:')
    expect(w.text()).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(w.text()).not.toContain('rp.chartLoadFail')
    expect(w.text()).not.toContain('rp.chartEmptyHint')
  })

  it('从未成功过就失败 ⇒ 失败态 + 重试入口，不得伪装成空态', async () => {
    hoisted.previewDataset.mockRejectedValueOnce(new Error('down'))
    const w = await mountCard()

    expect(w.text()).toContain('rp.chartLoadFail')
    expect(w.text()).toContain('common.retry')
    expect(w.text()).not.toContain('rp.chartEmptyHint')
    expect(w.text()).not.toContain('common.staleDataHintAt:')
  })

  it('换数据集先丢快照：新数据集失败时不得展示上一个数据集的结果', async () => {
    const w = await mountCard(1)
    expect(w.find('.table-stub').text()).toContain('"amount":10')

    hoisted.previewDataset.mockRejectedValueOnce(new Error('down'))
    await w.setProps({ chart: chart(2) })
    await flushPromises()

    expect(w.find('.table-stub').text()).not.toContain('"amount":10')
    expect(w.text()).toContain('rp.chartLoadFail')
    expect(w.text()).not.toContain('common.staleDataHintAt:')
  })

  it('后发先回：先发的旧请求晚到也不得覆盖后发的结局', async () => {
    const w = await mountCard()
    const vm = vmOf(w)

    const slow = deferred<{ data: { columns: string[]; rows: Record<string, unknown>[] } }>()
    hoisted.previewDataset
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ data: { columns: ['amount'], rows: [{ amount: 99 }] } })
    const first = vm.reload()
    const second = vm.reload()
    await second
    await flushPromises()
    expect(w.text()).toContain('99')

    slow.resolve({ data: { columns: ['amount'], rows: [{ amount: 10 }] } })
    await first
    await flushPromises()
    expect(w.text()).toContain('99')
    expect(w.text()).not.toContain('"amount":10')
    expect(w.text()).not.toContain('common.staleDataHintAt:')
  })
})

describe('报表图表卡：展示字段与取数字段分开（b110）', () => {
  const barChart = () => ({
    chartId: 'c9',
    chartType: 'bar' as const,
    datasetId: 3,
    title: '标题A',
    span: 12 as const,
    xField: 'label',
    yField: 'amount'
  })

  async function mountReactive() {
    // bar 类型要真正画出 option，行里必须有 xField 指向的类目列（label 为空 ⇒ option 为 null）
    hoisted.previewDataset.mockResolvedValue({
      data: { columns: ['label', 'amount', 'total'], rows: [{ label: 'A', amount: 10, total: 20 }] }
    })
    // 设计器属性面板是「原地改字段」而不是整体替换，必须用同一个 reactive 对象复现
    const chartObj = reactive(barChart())
    const w = mount(ChartCard, { props: { chart: chartObj }, global: globalOptions })
    await flushPromises()
    return { w, chartObj }
  }

  it('只改标题：不重新取数、不重画图表（纯展示字段）', async () => {
    const { w, chartObj } = await mountReactive()
    expect(hoisted.previewDataset).toHaveBeenCalledTimes(1)
    const setOptionCalls = hoisted.setOption.mock.calls.length

    chartObj.title = '标题B'
    await flushPromises()
    // 标题是模板直接读的，必须立刻反映
    expect(w.text()).toContain('标题B')
    // 关键：属性面板每敲一个字都不该再打一次数据集查询
    expect(hoisted.previewDataset, '纯展示字段不得触发重新取数').toHaveBeenCalledTimes(1)
    expect(hoisted.setOption.mock.calls.length, '标题不参与 option 构建，无需重画').toBe(setOptionCalls)
  })

  it('改字段绑定：用已有行本地重画，不重新取数', async () => {
    const { chartObj } = await mountReactive()
    const setOptionCalls = hoisted.setOption.mock.calls.length

    chartObj.yField = 'total'
    await flushPromises()
    expect(hoisted.previewDataset, '换字段不等于换数据源').toHaveBeenCalledTimes(1)
    expect(hoisted.setOption.mock.calls.length, '绑定变了必须重画').toBeGreaterThan(setOptionCalls)
  })

  it('换数据集：必须重新取数（对照组，证明上面两条不是"什么都不听"）', async () => {
    const { chartObj } = await mountReactive()
    expect(hoisted.previewDataset).toHaveBeenCalledTimes(1)

    chartObj.datasetId = 4
    await flushPromises()
    expect(hoisted.previewDataset).toHaveBeenCalledTimes(2)
    expect(hoisted.previewDataset).toHaveBeenLastCalledWith(expect.objectContaining({ datasetId: 4 }))
  })
})
