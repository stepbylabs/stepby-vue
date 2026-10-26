<template>
  <div class="p-4" v-loading="loadingDashboards || loadingLayout">
    <!-- 工具栏：选择大屏 / 新建 / 保存 -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-select
        v-model="selectedId"
        :placeholder="t('rp.pickDashboard')"
        class="w-64"
        filterable
        :aria-label="t('rp.pickDashboard')"
      >
        <el-option v-for="d in dashboards" :key="d.dashboardId" :value="d.dashboardId" :label="d.dashboardName" />
      </el-select>
      <el-button v-hasPermi="['report:dashboard:edit']" icon="Plus" type="primary" plain @click="openCreate">
        {{ t('common.add') }}
      </el-button>
      <el-button
        v-hasPermi="['report:dashboard:remove']"
        icon="Delete"
        plain
        :disabled="!selectedId"
        :loading="removing"
        @click="handleRemove"
      >
        {{ t('common.delete') }}
      </el-button>
      <el-divider direction="vertical" />
      <!-- 添加图表 -->
      <el-select v-model="newChartType" class="w-32" :placeholder="t('rp.chartType')" :aria-label="t('rp.chartType')">
        <el-option v-for="ct in CHART_TYPES" :key="ct" :value="ct" :label="ct" />
      </el-select>
      <el-select
        v-model="newChartDataset"
        class="w-56"
        filterable
        :placeholder="t('rp.pickDataset')"
        :aria-label="t('rp.pickDataset')"
      >
        <el-option v-for="ds in datasets" :key="ds.datasetId" :value="ds.datasetId" :label="ds.datasetName" />
      </el-select>
      <el-button
        v-hasPermi="['report:dashboard:edit']"
        icon="CirclePlus"
        type="primary"
        :disabled="!newChartDataset"
        @click="handleAddChart"
      >
        {{ t('rp.addChart') }}
      </el-button>
      <el-button
        v-hasPermi="['report:dashboard:edit']"
        icon="Check"
        type="success"
        :loading="saving"
        :disabled="!selectedId"
        @click="handleSave"
      >
        {{ t('common.save') }}
      </el-button>
    </div>

    <el-alert
      v-if="dashboardsError"
      class="mb-2"
      type="error"
      :closable="false"
      show-icon
      :title="t('common.loadFailed')"
    >
      <el-button link type="primary" @click="loadDashboards()">{{ t('common.retry') }}</el-button>
    </el-alert>
    <el-alert
      v-if="datasetsError"
      class="mb-2"
      type="error"
      :closable="false"
      show-icon
      :title="t('common.loadFailed')"
    >
      <el-button link type="primary" @click="loadDatasets()">{{ t('common.retry') }}</el-button>
    </el-alert>
    <el-alert v-if="layoutError" class="mb-2" type="error" :closable="false" show-icon :title="t('common.loadFailed')">
      <el-button link type="primary" @click="selectedId && loadLayout(selectedId)">{{ t('common.retry') }}</el-button>
    </el-alert>

    <!-- 画布：栅格卡片（span 档位 + 上移/下移/删除 + 属性面板） -->
    <el-row :gutter="12">
      <el-col v-for="c in charts" :key="c.chartId" :span="c.span" class="mb-3">
        <ChartCard :chart="c">
          <template #tools>
            <template v-if="canEdit">
              <el-button
                link
                icon="ArrowUp"
                :aria-label="t('rp.moveUp')"
                @click="charts = moveChart(charts, c.chartId, -1)"
              />
              <el-button
                link
                icon="ArrowDown"
                :aria-label="t('rp.moveDown')"
                @click="charts = moveChart(charts, c.chartId, 1)"
              />
              <el-button
                link
                :icon="`FullScreen`"
                :title="`${t('rp.span')}=${c.span}`"
                :aria-label="`${t('rp.span')}=${c.span}`"
                @click="charts = cycleSpan(charts, c.chartId)"
              />
              <el-button link icon="Setting" :aria-label="t('rp.chartSetting')" @click="selectedChartId = c.chartId" />
              <el-button
                link
                type="danger"
                icon="Delete"
                :aria-label="t('common.delete')"
                @click="charts = removeChart(charts, c.chartId)"
              />
            </template>
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
    <el-dialog
      v-model="createOpen"
      :title="t('rp.newDashboard')"
      width="min(90%, 420px)"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
    >
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
import { checkPermi } from '@/utils/permission'
import { confirmAction } from '@/utils/confirm'
import modal from '@/plugins/modal'

const { t } = useI18n()

/** 写面按能力拆键：编辑（新增/保存/布局）与删除是两个独立授权。 */
const canEdit = computed(() => checkPermi(['report:dashboard:edit']))
const canRemove = computed(() => checkPermi(['report:dashboard:remove']))

