/**
 * 前端路由 chunk 加载失败判定与兜底刷新。
 *
 * 背景：部署后前端资源文件名带 hash，用户带着旧的 index.html / 旧路由访问时，
 * 懒加载的代码分包（chunk）可能 404，导致动态 import 失败。此时需要整页重新加载，
 * 让浏览器拉取最新的 index.html 与新 chunk，否则会白屏。
 *
 * 注意：这是 history 模式下 `router.onError` 的**兜底**逻辑，只在导航出错时触发，
 * 正常侧边栏跳转、动态权限路由、深链刷新都不会进入此分支（不会整页刷新）。
 */

/** 匹配各类 chunk 加载失败的错误信息 */
const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Loading chunk .* failed|Importing a module script failed/

/**
 * 判断一个错误是否为前端 chunk 加载失败。
 * 仅当 error 是 Error 实例且消息匹配已知模式时返回 true。
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return CHUNK_LOAD_ERROR_PATTERN.test(error.message)
}

const CHUNK_RELOAD_FLAG = '__router_chunk_reload__'

/**
 * chunk 加载失败时整页重新加载当前页，拉取最新 index.html + chunk。
 *
 * 用 sessionStorage 标记，确保整个标签页会话最多自动刷新一次，
 * 避免 CDN/资源持续不可用时陷入无限刷新循环（即原注释“避免循环刷新”的语义）。
 * 改用 `window.location.reload()` 而非 `window.location.href = to.fullPath`，
 * 因为 chunk 失败、路由尚未解析时，刷新当前页比跳转到目标路由更可靠。
 */
export function reloadOnChunkError(): void {
  if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
  window.location.reload()
}
