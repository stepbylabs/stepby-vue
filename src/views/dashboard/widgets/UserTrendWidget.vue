<template>
  <WidgetCard :title="t('dashboard.userCreateTrend')" icon="Histogram">
    <template #header-actions>
      <el-tooltip :content="t('common.downloadChart')" placement="top">
        <el-button link type="primary" :aria-label="t('common.downloadChart')" @click="download">
          <el-icon><Download /></el-icon>
        </el-button>
      </el-tooltip>
    </template>

    <div
      v-show="!empty && !error"
      v-loading="loading"
      :element-loading-text="t('common.loading')"
      ref="el"
      class="chart-box w-full h-[280px]"
    ></div>
    <el-empty
      v-if="!loading && !error && empty"
      class="chart-empty"
      :image-size="60"
      :description="t('common.noData')"
    />
    <el-empty v-if="error" class="chart-empty" :image-size="60" :description="t('dashboard.userTrendLoadFail')" />
  </WidgetCard>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Download } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { readCssVar } from '@/composables/useChart'
import { useEchartsWidget } from '@/composables/useEchartsWidget'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import WidgetCard from '../WidgetCard.vue'

interface UserStats {
  newUsersThisWeek?: number
  createTrend?: Array<{ date: string; count: number }>
}

const { t } = useI18n()

const { el, loading, error, empty, refresh, download } = useEchartsWidget<UserStats>({
  name: 'userTrend',
  fetchData: async () =>
    ((await request({ url: '/dashboard/user-stats', method: 'get' })) as { data?: UserStats }).data || {},
  hasData: (d) => (d.createTrend || []).length > 0,
  buildOption: (d) => {
    const trend = d.createTrend || []
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: trend.map((x) => x.date), axisLabel: { rotate: 30 } },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: t('common.add'),
          type: 'bar',
          data: trend.map((x) => x.count),
          itemStyle: { color: readCssVar('--el-color-primary', '#409eff') }
        }
      ]
    }
  }
})

useAutoRefresh(refresh)
</script>

<style lang="scss" scoped>
.chart-empty {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
