import { describe, it, expect, vi, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

import zhCN from './zh-CN'
import enUS from './en-US'

// ============================================================================
// i18n locale 键完整性测试
// ----------------------------------------------------------------------------
// 目的：本次新增功能引入了大量新的 i18n 键，需要确保 zh-CN 和 en-US 两个 locale
// 文件的键完全对齐，避免出现 "key undefined" 渲染问题。
// ============================================================================

/**
 * 递归收集对象的所有叶子键路径
 *
 * 例如：{ a: { b: 1, c: 2 } } => ['a.b', 'a.c']
 *
 * @param obj    要遍历的对象
 * @param prefix 父级前缀（递归使用）
 * @returns 所有点分键路径的数组
 */
function getKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') {
    return prefix ? [prefix] : []
  }

  // 数组不被视为 i18n 键容器（locale 文件中不存在数组）
  if (Array.isArray(obj)) {
    return prefix ? [prefix] : []
  }

  const keys: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...getKeys(v, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

/**
 * 比较两个 locale 对象的键集合，返回差异
 */
function diffKeys(
  zhKeys: string[],
  enKeys: string[]
): {
  onlyInZh: string[]
  onlyInEn: string[]
} {
  const zhSet = new Set(zhKeys)
  const enSet = new Set(enKeys)
  return {
    onlyInZh: zhKeys.filter((k) => !enSet.has(k)),
    onlyInEn: enKeys.filter((k) => !zhSet.has(k))
  }
}

/**
 * 断言两个 locale 的键完全对齐
 */
function assertLocaleKeysAligned(zh: unknown, en: unknown): void {
  const zhKeys = getKeys(zh).sort()
  const enKeys = getKeys(en).sort()
  const { onlyInZh, onlyInEn } = diffKeys(zhKeys, enKeys)
  expect(onlyInZh).toEqual([])
  expect(onlyInEn).toEqual([])
}

describe('i18n locale 键完整性', () => {
  // --------------------------------------------------------------------------
  // getKeys 辅助函数
  // --------------------------------------------------------------------------
  describe('getKeys', () => {
    it('扁平对象返回顶层键', () => {
      expect(getKeys({ a: 1, b: 2 }).sort()).toEqual(['a', 'b'])
    })

    it('嵌套对象返回点分路径', () => {
      const obj = { a: { b: 1, c: 2 }, d: 3 }
      expect(getKeys(obj).sort()).toEqual(['a.b', 'a.c', 'd'])
    })

    it('三层嵌套', () => {
      const obj = { a: { b: { c: 1 } } }
      expect(getKeys(obj)).toEqual(['a.b.c'])
    })

    it('空对象返回空数组', () => {
      expect(getKeys({})).toEqual([])
    })

    it('非对象返回空数组或自身路径', () => {
      expect(getKeys(null)).toEqual([])
      expect(getKeys(undefined)).toEqual([])
      expect(getKeys('str')).toEqual([])
    })

    it('字符串值为叶子节点', () => {
      expect(getKeys({ a: 'hello' })).toEqual(['a'])
    })

    it('数组值被视为叶子节点（不展开）', () => {
      expect(getKeys({ a: [1, 2, 3] })).toEqual(['a'])
    })

    it('支持 prefix 参数', () => {
      expect(getKeys({ b: 1 }, 'a').sort()).toEqual(['a.b'])
    })
  })

  // --------------------------------------------------------------------------
  // zh-CN 与 en-US 键对齐
  // --------------------------------------------------------------------------
  describe('zh-CN 与 en-US 键对齐', () => {
    it('两个 locale 文件应具有完全一致的键集合', () => {
      assertLocaleKeysAligned(zhCN, enUS)
    })

    it('两个 locale 文件键数量应大于 0', () => {
      const zhKeys = getKeys(zhCN)
      const enKeys = getKeys(enUS)
      expect(zhKeys.length).toBeGreaterThan(0)
      expect(enKeys.length).toBeGreaterThan(0)
      expect(zhKeys.length).toBe(enKeys.length)
    })

    it('两个 locale 顶层键应一致', () => {
      const zhTop = Object.keys(zhCN).sort()
      const enTop = Object.keys(enUS).sort()
      expect(zhTop).toEqual(enTop)
    })
  })

  // --------------------------------------------------------------------------
  // 本次新增的特定键存在性校验
  // --------------------------------------------------------------------------
  describe('本次新增的特定键存在', () => {
    /**
     * 通过点分路径从对象中取值，不存在则返回 undefined
     */
    function getPath(obj: unknown, path: string): unknown {
      return path.split('.').reduce<unknown>((acc, key) => {
        if (acc !== null && typeof acc === 'object' && key in (acc as object)) {
          return (acc as Record<string, unknown>)[key]
        }
        return undefined
      }, obj)
    }

    /**
     * 断言指定键在 zh 和 en 中都存在且为字符串
     */
    function expectKeyExistsInBoth(key: string): void {
      const zhVal = getPath(zhCN, key)
      const enVal = getPath(enUS, key)
      expect(zhVal, `zh-CN 缺少键: ${key}`).toBeDefined()
      expect(enVal, `en-US 缺少键: ${key}`).toBeDefined()
      expect(typeof zhVal, `zh-CN.${key} 应为字符串`).toBe('string')
      expect(typeof enVal, `en-US.${key} 应为字符串`).toBe('string')
    }

    it('common.clickRefreshCaptcha (login/register) 存在', () => {
      expectKeyExistsInBoth('login.clickRefreshCaptcha')
      expectKeyExistsInBoth('register.clickRefreshCaptcha')
    })

    it('common.downloadError 存在', () => {
      expectKeyExistsInBoth('common.downloadError')
    })

    it('common.repeatSubmitWarning 存在', () => {
      expectKeyExistsInBoth('common.repeatSubmitWarning')
    })

    it('common.sessionExpired 存在', () => {
      expectKeyExistsInBoth('common.sessionExpired')
    })

    it('common.reloginCanceled 存在', () => {
      expectKeyExistsInBoth('common.reloginCanceled')
    })

    it('common.usernameOrPasswordError 存在', () => {
      expectKeyExistsInBoth('common.usernameOrPasswordError')
    })

    it('common.passwordError 存在', () => {
      expectKeyExistsInBoth('common.passwordError')
    })

    it('common.requestParamError 存在', () => {
      expectKeyExistsInBoth('common.requestParamError')
    })

    it('common.noPermission 存在', () => {
      expectKeyExistsInBoth('common.noPermission')
    })

    it('common.tooManyRequests 存在', () => {
      expectKeyExistsInBoth('common.tooManyRequests')
    })

    it('common.serviceUnavailable 存在', () => {
      expectKeyExistsInBoth('common.serviceUnavailable')
    })

    it('common.backendConnectionError 存在', () => {
      expectKeyExistsInBoth('common.backendConnectionError')
    })

    it('common.requestTimeout 存在', () => {
      expectKeyExistsInBoth('common.requestTimeout')
    })

    it('common.requestError 存在', () => {
      expectKeyExistsInBoth('common.requestError')
    })

    it('common.retryHint 存在', () => {
      expectKeyExistsInBoth('common.retryHint')
    })

    it('common.requestSizeExceeded 存在', () => {
      expectKeyExistsInBoth('common.requestSizeExceeded')
    })

    it('file.tip.batchDeletePartial 存在（R13 新增）', () => {
      expectKeyExistsInBoth('file.tip.batchDeletePartial')
    })

    it('pdf.printPreview 存在（R13 新增）', () => {
      expectKeyExistsInBoth('pdf.printPreview')
    })

    it('error.e403.ariaLabel 存在', () => {
      expectKeyExistsInBoth('error.e403.ariaLabel')
    })

    it('error.e500.ariaLabel 存在', () => {
      expectKeyExistsInBoth('error.e500.ariaLabel')
    })

    it('error.network.ariaLabel 存在', () => {
      expectKeyExistsInBoth('error.network.ariaLabel')
    })

    it('profile.avatar.previewAlt 存在', () => {
      expectKeyExistsInBoth('profile.avatar.previewAlt')
    })

    it('tour.ariaLabel 存在', () => {
      expectKeyExistsInBoth('tour.ariaLabel')
    })

    it('commandPalette.ariaLabel 存在', () => {
      expectKeyExistsInBoth('commandPalette.ariaLabel')
    })

    it('所有要求的新增键在两个 locale 中均存在（聚合用例）', () => {
      const requiredKeys = [
        'common.downloadError',
        'common.repeatSubmitWarning',
        'common.requestSizeExceeded',
        'file.tip.batchDeletePartial',
        'pdf.printPreview',
        'common.sessionExpired',
        'common.reloginCanceled',
        'common.usernameOrPasswordError',
        'common.passwordError',
        'common.requestParamError',
        'common.noPermission',
        'common.tooManyRequests',
        'common.serviceUnavailable',
        'common.backendConnectionError',
        'common.requestTimeout',
        'common.requestError',
        'common.retryHint',
        'login.clickRefreshCaptcha',
        'register.clickRefreshCaptcha',
        'error.e403.ariaLabel',
        'error.e500.ariaLabel',
        'error.network.ariaLabel',
        'profile.avatar.previewAlt',
        'tour.ariaLabel',
        'commandPalette.ariaLabel'
      ]
      for (const key of requiredKeys) {
        expectKeyExistsInBoth(key)
      }
    })
  })

  // --------------------------------------------------------------------------
  // assertLocaleKeysAligned 辅助函数自身测试
  // --------------------------------------------------------------------------
  describe('assertLocaleKeysAligned', () => {
    it('键一致时不抛错', () => {
      const a = { x: { y: 1, z: 2 }, w: 3 }
      const b = { x: { y: 'a', z: 'b' }, w: 'c' }
      expect(() => assertLocaleKeysAligned(a, b)).not.toThrow()
    })

    it('zh 多出键时抛错', () => {
      const zh = { a: 1, b: 2 }
      const en = { a: 1 }
      expect(() => assertLocaleKeysAligned(zh, en)).toThrow()
    })

    it('en 多出键时抛错', () => {
      const zh = { a: 1 }
      const en = { a: 1, b: 2 }
      expect(() => assertLocaleKeysAligned(zh, en)).toThrow()
    })

    it('嵌套结构中 zh 多出键时抛错', () => {
      const zh = { x: { y: 1, z: 2 } }
      const en = { x: { y: 1 } }
      expect(() => assertLocaleKeysAligned(zh, en)).toThrow()
    })

    it('键相同但类型不同（一个对象一个字符串）也算不对齐', () => {
      const zh = { x: { y: 1 } }
      const en = { x: 'str' }
      expect(() => assertLocaleKeysAligned(zh, en)).toThrow()
    })
  })

  // --------------------------------------------------------------------------
  // 报文编译完整性（防回归）
  // --------------------------------------------------------------------------
  // 背景：/system/msg/channel、/system/msg/template、/system/report 的表单对话框曾因
  // 占位/提示类报文含有 vue-i18n 保留字符（`{` `}` `@`、嵌套 `{{}}`、字面量 `|`）而
  // 触发 message 编译错误（生产 JIT 下抛 SyntaxError 被 ErrorBoundary 捕获，导致整个
  // 对话框无法渲染；该错误仅在交互态出现，被动页面加载采集不到）。
  // 本用例逐一 t() 每个叶子报文并捕获 vue-i18n 打印到 console.error 的编译错误，
  // 确保任何含保留字符的字面量都以 {'...'} 转义，杜绝同类回归。
  // --------------------------------------------------------------------------
  describe('i18n 报文编译完整性', () => {
    /** 递归收集 (点分键路径 -> 字符串值) 叶子 */
    function collectStringLeaves(obj: unknown, prefix = '', acc: { key: string; value: string }[] = []) {
      if (obj === null || typeof obj !== 'object') return acc
      if (Array.isArray(obj)) return acc
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          collectStringLeaves(v, path, acc)
        } else if (typeof v === 'string') {
          acc.push({ key: path, value: v })
        }
      }
      return acc
    }

    let errorSpy: ReturnType<typeof vi.spyOn>
    afterEach(() => errorSpy?.mockRestore())

    /** 在给定的 t 函数下逐一解析所有叶子报文，返回触发编译错误的记录 */
    function findCompilationErrors(t: (key: string) => unknown, leaves: { key: string }[]): string[] {
      const bad: string[] = []
      errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        const text = args.map((a) => (typeof a === 'string' ? a : '')).join(' ')
        if (
          /Message compilation error|Invalid token|Not allowed nest placeholder|Detected nested|SyntaxError/i.test(text)
        ) {
          bad.push(text.slice(0, 160))
        }
      })
      for (const { key } of leaves) {
        try {
          t(key)
        } catch {
          bad.push(`throw on ${key}`)
        }
      }
      errorSpy.mockRestore()
      return bad
    }

    it('zh-CN 全部报文可编译（无 message 编译错误）', () => {
      const i18n = createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN },
        missingWarn: false,
        fallbackWarn: false
      })
      const leaves = collectStringLeaves(zhCN)
      expect(leaves.length).toBeGreaterThan(100)
      const bad = findCompilationErrors((k) => i18n.global.t(k), leaves)
      expect(bad, `存在编译失败的 zh-CN 报文:\n${bad.join('\n')}`).toEqual([])
    })

    it('en-US 全部报文可编译（无 message 编译错误）', () => {
      const i18n = createI18n({
        legacy: false,
        locale: 'en-US',
        messages: { 'en-US': enUS },
        missingWarn: false,
        fallbackWarn: false
      })
      const leaves = collectStringLeaves(enUS)
      const bad = findCompilationErrors((k) => i18n.global.t(k), leaves)
      expect(bad, `存在编译失败的 en-US 报文:\n${bad.join('\n')}`).toEqual([])
    })

    it('含 vue-i18n 保留字符的字面量示例（channel/template/report）已正确转义渲染', () => {
      // 精确回归：这三条报文此前直接触发编译错误，必须以 {'...'} 字面量块包裹后正确渲染出原样文本。
      const i18n = createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN },
        missingWarn: false,
        fallbackWarn: false
      })
      const smtp = i18n.global.t('msg.channel.form.phConfigJson')
      expect(smtp).toContain('{ "smtp_host"')
      expect(smtp).toContain('xxx@qq.com')
      expect(smtp).toContain('"smtp_password": "xxx"')
      const report = i18n.global.t('report.form.phConfig')
      expect(report).toContain('{"days":7}')
    })
  })

  // footerDisclaimer 含字面量 |，vue-i18n 会按复数分隔处理并在无 count 时截断为第一段。
  // 曾导致合规报告 PDF 页脚丢失 "| 仅供审计合规用途"。此处锁定完整文案不被截断。
  describe('footerDisclaimer 不被 | 复数截断', () => {
    it('zh-CN 页脚保留完整两段文案', () => {
      const i18n = createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN },
        missingWarn: false,
        fallbackWarn: false
      })
      const v = i18n.global.t('auditDashboard.report.footerDisclaimer')
      expect(v).toContain('本报告由 stepby 系统自动生成')
      expect(v).toContain('仅供审计合规用途')
    })
    it('en-US 页脚保留完整两段文案', () => {
      const i18n = createI18n({
        legacy: false,
        locale: 'en-US',
        messages: { 'en-US': enUS },
        missingWarn: false,
        fallbackWarn: false
      })
      const v = i18n.global.t('auditDashboard.report.footerDisclaimer')
      expect(v).toContain('auto-generated by the stepby system')
      expect(v).toContain('For audit compliance purposes only')
    })
  })
})
