<template>
  <el-menu
    class="topbar-menu"
    :ellipsis="false"
    :default-active="activeMenu"
    :active-text-color="theme"
    mode="horizontal"
  >
    <sidebar-item :key="menu.path" v-for="menu in topMenus" :item="menu" :base-path="menu.path" />

    <el-sub-menu index="more" class="el-sub-menu__hide-arrow" v-if="moreRoutes.length > 0">
      <template #title>
        <span>{{ safeT('layout.topNav.moreMenus') }}</span>
      </template>
      <sidebar-item :key="menu.path" v-for="menu in moreRoutes" :item="menu" :base-path="menu.path" />
    </el-sub-menu>
  </el-menu>
</template>

<script setup lang="ts">
import SidebarItem from '../Sidebar/SidebarItem.vue'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'
import { safeT } from '@/utils/safeI18n'
import type { AppRouteRecord } from '@/types'

const route = useRoute()
const settingsStore = useSettingsStore()
const permissionStore = usePermissionStore()

const theme = computed(() => settingsStore.theme)
const activeMenu = computed(() => {
  const { meta, path } = route
  if (meta.activeMenu) {
    return meta.activeMenu
  }
  return path
})

const visibleNumber = ref<number>(5)
const topMenus = computed(() => {
  return permissionStore.sidebarRouters.filter((f: AppRouteRecord) => !f.hidden).slice(0, visibleNumber.value)
})
const moreRoutes = computed(() => {
  return permissionStore.sidebarRouters.filter((f: AppRouteRecord) => !f.hidden).slice(visibleNumber.value)
})
function setVisibleNumber(): void {
  const width = document.body.getBoundingClientRect().width / 3
  visibleNumber.value = Math.max(1, parseInt(String(width / 85)))
}

onMounted(() => {
  window.addEventListener('resize', setVisibleNumber)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', setVisibleNumber)
})

onMounted(() => {
  setVisibleNumber()
})
</script>

<style lang="scss" scoped>
/* menu item */
.topbar-menu.el-menu--horizontal :deep(.el-submenu__title),
.topbar-menu.el-menu--horizontal :deep(.el-menu-item) {
  padding: 0 10px !important;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.topbar-menu.el-menu--horizontal > :deep(.el-menu-item) {
  float: left;
  height: 50px !important;
  line-height: 50px !important;
  color: var(--el-text-color-primary) !important;
  padding: 0 5px !important;
  margin: 0 10px !important;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-bottom-color 0.2s ease;
}

:deep(.el-sub-menu.is-active) .svg-icon,
:deep(.el-menu-item.is-active) .svg-icon + span,
:deep(.el-sub-menu.is-active) .svg-icon + span,
:deep(.el-sub-menu.is-active) .el-submenu__title span {
  color: v-bind(theme);
}

/* sub-menu item */
/* Vue scoped 编译器只转换选择器中的第一个 :deep()，再出现的 :deep() 会以字面量形式残留在产物中，
   而 :deep 并非标准 CSS 伪类，浏览器会丢弃整条规则。故合并为单个 :deep(.a .b)，语义等价且规则生效。 */
.topbar-menu.el-menu--horizontal > :deep(.el-sub-menu .el-submenu__title) {
  float: left;
  line-height: 50px !important;
  color: var(--el-text-color-primary) !important;
  margin: 0 15px -3px !important;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

/* topbar more arrow */
.topbar-menu :deep(.el-sub-menu .el-sub-menu__icon-arrow) {
  position: static;
  margin-left: 8px;
  margin-top: 0px;
  display: block !important;
}
</style>
