import { describe, it, expect } from 'vitest'
import { useWidgetLoad } from './useWidgetLoad'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('useWidgetLoad（看板小组件取数状态）', () => {
  it('成功：写入数据、loaded 置真、loadError 清除、loading 复位', async () => {
    const w = useWidgetLoad<number>(async () => 7, 0)
    await w.load()
    expect(w.data.value).toBe(7)
    expect(w.loaded.value).toBe(true)
    expect(w.loadError.value).toBe(false)
    expect(w.loading.value).toBe(false)
  })

  it('首次失败：loadError 置真、loaded 仍假、数据保持初始值、load 不抛', async () => {
    const w = useWidgetLoad<string[]>(async () => {
      throw new Error('down')
    }, ['seed'])
    await expect(w.load()).resolves.toBeUndefined()
    expect(w.loadError.value).toBe(true)
    expect(w.loaded.value).toBe(false)
    expect(w.data.value).toEqual(['seed'])
    expect(w.loading.value).toBe(false)
    expect(w.lastSuccessAt.value).toBeNull()
  })

  it('lastSuccessAt：只在成功时写入；失败不清空（陈旧横幅才能说出截止时刻），重试后前移', async () => {
    let ok = true
    let value = 1
    const w = useWidgetLoad<number>(async () => {
      if (!ok) throw new Error('down')
      return value
    }, 0)
    expect(w.lastSuccessAt.value).toBeNull()
    const before = Date.now()
    await w.load()
    expect(w.lastSuccessAt.value).not.toBeNull()
    expect(w.lastSuccessAt.value!).toBeGreaterThanOrEqual(before)
    const first = w.lastSuccessAt.value

    ok = false
    await w.load()
    expect(w.lastSuccessAt.value).toBe(first)

    ok = true
    value = 2
    await w.load()
    expect(w.data.value).toBe(2)
    expect(w.lastSuccessAt.value!).toBeGreaterThanOrEqual(first!)
  })

  it('成功后再失败：保留上一次数据并标注失败（loaded 仍真）', async () => {
    let ok = true
    const w = useWidgetLoad<number>(async () => {
      if (!ok) throw new Error('down')
      return 3
    }, 0)
    await w.load()
    ok = false
    await w.load()
    expect(w.data.value).toBe(3)
    expect(w.loaded.value).toBe(true)
    expect(w.loadError.value).toBe(true)
  })

  it('重试成功：loadError 清除、数据更新（不得一次失败就永久锁死）', async () => {
    let ok = false
    const w = useWidgetLoad<number>(async () => {
      if (!ok) throw new Error('down')
      return 9
    }, 0)
    await w.load()
    expect(w.loadError.value).toBe(true)
    ok = true
    await w.load()
    expect(w.loadError.value).toBe(false)
    expect(w.data.value).toBe(9)
    expect(w.loaded.value).toBe(true)
  })

  it('并发：后发请求先回时，先发请求的迟到响应不得覆盖（且迟到方不改 loading/error）', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    const queue = [first, second]
    const w = useWidgetLoad<number>(() => queue.shift()!.promise, 0)
    const p1 = w.load()
    const p2 = w.load()
    second.resolve(2)
    await p2
    expect(w.data.value).toBe(2)
    expect(w.loading.value).toBe(false)
    first.resolve(1)
    await p1
    expect(w.data.value).toBe(2)
    expect(w.loaded.value).toBe(true)
  })

  it('并发：先发的失败若已被后发取代，不得把 loadError 置真', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    const queue = [first, second]
    const w = useWidgetLoad<number>(() => queue.shift()!.promise, 0)
    const p1 = w.load()
    const p2 = w.load()
    second.resolve(5)
    await p2
    first.reject(new Error('late failure'))
    await p1
    expect(w.loadError.value).toBe(false)
    expect(w.data.value).toBe(5)
    await flush()
    expect(w.loading.value).toBe(false)
  })
})
