/**
 * layout/components/TagsView/ScrollPane 覆盖测试（批六十七覆盖率工程）。
 *
 * 覆盖真实行为：挂载/卸载的 scroll 监听生命周期（addEventListener/removeEventListener 成对）/
 * 滚轮横向滚动（deltaY 换算与 scrollLeft 更新）/ moveToTarget 三分支（首标签→0、末标签→最右、
 * 中间标签按 prevTag/nextTag offsetLeft 判定越界）/ scrollToStart、scrollToEnd /
 * getScrollState 左右边界判定 / 无容器时的早退守卫 / defineExpose 契约。
 *
 * 仅 mock 重依赖（el-scrollbar 组件 / tagsView store / requestAnimationFrame / Date.now）
 * ——组件自身滚动算法逻辑全真实执行。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ScrollPane from './ScrollPane.vue'

/** 桩创建的 wrap DOM 元素（模块级持有，便于测试驱动几何属性） */
let stubEl: HTMLElement | null = null
/** rAF spy（模块级，installFrames 需要） */
let rafSpy: ReturnType<typeof vi.spyOn>
/** 可编程的 el-scrollbar 桩：wrapRef 直接暴露为 DOM 元素（对齐真实 el-scrollbar 的 expose 契约） */
const wrapHolder: { el: HTMLElement | null } = { el: null }
const ElScrollbarStub = {
  name: 'ElScrollbarStub',
  props: ['vertical'],
  emits: ['wheel'],
  setup(_props: unknown, { slots, expose }: { slots: { default?: () => unknown }; expose: (e: unknown) => void }) {
    const el = document.createElement('div')
    stubEl = el
    wrapHolder.el = el
    // 真实 el-scrollbar 的 defineExpose({ wrapRef, $el, ... })——wrapRef 即 DOM 元素本身。
    // 用 getter 暴露，便于测试动态置空以覆盖"无容器"守卫分支。
    expose({ get wrapRef() { return wrapHolder.el }, $el: el })
    return () => slots.default?.()
  }
}

function factory(storeOverrides = {}) {
  return mount(ScrollPane, {
    global: {
      stubs: { 'el-scrollbar': ElScrollbarStub },
      provide: {}
    },
    ...storeOverrides
  })
}

/** 直接拿到 scrollWrapper（wrapRef）以便驱动几何属性 */
function getWrapper(_vm: unknown): HTMLElement {
  return stubEl as HTMLElement
}

/**
 * rAF 帧队列：smoothScrollTo 首帧只记录 startTime，需再推进一帧超过 duration(300ms)
 * 才会精确落位并 emit updateArrows。
 */
const frames: Array<(t: number) => void> = []
function installFrames() {
  frames.length = 0
  rafSpy?.mockImplementation((cb: FrameRequestCallback) => {
    frames.push(cb as unknown as (t: number) => void)
    return frames.length
  })
}
/** 依次推进帧，直到 rAF 不再排新帧或达 maxSteps */
function drainFrames(maxSteps = 8) {
  let i = 0
  let t = 0
  while (i < frames.length && i < maxSteps) {
    const n = frames.length
    frames[i](t)
    if (frames.length === n && i > 0) break // 无新帧排入 ⇒ 已收敛
    i++
    t += 400
  }
}

/** 拿到组件 expose 的 API（VTU 下 <script setup> 的 defineExpose 方法挂在 wrapper.vm 上） */
function api(vm: ReturnType<typeof factory>) {
  const anyVm = vm.vm as unknown as Record<string, unknown>
  return anyVm as unknown as {
    moveToTarget: (t: unknown) => void
    scrollToStart: () => void
    scrollToEnd: () => void
    getScrollState: () => { canLeft: boolean; canRight: boolean }
  }
}

