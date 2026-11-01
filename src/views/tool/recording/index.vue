<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form ref="queryRef" :model="queryParams" :inline="true" v-show="showSearch">
        <el-form-item :label="t('recording.searchName')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('recording.phName')"
            clearable
            class="w-[200px]"
            :aria-label="t('recording.phName')"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('recording.status')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('recording.phStatus')"
            clearable
            class="w-[160px]"
            :aria-label="t('recording.status')"
          >
            <el-option :label="t('recording.statusDraft')" value="draft" />
            <el-option :label="t('recording.statusReady')" value="ready" />
            <el-option :label="t('recording.statusArchived')" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['tool:recording:add']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete()"
          v-hasPermi="['tool:recording:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" />
    </el-row>

    <el-table v-loading="loading" :data="dataList" @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="50" align="center" />
      <el-table-column :label="t('recording.name')" prop="name" :show-overflow-tooltip="true" min-width="180" />
      <el-table-column :label="t('recording.stepCount')" prop="stepCount" width="90" align="center">
        <template #default="scope">
          <el-tag type="info" size="small">{{ scope.row.stepCount }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('recording.source')" width="100" align="center">
        <template #default="scope">{{ sourceLabel(scope.row.source) }}</template>
      </el-table-column>
      <el-table-column :label="t('recording.status')" width="100" align="center">
        <template #default="scope">
          <el-tag :type="statusTagType(scope.row.status)" size="small">{{ statusLabel(scope.row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('recording.lastRun')" width="150" align="center">
        <template #default="scope">
          <el-tag v-if="scope.row.lastRunStatus" :type="runTagType(scope.row.lastRunStatus)" size="small">
            {{ runLabel(scope.row.lastRunStatus) }}
          </el-tag>
          <span v-else class="text-gray-400">{{ t('recording.neverRun') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('recording.owner')" prop="ownerName" width="120" :show-overflow-tooltip="true" />
      <el-table-column :label="t('recording.createTime')" prop="createTime" width="160" align="center" />
      <el-table-column :label="t('common.column.operation')" width="220" align="center" fixed="right">
        <template #default="scope">
          <el-tooltip :content="t('recording.detail')" placement="top">
            <el-button
              link
              type="primary"
              icon="View"
              :aria-label="t('recording.detail')"
              @click="openDetail(scope.row)"
              v-hasPermi="['tool:recording:query']"
            />
          </el-tooltip>
          <el-tooltip :content="t('recording.replay')" placement="top">
            <el-button
              link
              type="success"
              icon="VideoPlay"
              :aria-label="t('recording.replay')"
              @click="openReplay(scope.row)"
              v-hasPermi="['tool:recording:replay']"
            />
          </el-tooltip>
          <el-dropdown
            class="ml-1"
            @command="(cmd: string) => handleExport(scope.row, cmd)"
            v-hasPermi="['tool:recording:export']"
          >
            <el-button link type="primary" icon="Download" :aria-label="t('recording.export')" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="curl">{{ t('recording.exportCurl') }}</el-dropdown-item>
                <el-dropdown-item command="http">{{ t('recording.exportHttp') }}</el-dropdown-item>
                <el-dropdown-item command="json">{{ t('recording.exportJson') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-tooltip :content="t('recording.edit')" placement="top">
            <el-button
              link
              type="primary"
              icon="Edit"
              class="ml-1"
              :aria-label="t('recording.edit')"
              @click="handleUpdate(scope.row)"
              v-hasPermi="['tool:recording:edit']"
            />
          </el-tooltip>
          <el-tooltip :content="t('common.delete')" placement="top">
            <el-button
              link
              type="danger"
              icon="Delete"
              class="ml-1"
              :aria-label="t('common.delete')"
              @click="handleDelete(scope.row)"
              v-hasPermi="['tool:recording:remove']"
            />
          </el-tooltip>
        </template>
      </el-table-column>
      <template #empty>
        <list-empty :load-error="loadError" @retry="retryLoad" />
      </template>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 新建 / 编辑录制 -->
    <el-dialog
      :title="title"
      v-model="open"
      :before-close="beforeDialogClose"
      width="min(92%, 620px)"
      append-to-body
      destroy-on-close
    >
      <el-form ref="recordingRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('recording.name')" prop="name">
          <el-input
            v-model="form.name"
            :maxlength="120"
            show-word-limit
            :placeholder="t('recording.phName')"
            :aria-label="t('recording.name')"
          />
        </el-form-item>
        <el-form-item :label="t('recording.description')" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            :maxlength="500"
            show-word-limit
            :placeholder="t('recording.phDescription')"
            :aria-label="t('recording.description')"
          />
        </el-form-item>
        <el-form-item v-if="form.recordingId" :label="t('recording.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio-button value="draft">{{ t('recording.statusDraft') }}</el-radio-button>
            <el-radio-button value="ready">{{ t('recording.statusReady') }}</el-radio-button>
            <el-radio-button value="archived">{{ t('recording.statusArchived') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">
            {{ t('common.confirm') }}
          </el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 录制详情：抬头 + 步骤 -->
    <el-drawer
      v-model="detailOpen"
      :title="t('recording.detailTitle')"
      size="min(92%, 900px)"
      append-to-body
      destroy-on-close
    >
      <div v-loading="detailLoading">
        <template v-if="detail">
          <el-descriptions :column="2" border size="small" class="mb-3">
            <el-descriptions-item :label="t('recording.name')">{{ detail.name }}</el-descriptions-item>
            <el-descriptions-item :label="t('recording.stepCount')">
              {{ detail.steps.length }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('recording.description')" :span="2">
              {{ detail.description || '—' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('recording.owner')">
              {{ detail.ownerName || '—' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('recording.lastRun')">
              {{ detail.lastRunStatus ? runLabel(detail.lastRunStatus) : t('recording.neverRun') }}
            </el-descriptions-item>
          </el-descriptions>

          <div class="mb-2 flex items-center justify-between">
            <span class="font-medium">{{ t('recording.steps') }}</span>
            <span class="flex gap-2">
              <el-button size="small" icon="Refresh" @click="reloadDetail" :aria-label="t('common.refresh')">
                {{ t('common.refresh') }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                icon="Delete"
                :disabled="!detail.steps.length"
                @click="handleClearSteps"
                v-hasPermi="['tool:recording:edit']"
              >
                {{ t('recording.clearSteps') }}
              </el-button>
            </span>
          </div>

          <el-table :data="detail.steps" size="small" border>
            <el-table-column :label="t('recording.stepSeq')" prop="seq" width="60" align="center" />
            <el-table-column :label="t('recording.stepMethod')" prop="method" width="90" align="center" />
            <el-table-column
              :label="t('recording.stepPath')"
              prop="path"
              min-width="200"
              :show-overflow-tooltip="true"
            />
            <el-table-column :label="t('recording.stepBody')" min-width="220">
              <template #default="scope">
                <span class="font-mono text-xs break-all">
                  {{ scope.row.body ? truncate(scope.row.body, 120) : '—' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="t('recording.stepExpect')" width="90" align="center">
              <template #default="scope">{{ scope.row.expectStatus ?? '—' }}</template>
            </el-table-column>
            <el-table-column v-if="canEdit" :label="t('common.column.operation')" width="80" align="center">
              <template #default="scope">
                <el-button
                  link
                  type="danger"
                  icon="Delete"
                  :aria-label="t('common.delete')"
                  @click="handleDeleteStep(scope.row)"
                />
              </template>
            </el-table-column>
            <template #empty>
              <div class="py-6 text-center text-gray-500">{{ t('recording.noSteps') }}</div>
            </template>
          </el-table>

          <div class="mt-4">
            <div class="mb-2 font-medium">{{ t('recording.runs') }}</div>
            <el-table :data="runs" size="small" border>
              <el-table-column :label="t('recording.runId')" prop="runId" width="80" align="center" />
              <el-table-column :label="t('recording.runStatus')" width="110" align="center">
                <template #default="scope">
                  <el-tag :type="runTagType(scope.row.status)" size="small">
                    {{ runLabel(scope.row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('recording.runStat')" width="160" align="center">
                <template #default="scope">
                  {{ scope.row.succeeded }} / {{ scope.row.failed }} / {{ scope.row.skipped }}
                </template>
              </el-table-column>
              <el-table-column :label="t('recording.operator')" prop="operator" width="120" />
              <el-table-column :label="t('recording.runStarted')" prop="startedAt" width="170" />
              <el-table-column :label="t('common.column.operation')" width="90" align="center">
                <template #default="scope">
                  <el-button link type="primary" @click="openRun(scope.row)">
                    {{ t('recording.runView') }}
                  </el-button>
                </template>
              </el-table-column>
              <template #empty>
                <div class="py-4 text-center text-gray-500">{{ t('recording.noRuns') }}</div>
              </template>
            </el-table>
          </div>
        </template>
      </div>
    </el-drawer>

    <!-- 回放 -->
    <el-dialog
      v-model="replayOpen"
      :title="t('recording.replayTitle')"
      width="min(92%, 760px)"
      append-to-body
      destroy-on-close
      :before-close="beforeReplayClose"
      @closed="resetReplay"
    >
      <el-form label-width="130px">
        <el-form-item :label="t('recording.replayStopOnError')">
          <el-switch v-model="replayForm.stopOnError" :aria-label="t('recording.replayStopOnError')" />
          <span class="ml-2 text-xs text-gray-500">{{ t('recording.replayStopOnErrorTip') }}</span>
        </el-form-item>
        <el-form-item :label="t('recording.replayMaxSteps')">
          <el-input-number v-model="replayForm.maxSteps" :min="1" :max="200" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('recording.replayVars')">
          <el-input
            v-model="replayForm.varsText"
            type="textarea"
            :rows="4"
            placeholder='{"deptId":"12"}'
            :aria-label="t('recording.replayVars')"
          />
          <div class="mt-1 text-xs text-gray-500">{{ t('recording.replayVarsTip') }}</div>
        </el-form-item>
        <el-form-item :label="t('recording.replayDryRun')">
          <el-switch v-model="replayForm.dryRun" :aria-label="t('recording.replayDryRun')" />
          <span class="ml-2 text-xs text-gray-500">{{ t('recording.replayDryRunTip') }}</span>
        </el-form-item>
      </el-form>

      <el-alert v-if="replayError" type="error" :closable="false" :title="replayError" class="mb-3" />

      <div v-if="preview.length" class="mb-3">
        <div class="mb-1 font-medium">{{ t('recording.replayPreview') }}</div>
        <el-table :data="preview" size="small" border max-height="320">
          <el-table-column :label="t('recording.stepSeq')" prop="seq" width="60" align="center" />
          <el-table-column :label="t('recording.stepMethod')" prop="method" width="90" align="center" />
          <el-table-column :label="t('recording.previewUrl')" prop="url" min-width="260" show-overflow-tooltip />
          <el-table-column :label="t('recording.previewProblem')" min-width="180">
            <template #default="scope">
              <span :class="scope.row.problem ? 'text-red-500' : 'text-green-600'">
                {{ scope.row.problem || t('recording.previewOk') }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="runDetail" class="mb-3">
        <div class="mb-1 flex items-center justify-between">
          <span class="font-medium">
            {{ t('recording.runDetail') }} #{{ runDetail.runId }}
            <el-tag :type="runTagType(runDetail.status)" size="small" class="ml-1">
              {{ runLabel(runDetail.status) }}
            </el-tag>
          </span>
          <span class="text-xs text-gray-500">
            {{ runDetail.succeeded }} / {{ runDetail.failed }} / {{ runDetail.skipped }}
          </span>
        </div>
        <el-table :data="runDetail.steps" size="small" border max-height="360">
          <el-table-column :label="t('recording.stepSeq')" prop="seq" width="60" align="center" />
          <el-table-column :label="t('recording.stepMethod')" prop="method" width="90" align="center" />
          <el-table-column :label="t('recording.stepPath')" prop="path" min-width="180" show-overflow-tooltip />
          <el-table-column :label="t('recording.runCode')" prop="status" width="80" align="center" />
          <el-table-column :label="t('recording.runElapsed')" width="90" align="center">
            <template #default="scope">{{ scope.row.durationMs }} ms</template>
          </el-table-column>
          <el-table-column :label="t('recording.runOutcome')" min-width="200">
            <template #default="scope">
              <span :class="scope.row.ok ? 'text-green-600' : 'text-red-500'">
                {{
                  scope.row.skipped
                    ? t('recording.runSkipped')
                    : scope.row.ok
                      ? t('recording.previewOk')
                      : scope.row.error
                }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="replayLoading" @click="submitReplay">
            {{ replayForm.dryRun ? t('recording.replayPreviewBtn') : t('recording.replayStart') }}
          </el-button>
          <el-button @click="cancelReplay">{{ t('common.close') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRefs } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCrudTable } from '@/composables/useCrudTable'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { checkPermi } from '@/utils/permission'
import {
  addRecording,
  clearSteps,
  delRecording,
  delStep,
  exportScript,
  getRecording,
  getRun,
  listRecording,
  listRuns,
  replayRecording,
  updateRecording
} from '@/api/tool/recording'
import type {
  OpRecording,
  OpRecordingDetail,
  OpRecordingQuery,
  OpReplayRun,
  OpReplayRunDetail,
  OpStepPreview
} from '@/api/tool/recording'

const { t } = useI18n()
const queryRef = ref()
const recordingRef = ref()

const data = reactive({
  form: {} as OpRecording,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    name: undefined,
    status: undefined
  } as OpRecordingQuery,
  rules: {
    name: [{ required: true, message: t('recording.nameRequired'), trigger: 'blur' }]
  }
})
const { queryParams, form, rules } = toRefs(data)

const {
  dataList,
  open,
  loading,
  submitLoading,
  showSearch,
  ids,
  single,
  multiple,
  total,
  title,
  loadError,
  retryLoad,
  getList,
  beforeDialogClose,
  cancel,
  reset,
  handleQuery,
  resetQuery,
  handleSelectionChange,
  handleAdd: baseAdd,
  handleUpdate: baseUpdate,
  submitForm
} = useCrudTable<OpRecording, OpRecordingQuery>({
  listApi: listRecording,
  getApi: getRecording,
  addApi: addRecording,
  updateApi: updateRecording,
  deleteApi: delRecording,
  idField: 'recordingId',
  defaultForm: () => ({
    recordingId: 0,
    name: '',
    description: '',
    source: 'ui',
    status: 'ready',
    stepCount: 0
  }),
  titleKey: 'recording.title',
  deleteTipKey: 'recording.confirmDelete',
  queryParams,
  form,
  formRef: recordingRef,
  queryRef
})

const canEdit = computed(() => checkPermi(['tool:recording:edit']))

// 移动端筛选收纳（MOBILE-UX-GUIDELINES §六）：本页有筛选控制点（名称 + 状态），
// 375 宽度下不收纳会把首屏全部让给筛选表单，一行数据都看不到。
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

/** 是否有选中未处理（`single` 语义由组合子维护，这里保留可读别名） */
void single

// ==================== 展示映射（状态/来源/结论）====================

function statusLabel(v: string): string {
  if (v === 'draft') return t('recording.statusDraft')
  if (v === 'archived') return t('recording.statusArchived')
  return t('recording.statusReady')
}
function statusTagType(v: string): 'info' | 'success' | 'warning' {
  if (v === 'draft') return 'info'
  if (v === 'archived') return 'warning'
  return 'success'
}
function sourceLabel(v: string): string {
  if (v === 'api') return t('recording.sourceApi')
  if (v === 'import') return t('recording.sourceImport')
  return t('recording.sourceUi')
}
function runLabel(v: string): string {
  if (v === 'running') return t('recording.runRunning')
  if (v === 'success') return t('recording.runSuccess')
  if (v === 'partial') return t('recording.runPartial')
  return t('recording.runFailed')
}
function runTagType(v: string): 'success' | 'danger' | 'warning' | 'info' {
  if (v === 'success') return 'success'
  if (v === 'partial') return 'warning'
  if (v === 'running') return 'info'
  return 'danger'
}
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// ==================== 新建 / 编辑 ====================

function handleAdd(): void {
  reset()
  baseAdd()
}

function handleUpdate(row: OpRecording): void {
  baseUpdate(row)
}

// ==================== 删除 ====================

function handleDelete(row?: OpRecording): void {
  const selectedIds = new Set(ids.value.map(String))
  const targets: OpRecording[] = row
    ? [row]
    : dataList.value.filter((r: OpRecording) => selectedIds.has(String(r.recordingId)))
  if (!targets.length) return
  const names = targets.map((r: OpRecording) => r.name).join('、')
  ElMessageBox.confirm(t('recording.confirmDelete', { names }), t('common.warning'), {
    type: 'warning',
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel')
  })
    .then(() => delRecording(targets.map((r) => r.recordingId)))
    .then(() => {
      // 被删的若正是抽屉里那条，必须关掉抽屉——否则用户还在看一条已不存在的数据
      if (detail.value && targets.some((r: OpRecording) => r.recordingId === detail.value!.recordingId)) {
        detailOpen.value = false
      }
      getList()
    })
    .catch(() => {
      // 取消或请求失败：失败提示由 request 拦截器统一给出，这里不重复
    })
}

// ==================== 详情抽屉 ====================

const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<OpRecordingDetail | null>(null)
const runs = ref<OpReplayRun[]>([])
const detailRecordingId = ref<number | null>(null)

async function openDetail(row: OpRecording): Promise<void> {
  detailRecordingId.value = row.recordingId
  detailOpen.value = true
  await reloadDetail()
}

async function reloadDetail(): Promise<void> {
  if (!detailRecordingId.value) return
  detailLoading.value = true
  try {
    const [detailRes, runsRes] = await Promise.all([
      getRecording(detailRecordingId.value),
      listRuns(detailRecordingId.value, 20)
    ])
    detail.value = detailRes?.data ?? null
    runs.value = runsRes?.data ?? []
  } finally {
    detailLoading.value = false
  }
}

function handleClearSteps(): void {
  if (!detailRecordingId.value) return
  ElMessageBox.confirm(t('recording.clearStepsConfirm'), t('common.warning'), { type: 'warning' })
    .then(() => clearSteps(detailRecordingId.value as number))
    .then(() => {
      ElMessage.success(t('common.success'))
      reloadDetail()
      getList()
    })
    .catch(() => {})
}

function handleDeleteStep(step: { stepId: number }): void {
  if (!detailRecordingId.value) return
  ElMessageBox.confirm(t('recording.deleteStepConfirm'), t('common.warning'), { type: 'warning' })
    .then(() => delStep(detailRecordingId.value as number, step.stepId))
    .then(() => {
      ElMessage.success(t('common.success'))
      reloadDetail()
      getList()
    })
    .catch(() => {})
}

// ==================== 导出 ====================

async function handleExport(row: OpRecording, format: string): Promise<void> {
  const fmt = (format === 'http' || format === 'json' ? format : 'curl') as 'curl' | 'http' | 'json'
  const ext = fmt === 'curl' ? 'sh' : fmt
  try {
    // 成功提示只能说"已发起下载"：浏览器是否落盘页面无法观测（utils/saveBlob 模块文档）
    const ok = await exportScript(row.recordingId, fmt, `recording-${row.recordingId}.${ext}`)
    if (ok) ElMessage.success(t('recording.exportStarted'))
  } catch {
    // 三类失败出口（超时 / 被取消 / 服务端拒绝）已在 download() 内分类提示，这里只收尾拒绝
  }
}

// ==================== 回放 ====================

const replayOpen = ref(false)
const replayLoading = ref(false)
const replayError = ref('')
const preview = ref<OpStepPreview[]>([])
const runDetail = ref<OpReplayRunDetail | null>(null)
const replayRecordingId = ref<number | null>(null)

const replayForm = reactive({
  stopOnError: true,
  maxSteps: 50,
  varsText: '',
  dryRun: false
})

// 回放对话框里是手写 JSON 变量表：误触遮罩 / Esc / × 会静默丢掉整段输入，
// 所以走 useDialogDirtyGuard（三条关闭通道汇入同一个 before-close）。
const {
  beforeClose: beforeReplayClose,
  cancel: cancelReplay,
  markSaved: markReplaySubmitted
} = useDialogDirtyGuard(replayOpen, () => ({
  stopOnError: replayForm.stopOnError,
  maxSteps: replayForm.maxSteps,
  varsText: replayForm.varsText,
  dryRun: replayForm.dryRun
}))

function openReplay(row: OpRecording): void {
  resetReplay()
  replayRecordingId.value = row.recordingId
  replayOpen.value = true
}

function resetReplay(): void {
  replayError.value = ''
  preview.value = []
  runDetail.value = null
  replayForm.stopOnError = true
  replayForm.maxSteps = 50
  replayForm.varsText = ''
  replayForm.dryRun = false
}

/** 解析变量表：非法 JSON 必须当场报错，不能静默当空表（否则回放会缺变量失败） */
function parseVars(): Record<string, string> | null {
  const raw = replayForm.varsText.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = typeof v === 'string' ? v : String(v)
    }
    return out
  } catch {
    replayError.value = t('recording.varsInvalid')
    return null
  }
}

async function submitReplay(): Promise<void> {
  if (!replayRecordingId.value) return
  const vars = parseVars()
  if (vars === null) return
  replayError.value = ''
  preview.value = []
  runDetail.value = null
  replayLoading.value = true
  try {
    const res = await replayRecording(replayRecordingId.value, {
      stopOnError: replayForm.stopOnError,
      maxSteps: replayForm.maxSteps || undefined,
      vars,
      dryRun: replayForm.dryRun
    })
    const data = res?.data
    if (!data) {
      replayError.value = t('recording.replayNoResult')
      return
    }
    if (replayForm.dryRun) {
      preview.value = data.preview ?? []
      // 输入已被消费（预检跑完了），后续关闭不再当"未保存"追问一次
      markReplaySubmitted()
      ElMessage.success(t('recording.previewDone'))
      return
    }
    markReplaySubmitted()
    ElMessage.success(t('recording.replayStarted', { runId: data.runId }))
    await pollRun(replayRecordingId.value, data.runId)
  } catch {
    // 失败提示由 request 拦截器统一给出；这里只保证拒绝不逸出到全局 ErrorBoundary
    // （否则整页被卸载，用户连"哪个录制失败了"都看不到）
    replayError.value = t('recording.replayRequestFailed')
  } finally {
    replayLoading.value = false
  }
}

/**
 * 轮询回放结论。
 *
 * 用**有界轮询 + 退避**而不是固定 sleep：回放可能几秒结束也可能几十秒，
 * 固定间隔会让短任务多等一轮、长任务疯狂打接口。上限 60 次 × 1.5s ≈ 90s，
 * 超过即提示"仍在后台运行"（不谎称完成）。
 */
async function pollRun(recordingId: number, runId: number): Promise<void> {
  const MAX_TRIES = 60
  for (let i = 0; i < MAX_TRIES; i += 1) {
    const res = await getRun(recordingId, runId)
    const data = res?.data
    if (!data) break
    runDetail.value = data
    if (data.status !== 'running') {
      if (data.status === 'success') {
        ElMessage.success(t('recording.replayDone'))
      } else {
        ElMessage.warning(t('recording.replayNotAllPass'))
      }
      await reloadDetail()
      getList()
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  ElMessage.info(t('recording.replayStillRunning'))
}

async function openRun(row: OpReplayRun): Promise<void> {
  if (!detailRecordingId.value) return
  try {
    const res = await getRun(detailRecordingId.value, row.runId)
    replayRecordingId.value = detailRecordingId.value
    runDetail.value = res?.data ?? null
    replayOpen.value = true
  } catch {
    // 拦截器已提示；不打开一个内容为空的"运行详情"对话框（那会被读成"跑了但没有步骤"）
    runDetail.value = null
  }
}

// 首屏必须自己拉一次：`useCrudTable` 只提供 getList，不做 onMounted 自动加载
// （全仓同款约定，见 tool/gen、system/dict）。漏了这行页面会永远显示"共 0 条 · 暂无数据"——
// b147 的 e2e ⑭ 就是靠"新建后列表里找不到那一行"抓到它的。
getList()
</script>
