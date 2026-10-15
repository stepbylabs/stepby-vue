import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// nprogress 为模块级单例，progress.ts 内部还有模块级 counter/safetyTimer 状态；
// 每个用例重置模块注册表并动态导入，保证用例间状态隔离。
const nprogressMock = vi.hoisted(() => ({
  start: vi.fn(),
  done: vi.fn(),
  configure: vi.fn()
}))
vi.doMock('nprogress', () => ({ default: nprogressMock }))

let progress: typeof import('./progress')

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  progress = await import('./progress')
})

afterEach(() => {
  vi.useRealTimers()
})

// 说明：hasPendingProgress 已随死代码清理移除，pending 状态改由可观测副作用断言——
// NProgress.done 未被调用 ⇔ 仍有 pending；start/done 调用次数即计数器状态的外显。
describe('utils/progress 顶部进度条状态机', () => {
  it('首次 startProgress 才真正 NProgress.start，并发调用不重复 start', () => {
    progress.startProgress()
    expect(nprogressMock.start).toHaveBeenCalledTimes(1)

    progress.startProgress()
    progress.startProgress()
    expect(nprogressMock.start).toHaveBeenCalledTimes(1)
    // 仍有 pending：done 未被调用
    expect(nprogressMock.done).not.toHaveBeenCalled()
  })

  it('并发计数：只有计数器归零才调用 done', () => {
    progress.startProgress()
    progress.startProgress()
    progress.doneProgress()
    // 仍有一个 pending，不能提前 done（避免进度条闪烁）
    expect(nprogressMock.done).not.toHaveBeenCalled()

    progress.doneProgress()
    expect(nprogressMock.done).toHaveBeenCalledTimes(1)
  })

  it('doneProgress 多于 startProgress 时计数器不出现负值', () => {
    progress.startProgress()
    progress.doneProgress()
    progress.doneProgress()
    progress.doneProgress()
    expect(nprogressMock.done).toHaveBeenCalledTimes(3)
    // 计数器未负：再次 startProgress 能重新触发 start（负计数器时 counter++ 永不等于 1）
    progress.startProgress()
    expect(nprogressMock.start).toHaveBeenCalledTimes(2)
  })

  it('无 pending 时调用 doneProgress 也安全（防御性 done）', () => {
    expect(() => progress.doneProgress()).not.toThrow()
    expect(nprogressMock.done).toHaveBeenCalledTimes(1)
  })

  it('35s 安全保险：漏调 done 时超时强制归零并重置计数器', () => {
    vi.useFakeTimers()
    progress.startProgress()
    progress.startProgress() // 并发 +1
    vi.advanceTimersByTime(34999)
    expect(nprogressMock.done).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(nprogressMock.done).toHaveBeenCalledTimes(1)
  })

  it('正常 done 时清除安全保险定时器，超时不再重复触发', () => {
    vi.useFakeTimers()
    progress.startProgress()
    progress.doneProgress()
    expect(nprogressMock.done).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(35000)
    // 定时器已被清除，不再多触发一次 done
    expect(nprogressMock.done).toHaveBeenCalledTimes(1)
  })

  it('保险超时归零后再次 startProgress 能重新拉起进度条并重设定时器', () => {
    vi.useFakeTimers()
    progress.startProgress()
    vi.advanceTimersByTime(35000)
    expect(nprogressMock.done).toHaveBeenCalledTimes(1)

    progress.startProgress()
    expect(nprogressMock.start).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(35000)
    expect(nprogressMock.done).toHaveBeenCalledTimes(2)
  })
})
