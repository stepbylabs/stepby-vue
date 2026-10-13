import { describe, it, expect } from 'vitest'
import {
  MAX_CARDS,
  parseConfig,
  validateConfig,
  addCard,
  removeCard,
  genCardId,
  isCardWellFormed,
  sizeToGridClass
} from '@/utils/reportBoard'
import type { CardSize, ReportCard } from '@/api/tool/reportBoard'

/** 白名单测试桩（与后端 SOURCES 对齐的子集） */
const ALLOWED = ['login_trend', 'login_fail_trend', 'user_growth', 'online_count', 'today_anomaly_ips', 'msg_delivery']

/** 构造合法卡片 */
function card(overrides: Partial<ReportCard> = {}): ReportCard {
  return {
    id: 'c1',
    title: '登录趋势',
    chartType: 'line',
    sourceKey: 'login_trend',
    size: { w: 2, h: 1 },
    ...overrides
  }
}

describe('parseConfig', () => {
  it('解析合法配置对象', () => {
    const cfg = parseConfig({ cards: [card()] })
    expect(cfg).not.toBeNull()
    expect(cfg!.cards).toHaveLength(1)
    expect(cfg!.cards[0].sourceKey).toBe('login_trend')
  })

  it('解析 JSON 字符串形态', () => {
    const cfg = parseConfig(JSON.stringify({ cards: [] }))
    expect(cfg).not.toBeNull()
    expect(cfg!.cards).toHaveLength(0)
  })

  it('空对象/缺 cards 字段 → 空看板', () => {
    expect(parseConfig({})!.cards).toEqual([])
    expect(parseConfig({ other: 1 })!.cards).toEqual([])
  })

  it('损坏 JSON 字符串 → null', () => {
    expect(parseConfig('{broken json')).toBeNull()
  })

  it('非对象输入 → null', () => {
    expect(parseConfig(null)).toBeNull()
    expect(parseConfig('abc')).toBeNull()
    expect(parseConfig([1, 2])).toBeNull()
  })

  it('cards 非数组 → null', () => {
    expect(parseConfig({ cards: 'x' })).toBeNull()
  })
})

describe('validateConfig（白名单/结构校验）', () => {
  it('合法配置 → null', () => {
    expect(validateConfig({ cards: [card()] }, ALLOWED)).toBeNull()
  })

  it('白名单外 sourceKey → source（防任意 URL/SQL 注入面）', () => {
    expect(validateConfig({ cards: [card({ sourceKey: 'http://evil.example.com' })] }, ALLOWED)).toBe('source')
    expect(validateConfig({ cards: [card({ sourceKey: 'SELECT 1; DROP TABLE users' })] }, ALLOWED)).toBe('source')
    expect(validateConfig({ cards: [card({ sourceKey: '' })] }, ALLOWED)).toBe('source')
  })

  it('全部白名单源均通过', () => {
    for (const key of ALLOWED) {
      expect(validateConfig({ cards: [card({ sourceKey: key })] }, ALLOWED)).toBeNull()
    }
  })

  it('重复 id → id', () => {
    expect(validateConfig({ cards: [card(), card()] }, ALLOWED)).toBe('id')
  })

  it('空 id → id', () => {
    expect(validateConfig({ cards: [card({ id: '' })] }, ALLOWED)).toBe('id')
  })

  it('空标题/超长标题 → title', () => {
    expect(validateConfig({ cards: [card({ title: '' })] }, ALLOWED)).toBe('title')
    expect(validateConfig({ cards: [card({ title: 'x'.repeat(65) })] }, ALLOWED)).toBe('title')
  })

  it('标题按 Unicode 字符计数（32 个汉字合法）', () => {
    expect(validateConfig({ cards: [card({ title: '汉'.repeat(64) })] }, ALLOWED)).toBeNull()
  })

  it('尺寸越界 → size', () => {
    expect(validateConfig({ cards: [card({ size: { w: 3, h: 1 } as unknown as CardSize })] }, ALLOWED)).toBe('size')
    expect(validateConfig({ cards: [card({ size: { w: 1, h: 0 } as unknown as CardSize })] }, ALLOWED)).toBe('size')
  })

  it('非白名单内 chartType 结构 → size/结构分支', () => {
    expect(isCardWellFormed({ ...card(), chartType: 'gauge' })).toBe(false)
  })

  it('超过上限卡片数 → count', () => {
    const cards: ReportCard[] = Array.from({ length: MAX_CARDS + 1 }, (_, i) => card({ id: `c${i}` }))
    expect(validateConfig({ cards }, ALLOWED)).toBe('count')
    expect(validateConfig({ cards: cards.slice(0, MAX_CARDS) }, ALLOWED)).toBeNull()
  })
})

describe('addCard / removeCard（不可变增删）', () => {
  it('addCard 追加并保留原数组不变', () => {
    const base = [card()]
    const next = addCard(base, card({ id: 'c2', sourceKey: 'user_growth' }))
    expect(next).toHaveLength(2)
    expect(base).toHaveLength(1)
    expect(next[1].id).toBe('c2')
  })

  it('addCard 缺 id 时自动生成', () => {
    const c = { ...card(), id: '' }
    const next = addCard([], c)
    expect(next[0].id).not.toBe('')
    expect(genCardId()).not.toBe('')
  })

  it('removeCard 按 id 删除', () => {
    const base = [card({ id: 'a' }), card({ id: 'b', sourceKey: 'user_growth' })]
    const next = removeCard(base, 'a')
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('b')
    expect(base).toHaveLength(2)
  })

  it('removeCard id 不存在时返回等长新数组', () => {
    const base = [card()]
    const next = removeCard(base, 'nope')
    expect(next).toHaveLength(1)
    expect(next).not.toBe(base)
  })
})

describe('sizeToGridClass', () => {
  it('尺寸映射网格 class', () => {
    expect(sizeToGridClass({ w: 1, h: 1 })).toBe('col-span-1 row-span-1')
    expect(sizeToGridClass({ w: 2, h: 1 })).toBe('col-span-2 row-span-1')
    expect(sizeToGridClass({ w: 2, h: 2 })).toBe('col-span-2 row-span-2')
  })
})
