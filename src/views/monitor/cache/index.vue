<template>
  <div class="app-container">
    <!-- Tab 切换：概览 / 键管理 -->
    <el-tabs v-model="activeTab" class="cache-tabs">
      <el-tab-pane :label="t('cache.title')" name="overview">
        <CacheOverview />
      </el-tab-pane>

      <el-tab-pane :label="t('cache.list.title')" name="keys">
        <CacheKeys :active="activeTab === 'keys'" />
      </el-tab-pane>

      <el-tab-pane :label="t('cache.hot.title')" name="stats">
        <CacheStats :active="activeTab === 'stats'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts" name="Cache">
// 三个 Tab（概览/键管理/统计热Key）各自独立加载与维护状态：
// 见 CacheOverview.vue / CacheKeys.vue / CacheStats.vue
// 注意：本项目无 unplugin-vue-components 自动注册，views 内子组件必须显式 import
import CacheOverview from './CacheOverview.vue'
import CacheKeys from './CacheKeys.vue'
import CacheStats from './CacheStats.vue'
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'

const { t } = useI18n()

// ====== Tab 切换 ======
const activeTab = ref<'overview' | 'keys' | 'stats'>('overview')
</script>

<style scoped lang="scss">
.cache-tabs {
  :deep(.el-tabs__content) {
    padding-top: 10px;
    transition: opacity 0.2s ease;
  }
}
</style>
