<template>
  <el-card shadow="never" class="chart-card">
    <template #header>
      <div class="flex items-center justify-between">
        <span class="font-medium">{{ chart.title || chart.chartType }}</span>
        <slot name="tools" />
      </div>
    </template>

    <!-- stat：大数字自渲染 -->
    <div v-if="chart.chartType === 'stat'" class="flex items-center justify-center py-8">
      <span class="text-4xl font-semibold text-[var(--el-color-primary)]">
        {{ statValue ?? '—' }}
      </span>
    </div>

    <!-- table：自渲染表格 -->
    <el-table
      v-else-if="chart.chartType === 'table'"
      :data="rows"
      size="small"
      max-height="320"
    >
      <el-table-column
        v-for="col in columns"
        :key="col"
        :prop="col"
        :label="col"
        show-overflow-tooltip
      />
    </el-table>

    <!-- echarts 四种 -->
    <div v-else ref="chartRef" class="h-[300px] w-full" />

    <!-- 空态：缺字段绑定 / 无数据 -->
    <div
      v-if="!loading && !hasRenderable"
      class="flex items-center justify-center py-10 text-sm text-[var(--el-text-color-secondary)]"
    >
      {{ t('rp.chartEmptyHint') }}
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { previewDataset, type DashboardChart } from '@/api/report'
import { buildChartOption, buildStatValue } from '../designer/chartOption'
import { useChart } from '@/composables/useChart'

const props = defineProps<{ chart: DashboardChart }>()
const { t } = useI18n()

const rows = ref<Record<string, unknown>[]>([])
const columns = ref<string[]>([])
const loading = ref(true)
const loadError = ref('')
const chartRef = ref<HTMLElement>()
const { getChart, resize, dispose } = useChart()

const statValue = computed(() => buildStatValue(props.chart, rows.value))
/** echarts 类图表且有可用 option 才算可渲染 */
const hasRenderable = computed(() => {
  if (props.chart.chartType === 'stat') return statValue.value !== null
  if (props.chart.chartType === 'table') return rows.value.length > 0
  return buildChartOption(props.chart, rows.value) !== null
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    // 数据集执行走 preview 通道（LIMIT 100 硬顶 + Semaphore fail-closed，A2 铁律复用）
    const res = await previewDataset({ datasetId: props.chart.datasetId, params: {} })
    columns.value = res.data?.columns ?? []
    rows.value = res.data?.rows ?? []
    await renderEcharts()
  } catch (e) {
    loadError.value = String(e)
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function renderEcharts() {
  const option = buildChartOption(props.chart, rows.value)
  if (!option || !chartRef.value) return
  const inst = await getChart(chartRef.value)
  if (!inst) return // 容器未就绪等场景：下次 watch 触发重渲染
  inst.setOption(option, true)
  resize()
}

watch(() => props.chart, load, { deep: true, immediate: false })
onMounted(load)
onBeforeUnmount(dispose)

defineExpose({ reload: load })
</script>

<script lang="ts">
import { onBeforeUnmount } from 'vue'
export default { name: 'ReportChartCard' }
</script>
