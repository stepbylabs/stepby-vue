// src/components/IconSelect/index.virtual.test.ts
//
// R6-PERF-21 回归测试：IconSelect 图标列表虚拟滚动。
// 可证伪点（任一失效即说明虚拟化没生效或破坏了既有能力）：
//   ① 全量图标下真实渲染的 DOM 节点数远小于图标总数；
//   ② 过滤后仍能逐个命中任意图标（能力未被虚拟化破坏）；
//   ③ 滚动到底部可达列表末尾图标；
//   ④ 过滤结果多于一个窗口时节点数仍受限，但滚动高度反映全部结果。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import icons from './requireIcons'
import IconSelect from './index.vue'

const i18n = createI18n({ legacy: false, locale: 'en', global: { messages: {} } })

// 虚拟窗口上限：可见 8 行 + 上下各 2 行 overscan = 12 行 × 3 列 = 36
const MAX_RENDERED = 36

// 真实挂载 element-plus 会让 vitest worker 超时（项目既有测试一致做法：用轻量桩替换）。
// el-input 桩需同时 emit update:modelValue（v-model）与 input（@input="filterIcons"）。
function factory(props: Record<string, unknown> = {}) {
  return mount(IconSelect, {
    props: { activeIcon: '', ...props },
    global: {
      plugins: [i18n],
      stubs: {
        'svg-icon': true,
        'el-input': {
          props: ['modelValue'],
          emits: ['update:modelValue', 'input', 'clear'],
          template: `<input class="stub-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value); $emit('input', $event.target.value)" />`
        }
      }
    },
    attachTo: document.body
  })
}

function renderedNames(w: ReturnType<typeof factory>): string[] {
  return w.findAll('.icon-item-wrapper').map((n) => n.text())
}

describe('components/IconSelect 虚拟滚动（R6-PERF-21）', () => {
  it('全量图标下只渲染有限数量的 DOM 节点', () => {
    expect(icons.length).toBeGreaterThan(MAX_RENDERED) // 保证样本量足以证伪
    const w = factory()
    const rendered = renderedNames(w)
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThanOrEqual(MAX_RENDERED)
    expect(rendered.length).toBeLessThan(icons.length)
    expect(rendered[0]).toBe(icons[0])
    w.unmount()
  })

  it('滚动到底部可触达列表末尾图标（虚拟化不丢数据）', async () => {
    const w = factory()
    const list = w.find('.icon-list')
    // 给一个极大 scrollTop，组件内部会做上限收窄；能触达末尾即证明收窄逻辑正确
    Object.defineProperty(list.element, 'scrollTop', { value: 1_000_000, configurable: true })
    await list.trigger('scroll')
    const rendered = renderedNames(w)
    expect(rendered).toContain(icons[icons.length - 1])
    expect(rendered.length).toBeLessThanOrEqual(MAX_RENDERED)
    w.unmount()
  })

  it('过滤：任意图标都能被逐个命中', async () => {
    const w = factory()
    const input = w.find('input.stub-input')
    for (const name of icons) {
      await input.setValue(name)
      expect(renderedNames(w)).toContain(name)
    }
    w.unmount()
  })

  it('过滤结果多于一个窗口时：节点数仍受限，滚动高度反映全部结果', async () => {
    const term = 'e'
    const matched = icons.filter((i) => i.indexOf(term) !== -1)
    expect(matched.length).toBeGreaterThan(MAX_RENDERED) // 保证样本量足以证伪
    const w = factory()
    await w.find('input.stub-input').setValue(term)
    const rendered = renderedNames(w)
    expect(rendered.length).toBeLessThanOrEqual(MAX_RENDERED)
    expect(rendered.length).toBeLessThan(matched.length)
    const container = w.find('.list-container').element as HTMLElement
    expect(container.style.height).toBe(`${Math.ceil(matched.length / 3) * 25}px`)
    w.unmount()
  })

  it('交互契约不变：回车 emit selected，activeIcon 高亮保留', async () => {
    const target = icons[1]
    const w = factory({ activeIcon: target })
    const active = w.find('.icon-item.active')
    expect(active.exists()).toBe(true)
    expect(active.text()).toBe(target)

    await w.findAll('.icon-item-wrapper')[0].trigger('keydown.enter')
    expect(w.emitted('selected')?.at(-1)).toEqual([icons[0]])
    w.unmount()
  })
})