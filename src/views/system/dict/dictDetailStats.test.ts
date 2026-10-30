/**
 * 字典数据抽屉的统计口径与失败态（b134）。
 *
 * 立的案（HEAD 实测）：抽屉只请求 `pageSize=50` 的第一页，却把 `dataList.length` 当作
 * "共计条目"、把这一页里的状态分布当作全量统计；而 `.catch(() => {})` 让读失败落成
 * `dataList=[]` ⇒ 界面显示"暂无字典数据"（与真的空字典同形）。
 *
 * 三条判据：
 * 1. 总数超过一页 ⇒ 按 total 逐页取满，统计卡显示真实总数（不是首页 50 条）；
 * 2. 读失败 ⇒ 失败告警与重试入口可见，且**不得**出现"暂无字典数据"；重试成功后恢复；
 * 3. 超过全量硬上限 ⇒ 显示"仅基于前 N 条"的截断提示，总数仍显示服务端 total。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  listData: vi.fn()
}))

vi.mock('@/api/system/dict/data', () => ({
  listData: (...a: unknown[]) => hoisted.listData(...a)
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (k: string, p?: { count?: number; total?: number }) => (p ? `${k}(${p.count}/${p.total})` : k)
    })
  }
})

import Detail from './detail.vue'

const stubs = {
  'el-drawer': { props: ['modelValue'], template: '<div v-if="modelValue"><slot name="header" /><slot /></div>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub" v-bind="$attrs">{{ title }}<slot /></div>' },
  'el-empty': { template: '<div class="empty-stub" />' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-button': { emits: ['click'], template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>' },
  transition: { template: '<div><slot /></div>' },
  'transition-group': { template: '<div><slot /></div>' },
  List: true,
  Loading: true
}

function rows(count: number, status: '0' | '1', offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    dictCode: offset + i + 1,
    dictLabel: `L${offset + i + 1}`,
    dictValue: String(offset + i + 1),
    status
  }))
}

function mountDrawer() {
  return mount(Detail, {
    props: { row: { dictType: 'demo_type', dictName: '演示字典' }, visible: true },
    global: { stubs }
  })
}

beforeEach(() => {
  // clearAllMocks 不清空排队的 mockXxxOnce：前一条用例失败时残留的 Once 会成为下一条的第一次返回值
  vi.resetAllMocks()
})

describe('字典数据抽屉：统计必须基于全量、失败不得冒充空（b134）', () => {
  it('总数 120 ⇒ 按 total 取满两页，统计卡显示 120 而不是首页 100', async () => {
    hoisted.listData
      .mockResolvedValueOnce({ rows: rows(100, '0'), total: 120 })
      .mockResolvedValueOnce({ rows: rows(20, '1', 100), total: 120 })

    const w = mountDrawer()
    await flushPromises()

    expect(hoisted.listData).toHaveBeenCalledTimes(2)
    expect(hoisted.listData.mock.calls[0][0]).toMatchObject({ pageNum: 1, pageSize: 100, dictType: 'demo_type' })
    expect(hoisted.listData.mock.calls[1][0]).toMatchObject({ pageNum: 2, pageSize: 100 })
    const nums = w.findAll('.stat-num').map((n) => n.text())
    expect(nums).toEqual(['120', '100', '20'])
    expect(w.find('[data-test="dict-detail-stats-truncated"]').exists()).toBe(false)
  })

  it('读失败 ⇒ 失败告警可见且不显示"暂无数据"；重试成功后恢复', async () => {
    hoisted.listData
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ rows: rows(2, '0'), total: 2 })

    const w = mountDrawer()
    await flushPromises()

    expect(w.find('[data-test="dict-detail-load-error"]').exists()).toBe(true)
    expect(w.find('.empty-stub').exists()).toBe(false)

    await w.find('[data-test="dict-detail-load-error"] .btn-stub').trigger('click')
    await flushPromises()

    expect(hoisted.listData).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="dict-detail-load-error"]').exists()).toBe(false)
    expect(w.findAll('.stat-num').map((n) => n.text())).toEqual(['2', '2'])
  })

  it('超过全量硬上限 1000 ⇒ 显示截断提示，总数仍为服务端 total', async () => {
    hoisted.listData.mockImplementation((q: { pageNum: number }) => ({
      rows: rows(100, '0', (q.pageNum - 1) * 100),
      total: 1500
    }))

    const w = mountDrawer()
    await flushPromises()

    // 1000 / 100 = 10 页后停在硬上限
    expect(hoisted.listData).toHaveBeenCalledTimes(10)
    expect(w.findAll('.stat-num')[0].text()).toBe('1500')
    expect(w.find('[data-test="dict-detail-stats-truncated"]').text()).toContain(
      'dict.detail.statsTruncated(1000/1500)'
    )
  })
})
