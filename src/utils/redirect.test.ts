import { describe, it, expect } from 'vitest'
import { isSafeRedirect, resolveLoginTarget } from '@/utils/redirect'

describe('isSafeRedirect', () => {
  it('接受单 / 开头的相对路径（含查询与哈希）', () => {
    expect(isSafeRedirect('/index')).toBe(true)
    expect(isSafeRedirect('/sso/authorize?client_id=a&scope=openid')).toBe(true)
    expect(isSafeRedirect('/system/user#anchor')).toBe(true)
  })

  it('拒绝空值、非字符串语义与缺失', () => {
    expect(isSafeRedirect('')).toBe(false)
    expect(isSafeRedirect(undefined)).toBe(false)
    expect(isSafeRedirect(null)).toBe(false)
  })

  it('拒绝绝对 URL 与协议 scheme', () => {
    expect(isSafeRedirect('http://evil.test/x')).toBe(false)
    expect(isSafeRedirect('https://evil.test/x')).toBe(false)
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false)
    expect(isSafeRedirect('data:text/html,x')).toBe(false)
  })

  it('拒绝协议相对路径与反斜杠变体', () => {
    expect(isSafeRedirect('//evil.test')).toBe(false)
    expect(isSafeRedirect('/\\evil.test')).toBe(false)
  })
})

describe('resolveLoginTarget', () => {
  it('安全 SPA 路径 → spa + 原样保留内嵌 query/hash（字符串导航不丢参）', () => {
    expect(resolveLoginTarget('/system/user?deptId=1&status=0#a')).toEqual({
      kind: 'spa',
      target: '/system/user?deptId=1&status=0#a'
    })
  })

  it('后端协议路由（SSO authorize/logout）→ backend 整页跳转，query 保留', () => {
    expect(resolveLoginTarget('/sso/authorize?client_id=app_1&redirect_uri=http%3A%2F%2Frp%2Fcb').kind).toBe('backend')
    expect(resolveLoginTarget('/sso/logout?id_token_hint=abc').kind).toBe('backend')
    // 带查询的原串必须完整透传给 location.href
    expect(resolveLoginTarget('/sso/logout?post_logout_redirect_uri=%2F').target).toBe(
      '/sso/logout?post_logout_redirect_uri=%2F'
    )
  })

  it('非法/缺失 redirect → 回落 /（开放重定向防护）', () => {
    expect(resolveLoginTarget('http://evil.test')).toEqual({ kind: 'spa', target: '/' })
    expect(resolveLoginTarget('//evil.test')).toEqual({ kind: 'spa', target: '/' })
    expect(resolveLoginTarget(undefined)).toEqual({ kind: 'spa', target: '/' })
    expect(resolveLoginTarget(null)).toEqual({ kind: 'spa', target: '/' })
    expect(resolveLoginTarget('')).toEqual({ kind: 'spa', target: '/' })
  })

  it('SPA 路由前缀相似但非后端端点 → 不误判为 backend', () => {
    // /sso-consent 是 SPA 路由（无第二个 /），绝不能整页刷新
    expect(resolveLoginTarget('/sso-consent?clientId=app_1').kind).toBe('spa')
    expect(resolveLoginTarget('/sso/authorization-code-ish/1').kind).toBe('spa')
    expect(resolveLoginTarget('/oauth2/callback').kind).toBe('spa')
  })
})
