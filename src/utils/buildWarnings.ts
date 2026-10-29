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

/** 已知坏族：code ⇒ 在这棵树上"为什么一定有问题"（逐条可证伪，不写笼统理由） */
export const FATAL_BUNDLE_WARNING_CODES: Record<string, string> = {
  INEFFECTIVE_DYNAMIC_IMPORT:
    '动态 import 的目标已经被静态导入 ⇒ 懒加载 chunk 根本不存在，分包/首屏预算量到的是另一棵依赖图（b123 实证）',
  CIRCULAR_DEPENDENCY:
    'ESM 循环依赖靠 live binding，初始化顺序一变就是 TDZ「Cannot access before initialization」运行时白屏',
  MISSING_EXPORT: '被导入的名字在目标模块里不存在 ⇒ 打包不报错、运行时拿到 undefined 才崩',
  UNRESOLVED_IMPORT: '导入路径解析不到，产物里留下一个跑起来才 404 的请求',
  EVAL: "本站 CSP 是 script-src 'self'，eval/new Function 在生产环境必然被浏览器拒绝（dev 能跑、上线必挂）"
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
