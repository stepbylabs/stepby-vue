<template>
  <el-card shadow="never" class="mb-3">
    <template #header>
      <div class="flex items-center justify-between font-medium">
        <span>{{ t('jobLog.stats.title') }}</span>
        <div class="flex items-center gap-2">
          <el-select v-model="days" size="small" class="w-[120px]" @change="load">
            <el-option :label="t('jobLog.stats.days7')" :value="7" />
            <el-option :label="t('jobLog.stats.days14')" :value="14" />
            <el-option :label="t('jobLog.stats.days30')" :value="30" />
          </el-select>
          <el-button size="small" icon="Refresh" circle :loading="loading" @click="load" />
          <el-button size="small" icon="ArrowUp" circle @click="collapsed = !collapsed" />
        </div>
      </div>
    </template>

    <template v-if="stats">
      <!-- 汇总指标卡 -->
      <el-row :gutter="12" class="mb-3">
        <el-col :xs="12" :sm="6">
          <div class="stat-card">
            <div class="stat-label">{{ t('jobLog.stats.total') }}</div>
            <div class="stat-value">{{ stats.total }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="stat-card">
            <div class="stat-label">{{ t('jobLog.stats.successRate') }}</div>
            <div
              class="stat-value"
              :class="stats.successRate >= 95 ? 'text-[var(--el-color-success)]' : 'text-[var(--el-color-danger)]'"
            >
              {{ stats.successRate }}%
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="stat-card">
            <div class="stat-label">{{ t('jobLog.stats.avgMs') }}</div>
            <div class="stat-value">{{ formatMs(stats.avgMs) }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="stat-card">
            <div class="stat-label">{{ t('jobLog.stats.maxMs') }}</div>
            <div class="stat-value">{{ formatMs(stats.maxMs) }}</div>
          </div>
        </el-col>
      </el-row>

      <el-alert
        v-if="stats.truncated"
        :title="t('jobLog.stats.truncated')"
        type="warning"
        :closable="false"
        class="mb-3"
      />

      <div v-show="!collapsed" class="flex flex-wrap gap-3">
        <!-- 成功率趋势 -->
        <div class="flex-1 min-w-[280px] h-[260px]">
          <div class="text-xs text-text-secondary mb-1">{{ t('jobLog.stats.trend') }}</div>
          <div ref="trendRef" class="h-[230px]" />
        </div>
        <!-- 失败 TOP -->
        <div class="flex-1 min-w-[240px] h-[260px]">
          <div class="text-xs text-text-secondary mb-1">{{ t('jobLog.stats.topFailures') }}</div>
          <el-empty
            v-if="stats.topFailures.length === 0"
            :description="t('jobLog.stats.noFailures')"
            :image-size="60"
            class="h-[230px]"
          />
          <el-table v-else :data="stats.topFailures" size="small" max-height="230">
            <el-table-column prop="jobName" :label="t('jobLog.stats.jobName')" show-overflow-tooltip />
            <el-table-column prop="failedCount" :label="t('jobLog.stats.failedCount')" width="110" align="center" />
          </el-table>
        </div>
      </div>
    </template>
    <SkeletonTable v-else :rows="2" :cols="2" />
  </el-card>
</template>

<script setup lang="ts" name="JobStatsPanel">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { getJobLogStats } from '@/api/monitor/jobLog'
import type { JobLogStats, JobStatsDaily } from '@/types'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import echarts, { type ECharts, type EChartsOption } from '@/utils/echarts'

const { t } = useI18n()
const loading = ref(false)
const collapsed = ref(false)
const days = ref(7)
const stats = ref<JobLogStats | null>(null)
const trendRef = useTemplateRef<HTMLDivElement>('trendRef')
let trendChart: ECharts | null = null

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

async function load() {
  loading.value = true
  try {
    const res = await getJobLogStats(days.value)
    stats.value = res.data ?? null
  } catch (e) {
    if (import.meta.env.DEV) console.error('[jobStats] load failed:', e)
  } finally {
    loading.value = false
  }
}

function renderTrend() {
  const el = trendRef.value
  if (!el || !stats.value) return
  trendChart ||= echarts.init(el)
  const daily: JobStatsDaily[] = stats.value.daily
  const option: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: [t('jobLog.stats.legend.exec'), t('jobLog.stats.legend.failed')] },
    grid: { left: 48, right: 16, top: 32, bottom: 48 },
    xAxis: { type: 'category', data: daily.map((d) => d.date.slice(5)) },
    yAxis: [
      { type: 'value', name: t('jobLog.stats.legend.exec') },
      { type: 'value', name: '%', max: 100, position: 'right' }
    ],
    series: [
      {
        name: t('jobLog.stats.legend.exec'),
        type: 'bar',
        data: daily.map((d) => d.total),
        itemStyle: { color: '#409EFF' }
      },
      {
        name: t('jobLog.stats.legend.failed'),
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: daily.map((d) => (d.total > 0 ? Math.round(((d.failed / d.total) * 100) * 10) / 10 : 0)),
        itemStyle: { color: '#F56C6C' }
      }
    ]
  }
  trendChart.setOption(option, true)
}

watchEffect(() => {
  if (stats.value && trendRef.value && !collapsed.value) renderTrend()
})

onMounted(load)

onBeforeUnmount(() => {
  trendChart?.dispose()
  trendChart = null
})

defineExpose({ load })
</script>

<style scoped>
.stat-card {
  padding: 10px 14px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
}
.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.stat-value {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
