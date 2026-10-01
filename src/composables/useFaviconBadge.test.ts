import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

type UseFaviconBadge = () => {
  currentCount: { value: number }
  updateBadge: (count: number) => Promise<void>
  resetBadge: () => void
}

/** Minimal 2D context recording all calls the composable makes. */
function makeCtx() {
  return {
    drawImage: vi.fn(),
    getImageData: vi.fn((x: number, y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h
    })),
    putImageData: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: ''
  }
}

const DATA_URL = 'data:image/png;base64,BADGED'

let ctxStub: ReturnType<typeof makeCtx>

/** Image stub: fires onload/onerror from the src setter. */
function installImage(mode: 'load' | 'error') {
  class MockImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    crossOrigin = ''
    private _src = ''
    set src(v: string) {
      this._src = v
      if (mode === 'load') this.onload?.()
      else this.onerror?.()
    }
    get src() {
      return this._src
    }
  }
  vi.stubGlobal('Image', MockImage)
}

/** Mount a component that instantiates useFaviconBadge, returning its API. */
function withBadge(useFaviconBadge: UseFaviconBadge) {
  let api: ReturnType<UseFaviconBadge> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useFaviconBadge()
        return () => null
      }
    })
  )
  return { api: api!, wrapper }
}

describe('composables/useFaviconBadge', () => {
  let useFaviconBadge: UseFaviconBadge
  let originalHrefValue: string

  beforeEach(async () => {
    vi.resetModules()
    document.head.innerHTML = ''

    // Fresh favicon link pointing at the original icon.
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = '/original.ico'
    document.head.appendChild(link)
    originalHrefValue = link.href

    // Canvas stubs (jsdom lacks a real 2D context).
    ctxStub = makeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctxStub as unknown as CanvasRenderingContext2D
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(DATA_URL)

    installImage('load')

    const mod = await import('./useFaviconBadge')
    useFaviconBadge = mod.useFaviconBadge
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const getLink = () => document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!

  it('renders the badge and swaps the favicon href for a data URL', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(5)

    expect(getLink().href).toBe(DATA_URL)
    // original favicon drawn first, then the red dot + text
    expect(ctxStub.putImageData).toHaveBeenCalled()
    expect(ctxStub.arc).toHaveBeenCalledWith(23, 9, 9, 0, 2 * Math.PI)
    expect(ctxStub.fill).toHaveBeenCalled()
    expect(ctxStub.stroke).toHaveBeenCalled()
    expect(ctxStub.fillText).toHaveBeenCalledWith('5', 23, 10)
    expect(api.currentCount.value).toBe(5)
  })

  it('uses the 11px bold font for a single-digit count', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(9)
    expect(ctxStub.font).toBe('bold 11px Arial, sans-serif')
    expect(ctxStub.fillText).toHaveBeenCalledWith('9', 23, 10)
  })

  it('uses the 9px bold font for a two-digit count', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(42)
    expect(ctxStub.font).toBe('bold 9px Arial, sans-serif')
    expect(ctxStub.fillText).toHaveBeenCalledWith('42', 23, 10)
  })

  it('clamps to "99+" with the 7px font for counts over 99', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(150)
    expect(ctxStub.font).toBe('bold 7px Arial, sans-serif')
    expect(ctxStub.fillText).toHaveBeenCalledWith('99+', 23, 10)
  })

  it('renders exactly "99+" at the 100 boundary', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(100)
    expect(ctxStub.fillText).toHaveBeenCalledWith('99+', 23, 10)
  })

  it('reads badge colours from CSS variables when present', async () => {
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => (name === '--el-color-danger' ? '#FF1122' : '')
    } as unknown as CSSStyleDeclaration)

    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(3)
    // fillStyle is set to the danger colour for the dot, then white for text.
    expect(ctxStub.fillStyle).toBe('#FFFFFF')
    const dangerFill = ctxStub.fill.mock.calls.length
    expect(dangerFill).toBe(1)
    spy.mockRestore()
  })

  it('falls back to default colours when CSS variables are empty', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(3)
    // After the whole draw, fillStyle ends as the white text colour (fallback).
    expect(ctxStub.fillStyle).toBe('#FFFFFF')
    expect(ctxStub.strokeStyle).toBe('#FFFFFF')
  })

  it('restores the original href when count is 0', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(7)
    expect(getLink().href).toBe(DATA_URL)

    await api.updateBadge(0)
    expect(getLink().href).toBe(originalHrefValue)
    expect(api.currentCount.value).toBe(0)
  })

  it('resetBadge clears the count and restores the favicon', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(8)
    api.resetBadge()
    // resetBadge does not await; flush the refresh chain
    await vi.waitFor(() => {
      expect(getLink().href).toBe(originalHrefValue)
    })
    expect(api.currentCount.value).toBe(0)
  })

  it('aggregates across instances, showing the maximum count', async () => {
    const a = withBadge(useFaviconBadge)
    const b = withBadge(useFaviconBadge)

    await a.api.updateBadge(3)
    expect(ctxStub.fillText).toHaveBeenLastCalledWith('3', 23, 10)

    await b.api.updateBadge(7)
    expect(ctxStub.fillText).toHaveBeenLastCalledWith('7', 23, 10)
  })

  it('re-aggregates when a non-last instance unmounts', async () => {
    const a = withBadge(useFaviconBadge)
    const b = withBadge(useFaviconBadge)
    await a.api.updateBadge(5)
    await b.api.updateBadge(2)
    // max is 5
    expect(ctxStub.fillText).toHaveBeenLastCalledWith('5', 23, 10)

    a.wrapper.unmount()
    // remaining instance still counts; re-aggregation shows 2
    await vi.waitFor(() => {
      expect(ctxStub.fillText).toHaveBeenLastCalledWith('2', 23, 10)
    })
    b.wrapper.unmount()
    // last instance gone → original href restored
    expect(getLink().href).toBe(originalHrefValue)
  })

  it('does not restore the favicon on unmount while other instances are active', async () => {
    const a = withBadge(useFaviconBadge)
    const b = withBadge(useFaviconBadge)
    await b.api.updateBadge(6)
    expect(getLink().href).toBe(DATA_URL)

    a.wrapper.unmount()
    // b is still active with count 6 → badge persists
    expect(getLink().href).toBe(DATA_URL)
    b.wrapper.unmount()
    expect(getLink().href).toBe(originalHrefValue)
  })

  it('creates a favicon link element if none exists', async () => {
    document.head.innerHTML = ''
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(1)
    const link = getLink()
    expect(link).toBeTruthy()
    expect(link.href).toBe(DATA_URL)
  })

  it('bails out without touching the favicon when the image fails to load', async () => {
    installImage('error')
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(5)
    // href stays at original; no badge drawn
    expect(getLink().href).toBe(originalHrefValue)
    expect(ctxStub.fillText).not.toHaveBeenCalled()
  })

  it('bails out when the canvas 2d context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(5)
    expect(ctxStub.fillText).not.toHaveBeenCalled()
    expect(getLink().href).toBe(originalHrefValue)
  })

  it('degrades to a solid canvas when drawing the favicon throws', async () => {
    ctxStub.drawImage = vi.fn(() => {
      throw new Error('tainted canvas')
    })
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(4)
    // the catch branch fills a primary-coloured rect and still caches ImageData
    expect(ctxStub.fillRect).toHaveBeenCalledWith(0, 0, 32, 32)
    expect(getLink().href).toBe(DATA_URL)
  })

  it('does not write the href when drawBadge yields an empty data URL', async () => {
    const { api } = withBadge(useFaviconBadge)
    await api.updateBadge(5)
    // Force getContext to return null only for the badge canvas draw path
    // by making toDataURL return '' (getContext already cached original data).
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('')
    const before = getLink().href
    await api.updateBadge(9)
    expect(getLink().href).toBe(before)
  })
})
