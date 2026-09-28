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
    <div class="icon-list" ref="listRef" @scroll.passive="handleScroll">
      <!--
        虚拟滚动：list-container 只作为「撑起滚动高度」的占位层，
        list-viewport 按 scrollTop 计算出的窗口区间做 translateY 位移，
        因此无论过滤出多少图标，真实 DOM 节点数都恒定受窗口大小约束。
      -->
      <div class="list-container" :style="{ height: totalHeight + 'px' }">
        <TransitionGroup
          name="icon-grid"
          tag="div"
          class="list-viewport"
          :style="{ transform: `translateY(${offsetY}px)` }"
        >
          <div
            v-for="item in visibleIcons"
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

// 虚拟滚动几何参数：与下方 .icon-list / .icon-item-wrapper 的 CSS 尺寸保持一致
// （每行 3 列、行高 25px、可视区高 200px ⇒ 可见 8 行），改动 CSS 时须同步此处。
const ICON_COLUMNS = 3
const ICON_ROW_HEIGHT = 25
const VIEWPORT_HEIGHT = 200
// 上下各多渲染 2 行，避免快速滚动时出现空白
const OVERSCAN_ROWS = 2

const visibleRows = Math.ceil(VIEWPORT_HEIGHT / ICON_ROW_HEIGHT)

const iconName = ref('')
const iconList = ref(icons)
const emit = defineEmits(['selected'])

const listRef = useTemplateRef('listRef')
const scrollTop = ref(0)

function handleScroll(e: Event): void {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

const totalRows = computed(() => Math.ceil(iconList.value.length / ICON_COLUMNS))

const startRow = computed(() => {
  // 上限收窄：保证窗口末尾不会越过真实数据（否则切片会出现空白）
  const maxStartRow = Math.max(0, totalRows.value - visibleRows)
  const raw = Math.floor(scrollTop.value / ICON_ROW_HEIGHT) - OVERSCAN_ROWS
  return Math.min(Math.max(0, raw), maxStartRow)
})

const endRow = computed(() => Math.min(totalRows.value, startRow.value + visibleRows + OVERSCAN_ROWS * 2))

// 切片起点必须是 ICON_COLUMNS 的整数倍，才能保持 3 列网格的行对齐
const visibleIcons = computed(() => iconList.value.slice(startRow.value * ICON_COLUMNS, endRow.value * ICON_COLUMNS))

const offsetY = computed(() => startRow.value * ICON_ROW_HEIGHT)
const totalHeight = computed(() => totalRows.value * ICON_ROW_HEIGHT)

function filterIcons(): void {
  iconList.value = icons
  if (iconName.value) {
    iconList.value = icons.filter((item) => item.indexOf(iconName.value) !== -1)
  }
  // 过滤后结果集变化，滚动位置归零，否则窗口区间会停在上一次的位置上
  scrollTop.value = 0
  if (listRef.value) {
    listRef.value.scrollTop = 0
  }
}

function selectedIcon(name: string): void {
  emit('selected', name)
  document.body.click()
}

function reset(): void {
  iconName.value = ''
  iconList.value = icons
  scrollTop.value = 0
  if (listRef.value) {
    listRef.value.scrollTop = 0
  }
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
      position: relative;
      .list-viewport {
        display: flex;
        flex-wrap: wrap;
        will-change: transform;
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
}

.icon-item {
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}
</style>