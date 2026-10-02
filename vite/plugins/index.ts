import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

import createAutoImport from './auto-import'
import createComponents from './components'
import createSvgIcon from './svg-icon'
import createCompression from './compression'
import createSetupExtend from './setup-extend'
import createVisualizer from './visualizer'
import createPwa from './pwa'
import { PluginOption } from 'vite'

export default function createVitePlugins(viteEnv: Record<string, string>, isBuild = false) {
  const vitePlugins: PluginOption[] = [vue(), tailwindcss()]
  vitePlugins.push(createAutoImport())
  vitePlugins.push(createComponents())
  vitePlugins.push(createSetupExtend())
  vitePlugins.push(createSvgIcon(isBuild))
  // PWA 支持（P3-23）：devOptions.enabled=false 保证仅生产构建生成 SW，
  // 开发/测试不受影响；virtual:pwa-register 模块始终可用，dev 下为 no-op
  vitePlugins.push(createPwa())
  if (isBuild) {
    vitePlugins.push(...createCompression(viteEnv))
    // 性能优化：Bundle 可视化分析工具（仅 VITE_ANALYZE=true 时启用）
    if (viteEnv.VITE_ANALYZE === 'true') {
      vitePlugins.push(createVisualizer())
    }
  }
  return vitePlugins
}
