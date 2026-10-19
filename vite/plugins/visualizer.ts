import { visualizer } from 'rollup-plugin-visualizer'
import type { PluginOption } from 'vite'

/**
 * 性能优化：Bundle 可视化分析工具
 *
 * 仅在 VITE_ANALYZE=true 时启用，不影响正常构建产物
 *
 * 使用方式：
 *   # 生成可视化分析报告到 dist/stats.html
 *   VITE_ANALYZE=true npm run build:prod
 *
 *   # 或使用 package.json 中预定义的脚本（.env.analyze 里 VITE_ANALYZE=true）
 *   npm run build:analyze
 *
 * 报告内容：
 * - 各模块在 bundle 中的体积占比
 * - gzip 后大小
 * - brotli 压缩后大小
 * - 模块依赖关系树
 */
export default function createVisualizer(): PluginOption {
  return visualizer({
    // 必须带 `dist/` 前缀：rollup-plugin-visualizer 用 `resolve(filename)` 定位输出，
    // 基准是 **进程 cwd（= 包根）而不是 rollup 的 output.dir**。原先写成 'stats.html'
    // 时报告落在 `stepby-vue/stats.html`（2 MB 级产物，且 .gitignore 只忽略 `dist/`），
    // 与 performance.md §1.3 / OPTIMIZATION_PLAN_ROUNDS101-102 的 `dist/stats.html`
    // 口径相反 ⇒ 批七十六实测后改为与文档一致（实测产物：dist/stats.html）。
    filename: 'dist/stats.html',
    open: false,
    gzipSize: true,
    brotliSize: true,
    template: 'treemap'
  }) as PluginOption
}
