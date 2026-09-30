<template>
  <div
    id="tags-view-container"
    class="tags-view-container"
    :class="{ 'tags-view-container--chrome': tagsViewStyle === 'chrome' }">
    <!-- 左切换箭头 -->
    <span
      class="tags-nav-btn tags-nav-btn--left"
      :class="{ disabled: !canScrollLeft }"
      role="button"
      tabindex="0"
      :aria-label="safeT('layout.tagsView.scrollLeft')"
      @click="scrollLeft"
      @keydown.enter.prevent="scrollLef" >
      <el-icon><arrow-left /></el-icon>
    </span>

    <!-- 标签滚动区 -->
    <scroll-pane ref="scrollPaneRef" class="tags-view-wrapper" @scroll="handleScroll" @update-arrows="updateArrowState">
      <div v-auto-animate class="inline-flex items-center h-full">
        <router-link
          v-for="(tag, idx) in visitedViews"
          :key="tag.fullPath"
          :data-path="tag.path"
          :draggable="!isAffix(tag)"
          :class="{
            active: isActive(tag),
            'has-icon': tagsIcon,
            dragging: draggingIdx === idx,
            'drag-over': dragOverIdx === idx
          }"
          :to="{ path: tag.path, query: tag.query, fullPath: tag.fullPath }"
          class="tags-view-item"
          :style="tagActiveStyle(tag)"
          :aria-current="isActive(tag) ? 'page' : undefined"
          @click.middle="!isAffix(tag) ? closeSelectedTag(tag) : ''"
          @contextmenu.prevent="openMenu(tag, $event)"
          @dragstart="onDragStart($event, idx)"
          @dragover.prevent="onDragOver($event, idx)"
          @dragleave="onDragLeave(idx)"
          @drop.prevent="onDrop(idx)"
          @dragend="onDragEn" >
          <svg-icon
            v-if="tagsIcon && tag.meta && tag.meta.icon && tag.meta.icon !== '#'"
            :icon-class="tag.meta.icon"
            style="margin-right: 3px"
            aria-hidden="true"
          />
          {{ translateTitle(tag.meta) }}
          <span
            v-if="!isAffix(tag)"
            @click.prevent.stop="closeSelectedTag(tag)"
            @keydown.enter.prevent.stop="closeSelectedTag(tag)"
            class="tags-close-btn inline-flex items-center justify-center w-5 h-5 ml-1 rounded-full cursor-pointer p-0.5 box-border"
            role="button"
            tabindex="0"
            :aria-label="safeT('layout.tagsView.closeTag', { title: translateTitle(tag.meta) })" >
            <close class="w-[1em] h-[1em] el-icon-close" />
          </span>
        </router-link>
      </div>
    </scroll-pane>

    <!-- 右切换箭头 -->
    <span
      class="tags-nav-btn tags-nav-btn--right"
      :class="{ disabled: !canScrollRight }"
      role="button"
      tabindex="0"
      :aria-label="safeT('layout.tagsView.scrollRight')"
      @click="scrollRight"
      @keydown.enter.prevent="scrollRigh" >
      <el-icon><arrow-right /></el-icon>
    </span>

    <!-- 下拉操作菜单 -->
    <el-dropdown
      class="tags-action-dropdown shrink-0 flex items-center"
      trigger="click"
      placement="bottom-end"
      @command="handleDropdownComman" >
      <span class="tags-action-btn">
        <el-icon><arrow-down /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu class="tags-dropdown-menu">
          <el-dropdown-item v-if="!isAffix(selectedDropdownTag)" command="close">
            <close class="w-[1em] h-[1em]" />
            {{ safeT('layout.tagsView.closeCurrent') }}
          </el-dropdown-item>
          <el-dropdown-item command="closeOthers">
            <circle-close class="w-[1em] h-[1em]" />
            {{ safeT('layout.tagsView.closeOthers') }}
          </el-dropdown-item>
          <el-dropdown-item command="closeLeft" :disabled="isFirstView()">
            <back class="w-[1em] h-[1em]" />
            {{ safeT('layout.tagsView.closeLeft') }}
          </el-dropdown-item>
          <el-dropdown-item command="closeRight" :disabled="isLastView()">
            <right class="w-[1em] h-[1em]" />
            {{ safeT('layout.tagsView.closeRight') }}
          </el-dropdown-item>
          <el-dropdown-item command="closeAll">
            <circle-close class="w-[1em] h-[1em]" />
            {{ safeT('layout.tagsView.closeAll') }}
          </el-dropdown-item>
          <el-dropdown-item command="fullscreen" divided>
            <template v-if="!isFullscreen">
              <full-screen class="w-[1em] h-[1em]" />
              {{ safeT('layout.tagsView.fullscreen') }}
            </template>
            <template v-else>
              <close class="w-[1em] h-[1em]" />
              {{ safeT('layout.tagsView.exitFullscreen') }}
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 刷新按钮 -->
    <span
      class="tags-action-btn tags-refresh-btn"
      role="button"
      tabindex="0"
      :aria-label="safeT('layout.tagsView.refreshCurrent')"
      @click="refreshSelectedTag(selectedDropdownTag)"
      @keydown.enter.prevent="refreshSelectedTag(selectedDropdownTag)" >
      <el-icon><refresh-right class="w-[1em] h-[1em]" /></el-icon>
      {{ safeT('common.refresh') }}
    </span>

    <!-- 右键上下文菜单 -->
    <ContextMenu
      :visible="visible"
      :left="left"
      :top="top"
      :selected-tag="selectedTag"
      :is-affix-fn="isAffix"
      :is-first-fn="isFirstView"
      :is-last-fn="isLastView"
      @refresh="refreshSelectedTag(selectedTag)"
      @close="closeSelectedTag(selectedTag)"
      @close-others="closeOthersTags"
      @close-left="closeLeftTags"
      @close-right="closeRightTags"
      @close-all="closeAllTags(selectedTag)"
    />
  </div>
