import { describe, it, expect } from 'vitest'
import {
  sanitizePageUrl,
  redactTelemetryText,
  MAX_TELEMETRY_PAGE_URL_CHARS,
  __testables
} from '@/utils/telemetrySanitize'

/**
 * b132：遥测脱敏的判据。
 *
 * 立案证据（开发库实测）：`sys_frontend_error.page_url` 里 39,039 行带查询串，
 * `userName=` 命中 2,112 行——列表页按用户名/手机号搜索时的一次 JS 错误，
 * 就把用户输入持久化进管理端遥测表。
 */
describe('telemetrySanitize', () => {
  describe('sanitizePageUrl', () => {
    it('保留 origin/path 与参数名，查询值一律遮蔽', () => {
      expect(sanitizePageUrl('http://localhost:8080/system/user?pageNum=1&pageSize=10&userName=e2e_view_abc')).toBe(
        'http://localhost:8080/system/user?pageNum=***&pageSize=***&userName=***'
      )
    })

    it('凭据类查询键连键一起丢弃（code/state/token/ticket/secret…）', () => {
      const out = sanitizePageUrl(
        'https://sso.example.com/callback?code=abc123&state=xyz&access_token=tok&ticket=t1&redirect=/home'
      )
      expect(out).toBe('https://sso.example.com/callback?redirect=***')
      expect(out).not.toContain('abc123')
      expect(out).not.toContain('xyz')
      expect(out).not.toContain('tok')
      expect(out).not.toContain('t1')
    })

    it('hash 整段丢弃（前端路由不用 hash，留下只是未审查通道）', () => {
      expect(sanitizePageUrl('http://h/system/post?postCode=a1#/inner?token=abc')).toBe(
        'http://h/system/post?postCode=***'
      )
    })

    it('相对地址只保留 path，不虚构 origin；畸形输入退化为去查询串且不抛错', () => {
      expect(sanitizePageUrl('/system/role?roleName=admin')).toBe('/system/role?roleName=***')
      // 带空格的非绝对串按相对 URL 解析（path 被编码），凭据键仍被丢弃、值不出现在结果里
      expect(sanitizePageUrl('not a url ?token=abc')).toBe('/not%20a%20url%20')
      // 连 URL 解析都抛错的输入走兜底：只切掉查询串，不抛到调用方
      expect(sanitizePageUrl('http://[?token=abc')).toBe('http://[')
    })

    it('空值/纯路径原样（纯路径无查询值可泄露）', () => {
      expect(sanitizePageUrl('')).toBe('')
      expect(sanitizePageUrl(undefined)).toBe('')
      expect(sanitizePageUrl('http://h/monitor/online')).toBe('http://h/monitor/online')
    })

    it('超长地址按字符截断且不切碎多字节字符', () => {
      const long = `http://h/p?${Array.from({ length: 200 }, (_, i) => `k${i}=v${i}`).join('&')}`
      const out = sanitizePageUrl(long)
      expect(Array.from(out).length).toBeLessThanOrEqual(MAX_TELEMETRY_PAGE_URL_CHARS)
      expect(out.endsWith('…')).toBe(true)
      expect(out.startsWith('http://h/p?k0=***')).toBe(true)
    })

    it('参数值为空时不产生 `k=***` 噪声（空值没有可泄露内容）', () => {
      expect(sanitizePageUrl('http://h/a?empty=&x=1')).toBe('http://h/a?x=***')
    })
  })

  describe('redactTelemetryText', () => {
    it('消息/堆栈里的查询值同样遮蔽（请求 URL 会嵌进错误文本）', () => {
      expect(redactTelemetryText('Resource load failed: IMG http://h/avatar.png?token=SECRET&size=64')).toBe(
        'Resource load failed: IMG http://h/avatar.png?token=***&size=***'
      )
      expect(redactTelemetryText('GET /system/user/list?phonenumber=13800000000 failed')).toBe(
        'GET /system/user/list?phonenumber=*** failed'
      )
    })

    it('普通文本（无查询对）逐字符不变，含等号的散文也不被误伤成整段遮蔽', () => {
      const plain = 'TypeError: Cannot read properties of undefined (reading "length")'
      expect(redactTelemetryText(plain)).toBe(plain)
      const prose = 'a=1 is not a query (no ? or & prefix)'
      expect(redactTelemetryText(prose)).toBe(prose)
    })

    it('已经遮蔽过的文本保持幂等', () => {
      const once = redactTelemetryText('x?userName=***&y=1')
      expect(once).toBe('x?userName=***&y=***')
      expect(redactTelemetryText(once)).toBe(once)
    })

    it('空值原样返回', () => {
      expect(redactTelemetryText('')).toBe('')
      expect(redactTelemetryText(undefined)).toBe('')
    })
  })

  describe('敏感性判定', () => {
    it('大小写不敏感，且只认凭据语义的键', () => {
      expect(__testables.isSensitiveQueryKey('CODE')).toBe(true)
      expect(__testables.isSensitiveQueryKey('Access_Token')).toBe(true)
      expect(__testables.isSensitiveQueryKey('userName')).toBe(false)
      expect(__testables.isSensitiveQueryKey('pageNum')).toBe(false)
    })
  })
})
