<template>
  <Transition name="fade-slide">
    <!-- b89 项 9：这一整块原先是 `role="menuitem" tabindex="-1" @click`——右键菜单里
         **一个键盘出口都没有**（Tab 到不了、回车没反应），而它是"刷新页面/关闭其他/关闭全部"
         的唯一入口。改成每一项 `tabindex="0"` + 回车激活：菜单只在右键后 `v-show` 显示，
         隐藏时 `display:none` 不进 Tab 序列，因此不会给正常浏览增加 6 个停靠点。 -->
    <ul v-show="visible" :style="{ left: left + 'px', top: top + 'px' }" class="contextmenu" role="menu">
      <li role="menuitem" tabindex="0" @click="emit('refresh')" @keydown.enter.prevent="emit('refresh')">
        <refresh-right class="w-[1em] h-[1em]" />
        {{ safeT('layout.tagsView.refreshPage') }}
      </li>
      <li
        v-if="!isAffixFn(selectedTag)"
        role="menuitem"
        tabindex="0"
        @click="emit('close')"
        @keydown.enter.prevent="emit('close')"
      >
        <close class="w-[1em] h-[1em]" />
        {{ safeT('layout.tagsView.closeCurrent') }}
      </li>
      <li role="menuitem" tabindex="0" @click="emit('closeOthers')" @keydown.enter.prevent="emit('closeOthers')">
        <circle-close class="w-[1em] h-[1em]" />
        {{ safeT('layout.tagsView.closeOthers') }}
      </li>
      <li
        v-if="!isFirstFn()"
        role="menuitem"
        tabindex="0"
        @click="emit('closeLeft')"
        @keydown.enter.prevent="emit('closeLeft')"
      >
        <back class="w-[1em] h-[1em]" />
        {{ safeT('layout.tagsView.closeLeft') }}
      </li>
      <li
        v-if="!isLastFn()"
        role="menuitem"
        tabindex="0"
        @click="emit('closeRight')"
        @keydown.enter.prevent="emit('closeRight')"
      >
        <right class="w-[1em] h-[1em]" />
        {{ safeT('layout.tagsView.closeRight') }}
      </li>
      <li role="menuitem" tabindex="0" @click="emit('closeAll')" @keydown.enter.prevent="emit('closeAll')">
        <circle-close class="w-[1em] h-[1em]" />
        {{ safeT('layout.tagsView.closeAll') }}
      </li>
    </ul>
  </Transition>
</template>

<script setup lang="ts">
import type { View } from '@/store/modules/tagsView'
import { safeT } from '@/utils/safeI18n'

defineProps<{
  visible: boolean
  left: number
  top: number
  selectedTag: View | Record<string, never>
  isAffixFn: (tag: View | Record<string, never>) => boolean
  isFirstFn: () => boolean
  isLastFn: () => boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'close'): void
  (e: 'closeOthers'): void
  (e: 'closeLeft'): void
  (e: 'closeRight'): void
  (e: 'closeAll'): void
}>()
</script>

<style lang="scss" scoped>
.contextmenu {
  margin: 0;
  background: var(--el-bg-color-overlay, #fff);
  z-index: 3000;
  position: fixed;
  list-style-type: none;
  padding: 5px 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 400;
  color: var(--tags-item-text, #333);
  box-shadow: 2px 2px 3px 0 rgba(0, 0, 0, 0.3);
  border: 1px solid var(--el-border-color-light, #e4e7ed);

  li {
    margin: 0;
    padding: 7px 16px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    /* icon + 文字强制单行：避免窗口边缘/长文案时被挤成两行（用户实测缺陷） */
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;

    :deep(svg) {
      flex-shrink: 0;
    }

    &:hover {
      background: var(--tags-item-hover, #eee);
    }
  }
}
</style>
