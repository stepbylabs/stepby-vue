/**
 * 安全重定向路径校验
 *
 * 用途：防御开放重定向（Open Redirect）与协议相对路径攻击。
 * 仅允许以单个正斜杠 `/` 开头的相对路径，拒绝：
 *  - 不以 `/` 开头（绝对 URL、协议 scheme 等）
 *  - `//` 开头的协议相对路径（如 `//evil.com`）
 *  - `/\` 或 `/\\` 开头的反斜杠变体（部分浏览器会归一化为 `//host`）
 *
 * @param path 待校验的重定向目标
 * @returns 安全返回 true，否则 false（调用方应回落到 `/`）
 */
export function isSafeRedirect(path: string | undefined | null): boolean {
  if (typeof path !== 'string' || path.length === 0) {
    return false
  }
  // 必须以单个正斜杠开头
  if (!path.startsWith('/')) {
    return false
  }
  const rest = path.slice(1)
  // 第二个字符不能是 / 或 \（防御 // 协议相对路径与 /\\ 反斜杠变体）
  if (rest.length > 0 && (rest[0] === '/' || rest[0] === '\\')) {
    return false
  }
  return true
}

/** 后端协议路由（非 SPA 路由）的登录回跳入口精确白名单。 */
const BACKEND_LOGIN_TARGETS = ['/sso/authorize', '/sso/logout'] as const

/**
 * 登录成功后的回跳决策（纯函数，login.vue 消费，单测钉死）。
 *
 * - 非法/缺失 redirect 一律回落 `/`（开放重定向防护）。
 * - `backend`：OIDC Provider 协议端点。它不是 SPA 路由，router.push 会命中 404 catch-all，
 *   且对象形式 `{ path }` 会丢弃内嵌 query——必须 `window.location.href` 整页交给后端
 *   （此时会话 Cookie 已写入，后端据此继续 authorize/logout）。
 *   用**静态入口白名单**判定而非 `router.resolve` 命中态：/login 在白名单里守卫不注册
 *   动态路由，登录瞬间 resolve 任何正常 SPA 路径都会误判为 catch-all。
 * - `spa`：以**字符串**形式导航，保留 target 内嵌的 query/hash。
 */
export function resolveLoginTarget(redirect: string | undefined | null): { kind: 'spa' | 'backend'; target: string } {
  const target = isSafeRedirect(redirect) ? (redirect as string) : '/'
  const targetPath = target.split('?')[0].split('#')[0]
  const kind = (BACKEND_LOGIN_TARGETS as readonly string[]).includes(targetPath) ? 'backend' : 'spa'
  return { kind, target }
}
