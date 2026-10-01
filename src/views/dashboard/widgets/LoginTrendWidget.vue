<template>
  <WidgetCard :title="t('dashboard.loginTrend')" icon="TrendCharts">
    <template #header-actions>
      <el-radio-group v-model="loginChartType" size="small">
        <el-radio-button value="success">{{ t('dashboard.buttonSuccess') }}</el-radio-button>
        <el-radio-button value="fail">{{ t('dashboard.buttonFail') }}</el-radio-button>
        <el-radio-button value="all">{{ t('dashboard.buttonAll') }}</el-radio-button>
      </el-radio-group>
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
    <el-empty v-if="error" class="chart-empty" :image-size="60" :description="t('dashboard.loginTrendLoadFail')" />
  </WidgetCard>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { readCssVar } from '@/composables/useChart'
import { useEchartsWidget } from '@/composables/useEchartsWidget'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import WidgetCard from '../WidgetCard.vue'

interface LoginTrendItem {
  date: string
  success: number
  fail: number
}

const { t } = useI18n()
const loginChartType = ref<'success' | 'fail' | 'all'>('all')

const { el, loading, error, empty, refresh, render, download } = useEchartsWidget<LoginTrendItem[]>({
  name: 'login',
  fetchData: async () => {
    const res = (await request({
      url: '/monitor/logininfor/stats',
      method: 'get',
      params: { days: 14 }
    })) as { data?: LoginTrendItem[] }
    return res.data || []
  },
  buildOption: (data) => {
    const dates = data.map((d) => d.date)
    const success = data.map((d) => d.success)
    const fail = data.map((d) => d.fail)
    const series: Array<{ name: string } & Record<string, unknown>> = []
    if (loginChartType.value === 'success' || loginChartType.value === 'all') {
      series.push({
        name: t('dashboard.buttonSuccess'),
        type: 'line',
        smooth: true,
        data: success,
        areaStyle: {},
        itemStyle: { color: readCssVar('--el-color-success', '#67c23a') }
      })
    }
    if (loginChartType.value === 'fail' || loginChartType.value === 'all') {
      series.push({
        name: t('dashboard.buttonFail'),
        type: 'line',
        smooth: true,
        data: fail,
        areaStyle: {},
        itemStyle: { color: readCssVar('--el-color-danger', '#f56c6c') }
      })
    }
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: series.map((s) => s.name as string), right: 10 },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: dates },
      yAxis: { type: 'value', minInterval: 1 },
      series
    }
  }
})

watch(loginChartType, () => render())
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