</template>

<script setup lang="ts">
import type { View } from '@/store/modules/tagsView'
import ScrollPane from './ScrollPane.vue'
import ContextMenu from './ContextMenu.vue'
import useTagsViewDrag from './useTagsViewDrag'
import { getNormalPath } from '@/utils/stepby'
import useTagsViewStore from '@/store/modules/tagsView'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'
import useAppStore from '@/store/modules/app'
import tab from '@/plugins/tab'
import { useMenuTitle } from '@/composables/useMenuTitle'
import { vAutoAnimate } from '@formkit/auto-animate/vue'
import { safeT } from '@/utils/safeI18n'

const visible = ref<boolean>(false)
const top = ref<number>(0)
const left = ref<number>(0)
const selectedTag = ref<View | Record<string, never>>({})
const affixTags = ref<View[]>([])
const scrollPaneRef = useTemplateRef<InstanceType<typeof ScrollPane>>('scrollPaneRef')
const canScrollLeft = ref<boolean>(false)
const canScrollRight = ref<boolean>(false)
const isFullscreen = ref<boolean>(false)
const savedSidebarHide = ref<boolean>(false)

const route = useRoute()
const router = useRouter()
const { translateTitle } = useMenuTitle()

const tagsViewStore = useTagsViewStore()
const visitedViews = computed(() => tagsViewStore.visitedViews)
const routes = computed(() => usePermissionStore().routes)
const theme = computed(() => useSettingsStore().theme)
const tagsIcon = computed(() => useSettingsStore().tagsIcon)
const tagsViewPersist = computed(() => useSettingsStore().tagsViewPersist)
const tagsViewStyle = computed(() => useSettingsStore().tagsViewStyle)

// 拖拽排序（affix 标签禁止拖拽，逻辑封装于 useTagsViewDrag）
const { draggingIdx, dragOverIdx, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd } = useTagsViewDrag({
  isAffix,
  visitedViews
})

// 下拉菜单针对当前激活的 tag
const selectedDropdownTag = computed(() => visitedViews.value.find((v: View) => isActive(v)) || ({} as View))

watch(route, () => {
  addTags()
  moveToCurrentTag()
})

