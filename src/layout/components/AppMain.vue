<template>
  <section id="main-content" class="app-main w-full relative overflow-hidden">
    <!-- 面包屑（UX-1）：内容区顶部层级定位；随内容滚动（TagsView 常驻提供访问历史） -->
    <breadcrumb v-if="!route.meta.link" class="app-breadcrumb-wrap" />
    <router-view v-slot="{ Component, route }">
      <!-- P1 修复：key 用 fullPath（含 query），使同一路径不同参数（详情页带参跳转）重建组件，
           避免 keep-alive 缓存导致显示旧数据；与 TagsView isActive 的 fullPath 语义一致 -->
      <ErrorBoundary v-if="!route.meta.link">
        <transition name="fade-transform" mode="out-in">
          <keep-alive :include="tagsViewStore.cachedViews" :max="20">
            <component :is="Component" :key="route.fullPath" />
          </keep-alive>
        </transition>
      </ErrorBoundary>
    </router-view>
    <iframe-toggle />
    <!-- 回到顶部（UX-2）：滚动容器为 .app-main 自身（overflow-y: auto） -->
    <el-backtop target=".app-main" :right="24" :bottom="48" />
    <copyright />
  </section>
</template>

<script setup lang="ts">
import copyright from './Copyright/index.vue'
import iframeToggle from './IframeToggle/index.vue'
import Breadcrumb from './Breadcrumb/index.vue'
import ErrorBoundary from '@/components/ErrorBoundary/index.vue'
import useTagsViewStore from '@/store/modules/tagsView'

const route = useRoute()
const tagsViewStore = useTagsViewStore()

// watch route.meta.link 变化时按需添加 iframe 视图，避免 watchEffect 过度追踪
watch(
  () => route.meta.link,
  () => addIframe(),
  { immediate: true }
)

function addIframe(): void {
  if (route.meta.link) {
    tagsViewStore.addIframeView(route)
  }
}
</script>

<style lang="scss" scoped>
.app-main {
  /* 50= navbar  50  */
  min-height: calc(100vh - 50px);
}

/* 面包屑容器：内容区顶部，深目录页面的层级定位（UX-1） */
.app-breadcrumb-wrap:empty {
  display: none;
}

.fixed-header + .app-main {
  overflow-y: auto;
  scrollbar-gutter: auto;
  height: calc(100vh - 50px);
  min-height: 0px;
}

.app-main:has(.copyright) {
  padding-bottom: 36px;
}

.fixed-header + .app-main {
  margin-top: 50px;
}

.hasTagsView {
  .app-main {
    /* 84 = navbar + tags-view = 50 + 34 */
    min-height: calc(100vh - 84px);
  }

  .fixed-header + .app-main {
    margin-top: 84px;
    height: calc(100vh - 84px);
    min-height: 0px;
  }
}

/* 移动端fixed-header优化 */
@media screen and (max-width: 991px) {
  .fixed-header + .app-main {
    padding-bottom: max(60px, calc(constant(safe-area-inset-bottom) + 40px));
    padding-bottom: max(60px, calc(env(safe-area-inset-bottom) + 40px));
    overscroll-behavior-y: none;
  }

  .hasTagsView .fixed-header + .app-main {
    padding-bottom: max(60px, calc(constant(safe-area-inset-bottom) + 40px));
    padding-bottom: max(60px, calc(env(safe-area-inset-bottom) + 40px));
    overscroll-behavior-y: none;
  }
}

@supports (-webkit-touch-callout: none) {
  @media screen and (max-width: 991px) {
    .fixed-header + .app-main {
      padding-bottom: max(17px, calc(constant(safe-area-inset-bottom) + 10px));
      padding-bottom: max(17px, calc(env(safe-area-inset-bottom) + 10px));
      height: calc(100svh - 50px);
      height: calc(100dvh - 50px);
    }

    .hasTagsView .fixed-header + .app-main {
      padding-bottom: max(17px, calc(constant(safe-area-inset-bottom) + 10px));
      padding-bottom: max(17px, calc(env(safe-area-inset-bottom) + 10px));
      height: calc(100svh - 84px);
      height: calc(100dvh - 84px);
    }
  }
}
</style>

<style lang="scss">
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background-color: var(--el-fill-color-light);
}

::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
  border-radius: 3px;
}
</style>
