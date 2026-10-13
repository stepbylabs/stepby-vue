<template>
  <div :class="['sidebar-theme-wrapper', { 'has-logo': showLogo }, sideTheme]" class="sidebar-container">
    <logo v-if="showLogo" :collapse="isCollapse" />
    <el-scrollbar wrap-class="scrollbar-wrapper">
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        :background-color="getMenuBackground"
        :text-color="getMenuTextColor"
        :unique-opened="true"
        :active-text-color="theme"
        :collapse-transition="false"
        mode="vertical"
        :class="sideTheme"
      >
        <sidebar-item v-for="route in sidebarRouters" :key="route.path" :item="route" :base-path="route.path" />
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import Logo from './Logo.vue'
import SidebarItem from './SidebarItem.vue'
import useAppStore from '@/store/modules/app'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'

const route = useRoute()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const permissionStore = usePermissionStore()

const sidebarRouters = computed(() => permissionStore.sidebarRouters)
const showLogo = computed(() => settingsStore.sidebarLogo)
const sideTheme = computed(() => settingsStore.sideTheme)
const theme = computed(() => settingsStore.theme)
const isCollapse = computed(() => !appStore.sidebar.opened)

// 菜单背景色/文字色：统一通过 CSS 变量驱动
// --sidebar-bg / --sidebar-text 在 :root、html.dark、.theme-dark、.theme-light 上分别定义
// theme-auto：亮色模式用 :root（浅色），深色模式用 html.dark（深色）
// theme-dark / theme-light：通过 wrapper 上的 class 强制覆盖 CSS 变量
const getMenuBackground = computed(() => 'var(--sidebar-bg)')
const getMenuTextColor = computed(() => 'var(--sidebar-text)')

const activeMenu = computed(() => {
  const { meta, path } = route
  if (meta.activeMenu) {
    return meta.activeMenu
  }
  return path
})
</script>

<style lang="scss" scoped>
.sidebar-container {
  background-color: var(--sidebar-bg);

  .scrollbar-wrapper {
    background-color: var(--sidebar-bg);
  }

  .el-menu {
    border: none;
    height: 100%;
    /* width:100%!important 用于覆盖 Element Plus 默认 width:auto，确保侧栏菜单占满侧栏宽度 */
    width: 100% !important;

    .el-menu-item,
    .el-sub-menu__title {
      transition:
        background-color 0.2s ease,
        color 0.2s ease;
      &:hover {
        background-color: var(--menu-hover) !important;
      }
    }

    .el-menu-item {
      color: var(--sidebar-text);

      &.is-active {
        color: var(--menu-active-text, var(--current-color, #409eff));
        background-color: var(--menu-active-bg) !important;
      }
    }

    .el-sub-menu__title {
      color: var(--sidebar-text);
    }
  }
}
</style>
