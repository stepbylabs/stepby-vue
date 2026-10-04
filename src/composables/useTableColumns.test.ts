import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref, type Ref } from 'vue'

// ---------------------------------------------------------------------------
// mock vue-i18n：locale 为可控 ref，t 按 locale 回显，便于断言 label 重建
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({ locale: undefined as { value: string } | undefined }))
vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  const locale = ref('zh')
  state.locale = locale
  return {
    useI18n: () => ({
      locale,
      t: (key: string) => `${locale.value}:${key}`
    })
  }
})

import { useTableColumns } from './useTableColumns'
import type { TableColumnDef } from '@/utils/userPrefs'

const DEFS: TableColumnDef[] = [{ key: 'name' }, { key: 'time' }]

interface TestColumn {
  label: string
  visible: boolean
}

function setup(opts: { labels?: () => Record<string, string>; saved?: string[] } = {}) {
  const savedWrites: string[][] = []
  // 模拟页面 columns ref：label 为旧快照、visible 模拟用户已保存的显隐状态
  const target = ref<Record<string, TestColumn>>({
    name: { label: '旧名', visible: true },
    time: { label: '旧时', visible: false }
  })
  const ctx = useTableColumns({
    pageKey: 'test:page',
    columns: DEFS,
    labels: opts.labels,
    getSaved: () => opts.saved,
    save: (v) => savedWrites.push([...v])
  })
  return { ctx, target, savedWrites }
}

beforeEach(() => {
  if (state.locale) state.locale.value = 'zh'
})

describe('composables/useTableColumns', () => {
  it('getSaved 恢复偏好；toggle 更新并持久化（按列定义顺序）', async () => {
    const { ctx, savedWrites } = setup({ saved: ['time'] })
    expect(ctx.visibleKeys.value).toEqual(['time'])
    ctx.toggle('name')
    expect(ctx.visibleKeys.value).toEqual(['name', 'time'])
    await nextTick() // 持久化 watch 为异步（flush: 'pre'），等 save 回调执行
    expect(savedWrites.at(-1)).toEqual(['name', 'time'])
  })

  it('toggle 允许隐藏非末列，但至少保留一列可见', () => {
    const { ctx } = setup({ saved: ['name', 'time'] })
    ctx.toggle('name')
    expect(ctx.visibleKeys.value).toEqual(['time'])
    ctx.toggle('time') // 试图隐藏最后一列 → 不生效
    expect(ctx.visibleKeys.value).toEqual(['time'])
  })

  it('resetToDefault 恢复默认可见列', () => {
    const { ctx } = setup({ saved: ['time'] })
    ctx.resetToDefault()
    expect(ctx.visibleKeys.value).toEqual(['name', 'time'])
  })

  it('locale 切换 → bindLabels 重建 label（P2a 核心场景）', async () => {
    const labels = (): Record<string, string> => ({
      name: `${state.locale!.value}:name`,
      time: `${state.locale!.value}:time`
    })
    const { ctx, target } = setup({ labels })
    ctx.bindLabels(target as unknown as Ref<Record<string, { label: string }>>)
    // immediate：绑定即应用最新文案
    expect(target.value.name.label).toBe('zh:name')
    expect(target.value.time.label).toBe('zh:time')
    // 切语言 → labelMap 重算 → columns label 更新
    state.locale!.value = 'en'
    await nextTick()
    expect(target.value.name.label).toBe('en:name')
    expect(target.value.time.label).toBe('en:time')
  })

  it('label 重建仅更新 label，visible 显隐偏好保留', async () => {
    const labels = (): Record<string, string> => ({ name: `${state.locale!.value}:name` })
    const { ctx, target, savedWrites } = setup({ labels })
    ctx.bindLabels(target as unknown as Ref<Record<string, { label: string }>>)
    expect(target.value.time.visible).toBe(false) // 用户已隐藏的列
    state.locale!.value = 'en'
    await nextTick()
    expect(target.value.time.label).toBe('旧时') // 工厂未覆盖的 key 不动
    expect(target.value.time.visible).toBe(false) // 显隐状态不被重建破坏
    expect(savedWrites).toEqual([]) // composable 侧不因 label 更新回写偏好
  })

  it('未传 labels 工厂时 bindLabels 空操作（向后兼容）', async () => {
    const { ctx, target } = setup()
    ctx.bindLabels(target as unknown as Ref<Record<string, { label: string }>>)
    expect(target.value.name.label).toBe('旧名')
    state.locale!.value = 'en'
    await nextTick()
    expect(target.value.name.label).toBe('旧名') // 无工厂 → 不更新、不报错
  })
})
