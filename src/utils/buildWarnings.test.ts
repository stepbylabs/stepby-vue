/**
 * 构建告警硬化判据（b124）
 *
 * 三组方向都要有：
 * ① 每个入册 code 必须抛错，且错误文案点名 code 与"为什么"（不许静默升级成一句"构建失败"）；
 * ② 未知 code 必须走默认通道一次（**不得**被吞掉——吞掉等于把"全部警告致命"换个方向实现）；
 * ③ 反证：code 缺失 / 正文提到坏族名字的告警都**不得**被判红（按文本匹配会把无害告警误伤，
 *    而且构建器换句措辞就全线失效）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FATAL_BUNDLE_WARNING_CODES, createBuildWarningHandler, fatalBundleWarningReason } from '@/utils/buildWarnings'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FATAL_BUNDLE_WARNING_CODES 自洽', () => {
  it('每个 code 都有可执行的"为什么"，且非空、不互相复制', () => {
    const entries = Object.entries(FATAL_BUNDLE_WARNING_CODES)
    expect(entries.length).toBeGreaterThanOrEqual(5)
    for (const [code, reason] of entries) {
      expect(code, 'code 必须是大写蛇形（构建器原样给出）').toMatch(/^[A-Z][A-Z0-9_]+$/)
      expect(reason.trim().length, `${code} 的理由不得为空`).toBeGreaterThan(10)
    }
    expect(new Set(entries.map(([, r]) => r)).size, '理由不得逐条复制').toBe(entries.length)
  })
})

describe('fatalBundleWarningReason', () => {
  it('入册 code 返回理由', () => {
    for (const code of Object.keys(FATAL_BUNDLE_WARNING_CODES)) {
      expect(fatalBundleWarningReason({ code })).toBe(FATAL_BUNDLE_WARNING_CODES[code])
    }
  })

  it('未知 code / 缺 code / 正文提到坏族名字 ⇒ 一律 undefined（不得按文本判）', () => {
    expect(fatalBundleWarningReason({ code: 'SOURCEMAP_BROKEN' })).toBeUndefined()
    expect(fatalBundleWarningReason({})).toBeUndefined()
    expect(
      fatalBundleWarningReason({ code: 'OTHER', message: 'INEFFECTIVE_DYNAMIC_IMPORT CIRCULAR_DEPENDENCY' })
    ).toBeUndefined()
    // 大小写不符不是同一个 code（构建器给的是大写蛇形）
    expect(fatalBundleWarningReason({ code: 'ineffective_dynamic_import' })).toBeUndefined()
  })
})

describe('createBuildWarningHandler', () => {
  it('坏族抛错，文案含 code、理由与可定位的位置', () => {
    const handler = createBuildWarningHandler()
    expect(() =>
      handler({
        code: 'CIRCULAR_DEPENDENCY',
        message: 'Circular dependency: a -> b -> a',
        ids: ['src/a.ts', 'src/b.ts']
      })
    ).toThrowError(/CIRCULAR_DEPENDENCY/)
    expect(() => handler({ code: 'CIRCULAR_DEPENDENCY', message: 'x', ids: ['src/a.ts'] })).toThrowError(/src\/a\.ts/)
  })

  it('未知告警原样交给默认处理器（调用一次、不被吞）', () => {
    const handler = createBuildWarningHandler()
    const defaultHandler = vi.fn()
    handler({ code: 'SOURCEMAP_BROKEN', message: 'css map missing' }, defaultHandler)
    expect(defaultHandler).toHaveBeenCalledTimes(1)
    expect(defaultHandler).toHaveBeenCalledWith(expect.objectContaining({ code: 'SOURCEMAP_BROKEN' }))
  })

  it('默认处理器缺省时回落 console.warn（不得静默）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handler = createBuildWarningHandler()
    expect(() => handler({ code: 'OTHER', message: 'plain warning' })).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
