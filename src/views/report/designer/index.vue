<template>
  <div class="p-4">
    <!-- 工具栏：选择大屏 / 新建 / 保存 -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-select
        v-model="selectedId"
        :placeholder="t('rp.pickDashboard')"
        class="w-64"
        filterable
      >
        <el-option
          v-for="d in dashboards"
          :key="d.dashboardId"
          :value="d.dashboardId"
          :label="d.dashboardName"
        />
      </el-select>
      <el-button v-hasPermi="['report:dashboard:view']" icon="Plus" type="primary" plain @click="openCreate">
        {{ t('common.add') }}
      </el-button>
      <el-button v-hasPermi="['report:dashboard:view']" icon="Delete" plain :disabled="!selectedId" @click="handleRemove">
        {{ t('common.delete') }}
      </el-button>
      <el-divider direction="vertical" />
      <!-- 添加图表 -->
      <el-select
        v-model="newChartType"
        class="w-32"
        :placeholder="t('rp.chartType')"
      >
        <el-option v-for="ct in CHART_TYPES" :key="ct" :value="ct" :label="ct" />
      </el-select>
      <el-select
        v-model="newChartDataset"
        class="w-56"
        filterable
        :placeholder="t('rp.pickDataset')"
      >
        <el-option
          v-for="ds in datasets"
          :key="ds.datasetId"
          :value="ds.datasetId"
          :label="ds.datasetName"
        />
      </el-select>
      <el-button
        v-hasPermi="['report:dashboard:view']"
        icon="CirclePlus"
        type="primary"
        :disabled="!newChartDataset"
        @click="handleAddChart"
      >
        {{ t('rp.addChart') }}
      </el-button>
      <el-button
        v-hasPermi="['report:dashboard:view']"
        icon="Check"
        type="success"
        :loading="saving"
        :disabled="!selectedId"
        @click="handleSave"
      >
        {{ t('common.save') }}
      </el-button>
    </div>

    <!-- 画布：栅格卡片（span 档位 + 上移/下移/删除 + 属性面板） -->
    <el-row :gutter="12">
      <el-col v-for="c in charts" :key="c.chartId" :span="c.span" class="mb-3">
        <ChartCard :chart="c">
          <template #tools>
            <el-button link icon="ArrowUp" @click="charts = moveChart(charts, c.chartId, -1)" />
            <el-button link icon="ArrowDown" @click="charts = moveChart(charts, c.chartId, 1)" />
            <el-button
              link
              :icon="`FullScreen`"
              :title="`${t('rp.span')}=${c.span}`"
              @click="charts = cycleSpan(charts, c.chartId)"
            />
            <el-button link icon="Setting" @click="selectedChartId = c.chartId" />
            <el-button link type="danger" icon="Delete" @click="charts = removeChart(charts, c.chartId)" />
          </template>
        </ChartCard>
      </el-col>
    </el-row>
    <el-empty v-if="charts.length === 0" :description="t('rp.canvasEmpty')" />

    <!-- 属性面板（选中卡片） -->
    <el-drawer v-model="propOpen" :title="t('rp.chartProps')" size="360px">
      <el-form v-if="editing" label-width="90px" size="small">
        <el-form-item :label="t('rp.chartTitle')">
          <el-input v-model="editing.title" maxlength="64" />
        </el-form-item>
        <el-form-item :label="t('rp.span')">
          <el-select v-model="editing.span">
            <el-option v-for="s in CHART_SPAN_STEPS" :key="s" :value="s" :label="`${s}/24`" />
          </el-select>
        </el-form-item>
        <template v-if="['bar', 'line'].includes(editing.chartType)">
          <el-form-item label="X">
            <el-select v-model="editing.xField" clearable filterable>
              <el-option v-for="col in editingColumns" :key="col" :value="col" :label="col" />
            </el-select>
          </el-form-item>
          <el-form-item label="Y">
            <el-select v-model="editing.yField" clearable filterable>
              <el-option v-for="col in editingColumns" :key="col" :value="col" :label="col" />
            </el-select>
          </el-form-item>
        </template>
        <template v-else-if="editing.chartType === 'pie'">
          <el-form-item :label="t('rp.nameField')">
            <el-select v-model="editing.nameField" clearable filterable>
              <el-option v-for="col in editingColumns" :key="col" :value="col" :label="col" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('rp.valueField')">
            <el-select v-model="editing.valueField" clearable filterable>
              <el-option v-for="col in editingColumns" :key="col" :value="col" :label="col" />
            </el-select>
          </el-form-item>
        </template>
        <template v-else-if="['gauge', 'stat'].includes(editing.chartType)">
          <el-form-item :label="t('rp.valueField')">
            <el-select v-model="editing.valueField" clearable filterable>
              <el-option v-for="col in editingColumns" :key="col" :value="col" :label="col" />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
    </el-drawer>

    <!-- 新建大屏 -->
    <el-dialog v-model="createOpen" :title="t('rp.newDashboard')" width="420px">
      <el-form label-width="90px">
        <el-form-item :label="t('rp.dashboardCode')" required>
          <el-input v-model="createForm.dashboardCode" maxlength="64" />
        </el-form-item>
        <el-form-item :label="t('rp.dashboardName')" required>
          <el-input v-model="createForm.dashboardName" maxlength="128" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getDashboard,
  listDashboard,
  listDataset,
  removeDashboard,
  saveDashboard,
  type ChartType,
  type DashboardChart,
  type ReportDashboard
} from '@/api/report'
import {
  appendChart,
  cycleSpan,
  moveChart,
  parseLayout,
  removeChart,
  CHART_SPAN_STEPS,
  CHART_TYPES
} from './canvasLayout'
import ChartCard from '../components/ChartCard.vue'

