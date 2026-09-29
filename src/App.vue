<template>
  <!-- BUILD-002：通过 el-config-provider 设置全局 locale 和 size，替代 app.use(ElementPlus, {...}) -->
  <!-- UX 优化：禁用 Dialog/MessageBox 点击遮罩关闭，防止用户误点遮罩丢失表单输入 -->
  <el-config-provider :locale="epLocale" :size="size" :dialog="{ closeOnClickModal: false }">
    <router-view />
    <!-- ROUNDS61-100 #7 / R10-SEC-005：Cookie 同意 Banner，全局显示 -->
    <CookieConsent />
  </el-config-provider>
</template>

<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import enUs from 'element-plus/es/locale/lang/en'
import { useI18n } from 'vue-i18n'
import Cookies from 'js-cookie'
import { useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import useSettingsStore from '@/store/modules/settings'
import { handleThemeStyle } from '@/utils/theme'
// D8（UX-RESPONSIVE-PLAN）：移动端表格卡片模式运行时增强（开关默认关=横滚）
import { useMobileTableCards } from '@/composables/useMobileTableCards'
// Cookie 同意组件需全局展示，显式引入以保证类型与可见性
import CookieConsent from '@/components/CookieConsent/index.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const { locale } = useI18n()

// Element Plus locale 跟随 i18n 语言切换（ElPagination/ElDatePicker 等组件文案本地化）
const epLocale = computed(() => (locale.value === 'en-US' ? enUs : zhCn))

// 全局尺寸：large / default / small（与原 app.use(ElementPlus, { size }) 等效）
// S4（UX-RESPONSIVE-PLAN）：用户显式设置（size Cookie）优先；未设置时手机视口（<768px）
// 自动升 large（组件 40px 高，满足 ≥44px 级触控目标含边距），响应窗口/旋转变化。
const { width: winWidth } = useWindowSize()
const size = computed(() => {
  const userSize = Cookies.get('size')
  if (userSize) return userSize
  return winWidth.value < 768 ? 'large' : 'default'
})

// TierS-3: 表格密度 - 与全局 size 解耦，仅影响 el-table 单元格内边距
// 通过 documentElement class 控制，避免影响其他 EP 组件
watch(
  () => settingsStore.userPrefs.tableDensity,
  (density: string) => {
    const html = document.documentElement
    html.classList.remove('table-density-comfortable', 'table-density-compact', 'table-density-default')
    html.classList.add(`table-density-${density}`)
  },
  { immediate: true }
)

onMounted(() => {
  nextTick(() => {
    // 初始化主题样式
    handleThemeStyle(settingsStore.theme)
  })
  // D8：移动端表格卡片模式（随 userPrefs.mobileTableCards + 手机视口自动启停）
  useMobileTableCards()
})

// P2-34: R18-3.2 全局错误边界 - 捕获后代组件未处理错误，记录并跳转 500 页面
// 返回 false 阻止错误继续向上冒泡；避免在错误页本身触发时无限跳转
// router.push 添加 .catch 避免重复路由抛 NavigationDuplicated
onErrorCaptured((err: unknown, _instance: unknown, info: string) => {
  if (import.meta.env.DEV) console.error('[App ErrorCaptured]', err, info)
  if (router.currentRoute.value.path !== '/500') {
    router.push('/500').catch(() => {})
  }
  return false
})
</script>
