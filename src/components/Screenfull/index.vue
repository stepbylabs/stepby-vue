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
import { useFullscreen } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { isFullscreen, toggle } = useFullscreen()
</script>

<style lang="scss" scoped>
.screenfull-icon {
  transition: color 0.2s ease;
  color: var(--el-text-color-regular);
}
</style>
