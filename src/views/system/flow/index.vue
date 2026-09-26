<template>
  <div class="app-container">
    <!-- 待办数量红点提示 -->
    <el-alert
      v-if="pendingCount > 0"
      :title="t('flow.pendingAlert', { count: pendingCount })"
      type="warning"
      show-icon
      class="mb12"
      :closable="false"
    />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- ============ 我的待办 ============ -->
      <el-tab-pane :label="t('flow.tabTodo')" name="todo">
        <el-table v-loading="loading" :data="todoRows">
          <el-table-column :label="t('flow.colTitle')" prop="title" show-overflow-tooltip />
          <el-table-column :label="t('flow.colApplicant')" prop="applicantName" width="110" />
          <el-table-column :label="t('flow.colNode')" prop="nodeName" width="150" />
          <el-table-column :label="t('flow.colType')" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.taskType === 'countersign'" type="warning">
                {{ t('flow.typeCountersign') }}
              </el-tag>
              <el-tag v-else>{{ t('flow.typeSingle') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colDue')" width="170">
            <template #default="{ row }">
              <span :class="{ 'flow-overdue': isOverdue(row) }">{{ row.dueAt || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.column.operation')" width="330" :fixed="opFixed">
            <template #default="{ row }">
              <el-button link type="success" icon="Check" @click="openAct(row, 'approve')">
                {{ t('flow.actApprove') }}
              </el-button>
              <el-button link type="danger" icon="Close" @click="openAct(row, 'reject')">
                {{ t('flow.actReject') }}
              </el-button>
              <el-button link type="primary" icon="Position" @click="openAct(row, 'transfer')">
                {{ t('flow.actTransfer') }}
              </el-button>
              <!-- 加签（W-3）：当前节点追加会签审批人，节点由单审升级为会签 -->
              <el-button link type="warning" icon="UserFilled" @click="openAct(row, 'countersign')">
                {{ t('flow.actCountersign') }}
              </el-button>
              <el-button link icon="View" @click="openDetail(row)">
                {{ t('common.detail') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <pagination
          v-show="todoTotal > 0"
          v-model:page="todoQuery.pageNum"
          v-model:limit="todoQuery.pageSize"
          :total="todoTotal"
          @pagination="loadTodo"
        />
      </el-tab-pane>

      <!-- ============ 我发起的单据 ============ -->
      <el-tab-pane :label="t('flow.tabMine')" name="mine">
        <el-button type="primary" icon="Plus" class="mb8" @click="openSubmit">
          {{ t('flow.btnSubmit') }}
        </el-button>
        <el-table v-loading="loading" :data="mineRows">
          <el-table-column :label="t('flow.colTitle')" prop="title" show-overflow-tooltip />
          <el-table-column :label="t('flow.colLeaveType')" width="100">
            <template #default="{ row }">
              {{ leaveTypeLabel(row.leaveType) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colDays')" prop="days" width="80" />
          <el-table-column :label="t('flow.colMode')" width="110">
            <template #default="{ row }">
              {{ row.flowMode === 'countersign' ? t('flow.typeCountersign') : t('flow.typeSingle') }}
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colStatus')" width="100">
            <template #default="{ row }">
              <dict-tag :options="sys_flow_task_status" :value="row.status" />
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colRound')" prop="currentRound" width="80" />
          <el-table-column :label="t('common.column.operation')" width="200" :fixed="opFixed">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'pending' && row.applicantId === userId"
                link
                type="warning"
                icon="RefreshLeft"
                @click="handleWithdraw(row)"
              >
                {{ t('flow.actWithdraw') }}
              </el-button>
              <el-button
                v-if="row.status !== 'pending' && row.applicantId === userId"
                link
                type="primary"
                icon="RefreshRight"
                @click="handleResubmit(row)"
              >
                {{ t('flow.actResubmit') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <pagination
          v-show="mineTotal > 0"
          v-model:page="mineQuery.pageNum"
          v-model:limit="mineQuery.pageSize"
          :total="mineTotal"
          @pagination="loadMine"
        />
      </el-tab-pane>

      <!-- ============ 我的已办（我作为审批人处理过的流水） ============ -->
      <el-tab-pane :label="t('flow.tabDone')" name="done">
        <el-table v-loading="loading" :data="doneRows">
          <el-table-column :label="t('flow.colTitle')" width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.title || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('flow.colBizId')" prop="bizId" width="90" />
          <el-table-column :label="t('flow.colAction')" width="100">
            <template #default="{ row }">
              <el-tag :type="row.action === 'approve' ? 'success' : 'danger'">
                {{ row.action === 'approve' ? t('flow.actApproveShort') : t('flow.actRejectShort') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colRound')" prop="roundNo" width="80" />
          <el-table-column :label="t('flow.colComment')" prop="comment" show-overflow-tooltip />
          <el-table-column :label="t('flow.colActedAt')" prop="actedAt" width="170" />
        </el-table>
        <pagination
          v-show="doneTotal > 0"
          v-model:page="doneQuery.pageNum"
          v-model:limit="doneQuery.pageSize"
          :total="doneTotal"
          @pagination="loadDone"
        />
      </el-tab-pane>

      <!-- ============ 全部单据（管理视图） ============ -->
      <el-tab-pane v-if="isManager" :label="t('flow.tabAll')" name="all">
        <el-row :gutter="10" class="mb8">
          <el-col :span="1.5">
            <el-button
              type="warning"
              plain
              icon="Download"
              :loading="exporting"
              @click="handleExport"
            >
              {{ t('flow.btnExport') }}
            </el-button>
          </el-col>
        </el-row>
        <el-table v-loading="loading" :data="allRows">
          <el-table-column :label="t('flow.colTitle')" prop="title" show-overflow-tooltip />
          <el-table-column :label="t('flow.colApplicant')" prop="applicantName" width="110" />
          <el-table-column :label="t('flow.colLeaveType')" width="100">
            <template #default="{ row }">
              {{ leaveTypeLabel(row.leaveType) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colDays')" prop="days" width="80" />
          <el-table-column :label="t('flow.colStatus')" width="100">
            <template #default="{ row }">
              <dict-tag :options="sys_flow_task_status" :value="row.status" />
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colRound')" prop="currentRound" width="80" />
        </el-table>
        <pagination
          v-show="allTotal > 0"
          v-model:page="allQuery.pageNum"
          v-model:limit="allQuery.pageSize"
          :total="allTotal"
          @pagination="loadAll"
        />
      </el-tab-pane>
    </el-tabs>

    <!-- ============ 提交对话框 ============ -->
    <el-dialog v-model="submitOpen" :title="t('flow.submitTitle')" width="520px" append-to-body>
      <el-form ref="submitRef" :model="submitForm" :rules="submitRules" label-width="90px">
        <el-form-item :label="t('flow.formTitle')" prop="title">
          <el-input v-model="submitForm.title" :maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('flow.formLeaveType')" prop="leaveType">
          <el-select v-model="submitForm.leaveType" class="w-full">
            <el-option :label="t('flow.leave.annual')" value="annual" />
            <el-option :label="t('flow.leave.sick')" value="sick" />
            <el-option :label="t('flow.leave.personal')" value="personal" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('flow.formDays')" prop="days">
          <el-input-number v-model="submitForm.days" :min="1" :max="365" />
        </el-form-item>
        <el-form-item :label="t('flow.formMode')" prop="flowMode">
          <el-radio-group v-model="submitForm.flowMode">
            <el-radio value="single">{{ t('flow.typeSingle') }}</el-radio>
            <el-radio value="countersign">{{ t('flow.typeCountersign') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('flow.formReason')" prop="reason">
          <el-input v-model="submitForm.reason" type="textarea" :rows="3" :maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="submitOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 审批动作对话框 ============ -->
    <el-dialog v-model="actOpen" :title="actTitle" width="460px" append-to-body>
      <el-form label-width="90px">
        <el-form-item v-if="actAction !== 'transfer' && actAction !== 'countersign'" :label="t('flow.formComment')">
          <el-input v-model="actComment" type="textarea" :rows="3" :maxlength="500" />
        </el-form-item>
        <el-form-item v-else :label="t('flow.formToUser')">
          <el-input-number v-model="actToUserId" :min="1" class="!w-full" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="actOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="acting" @click="handleAct">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 详情 / 时间线对话框 ============ -->
    <el-dialog v-model="detailOpen" :title="t('flow.detailTitle')" width="640px" append-to-body>
      <el-descriptions v-if="detail" :column="2" border size="small">
        <el-descriptions-item :label="t('flow.colTitle')" :span="2">
          {{ detail.doc?.title }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('flow.colLeaveType')">
          {{ detail.doc ? leaveTypeLabel(detail.doc.leaveType) : '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('flow.colDays')">
          {{ detail.doc?.days }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('flow.formReason')" :span="2">
          {{ detail.doc?.reason || '-' }}
        </el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">{{ t('flow.timeline') }}</el-divider>
      <el-timeline v-if="detail && detail.timeline.length">
        <el-timeline-item
          v-for="log in detail.timeline"
          :key="log.logId"
          :type="timelineType(log.action)"
          :timestamp="log.actedAt || ''"
        >
          <b>{{ t(`flow.action.${log.action}`) }}</b>
          <span v-if="log.nodeSeq" class="ml-2">#{{ log.nodeSeq }}</span>
          <div v-if="log.comment" class="text-xs text-gray-500">{{ log.comment }}</div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else :description="t('common.noData')" :image-size="60" />
    </el-dialog>
  </div>
</template>

<script setup name="Flow" lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useDict } from '@/utils/dict'
import { wsService } from '@/utils/websocket'
import { download } from '@/utils/request'
import useUserStore from '@/store/modules/user'
import {
  listFlowTodo,
  listFlowMine,
  listFlowDone,
  listFlowAll,
  flowPendingCount,
  getFlowTaskDetail,
  submitFlowDemo,
  resubmitFlowDemo,
  withdrawFlowDemo,
  actFlowTask,
  countersignAddFlowTask,
  type SysFlowTask,
  type FlowDoneVo,
  type FlowDemoDoc,
  type FlowTaskDetail,
  type FlowPageQuery
} from '@/api/flow'
import type { FlowActionForm } from '@/api/flow'

const { t } = useI18n()
const userStore = useUserStore()
const userId = computed(() => Number(userStore.id ?? 0))
// 管理视图 tab 依赖权限键 system:flow:list（v-hasPermi 同源）
const isManager = computed(() =>
  userStore.permissions.some((p: string) => p === '*:*:*' || p === 'system:flow:list')
)

const activeTab = ref('todo')
const loading = ref(false)
const pendingCount = ref(0)

// W-17 移动端：窄屏下取消操作列右侧固定，避免遮挡内容
const isNarrow = ref(false)
let mq: MediaQueryList | null = null
const onMqChange = (e: MediaQueryListEvent) => {
  isNarrow.value = e.matches
}
const opFixed = computed<'right' | false>(() => (isNarrow.value ? false : 'right'))

const todoQuery = ref<FlowPageQuery>({ pageNum: 1, pageSize: 10 })
const mineQuery = ref<FlowPageQuery>({ pageNum: 1, pageSize: 10 })
const doneQuery = ref<FlowPageQuery>({ pageNum: 1, pageSize: 10 })
const allQuery = ref<FlowPageQuery>({ pageNum: 1, pageSize: 10 })
const todoRows = ref<SysFlowTask[]>([])
const mineRows = ref<FlowDemoDoc[]>([])
const doneRows = ref<FlowDoneVo[]>([])
const allRows = ref<FlowDemoDoc[]>([])
const todoTotal = ref(0)
const mineTotal = ref(0)
const doneTotal = ref(0)
const allTotal = ref(0)

// 审批状态/请假类型走字典中心（sys_flow_task_status / sys_flow_leave_type，迁移 70 段双语种子；
// useDict 按 locale 自动选 dict_label / dict_label_en，字典中心改动即时生效——与 notice/task 页面同惯例）
const { sys_flow_task_status, sys_flow_leave_type } = useDict(
  'sys_flow_task_status',
  'sys_flow_leave_type'
)
const leaveTypeLabel = (value: string) =>
  sys_flow_leave_type.value.find((o: { value: string }) => o.value === value)?.label ?? value

const isOverdue = (row: SysFlowTask) =>
  !!row.dueAt && row.status === 'pending' && new Date(row.dueAt).getTime() < Date.now()

// ---------- 数据加载 ----------
async function loadPendingCount() {
  const res = await flowPendingCount()
  pendingCount.value = Number(res.data ?? 0)
}

async function loadTodo() {
  loading.value = true
  try {
    const res = await listFlowTodo(todoQuery.value)
    todoRows.value = res.rows
    todoTotal.value = res.total
  } finally {
    loading.value = false
  }
}

async function loadMine() {
  loading.value = true
  try {
    const res = await listFlowMine(mineQuery.value)
    mineRows.value = res.rows
    mineTotal.value = res.total
  } finally {
    loading.value = false
  }
}

async function loadDone() {
  loading.value = true
  try {
    const res = await listFlowDone(doneQuery.value)
    doneRows.value = res.rows
    doneTotal.value = res.total
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  loading.value = true
  try {
    const res = await listFlowAll(allQuery.value)
    allRows.value = res.rows
    allTotal.value = res.total
  } finally {
    loading.value = false
  }
}

function handleTabChange(tab: string) {
  if (tab === 'todo') loadTodo()
  else if (tab === 'mine') loadMine()
  else if (tab === 'done') loadDone()
  else if (tab === 'all') loadAll()
}

// ---------- 导出（管理视图 all tab，权限 system:flow:list） ----------
const exporting = ref(false)

function handleExport() {
  // 护栏①：无数据时提示并中止
  if (allTotal.value === 0) {
    ElMessage.warning(t('flow.exportNoData'))
    return
  }
  exporting.value = true
  // 复用既有 download 工具：表单编码 + blob + saveAs + 截断提示 + 失败走统一错误通道
  // （errorHub）。该工具内部已吞掉异常并自行提示，故**不可**在此按 Promise 结果追加
  // 成功/失败提示——失败时会误报"导出成功"。
  // 护栏②：exporting 期间按钮 loading，防重复提交
  download('/system/flow/export', { status: allQuery.value.status }, `flow_doc_${Date.now()}.xlsx`)
    .finally(() => {
      exporting.value = false
    })
}

// ---------- 提交 ----------
const submitOpen = ref(false)
const submitting = ref(false)
const submitRef = ref()
const submitForm = ref({
  title: '',
  leaveType: 'annual' as 'annual' | 'sick' | 'personal',
  days: 1,
  reason: '',
  flowMode: 'single' as 'single' | 'countersign'
})
const submitRules = {
  title: [{ required: true, message: t('flow.rules.title'), trigger: 'blur' }],
  days: [{ required: true, message: t('flow.rules.days'), trigger: 'blur' }]
}

function openSubmit() {
  submitForm.value = {
    title: '',
    leaveType: 'annual',
    days: 1,
    reason: '',
    flowMode: 'single'
  }
  submitOpen.value = true
}

async function handleSubmit() {
  await submitRef.value?.validate()
  submitting.value = true
  try {
    await submitFlowDemo(submitForm.value)
    ElMessage.success(t('flow.msgSubmitted'))
    submitOpen.value = false
    activeTab.value = 'mine'
    await Promise.all([loadMine(), loadPendingCount()])
  } finally {
    submitting.value = false
  }
}

// ---------- 审批动作 ----------
const actOpen = ref(false)
const acting = ref(false)
const actAction = ref<FlowActionForm['action'] | 'countersign'>('approve')
const actTaskId = ref(0)
const actComment = ref('')
const actToUserId = ref(1)
const actTitle = computed(() => t(`flow.actTitle.${actAction.value}`))

function openAct(row: SysFlowTask, action: FlowActionForm['action'] | 'countersign') {
  actTaskId.value = row.taskId
  actAction.value = action
  actComment.value = ''
  actToUserId.value = 1
  actOpen.value = true
}

async function handleAct() {
  acting.value = true
  try {
    if (actAction.value === 'countersign') {
      // 加签走独立端点（节点由单审升级为会签，须全部通过）
      await countersignAddFlowTask(actTaskId.value, actToUserId.value)
    } else {
      await actFlowTask(actTaskId.value, {
        action: actAction.value,
        comment: actComment.value || undefined,
        toUserId: actAction.value === 'transfer' ? actToUserId.value : undefined
      })
    }
    ElMessage.success(t('common.operationSuccess'))
    actOpen.value = false
    await Promise.all([loadTodo(), loadPendingCount()])
  } finally {
    acting.value = false
  }
}

async function handleWithdraw(row: FlowDemoDoc) {
  await withdrawFlowDemo(row.docId)
  ElMessage.success(t('common.operationSuccess'))
  await Promise.all([loadMine(), loadPendingCount()])
}

async function handleResubmit(row: FlowDemoDoc) {
  await resubmitFlowDemo(row.docId)
  ElMessage.success(t('common.operationSuccess'))
  await Promise.all([loadMine(), loadPendingCount()])
}

// ---------- 详情 / 时间线 ----------
const detailOpen = ref(false)
const detail = ref<FlowTaskDetail | null>(null)

async function openDetail(row: SysFlowTask) {
  const res = await getFlowTaskDetail(row.taskId)
  detail.value = res.data
  detailOpen.value = true
}

function timelineType(action: string) {
  if (action === 'approve' || action === 'auto_approve') return 'success'
  if (action === 'reject') return 'danger'
  if (action === 'timeout_remind') return 'warning'
  return 'primary'
}

// WS 订阅 handler（具名以便 onUnmounted 解绑，防内存泄漏与重复注册）
const onFlowTodo = () => {
  loadPendingCount()
  if (activeTab.value === 'todo') loadTodo()
}
const onFlowFinished = () => {
  if (activeTab.value === 'mine') loadMine()
  if (activeTab.value === 'done') loadDone()
  if (activeTab.value === 'all') loadAll()
}

onMounted(async () => {
  await loadPendingCount()
  if (isManager.value) {
    activeTab.value = 'todo'
  }
  await loadTodo()
  // W-17 移动端：窄屏取消操作列固定（EP 2 固定列用 sticky 实现，纯 CSS 无法可靠取消）
  mq = window.matchMedia('(max-width: 768px)')
  isNarrow.value = mq.matches
  mq.addEventListener('change', onMqChange)
  // WS 加速器闭环：收到"新待办/已办结"推送即刷新当前 tab 与红点
  // （红点以 pending_count 列表为准，重新拉取保证准确——方案 §3-8/§3-6）
  wsService.on('flowTodo', onFlowTodo)
  wsService.on('flowFinished', onFlowFinished)
})

// 组件卸载时解绑，防内存泄漏与重复注册
onUnmounted(() => {
  wsService.off('flowTodo', onFlowTodo)
  wsService.off('flowFinished', onFlowFinished)
  mq?.removeEventListener('change', onMqChange)
})
</script>

<style scoped>
.mb12 {
  margin-bottom: 12px;
}
.flow-overdue {
  color: var(--el-color-danger);
  font-weight: 600;
}

/* W-17 移动端适配：窄屏下收紧内边距、表格横向滚动、时间列换行，
   避免固定列宽挤压导致操作按钮被截断（与本仓 privacy.vue 同断点） */
@media (max-width: 768px) {
  .app-container {
    padding: 8px;
  }
  :deep(.el-tabs__item) {
    padding: 0 8px;
    font-size: 13px;
  }
  :deep(.el-table) {
    font-size: 12px;
  }
  .mb12 {
    margin-bottom: 8px;
  }
}
</style>
