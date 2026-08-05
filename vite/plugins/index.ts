import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

import createAutoImport from './auto-import'
import createComponents from './components'
import createSvgIcon from './svg-icon'
import createCompression from './compression'
import createSetupExtend from './setup-extend'
import createVisualizer from './visualizer'
import { PluginOption } from 'vite'

export default function createVitePlugins(viteEnv: Record<string, string>, isBuild = false) {
  const vitePlugins: PluginOption[] = [vue(), tailwindcss()]
  vitePlugins.push(createAutoImport())
  vitePlugins.push(createComponents())
  vitePlugins.push(createSetupExtend())
  vitePlugins.push(createSvgIcon(isBuild))
  if (isBuild) {
    vitePlugins.push(...createCompression(viteEnv))
    // 性能优化：Bundle 可视化分析工具（仅 VITE_ANALYZE=true 时启用）
    if (viteEnv.VITE_ANALYZE === 'true') {
      vitePlugins.push(createVisualizer())
    }
  }
  return vitePlugins
}
