/**
 * v-copyText 复制文本内容
 * Copyright (c) 2026 Stepby
 */
interface CopyHTMLElement extends HTMLElement {
  $copyValue?: string
  $copyCallback?: (value: string) => void
  $destroyCopy?: () => void
}

export default {
  beforeMount(el: HTMLElement, { value, arg }: DirectiveBinding) {
    const copyEl = el as CopyHTMLElement
    if (arg === 'callback') {
      copyEl.$copyCallback = value as (v: string) => void
    } else {
      copyEl.$copyValue = value as string
      const handler = () => {
        copyTextToClipboard(copyEl.$copyValue || '')
        if (copyEl.$copyCallback) {
          copyEl.$copyCallback(copyEl.$copyValue || '')
        }
      }
      el.addEventListener('click', handler)
      copyEl.$destroyCopy = () => el.removeEventListener('click', handler)
    }
  },
  // P2 修复: 添加 unmounted 钩子，元素卸载时清理 click 监听器，避免内存泄漏
  unmounted(el: HTMLElement) {
    const copyEl = el as CopyHTMLElement
    if (copyEl.$destroyCopy) {
      copyEl.$destroyCopy()
      copyEl.$destroyCopy = undefined
    }
  }
}

function copyTextToClipboard(input: string, { target = document.body }: { target?: HTMLElement } = {}): boolean {
  const element = document.createElement('textarea')
  const previouslyFocusedElement = document.activeElement as HTMLElement

  element.value = input

  // Prevent keyboard from showing on mobile
  element.setAttribute('readonly', '')

  element.style.contain = 'strict'
  element.style.position = 'absolute'
  element.style.left = '-9999px'
  element.style.fontSize = '12pt' // Prevent zooming on iOS

  const selection = document.getSelection()
  const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  target.append(element)
  element.select()

  // Explicit selection workaround for iOS
  element.selectionStart = 0
  element.selectionEnd = input.length

  let isSuccess = false
  try {
    isSuccess = document.execCommand('copy')
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Clipboard copy failed:', e)
  }

  element.remove()

  if (originalRange && selection) {
    selection.removeAllRanges()
    selection.addRange(originalRange)
  }

  // Get the focus back on the previously focused element, if any
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus()
  }

  return isSuccess
}
