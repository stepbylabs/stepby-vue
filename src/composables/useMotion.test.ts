import { describe, it, expect, vi } from 'vitest'

// Mock the auto-animate directive module so we don't load the real Vue plugin.
// useMotion re-exports `vAutoAnimate`, so the sentinel lets us assert pass-through.
const { vAutoAnimateSentinel } = vi.hoisted(() => ({
  vAutoAnimateSentinel: { __mockDirective: true }
}))
vi.mock('@formkit/auto-animate/vue', () => ({
  vAutoAnimate: vAutoAnimateSentinel
}))

import { useMotionPresets, vAutoAnimate } from './useMotion'

describe('composables/useMotion', () => {
  describe('vAutoAnimate re-export', () => {
    it('re-exports the mocked directive unchanged', () => {
      expect(vAutoAnimate).toBe(vAutoAnimateSentinel)
    })
  })

  describe('static presets', () => {
    it('fadeInUp animates opacity + y with easeOut 300ms', () => {
      const { fadeInUp } = useMotionPresets()
      expect(fadeInUp.initial).toEqual({ opacity: 0, y: 12 })
      expect(fadeInUp.enter).toEqual({
        opacity: 1,
        y: 0,
        transition: { duration: 300, ease: 'easeOut' }
      })
    })

    it('fadeInScale animates opacity + scale 250ms', () => {
      const { fadeInScale } = useMotionPresets()
      expect(fadeInScale.initial).toEqual({ opacity: 0, scale: 0.96 })
      expect(fadeInScale.enter).toEqual({
        opacity: 1,
        scale: 1,
        transition: { duration: 250, ease: 'easeOut' }
      })
    })

    it('slideInRight animates opacity + x 300ms', () => {
      const { slideInRight } = useMotionPresets()
      expect(slideInRight.initial).toEqual({ opacity: 0, x: 20 })
      expect(slideInRight.enter).toEqual({
        opacity: 1,
        x: 0,
        transition: { duration: 300, ease: 'easeOut' }
      })
    })

    it('fadeInUpSmall uses a shorter distance + duration', () => {
      const { fadeInUpSmall } = useMotionPresets()
      expect(fadeInUpSmall.initial).toEqual({ opacity: 0, y: 8 })
      expect(fadeInUpSmall.enter).toEqual({
        opacity: 1,
        y: 0,
        transition: { duration: 200, ease: 'easeOut' }
      })
    })

    it('tapFeedback responds to the tapped variant', () => {
      const { tapFeedback } = useMotionPresets()
      expect(tapFeedback.initial).toEqual({ scale: 1 })
      expect(tapFeedback.tapped).toEqual({
        scale: 0.95,
        transition: { duration: 100 }
      })
    })
  })

  describe('staggerChildren', () => {
    it('computes delay = index * base with default base 50 and cap 500', () => {
      const { staggerChildren } = useMotionPresets()
      const v = staggerChildren(3)
      expect(v.initial).toEqual({ opacity: 0, y: 16 })
      expect(v.enter).toEqual({
        opacity: 1,
        y: 0,
        transition: { duration: 300, ease: 'easeOut', delay: 150 }
      })
    })

    it('zero index yields zero delay', () => {
      const { staggerChildren } = useMotionPresets()
      const v = staggerChildren(0)
      expect(v.enter?.transition?.delay).toBe(0)
    })

    it('caps delay at maxDelay (default 500)', () => {
      const { staggerChildren } = useMotionPresets()
      const v = staggerChildren(20) // 20*50 = 1000 → capped 500
      expect(v.enter?.transition?.delay).toBe(500)
    })

    it('honours a custom base', () => {
      const { staggerChildren } = useMotionPresets()
      const v = staggerChildren(2, 100) // 2*100 = 200
      expect(v.enter?.transition?.delay).toBe(200)
    })

    it('honours a custom maxDelay cap', () => {
      const { staggerChildren } = useMotionPresets()
      const v = staggerChildren(10, 100, 300) // 1000 → capped 300
      expect(v.enter?.transition?.delay).toBe(300)
    })

    it('sits exactly at the boundary when index*base equals maxDelay', () => {
      const { staggerChildren } = useMotionPresets()
      const v = staggerChildren(5, 100, 500) // 500 == 500
      expect(v.enter?.transition?.delay).toBe(500)
    })

    it('a fresh object is returned each call (no shared mutation)', () => {
      const { staggerChildren } = useMotionPresets()
      const a = staggerChildren(1)
      const b = staggerChildren(1)
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  it('returns a stable set of preset keys', () => {
    const presets = useMotionPresets()
    expect(Object.keys(presets).sort()).toEqual(
      ['fadeInScale', 'fadeInUp', 'fadeInUpSmall', 'slideInRight', 'staggerChildren', 'tapFeedback'].sort()
    )
  })
})
