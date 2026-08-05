<template>
  <div class="icon-body">
    <el-input
      v-model="iconName"
      class="icon-search"
      clearable
      :placeholder="t('iconSelect.placeholder')"
      :maxlength="100"
      @clear="filterIcons"
      @input="filterIcons"
    >
      <template #suffix><i class="el-icon-search el-input__icon" /></template>
    </el-input>
    <div class="icon-list">
      <TransitionGroup name="icon-grid" tag="div" class="list-container">
        <div
          v-for="item in iconList"
          class="icon-item-wrapper"
          :key="item"
          role="button"
          tabindex="0"
          :aria-label="t('iconSelect.selectIcon', { name: item })"
          :aria-pressed="activeIcon === item"
          @click="selectedIcon(item)"
          @keydown.enter.prevent="selectedIcon(item)"
        >
          <div :class="['icon-item', { active: activeIcon === item }]">
            <svg-icon :icon-class="item" class-name="icon" class="h-[25px] w-4" aria-hidden="true" />
            <span>{{ item }}</span>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import icons from './requireIcons'

const { t } = useI18n()
defineProps({
  activeIcon: {
    type: String
  }
})

const iconName = ref('')
const iconList = ref(icons)
const emit = defineEmits(['selected'])

function filterIcons(): void {
  iconList.value = icons
  if (iconName.value) {
    iconList.value = icons.filter((item) => item.indexOf(iconName.value) !== -1)
  }
}

function selectedIcon(name: string): void {
  emit('selected', name)
  document.body.click()
}

function reset(): void {
  iconName.value = ''
  iconList.value = icons
}

defineExpose({
  reset
})
</script>

<style lang="scss" scoped>
.icon-body {
  width: 100%;
  padding: 10px;
  .icon-search {
    position: relative;
    margin-bottom: 5px;
  }
  .icon-list {
    height: 200px;
    overflow: auto;
    .list-container {
      display: flex;
      flex-wrap: wrap;
      .icon-item-wrapper {
        width: calc(100% / 3);
        height: 25px;
        line-height: 25px;
        cursor: pointer;
        display: flex;
        .icon-item {
          display: flex;
          max-width: 100%;
          height: 100%;
          padding: 0 5px;
          &:hover {
            background: var(--el-fill-color-light);
            border-radius: 5px;
          }
          .icon {
            flex-shrink: 0;
          }
          span {
            display: inline-block;
            vertical-align: -0.15em;
            fill: currentColor;
            padding-left: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
        .icon-item.active {
          background: var(--el-fill-color-light);
          border-radius: 5px;
        }
      }
    }
  }
}

.icon-item {
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}
</style>
