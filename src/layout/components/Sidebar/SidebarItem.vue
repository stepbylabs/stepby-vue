<template>
  <div v-if="!item.hidden">
    <template
      v-if="
        hasOneShowingChild(item.children, item) &&
        (!onlyOneChild?.children || onlyOneChild?.noShowingChildren) &&
        !item.alwaysShow
      "
    >
      <app-link v-if="onlyOneChild && onlyOneChild.meta" :to="resolvePath(onlyOneChild.path, onlyOneChild.query)">
        <el-menu-item :index="resolvePath(onlyOneChild.path)" :class="{ 'submenu-title-noDropdown': !isNest }">
          <svg-icon :icon-class="onlyOneChild.meta.icon || (item.meta && item.meta.icon)" />
          <template #title>
            <span class="menu-title" :title="hasTitle(translateTitle(onlyOneChild.meta))">
              {{ translateTitle(onlyOneChild.meta) }}
            </span>
          </template>
        </el-menu-item>
      </app-link>
    </template>

    <el-sub-menu v-else ref="subMenu" :index="resolvePath(item.path)" teleported>
      <template v-if="item.meta" #title>
        <svg-icon :icon-class="item.meta && item.meta.icon" />
        <span class="menu-title" :title="hasTitle(translateTitle(item.meta))">{{ translateTitle(item.meta) }}</span>
      </template>

      <sidebar-item
        v-for="child in item.children"
        :key="child.path"
        :is-nest="true"
        :item="child"
        :base-path="resolvePath(child.path)"
        class="nest-menu"
      />
    </el-sub-menu>
  </div>
</template>

<script setup lang="ts">
import { isExternal } from '@/utils/validate'
import AppLink from './Link.vue'
import { getNormalPath } from '@/utils/stepby'
import { useMenuTitle } from '@/composables/useMenuTitle'
import type { AppRouteRecord } from '@/types'

const { translateTitle } = useMenuTitle()

const props = defineProps({
  // route object
  item: {
    type: Object as () => AppRouteRecord,
    required: true
  },
  isNest: {
    type: Boolean,
    default: false
  },
  basePath: {
    type: String,
    default: ''
  }
})

const onlyOneChild = ref<(AppRouteRecord & { noShowingChildren?: boolean }) | null>(null)

function hasOneShowingChild(children: AppRouteRecord[] = [], parent: AppRouteRecord) {
  if (!children) {
    children = []
  }
  // 先 filter 得到 showingChildren，避免在 filter 谓词中产生副作用
  const showingChildren = children.filter((item: AppRouteRecord) => !item.hidden)

  // When there is only one child router, the child router is displayed by default
  if (showingChildren.length === 1) {
    onlyOneChild.value = showingChildren[0]
    return true
  }

  // Show parent if there are no child router to display
  if (showingChildren.length === 0) {
    onlyOneChild.value = { ...parent, path: '', noShowingChildren: true }
    return true
  }

  return false
}

function resolvePath(
  routePath: string,
  routeQuery?: string
): string | { path: string; query: Record<string, unknown> } {
  if (isExternal(routePath)) {
    return routePath
  }
  if (isExternal(props.basePath)) {
    return props.basePath
  }
  if (routeQuery) {
    // P1 修复: JSON.parse 在 routeQuery 非法时会抛错导致侧边栏渲染崩溃
    // 解析失败时回退为不传 query，并记录警告
    try {
      const query = JSON.parse(routeQuery)
      return { path: getNormalPath(props.basePath + '/' + routePath), query: query }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SidebarItem] routeQuery JSON parse failed, query ignored:', routeQuery, e)
    }
  }
  return getNormalPath(props.basePath + '/' + routePath)
}

function hasTitle(title: string): string {
  if (title.length > 5) {
    return title
  } else {
    return ''
  }
}
</script>
