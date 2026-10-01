<template>
  <transition name="batch-slide-up">
    <div
      v-if="visible && selectedCount > 0"
      class="batch-actions-bar fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] min-w-[480px] max-w-[90vw] py-3 px-5 flex items-center justify-between gap-4 border border-border rounded-lg"
    >
      <div class="batch-info flex items-center gap-2 text-text-primary">
        <el-icon class="batch-icon"><Operation /></el-icon>
        <span class="batch-text">
          {{ t('batchActions.selected') }}
          <strong>{{ selectedCount }}</strong>
          {{ t('batchActions.items') }}
        </span>
        <el-button link type="primary" @click="$emit('clear')">{{ t('batchActions.clear') }}</el-button>
      </div>
      <div class="batch-buttons flex items-center gap-2 flex-wrap">
        <slot />
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { Operation } from '@element-plus/icons-vue'

const { t } = useI18n()

defineProps({
  /** 选中行数 */
  selectedCount: {
    type: Number,
    default: 0
  },
  /** 是否显示（受控） */
  visible: {
    type: Boolean,
    default: true
  }
})

defineEmits(['clear'])
</script>

<style lang="scss" scoped>
.batch-actions-bar {
  background: var(--el-bg-color, #fff);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.batch-info {
  .batch-icon {
    font-size: 18px;
    color: var(--el-color-primary, #409eff);
  }

  .batch-text strong {
    color: var(--el-color-primary, #409eff);
    margin: 0 4px;
  }
}

.batch-slide-up-enter-active,
.batch-slide-up-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.batch-slide-up-enter-from,
.batch-slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 30px);
}
</style>
