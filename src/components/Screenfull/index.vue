<template>
  <div
    class="screenfull-icon transition-all duration-200 hover:text-[var(--el-color-primary)]"
    role="button"
    tabindex="0"
    :aria-label="isFullscreen ? t('layout.navbar.exitFullscreen') : t('layout.navbar.enterFullscreen')"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <svg-icon :icon-class="isFullscreen ? 'exit-fullscreen' : 'fullscreen'" />
  </div>
</template>

<script setup lang="ts">
/**
 * 全屏按钮（b112）
 *
 * 改造前用 `useFullscreen()` 的 `toggle()`：拒绝（iframe 策略 / 非用户手势 / 内核不支持）
 * 没人接管 ⇒ unhandledrejection，而图标与屏幕都毫无变化——用户以为按钮坏了。
 * 现走 `utils/fullscreen` 单一通道：失败可见；图标状态由 `fullscreenchange` 事件同步，
 * 其他入口（Ctrl+Shift+F / 命令面板 / 报表页）切换全屏时本图标同样跟住。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isFullscreen as readFullscreen, toggleFullscreen } from '@/utils/fullscreen'
import modal from '@/plugins/modal'

const { t } = useI18n()
const isFullscreen = ref(readFullscreen())

function sync(): void {
  isFullscreen.value = readFullscreen()
}

async function toggle(): Promise<void> {
  const ok = await toggleFullscreen()
  sync()
  if (!ok) modal.msgWarning(t('common.fullscreenFail'))
}

onMounted(() => document.addEventListener('fullscreenchange', sync))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync))
</script>

<style lang="scss" scoped>
.screenfull-icon {
  transition: color 0.2s;
  color: var(--el-text-color-regular);
}
</style>
