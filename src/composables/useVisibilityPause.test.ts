import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { useVisibilityPause } from './useVisibilityPause'

let wrapper: ReturnType<typeof mount> | null = null
let api: ReturnType<typeof useVisibilityPause>

// isVisibleGlobal / listenerCount are module-level singletons shared across
// every test in this file, so each test must settle the composable to a known
// baseline before asserting transitions.
async function mountComposable(): Promise<void> {
  setHidden(false)
  wrapper = mount({
    setup() {
      api = useVisibilityPause()
      return () => null
    }
  })
  // Flush the watcher scheduled by onMounted's initial visibility sync so it
  // does not coalesce with the transitions asserted below.
  await nextTick()
  await nextTick()
}

function setHidden(value: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
}

// Dispatch the DOM event (updates the global ref synchronously) then flush the
// Vue scheduler so the internal watch() callback runs.
async function fire(): Promise<void> {
  document.dispatchEvent(new Event('visibilitychange'))
  await nextTick()
}

describe('composables/useVisibilityPause', () => {
  beforeEach(() => {
    setHidden(false) // ensureListener resets global isVisible on first mount
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
      wrapper = null
    }
    vi.restoreAllMocks()
  })

  it('starts visible', async () => {
    await mountComposable()
    expect(api.isVisible.value).toBe(true)
  })

  it('fires pause then resume via onPauseResume', async () => {
    await mountComposable()
    const pause = vi.fn()
    const resume = vi.fn()
    api.onPauseResume(pause, resume)

    setHidden(true)
    await fire()
    expect(pause).toHaveBeenCalledTimes(1)
    expect(resume).not.toHaveBeenCalled()
    expect(api.isVisible.value).toBe(false)

    setHidden(false)
    await fire()
    expect(resume).toHaveBeenCalledTimes(1)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(api.isVisible.value).toBe(true)
  })

  it('supports independent onPause and onResume registrations', async () => {
    await mountComposable()
    const pause = vi.fn()
    const resume = vi.fn()
    api.onPause(pause)
    api.onResume(resume)

    setHidden(true)
    await fire()
    expect(pause).toHaveBeenCalledTimes(1)

    setHidden(false)
    await fire()
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('accumulates multiple callbacks and runs them in registration order', async () => {
    await mountComposable()
    const order: string[] = []
    api.onPause(() => order.push('a'))
    api.onPause(() => order.push('b'))
    setHidden(true)
    await fire()
    expect(order).toEqual(['a', 'b'])
  })

  it('does not fire when visibility does not actually change', async () => {
    await mountComposable()
    const pause = vi.fn()
    api.onPause(pause)
    setHidden(true)
    await fire()
    expect(pause).toHaveBeenCalledTimes(1)
    // Still hidden -> no extra pause call.
    await fire()
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('isolates a throwing callback so later ones still run', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountComposable()
    const good = vi.fn()
    api.onPause(() => {
      throw new Error('boom')
    })
    api.onPause(good)

    setHidden(true)
    await expect(fire()).resolves.toBeUndefined()
    expect(good).toHaveBeenCalledTimes(1)
    if (import.meta.env.DEV) {
      expect(errorSpy).toHaveBeenCalled()
    }
  })

  it('registers a single document listener and removes it after the last unmount', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')

    const w1 = mount({
      setup() {
        useVisibilityPause()
        return () => null
      }
    })
    const w2 = mount({
      setup() {
        useVisibilityPause()
        return () => null
      }
    })
    wrapper = null

    const adds = add.mock.calls.filter((c) => c[0] === 'visibilitychange').length
    expect(adds).toBe(1)

    w1.unmount()
    expect(remove.mock.calls.filter((c) => c[0] === 'visibilitychange').length).toBe(0)

    w2.unmount()
    expect(remove.mock.calls.filter((c) => c[0] === 'visibilitychange').length).toBe(1)
  })
})
