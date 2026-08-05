<template>
  <el-breadcrumb class="app-breadcrumb" separator="/">
    <transition-group name="breadcrumb">
      <el-breadcrumb-item v-for="(item, index) in levelList" :key="item.path">
        <span v-if="item.redirect === 'noRedirect' || index === levelList.length - 1" class="no-redirect">
          {{ translateTitle(item.meta) }}
        </span>
        <router-link v-else :to="item.redirect || item.path" class="redirect">
          {{ translateTitle(item.meta) }}
        </router-link>
      </el-breadcrumb-item>
    </transition-group>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import usePermissionStore from '@/store/modules/permission'
import { useMenuTitle } from '@/composables/useMenuTitle'
import type { RouteLocationNormalized, RouteRecordNormalized } from 'vue-router'

interface BreadcrumbItem {
  path: string
  redirect?: string
  name?: unknown
  meta?: { title?: string; icon?: string; breadcrumb?: boolean; [k: string]: unknown }
  children?: BreadcrumbItem[]
}

const { t } = useI18n()
const { translateTitle } = useMenuTitle()
const route = useRoute()
const permissionStore = usePermissionStore()
const levelList = ref<BreadcrumbItem[]>([])

function getBreadcrumb(): void {
  // only show routes with meta.title
  let matched: BreadcrumbItem[] = []
  const pathNum = findPathNum(route.path)
  // multi-level menu
  if (pathNum > 2) {
    const reg = /\/\w+/gi
    const pathList =
      route.path.match(reg)?.map((item: string, index: number) => {
        if (index !== 0) item = item.slice(1)
        return item
      }) || []
    getMatched(pathList, permissionStore.defaultRoutes as unknown as BreadcrumbItem[], matched)
  } else {
    matched = route.matched.filter(
      (item: RouteRecordNormalized) => item.meta && item.meta.title
    ) as unknown as BreadcrumbItem[]
  }
  // 判断是否为首页
  if (!isDashboard(matched[0])) {
    const homeItem: BreadcrumbItem = { path: '/index', meta: { title: t('breadcrumb.home') } }
    matched = [homeItem].concat(matched)
  }
  levelList.value = matched.filter(
    (item) => item.meta && item.meta.title && (item.meta.breadcrumb as boolean) !== false
  )
}
function findPathNum(str: string, char = '/'): number {
  let index = str.indexOf(char)
  let num = 0
  while (index !== -1) {
    num++
    index = str.indexOf(char, index + 1)
  }
  return num
}
function getMatched(pathList: string[], routeList: BreadcrumbItem[], matched: BreadcrumbItem[]): void {
  const data = routeList.find(
    (item) => item.path === pathList[0] || String(item.name ?? '').toLowerCase() === pathList[0]
  )
  if (data) {
    matched.push(data)
    if (data.children && pathList.length) {
      pathList.shift()
      getMatched(pathList, data.children, matched)
    }
  }
}
function isDashboard(r?: BreadcrumbItem | RouteLocationNormalized): boolean {
  const name = r && (r as BreadcrumbItem).name
  if (!name) {
    return false
  }
  return String(name).trim() === 'Index'
}

watchEffect(() => {
  // if you go to the redirect page, do not update the breadcrumbs
  if (route.path.startsWith('/redirect/')) {
    return
  }
  getBreadcrumb()
})
getBreadcrumb()
</script>

<style lang="scss" scoped>
.app-breadcrumb.el-breadcrumb {
  display: inline-block;
  font-size: 14px;
  line-height: 50px;

  .no-redirect {
    color: var(--el-text-color-regular);
    cursor: text;
  }

  .redirect {
    color: var(--el-color-primary);
    text-decoration: none;
    transition: color 0.2s;

    &:hover {
      color: var(--el-color-primary-light-3);
    }
  }
}
</style>
