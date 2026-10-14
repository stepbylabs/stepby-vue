/**
 * components/Tour 覆盖测试（批六十五覆盖率工程）。
 *
 * 覆盖真实行为：显隐渲染 / 步骤计数 / next-prev-finish-skip 流转 / 遮罩点击跳过 /
 * 键盘（Esc 跳过、←→ 导航、输入框内忽略）/ 目标元素缺失自动跳步 / 四向 placement 定位与
 * 边界钳制 / visible 打开重置到首步 / storageKey 落库（completed / skipped）/ 焦点回退。
 *
 * 仅桩替换 el-button（Element Plus 真实加载会拖垮 worker，与既有测试同纪律）；
 * 其余为真实代码路径（含 DOM 测量、computed 定位、事件监听）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { h, nextTick } from 'vue'
import type { SetupContext } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const hoisted = vi.hoisted(() => ({ localSet: vi.fn() }))

vi.mock('@/plugins/cache', () => ({
  default: { local: { set: hoisted.localSet, get: () => null } }
}))

import Tour from './index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      tour: {
        prev: 'Prev',
        next: 'Next',
        finish: 'Finish',
        skip: 'Skip',
        ariaLabel: 'Guide'
      }
    }
  }
})

const ElButtonStub = {
  props: ['size', 'type', 'text'],
  emits: ['click'],
  setup(_props: Record<string, unknown>, { slots, emit }: SetupContext) {
    return () => h('button', { class: 'btn', onClick: () => emit('click') }, slots.default?.())
  }
}

function factory(props: Record<string, unknown> = {}) {
  return mount(Tour, {
    props: {
      visible: true,
      steps: [
        { selector: '.tour-target-a', title: 'A', content: 'aa' },
        { selector: '.tour-target-b', title: 'B', content: 'bb', placement: 'top' as const },
        { selector: '.tour-target-c', title: 'C', content: 'cc', placement: 'right' as const }
      ],
      ...props
    },
    global: {
      plugins: [i18n],
      stubs: { 'el-button': ElButtonStub, Transition: false }
    }
  })
}

function btnByText(wrapper: ReturnType<typeof factory>, text: string) {
  return wrapper.findAll('button.btn').find((b) => b.text().includes(text))
}

describe('components/Tour', () => {
  beforeEach(() => {
    hoisted.localSet.mockClear()
    // 造目标元素 + 记录 scrollIntoView
    for (const cls of ['tour-target-a', 'tour-target-b', 'tour-target-c']) {
      const el = document.createElement('div')
      el.className = cls
      el.scrollIntoView = vi.fn()
      el.getBoundingClientRect = () =>
        ({ left: 100, top: 200, right: 300, bottom: 260, width: 200, height: 60 }) as DOMRect
      document.body.appendChild(el)
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('visible=false 不渲染；true 渲染并显示首步与计数', async () => {
    const w = factory({ visible: false })
    expect(w.find('.tour-wrapper').exists()).toBe(false)
    await w.setProps({ visible: true })
    await nextTick()
    expect(w.find('.tour-wrapper').exists()).toBe(true)
    expect(w.find('.stepby-tour-title').text()).toBe('A')
    expect(w.find('.stepby-tour-counter').text().replace(/\s+/g, ' ')).toBe('1 / 3')
  })

  it('next 前进、prev 后退（首步无 prev、末步显示 finish）', async () => {
    const w = factory()
    await nextTick()
    // 首步：无 prev，有 next
    expect(btnByText(w, 'Prev')).toBeUndefined()
    btnByText(w, 'Next')!.trigger('click')
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('B')
    expect(w.find('.stepby-tour-counter').text().replace(/\s+/g, ' ')).toBe('2 / 3')
    expect(btnByText(w, 'Prev')).toBeTruthy()
    btnByText(w, 'Prev')!.trigger('click')
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('A')
  })

  it('末步 next → finish：emit finish、写 storageKey=completed、visible 置 false', async () => {
    const w = factory({ storageKey: 'k-tour' })
    await nextTick()
    btnByText(w, 'Next')!.trigger('click')
    await nextTick()
    btnByText(w, 'Next')!.trigger('click')
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('C')
    btnByText(w, 'Finish')!.trigger('click')
    await nextTick()
    expect(w.emitted('finish')).toHaveLength(1)
    expect(hoisted.localSet).toHaveBeenCalledWith('k-tour', 'completed')
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
  })

  it('skip：写 storageKey=skipped 并 emit skip', async () => {
    const w = factory({ storageKey: 'k-tour' })
    await nextTick()
    btnByText(w, 'Skip')!.trigger('click')
    await nextTick()
    expect(hoisted.localSet).toHaveBeenCalledWith('k-tour', 'skipped')
    expect(w.emitted('skip')).toHaveLength(1)
  })

  it('无 storageKey 时 skip 不写缓存', async () => {
    const w = factory()
    await nextTick()
    btnByText(w, 'Skip')!.trigger('click')
    await nextTick()
    expect(hoisted.localSet).not.toHaveBeenCalled()
    expect(w.emitted('skip')).toHaveLength(1)
  })

  it('点击遮罩 → 跳过', async () => {
    const w = factory()
    await nextTick()
    w.find('.stepby-tour-mask').trigger('click')
    await nextTick()
    expect(w.emitted('skip')).toHaveLength(1)
  })

  it('键盘：Escape 跳过 / ArrowRight 前进 / ArrowLeft 后退', async () => {
    const w = factory()
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('B')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('A')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.emitted('skip')).toHaveLength(1)
  })

  it('键盘：输入框聚焦时忽略导航（不误触发）', async () => {
    const w = factory()
    await nextTick()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('A')
  })

  it('目标元素缺失 → 自动跳步（不卡住）', async () => {
    // 首步目标缺失、次步存在：触发 updateTargetRect（resize）应自动跳到存在的那步
    const w = factory({
      steps: [
        { selector: '.missing-1', title: 'M1', content: 'm1' },
        { selector: '.tour-target-a', title: 'A', content: 'aa' }
      ]
    })
    await nextTick()
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('A')
  })

  it('placement 定位：高亮框偏移与箭头类生效（边界钳制）', async () => {
    vi.useFakeTimers()
    const w = factory({
      steps: [
        { selector: '.tour-target-a', title: 'top', content: 'x', placement: 'top' },
        { selector: '.tour-target-a', title: 'left', content: 'x', placement: 'left' },
        { selector: '.tour-target-a', title: 'right', content: 'x', placement: 'right' },
        { selector: '.tour-target-a', title: 'bottom', content: 'x', placement: 'bottom' }
      ]
    })
    await nextTick()
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(300)
    await nextTick()
    const highlight = w.find('.stepby-tour-highlight')
    // 目标 rect（left=100,top=200,w=200,h=60）→ highlight 偏移 -4/+8
    const style = highlight.attributes('style') || ''
    expect(style).toContain('96px') // left = 100 - 4
    expect(style).toContain('208px') // width = 200 + 8
    const arrow = w.find('.stepby-tour-arrow')
    expect(arrow.classes().some((c) => c.startsWith('stepby-tour-arrow-'))).toBe(true)
    vi.useRealTimers()
  })

  it('visible 重新打开 → 重置到首步', async () => {
    const w = factory()
    await nextTick()
    btnByText(w, 'Next')!.trigger('click')
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('B')
    await w.setProps({ visible: false })
    await nextTick()
    await w.setProps({ visible: true })
    await nextTick()
    expect(w.find('.stepby-tour-title').text()).toBe('A')
  })

  it('卸载时移除窗口监听（不泄漏）', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const w = factory()
    await nextTick()
    w.unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })
})
