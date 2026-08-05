<template>
  <el-menu :default-active="activeMenu" mode="horizontal" @select="handleSelect" :ellipsis="false">
    <TransitionGroup name="list">
      <el-menu-item
        v-for="item in topMenus.slice(0, visibleNumber || 0)"
        :key="item.path"
        :style="{ '--theme': theme }"
        :index="item.path"
      >
        <svg-icon v-if="item.meta && item.meta.icon && item.meta.icon !== '#'" :icon-class="item.meta.icon" />
        {{ translateTitle(item.meta) }}
      </el-menu-item>
    </TransitionGroup>

    <!-- 顶部菜单超出数量折叠 -->
    <Transition name="fade">
      <el-sub-menu :style="{ '--theme': theme }" index="more" v-if="topMenus.length > visibleNumber">
        <template #title>{{ safeT('layout.topNav.moreMenus') }}</template>
        <TransitionGroup name="list">
          <el-menu-item v-for="item in topMenus.slice(visibleNumber || 0)" :key="item.path" :index="item.path">
            <svg-icon v-if="item.meta && item.meta.icon && item.meta.icon !== '#'" :icon-class="item.meta.icon" />
            {{ translateTitle(item.meta) }}
          </el-menu-item>
        </TransitionGroup>
      </el-sub-menu>
    </Transition>
  </el-menu>
</template>

<script setup lang="ts">
import { constantRoutes } from '@/router'
import { isHttp } from '@/utils/validate'
import useAppStore from '@/store/modules/app'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'
import { useMenuTitle } from '@/composables/useMenuTitle'
import { safeT } from '@/utils/safeI18n'
import type { AppRouteRecord } from '@/types'

// 顶部栏初始数
const visibleNumber = ref<number>(0)
// 当前激活菜单的 index
const currentIndex = ref<string | null>(null)
// 隐藏侧边栏路由
const hideList = ['/index', '/user/profile']

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const permissionStore = usePermissionStore()
const route = useRoute()
const router = useRouter()
const { translateTitle } = useMenuTitle()

// 主题颜色
const theme = computed(() => settingsStore.theme)
// 所有的路由信息
const routers = computed(() => permissionStore.topbarRouters)

// 顶部显示菜单
const topMenus = computed(() => {
  const topMenus: AppRouteRecord[] = []
  routers.value.map((menu: AppRouteRecord) => {
    if (menu.hidden !== true) {
      // 兼容顶部栏一级菜单内部跳转
      if (menu.path === '/' && menu.children && menu.children.length > 0) {
        topMenus.push(menu.children[0])
      } else {
        topMenus.push(menu)
      }
    }
  })
  return topMenus
})

// 设置子路由
const childrenMenus = computed(() => {
  const childrenMenus: AppRouteRecord[] = []
  routers.value.map((r: AppRouteRecord) => {
    if (!r.children) return
    r.children.forEach((child) => {
      // 不直接修改 store 子路由对象，返回新对象
      const newChild: AppRouteRecord = { ...child, parentPath: r.path }
      if (r.path === '/') {
        newChild.path = '/' + child.path
      } else {
        if (!isHttp(child.path)) {
          newChild.path = r.path + '/' + child.path
        }
      }
      childrenMenus.push(newChild)
    })
  })
  return [...(constantRoutes as unknown as AppRouteRecord[]), ...childrenMenus]
})

// 默认激活的菜单（纯函数，无副作用，P0-70）
const activeMenu = computed(() => {
  const path = route.path
  let activePath = path
  if (path !== undefined && path.lastIndexOf('/') > 0 && hideList.indexOf(path) === -1) {
    const tmpPath = path.substring(1, path.length)
    if (!route.meta.link) {
      activePath = '/' + tmpPath.substring(0, tmpPath.indexOf('/'))
    }
  } else if (!(route as unknown as { children?: unknown }).children) {
    activePath = path
  }
  return activePath
})

