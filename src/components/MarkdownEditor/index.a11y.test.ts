// src/components/MarkdownEditor/index.a11y.test.ts
// U4（第十八批后续）：Markdown 编辑器的**键盘／读屏可达性**回归锁。
//
// 真实取证（jsdom 挂载真实组件）：
//   · md-editor-v3 已为工具栏按钮写好**本地化** aria-label + title（上游已达标，本测试锁住不回退）；
//   · 但其输入区（CodeMirror 的 `.cm-content`，`role="textbox"`）**没有可访问名称**，
//     根容器 `.md-editor` 也没有区域名称 ⇒ 本组件在 onMounted 后补齐（见 index.vue 的 applyA11y）。
//
// 可证伪：若移除 index.vue 里的 applyA11y 注入，`aria-label` 断言立即变红。
// 注意：jsdom 下 CodeMirror 偶尔打印 `getClientRects is not a function` 的 stderr（其自身测量逻辑），
// 与本测试断言无关，不影响通过。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MarkdownEditor from './index.vue'

async function mountEditor() {
  setActivePinia(createPinia())
  const wrapper = mount(MarkdownEditor, {
    props: { modelValue: '# hello' },
    attachTo: document.body
  })
  // 等 onMounted → nextTick 的注入完成
  await new Promise((r) => setTimeout(r, 50))
  return wrapper
}

describe('MarkdownEditor 键盘可达性（U4）', () => {
  it('输入区有 role=textbox + aria-multiline + 非空可访问名称', async () => {
    const wrapper = await mountEditor()
    try {
      const root = wrapper.element as HTMLElement
      const area = root.querySelector('[role="textbox"]')
      expect(area, '输入区应带 role="textbox"（CodeMirror 提供）').toBeTruthy()
      expect(area?.getAttribute('aria-multiline')).toBe('true')
      const label = area?.getAttribute('aria-label') ?? ''
      expect(label.length, '输入区必须有非空可访问名称（本组件注入）').toBeGreaterThan(0)
    } finally {
      wrapper.unmount()
    }
  })

  it('根容器是带名称的 group（读屏可定位到"Markdown 编辑器"区域）', async () => {
    const wrapper = await mountEditor()
    try {
      const root = wrapper.element as HTMLElement
      expect(root.getAttribute('role')).toBe('group')
      const label = root.getAttribute('aria-label') ?? ''
      expect(label.length, '根容器必须有非空区域名称').toBeGreaterThan(0)
      expect(label).toContain('Markdown')
    } finally {
      wrapper.unmount()
    }
  })

  it('工具栏按钮均有非空可访问名称（上游 md-editor-v3 提供，防回退）', async () => {
    const wrapper = await mountEditor()
    try {
      const root = wrapper.element as HTMLElement
      const buttons = Array.from(root.querySelectorAll('button'))
      expect(buttons.length, '应渲染出工具栏按钮').toBeGreaterThan(0)
      const unnamed = buttons
        .filter((b) => !(b.getAttribute('aria-label') || '').trim() && !(b.textContent || '').trim())
        .map((b) => b.className)
      expect(unnamed, `存在无可访问名称的按钮: ${unnamed.join(', ')}`).toEqual([])
    } finally {
      wrapper.unmount()
    }
  })
})
