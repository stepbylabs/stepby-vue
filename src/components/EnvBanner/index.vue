<template>
  <!-- 环境标识横幅：仅非生产环境渲染（生产构建 VITE_APP_ENV === 'production' 时整块不输出） -->
  <div v-if="visible" class="env-banner" role="status" :aria-label="t('envBanner.ariaLabel')">
    <el-tag :type="tagType" size="small" effect="dark" class="env-tag">{{ envLabel }}</el-tag>
    <span class="env-text">{{ t('envBanner.tip') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 环境名取自 .env* 的 VITE_APP_ENV（development/staging/production/embedded 等），
// 兜底到构建 MODE，两者都缺省时视为未知环境同样展示，避免误报为生产
const envName = String(import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'unknown').trim()

const visible = computed(() => envName !== 'production')

/** 环境名缩写映射（未命中时回退为大写原文） */
const envLabel = computed(() => {
  const map: Record<string, string> = {
    development: 'DEV',
    staging: 'TEST',
    embedded: 'EMBEDDED',
    analyze: 'ANALYZE'
  }
  return map[envName] ?? envName.toUpperCase()
})

const tagType = computed<'danger' | 'warning' | 'info'>(() => {
  if (envName === 'staging') return 'warning'
  if (envName === 'embedded') return 'info'
  return 'danger'
})
</script>

<style lang="scss" scoped>
/* 跟随暗色模式：warning 系 CSS 变量在 EP dark 主题下自动切换 */
.env-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2px 12px;
  font-size: 12px;
  line-height: 20px;
  background: var(--el-color-warning-light-9);
  border-bottom: 1px solid var(--el-color-warning-light-7);
  color: var(--el-text-color-regular);

  .env-tag {
    flex-shrink: 0;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .env-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
