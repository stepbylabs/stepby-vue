import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { focusFirstError, isOutOfViewport, validateForm, VIEWPORT_MARGIN_PX } from '@/utils/formValidate'

const VIEWPORT = { width: 1024, height: 768 }

function rect(top: number, bottom: number, left = 100, right = 300) {
  return {
    top,
    bottom,
    left,
    right,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({})
  } as DOMRect
}

/** 造一个 `.el-form-item.is-error` 并把它挂在 `host` 里 */
function makeErrorItem(host: HTMLElement, inputId: string): HTMLElement {
  const item = document.createElement('div')
  item.className = 'el-form-item is-error'
  const input = document.createElement('input')
  input.id = inputId
  item.appendChild(input)
  host.appendChild(item)
  return item
}

describe('isOutOfViewport（纯函数）', () => {
  it('完全在视口内 ⇒ false；四边任一越界 ⇒ true', () => {
    expect(isOutOfViewport(rect(100, 140), VIEWPORT)).toBe(false)
    expect(isOutOfViewport(rect(-1, 40), VIEWPORT)).toBe(true) // 顶部越界
    expect(isOutOfViewport(rect(700, 800), VIEWPORT)).toBe(true) // 底部越界
    expect(isOutOfViewport(rect(100, 140, -20, 100), VIEWPORT)).toBe(true) // 左侧越界
    expect(isOutOfViewport(rect(100, 140, 900, 1100), VIEWPORT)).toBe(true) // 右侧越界
  })

  it('边界取"严格越界"：贴着余量不算，越过 1px 才算', () => {
    expect(isOutOfViewport(rect(VIEWPORT_MARGIN_PX, VIEWPORT.height - VIEWPORT_MARGIN_PX), VIEWPORT)).toBe(false)
    expect(isOutOfViewport(rect(VIEWPORT_MARGIN_PX - 1, VIEWPORT.height - VIEWPORT_MARGIN_PX), VIEWPORT)).toBe(true)
    expect(isOutOfViewport(rect(VIEWPORT_MARGIN_PX, VIEWPORT.height - VIEWPORT_MARGIN_PX + 1), VIEWPORT)).toBe(true)
  })

  it('视口尺寸取不到（0×0）⇒ 不判越界（不得基于假尺寸乱滚）', () => {
    expect(isOutOfViewport(rect(-500, -400), { width: 0, height: 0 })).toBe(false)
    expect(isOutOfViewport(rect(0, 10), { width: Number.NaN, height: 768 })).toBe(false)
  })
})

describe('focusFirstError', () => {
  let scrollSpy: ReturnType<typeof vi.fn>
  let originalScroll: typeof HTMLElement.prototype.scrollIntoView

  beforeEach(() => {
    originalScroll = HTMLElement.prototype.scrollIntoView
    scrollSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollSpy as unknown as typeof HTMLElement.prototype.scrollIntoView
    document.body.innerHTML = ''
  })

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScroll
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('已在视口内：聚焦但不滚动（看得见红字时页面不该跳）', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const item = makeErrorItem(form, 'in-view')
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(100, 140))

    expect(await focusFirstError({ $el: form })).toBe(item)
    expect(scrollSpy).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('in-view')
  })

  it('在视口外：滚动到视口中央并聚焦', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const item = makeErrorItem(form, 'far-away')
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(-400, -360))

    expect(await focusFirstError({ $el: form })).toBe(item)
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(document.activeElement?.id).toBe('far-away')
  })

  it('作用域优先：多个对话框叠着时不得跳到另一个表单的错误字段', async () => {
    // 文档顺序上"别人的错误"在前——不限定作用域就会聚焦到它
    const otherForm = document.createElement('form')
    makeErrorItem(otherForm, 'other-dialog')
    document.body.appendChild(otherForm)
    const form = document.createElement('form')
    const mine = makeErrorItem(form, 'my-dialog')
    document.body.appendChild(form)
    vi.spyOn(mine, 'getBoundingClientRect').mockReturnValue(rect(100, 140))

    expect(await focusFirstError({ $el: form })).toBe(mine)
    expect(document.activeElement?.id).toBe('my-dialog')
  })

  it('优先聚焦可编辑控件：更靠前的 div[tabindex] 不得抢走焦点', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const item = document.createElement('div')
    item.className = 'el-form-item is-error'
    item.innerHTML = '<div tabindex="0" id="wrapper">wrap</div><input id="real-field" />'
    form.appendChild(item)
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(100, 140))

    expect(await focusFirstError({ $el: form })).toBe(item)
    expect(document.activeElement?.id).toBe('real-field')
  })

  it('没有可编辑控件时回落到 [tabindex] 容器（复合控件仍能被定位）', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const item = document.createElement('div')
    item.className = 'el-form-item is-error'
    item.innerHTML = '<div tabindex="0" id="composite"><span>伪下拉</span></div>'
    form.appendChild(item)
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(100, 140))

    await focusFirstError({ $el: form })
    expect(document.activeElement?.id).toBe('composite')
  })

  it('没有错误字段：返回 null、不滚动、不改焦点', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    expect(await focusFirstError({ $el: form })).toBeNull()
    expect(scrollSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('scope.$el 不是元素（未挂载）时回落到 document，而不是静默什么都不做', async () => {
    const item = makeErrorItem(document.body, 'doc-level')
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(100, 140))
    expect(await focusFirstError({ $el: undefined })).toBe(item)
    expect(document.activeElement?.id).toBe('doc-level')
  })
})

describe('validateForm 与定位接线', () => {
  let scrollSpy: ReturnType<typeof vi.fn>
  let originalScroll: typeof HTMLElement.prototype.scrollIntoView

  beforeEach(() => {
    originalScroll = HTMLElement.prototype.scrollIntoView
    scrollSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollSpy as unknown as typeof HTMLElement.prototype.scrollIntoView
    document.body.innerHTML = ''
  })

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScroll
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('校验失败：返回 false 且把该表单的第一个错误字段滚进视口并聚焦', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const item = makeErrorItem(form, 'rejected-field')
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(rect(-400, -360))
    const validate = vi.fn(() => Promise.reject({ title: ['标题不能为空'] }))

    expect(await validateForm({ validate, $el: form } as never)).toBe(false)
    expect(validate).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(document.activeElement?.id).toBe('rejected-field')
  })

  it('校验通过：返回 true，不滚动、不抢焦点', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    makeErrorItem(form, 'should-not-focus')
    const validate = vi.fn(() => Promise.resolve(true))

    expect(await validateForm({ validate, $el: form } as never)).toBe(true)
    expect(scrollSpy).not.toHaveBeenCalled()
    expect(document.activeElement).not.toHaveProperty('id', 'should-not-focus')
  })

  it('表单未挂载：返回 false 且不触碰 DOM', async () => {
    expect(await validateForm(null)).toBe(false)
    expect(await validateForm(undefined)).toBe(false)
    expect(scrollSpy).not.toHaveBeenCalled()
  })
})
