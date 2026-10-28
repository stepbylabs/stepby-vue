/**
 * `utils/clipboard` 单测（b111）
 *
 * 这个模块是**全仓唯一的剪贴板写入点**，所以它自己必须把三件事钉死：
 * ① 现代 API 可用时走它、不可用/被拒时**真的**走降级通道（而不是直接报失败或抛错）；
 * ② 返回值是**真实结果**——`execCommand` 返回 `false`、抛异常、两通道都不可用一律折算成 `false`，
 *    调用方据此提示（改造前有三处忽略这个布尔值，剪贴板没写进去也弹"复制成功"）；
 * ③ 降级通道不留垃圾：textarea 必须移除、焦点必须还原到原元素（否则键盘焦点落在隐藏节点上）。
 *
 * jsdom 既不实现 `navigator.clipboard` 也不实现 `document.execCommand`，所以每个用例显式安装
 * 它要测的那一侧——"两边都测到"由用例集合保证，而不是碰运气由环境决定。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')

function installClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true })
}

function installExecCommand(value: unknown): void {
  Object.defineProperty(document, 'execCommand', { value, configurable: true, writable: true })
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand)
  else Reflect.deleteProperty(document, 'execCommand')
  vi.restoreAllMocks()
  document.querySelectorAll('textarea').forEach((el) => el.remove())
  document.body.innerHTML = ''
})

describe('① 现代 API 通道', () => {
  it('writeText 成功 ⇒ 返回 true，且不触碰降级通道', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const exec = vi.fn(() => true)
    installClipboard({ writeText })
    installExecCommand(exec)

    await expect(copyText('hello')).resolves.toBe(true)
    // 原样传入：不做 trim、不改写内容（复制链接/密钥时任何一个字符都不能动）
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(exec, '现代 API 成功时不得再走降级通道').not.toHaveBeenCalled()
  })

  it('Promise 被拒（权限被拒 / 非安全上下文）⇒ 换降级通道重试', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const exec = vi.fn(() => true)
    installClipboard({ writeText })
    installExecCommand(exec)

    await expect(copyText('x')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(exec, '现代 API 失败后必须真的试一次降级').toHaveBeenCalledTimes(1)
  })

  it('writeText 同步抛错（部分浏览器在非安全上下文如此）⇒ 也不得把异常逸出', async () => {
    installClipboard({
      writeText: () => {
        throw new Error('boom')
      }
    })
    const exec = vi.fn(() => true)
    installExecCommand(exec)

    await expect(copyText('x')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('clipboard 存在但没有 writeText（形状残缺）⇒ 直接降级，不抛 TypeError', async () => {
    installClipboard({})
    const exec = vi.fn(() => true)
    installExecCommand(exec)

    await expect(copyText('x')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledTimes(1)
  })
})

describe('② 降级通道：结果必须是真的', () => {
  it('现代 API 不可用 + execCommand 返回 true ⇒ true', async () => {
    installClipboard(undefined)
    installExecCommand(vi.fn(() => true))
    await expect(copyText('fallback')).resolves.toBe(true)
  })

  it.each<[string, unknown]>([
    ['返回 false', () => false],
    ['返回 undefined', () => undefined],
    ['返回非布尔真值', () => 1]
  ])('execCommand %s ⇒ false（不得把"非 false"当成功）', async (_name, impl) => {
    installClipboard(undefined)
    installExecCommand(impl)
    await expect(copyText('x')).resolves.toBe(false)
  })

  it('execCommand 抛错 ⇒ false 且不 reject', async () => {
    installClipboard(undefined)
    installExecCommand(() => {
      throw new Error('not supported')
    })
    await expect(copyText('x')).resolves.toBe(false)
  })

  it('execCommand 不存在 ⇒ false', async () => {
    installClipboard(undefined)
    installExecCommand(undefined)
    await expect(copyText('x')).resolves.toBe(false)
  })

  it('焦点回到复制前聚焦的元素，且 textarea 不残留', async () => {
    installClipboard(undefined)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    let seen: { value: string; readonly: boolean; count: number } | null = null
    installExecCommand(() => {
      const ta = document.querySelector('textarea')
      seen = {
        value: ta?.value ?? '<missing>',
        readonly: ta?.hasAttribute('readonly') ?? false,
        count: document.querySelectorAll('textarea').length
      }
      return true
    })

    await expect(copyText('copy me')).resolves.toBe(true)
    expect(seen).toEqual({ value: 'copy me', readonly: true, count: 1 })
    expect(document.querySelectorAll('textarea'), '降级用的 textarea 必须被移除').toHaveLength(0)
    expect(document.activeElement, '键盘焦点必须还原').toBe(input)
  })
})

describe('③ 入参边界', () => {
  it.each<[string, unknown]>([
    ['空串', ''],
    ['null', null],
    ['undefined', undefined]
  ])('%s ⇒ false，且任何通道都不被调用', async (_name, value) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const exec = vi.fn(() => true)
    installClipboard({ writeText })
    installExecCommand(exec)

    await expect(copyText(value)).resolves.toBe(false)
    expect(writeText, '空文本不得写剪贴板（清空用户剪贴板）').not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
  })

  it('数字按字符串归一后复制（调用点传 id 也不能变成空）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard({ writeText })
    installExecCommand(vi.fn(() => true))

    await expect(copyText(12345)).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('12345')
  })
})
