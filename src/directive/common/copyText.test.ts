/**
 * `v-copyText` 指令单测（b111）
 *
 * 指令是"复制按钮"的唯一入口（`gen/preview` 与 `totp` 两页在用），它的两个历史缺陷都很静默：
 * ① 回调签名只有 value、没有 ok —— 调用方**只能**报成功，`execCommand` 失败也照样弹"复制成功"；
 * ② 没有 `updated` 钩子 —— 绑定值变了仍复制挂载那一刻的旧值
 *    （实证：代码生成预览页切换语言页签后，复制的还是上一个文件的内容）。
 *
 * 这里把剪贴板通道 mock 掉，只锁指令自己的契约：传下去的是**当前值**、回调拿到**真实结果**、
 * 没有回调时失败必须可见（`common.copyFail`）、卸载后点击不再触发写入。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'

const mocks = vi.hoisted(() => ({ copy: vi.fn<(text: string) => Promise<boolean>>() }))

vi.mock('@/utils/clipboard', () => ({ copyText: mocks.copy }))
vi.mock('@/i18n', () => ({
  default: { global: { t: (key: string) => `T:${key}` } }
}))

import copyText from './copyText'

type Hook = (el: HTMLElement, binding: unknown) => void

const beforeMount = copyText.beforeMount as unknown as Hook
const updated = copyText.updated as unknown as Hook
const unmounted = copyText.unmounted as unknown as (el: HTMLElement) => void

function binding(value: unknown, arg?: string) {
  return { value, arg }
}

function makeButton(): HTMLButtonElement {
  const el = document.createElement('button')
  document.body.appendChild(el)
  return el
}

async function click(el: HTMLElement): Promise<void> {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  // 处理器是 async：让出两个微任务，等 copy() 的 Promise 与后续分支落地
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  mocks.copy.mockReset()
  mocks.copy.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('① 回调拿到的是真实结果（假成功回归锁）', () => {
  it('复制成功 ⇒ onCopy(true, 当前值)', async () => {
    const onCopy = vi.fn()
    const el = makeButton()
    beforeMount(el, binding('secret-1'))
    beforeMount(el, binding(onCopy, 'callback'))

    await click(el)

    expect(mocks.copy).toHaveBeenCalledWith('secret-1')
    expect(onCopy).toHaveBeenCalledWith(true, 'secret-1')
  })

  it('复制失败 ⇒ onCopy(false, 当前值)，不得报成功', async () => {
    mocks.copy.mockResolvedValue(false)
    const onCopy = vi.fn()
    const el = makeButton()
    beforeMount(el, binding('secret-1'))
    beforeMount(el, binding(onCopy, 'callback'))

    await click(el)

    expect(onCopy).toHaveBeenCalledWith(false, 'secret-1')
    expect(onCopy.mock.calls[0][0], '旧实现的回调只有 value，失败时调用方无从分支').toBe(false)
  })

  it('没有回调时，失败必须弹可见提示（静默失败与假成功同族）', async () => {
    mocks.copy.mockResolvedValue(false)
    const error = vi.spyOn(ElMessage, 'error')
    const el = makeButton()
    beforeMount(el, binding('secret-1'))

    await click(el)

    expect(error).toHaveBeenCalledWith('T:common.copyFail')
  })

  it('没有回调时，成功不得弹任何错误', async () => {
    const error = vi.spyOn(ElMessage, 'error')
    const el = makeButton()
    beforeMount(el, binding('secret-1'))

    await click(el)

    expect(error).not.toHaveBeenCalled()
  })
})

describe('② updated 跟住值（旧值回归锁）', () => {
  it('绑定值更新后，点击复制的是新值', async () => {
    const el = makeButton()
    beforeMount(el, binding('file-A'))
    updated(el, binding('file-B'))

    await click(el)

    expect(mocks.copy).toHaveBeenLastCalledWith('file-B')
  })

  it('updated 也能更新回调（否则回调会一直停在挂载时那个闭包）', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const el = makeButton()
    beforeMount(el, binding('v1'))
    beforeMount(el, binding(first, 'callback'))
    updated(el, binding(second, 'callback'))

    await click(el)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(true, 'v1')
  })

  it('null / undefined 归一成空串（复制空串由通道判失败）', async () => {
    mocks.copy.mockResolvedValue(false)
    const el = makeButton()
    beforeMount(el, binding('x'))
    updated(el, binding(null))

    await click(el)
    expect(mocks.copy).toHaveBeenLastCalledWith('')

    updated(el, binding(undefined))
    await click(el)
    expect(mocks.copy).toHaveBeenLastCalledWith('')
  })
})

describe('③ 生命周期', () => {
  it('unmounted 后点击不再触发写入（监听器必须真的解绑）', async () => {
    const el = makeButton()
    beforeMount(el, binding('v'))
    unmounted(el)

    await click(el)
    expect(mocks.copy).not.toHaveBeenCalled()
  })

  it('重复 unmounted 不抛错（指令重复卸载不是异常场景）', () => {
    const el = makeButton()
    beforeMount(el, binding('v'))
    expect(() => {
      unmounted(el)
      unmounted(el)
    }).not.toThrow()
  })

  it('只挂 callback 分支（没有值分支）时不安装监听器', async () => {
    const onCopy = vi.fn()
    const el = makeButton()
    beforeMount(el, binding(onCopy, 'callback'))

    await click(el)
    expect(mocks.copy).not.toHaveBeenCalled()
  })
})
