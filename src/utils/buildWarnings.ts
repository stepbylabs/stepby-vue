/**
 * 构建告警硬化（b124）
 *
 * 立案证据：b123 之前，`export const Layout = () => import('@/layout/index.vue')` 的 Layout
 * 早已被 main/permission 静态导入，构建器每次都会发 `INEFFECTIVE_DYNAMIC_IMPORT`——**连续三个批次
 * 没有任何人看见**（构建日志不进门禁、警告不参与退出码）。而它正是"首屏预算按分包后的体积记账"
 * 这一整套判据的前提：动态导入若被内联，分包根本没发生，预算量到的是另一棵依赖图。
 *
 * 判据形态：只把**已知坏族**升级为致命（抛错 ⇒ 构建失败 ⇒ 退出码非 0），未知告警仍走默认通道
 * ——"全部警告致命"会让第三方库的无害提示把构建永久染红，结局一定是有人把闸关掉。
 * 每个入册的 code 必须写清"为什么在这棵树上一定会出问题"，不许只写"重要"。
 *
 * ## b125 实测：每个 code 的"能不能响"逐个量过
 *
 * 光登记不够——一个**永远收不到**的 code 在代码里与一条真闸逐字节同形（AGENTS ⑯(c)）。
 * 本轮按"改回缺陷形状"逐个注入，结论：
 *
 * | code | 实测 |
 * |---|---|
 * | `EVAL` | 注入直接 `eval` ⇒ `[build-warning] EVAL …`，构建 EXIT=1（闸真的响） |
 * | `CIRCULAR_DEPENDENCY` | 两个临时模块互引 ⇒ `[build-warning] CIRCULAR_DEPENDENCY …`，EXIT=1 |
 * | `INEFFECTIVE_DYNAMIC_IMPORT` | b120 构建日志实证响过（`src/router/index.ts is dynamically imported by …/ErrorMonitor/index.vue`，四条日志各一条）；b124 + b125 共五种注入形状（入口模块、跨模块、懒加载组件内）**均未再复现** ⇒ 当前依赖图下收不到，日常防线是 b123 的形状锁（禁生产码 `import('@/router')`），本条目保留是因为它在同一棵树、同一构建器版本上确曾触发 |
 * | `MISSING_EXPORT` | 注入一个不存在的具名导入 ⇒ rolldown **硬错误** `Build failed with 1 error: [MISSING_EXPORT] …`，**不经 onwarn** |
 * | `UNRESOLVED_IMPORT` | 注入不存在的导入路径 ⇒ 构建器实际抛的是 `[UNLOADABLE_DEPENDENCY] …`（硬错误，名字也不同），**不经 onwarn** |
 *
 * 后两族由构建器自己阻断（比"抛错升级"更早更硬），继续留在 `FATAL_BUNDLE_WARNING_CODES`
 * 会制造"我们有一条判据在管它"的错觉 ⇒ 移入 `BUILDER_ENFORCED_BUNDLE_CODES` 只作说明。
 *
 * 刻意**不**入册的已知项：
 * - `SOURCEMAP_BROKEN`：Vite 8（rolldown）CSS 管线不产 map 的上游限制（vite.config.ts 已注明），
 *   入册等于让每次构建必红；
 * - `CIRCULAR_DEPENDENCY` 之外的库内噪音类（如 `UNUSED_EXTERNAL_IMPORT`）不改变本仓行为。
 */
export interface BundleWarningLike {
  code?: string
  message?: string
  id?: string
  ids?: string[]
}

/** 已知坏族（**经 onwarn 到达**）：code ⇒ 在这棵树上"为什么一定有问题"（逐条可证伪，不写笼统理由） */
export const FATAL_BUNDLE_WARNING_CODES: Record<string, string> = {
  INEFFECTIVE_DYNAMIC_IMPORT:
    '动态 import 的目标已经被静态导入 ⇒ 懒加载 chunk 根本不存在，分包/首屏预算量到的是另一棵依赖图（b120 构建日志实证触发；b123 形状锁为日常防线）',
  CIRCULAR_DEPENDENCY:
    'ESM 循环依赖靠 live binding，初始化顺序一变就是 TDZ「Cannot access before initialization」运行时白屏（b125 注入互引实测转红）',
  EVAL: "本站 CSP 是 script-src 'self'，eval/new Function 在生产环境必然被浏览器拒绝（dev 能跑、上线必挂）（b125 注入直接 eval 实测转红）"
}

/**
 * 构建器**自己**以硬错误阻断、永远不会经过 onwarn 的坏族（b125 实测）。
 *
 * 登记它们不是闸，而是把"为什么不在 `FATAL_BUNDLE_WARNING_CODES` 里"写清楚：
 * 把它们放进致命表，会让下一个人以为有一条判据守着（实际永远不触发）。
 * 值里记录的是**实测到的构建器行为与它给出的 code**，构建器升级后请重新量。
 */
export const BUILDER_ENFORCED_BUNDLE_CODES: Record<string, string> = {
  MISSING_EXPORT:
    '注入不存在的具名导入 ⇒ rolldown 1.2.15 直接 `Build failed with 1 error: [MISSING_EXPORT] …`（EXIT=1，不经 onwarn）',
  UNRESOLVED_IMPORT:
    '注入不存在的导入路径 ⇒ 实际错误码是 `UNLOADABLE_DEPENDENCY`（硬错误、EXIT=1），`UNRESOLVED_IMPORT` 这个 code 在当前构建器上不会被产出'
}

// 参数取宽类型：Vite/rolldown 的 `OnwarnFunction` 传的是 `RolldownLog | (() => RolldownLog)`
// 且 message 必填；判据只读 `code`，按宽类型接住再收窄。
// defaultHandler 的类型必须是 `never` 形参：严格函数参数逆变下，只有 `(never)=>void` 才
// 同时兼容 rolldown 的具体告警类型（写成 `(unknown)=>void` 会被 TS2769 拒绝）。
type DefaultWarnHandler = (warning: never) => void
export type BuildWarnHandler = (warning: unknown, defaultHandler?: DefaultWarnHandler) => void

function describe(warning: BundleWarningLike): string {
  const where = warning.id ?? warning.ids?.join(', ')
  const detail = warning.message ?? ''
  return where ? `${detail}（${where}）` : detail
}

/**
 * 只按 `code` 判、**不按 message 文本判**：文本是构建器的措辞（版本升级就变），
 * 而且「某条无害告警的正文里恰好提到这个名字」会把它误伤成致命。
 */
export function fatalBundleWarningReason(warning: BundleWarningLike): string | undefined {
  const code = warning?.code
  if (!code) return undefined
  return Object.prototype.hasOwnProperty.call(FATAL_BUNDLE_WARNING_CODES, code)
    ? FATAL_BUNDLE_WARNING_CODES[code]
    : undefined
}

/** rollup/rolldown 的 `onwarn(warning, defaultHandler)` 实现 */
export function createBuildWarningHandler(): BuildWarnHandler {
  return (rawWarning, defaultHandler) => {
    const warning = (rawWarning ?? {}) as BundleWarningLike
    const reason = fatalBundleWarningReason(warning)
    if (reason) {
      throw new Error(
        `[build-warning] ${warning.code} 不允许存在：${reason}。\n` +
          `构建随即失败（退出码非 0），请修根因而不是绕过。\n` +
          `具体告警：${describe(warning)}`
      )
    }
    if (typeof defaultHandler === 'function') (defaultHandler as (w: unknown) => void)(rawWarning)
    else console.warn('[build-warning]', warning.message ?? rawWarning)
  }
}