const dashboards = ref<ReportDashboard[]>([])
const datasets = ref<{ datasetId: number; datasetName: string }[]>([])
const selectedId = ref<number>()
const charts = ref<DashboardChart[]>([])
const selectedChartId = ref<string>()
const saving = ref(false)
const removing = ref(false)
const createOpen = ref(false)
const creating = ref(false)
const newChartType = ref<ChartType>('bar')
const newChartDataset = ref<number>()
const loadingDashboards = ref(false)
const loadingDatasets = ref(false)
const loadingLayout = ref(false)
const dashboardsError = ref(false)
const datasetsError = ref(false)
const layoutError = ref(false)
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

async function loadDashboards(): Promise<boolean> {
  loadingDashboards.value = true
  try {
    const res = await listDashboard()
    dashboards.value = res.rows ?? []
    if (selectedId.value && !dashboards.value.some((d: ReportDashboard) => d.dashboardId === selectedId.value)) {
      selectedId.value = undefined
    }
    dashboardsError.value = false
    return true
  } catch {
    // 保留旧列表；错误条由模板常驻显示，空列表时也能看到重试入口
    dashboardsError.value = true
    return false
  } finally {
    loadingDashboards.value = false
  }
}

async function loadDatasets(): Promise<boolean> {
  loadingDatasets.value = true
  try {
    const ds = await listDataset({ pageNum: 1, pageSize: 200 })
    datasets.value = (ds.rows ?? []).map((d) => ({
      datasetId: d.datasetId,
      datasetName: d.datasetName
    }))
    datasetsError.value = false
    return true
  } catch {
    datasetsError.value = true
    return false
  } finally {
    loadingDatasets.value = false
  }
}

async function loadLayout(id: number): Promise<boolean> {
  loadingLayout.value = true
  try {
    const res = await getDashboard(id)
    // 快速切换大屏时，先发的请求可能后到：过期响应不得覆盖当前画布
    if (selectedId.value !== id) return false
    charts.value = parseLayout(res.data?.layoutJson).charts
    layoutError.value = false
    await loadEditingColumns()
    return true
  } catch {
    // 失败时清空画布：保留上一屏的卡片会让用户以为当前看板已加载成功
    if (selectedId.value === id) {
      charts.value = []
      layoutError.value = true
    }
    return false
  } finally {
    loadingLayout.value = false
  }
}

async function loadEditingColumns(): Promise<void> {
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
    if (import.meta.env.DEV) console.warn('[report/designer] 加载图表列失败')
  }
}

watch(selectedId, (id: number | undefined) => {
  if (id) {
    void loadLayout(id)
  } else {
    charts.value = []
    layoutError.value = false
  }
})
watch(editing, () => void loadEditingColumns())
watch(canEdit, (v: boolean) => {
  if (!v) selectedChartId.value = undefined
})

function openCreate() {
  if (!canEdit.value) return
  createForm.value = {
    dashboardCode: `board_${Date.now()}`,
    dashboardName: t('rp.newDashboardDefaultName')
  }
  createOpen.value = true
}

async function handleCreate() {
  if (!canEdit.value) return
  if (!createForm.value.dashboardCode || !createForm.value.dashboardName) {
    modal.msgWarning(t('rp.codeNameRequired'))
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
    modal.msgSuccess(t('common.operationSuccess'))
  } catch (e) {
    // 失败不关对话框、不弹成功；接口错误由拦截器提示
    if (import.meta.env.DEV) console.error('[report/designer] 新建大屏失败:', e)
  } finally {
    creating.value = false
  }
}

async function handleRemove() {
  if (!canRemove.value || !selectedId.value) return
  if (!(await confirmAction(t('rp.removeDashboardConfirm')))) return
  removing.value = true
  try {
    await removeDashboard(String(selectedId.value))
    selectedId.value = undefined
    charts.value = []
    await loadDashboards()
    modal.msgSuccess(t('common.operationSuccess'))
  } catch (e) {
    if (import.meta.env.DEV) console.error('[report/designer] 删除大屏失败:', e)
  } finally {
    removing.value = false
  }
}

function handleAddChart() {
  if (!canEdit.value || !newChartDataset.value) return
  charts.value = appendChart(charts.value, {
    chartType: newChartType.value,
    datasetId: newChartDataset.value,
    title: t('rp.newChartDefaultName'),
    span: 12
  })
  selectedChartId.value = charts.value[charts.value.length - 1].chartId
}

async function handleSave() {
  if (!canEdit.value || !selectedId.value) return
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
    modal.msgSuccess(t('common.operationSuccess'))
  } catch (e) {
    if (import.meta.env.DEV) console.error('[report/designer] 保存大屏失败:', e)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadDatasets(), loadDashboards()])
})
</script>