watch(visible, (value: boolean) => {
  if (value) {
    document.body.addEventListener('click', closeMenu)
  } else {
    document.body.removeEventListener('click', closeMenu)
  }
})

watch(visitedViews, () => {
  nextTick(() => updateArrowState())
})

onMounted(() => {
  initTags()
  addTags()
  window.addEventListener('resize', updateArrowState)
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateArrowState)
  window.removeEventListener('keydown', handleKeyDown)
  // 清理 body click 监听器，避免组件卸载后事件泄漏
  document.body.removeEventListener('click', closeMenu)
})

function handleKeyDown(event: KeyboardEvent): void {
  // 当按下Esc键且处于全屏状态时，退出全屏
  if (event.key === 'Escape' && isFullscreen.value) {
    toggleFullscreen()
  }
}

function isActive(r: View | Record<string, never>): boolean {
  // P1 修复：同路径不同 query 的标签也要正确高亮（比较 fullPath 而非仅 path），
  // 与 AppMain 的 keep-alive key 语义保持一致
  const view = r as View
  if (view.fullPath) {
    return view.fullPath === route.fullPath
  }
  return view.path === route.path
}

function tagActiveStyle(tag: View): Record<string, string> {
  if (!isActive(tag) || tagsViewStyle.value !== 'card') return {}
  return {
    'background-color': theme.value,
    'border-color': theme.value
  }
}

function isAffix(tag: View | Record<string, never>): boolean {
  return !!(tag && (tag as View).meta && (tag as View).meta.affix)
}

function isFirstView(): boolean {
  const tag = selectedTag.value && selectedTag.value.fullPath ? selectedTag.value : selectedDropdownTag.value
  if (!tag || !tag.fullPath) return false
  // 优先以首个 affix（固定）标签作为"第一个视图"判断，避免硬编码下标
  const firstAffix = visitedViews.value.find((v: View) => v.meta && v.meta.affix)
  const firstView = firstAffix || visitedViews.value[0]
  return !!firstView && tag.fullPath === firstView.fullPath
}

function isLastView(): boolean {
  try {
    const tag = selectedTag.value && selectedTag.value.fullPath ? selectedTag.value : selectedDropdownTag.value
    return tag.fullPath === visitedViews.value[visitedViews.value.length - 1].fullPath
  } catch {
    return false
  }
}

function filterAffixTags(routes: View[], basePath = ''): View[] {
  const tags: View[] = []
  routes.forEach((route) => {
    if (route.meta && route.meta.affix) {
      const tagPath = getNormalPath(basePath + '/' + route.path)
      tags.push({
        fullPath: tagPath,
        path: tagPath,
        name: route.name,
        meta: { ...route.meta }
      })
    }
    const routeChildren = (route as View & { children?: View[] }).children
    if (routeChildren) {
      const tempTags = filterAffixTags(routeChildren, route.path)
      if (tempTags.length >= 1) {
        tags.push(...tempTags)
      }
    }
  })
  return tags
}

function initTags(): void {
  if (tagsViewPersist.value) {
    useTagsViewStore().loadPersistedViews()
  }
  const res = filterAffixTags(routes.value)
  affixTags.value = res
  for (const tag of res) {
    if (tag.name) {
      useTagsViewStore().addAffixView(tag)
    }
  }
}

function addTags(): void {
  const { name } = route
  if (name) {
    useTagsViewStore().addView(route)
  }
}

function moveToCurrentTag(): void {
  nextTick(() => {
    for (const r of visitedViews.value) {
      if (r.path === route.path) {
        scrollPaneRef.value?.moveToTarget(r)
        if (r.fullPath !== route.fullPath) {
          useTagsViewStore().updateVisitedView(route)
        }
      }
    }
  })
}

function scrollLeft(): void {
  if (!canScrollLeft.value) return
  scrollPaneRef.value?.scrollToStart()
}

function scrollRight(): void {
  if (!canScrollRight.value) return
  scrollPaneRef.value?.scrollToEnd()
}

