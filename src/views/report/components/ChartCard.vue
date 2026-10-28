<template>
  <el-card shadow="never" class="chart-card">
    <template #header>
      <div class="flex items-center justify-between">
        <span class="font-medium">{{ chart.title || chart.chartType }}</span>
        <slot name="tools" />
      </div>
    </template>

    <!-- 成功过再失败：旧值继续展示，横幅写明"几点的数据"（b109） -->
    <el-alert v-if="loadError && loaded" class="mb-2" type="warning" :closable="false" show-icon :title="staleHint">
      <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
    </el-alert>

    <!-- stat：大数字自渲染 -->
    <div v-if="chart.chartType === 'stat'" class="flex items-center justify-center py-8">
      <span class="text-4xl font-semibold text-[var(--el-color-primary)]">
        {{ statValue ?? '—' }}
      </span>
    </div>

    <!-- table：自渲染表格 -->
    <el-table v-else-if="chart.chartType === 'table'" :data="rows" size="small" max-height="320">
      <el-table-column v-for="col in columns" :key="col" :prop="col" :label="col" show-overflow-tooltip />
    </el-table>

    <!-- echarts 四种 -->
    <div v-else ref="chartRef" class="h-[300px] w-full" />

    <!-- 从未成功过就失败：失败态 + 重试（不得伪装成"没有数据"） -->
    <div
      v-if="!loading && loadError && !loaded"
      class="flex flex-col items-center justify-center gap-2 py-10 text-sm text-[var(--el-text-color-secondary)]"
    >
      <span>{{ t('rp.chartLoadFail') }}</span>
      <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
    </div>

    <!-- 空态：缺字段绑定 / 无数据 -->
    <div
      v-if="!loading && !loadError && !hasRenderable"
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
import { formatClockTime } from '@/utils'

const props = defineProps<{ chart: DashboardChart }>()
const { t } = useI18n()

const rows = ref<Record<string, unknown>[]>([])
const columns = ref<string[]>([])
const loading = ref(true)
const loadError = ref('')
/** 是否至少成功取过一次数（决定失败时"留旧值"还是"显示失败态"） */
const loaded = ref(false)
const lastSuccessAt = ref<number | null>(null)
const chartRef = ref<HTMLElement>()
const { getChart, resize, dispose } = useChart()
/** 当前屏上数据来自哪个数据集（换数据集 = 换了问题，旧值不得冒充新结果） */
let loadedDatasetId: number | null = null
/** 刷新序号：属性面板 deep 快改时只让最后一次请求的结局生效 */
let seq = 0

const statValue = computed(() => buildStatValue(props.chart, rows.value))
const staleHint = computed(() => t('common.staleDataHintAt', { time: formatClockTime(lastSuccessAt.value) }))
/** echarts 类图表且有可用 option 才算可渲染 */
const hasRenderable = computed(() => {
  if (props.chart.chartType === 'stat') return statValue.value !== null
  if (props.chart.chartType === 'table') return rows.value.length > 0
  return buildChartOption(props.chart, rows.value) !== null
})

/** 丢快照（换数据集时调用；序号前移让在飞的旧请求作废） */
function resetSnapshot(): void {
  seq++
  rows.value = []
  columns.value = []
  loaded.value = false
  lastSuccessAt.value = null
  loadedDatasetId = null
}

async function load() {
  // 换数据集：必须先丢旧值，否则新数据集失败时屏上是另一个数据集的结果
  if (loadedDatasetId !== null && loadedDatasetId !== props.chart.datasetId) resetSnapshot()
  const my = ++seq
  loading.value = true
  loadError.value = ''
  try {
    // 数据集执行走 preview 通道（LIMIT 100 硬顶 + Semaphore fail-closed，A2 铁律复用）
    const res = await previewDataset({ datasetId: props.chart.datasetId, params: {} })
    if (my !== seq) return
    columns.value = res.data?.columns ?? []
    rows.value = res.data?.rows ?? []
    loaded.value = true
    loadedDatasetId = props.chart.datasetId
    lastSuccessAt.value = Date.now()
    await renderEcharts()
  } catch (e) {
    if (my !== seq) return
    loadError.value = String(e)
    // 失败保留上一次的行/列 ⇒ 图表/表格/统计值继续展示旧结论（横幅说明时效）；
    // 只有从未成功过时才清空，避免把"取数失败"显示成一堆空行
    if (!loaded.value) {
      rows.value = []
      columns.value = []
    }
  } finally {
    if (my === seq) loading.value = false
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

// deep 必须保留：上游 report/designer 属性面板通过 v-model 原地修改 chart 对象的字段
// （editing.title/span/xField 等，非整体替换），浅监听 props.chart 引用不会触发；
// report/view 则整卡 :key 重建，走 onMounted。无法收敛为单一变化源，故保持 deep。
watch(() => props.chart, load, { deep: true, immediate: false })
onMounted(load)
onBeforeUnmount(dispose)

defineExpose({ reload: load })
</script>

<script lang="ts">
import { onBeforeUnmount } from 'vue'
export default { name: 'ReportChartCard' }
</script>
