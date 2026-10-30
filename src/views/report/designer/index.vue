<template>
  <div class="p-4" v-loading="loadingDashboards || loadingLayout">
    <!-- 工具栏：选择大屏 / 新建 / 保存 -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-select
        :key="`dash-${selectEpoch}`"
        :model-value="selectedId"
        :placeholder="t('rp.pickDashboard')"
        class="w-64"
        filterable
        :aria-label="t('rp.pickDashboard')"
        @change="requestSelect"
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
    <el-alert
      v-if="datasetsTruncated"
      class="mb-2"
      type="warning"
      :closable="false"
      show-icon
      :title="t('common.optionsTruncated', { count: datasets.length, total: datasetsTotal })"
      data-test="datasets-truncated"
    />
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
      :before-close="beforeClose"
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
        <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
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
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { fetchAllPages } from '@/utils/paging'
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
const datasetsTotal = ref(0)
const datasetsTruncated = ref(false)
const layoutError = ref(false)
/** 选中卡片编辑副本（属性面板直接改副本，确认即生效——简化交互：改即生效） */
const editing = computed<DashboardChart | undefined>(() =>
  charts.value.find((c: DashboardChart) => c.chartId === selectedChartId.value)
)
/** 属性面板列下拉：从该卡片数据集试跑取列（缓存） */
const editingColumns = ref<string[]>([])
const createForm = ref({ dashboardCode: '', dashboardName: '' })

// b113：未保存改动保护。设计器是"改即生效"的内存态——加卡片/排序/改字段/调宽度都不落库，
// 只有点保存才写。改造前切大屏、切模式、离开页面三条路径都静默丢改动。
const selectEpoch = ref(0)
const savedSnapshot = ref('')

function snapshotOf(id: number | undefined, list: DashboardChart[]): string {
  return JSON.stringify({ dashboardId: id ?? null, charts: list })
}

/** 与"最近一次落库/加载"的快照比对；只有编辑权限下的已选大屏才可能脏 */
const isDirty = computed(
  () => canEdit.value && !!selectedId.value && savedSnapshot.value !== snapshotOf(selectedId.value, charts.value)
)

useUnsavedChangesGuard(
  () => isDirty.value,
  () => t('rp.unsavedLeaveConfirm')
)

// 暴露成函数而不是 ComputedRef：外层（运行/设计模式切换）要在卸载前问一句"有没有未保存改动"，
// 函数签名让调用点拿到的是**当下布尔值**（ref 在模板 ref 上被自动解包，类型却仍是 ComputedRef）
defineExpose({ hasUnsavedChanges: (): boolean => isDirty.value })

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
    // b134：后端把 pageSize 钳到 100；按 total 拉齐全集，超硬上限则如实标记截断
    const ds = await fetchAllPages((pageNum, pageSize) => listDataset({ pageNum, pageSize }))
    datasets.value = ds.rows.map((d) => ({
      datasetId: d.datasetId,
      datasetName: d.datasetName
    }))
    datasetsTotal.value = ds.total
    datasetsTruncated.value = ds.truncated
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
    savedSnapshot.value = snapshotOf(id, charts.value)
    layoutError.value = false
    await loadEditingColumns()
    return true
  } catch {
    // 失败时清空画布：保留上一屏的卡片会让用户以为当前看板已加载成功
    if (selectedId.value === id) {
      charts.value = []
      // 屏上已无内容 ⇒ 与"库里有什么"的差异不是用户改动，不得在切走时弹"未保存"（假警报）
      savedSnapshot.value = snapshotOf(id, charts.value)
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
    savedSnapshot.value = ''
  }
})

/**
 * 切换大屏（受控 + 确认）：脏了先问，取消则把下拉复位到当前大屏。
 * 这里刻意不用 `v-model`——它会在确认框还开着的时候就把 selectedId 换掉，
 * watcher 随即加载另一块看板，用户的未保存改动在"还没回答"时就已经没了。
 */
async function requestSelect(id?: number): Promise<void> {
  if (id === selectedId.value) return
  if (id == null) {
    selectEpoch.value++ // 受控下拉复位（无清除按钮，防御性分支）
    return
  }
  if (isDirty.value && !(await confirmAction(t('rp.unsavedSwitchConfirm')))) {
    selectEpoch.value++ // 重建下拉让其显示值回到 selectedId
    return
  }
  selectedId.value = id
}
watch(editing, () => void loadEditingColumns())
watch(canEdit, (v: boolean) => {
  if (!v) selectedChartId.value = undefined
})

/** 关闭语义（b135）：填一半按 Esc / 点遮罩原先会静默丢弃 */
const { beforeClose, cancel } = useDialogDirtyGuard(createOpen, createForm)

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
  // 新建后会切到新大屏：脏了必须先问，否则当前画布的未保存改动被静默丢弃
  if (isDirty.value && !(await confirmAction(t('rp.unsavedSwitchConfirm')))) return
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
    savedSnapshot.value = ''
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
  // 快照必须在**发请求前**取：await 期间用户仍可继续改，成功后再取会把没发出去的改动记成"已保存"
  const sentSnapshot = snapshotOf(selectedId.value, charts.value)
  try {
    await saveDashboard({
      dashboardId: current.dashboardId,
      dashboardCode: current.dashboardCode,
      dashboardName: current.dashboardName,
      layoutJson: { schemaVersion: 2, charts: charts.value },
      status: current.status ?? '0'
    })
    // 落库成功才把快照推平：失败时仍算脏（否则用户以为已保存，离开时不再提示）
    savedSnapshot.value = sentSnapshot
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