const { t } = useI18n()

const dashboards = ref<ReportDashboard[]>([])
const datasets = ref<{ datasetId: number; datasetName: string }[]>([])
const selectedId = ref<number>()
const charts = ref<DashboardChart[]>([])
const selectedChartId = ref<string>()
const saving = ref(false)
const createOpen = ref(false)
const creating = ref(false)
const newChartType = ref<ChartType>('bar')
const newChartDataset = ref<number>()
/** 选中卡片编辑副本（属性面板直接改副本，确认即生效——简化交互：改即生效） */
const editing = computed<DashboardChart | undefined>(() =>
  charts.value.find((c: DashboardChart) => c.chartId === selectedChartId.value)
)
/** 属性面板列下拉：从该卡片数据集试跑取列（缓存） */
const editingColumns = ref<string[]>([])
const createForm = ref({ dashboardCode: '', dashboardName: '' })

const propOpen = computed({
  get: () => !!editing.value,
  set: (v: boolean) => {
    if (!v) selectedChartId.value = undefined
  }
})

async function loadDashboards() {
  const res = await listDashboard()
  dashboards.value = res.rows ?? []
  if (selectedId.value && !dashboards.value.some((d: ReportDashboard) => d.dashboardId === selectedId.value)) {
    selectedId.value = undefined
  }
}

async function loadLayout(id: number) {
  const res = await getDashboard(id)
  charts.value = parseLayout(res.data?.layoutJson).charts
  await loadEditingColumns()
}

async function loadEditingColumns() {
  if (!editing.value) {
    editingColumns.value = []
    return
  }
  try {
    const res = await import('@/api/report').then((m) =>
      m.previewDataset({ datasetId: editing.value!.datasetId, params: {} })
    )
    editingColumns.value = res.data?.columns ?? []
  } catch {
    editingColumns.value = []
  }
}

watch(selectedId, (id: number | undefined) => {
  if (id) loadLayout(id)
  else charts.value = []
})
watch(editing, () => loadEditingColumns())

function openCreate() {
  createForm.value = {
    dashboardCode: `board_${Date.now()}`,
    dashboardName: t('rp.newDashboardDefaultName')
  }
  createOpen.value = true
}

async function handleCreate() {
  if (!createForm.value.dashboardCode || !createForm.value.dashboardName) {
    ElMessage.warning(t('rp.codeNameRequired'))
    return
  }
  creating.value = true
  try {
    const res = await saveDashboard({
      dashboardCode: createForm.value.dashboardCode,
      dashboardName: createForm.value.dashboardName,
      layoutJson: { schemaVersion: 2, charts: [] },
      status: '0'
    })
    createOpen.value = false
    await loadDashboards()
    selectedId.value = res.data?.dashboardId
    ElMessage.success(t('common.operationSuccess'))
  } finally {
    creating.value = false
  }
}

async function handleRemove() {
  if (!selectedId.value) return
  await ElMessageBox.confirm(t('rp.removeDashboardConfirm'), t('common.warning'), {
    type: 'warning'
  })
  await removeDashboard(String(selectedId.value))
  selectedId.value = undefined
  charts.value = []
  await loadDashboards()
  ElMessage.success(t('common.operationSuccess'))
}

function handleAddChart() {
  if (!newChartDataset.value) return
  charts.value = appendChart(charts.value, {
    chartType: newChartType.value,
    datasetId: newChartDataset.value,
    title: t('rp.newChartDefaultName'),
    span: 12
  })
  selectedChartId.value = charts.value[charts.value.length - 1].chartId
}

async function handleSave() {
  if (!selectedId.value) return
  const current = dashboards.value.find((d: ReportDashboard) => d.dashboardId === selectedId.value)
  if (!current) return
  saving.value = true
  try {
    await saveDashboard({
      dashboardId: current.dashboardId,
      dashboardCode: current.dashboardCode,
      dashboardName: current.dashboardName,
      layoutJson: { schemaVersion: 2, charts: charts.value },
      status: current.status ?? '0'
    })
    ElMessage.success(t('common.operationSuccess'))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const ds = await listDataset({ pageNum: 1, pageSize: 200 })
  datasets.value = (ds.rows ?? []).map((d) => ({
    datasetId: d.datasetId,
    datasetName: d.datasetName
  }))
  await loadDashboards()
})
</script>
