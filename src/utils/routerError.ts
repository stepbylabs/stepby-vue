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
import { getItem, setItem } from '@/utils/webStorage'

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
 * 自动刷新的去重窗口（毫秒）。
 *
 * 为什么是 60 秒而不是"这个标签页只刷一次"（改造前的行为）：CDN 抖动通常在秒级恢复，
 * 而"永久标记"意味着**同一天**内第二次真实的 chunk 失效（再次发版）不会再自动恢复，
 * 用户只能手动刷新——原实现在"防循环"与"能恢复"之间只选了前者。
 * 取 60s 而不是更短：一次 index.html + 入口 chunk 的重下在慢网里就要十几秒，
 * 窗口必须明显长于"一次刷新的耗时"，否则循环防护形同虚设。
 */
const RELOAD_GUARD_MS = 60_000

/**
 * 判定是否处于自动刷新去重窗口内（纯函数，`now` 由调用方给）。
 *
 * 三条取值口径各自有理由：
 * - **取最新的一条**标记而不是"任意一条"：标记写在各通道上，最旧的那条早已过期，
 *   拿它判会把"刚刷过"读成"很久没刷"⇒ 放行第二次刷新 = 循环。
 * - **不可解析的时间戳按"刚刚刷过"处理**（fail-closed）：宁可少刷一次（用户手动刷新即可恢复），
 *   也不能多刷（无限刷新循环会把站点打成自造 DDoS）。
 * - **恰好等于窗口边界算已过期**（`>=`）：边界抖动不该变成"永远卡在窗口里"。
 */
export function shouldSuppressAutoReload(markers: (string | null | undefined)[], now: number): boolean {
  let latest = Number.NaN
  let sawMarker = false
  for (const raw of markers) {
    if (raw == null || raw === '') {
      continue
    }
    sawMarker = true
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      return true
    }
    if (!Number.isFinite(latest) || parsed > latest) {
      latest = parsed
    }
  }
  if (!sawMarker) {
    return false
  }
  return now - latest < RELOAD_GUARD_MS
}

/** 读全部去重标记：`sessionStorage` 是主通道，`window.name` 是存储被禁时的备通道。 */
function readMarkers(): (string | null)[] {
  return [getItem(CHUNK_RELOAD_FLAG, 'session'), windowNameFlag()]
}

/**
 * `window.name` 兜底。
 *
 * 为什么用它：它在**同一标签页内跨导航/刷新保留**，而完全不依赖 Storage API——
 * 隐私模式/站点数据被禁时 `sessionStorage.setItem` 是静默失败的（`getItem` 回 null），
 * 于是"最多刷一次"这个防护就没了，剩下的只有无限刷新。读它同样要包 try/catch：
 * 跨源沙箱 iframe 里访问 `window.name` 会抛。
 */
function windowNameFlag(): string | null {
  try {
    return window.name || null
  } catch {
    return null
  }
}

function writeWindowNameFlag(value: string): void {
  try {
    window.name = value
  } catch {
    /* 读不到也写不进：只剩主通道的判定，见 reloadOnChunkError 的返回值 */
  }
}

/**
 * chunk 加载失败时整页重新加载当前页，拉取最新 index.html + chunk。
 *
 * 返回**是否真的发起了刷新**，让调用方（`router.onError`）能诚实收尾：
 * 没刷出去时至少留一条"请手动刷新"的控制台线索，而不是让用户面对一次静默的失败。
 * 刻意**不**在这里跳转到错误页——错误页本身也是懒加载 chunk，在"旧 index.html + chunk 全 404"
 * 这个场景里它可能同样加载失败，于是在 onError 里再触发 onError（本模块要防的正是循环）。
 *
 * 用 `window.location.reload()` 而非 `window.location.href = to.fullPath`，
 * 因为 chunk 失败、路由尚未解析时，刷新当前页比跳转到目标路由更可靠。
 */
export function reloadOnChunkError(now = Date.now()): boolean {
  if (shouldSuppressAutoReload(readMarkers(), now)) {
    return false
  }
  const stamp = String(now)
  // 两条通道都写：主通道成功时备通道只是冗余，主通道被禁时它是唯一的循环防护
  const persisted = setItem(CHUNK_RELOAD_FLAG, stamp, 'session')
  writeWindowNameFlag(stamp)
  if (!persisted && windowNameFlag() !== stamp) {
    // 两条通道都不可用 ⇒ 没有任何跨刷新的记忆，刷出去就是无界循环。
    // 这里选择**不自动刷新**，把决定权交回用户（错误页上的"刷新重试"按钮）。
    return false
  }
  window.location.reload()
  return true
}
