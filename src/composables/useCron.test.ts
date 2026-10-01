import { describe, it, expect } from 'vitest'

// useCron 为纯逻辑模块：仅 `import type { CronValue } from '@/types/cron'`（编译期擦除），
// 不引入 element-plus / i18n / request 等重依赖，因此无需 mock，直接按具名导入测试。
import {
  DEFAULT_CRON_VALUE,
  checkNumber,
  isWildcard,
  isUnspecified,
  isEmpty,
  isCycle,
  isAverage,
  isWorkday,
  isLastDay,
  isWeekHash,
  isLastWeek,
  parseCycle,
  parseAverage,
  parseList,
  parseCronExpression,
  stringifyCronValue,
  useCron,
  type CronValue
} from './useCron'

// ============================================================================
// Crontab 共享工具逻辑 useCron
// ============================================================================
// 覆盖：数字校验/夹取、各类表达式判定、周期/步长/列表解析、
// cron 表达式解析与序列化的往返一致性，以及 useCron() 入口聚合。
// ============================================================================

describe('composables/useCron', () => {
  describe('DEFAULT_CRON_VALUE', () => {
    it('为完整的 7 字段默认对象，week 为 "?"、year 为空', () => {
      expect(DEFAULT_CRON_VALUE).toEqual({
        second: '*',
        min: '*',
        hour: '*',
        day: '*',
        month: '*',
        week: '?',
        year: ''
      })
    })
  })

  describe('checkNumber', () => {
    it('向下取整', () => {
      expect(checkNumber(3.9, 0, 59)).toBe(3)
      expect(checkNumber(-0.5, 0, 59)).toBe(0) // Math.floor(-0.5) = -1 -> 夹到 min
    })

    it('低于下界夹到 minLimit', () => {
      expect(checkNumber(-100, 0, 59)).toBe(0)
    })

    it('高于上界夹到 maxLimit', () => {
      expect(checkNumber(100, 0, 59)).toBe(59)
    })

    it('区间内保持原值（含边界）', () => {
      expect(checkNumber(30, 0, 59)).toBe(30)
      expect(checkNumber(0, 0, 59)).toBe(0) // 等于下界不触发 < 分支
      expect(checkNumber(59, 0, 59)).toBe(59) // 等于上界不触发 > 分支
    })
  })

  describe('表达式判定函数', () => {
    it('isWildcard 仅 "*" 为真', () => {
      expect(isWildcard('*')).toBe(true)
      expect(isWildcard('1')).toBe(false)
      expect(isWildcard('?')).toBe(false)
    })

    it('isUnspecified 仅 "?" 为真', () => {
      expect(isUnspecified('?')).toBe(true)
      expect(isUnspecified('*')).toBe(false)
    })

    it('isEmpty 仅空字符串为真', () => {
      expect(isEmpty('')).toBe(true)
      expect(isEmpty('0')).toBe(false)
    })

    it('isCycle 含 "-" 为真', () => {
      expect(isCycle('0-5')).toBe(true)
      expect(isCycle('5')).toBe(false)
    })

    it('isAverage 含 "/" 为真', () => {
      expect(isAverage('0/5')).toBe(true)
      expect(isAverage('0-5')).toBe(false)
    })

    it('isWorkday 含 "W" 为真', () => {
      expect(isWorkday('5W')).toBe(true)
      expect(isWorkday('W')).toBe(true)
      expect(isWorkday('5')).toBe(false)
    })

    it('isLastDay 值严格为 "L"（区分大小写）', () => {
      expect(isLastDay('L')).toBe(true)
      expect(isLastDay('l')).toBe(false)
      expect(isLastDay('15')).toBe(false)
    })

    it('isWeekHash 含 "#" 为真', () => {
      expect(isWeekHash('5#3')).toBe(true)
      expect(isWeekHash('#')).toBe(true)
      expect(isWeekHash('5')).toBe(false)
    })

    it('isLastWeek 含 "L" 为真', () => {
      expect(isLastWeek('5L')).toBe(true)
      expect(isLastWeek('L')).toBe(true)
      expect(isLastWeek('5')).toBe(false)
    })
  })

  describe('parseCycle', () => {
    it('解析 "a-b" -> [a, b]', () => {
      expect(parseCycle('0-5')).toEqual([0, 5])
      expect(parseCycle('10-20')).toEqual([10, 20])
    })

    it('非法输入得到 NaN（调用方应先用 isCycle 判断）', () => {
      const [a, b] = parseCycle('a-b')
      expect(a).toBeNaN()
      expect(b).toBeNaN()
    })
  })

  describe('parseAverage', () => {
    it('解析 "a/b" -> [a, b]', () => {
      expect(parseAverage('0/5')).toEqual([0, 5])
    })

    it('通配起点 "*/5" -> [NaN, 5]', () => {
      const [a, b] = parseAverage('*/5')
      expect(a).toBeNaN()
      expect(b).toBe(5)
    })
  })

  describe('parseList', () => {
    it('解析逗号分隔数字', () => {
      expect(parseList('1,2,3')).toEqual([1, 2, 3])
    })

    it('自动去重并保持首次出现顺序', () => {
      expect(parseList('1,2,2,3,1')).toEqual([1, 2, 3])
    })

    it('过滤非数字项（NaN）', () => {
      expect(parseList('1,a,3')).toEqual([1, 3])
      expect(parseList('*')).toEqual([]) // Number('*')=NaN -> 被过滤
    })

    it('保留合法的 0', () => {
      expect(parseList('1,0,2')).toEqual([1, 0, 2])
    })

    // 注意（源码潜在缺陷，见最终报告）：空字符串经 Number('') 得到 0，
    // 不会被 NaN 过滤掉，最终返回 [0]，与注释宣称的"过滤空字符串"不符。
    it("空字符串返回 []（已修复：不再因 Number('')===0 误产出 [0]）", () => {
      expect(parseList('')).toEqual([])
      // 纯空白 / 逗号也应被剔除，仅保留真正合法的数字
      expect(parseList(' , , ')).toEqual([])
      expect(parseList(' 1 , 2 ')).toEqual([1, 2])
    })
  })

  describe('parseCronExpression', () => {
    it('空表达式返回 null', () => {
      expect(parseCronExpression('')).toBeNull()
    })

    it('字段不足 6 位返回 null', () => {
      expect(parseCronExpression('* * * * *')).toBeNull()
      expect(parseCronExpression('0 15 10')).toBeNull()
    })

    it('6 位表达式解析，year 归一为空字符串', () => {
      expect(parseCronExpression('0 15 10 ? * *')).toEqual<CronValue>({
        second: '0',
        min: '15',
        hour: '10',
        day: '?',
        month: '*',
        week: '*',
        year: ''
      })
    })

    it('7 位表达式解析出 year 字段', () => {
      const parsed = parseCronExpression('0 15 10 ? * * 2025')
      expect(parsed).not.toBeNull()
      expect(parsed!.year).toBe('2025')
    })

    it('多个空格也能正确分割（/\\s+/）', () => {
      const parsed = parseCronExpression('0   15  10   ?   *   *')
      expect(parsed).not.toBeNull()
      expect(parsed).toMatchObject({ second: '0', min: '15', hour: '10', day: '?', month: '*', week: '*' })
    })
  })

  describe('stringifyCronValue', () => {
    it('year 为空时省略末尾年字段与多余空格', () => {
      expect(stringifyCronValue(DEFAULT_CRON_VALUE)).toBe('* * * * * ?')
    })

    it('year 非空时追加 " 年字段"', () => {
      expect(stringifyCronValue({ ...DEFAULT_CRON_VALUE, year: '2025' })).toBe('* * * * * ? 2025')
    })
  })

  describe('parse <-> stringify 往返一致', () => {
    it('6 位表达式往返无损', () => {
      const expr = '0 15 10 ? * *'
      expect(stringifyCronValue(parseCronExpression(expr)!)).toBe(expr)
    })

    it('7 位表达式往返无损', () => {
      const expr = '0 0 12 1 1 ? 2030'
      expect(stringifyCronValue(parseCronExpression(expr)!)).toBe(expr)
    })
  })

  describe('useCron() 聚合入口', () => {
    it('返回的默认值与具名常量同源', () => {
      expect(useCron().defaultValue).toBe(DEFAULT_CRON_VALUE)
    })

    it('返回的工具函数与具名导出为同一引用', () => {
      const cron = useCron()
      expect(cron.checkNumber).toBe(checkNumber)
      expect(cron.parseCycle).toBe(parseCycle)
      expect(cron.parseList).toBe(parseList)
      expect(cron.parseCronExpression).toBe(parseCronExpression)
      expect(cron.stringifyCronValue).toBe(stringifyCronValue)
      expect(cron.isWildcard).toBe(isWildcard)
      expect(cron.isLastDay).toBe(isLastDay)
      expect(cron.isWeekHash).toBe(isWeekHash)
    })

    it('通过入口返回的函数可正常执行', () => {
      const cron = useCron()
      expect(cron.checkNumber(50, 0, 5)).toBe(5)
      expect(cron.isCycle('1-2')).toBe(true)
    })
  })
})
