/**
 * `webStorage` 通道自身的**行为**锁（b89 项 8）。
 *
 * `webStorage.guard.test.ts` 锁的是"全仓只剩这一条通道"（形状），本文件锁的是这条通道
 * 在三种真实故障下确实**降级而不是抛**（语义）。两把锁判的是不同的事：
 * 只有形状锁时，通道内部可以写成 `localStorage.getItem(key)` 一个守卫都没有，守卫照样全绿。
 *
 * 三种故障形态与它们的真实来源（见 webStorage 模块头）：
 * ① 读那个属性本身抛（Safari 隐私模式 / Chrome 阻止站点数据）；
 * ② `setItem` 抛 QuotaExceededError（配额满）；
 * ③ 对象读得到、但任何写入都抛（旧 Safari）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetStorageWarnDedupeForTest,
  getItem,
  getJSON,
  removeItem,
  setItem,
  setJSON,
  storageAvailable
} from '@/utils/webStorage'

const localDesc = Object.getOwnPropertyDescriptor(window, 'localStorage')
const sessionDesc = Object.getOwnPropertyDescriptor(window, 'sessionStorage')

/** 把 `window.<kind>` 换成一个"读属性就抛"的陷阱（对应故障 ①） */
function makePropertyThrow(kind: 'localStorage' | 'sessionStorage'): void {
  Object.defineProperty(window, kind, {
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
    configurable: true
  })
}

/** 只让写入抛，读仍可用（对应故障 ②③） */
function makeWriteThrow(kind: 'localStorage' | 'sessionStorage'): void {
  const real = window[kind]
  Object.defineProperty(window, kind, {
    value: {
      getItem: (k: string) => real.getItem(k),
      removeItem: (_k: string) => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
      setItem: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
    },
    configurable: true,
    writable: true
  })
}

describe('webStorage · 正常态', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    __resetStorageWarnDedupeForTest()
  })

  it('local / session 两套键空间互不串', () => {
    expect(setItem('k', 'v', 'local')).toBe(true)
    expect(getItem('k', 'local')).toBe('v')
    expect(getItem('k', 'session')).toBeNull()
    expect(setItem('k', 's', 'session')).toBe(true)
    expect(getItem('k', 'session')).toBe('s')
    expect(getItem('k', 'local')).toBe('v')
  })

  it('removeItem 之后读不到，且删不存在的键不抛（幂等）', () => {
    setItem('k', 'v')
    removeItem('k')
    expect(getItem('k')).toBeNull()
    expect(() => removeItem('never-existed')).not.toThrow()
  })

  it('JSON 往返', () => {
    expect(setJSON('o', { a: 1, b: [2, 3] })).toBe(true)
    expect(getJSON('o')).toEqual({ a: 1, b: [2, 3] })
  })

  it('缺省 kind = local（调用点不写第二参时不会悄悄落到会话存储）', () => {
    setItem('only-local', '1')
    expect(localStorage.getItem('only-local')).toBe('1')
    expect(sessionStorage.getItem('only-local')).toBeNull()
  })

  it('storageAvailable 在正常浏览器里为真', () => {
    expect(storageAvailable('local')).toBe(true)
    expect(storageAvailable('session')).toBe(true)
  })
})

describe('webStorage · 三种故障都必须降级而不是抛', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    __resetStorageWarnDedupeForTest()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    if (localDesc) Object.defineProperty(window, 'localStorage', localDesc)
    if (sessionDesc) Object.defineProperty(window, 'sessionStorage', sessionDesc)
    vi.restoreAllMocks()
  })

  it('① 读属性就抛：三个操作全部安静降级', () => {
    makePropertyThrow('localStorage')
    expect(() => getItem('k')).not.toThrow()
    expect(getItem('k')).toBeNull()
    expect(setItem('k', 'v')).toBe(false)
    expect(() => removeItem('k')).not.toThrow()
    expect(getJSON('k')).toBeNull()
    // 会话那一侧没坏：按类型隔离，不得连坐（同 b72 F71"一个桶打满即饿死全站"的判据方向）
    expect(setItem('k', 'v', 'session')).toBe(true)
    expect(getItem('k', 'session')).toBe('v')
    // 文案必须指对成因："不可用"引导去查浏览器设置，"配额已满"引导去清磁盘，写反=没有文案
    expect(
      vi
        .mocked(console.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n')
    ).toContain('不可用')
  })

  it('① 读属性就抛时 storageAvailable 为假（UI 据此不再承诺"下次还记得你"）', () => {
    makePropertyThrow('localStorage')
    expect(storageAvailable('local')).toBe(false)
  })

  it('③ 对象读得到但写必抛：available 为假，而读仍然可用', () => {
    localStorage.setItem('preset', 'kept')
    makeWriteThrow('localStorage')
    expect(storageAvailable('local')).toBe(false)
    expect(getItem('preset')).toBe('kept')
    expect(setItem('fresh', 'x')).toBe(false)
  })

  it('② 配额满：写失败必须**不动**已有键（绝不"删旧数据腾地方"）', () => {
    setItem('user-prefs', JSON.stringify({ defaultPageSize: 50 }))
    makeWriteThrow('localStorage')
    expect(setItem('something-new', 'x')).toBe(false)
    // 用户设置必须还在：静默丢用户数据比"这次没记住"严重一个量级
    expect(getItem('user-prefs')).toContain('defaultPageSize')
    // 存储对象读得到，所以成因必须是"配额已满"而不是"不可用"
    expect(
      vi
        .mocked(console.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n')
    ).toContain('配额已满')
  })

  it('② removeItem 抛时不得穿到调用点（原实现里它是**唯一**一处守卫都没有的操作）', () => {
    makeWriteThrow('localStorage')
    expect(() => removeItem('anything')).not.toThrow()
  })

  it('脏 JSON：返回 null 并把那一行清掉（否则每次访问都重新抛一遍）', () => {
    localStorage.setItem('dirty', '{not valid json')
    expect(getJSON('dirty')).toBeNull()
    expect(localStorage.getItem('dirty')).toBeNull()
  })

  it('告警按类型去重：同一类型反复失败只报一次，不同类型各报各的', () => {
    makePropertyThrow('localStorage')
    makePropertyThrow('sessionStorage')
    getItem('a')
    getItem('b')
    getItem('c', 'session')
    // 过滤词取 warnOnce 独有的那句尾注：`[storage]` 前缀也会被"脏 JSON 已清理"那条共用，
    // 用它计数的话，去重判据会被另一条日志洗白。
    const warns = () => vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes('本次不会被记住'))
    expect(warns().length, '两种类型各报一次，不得按调用次数刷屏').toBe(2)
    // 去重状态可复位（测试钩子必须真的生效，否则它是"写了没接线"的那一族）
    __resetStorageWarnDedupeForTest()
    getItem('d')
    expect(warns().length).toBe(3)
  })
})
