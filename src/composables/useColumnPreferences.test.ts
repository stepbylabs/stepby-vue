import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref, type Ref } from 'vue'

// ---------------------------------------------------------------------------
// mock settings store：userPrefs.tableColumns 为可控对象，updateUserPrefs 记录调用
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  writes: [] as Array<Record<string, unknown>>
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => ({
    get userPrefs() {
      return state.prefs
    },
    updateUserPrefs: (patch: Record<string, unknown>) => state.writes.push(patch)
  })
}))

import { useColumnPreferences } from './useColumnPreferences'

interface TestColumn {
  label: string
  visible: boolean
}

function makeColumns(): Ref<Record<string, TestColumn>> {
  return ref<Record<string, TestColumn>>({
    name: { label: '名称', visible: true },
    time: { label: '时间', visible: true },
    status: { label: '状态', visible: true }
  })
}

beforeEach(() => {
  state.prefs = {}
  state.writes = []
})

describe('composables/useColumnPreferences', () => {
  it('applyTo 按已保存的可见列回填 visible（不动 label）', () => {
    state.prefs = { tableColumns: { 'system:role': ['name', 'status'] } }
    const prefs = useColumnPreferences('system:role')
    const columns = makeColumns()
    prefs.applyTo(columns)
    expect(columns.value.name.visible).toBe(true)
    expect(columns.value.time.visible).toBe(false)
    expect(columns.value.status.visible).toBe(true)
    expect(columns.value.name.label).toBe('名称')
  })

  it('未保存过时不改动任何列（保持默认全显）', () => {
    const prefs = useColumnPreferences('system:role')
    const columns = makeColumns()
    prefs.applyTo(columns)
    const cols = columns.value as Record<string, TestColumn>
    expect(Object.keys(cols).every((k) => cols[k].visible)).toBe(true)
  })

  it('watchColumns 深度变化时合并写，保留其它页面偏好', async () => {
    state.prefs = { tableColumns: { 'other:page': ['a', 'b'] } }
    const prefs = useColumnPreferences('system:role')
    const columns = makeColumns()
    prefs.watchColumns(columns)

    columns.value.time.visible = false
    await nextTick()

    expect(state.writes.length).toBeGreaterThan(0)
    const last = state.writes.at(-1) as { tableColumns: Record<string, string[]> }
    // 合并写：本页更新 + 其它页保留
    expect(last.tableColumns['system:role']).toEqual(['name', 'status'])
    expect(last.tableColumns['other:page']).toEqual(['a', 'b'])
  })

  it('save 直接写本页可见列并保留其它页', () => {
    state.prefs = { tableColumns: { 'other:page': ['x'] } }
    const prefs = useColumnPreferences('monitor:operlog')
    prefs.save(['operId'])
    const last = state.writes.at(-1) as { tableColumns: Record<string, string[]> }
    expect(last.tableColumns['monitor:operlog']).toEqual(['operId'])
    expect(last.tableColumns['other:page']).toEqual(['x'])
  })
})
