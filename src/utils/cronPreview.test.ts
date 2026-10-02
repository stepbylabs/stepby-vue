import { describe, it, expect } from 'vitest'
import { nextFireTimes } from './cronPreview'

// 固定基准时刻：2026-03-15 10:30:20（周日，JS getDay()=0）
const FROM = new Date(2026, 2, 15, 10, 30, 20, 0)

describe('utils/cronPreview', () => {
  it('returns null for malformed expressions', () => {
    expect(nextFireTimes('', 5, FROM)).toBeNull()
    expect(nextFireTimes('* * * *', 5, FROM)).toBeNull() // 少于 6 段
    expect(nextFireTimes('* * * * * * * *', 5, FROM)).toBeNull() // 多于 7 段
    expect(nextFireTimes('60 * * * * *', 5, FROM)).toBeNull() // 秒越界
    expect(nextFireTimes('a b c d e f', 5, FROM)).toBeNull() // 非数字
    expect(nextFireTimes('0 0 0 * * 1-#', 5, FROM)).toBeNull() // 非法字符
    expect(nextFireTimes('0 0 0 * * MON', 5, FROM)).toBeNull() // 不支持英文名
  })

  it('computes next times for a fixed daily expression', () => {
    const times = nextFireTimes('0 0 8 * * ?', 3, FROM)!
    expect(times).toHaveLength(3)
    expect(times[0]).toEqual(new Date(2026, 2, 16, 8, 0, 0))
    expect(times[1]).toEqual(new Date(2026, 2, 17, 8, 0, 0))
    expect(times[2]).toEqual(new Date(2026, 2, 18, 8, 0, 0))
  })

  it('includes the same-day later slot and skips earlier slots', () => {
    const times = nextFireTimes('0 30 12 * * ?', 1, FROM)! // 今天 12:30
    expect(times[0]).toEqual(new Date(2026, 2, 15, 12, 30, 0))
  })

  it('supports lists, ranges and steps', () => {
    // 分钟单值 45 → 今天 10:45 晚于基准 10:30:20，即为下一次
    const t1 = nextFireTimes('0 45 10 * * *', 1, FROM)!
    expect(t1[0]).toEqual(new Date(2026, 2, 15, 10, 45, 0))
    // 步长 0/20 秒 → 基准秒 20 之后的下一个匹配秒为 40
    const t2 = nextFireTimes('0/20 30 10 * * *', 1, FROM)!
    expect(t2[0]).toEqual(new Date(2026, 2, 15, 10, 30, 40))
    // 范围 20-40 秒 → 下一匹配 21 秒
    const t3 = nextFireTimes('20-40 30 10 * * *', 1, FROM)!
    expect(t3[0]).toEqual(new Date(2026, 2, 15, 10, 30, 21))
  })

  it('matches day-of-week with 0=Sunday and 7 normalized to Sunday', () => {
    // FROM 是周日（getDay()=0）：下一个周三是 2026-03-18
    const wed = nextFireTimes('0 0 0 ? * 3', 1, FROM)!
    expect(wed[0]).toEqual(new Date(2026, 2, 18, 0, 0, 0))
    // 7 归一化为周日：下一个周日是 2026-03-22
    const sun = nextFireTimes('0 0 0 ? * 7', 1, FROM)!
    expect(sun[0]).toEqual(new Date(2026, 2, 22, 0, 0, 0))
  })

  it('filters by optional year field', () => {
    const times = nextFireTimes('0 0 0 1 1 * 2027', 1, FROM)!
    expect(times[0]).toEqual(new Date(2027, 0, 1, 0, 0, 0))
  })

  it('returns empty array for never-firing expressions and null for invalid day', () => {
    // 2 月 30 日不存在 → 5 年窗口内无触发
    expect(nextFireTimes('0 0 0 30 2 *', 5, FROM)).toEqual([])
    // 日越界直接判定非法
    expect(nextFireTimes('0 0 0 32 * *', 5, FROM)).toBeNull()
  })

  it('supports count=1 shortcut and honors the count parameter', () => {
    expect(nextFireTimes('* * * * * *', 1, FROM)).toHaveLength(1)
    expect(nextFireTimes('* * * * * *', 7, FROM)).toHaveLength(7)
  })
})
