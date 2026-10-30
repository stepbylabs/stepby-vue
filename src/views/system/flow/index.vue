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
              <!-- 待办行 taskType 是引擎四模式定格值（NodeSpec::task_type），
                   single 以外的会签族一律高亮 -->
              <el-tag :type="row.taskType === 'single' ? 'primary' : 'warning'">
                {{ flowTypeLabel(row.taskType) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('flow.colDue')" width="170">
            <template #default="{ row }">
              <span :class="{ 'flow-overdue': isOverdue(row) }">{{ row.dueAt || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.column.operation')" width="400" :fixed="opFixed">
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
              <!-- 减签（G-02 M2）：移除本节点一名审批人；节点至少剩一名有效审批人，
                   否则后端 400 防线（与 designer 的 countersign_del 动作白名单同源） -->
              <el-button
                v-if="row.taskType !== 'single'"
                link
                type="warning"
                icon="RemoveFilled"
                @click="openAct(row, 'countersignDel')"
              >
                {{ t('flow.actCountersignDel') }}
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
            <template #default="{ row }">{{ flowTypeLabel(row.flowMode) }}</template>
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
            <el-button type="warning" plain icon="Download" :loading="exporting" @click="handleExport">
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
    <el-dialog
      v-model="submitOpen"
      :title="t('flow.submitTitle')"
      width="520px"
      append-to-body
      :before-close="beforeSubmitClose"
    >
      <el-form ref="submitRef" :model="submitForm" :rules="submitRules" label-width="90px">
        <el-form-item :label="t('flow.formTitle')" prop="title">
          <el-input v-model="submitForm.title" :maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('flow.formLeaveType')" prop="leaveType">
          <el-select :aria-label="t('flow.formLeaveType')" v-model="submitForm.leaveType" class="w-full">
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
            <el-radio value="or_sign">{{ t('flow.typeOrSign') }}</el-radio>
            <el-radio value="weighted">{{ t('flow.typeWeighted') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('flow.formReason')" prop="reason">
          <el-input v-model="submitForm.reason" type="textarea" :rows="3" :maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelSubmit">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 审批动作对话框 ============ -->
    <el-dialog v-model="actOpen" :title="actTitle" width="460px" append-to-body :before-close="beforeActClose">
      <el-form label-width="90px">
        <el-form-item v-if="!needsTargetUser" :label="t('flow.formComment')">
          <el-input v-model="actComment" type="textarea" :rows="3" :maxlength="500" />
        </el-form-item>
        <el-form-item v-else :label="t('flow.formToUser')">
          <el-select
            :aria-label="t('flow.formToUser')"
            v-model="actToUserId"
            remote
            filterable
            clearable
            :remote-method="searchUsers"
            :loading="userSearching"
            :placeholder="actAction === 'countersignDel' ? t('flow.phToUserDel') : t('flow.phToUser')"
            class="!w-full"
          >
            <el-option
              v-for="u in userOptions"
              :key="u.userId"
              :label="`${u.nickName}(${u.userName})`"
              :value="u.userId!"
            />
          </el-select>
          <!-- b134：候选源失败/截断必须可见（空下拉不得冒充"没有匹配用户"） -->
          <div
            v-if="userSearchError"
            class="mt-1 text-xs leading-snug text-[var(--el-color-danger)]"
            data-test="flow-user-search-error"
          >
            {{ t('flow.userOptionsFailed') }}
            <el-button link type="primary" size="small" @click="retryUserSearch">{{ t('common.retry') }}</el-button>
          </div>
          <div
            v-else-if="userTruncated"
            class="mt-1 text-xs leading-snug text-[var(--el-color-warning)]"
            data-test="flow-user-truncated"
          >
            {{ t('common.optionsTruncated', { count: userOptions.length, total: userTotal }) }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelAct">{{ t('common.cancel') }}</el-button>
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
import { validateForm } from '@/utils/formValidate'
import { createLatestGuard } from '@/composables/latestRequest'
import { useRemoteOptions } from '@/composables/useRemoteOptions'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { wsService } from '@/utils/websocket'
import { download } from '@/utils/request'
import { confirmAction } from '@/utils/confirm'
import { checkPermi } from '@/utils/permission'
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
  countersignDelFlowTask,
  type SysFlowTask,
  type FlowDoneVo,
  type FlowDemoDoc,
  type FlowTaskDetail,
  type FlowPageQuery
} from '@/api/flow'
import { listUser } from '@/api/system/user'
import type { SysUser } from '@/types'
import type { FlowActionForm } from '@/api/flow'

const { t } = useI18n()
const userStore = useUserStore()
const userId = computed(() => Number(userStore.id ?? 0))
// 管理视图 tab 依赖权限键 system:flow:list（与 v-hasPermi 同一判定入口：checkPermi 内部
// 处理超管 `*:*:*`，前端不得各自手写 includes——两处口径必然漂移）
const isManager = computed(() => checkPermi(['system:flow:list']))

const activeTab = ref('todo')
// 四个 tab 共用一张表，但**可能并发加载**（切页签 + 翻页 + 提交后刷新）：
// 共享布尔量会被先完成的那条清掉，让另一张表在飞时转圈消失。改计数为 0 才熄灭。
const pendingLoads = ref(0)
const loading = computed(() => pendingLoads.value > 0)
const pendingCount = ref(0)
// 每个列表各自的请求序号：翻页/筛选快速切换时，**旧响应不得覆盖新响应**
// （否则页码停在第 2 页、表格显示第 1 页的数据，且总条数也对不上）。
const listGuards = {
  todo: createLatestGuard(),
  mine: createLatestGuard(),
  done: createLatestGuard(),
  all: createLatestGuard()
}

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
const { sys_flow_task_status, sys_flow_leave_type } = useDict('sys_flow_task_status', 'sys_flow_leave_type')
const leaveTypeLabel = (value: string) =>
  sys_flow_leave_type.value.find((o: { value: string }) => o.value === value)?.label ?? value

// 引擎四模式标签：待办行的 taskType 与单据的 flowMode 同源（NodeSpec::task_type）
const flowTypeLabel = (value: string) =>
  (
    ({
      single: t('flow.typeSingle'),
      countersign: t('flow.typeCountersign'),
      or_sign: t('flow.typeOrSign'),
      weighted: t('flow.typeWeighted')
    }) as Record<string, string>
  )[value] ?? value

const isOverdue = (row: SysFlowTask) =>
  !!row.dueAt && row.status === 'pending' && new Date(row.dueAt).getTime() < Date.now()

// ---------- 数据加载 ----------
async function loadPendingCount() {
  try {
    const res = await flowPendingCount()
    pendingCount.value = Number(res.data ?? 0)
  } catch (e) {
    // 拦截器已提示；角标数字保持上一次的值（不得清成 0 假装"没有待办"）
    if (import.meta.env.DEV) console.error('[flow] pendingCount:', e)
  }
}

/**
 * 四个列表共用的加载骨架：序号守卫 + 计数式 loading + 拒绝不逸出。
 * 旧实现在 `finally` 里直接熄 loading，且没有序号守卫——两条都是"看起来对"的写法。
 */
async function loadList<K extends 'todo' | 'mine' | 'done' | 'all', R>(
  key: K,
  // b138：原名 `fetch` 遮蔽了全局 fetch——可读性陷阱，也让"生产码禁裸 fetch"的守卫
  // 无法用一条正则区分"调用全局 fetch"与"调用局部形参"（实测这处会被误判成直连通道）
  loader: () => Promise<{ rows: R[]; total: number }>,
  rows: { value: R[] },
  total: { value: number }
) {
  const ticket = listGuards[key].begin()
  pendingLoads.value += 1
  try {
    const res = await loader()
    if (!listGuards[key].isCurrent(ticket)) return // 已有更新的请求发出，丢弃这份过期结果
    rows.value = res.rows
    total.value = res.total
  } catch (e) {
    // 拦截器已提示；保留上一份数据（比清空成"暂无数据"诚实）
    if (import.meta.env.DEV) console.error(`[flow] load ${key}:`, e)
  } finally {
    pendingLoads.value = Math.max(0, pendingLoads.value - 1)
  }
}

const loadTodo = () => loadList('todo', () => listFlowTodo(todoQuery.value), todoRows, todoTotal)
const loadMine = () => loadList('mine', () => listFlowMine(mineQuery.value), mineRows, mineTotal)
const loadDone = () => loadList('done', () => listFlowDone(doneQuery.value), doneRows, doneTotal)
const loadAll = () => loadList('all', () => listFlowAll(allQuery.value), allRows, allTotal)

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
  download('/system/flow/export', { status: allQuery.value.status }, `flow_doc_${Date.now()}.xlsx`).finally(() => {
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
  flowMode: 'single' as 'single' | 'countersign' | 'or_sign' | 'weighted'
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
  if (!(await validateForm(submitRef.value))) return
  submitting.value = true
  try {
    await submitFlowDemo(submitForm.value)
    ElMessage.success(t('flow.msgSubmitted'))
    markSubmitSaved()
    submitOpen.value = false
    activeTab.value = 'mine'
    await Promise.all([loadMine(), loadPendingCount()])
  } catch (e) {
    // 拦截器已提示；对话框保持打开供修正（不得让拒绝逸出）
    if (import.meta.env.DEV) console.error('[flow] submit:', e)
  } finally {
    submitting.value = false
  }
}

// ---------- 审批动作 ----------
/** approve/reject/withdraw/transfer 走 /action，加减签各走独立端点 */
type ActKind = FlowActionForm['action'] | 'countersign' | 'countersignDel'
const actOpen = ref(false)
const acting = ref(false)
const actAction = ref<ActKind>('approve')
const actTaskId = ref(0)
const actComment = ref('')
const actToUserId = ref<number | undefined>(undefined)

/**
 * 关闭语义（b135）：提交单据与审批动作两个对话框原先都没有关闭确认，
 * 填好标题/理由/转办人后按 Esc 或误点遮罩会静默丢弃。审批动作的表单是两个独立 ref，
 * 用 getter 合成只读快照（useDialogDirtyGuard 支持 getter 形态）。
 */
const {
  beforeClose: beforeSubmitClose,
  cancel: cancelSubmit,
  markSaved: markSubmitSaved
} = useDialogDirtyGuard(submitOpen, submitForm)
const {
  beforeClose: beforeActClose,
  cancel: cancelAct,
  markSaved: markActSaved
} = useDialogDirtyGuard(actOpen, () => ({ comment: actComment.value, toUserId: actToUserId.value }))
const actTitle = computed(() => t(`flow.actTitle.${actAction.value}`))
/** 需要选择目标用户的动作（转办/加签/减签）：这三类不填审批意见 */
const needsTargetUser = computed(() => ['transfer', 'countersign', 'countersignDel'].includes(actAction.value))

// 加签/转办用户选择：复用既有用户列表 API（userName 模糊搜索），选项显示 昵称(用户名)
// b134：失败/截断/后发先回统一收进 useRemoteOptions（此前 catch 只写 DEV console，
// 空下拉与"没有匹配用户"同形；pageSize=50 的截断也无人提示）
const {
  options: userOptions,
  loading: userSearching,
  loadError: userSearchError,
  total: userTotal,
  truncated: userTruncated,
  search: searchUsers,
  retry: retryUserSearch,
  reset: resetUserSearch
} = useRemoteOptions<SysUser>((keyword, pageNum, pageSize) =>
  listUser({ pageNum, pageSize, userName: keyword || undefined })
)

function openAct(row: SysFlowTask, action: ActKind) {
  actTaskId.value = row.taskId
  actAction.value = action
  actComment.value = ''
  actToUserId.value = undefined
  resetUserSearch()
  void searchUsers('')
  actOpen.value = true
}

async function handleAct() {
  if (needsTargetUser.value && !actToUserId.value) {
    ElMessage.warning(t('flow.rules.toUserRequired'))
    return
  }
  acting.value = true
  try {
    if (actAction.value === 'countersign') {
      // 加签走独立端点（节点由单审升级为会签，须全部通过）
      await countersignAddFlowTask(actTaskId.value, actToUserId.value)
    } else if (actAction.value === 'countersignDel') {
      // 减签走独立端点（pending 目标行转 cancelled、已投票转 discarded，
      // 移除后节点仍满足完成条件时后端立即重新聚合推进）
      await countersignDelFlowTask(actTaskId.value, actToUserId.value)
    } else {
      await actFlowTask(actTaskId.value, {
        action: actAction.value,
        comment: actComment.value || undefined,
        toUserId: actAction.value === 'transfer' ? actToUserId.value : undefined
      })
    }
    ElMessage.success(t('common.operationSuccess'))
    markActSaved()
    actOpen.value = false
    await Promise.all([loadTodo(), loadPendingCount()])
  } catch (e) {
    // 拦截器已提示；对话框保持打开供修正（不得让拒绝逸出）
    if (import.meta.env.DEV) console.error('[flow] act:', e)
  } finally {
    acting.value = false
  }
}

async function handleWithdraw(row: FlowDemoDoc) {
  // 撤回会取消在途审批（审批人待办即时消失），属破坏性操作，必须先确认
  if (!(await confirmAction(t('flow.confirmWithdraw', { title: row.title })))) return
  try {
    await withdrawFlowDemo(row.docId)
    ElMessage.success(t('common.operationSuccess'))
    await Promise.all([loadMine(), loadPendingCount()])
  } catch (e) {
    // 拦截器已提示（如已被他人处理）；阻止拒绝逸出
    if (import.meta.env.DEV) console.error('[flow] withdraw:', e)
  }
}

async function handleResubmit(row: FlowDemoDoc) {
  try {
    await resubmitFlowDemo(row.docId)
    ElMessage.success(t('common.operationSuccess'))
    await Promise.all([loadMine(), loadPendingCount()])
  } catch (e) {
    if (import.meta.env.DEV) console.error('[flow] resubmit:', e)
  }
}

// ---------- 详情 / 时间线 ----------
const detailOpen = ref(false)
const detail = ref<FlowTaskDetail | null>(null)

async function openDetail(row: SysFlowTask) {
  try {
    const res = await getFlowTaskDetail(row.taskId)
    detail.value = res.data
    detailOpen.value = true
  } catch (e) {
    // 拦截器已提示；详情框不打开（不得让拒绝逸出卸载整页）
    if (import.meta.env.DEV) console.error('[flow] detail:', e)
  }
}

function timelineType(action: string) {
  if (action === 'approve') return 'success'
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
