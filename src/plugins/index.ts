import { App } from 'vue'
import modal from './modal'

export default function installPlugins(app: App) {
  // 模态框对象
  // 保留说明：$modal 仍被页面以 `getCurrentInstance()?.proxy?.$modal.xxx()` 调用，故保留注册。
  // 已移除（M-12「清理旧代码兼容的 globalProperties」）：原 $tab / $cache / $download 三个全局属性
  // 全仓 0 处调用（死代码）。如需使用请显式 import：
  //   `import tab from '@/plugins/tab'` / `import cache from '@/plugins/cache'` / `import download from '@/plugins/download'`
  app.config.globalProperties.$modal = modal
}
