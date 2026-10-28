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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { previewDataset, type DashboardChart } from '@/api/report'
import { buildChartOption, buildStatValue } from '../designer/chartOption'
import { useChart } from '@/composables/useChart'
import { createLatestGuard } from '@/composables/latestRequest'
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
/** 刷新守卫：属性面板 deep 快改时只让最后一次请求的结局生效（b119 单一实现） */
const guard = createLatestGuard()

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
  guard.invalidate()
  rows.value = []
  columns.value = []
  loaded.value = false
  lastSuccessAt.value = null
  loadedDatasetId = null
}

async function load() {
  // 换数据集：必须先丢旧值，否则新数据集失败时屏上是另一个数据集的结果
  if (loadedDatasetId !== null && loadedDatasetId !== props.chart.datasetId) resetSnapshot()
  const my = guard.begin()
  loading.value = true
  loadError.value = ''
  try {
    // 数据集执行走 preview 通道（LIMIT 100 硬顶 + Semaphore fail-closed，A2 铁律复用）
    const res = await previewDataset({ datasetId: props.chart.datasetId, params: {} })
    if (!guard.isCurrent(my)) return
    columns.value = res.data?.columns ?? []
    rows.value = res.data?.rows ?? []
    loaded.value = true
    loadedDatasetId = props.chart.datasetId
    lastSuccessAt.value = Date.now()
    await renderEcharts()
  } catch (e) {
    if (!guard.isCurrent(my)) return
    loadError.value = String(e)
    // 失败保留上一次的行/列 ⇒ 图表/表格/统计值继续展示旧结论（横幅说明时效）；
    // 只有从未成功过时才清空，避免把"取数失败"显示成一堆空行
    if (!loaded.value) {
      rows.value = []
      columns.value = []
    }
  } finally {
    if (guard.isCurrent(my)) loading.value = false
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

// 属性面板是按字段原地改的（不整体替换 chart 对象），所以监听必须落到**字段**上；
// 但不能再用一个 deep 监听全量重拉：此前改标题/栅格宽度（纯展示字段）也会重新执行
// 数据集查询，属性面板每敲一个字就发一次 preview 请求（b110）。
//
// 取数身份：只有"取哪份数据"变化才重新请求
watch(() => props.chart.datasetId, load)
// 展示身份：换图型/换字段只改变"怎么用已有行画"，本地重画即可，不打接口。
// nextTick 必须等：从 table/stat 切到 echarts 时容器在 v-else 分支，
// 本轮渲染前 chartRef 还是空的（renderEcharts 会静默 return，屏幕上什么都不画）。
watch(
  () => [props.chart.chartType, props.chart.xField, props.chart.yField, props.chart.nameField, props.chart.valueField],
  async () => {
    await nextTick()
    await renderEcharts()
  }
)
onMounted(load)
onBeforeUnmount(dispose)

defineExpose({ reload: load })
</script>

<script lang="ts">
import { onBeforeUnmount } from 'vue'
export default { name: 'ReportChartCard' }
</script>