// 副作用：根据激活菜单控制侧边栏显示/隐藏及联动菜单（P0-70）
watch(
  activeMenu,
  (activePath: string) => {
    const path = route.path
    if (path !== undefined && path.lastIndexOf('/') > 0 && hideList.indexOf(path) === -1) {
      if (!route.meta.link) {
        appStore.toggleSideBarHide(false)
      }
    } else if (!(route as unknown as { children?: unknown }).children) {
      appStore.toggleSideBarHide(true)
    }
    activeRoutes(activePath)
  },
  { immediate: true }
)

function setVisibleNumber(): void {
  const width = document.body.getBoundingClientRect().width / 3
  visibleNumber.value = Math.max(1, parseInt(String(width / 85)))
}

function handleSelect(key: string, _keyPath: string[]): void {
  currentIndex.value = key
  const routeMatch = routers.value.find((item: AppRouteRecord) => item.path === key)
  if (isHttp(key)) {
    // http(s):// 路径新窗口打开
    window.open(key, '_blank', 'noopener,noreferrer')
  } else if (!routeMatch || !routeMatch.children) {
    // 没有子路由路径内部打开
    const routeMenu = childrenMenus.value.find((item: AppRouteRecord) => item.path === key)
    if (routeMenu && routeMenu.query) {
      try {
        const query = JSON.parse(routeMenu.query)
        router.push({ path: key, query: query })
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[TopNav] routeMenu.query parse failed:', routeMenu.query, e)
        router.push({ path: key })
      }
    } else {
      router.push({ path: key })
    }
    appStore.toggleSideBarHide(true)
  } else {
    // 显示左侧联动菜单
    activeRoutes(key)
    appStore.toggleSideBarHide(false)
  }
}

function activeRoutes(key: string) {
  const routes: AppRouteRecord[] = []
  if (childrenMenus.value && childrenMenus.value.length > 0) {
    childrenMenus.value.map((item: AppRouteRecord) => {
      if (key == item.parentPath || (key == 'index' && '' == item.path)) {
        routes.push(item)
      }
    })
  }
  if (routes.length > 0) {
    permissionStore.setSidebarRouters(routes)
  } else {
    appStore.toggleSideBarHide(true)
  }
  return routes
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

<style lang="scss">
.topmenu-container.el-menu--horizontal {
  height: 50px !important;
  border-bottom: none;
}

.topmenu-container.el-menu--horizontal > .el-menu-item {
  float: left;
  height: 50px !important;
  line-height: 50px !important;
  color: var(--navbar-text, #303133) !important;
  padding: 0 5px !important;
  margin: 0 10px !important;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-bottom-color 0.2s ease;
}

.topmenu-container.el-menu--horizontal > .el-menu-item.is-active,
.el-menu--horizontal > .el-sub-menu.is-active .el-submenu__title {
  border-bottom: 2px solid #{'var(--theme)'} !important;
  color: var(--navbar-text, #303133);
}

/* sub-menu item */
.topmenu-container.el-menu--horizontal > .el-sub-menu .el-sub-menu__title {
  float: left;
  height: 50px !important;
  line-height: 50px !important;
  color: var(--navbar-text, #303133) !important;
  padding: 0 5px !important;
  margin: 0 10px !important;
}

/* 背景色隐藏 */
.topmenu-container.el-menu--horizontal > .el-menu-item:not(.is-disabled):focus,
.topmenu-container.el-menu--horizontal > .el-menu-item:not(.is-disabled):hover,
.topmenu-container.el-menu--horizontal > .el-submenu .el-submenu__title:hover {
  background-color: var(--el-fill-color-light);
}

/* 图标右间距 */
.topmenu-container .svg-icon {
  margin-right: 4px;
}

/* topmenu more arrow */
.topmenu-container .el-sub-menu .el-sub-menu__icon-arrow {
  position: static;
  vertical-align: middle;
  margin-left: 8px;
  margin-top: 0px;
}
</style>
