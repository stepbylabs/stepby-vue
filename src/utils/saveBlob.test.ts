/**
 * 保存通道回归锁（b112）
 *
 * 钉住四件事：
 * 1. `false` 只出现在"确实没交出去"的分支（非 Blob / 0 字节 / 空文件名 / 通道抛错），
 *    且这四种情况**都不得**调用 `saveAs`——"交了个空文件"与"没交"在用户侧同形，
 *    但在判据里必须可分；
 * 2. `true` 只代表交给了通道，**不代表落盘**（模块文档的语义由这里的行为兜住：
 *    函数在 `saveAs` 返回后立刻 `return true`，中间不掺任何"落盘确认"的假象）；
 * 3. `saveDataUrl` 必须真的把 base64 解成字节（用 PNG 头做正控），解码失败返回 `false`
 *    而不是把畸形串交给下载通道；
 * 4. 参数原样透传：文件名不得被改名/加前缀（用户拿到什么名字是契约）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({ saveAs: vi.fn() }))
vi.mock('file-saver', () => ({ saveAs: (...a: unknown[]) => hoisted.saveAs(...a) }))

import { saveBlob, saveDataUrl } from './saveBlob'

/** 1×1 透明 PNG（89 50 4E 47 …），base64 与字节都能拿来做正控 */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

const blobOf = (body: string, type = 'text/plain'): Blob => new Blob([body], { type })

beforeEach(() => {
  hoisted.saveAs.mockReset()
  hoisted.saveAs.mockImplementation(() => {})
})

afterEach(() => {
  hoisted.saveAs.mockReset()
})

describe('saveBlob 的正常路径', () => {
  it('非空 Blob + 正常文件名 ⇒ 原样交给 saveAs 并返回 true', () => {
    const blob = blobOf('a,b\r\n1,2\r\n', 'text/csv')
    expect(saveBlob(blob, 'audit_1.csv')).toBe(true)
    expect(hoisted.saveAs).toHaveBeenCalledTimes(1)
    const [passedBlob, passedName] = hoisted.saveAs.mock.calls[0]
    expect(passedBlob).toBe(blob)
    expect(passedName).toBe('audit_1.csv')
    // 只传两个参数：第三个参数是 file-saver 的选项，任何调用方都没用过，
    // 多传会让"谁改了保存行为"这件事重新分散回调用点
    expect(hoisted.saveAs.mock.calls[0]).toHaveLength(2)
  })
})

describe('saveBlob 的失败分支：都不得调用 saveAs', () => {
  it('0 字节 Blob ⇒ false（0 字节文件必然打不开，交出去等于假成功）', () => {
    expect(saveBlob(new Blob([]), 'empty.xlsx')).toBe(false)
    expect(hoisted.saveAs).not.toHaveBeenCalled()
  })

  it('非 Blob / null / undefined ⇒ false', () => {
    expect(saveBlob(null, 'x.csv')).toBe(false)
    expect(saveBlob(undefined, 'x.csv')).toBe(false)
    expect(saveBlob('a,b' as unknown as Blob, 'x.csv')).toBe(false)
    expect(hoisted.saveAs).not.toHaveBeenCalled()
  })

  it('文件名为空 / 只有空白 ⇒ false', () => {
    expect(saveBlob(blobOf('x'), '')).toBe(false)
    expect(saveBlob(blobOf('x'), '   ')).toBe(false)
    expect(hoisted.saveAs).not.toHaveBeenCalled()
  })

  it('保存通道抛错 ⇒ false 且不把异常穿给调用方', () => {
    hoisted.saveAs.mockImplementation(() => {
      throw new Error('blocked by browser')
    })
    expect(() => saveBlob(blobOf('x'), 'x.csv')).not.toThrow()
    expect(saveBlob(blobOf('x'), 'x.csv')).toBe(false)
  })
})

describe('saveDataUrl：data URL 必须真的解成字节', () => {
  it('base64 PNG ⇒ 交给 saveAs 的 Blob 以 PNG 魔数开头，mime 取自 data URL', () => {
    const ok = saveDataUrl(`data:image/png;base64,${PNG_B64}`, 'chart-1.png')
    expect(ok).toBe(true)
    const [blob, name] = hoisted.saveAs.mock.calls[0] as [Blob, string]
    expect(name).toBe('chart-1.png')
    expect(blob.type).toBe('image/png')
    return blob.arrayBuffer().then((buf) => {
      expect(Array.from(new Uint8Array(buf).slice(0, 4))).toEqual(PNG_MAGIC)
      expect(new Uint8Array(buf).length).toBeGreaterThan(50)
    })
  })

  it('非 base64 的百分号编码同样支持（解出来是原文，mime 不是 image/*）', () => {
    const ok = saveDataUrl('data:text/plain,hello%20world', 'note.txt')
    expect(ok).toBe(true)
    const blob = hoisted.saveAs.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/plain')
    return blob.text().then((text) => expect(text).toBe('hello world'))
  })

  it('畸形输入 ⇒ false 且不碰 saveAs（不得把坏串交给下载通道）', () => {
    expect(saveDataUrl('', 'x.png')).toBe(false)
    expect(saveDataUrl('http://example.com/a.png', 'x.png')).toBe(false)
    expect(saveDataUrl('data:image/png;base64', 'x.png')).toBe(false)
    // 非法 base64 让 atob 抛：必须折算成 false，而不是穿透
    expect(saveDataUrl('data:image/png;base64,@@@@', 'x.png')).toBe(false)
    expect(hoisted.saveAs).not.toHaveBeenCalled()
  })

  it('解出来的 0 字节（data:,）⇒ 落到 saveBlob 的空载荷判断，返回 false', () => {
    expect(saveDataUrl('data:text/plain,', 'empty.txt')).toBe(false)
    expect(hoisted.saveAs).not.toHaveBeenCalled()
  })
})