function updateArrowState(): void {
  nextTick(() => {
    if (scrollPaneRef.value) {
      const state = scrollPaneRef.value.getScrollState()
      canScrollLeft.value = state.canLeft
      canScrollRight.value = state.canRight
    }
  })
}

function toggleFullscreen() {
  const appStore = useAppStore()
  const mainContainer = document.querySelector('.main-container') as HTMLElement | null
  if (!mainContainer) return

  if (!isFullscreen.value) {
    mainContainer.classList.add('fullscreen-mode')
    document.body.style.overflow = 'hidden'
    savedSidebarHide.value = appStore.sidebar.hide
    appStore.toggleSideBarHide(true)
    isFullscreen.value = true
  } else {
    mainContainer.classList.remove('fullscreen-mode')
    document.body.style.overflow = ''
    appStore.toggleSideBarHide(savedSidebarHide.value)
    const tagsBtn = document.querySelector('.tags-action-btn') as HTMLElement | null
    tagsBtn?.blur()
    isFullscreen.value = false
  }
}

function handleDropdownCommand(command: string): void {
  const tag = selectedDropdownTag.value
  selectedTag.value = tag
  switch (command) {
    case 'refresh':
      refreshSelectedTag(tag)
      break
    case 'fullscreen':
      toggleFullscreen()
      break
    case 'close':
      closeSelectedTag(tag)
      break
    case 'closeOthers':
      closeOthersTags()
      break
    case 'closeLeft':
      closeLeftTags()
      break
    case 'closeRight':
      closeRightTags()
      break
    case 'closeAll':
      closeAllTags(tag)
      break
  }
}

function refreshSelectedTag(view: View): void {
  tab.refreshPage(view).catch(() => {})
  if (route.meta.link) {
    useTagsViewStore().delIframeView(route)
  }
}

function closeSelectedTag(view: View): void {
  tab
    .closePage(view)
    .then(({ visitedViews }) => {
      if (isActive(view)) {
        toLastView(visitedViews, view)
      }
    })
    .catch((e) => {
      if (import.meta.env.DEV) console.error('[TagsView]', e)
    })
}

function closeRightTags(): void {
  tab
    .closeRightPage(selectedTag.value as View)
    .then((visitedViews) => {
      if (!visitedViews.find((i: View) => i.fullPath === route.fullPath)) {
        toLastView(visitedViews)
      }
    })
    .catch((e) => {
      if (import.meta.env.DEV) console.error('[TagsView]', e)
    })
}

function closeLeftTags(): void {
  tab
    .closeLeftPage(selectedTag.value as View)
    .then((visitedViews) => {
      if (!visitedViews.find((i: View) => i.fullPath === route.fullPath)) {
        toLastView(visitedViews)
      }
    })
    .catch((e) => {
      if (import.meta.env.DEV) console.error('[TagsView]', e)
    })
}

function closeOthersTags(): void {
  const tag = selectedTag.value as View
  router.push(tag.fullPath || tag.path).catch(() => {})
  tab
    .closeOtherPage(tag)
    .then(() => {
      moveToCurrentTag()
    })
    .catch((e) => {
      if (import.meta.env.DEV) console.error('[TagsView]', e)
    })
}

function closeAllTags(view: View): void {
  tab
    .closeAllPage()
    .then(({ visitedViews }) => {
      if (affixTags.value.some((tag: View) => tag.path === route.path)) {
        return
      }
      toLastView(visitedViews, view)
    })
    .catch((e) => {
      if (import.meta.env.DEV) console.error('[TagsView]', e)
    })
}

function toLastView(visitedViews: View[], view?: View): void {
  const latestView = visitedViews.slice(-1)[0]
  if (latestView) {
    router.push(latestView.fullPath || latestView.path)
  } else {
    if (view && view.name === 'Dashboard') {
      // vue-router 5 对象形式 `path` 不解析内嵌 query（会静默丢弃 ?a=b），
      // 必须显式分离 path/query 再走 /redirect 中转（与 permission.ts 守卫同一教训）
      router.replace({ path: '/redirect' + view.path, query: view.query })
    } else {
      router.push('/')
    }
  }
}

