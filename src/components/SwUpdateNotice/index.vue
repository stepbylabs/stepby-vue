<template>
  <!-- 新版本提示（b117）：非模态、可稍后、只由用户触发刷新。
       位置取左下，避开右下角的 ElNotification 堆栈与顶部的固定头部；
       移动端底栏（.mobile-tabbar，高 56px）存在时上移，避免遮挡导航。 -->
  <transition name="el-fade-in">
    <div
      v-if="visible"
      class="fixed left-4 z-[2500] w-[min(360px,calc(100vw-32px))] rounded-lg border border-[var(--el-border-color-light)] bg-[var(--el-bg-color-overlay)] p-3 shadow-lg bottom-[calc(56px_+_var(--safe-bottom,0px)_+_12px)] sm:bottom-6"
    >
      <p
        class="sw-update-title text-sm font-medium text-[var(--el-text-color-primary)]"
        role="status"
        aria-live="polite"
      >
        {{ t('swUpdate.title') }}
      </p>
      <p class="mt-1 text-xs leading-5 text-[var(--el-text-color-secondary)]">{{ t('swUpdate.desc') }}</p>
      <div class="mt-2 flex justify-end gap-2">
        <el-button size="small" @click="dismiss">{{ t('swUpdate.later') }}</el-button>
        <el-button size="small" type="primary" @click="reloadNow">{{ t('swUpdate.reload') }}</el-button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { applySwUpdate, checkSwUpdate, swUpdateReady, swUpdateSeq, SW_UPDATE_CHECK_INTERVAL_MS } from '@/utils/swUpdate'
import { useVisiblePolling } from '@/composables/useVisiblePolling'

const { t } = useI18n()

// 「稍后」只压住它当时看到的那一次激活：下一次发版（seq 前进）必须重新提示，
// 否则用户点过一次"稍后"就再也看不到更新入口。
const dismissedSeq = ref(0)
const visible = computed(() => swUpdateReady.value && swUpdateSeq.value > dismissedSeq.value)

// 长驻 SPA 没有导航，浏览器不会自己去查新版本 ⇒ 由可见轮询驱动（隐藏即停、可见补一次）。
// 首屏那一次检查由 SW 注册本身完成（immediate: true），这里不立刻补跑。
const polling = useVisiblePolling(
  async () => {
    await checkSwUpdate()
  },
  () => SW_UPDATE_CHECK_INTERVAL_MS
)
polling.start()

function dismiss(): void {
  dismissedSeq.value = swUpdateSeq.value
}

function reloadNow(): void {
  applySwUpdate()
}
</script>
