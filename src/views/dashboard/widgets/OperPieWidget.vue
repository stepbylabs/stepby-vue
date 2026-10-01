<template>
  <WidgetCard :title="t('dashboard.operTypeDist')" icon="PieChart">
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
    <el-empty v-if="error" class="chart-empty" :image-size="60" :description="t('dashboard.operDistLoadFail')" />
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

interface TypeCount {
  insert: number
  update: number
  delete: number
  other: number
}

const { t } = useI18n()

const { el, loading, error, empty, refresh, download } = useEchartsWidget<TypeCount>({
  name: 'oper',
  fetchData: async () =>
    ((await request({ url: '/monitor/operlog/stats-by-type', method: 'get' })) as { data?: TypeCount }).data || {
      insert: 0,
      update: 0,
      delete: 0,
      other: 0
    },
  hasData: (d) => Object.values(d).some((v) => v > 0),
  buildOption: (d) => {
    const keyMap: Record<string, string> = {
      insert: t('common.add'),
      update: t('common.edit'),
      delete: t('common.delete'),
      other: t('common.other')
    }
    const data = Object.entries(d)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: keyMap[name] || name, value }))
    return {
      tooltip: { trigger: 'item', formatter: '{a}<br/>{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left' },
      series: [
        {
          name: t('dashboard.operTypeDist'),
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          label: { show: true, formatter: '{b}: {c}' },
          data,
          color: [
            readCssVar('--el-color-primary', '#409eff'),
            readCssVar('--el-color-warning', '#e6a23c'),
            readCssVar('--el-color-danger', '#f56c6c'),
            readCssVar('--el-color-info', '#909399')
          ]
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
