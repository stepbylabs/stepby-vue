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
 *   # 或使用 package.json 中预定义的脚本
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
    filename: 'stats.html',
    open: false,
    gzipSize: true,
    brotliSize: true,
    template: 'treemap'
  }) as PluginOption
}
