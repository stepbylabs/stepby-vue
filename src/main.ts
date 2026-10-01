import { createApp, defineAsyncComponent } from 'vue'

// BUILD-002：移除 ElementPlus 全量导入和 app.use(ElementPlus) 注册
// 改由 unplugin-vue-components + ElementPlusResolver 自动按需导入组件和样式
// 仅保留暗色主题变量（按需导入不包含全局主题变量）
import 'element-plus/theme-chalk/dark/css-vars.css'
// BUILD-002 补丁：命令式 API（ElMessage/ElMessageBox/ElNotification/ElLoading）
// 不在模板中使用，unplugin-vue-components 无法自动导入其样式，需手动引入
// 缺失这些 CSS 会导致 ElMessageBox 定位在左上角且背景透明（无居中、无遮罩、无背景色）
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-loading.css'
// BUILD-002：dayjs 国际化（Element Plus 内部依赖 dayjs，需要中文 locale）
import 'dayjs/locale/zh-cn'

// Tailwind CSS 4：先于项目样式加载，确保项目 SCSS 中的样式可覆盖 Tailwind preflight
import '@/assets/styles/tailwind.css'

import '@/assets/styles/index.scss' // global css

import App from './App.vue'
import store from './store'
import router from './router'
import directive from './directive' // directive
import i18n from '@/i18n'

// 注册指令
import plugins from './plugins' // plugins

// svg图标
import 'virtual:svg-icons-register'
import SvgIcon from '@/components/SvgIcon/index.vue'
import elementIcons from '@/components/SvgIcon/svgicon'

import './permission' // permission control

// 动效库：@vueuse/motion 提供 v-motion 指令（声明式入场动画）
import { MotionPlugin } from '@vueuse/motion'
import { parseTime } from '@/utils/stepby'

// 分页组件
import Pagination from '@/components/Pagination/index.vue'
// 自定义表格工具组件
import RightToolbar from '@/components/RightToolbar/index.vue'
// BUILD-005：Editor/FileUpload/ImageUpload/ImagePreview 异步加载，减小主包体积
// 这些组件仅部分页面使用（公告编辑、上传等），无需同步加载
const Editor = defineAsyncComponent(() => import('@/components/Editor/index.vue'))
const FileUpload = defineAsyncComponent(() => import('@/components/FileUpload/index.vue'))
const ImageUpload = defineAsyncComponent(() => import('@/components/ImageUpload/index.vue'))
const ImagePreview = defineAsyncComponent(() => import('@/components/ImagePreview/index.vue'))
// 字典标签组件
import DictTag from '@/components/DictTag/index.vue'
// TierA-4: 空状态 CTA 组件
import EmptyState from '@/components/EmptyState/index.vue'

const app = createApp(App)

// M-12 / R103-FE-MAJ-005：清理"旧代码兼容"的 globalProperties（原 9 个），逐项核查如下：
//   1. useDict           —— 全仓 0 处以全局名调用，调用点均为显式 import 或 unplugin-auto-import
//                          自动导入（vite/plugins/auto-import.ts），属死代码，已移除注册。
//   2. download          —— 同上，调用点统一 `import { download } from '@/utils/request'`，已移除。
//   3. handleTree        —— 调用点统一显式 import，已移除。
//   4. addDateRange      —— 调用点统一显式 import，已移除。
//   5. getConfigKey      —— 调用点统一显式 import，已移除。
//   6. selectDictLabel   —— 显式 import / 自动导入，已移除。
//   7. selectDictLabels  —— 全仓无调用，已移除。
//   8. $t                —— 全仓 0 处模板 `$t()`（组件统一 `const { t } = useI18n()`），已移除。
//   9. parseTime（保留例外）—— 作为模板"时间过滤器"在 28 个 .vue 的模板插值中裸名调用共 31 处
//                          （如 `{{ parseTime(scope.row.createTime) }}`），并承担"默认追加本地时区
//                          偏移后缀（GMT+8）"的展示约定（tz=true，见 stepby.ts）。若改为普通显式
//                          import（tz 默认 false）会丢失时区后缀、改变展示结果；逐文件包装改造成本/
//                          风险过大。按优化项"被大量模板以全局名使用可保留并说明"的例外予以保留。
// 全局时间过滤器：默认追加浏览器本地时区偏移后缀（如 "GMT+8"），标注展示时间所属时区，
// 消除跨区域协作/排障的时区歧义；纯日期格式（不含 {h}/{i}/{s}）不加后缀。
app.config.globalProperties.parseTime = (time: unknown, pattern?: string) =>
  parseTime(time as string | number | Date | null | undefined, pattern, true)

