/**
 * 图表小组件的取数与失败语义（b108）。
 *
 * 立的案：`refresh()` 失败时整张图被换成"加载失败"，等于把一次网络抖动变成数据丢失——
 * 用户连上一次看到的是什么都没了；自动刷新与手动重试重叠时，先发请求的迟到响应还会覆盖新数据。
 * 本文件钉住三件事：
 * ① 首载失败 ⇒ error/未 loaded/无截止时刻（模板据此显示失败态）；
 * ② 成功过再失败 ⇒ 旧图保留（不再 setOption、也不 clear）、loaded 仍真、lastSuccessAt 不被清空；
 * ③ 并发请求后发先回 ⇒ 先发响应一律丢弃（既不覆盖数据，也不提前摘 loading）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, type SetupContext } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({ setOption: vi.fn() }))

vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    getChart: async () => ({ setOption: hoisted.setOption }),
    withDark: (_chart: unknown, option: unknown) => option
  }),
  readCssVar: () => '#fff'
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => ({ isDark: false })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn() }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import { useEchartsWidget } from './useEchartsWidget'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const Host = defineComponent({
  props: {
    fetcher: { type: Function, required: true }
  },
  setup(props: { fetcher: () => Promise<number> }, { expose }: SetupContext) {
    const api = useEchartsWidget<number>({
      name: 'unit',
      fetchData: () => (props.fetcher as () => Promise<number>)(),
      hasData: (v) => v > 0,
      buildOption: (v) => ({ series: [{ data: [v] }] }),
      // 关掉挂载自动加载：本文件要精确控制每次 refresh 与 mock 队列的一一对应
      autoLoad: false
    })
    expose(api)
    // 与真实模板同构的可见性规则：有旧图（loaded）时失败也要把容器留着
    return () =>
      h('div', {
        class: 'chart-host',
        ref: api.el,
        style: api.empty.value || (api.error.value && !api.loaded.value) ? { display: 'none' } : undefined
      })
  }
})

type WidgetVm = {
  loading: boolean
  error: boolean
  empty: boolean
  loaded: boolean
  lastSuccessAt: number | null
  refresh: () => Promise<void>
}

function mountWidget(fetcher: () => Promise<number>) {
  const w = mount(Host, { props: { fetcher } })
  return { w, vm: w.vm as unknown as WidgetVm }
}

beforeEach(() => {
  hoisted.setOption.mockClear()
})

describe('useEchartsWidget：失败不得把旧图换成"加载失败"', () => {
  it('首载失败 ⇒ error 置真、loaded 仍假、没有截止时刻、图表不渲染', async () => {
    const { w, vm } = mountWidget(() => Promise.reject(new Error('down')))
    await vm.refresh()
    await flushPromises()
    expect(vm.error).toBe(true)
    expect(vm.loaded).toBe(false)
    expect(vm.lastSuccessAt).toBeNull()
    expect(vm.loading).toBe(false)
    expect(hoisted.setOption).not.toHaveBeenCalled()
    expect(w.find('.chart-host').attributes('style')).toContain('display: none')
  })

  it('成功过再失败 ⇒ 旧图保留（不再 setOption）、loaded 仍真、截止时刻不被覆盖；重试成功后恢复', async () => {
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(3)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(8)
    const { w, vm } = mountWidget(fetcher)
    await vm.refresh()
    await flushPromises()
    expect(vm.error).toBe(false)
    expect(vm.loaded).toBe(true)
    expect(hoisted.setOption).toHaveBeenCalledTimes(1)
    const firstAt = vm.lastSuccessAt
    expect(firstAt).not.toBeNull()

    await vm.refresh()
    await flushPromises()
    expect(vm.error).toBe(true)
    expect(vm.loaded).toBe(true)
    expect(vm.lastSuccessAt).toBe(firstAt)
    // 关键：失败没有重画/清空图表，容器也没有被隐藏
    expect(hoisted.setOption).toHaveBeenCalledTimes(1)
    expect(w.find('.chart-host').attributes('style') || '').not.toContain('display: none')

    await vm.refresh()
    await flushPromises()
    expect(vm.error).toBe(false)
    expect(vm.loaded).toBe(true)
    expect(hoisted.setOption).toHaveBeenCalledTimes(2)
    expect(hoisted.setOption.mock.calls[1][0]).toMatchObject({ series: [{ data: [8] }] })
    expect(vm.lastSuccessAt!).toBeGreaterThanOrEqual(firstAt!)
  })

  it('并发：后发先回时，先发的迟到响应不得覆盖数据，也不得提前摘掉 loading', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { vm } = mountWidget(fetcher)
    const p1 = vm.refresh()
    const p2 = vm.refresh()
    expect(hoisted.setOption).not.toHaveBeenCalled()
    second.resolve(2)
    await p2
    await flushPromises()
    expect(vm.loading).toBe(false)
    expect(hoisted.setOption).toHaveBeenCalledTimes(1)
    expect(hoisted.setOption.mock.calls[0][0]).toMatchObject({ series: [{ data: [2] }] })

    first.resolve(1)
    await p1
    await flushPromises()
    expect(hoisted.setOption).toHaveBeenCalledTimes(1)
    expect(hoisted.setOption.mock.calls[0][0]).toMatchObject({ series: [{ data: [2] }] })
  })

  it('并发：先发的失败若已被后发取代，不得把 error 置真', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { vm } = mountWidget(fetcher)
    const p1 = vm.refresh()
    const p2 = vm.refresh()
    second.resolve(6)
    await p2
    first.reject(new Error('late failure'))
    await p1
    await flushPromises()
    expect(vm.error).toBe(false)
    expect(vm.loaded).toBe(true)
    expect(vm.loading).toBe(false)
  })

  it('空数据（成功但 hasData=false）⇒ empty 置真、loaded 仍真（"没有数据"与"取数失败"可区分）', async () => {
    const { w, vm } = mountWidget(async () => 0)
    await vm.refresh()
    await flushPromises()
    expect(vm.empty).toBe(true)
    expect(vm.loaded).toBe(true)
    expect(vm.error).toBe(false)
    expect(w.find('.chart-host').attributes('style')).toContain('display: none')
  })
})
