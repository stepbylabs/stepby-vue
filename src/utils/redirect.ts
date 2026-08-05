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
