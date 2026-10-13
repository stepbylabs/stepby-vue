<template>
  <el-breadcrumb v-if="levelList.length > 1" class="app-breadcrumb" separator="/">
    <TransitionGroup name="breadcrumb">
      <el-breadcrumb-item v-for="(item, index) in levelList" :key="item.path">
        <span v-if="index === levelList.length - 1" class="no-redirect">{{ translateTitle(item.meta) }}</span>
        <a v-else @click.prevent="handleLink(item)">{{ translateTitle(item.meta) }}</a>
      </el-breadcrumb-item>
    </TransitionGroup>
  </el-breadcrumb>
</template>

<script setup lang="ts">
/**
 * 面包屑导航（UX-PLAN-2026-09-28 UX-1）
 *
 * 层级来源：route.matched 中带 meta.title 的项。目录层级可点击回跳（redirect
 * = 'noRedirect' 的目录不可点，与后端 RouterVo 契约一致）；当前页不可点。
 * 标题经 useMenuTitle 的 translateTitle 走 i18n（menu.* key），与侧边栏/Tab 同源。
 */
import type { RouteLocationMatched } from 'vue-router'
import { translateTitle } from '@/composables/useMenuTitle'
import router from '@/router'

const route = useRoute()

/** 有展示意义的层级（有 title 且非外链） */
const levelList = computed<RouteLocationMatched[]>(() =>
  route.matched.filter(
    (item) =>
      item.meta &&
      typeof item.meta.title === 'string' &&
      item.meta.title.length > 0 &&
      !item.meta.link
  )
)

function handleLink(item: RouteLocationMatched): void {
  const { redirect, path } = item
  if (redirect === 'noRedirect') return
  if (redirect) {
    router.push(redirect as string)
    return
  }
  router.push(path)
}
</script>

<style lang="scss" scoped>
.app-breadcrumb {
  display: inline-block;
  font-size: 13px;
  line-height: 22px;
  margin: 8px 12px 0;

  .no-redirect {
    color: var(--el-text-color-placeholder);
    font-weight: 600;
    cursor: text;
  }

  a {
    color: var(--el-text-color-secondary);
    font-weight: 400;
    cursor: pointer;
    transition: color 0.15s ease;

    &:hover {
      color: var(--el-color-primary);
    }
  }
}
</style>
