<template>
  <!--
    b122：全局网络状态横幅。
    离线时常驻（这是用户当下最需要知道的一件事）；恢复后只停留几秒，
    避免"已恢复"长期占住顶部被误读成当前仍异常。
    `pointer-events-none`：它是通知，不是拦路条，任何时候都不得吞掉点击。
  -->
  <div
    v-if="!online || recovered"
    data-testid="network-status-banner"
    class="pointer-events-none fixed inset-x-0 top-0 z-[3000] flex items-center justify-center gap-2 px-3 py-1 text-xs font-medium text-white shadow-sm"
    :class="online ? 'bg-[var(--el-color-success)]' : 'bg-[var(--el-color-danger)]'"
    role="status"
    aria-live="polite"
    :aria-label="t('networkBanner.ariaLabel')"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden="true" />
    <span>{{ online ? t('networkBanner.recovered') : t('networkBanner.offline') }}</span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const { t } = useI18n()
const { online, recovered } = useNetworkStatus()
</script>
