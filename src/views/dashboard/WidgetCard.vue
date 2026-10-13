<template>
  <el-card shadow="hover" class="widget-card">
    <template #header>
      <div class="widget-card__header">
        <span class="widget-card__title">
          <el-icon><component :is="iconComp" /></el-icon>
          <span class="widget-card__label">{{ title }}</span>
        </span>
        <span class="widget-card__actions">
          <slot name="header-actions" />
        </span>
      </div>
    </template>
    <slot />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import * as ElIcons from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{ title: string; icon?: string }>(), { icon: 'Menu' })

// 按名称解析图标组件；未命中回退通用图标，避免动态 :is 拿到 undefined
const iconComp = computed(
  () => (ElIcons as Record<string, unknown>)[props.icon] || (ElIcons as Record<string, unknown>).Menu
)
</script>

<style lang="scss" scoped>
.widget-card {
  height: 100%;
}
.widget-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 500;
}
.widget-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.widget-card__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.widget-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
