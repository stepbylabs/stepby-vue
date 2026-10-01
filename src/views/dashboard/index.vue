<template>
  <div class="app-container p-4">
    <!-- 顶部工具栏：编辑态开关 + 恢复默认 -->
    <div class="dashboard-toolbar">
      <span class="dashboard-toolbar__tip">{{ t('dashboard.layout.hint') }}</span>
      <div class="dashboard-toolbar__actions">
        <el-button v-if="editing" size="small" :icon="RefreshLeft" @click="onReset">
          {{ t('dashboard.layout.reset') }}
        </el-button>
        <el-badge v-if="editing && hiddenCount > 0" :value="hiddenCount" class="dashboard-toolbar__badge">
          <el-popover placement="bottom-end" :width="220" trigger="click">
            <template #reference>
              <el-button size="small" :icon="Plus">{{ t('dashboard.layout.add') }}</el-button>
            </template>
            <div class="widget-add-list">
              <div v-for="w in hiddenWidgets" :key="w.id" class="widget-add-item">
                <span>{{ t(w.titleKey) }}</span>
                <el-button link type="primary" size="small" @click="toggleVisible(w.id)">
                  {{ t('dashboard.layout.show') }}
                </el-button>
              </div>
              <el-empty v-if="hiddenCount === 0" :image-size="48" :description="t('dashboard.layout.noHidden')" />
            </div>
          </el-popover>
        </el-badge>
        <el-button size="small" :type="editing ? 'primary' : 'default'" :icon="Setting" @click="toggleEditing">
          {{ editing ? t('dashboard.layout.done') : t('dashboard.layout.edit') }}
        </el-button>
      </div>
    </div>

    <el-empty v-if="visibleCount === 0 && !editing" :description="t('dashboard.layout.allHidden')">
      <el-button type="primary" @click="onReset">{{ t('dashboard.layout.reset') }}</el-button>
    </el-empty>

    <draggable
      v-else
      v-model="layout"
      :disabled="!editing"
      handle=".widget-drag-handle"
      item-key="id"
      tag="div"
      class="widget-grid"
      ghost-class="widget-cell--ghost"
    >
      <template #item="{ element }">
        <div
          v-show="editing || element.visible"
          class="widget-cell"
          :style="{ gridColumn: `span ${cellSpan(element)}` }"
        >
          <!-- 编辑态：抓手 + 宽度 + 隐藏（vuedraggable 以 .widget-drag-handle 为拖拽起点） -->
          <div v-if="editing" class="widget-editbar">
            <span class="widget-drag-handle">
              <el-icon><Rank /></el-icon>
              <span class="widget-editbar__label">{{ t(titleKey(element.id)) }}</span>
            </span>
            <span class="widget-editbar__actions">
              <el-button
                v-if="isResizable(element.id)"
                link
                size="small"
                :aria-label="t('dashboard.layout.width')"
                @click="cycleSpan(element)"
              >
                {{ element.span }}
                <span class="widget-editbar__unit">/24</span>
              </el-button>
              <el-button
                link
                size="small"
                :aria-label="element.visible ? t('dashboard.layout.hide') : t('dashboard.layout.show')"
                @click="toggleVisible(element.id)"
              >
                <el-icon>
                  <View v-if="element.visible" />
                  <Hide v-else />
                </el-icon>
              </el-button>
            </span>
          </div>

          <div v-if="element.visible" class="widget-cell__body">
            <component :is="widgetComp(element.id)" />
          </div>
          <div v-else class="widget-hidden-hint">
            <el-icon><Hide /></el-icon>
            <span>{{ t('dashboard.layout.hiddenHint') }}</span>
            <el-button link type="primary" size="small" @click="toggleVisible(element.id)">
              {{ t('dashboard.layout.show') }}
            </el-button>
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Rank, View, Hide, Plus, Setting, RefreshLeft } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import { WIDGET_REGISTRY, type WidgetId, type LayoutItem, nextSpan } from './dashboardLayout'
import { useDashboardLayout } from './useDashboardLayout'
import StatCardsWidget from './widgets/StatCardsWidget.vue'
import QuickEntryWidget from './widgets/QuickEntryWidget.vue'
import FlowTodoWidget from './widgets/FlowTodoWidget.vue'
import LoginTrendWidget from './widgets/LoginTrendWidget.vue'
import OperPieWidget from './widgets/OperPieWidget.vue'
import UserTrendWidget from './widgets/UserTrendWidget.vue'
import RecentOperLogWidget from './widgets/RecentOperLogWidget.vue'

const { t } = useI18n()
const { layout, editing, toggleVisible, setSpan, reset } = useDashboardLayout()

const WIDGET_COMPONENTS: Record<WidgetId, Component> = {
  stats: StatCardsWidget,
  quickEntry: QuickEntryWidget,
  flowTodo: FlowTodoWidget,
  loginTrend: LoginTrendWidget,
  operPie: OperPieWidget,
  userTrend: UserTrendWidget,
  recentOperLog: RecentOperLogWidget
}

function widgetComp(id: WidgetId): Component {
  return WIDGET_COMPONENTS[id]
}
function titleKey(id: WidgetId): string {
  return WIDGET_REGISTRY.find((w) => w.id === id)?.titleKey ?? id
}
function isResizable(id: WidgetId): boolean {
  return WIDGET_REGISTRY.find((w) => w.id === id)?.resizable ?? false
}

const visibleCount = computed(() => layout.value.filter((i: LayoutItem) => i.visible).length)
const hiddenCount = computed(() => layout.value.length - visibleCount.value)
const hiddenWidgets = computed(() =>
  WIDGET_REGISTRY.filter((w) => !layout.value.find((i: LayoutItem) => i.id === w.id)?.visible)
)

function toggleEditing(): void {
  editing.value = !editing.value
}

function cycleSpan(item: LayoutItem): void {
  setSpan(item.id, nextSpan(item.span))
}

function onReset(): void {
  ElMessageBox.confirm(t('dashboard.layout.resetConfirm'), t('common.confirm'), { type: 'warning' })
    .then(() => {
      reset()
      ElMessage.success(t('dashboard.layout.resetSuccess'))
    })
    .catch(() => {})
}

// 响应式：窄屏每卡占满整行，避免 8/16 栅格在移动端过窄
const narrow = ref(false)
function onResize(): void {
  narrow.value = window.innerWidth < 992
}
onMounted(() => {
  onResize()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

function cellSpan(item: LayoutItem): number {
  if (!item.visible) return 24
  return narrow.value ? 24 : item.span
}
</script>

<style lang="scss" scoped>
.dashboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.dashboard-toolbar__tip {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.dashboard-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 16px;
}
.widget-cell {
  min-width: 0;
}
.widget-cell--ghost {
  opacity: 0.4;
}
.widget-cell__body {
  height: 100%;
}
.widget-editbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px dashed var(--el-border-color, #dcdfe6);
}
.widget-drag-handle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: grab;
  min-width: 0;
  color: var(--el-text-color-regular);
}
.widget-drag-handle:active {
  cursor: grabbing;
}
.widget-editbar__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.widget-editbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.widget-editbar__unit {
  font-size: 10px;
  opacity: 0.7;
}
.widget-hidden-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  border: 1px dashed var(--el-border-color, #dcdfe6);
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.widget-add-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.widget-add-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
</style>
