/**
 * 键盘层单一实现的回归锁（b114）。
 *
 * 立的案（真机取证）：搜索框里按 `?` 弹出「键盘快捷键」模态框且字符丢失；`Alt+T` /
 * `Ctrl+Shift+D` 在输入框里改主题；输入法组合态 Enter 发出 3 次列表请求。
 *
 * 本文件钉三层：
 * 1. 可编辑目标判定（含 contenteditable 祖先、role=textbox、`contenteditable="false"` 反例）；
 * 2. 组合态判定（isComposing / keyCode 229）；
 * 3. 守卫本身：组合中/刚结束的 Enter、Escape 在输入面上被吞；在 body 上不吞；
 *    非组合输入不吞；卸载后不再吞。
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  EDITABLE_SELECTOR,
  installImeKeyGuard,
  isEditableElement,
  isEditableTarget,
  isImeComposing,
  shouldIgnoreGlobalHotkey
} from './keyboard'

function el(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  document.body.innerHTML = ''
})

function keyup(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }))
}

describe('utils/keyboard（b114）', () => {
  it('判可编辑目标：input/textarea/select/[contenteditable]/role=textbox 都算，按钮不算', () => {
    const host = el(`
      <input id="i" />
      <textarea id="t"></textarea>
      <select id="s"></select>
      <div id="ce" contenteditable="true"><span id="ce-child">x</span></div>
      <div id="ce-off" contenteditable="false"><span id="ce-off-child">x</span></div>
      <div id="tb" role="textbox"></div>
      <button id="btn">b</button>
      <div id="plain"><span id="plain-child">x</span></div>
    `)
    const q = (id: string) => host.querySelector(`#${id}`)!
    expect(isEditableElement(q('i'))).toBe(true)
    expect(isEditableElement(q('t'))).toBe(true)
    expect(isEditableElement(q('s'))).toBe(true)
    expect(isEditableElement(q('ce'))).toBe(true)
    expect(isEditableElement(q('ce-child')), 'contenteditable 祖先必须算').toBe(true)
    expect(isEditableElement(q('tb'))).toBe(true)
    expect(isEditableElement(q('ce-off')), 'contenteditable="false" 不算').toBe(false)
    expect(isEditableElement(q('ce-off-child'))).toBe(false)
    expect(isEditableElement(q('btn'))).toBe(false)
    expect(isEditableElement(q('plain-child'))).toBe(false)
    expect(isEditableElement(null)).toBe(false)
    expect(EDITABLE_SELECTOR).toContain('[contenteditable]')
  })

  it('isEditableTarget 对非元素目标（window/document）返回 false，不抛错', () => {
    expect(isEditableTarget(window)).toBe(false)
    expect(isEditableTarget(document)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
    const host = el('<input id="i" />')
    expect(isEditableTarget(host.querySelector('#i'))).toBe(true)
  })

  it('isImeComposing：isComposing 与 keyCode 229 都算，普通按键不算', () => {
    expect(isImeComposing({ isComposing: true })).toBe(true)
    expect(isImeComposing({ keyCode: 229 })).toBe(true)
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false)
    expect(isImeComposing({})).toBe(false)
  })

  it('shouldIgnoreGlobalHotkey：事件目标或当前焦点任一落在输入面就抑制', () => {
    const host = el('<input id="i" /><button id="b">b</button>')
    const input = host.querySelector('#i')!
    const btn = host.querySelector('#b')!
    expect(shouldIgnoreGlobalHotkey(input, btn)).toBe(true)
    expect(shouldIgnoreGlobalHotkey(btn, input)).toBe(true)
    expect(shouldIgnoreGlobalHotkey(btn, btn)).toBe(false)
    expect(shouldIgnoreGlobalHotkey(null, null)).toBe(false)
  })

  it('守卫：组合进行中的 Enter/Escape keyup 在输入面上被吞，body 上照常', () => {
    const stop = installImeKeyGuard(document, window)
    cleanups.push(stop)
    const host = el('<input id="i" /><textarea id="t"></textarea>')
    const input = host.querySelector('#i')!
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    let reached = 0
    const listener = () => {
      reached += 1
    }
    input.addEventListener('keyup', listener)
    document.body.addEventListener('keyup', listener)

    keyup(input, 'Enter')
    keyup(input, 'Escape')
    expect(reached, '组合态里输入面上的 Enter/Escape 不得到达任何组件处理器').toBe(0)

    keyup(document.body, 'Enter')
    expect(reached, '非输入面的 Enter 不属于输入法，必须照常放行').toBe(1)
  })

  it('守卫：compositionend 之后紧跟的那次 Enter（Chrome 里 isComposing 已为 false）也被吞', () => {
    const stop = installImeKeyGuard(document, window)
    cleanups.push(stop)
    const host = el('<input id="i" />')
    const input = host.querySelector('#i')!
    let reached = 0
    input.addEventListener('keyup', () => {
      reached += 1
    })

    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    // 上屏回车的 keyup：真实浏览器里 isComposing=false，靠尾窗抑制
    keyup(input, 'Enter')
    expect(reached, '上屏那一次 Enter 不得触发查询').toBe(0)
  })

  it('守卫：无组合态的普通 Enter/Escape 不被吞（守卫不得退化成"吞掉所有按键"）', () => {
    const stop = installImeKeyGuard(document, window)
    cleanups.push(stop)
    const host = el('<input id="i" />')
    const input = host.querySelector('#i')!
    const seen: string[] = []
    input.addEventListener('keyup', (e) => {
      seen.push((e as KeyboardEvent).key)
    })
    keyup(input, 'Enter')
    keyup(input, 'Escape')
    keyup(input, 'a')
    expect(seen).toEqual(['Enter', 'Escape', 'a'])
  })

  it('守卫：元素在组合中失焦（浏览器不补 compositionend）后不得永久吞键', () => {
    const stop = installImeKeyGuard(document, window)
    cleanups.push(stop)
    const host = el('<input id="i" /><input id="j" />')
    const input = host.querySelector('#i')!
    const other = host.querySelector('#j')!
    let reached = 0
    other.addEventListener('keyup', () => {
      reached += 1
    })
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    keyup(other, 'Enter')
    expect(reached).toBe(1)
  })

  it('守卫：卸载后不再拦截（单测之间不得互相污染）', () => {
    const stop = installImeKeyGuard(document, window)
    const host = el('<input id="i" />')
    const input = host.querySelector('#i')!
    let reached = 0
    input.addEventListener('keyup', () => {
      reached += 1
    })
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    keyup(input, 'Enter')
    expect(reached).toBe(0)
    stop()
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    keyup(input, 'Enter')
    expect(reached).toBe(1)
  })

  it('keydown 层：组合态的 Esc（取消候选）不得到达 document 级处理器，也不得 preventDefault', () => {
    const stop = installImeKeyGuard(document, window)
    cleanups.push(stop)
    const host = el('<input id="i" />')
    const input = host.querySelector('#i')!
    let docReached = 0
    const docListener = () => {
      docReached += 1
    }
    // Element Plus 的对话框就把"关自己"挂在 document 级 keydown 上
    document.addEventListener('keydown', docListener)
    cleanups.push(() => document.removeEventListener('keydown', docListener))

    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    input.dispatchEvent(ev)
    expect(docReached, '组合态 Esc 会关掉对话框/抽屉，必须拦在 document 之前').toBe(0)
    expect(ev.defaultPrevented, '不得 preventDefault——否则输入法收不到取消，候选词无法取消').toBe(false)
  })

  it('keydown 层：普通 Esc 与 body 上的 Esc 不得被拦（守卫不得退化成"吞掉所有 Esc"）', () => {
    const stop = installImeKeyGuard(document, window)
    cleanups.push(stop)
    const host = el('<input id="i" />')
    const input = host.querySelector('#i')!
    const seen: string[] = []
    const docListener = (e: KeyboardEvent) => {
      seen.push(`${(e.target as HTMLElement).id || 'body'}:${e.key}`)
    }
    document.addEventListener('keydown', docListener)
    cleanups.push(() => document.removeEventListener('keydown', docListener))

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(seen).toEqual(['i:Escape', 'body:Escape'])
  })

  it('keydown 层：组合结束后的 Esc 不得被尾窗吞掉（尾窗只描述同一次 keyup）', () => {
    const stop = installImeKeyGuard(document, window)
    cleanups.push(stop)
    const host = el('<input id="i" />')
    const input = host.querySelector('#i')!
    let docReached = 0
    const docListener = () => {
      docReached += 1
    }
    document.addEventListener('keydown', docListener)
    cleanups.push(() => document.removeEventListener('keydown', docListener))

    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(docReached, '用户取消组合后紧接着按 Esc 关对话框，必须照常生效').toBe(1)
  })
})
