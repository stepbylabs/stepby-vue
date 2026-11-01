import { describe, expect, it } from 'vitest'
import { invalidRecipients, isRecipientValid, recipientProblem, splitRecipients } from '@/utils/emailRecipients'

/**
 * 收件人判据的行为表（b144）：**与 `sys_report_service.rs` 的 `test_is_valid_email_matches_frontend_mirror`
 * 同一张表**，两侧各自验证自己的实现；跨仓的"这张表有没有被单方面改掉"由
 * `emailMirror.guard.test.ts` 反向核对。
 */
const VALID = ['a@example.com', 'ops@mail', 'root@localhost', 'a@b@c', 'x@y', 'a+b@domain', 'a@123', '用户@例え.jp']

const INVALID = ['a b@example.com', '@example.com', 'a@', 'no-at-sign', '', '   ', 'a@b c.com']

describe('splitRecipients：与服务端 split_emails 同语义', () => {
  it('按逗号拆分、逐段去空白、丢弃空段，且保持顺序', () => {
    expect(splitRecipients(' a@b.com ,, c@d.com ,')).toEqual(['a@b.com', 'c@d.com'])
    expect(splitRecipients(' , , ')).toEqual([])
    expect(splitRecipients('')).toEqual([])
    expect(splitRecipients(null)).toEqual([])
    expect(splitRecipients(undefined)).toEqual([])
  })

  it('单段不含逗号时原样保留（trim 后）', () => {
    expect(splitRecipients('  ops@mail  ')).toEqual(['ops@mail'])
  })
})

describe('isRecipientValid：镜像服务端尺（既不加严也不放宽）', () => {
  it.each(VALID)('合法收件人必须接受：%s', (email) => {
    expect(isRecipientValid(email)).toBe(true)
  })
  it.each(INVALID)('非法收件人必须拒绝：%s', (email) => {
    expect(isRecipientValid(email)).toBe(false)
  })

  it('对照：通用邮箱正则会拒绝的自托管形态，这一把必须接受（放宽方向是缺陷的成因）', () => {
    const naiveEmailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    // 这条断言的目的是"两张尺的差异是已知且被登记的"：若哪天有人把镜像换成通用正则，
    // 下面这三个值会同时变成 false，本条用例立刻红。
    expect(naiveEmailRe.test('ops@mail')).toBe(false)
    expect(naiveEmailRe.test('root@localhost')).toBe(false)
    expect(naiveEmailRe.test('a@123')).toBe(false)
    for (const email of ['ops@mail', 'root@localhost', 'a@123']) {
      expect(isRecipientValid(email), `镜像尺必须接受 ${email}`).toBe(true)
    }
  })

  it('表本身不得空转（用例表被清空时这条会红）', () => {
    expect(VALID.length).toBeGreaterThanOrEqual(8)
    expect(INVALID.length).toBeGreaterThanOrEqual(7)
  })
})

describe('recipientProblem / invalidRecipients：表单文案需要的两件事', () => {
  it('选了邮件通道但一个收件人没有 ⇒ empty（服务端同样是 400）', () => {
    expect(recipientProblem('')).toBe('empty')
    expect(recipientProblem(' , , ')).toBe('empty')
    expect(recipientProblem(null)).toBe('empty')
  })

  it('有项但含非法项 ⇒ invalid，且只点名非法的那几项（不整批连坐）', () => {
    expect(recipientProblem('a@b.com, bad mail, c@d.com')).toBe('invalid')
    expect(invalidRecipients('a@b.com, bad mail, c@d.com')).toEqual(['bad mail'])
    expect(invalidRecipients('a@b.com,c@d.com')).toEqual([])
  })

  it('全部合法 ⇒ null（这是保存路径的放行条件）', () => {
    expect(recipientProblem('a@b.com, ops@mail')).toBeNull()
    expect(invalidRecipients(undefined)).toEqual([])
  })
})