// 全局组件挂载
app.component('DictTag', DictTag)
app.component('EmptyState', EmptyState)
app.component('Pagination', Pagination)
app.component('FileUpload', FileUpload)
app.component('ImageUpload', ImageUpload)
app.component('ImagePreview', ImagePreview)
app.component('RightToolbar', RightToolbar)
app.component('Editor', Editor)

app.use(router)
app.use(store)
app.use(plugins)
app.use(elementIcons)
app.use(i18n)
// 动效库：@vueuse/motion 提供 v-motion 指令（声明式入场动画）
app.use(MotionPlugin)
app.component('svg-icon', SvgIcon)

directive(app)

// BUILD-002：移除 app.use(ElementPlus) 全量注册
// locale 和 size 全局配置通过 App.vue 的 <el-config-provider> 设置

// 全局错误处理（P0-68）
// 抽象为 errorReporter.report()，保留 console.error 输出，预留 Sentry 等上报服务接入点
import { errorReporter } from '@/utils/errorReporter'
import { setupFrontendErrorReporter } from '@/utils/frontendErrorReporter'

app.config.errorHandler = (err: unknown, instance: { $options?: { name?: string } } | null, info: string) => {
  errorReporter.report(err, {
    type: 'Vue ErrorHandler',
    source: 'vue',
    level: 'error',
    component: instance?.$options?.name ?? 'Unknown',
    info
  })
}

window.addEventListener(
  'error',
  (event: Event) => {
    // 区分脚本错误（ErrorEvent）和资源加载错误（Event with target）
    // 资源加载错误（img/script/link src/href 加载失败）的 event 是普通 Event，
    // 没有 error/message/filename/lineno 属性，target 是加载失败的元素
    if (event instanceof ErrorEvent) {
      errorReporter.report(event.error || event.message, {
        type: 'Global Error',
        source: 'global',
        level: 'error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      })
    } else {
      // 资源加载错误：target 是 img/script/link/iframe 等元素
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName
      const src = (target as HTMLImageElement | HTMLScriptElement)?.src || (target as HTMLLinkElement)?.href
      // 静默忽略非关键资源加载失败（避免控制台噪音）
      // - favicon.ico：浏览器自动请求，经常 404
      // - /uploads/：用户上传的文件（头像等），加载失败已由组件 onerror 回退到默认图，无需重复报错
      if (src && (/favicon\.ico$/.test(src) || /\/uploads\//.test(src))) {
        return
      }
      errorReporter.report(`Resource load failed: ${tagName} ${src || '(unknown)'}`, {
        type: 'Resource Error',
        source: 'resource',
        level: 'warning',
        tagName,
        src
      })
    }
  },
  true
)

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  errorReporter.report(event.reason, {
    type: 'Unhandled Rejection',
    source: 'unhandledrejection',
    level: 'error'
  })
})

app.mount('#app')

// Tier-S #1：接入前端异常与性能监控持久化上报（在挂载后启动，采集 Vue/全局/资源/拒绝错误 + Web Vitals）
setupFrontendErrorReporter()

// PWA 支持（P3-23）：注册 Service Worker（生产构建生效；开发模式为 no-op），
// 支持"安装为桌面应用 / 添加到主屏"并开启离线缓存优先。
// autoUpdate 会在 SW 有新版本时于后台静默更新，避免用户长期停留在旧缓存。
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

// 初始化 WebSocket 通知服务（登录后自动连接）
import useNotificationStore from '@/store/modules/notification'
const notificationStore = useNotificationStore()
notificationStore.init()

// U13 优化：浏览器通知权限改为按需请求
// 不在加载时自动请求权限，避免打扰用户
// 用户首次点击 HeaderNotice 铃铛时由 notification store 按需触发请求
