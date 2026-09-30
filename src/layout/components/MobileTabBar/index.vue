<template>
  <!-- MOBILE-UX-GUIDELINES 三-1：手机档底部 TabBar —— 一级导航（业界标准），
       替代汉堡抽屉作为高频入口；全量菜单仍由抽屉（汉堡）承载。
       样式按 AGENTS.md 优先级：Tailwind 工具类为主；safe-bottom 用任意值语法接 CSS 变量。 -->
  <nav
    v-if="device === 'mobile'"
    class="mobile-tabbar fixed inset-x-0 bottom-0 z-[1003] flex items-stretch border-t border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] pb-[var(--safe-bottom,0px)]"
    aria-label="底部导航"
  >
    <button
      v-for="item in tabs"
      :key="item.path"
      type="button"
      class="flex min-h-[56px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-none bg-transparent px-1 py-1.5 transition-transform duration-150 active:scale-95"
      :class="isActive(item) ? 'text-[var(--el-color-primary)]' : 'text-[var(--el-text-color-secondary)]'"
      @click="go(item)"
    >
      <svg-icon :icon-class="item.icon" class="text-[20px]" />
      <span class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-[1.2]">
        {{ item.label }}
      </span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import usePermissionStore from '@/store/modules/permission'
import useAppStore from '@/store/modules/app'
import { translateTitle, type TranslatableMeta } from '@/composables/useMenuTitle'
import type { AppRouteRecord } from '@/types/api/menu'

interface TabItem {
  path: string
  label: string
  icon: string
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const permissionStore = usePermissionStore()
const { t } = useI18n()

const device = computed(() => appStore.device)

/** 核心模块：取可见顶级菜单前 4 个 + 「我的」固定收尾（工作台/系统/监控/工具 + 个人） */
const tabs = computed<TabItem[]>(() => {
  const tops = permissionStore.sidebarRouters
    .filter((f: AppRouteRecord) => !f.hidden && f.path !== '/')
    .slice(0, 4)
    .map((r: AppRouteRecord) => {
      // RouteMeta 无项目级扩展声明，局部断言（与模板中 item.meta.icon 用法一致）
      const meta = (r.meta || {}) as TranslatableMeta & { icon?: string }
      return {
        path: r.path,
        label: translateTitle(meta),
        icon: meta.icon || 'dashboard'
      }
    })
  return [...tops, { path: '/user/profile', label: t('layout.tabbar.mine'), icon: 'user' }]
})

function isActive(item: TabItem): boolean {
  return route.path === item.path || route.path.startsWith(item.path + '/')
}

function go(item: TabItem): void {
  if (route.path !== item.path) {
    router.push(item.path).catch(() => {})
  }
}
</script>
