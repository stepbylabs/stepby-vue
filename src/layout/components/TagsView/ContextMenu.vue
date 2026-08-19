<template>
  <Transition name="fade-slide">
    <ul v-show="visible" :style="{ left: left + 'px', top: top + 'px' }" class="contextmenu" role="menu">
      <li role="menuitem" tabindex="-1" @click="emit('refresh')">
        <refresh-right style="width: 1em; height: 1em" />
        {{ safeT('layout.tagsView.refreshPage') }}
      </li>
      <li v-if="!isAffixFn(selectedTag)" role="menuitem" tabindex="-1" @click="emit('close')">
        <close style="width: 1em; height: 1em" />
        {{ safeT('layout.tagsView.closeCurrent') }}
      </li>
      <li role="menuitem" tabindex="-1" @click="emit('closeOthers')">
        <circle-close style="width: 1em; height: 1em" />
        {{ safeT('layout.tagsView.closeOthers') }}
      </li>
      <li v-if="!isFirstFn()" role="menuitem" tabindex="-1" @click="emit('closeLeft')">
        <back style="width: 1em; height: 1em" />
        {{ safeT('layout.tagsView.closeLeft') }}
      </li>
      <li v-if="!isLastFn()" role="menuitem" tabindex="-1" @click="emit('closeRight')">
        <right style="width: 1em; height: 1em" />
        {{ safeT('layout.tagsView.closeRight') }}
      </li>
      <li role="menuitem" tabindex="-1" @click="emit('closeAll')">
        <circle-close style="width: 1em; height: 1em" />
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

    &:hover {
      background: var(--tags-item-hover, #eee);
    }
  }
}
</style>