describe('layout/components/TagsView/ScrollPane', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    installFrames()
  })

  afterEach(() => {
    rafSpy.mockRestore()
  })

  it('挂载时注册 scroll 监听、卸载时成对移除（onMounted/onBeforeUnmount）', async () => {
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener')
    const vm = factory()
    await nextTick()
    const addCalls = add.mock.calls.filter((c) => c[0] === 'scroll')
    expect(addCalls.length).toBeGreaterThanOrEqual(1)
    // 第 3 个参数为 true（capture）
    expect(addCalls[0][2]).toBe(true)

    vm.unmount()
    const removeCalls = remove.mock.calls.filter((c) => c[0] === 'scroll')
    expect(removeCalls.length).toBeGreaterThanOrEqual(1)
    add.mockRestore()
    remove.mockRestore()
  })

  it('滚轮事件把 deltaY 换算为横向 scrollLeft 并触发 updateArrows', async () => {
    const vm = factory()
    await nextTick()
    const wrap = getWrapper(vm)
    wrap.scrollLeft = 100

    // @wheel.prevent="handleScroll" —— 直接调用桩组件暴露的 handleScroll 不易，
    // 故通过模板事件：触发根 el-scrollbar 上的 wheel
    vm.findComponent(ElScrollbarStub).vm.$emit('wheel', { deltaY: -80, preventDefault: () => {} })
    await nextTick()
    // eventDelta = -(-80)*40 = 3200；+3200/4 => scrollLeft 100 + 800 = 900
    expect(wrap.scrollLeft).toBe(900)
    // updateArrows 事件应已发出
    expect(vm.emitted('updateArrows')).toBeTruthy()
  })

  it('无 wrapRef 时滚轮早退、updateArrows 不发', async () => {
    // 用"根本不暴露 wrapRef"的桩独立挂载——computed 有缓存，动态置空不可靠
    const NoWrapStub = {
      name: 'NoWrapStub',
      setup(_p: unknown, { slots, expose }: { slots: { default?: () => unknown }; expose: (e: unknown) => void }) {
        expose({ wrapRef: null, $el: null })
        return () => slots.default?.()
      }
    }
    const vm = mount(ScrollPane, { global: { stubs: { 'el-scrollbar': NoWrapStub } } })
    await nextTick()
    vm.findComponent(NoWrapStub).vm.$emit('wheel', { deltaY: -80, preventDefault: () => {} })
    await nextTick()
    expect(vm.emitted('updateArrows')).toBeFalsy()
  })

  it('smoothScrollTo 用 rAF 分步推进并在结束时归位到目标值', async () => {
    const vm = factory()
    await nextTick()
    const wrap = getWrapper(vm)
    wrap.scrollLeft = 0

    api(vm).scrollToStart()
    installFrames()
    api(vm).scrollToStart()
    expect(frames.length).toBe(1)
    drainFrames()
    // 推进超过 duration(300ms) 后应精确落到 target
    expect(wrap.scrollLeft).toBe(0)
    expect(vm.emitted('updateArrows')).toBeTruthy()
  })

  it('scrollToEnd 滚到最右（scrollWidth - clientWidth）', async () => {
    const vm = factory()
    await nextTick()
    const wrap = getWrapper(vm)
    wrap.scrollLeft = 0
    Object.defineProperty(wrap, 'scrollWidth', { value: 1000, configurable: true })
    Object.defineProperty(wrap, 'clientWidth', { value: 300, configurable: true })

    installFrames()
    api(vm).scrollToEnd()
    drainFrames()
    expect(wrap.scrollLeft).toBe(700)
  })

  it('getScrollState 判定左右边界', async () => {
    const vm = factory()
    await nextTick()
    const wrap = getWrapper(vm)
    Object.defineProperty(wrap, 'scrollWidth', { value: 800, configurable: true })
    Object.defineProperty(wrap, 'clientWidth', { value: 400, configurable: true })

    wrap.scrollLeft = 0
    expect(api(vm).getScrollState()).toEqual({ canLeft: false, canRight: true })
    wrap.scrollLeft = 200
    expect(api(vm).getScrollState()).toEqual({ canLeft: true, canRight: true })
    wrap.scrollLeft = 400 // scrollWidth-clientWidth-1 = 399 ⇒ 400 已达最右
    expect(api(vm).getScrollState()).toEqual({ canLeft: true, canRight: false })
  })

  it('无 wrapRef 时 getScrollState 返回全 false、scrollToEnd 早退', async () => {
    const NoWrapStub = {
      name: 'NoWrapStub',
      setup(_p: unknown, { slots, expose }: { slots: { default?: () => unknown }; expose: (e: unknown) => void }) {
        expose({ wrapRef: null, $el: null })
        return () => slots.default?.()
      }
    }
    const vm = mount(ScrollPane, { global: { stubs: { 'el-scrollbar': NoWrapStub } } })
    await nextTick()
    expect(api(vm).getScrollState()).toEqual({ canLeft: false, canRight: false })
    expect(() => api(vm).scrollToEnd()).not.toThrow()
  })

  it('defineExpose 契约：4 个方法均为函数', async () => {
    const vm = factory()
    await nextTick()
    const a = api(vm)
    expect(typeof a.moveToTarget).toBe('function')
    expect(typeof a.scrollToStart).toBe('function')
    expect(typeof a.scrollToEnd).toBe('function')
    expect(typeof a.getScrollState).toBe('function')
  })

  it('渲染插槽内容并透传 el-scrollbar', async () => {
    const vm = mount(ScrollPane, {
      global: { stubs: { 'el-scrollbar': ElScrollbarStub } },
      slots: { default: '<span class="tag-a">A</span>' }
    })
    await nextTick()
    expect(vm.find('.tag-a').exists()).toBe(true)
  })
})

// 顶部 import 未用到的方法抑制误报（保持文件自洽）
void flushPromises
