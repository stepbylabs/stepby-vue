import Cookies, { type CookieAttributes } from 'js-cookie'

const TokenKey = 'Admin-Token'

// Cookie 安全属性：防止 CSRF（SameSite=Lax）与中间人嗅探（Secure）
// Secure 仅在 HTTPS 协议下启用；HTTP（本地开发或未启用 HTTPS 的生产）下禁用，
// 否则浏览器会拒绝设置 cookie，导致登录 token 无法保存。
const isHttpsEnvironment = typeof window !== 'undefined' && window.location.protocol === 'https:'
const COOKIE_OPTIONS: CookieAttributes = {
  secure: isHttpsEnvironment,
  sameSite: 'lax'
}

export function getToken(): string | undefined {
  return Cookies.get(TokenKey)
}

export function setToken(token: string): string | undefined {
  return Cookies.set(TokenKey, token, COOKIE_OPTIONS)
}

export function removeToken(): void {
  Cookies.remove(TokenKey, COOKIE_OPTIONS)
}
