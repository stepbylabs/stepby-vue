<template>
  <transition name="batch-slide-up">
    <div
      v-if="visible && selectedCount > 0"
      class="batch-actions-bar fixed bottom-6 left-1/2 z-[2000] py-3 px-5 flex items-center justify-between gap-4 border border-border rounded-lg"
      :class="
        isMobile
          ? 'w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col items-stretch gap-2'
          : 'min-w-[480px] max-w-[90vw]'
      "
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
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { Operation } from '@element-plus/icons-vue'
import { MOBILE_BREAKPOINT } from '@/composables/useMobileFilter'

const { t } = useI18n()

/**
 * 移动端宽度（b144）：这条栏原先固定 `min-w-[480px] max-w-[90vw]`——CSS 里 **min-width
 * 优先于 max-width**，所以在 375px 的屏上它仍然是 480px 宽：左右各溢出 ~52px，
 * 而批量按钮排在右半边 ⇒ 手机上"选中了却点不到操作"。
 *
 * 断点取自 `useMobileFilter` 的同一个常量（`MOBILE_BREAKPOINT`，与 layout 三档判定同口径）：
 * 再写一个 640/768 的字面量就有第二把尺，两把尺必然漂（AGENTS ㉘）。
 */
const { width } = useWindowSize()
const isMobile = computed(() => width.value < MOBILE_BREAKPOINT)

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
  /* 居中只能有一种写法（b144）：Tailwind v4 的 `-translate-x-1/2` 走的是 **translate 属性**，
     而下面过渡态写的是 `transform`——两个属性会**叠加**，于是 enter-from / leave-to 那一刻
     水平偏移是 -50% + -50% = -100%（栏从屏幕外左侧斜着滑进来）。改成只用 `transform`，
     静止态与动画态同一个属性，偏移恒为一个自身宽度的一半。 */
  transform: translateX(-50%);
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

.batch-slide-up-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 离场必须压掉指针事件（b131 同一条纪律，本批补这一处）：Vue 在 leave **开始**时就把
   「取消选择 / 选中数为 0」的状态改掉了，DOM 却要等 0.25s 才移除——这段窗口里栏**看得见、
   命中得到、点了没反应**（栏里的「清空选择」与批量按钮都在这条链上）。
   进入态刻意不加：进入的是当前内容，仍应立刻可点。 */
.batch-slide-up-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.batch-slide-up-enter-from,
.batch-slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 30px);
}
</style>
