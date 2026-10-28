/**
 * 日志查看页的"查询身份"与"陈旧快照"（b108）。
 *
 * 立的案：`onFileChange` 原先只调 `loadTail()`，不清旧行——换文件（或换级别/关键字）后新查询失败，
 * 屏上留下的是**另一个文件或另一组筛选**的日志，还挂着"陈旧"横幅，读日志的人会把上一份结果
 * 当成这一份的结论。本文件钉住：
 * ① 查询身份变化（applyFilter）必须先丢弃旧行/总数/截止时刻，再发请求；
 * ② 同一查询刷新失败 ⇒ 旧行保留、截止时刻不被覆盖（横幅才能说出"是几点的数据"）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  listLogFiles: vi.fn(),
  tailLogFile: vi.fn()
}))

vi.mock('@/api/monitor/logtail', () => ({
  listLogFiles: (...a: unknown[]) => hoisted.listLogFiles(...a),
  tailLogFile: (...a: unknown[]) => hoisted.tailLogFile(...a)
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import LogTail from './index.vue'

const stubs = {
  'el-card': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-input': { template: '<input />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-switch': { template: '<span />' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}</div>' },
  'list-empty': { template: '<div class="list-empty-stub" />' }
}

const globalOptions = { stubs, directives: { loading: {} } }

type Vm = {
  rows: Array<{ no: number }>
  total: number
  tailLastSuccessAt: number | null
  tailLoadError: boolean
  applyFilter: () => void
  loadTail: () => Promise<void>
  currentFile: string
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.listLogFiles.mockResolvedValue({
    data: { rows: [{ fileName: 'a.log', fileSizeStr: '1KB' }] }
  })
  hoisted.tailLogFile.mockResolvedValue({
    data: { total: 1, rows: [{ no: 1, level: 'INFO', text: 'hello' }] }
  })
})

describe('日志查看页：换查询必须丢弃上一份快照', () => {
  it('换文件后新查询失败 ⇒ 不得把上一个文件的行留在屏上', async () => {
    const w = mount(LogTail, { global: globalOptions })
    await flushPromises()
    const vm = w.vm as unknown as Vm
    expect(vm.rows.length).toBe(1)
    const loadedAt = vm.tailLastSuccessAt
    expect(loadedAt).not.toBeNull()

    const pending = deferred<unknown>()
    hoisted.tailLogFile.mockReturnValueOnce(pending.promise)
    vm.currentFile = 'b.log'
    vm.applyFilter()
    // 请求还没回来，旧文件的行与截止时刻就必须已经消失
    expect(vm.rows).toEqual([])
    expect(vm.total).toBe(0)
    expect(vm.tailLastSuccessAt).toBeNull()

    pending.reject(new Error('down'))
    await flushPromises()
    expect(vm.tailLoadError).toBe(true)
    expect(vm.rows).toEqual([])
  })

  it('同一查询刷新失败 ⇒ 行保留且截止时刻不被覆盖；刷新成功后前移', async () => {
    const w = mount(LogTail, { global: globalOptions })
    await flushPromises()
    const vm = w.vm as unknown as Vm
    const loadedAt = vm.tailLastSuccessAt
    expect(loadedAt).not.toBeNull()

    hoisted.tailLogFile.mockRejectedValueOnce(new Error('down'))
    await vm.loadTail()
    await flushPromises()
    expect(vm.rows.length).toBe(1)
    expect(vm.tailLoadError).toBe(true)
    expect(vm.tailLastSuccessAt).toBe(loadedAt)

    hoisted.tailLogFile.mockResolvedValueOnce({
      data: {
        total: 2,
        rows: [
          { no: 1, level: 'INFO', text: 'a' },
          { no: 2, level: 'WARN', text: 'b' }
        ]
      }
    })
    await vm.loadTail()
    await flushPromises()
    expect(vm.rows.length).toBe(2)
    expect(vm.tailLoadError).toBe(false)
    expect(vm.tailLastSuccessAt!).toBeGreaterThanOrEqual(loadedAt!)
  })
})