function openMenu(tag: View, e: MouseEvent): void {
  left.value = e.clientX
  top.value = e.clientY
  visible.value = true
  selectedTag.value = tag
}

function closeMenu(): void {
  visible.value = false
}

function handleScroll(): void {
  closeMenu()
  updateArrowState()
}
</script>

<style lang="scss" scoped>
$tags-bar-height: 34px;

.tags-view-container {
  height: $tags-bar-height;
  width: 100%;
  background: var(--tags-bg, #fff);
  border-bottom: 1px solid var(--tags-item-border, #d8dce5);
  display: flex;
  align-items: center;
  overflow: hidden;

  $btn-width: 28px;
  $btn-color: var(--tags-item-text, #71717a);
  $btn-hover-bg: var(--tags-item-hover, #f0f2f5);
  $btn-hover-color: var(--el-text-color-primary, #303133);
  $btn-disabled-color: var(--el-text-color-disabled, #c0c4cc);
  $divider: 1px solid var(--tags-item-border, #d8dce5);

  .tags-nav-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: $btn-width;
    height: $tags-bar-height;
    cursor: pointer;
    color: $btn-color;
    font-size: 13px;
    user-select: none;
    transition:
      background 0.15s,
      color 0.15s;

    &:hover:not(.disabled) {
      background: $btn-hover-bg;
      color: $btn-hover-color;
    }

    &.disabled {
      color: $btn-disabled-color;
      cursor: not-allowed;
    }

    &--left {
      border-right: $divider;
    }
    &--right {
      border-left: $divider;
    }
  }

  .tags-view-wrapper {
    flex: 1;
    min-width: 0;
    height: 100%;

    .tags-view-item {
      display: inline-flex;
      align-items: center;
      position: relative;
      cursor: pointer;
      height: 26px;
      line-height: 26px;
      border: 1px solid var(--tags-item-border, #d8dce5);
      color: var(--tags-item-text, #495060);
      background: var(--tags-item-bg, #fff);
      padding: 0 8px;
      font-size: 12px;
      margin-left: 5px;
      border-radius: 3px;
      text-decoration: none;
      vertical-align: middle;
      padding-top: 2px !important;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;

      &:first-of-type {
        margin-left: 6px;
      }
      &:last-of-type {
        margin-right: 15px;
      }

      // 拖拽样式
      &.dragging {
        opacity: 0.4;
        cursor: grabbing;
        transition: opacity 0.15s ease;
      }

      &.drag-over {
        border-color: var(--el-color-primary, #409eff) !important;
        box-shadow: 0 0 0 2px var(--el-color-primary-light-7, #a0cfff);
        transition:
          opacity 0.15s ease,
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
    }
  }

  &:not(.tags-view-container--chrome) .tags-view-wrapper .tags-view-item.active {
    background-color: var(--el-color-primary);
    color: var(--el-color-white);
    border-color: var(--el-color-primary);

    &::before {
      content: '';
      background: var(--el-color-white);
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      position: relative;
      margin-right: 5px;
    }
  }

  &:not(.tags-view-container--chrome) .tags-view-wrapper .tags-view-item.active.has-icon::before {
    content: none !important;
  }

  .tags-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: $btn-width;
    height: $tags-bar-height;
    cursor: pointer;
    color: $btn-color;
    font-size: 13px;
    border-left: $divider;
    user-select: none;
    transition:
      background 0.15s,
      color 0.15s;

    &:hover {
      background: $btn-hover-bg;
      color: $btn-hover-color;
    }
  }

  .tags-refresh-btn {
    width: 60px;
  }

  &.tags-view-container--chrome {
    --chrome-strip-bg: var(--el-bg-page);
    --chrome-strip-border: var(--el-border-color-lighter, #e4e7ed);
    --chrome-tab-active-bg: var(--el-color-primary-light-9);
    --chrome-tab-text: var(--el-text-color-regular, #606266);
    --chrome-tab-text-active: var(--el-color-primary);
    --chrome-wing-r: 10px;

    overflow: visible;
    background: var(--chrome-strip-bg);
    border-bottom: 1px solid var(--chrome-strip-border);
    align-items: flex-end;

    .tags-nav-btn {
      align-self: stretch;
      height: auto;
      min-height: $tags-bar-height;
      border-color: var(--chrome-strip-border);
    }

    .tags-action-btn {
      border-color: var(--chrome-strip-border);
    }

    .tags-view-wrapper {
      .tags-view-item {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 1;
        height: 30px;
        min-height: 30px;
        margin: 0 0 -1px;
        padding: 0 12px;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.2;
        border: none !important;
        border-radius: 0;
        background: transparent !important;
        color: var(--chrome-tab-text);
        padding-top: 0 !important;
        box-shadow: none !important;
        transition:
          background 0.12s ease,
          color 0.12s ease,
          border-radius 0.12s ease;

        &::before,
        &::after {
          content: '' !important;
          display: block !important;
          position: absolute;
          bottom: 0;
          width: var(--chrome-wing-r);
          height: var(--chrome-wing-r);
          margin: 0 !important;
          pointer-events: none;
          background: transparent !important;
          border-radius: 0 !important;
          transition: box-shadow 0.12s ease;
        }

        &::before {
          left: calc(-1 * var(--chrome-wing-r));
          border-bottom-right-radius: var(--chrome-wing-r) !important;
          box-shadow: none;
        }

        &::after {
          right: calc(-1 * var(--chrome-wing-r));
          border-bottom-left-radius: var(--chrome-wing-r) !important;
          box-shadow: none;
        }

        &:first-of-type {
          margin-left: 6px;
        }

        &:last-of-type {
          margin-right: 10px;
        }

        &:not(.active) + .tags-view-item:not(.active) {
          border-left: 1px solid var(--el-border-color-lighter, #e4e7ed);
          padding-left: 11px;
        }

        &:hover:not(.active) {
          background: var(--el-fill-color-light, #f5f7fa) !important;
          border-radius: 6px 6px 0 0;
          color: var(--el-text-color-primary, #303133);
        }

        &.active {
          height: 31px;
          min-height: 31px;
          padding: 0 14px;
          color: var(--chrome-tab-text-active) !important;
          font-weight: 500;
          background: var(--chrome-tab-active-bg) !important;
          border: none !important;
          border-radius: var(--chrome-wing-r) var(--chrome-wing-r) 0 0;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);

          &::before {
            box-shadow: calc(var(--chrome-wing-r) * 0.5) calc(var(--chrome-wing-r) * 0.5) 0
              calc(var(--chrome-wing-r) * 0.5) var(--chrome-tab-active-bg);
          }

          &::after {
            box-shadow: calc(var(--chrome-wing-r) * -0.5) calc(var(--chrome-wing-r) * 0.5) 0
              calc(var(--chrome-wing-r) * 0.5) var(--chrome-tab-active-bg);
          }
        }
      }
    }
  }
}
</style>

<style lang="scss">
.tags-view-wrapper {
  .tags-view-item {
    .tags-close-btn {
      transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
      /* U17 优化：增大点击区域（padding 撑大可点击范围） */

      .el-icon-close {
        width: 1em;
        height: 1em;
        vertical-align: 0;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      &:hover {
        background-color: var(--tags-close-hover, #b4bccc);

        .el-icon-close {
          color: var(--el-color-white);
        }
      }
    }
  }
}

/* 页签全屏模式样式 */
.main-container.fullscreen-mode {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  margin-left: 0 !important;
  transition: none !important;
}

.main-container.fullscreen-mode .fixed-header {
  display: block !important;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100% !important;
  z-index: 1000;
  transition: none !important;
}

.main-container.fullscreen-mode .fixed-header .navbar {
  display: none !important;
}

.main-container.fullscreen-mode .app-main {
  position: fixed;
  top: 34px;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0 !important;
  padding: 0 !important;
  /* S6：dvh 随软键盘收缩（回退 100vh） */
  height: calc(100vh - 34px) !important;
  height: calc(100dvh - 34px) !important;
  min-height: calc(100dvh - 34px) !important;
  overflow: auto;
}
</style>
