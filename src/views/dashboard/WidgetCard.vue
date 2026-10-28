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
import { resolveElementIcon } from '@/components/SvgIcon/svgicon'

const props = withDefaults(defineProps<{ title: string; icon?: string }>(), { icon: 'Menu' })

// b121：不再 `import *` 整个图标包（会把 293 个图标拉进工作台 chunk），
// 改为查全局注册的同一份显式登记表；未命中回退 Menu。
const iconComp = computed(() => resolveElementIcon(props.icon))
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
