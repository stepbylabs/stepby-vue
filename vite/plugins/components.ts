import components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

/**
 * BUILD-002：Element Plus 按需自动导入
 *
 * 使用 unplugin-vue-components + ElementPlusResolver 自动按需导入组件和样式，
 * 替代 main.ts 中的全量 `app.use(ElementPlus)` 注册。
 *
 * 优势：
 * - 仅打包实际使用的组件，显著减小包体积
 * - 组件样式按需加载，无需全量引入 element-plus/dist/index.css
 * - 模板中直接使用 <el-xxx> 即可，无需手动 import
 *
 * 注意：
 * - ElMessage / ElMessageBox / ElNotification / ElLoading 等命令式 API
 *   仍需在业务代码中显式 import from 'element-plus'（已覆盖全项目）
 * - dark/css-vars.css 暗色主题变量仍需在 main.ts 中手动引入
 * - locale 和 size 全局配置通过 App.vue 的 <el-config-provider> 设置
 */
export default function createComponents() {
  return components({
    resolvers: [
      ElementPlusResolver({
        // 按需导入组件样式（css 格式）
        importStyle: 'css'
      })
    ],
    // 生成类型声明文件 components.d.ts
    dts: true,
    // 组件名前缀（el-xxx 自动解析，无需配置）
    types: []
  })
}
