import { describe, it, expect } from 'vitest'
import { WIDGET_REGISTRY, defaultLayout, normalizeLayout, moveById, nextSpan, SPAN_STEPS } from './dashboardLayout'

describe('dashboard/dashboardLayout', () => {
  it('注册表 id 唯一且与默认布局一一对应', () => {
    const ids = WIDGET_REGISTRY.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(defaultLayout().map((i) => i.id)).toEqual(ids)
    for (const item of defaultLayout()) {
      expect(item.visible).toBe(true)
      expect(SPAN_STEPS).toContain(item.span)
    }
  })

  it('非数组输入回退到默认布局', () => {
    expect(normalizeLayout(null)).toEqual(defaultLayout())
    expect(normalizeLayout({})).toEqual(defaultLayout())
    expect(normalizeLayout('nope')).toEqual(defaultLayout())
  })

  it('保留用户自定义顺序并丢弃未知 id', () => {
    const raw = [
      { id: 'operPie', span: 12, visible: true },
      { id: 'ghost', span: 8, visible: true },
      { id: 'stats', span: 24, visible: true }
    ]
    const out = normalizeLayout(raw)
    // operPie、stats 保留用户相对顺序；其余按默认顺序补到末尾
    expect(out.map((i) => i.id)).toEqual([
      'operPie',
      'stats',
      'quickEntry',
      'flowTodo',
      'loginTrend',
      'userTrend',
      'recentOperLog'
    ])
    const operPie = out.find((i) => i.id === 'operPie')
    expect(operPie?.span).toBe(12)
  })

  it('缺失的新增卡片按默认相对顺序补回', () => {
    // 用户仅存了前两张卡（模拟旧版本尚无 recentOperLog）
    const raw = [{ id: 'recentOperLog', span: 12, visible: true }]
    const out = normalizeLayout(raw)
    // recentOperLog 在注册表最后，用户仅留它 → 它排最前，其余按默认顺序补在其后
    expect(out[0].id).toBe('recentOperLog')
    expect(out.map((i) => i.id).slice(1)).toEqual([
      'stats',
      'quickEntry',
      'flowTodo',
      'loginTrend',
      'operPie',
      'userTrend'
    ])
  })

  it('非法宽度归一到合法档位，visible 强制布尔', () => {
    const raw = [
      { id: 'loginTrend', span: 999, visible: 'yes' },
      { id: 'operPie', span: 'abc' },
      { id: 'userTrend', visible: false }
    ]
    const out = normalizeLayout(raw)
    const login = out.find((i) => i.id === 'loginTrend')
    expect(SPAN_STEPS).toContain(login?.span)
    expect(login?.visible).toBe(true) // 'yes' !== false
    expect(out.find((i) => i.id === 'operPie')?.span).toBe(8) // 非法 → 默认
    expect(out.find((i) => i.id === 'userTrend')?.visible).toBe(false)
  })

  it('去重保留首次出现', () => {
    const raw = [
      { id: 'stats', span: 24 },
      { id: 'stats', span: 12 }
    ]
    const out = normalizeLayout(raw)
    expect(out.filter((i) => i.id === 'stats').length).toBe(1)
  })

  it('moveById 按 id 重排，越界/同项不变', () => {
    const base = defaultLayout()
    const moved = moveById(base, 'stats', 'userTrend')
    expect(moved[0].id).not.toBe('stats')
    expect(moved.findIndex((i) => i.id === 'userTrend')).toBeLessThan(moved.findIndex((i) => i.id === 'stats'))
    // 未知 id → 原样
    expect(moveById(base, 'nope' as never, 'stats')).toEqual(base)
    expect(moveById(base, 'stats', 'stats')).toEqual(base)
  })

  it('nextSpan 循环档位', () => {
    let s = SPAN_STEPS[0]
    const seq: number[] = []
    for (let i = 0; i < SPAN_STEPS.length + 1; i++) {
      seq.push(s)
      s = nextSpan(s)
    }
    expect(seq).toEqual([...SPAN_STEPS, SPAN_STEPS[0]])
  })
})
