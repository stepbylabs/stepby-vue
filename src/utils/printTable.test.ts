/**
 * 打印工具回归锁（b112）
 *
 * 立的案（真机探针取证）：本站 CSP 是 `script-src 'self'`，`window.open('', '_blank')` 写出的
 * 子文档继承 opener 的 CSP ⇒ 原先 HTML 里的内联 `<script>print()</script>` **从未执行**
 * （探针实测 `inlineRan=false`），打印实际只靠父窗口 1.5s 兜底；而兜底定时器在用户关掉第一个
 * 打印对话框后才触发 ⇒ 会第二次弹框。
 *
 * 本文件钉住修好后的形状：
 * 1. 子文档**不含**任何 `<script`（CSP 下是死代码，不得再写回去）；
 * 2. 父窗口**只发起一次** print()，且不留定时器（无 fake timers 也能确定性判定）；
 * 3. `window.open` 被拦 / 写文档抛错 / print 抛错 ⇒ 必须走 errorHub，且**不得**报成功；
 * 4. 标题与单元格仍经 HTML 转义（打印模板是 innerHTML 拼接面）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'

const hoisted = vi.hoisted(() => ({ report: vi.fn() }))

vi.mock('@/utils/errorHub', () => ({ errorHub: { report: (...a: unknown[]) => hoisted.report(...a) } }))
vi.mock('@/i18n', () => ({ default: { global: { t: (k: string) => k } } }))

import { printTable } from './printTable'

type FakeWindow = {
  opener: unknown
  document: { open: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  focus: ReturnType<typeof vi.fn>
  print: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fakePrintWindow(overrides: Partial<FakeWindow> = {}): FakeWindow {
  return {
    opener: {},
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
    ...overrides
  }
}

const baseOptions = {
  title: '用户列表',
  columns: [
    { label: '用户名', prop: 'userName' },
    { label: '手机号', prop: 'phone' }
  ],
  data: [{ userName: 'admin', phone: '13800138000' }]
}

let openSpy: ReturnType<typeof vi.spyOn>
let successSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  hoisted.report.mockClear()
  successSpy = vi.spyOn(ElMessage, 'success').mockImplementation((() => {}) as never)
})

afterEach(() => {
  openSpy?.mockRestore()
  successSpy.mockRestore()
})

function stubOpen(win: FakeWindow | null): void {
  openSpy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window | null)
}

describe('打印窗口的写入与打印', () => {
  it('写入内容、只 print 一次、报成功；子文档不得含内联脚本（CSP 下是死代码）', () => {
    const win = fakePrintWindow()
    stubOpen(win)
    printTable(baseOptions)

    expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=1024,height=768')
    expect(win.opener).toBeNull()
    expect(win.document.open).toHaveBeenCalledTimes(1)
    expect(win.document.close).toHaveBeenCalledTimes(1)
    const html = String(win.document.write.mock.calls[0][0])
    expect(html).toContain('<th>用户名</th>')
    expect(html).toContain('<td>admin</td>')
    expect(html).not.toContain('<script')
    expect(win.focus).toHaveBeenCalledTimes(1)
    expect(win.print).toHaveBeenCalledTimes(1)
    expect(successSpy).toHaveBeenCalledTimes(1)
    expect(hoisted.report).not.toHaveBeenCalled()
  })

  it('autoPrint=false ⇒ 不调用 print()，但窗口照常打开并报成功', () => {
    const win = fakePrintWindow()
    stubOpen(win)
    printTable({ ...baseOptions, autoPrint: false })
    expect(win.print).not.toHaveBeenCalled()
    expect(successSpy).toHaveBeenCalledTimes(1)
  })

  it('标题与单元格经过 HTML 转义（打印模板是 innerHTML 拼接面）', () => {
    const win = fakePrintWindow()
    stubOpen(win)
    printTable({
      title: '<img src=x onerror=alert(1)>',
      columns: [{ label: '<b>列</b>', prop: 'v' }],
      data: [{ v: '<script>alert(1)</script>' }]
    })
    const html = String(win.document.write.mock.calls[0][0])
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>列</b>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;b&gt;列&lt;/b&gt;')
  })
})

describe('失败分支必须可见且不得报成功', () => {
  it('window.open 返回 null（弹窗被拦）⇒ errorHub + 不报成功', () => {
    stubOpen(null)
    printTable(baseOptions)
    expect(hoisted.report).toHaveBeenCalledWith('error', 'other', 'printTable.printFail')
    expect(successSpy).not.toHaveBeenCalled()
  })

  it('写文档抛错 ⇒ errorHub + 关闭窗口 + 不 print、不报成功', () => {
    const win = fakePrintWindow()
    win.document.write.mockImplementation(() => {
      throw new Error('document closed')
    })
    stubOpen(win)
    printTable(baseOptions)
    expect(hoisted.report).toHaveBeenCalledWith('error', 'other', 'printTable.printFail')
    expect(win.close).toHaveBeenCalledTimes(1)
    expect(win.print).not.toHaveBeenCalled()
    expect(successSpy).not.toHaveBeenCalled()
  })

  it('print() 抛错 ⇒ errorHub + 不报成功（窗口留给用户手动打印）', () => {
    const win = fakePrintWindow()
    win.print.mockImplementation(() => {
      throw new Error('print blocked')
    })
    stubOpen(win)
    printTable(baseOptions)
    expect(hoisted.report).toHaveBeenCalledWith('error', 'other', 'printTable.printFail')
    expect(win.close).not.toHaveBeenCalled()
    expect(successSpy).not.toHaveBeenCalled()
  })

  it('无数据 ⇒ 只报 noData，不打开窗口', () => {
    const win = fakePrintWindow()
    stubOpen(win)
    printTable({ ...baseOptions, data: [] })
    expect(hoisted.report).toHaveBeenCalledWith('warning', 'other', 'printTable.noData')
    expect(openSpy).not.toHaveBeenCalled()
    expect(successSpy).not.toHaveBeenCalled()
  })
})
