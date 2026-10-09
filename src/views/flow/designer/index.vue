<template>
  <div class="p-4">
    <!-- ==================== 列表模式 ==================== -->
    <template v-if="mode === 'list'">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <el-input
          v-model="query.flowCode"
          :placeholder="t('flowDef.searchByCode')"
          class="w-56"
          clearable
          @keyup.enter="handleQuery"
        />
        <el-button icon="Search" type="primary" plain @click="handleQuery">
          {{ t('common.search') }}
        </el-button>
        <el-button v-hasPermi="['flow:definition:add']" icon="Plus" type="primary" @click="openEdit()">
          {{ t('common.add') }}
        </el-button>
      </div>

      <el-table v-loading="loading" :data="rows" border>
        <el-table-column :label="t('flowDef.colCode')" prop="flowCode" min-width="130" />
        <el-table-column :label="t('flowDef.colName')" prop="flowName" min-width="150" />
        <el-table-column :label="t('flowDef.colVersion')" width="90">
          <template #default="{ row }">v{{ row.version }}</template>
        </el-table-column>
        <el-table-column :label="t('flowDef.colLatest')" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.isLatest" type="success">{{ t('flowDef.latestTag') }}</el-tag>
            <el-tag v-else type="info">{{ t('flowDef.historyTag') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.remark')" prop="remark" min-width="140" show-overflow-tooltip />
        <el-table-column :label="t('common.column.updateTime')" prop="updateTime" width="160" />
        <el-table-column :label="t('common.column.operation')" width="280" fixed="right">
          <template #default="{ row }">
            <el-button v-hasPermi="['flow:definition:edit']" link type="primary" icon="Edit" @click="openEdit(row)">
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-if="row.isLatest"
              v-hasPermi="['flow:definition:publish']"
              link
              type="success"
              icon="Promotion"
              @click="handlePublish(row)"
            >
              {{ t('flowDef.publish') }}
            </el-button>
            <el-button link icon="DocumentCopy" @click="openDiff(row)">
              {{ t('flowDef.diffVsLatest') }}
            </el-button>
            <el-button
              v-if="row.isLatest && row.status === '1'"
              link
              type="warning"
              icon="Position"
              @click="openGraphSubmit(row)"
            >
              {{ t('flowDef.submitTest') }}
            </el-button>
            <el-button v-hasPermi="['flow:definition:remove']" link type="danger" icon="Delete" @click="handleRemove(row)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        class="mt-3 justify-end"
        @current-change="load"
        @size-change="load"
      />

      <!-- 版本对比（同 code：历史版本 vs 最新版本） -->
      <el-drawer v-model="diffOpen" :title="t('flowDef.diffTitle', { code: diffCode })" size="480px">
        <div v-if="diff">
          <h4 class="mb-2 font-medium">{{ t('flowDef.diffNodes') }}</h4>
          <ul class="mb-4 list-inside text-sm">
            <li v-for="n in diff.addedNodes" :key="'an' + n" class="text-[var(--el-color-success)]">
              + {{ n }}
            </li>
            <li v-for="n in diff.removedNodes" :key="'rn' + n" class="text-[var(--el-color-danger)]">
              - {{ n }}
            </li>
            <li v-for="n in diff.changedNodes" :key="'cn' + n" class="text-[var(--el-color-warning)]">
              ~ {{ n }}
            </li>
            <li v-if="diffEmpty" class="text-[var(--el-text-color-secondary)]">{{ t('flowDef.diffNoChange') }}</li>
          </ul>
          <h4 class="mb-2 font-medium">{{ t('flowDef.diffEdges') }}</h4>
          <ul class="list-inside text-sm">
            <li v-for="e in diff.addedEdges" :key="'ae' + e" class="text-[var(--el-color-success)]">+ {{ e }}</li>
            <li v-for="e in diff.removedEdges" :key="'re' + e" class="text-[var(--el-color-danger)]">- {{ e }}</li>
            <li v-for="e in diff.changedEdges" :key="'ce' + e" class="text-[var(--el-color-warning)]">~ {{ e }}</li>
          </ul>
        </div>
      </el-drawer>
    </template>

    <!-- ==================== 编辑模式（表单式设计器） ==================== -->
    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <el-button icon="Back" plain @click="mode = 'list'">{{ t('common.back') }}</el-button>
        <span class="font-medium">{{ form.flowName || t('flowDef.newDefinition') }}</span>
        <el-button icon="Plus" type="primary" plain @click="addNode('approve')">
          {{ t('flowDef.addNode') }}
        </el-button>
        <el-button icon="Plus" plain @click="addNode('end')">{{ t('flowDef.addEnd') }}</el-button>
        <el-button icon="Plus" plain @click="addEdgeOpen = true">{{ t('flowDef.addEdge') }}</el-button>
        <el-button v-hasPermi="['flow:definition:add', 'flow:definition:edit']" type="success" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
      </div>

      <!-- 校验错误清单（保存前前端先拦，与后端白名单校验器双份对齐） -->
      <el-alert v-if="validationErrors.length > 0" type="error" :closable="false" class="mb-3">
        <p v-for="e in validationErrors" :key="e">{{ e }}</p>
      </el-alert>

      <!-- 节点表单列表 -->
      <h4 class="mb-2 font-medium">{{ t('flowDef.nodes') }}</h4>
      <el-card v-for="(n, i) in formNodes" :key="n.id" shadow="never" class="mb-2">
        <div class="flex flex-wrap items-center gap-2">
          <el-tag :type="n.type === 'start' ? 'info' : n.type === 'end' ? 'warning' : 'primary'">
            {{ n.type }}
          </el-tag>
          <el-input v-model="n.id" :placeholder="t('flowDef.nodeId')" class="w-32" size="small" :disabled="n.type === 'start'" />
          <el-input v-model="n.name" :placeholder="t('flowDef.nodeName')" class="w-40" size="small" />
          <template v-if="n.type === 'approve'">
            <el-select v-model="n.assignees" multiple filterable allow-create class="w-64" size="small" :placeholder="t('flowDef.assignees')">
              <el-option value="dept_leader" :label="t('flowDef.assigneeDeptLeader')" />
              <el-option value="role:admin" label="role:admin" />
            </el-select>
            <el-select v-model="n.multi" class="w-32" size="small">
              <el-option v-for="m in MULTI_MODES" :key="m" :value="m" :label="m" />
            </el-select>
            <el-input-number
              v-if="n.multi === 'weighted' || n.multi === 'countersign'"
              v-model="n.threshold"
              :min="1"
              :max="1000"
              size="small"
              :placeholder="t('flowDef.threshold')"
            />
            <el-select v-model="n.actions" multiple class="w-52" size="small" :placeholder="t('flowDef.actions')">
              <el-option v-for="a in ACTIONS" :key="a" :value="a" :label="a" />
            </el-select>
          </template>
          <el-button
            v-if="n.type !== 'start'"
            link
            type="danger"
            icon="Delete"
            size="small"
            :aria-label="t('common.delete')"
            @click="formNodes.splice(i, 1)"
          />
        </div>
      </el-card>

      <!-- 边表单列表 -->
      <h4 class="mt-4 mb-2 font-medium">{{ t('flowDef.edges') }}</h4>
      <el-card v-for="(e, i) in formEdges" :key="i" shadow="never" class="mb-2">
        <div class="flex flex-wrap items-center gap-2">
          <el-select v-model="e.from" size="small" class="w-36" :placeholder="t('flowDef.edgeFrom')">
            <el-option v-for="n in formNodes" :key="n.id" :value="n.id" :label="`${n.id} (${n.type})`" />
          </el-select>
          <span>→</span>
          <el-select v-model="e.to" size="small" class="w-36" :placeholder="t('flowDef.edgeTo')">
            <el-option v-for="n in formNodes" :key="n.id" :value="n.id" :label="`${n.id} (${n.type})`" />
          </el-select>
          <el-checkbox v-model="e.hasCondition" size="small">{{ t('flowDef.hasCondition') }}</el-checkbox>
          <template v-if="e.hasCondition">
            <el-input v-model="e.condField" size="small" class="w-36" :placeholder="t('flowDef.condField')" />
            <el-select v-model="e.condOp" size="small" class="w-20">
              <el-option v-for="op in CONDITION_OPS" :key="op" :value="op" :label="op" />
            </el-select>
            <el-input v-model="e.condValue" size="small" class="w-28" :placeholder="t('flowDef.condValue')" />
          </template>
          <el-button link type="danger" icon="Delete" size="small" :aria-label="t('common.delete')" @click="formEdges.splice(i, 1)" />
        </div>
      </el-card>

      <!-- 新增边弹窗 -->
      <el-dialog v-model="addEdgeOpen" :title="t('flowDef.addEdge')" width="380px">
        <el-form label-width="70px">
          <el-form-item :label="t('flowDef.edgeFrom')" required>
            <el-select v-model="newEdgeFrom" filterable>
              <el-option v-for="n in formNodes" :key="n.id" :value="n.id" :label="n.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('flowDef.edgeTo')" required>
            <el-select v-model="newEdgeTo" filterable>
              <el-option v-for="n in formNodes" :key="n.id" :value="n.id" :label="n.id" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="addEdgeOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="confirmAddEdge">{{ t('common.confirm') }}</el-button>
        </template>
      </el-dialog>
    </template>
    <!-- 批次十八修复：提交测试单据对话框原先误嵌在 v-else（designer）分支内，
         列表模式下组件未挂载导致按钮点击无响应（探针 v10/v11 实证）——移至根级两分支之外 -->
    <el-dialog v-model="graphSubmitOpen" :title="t('flowDef.submitTest')" width="480px">
      <el-form label-width="90px">
        <el-form-item :label="t('flowDef.docTitle')" required>
          <el-input v-model="graphSubmitTitle" maxlength="200" :placeholder="t('flowDef.submitTitlePh')" />
        </el-form-item>
        <el-form-item :label="t('flowDef.fieldsJson')" required>
          <el-input
            v-model="graphSubmitFields"
            type="textarea"
            :rows="6"
            :placeholder="t('flowDef.fieldsJsonTip')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="graphSubmitOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="graphSubmitting" @click="confirmGraphSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  addFlowDefinition,
  editFlowDefinition,
  getFlowDefinition,
  listFlowDefinitions,
  publishFlowDefinition,
  submitGraphDoc,
  removeFlowDefinition,
  type FlowDefinition,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowNodeType
} from '@/api/flow'
import { diffGraphs, parseGraphJson, validateGraph, type GraphDiff } from '../definition/flowGraph'

const { t } = useI18n()

const MULTI_MODES = ['single', 'countersign', 'or_sign', 'weighted'] as const
const ACTIONS = ['delegate', 'countersign_add', 'countersign_del'] as const
const CONDITION_OPS = ['=', '!=', '>', '>=', '<', '<='] as const

const mode = ref<'list' | 'edit'>('list')
const rows = ref<FlowDefinition[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const query = ref({ flowCode: '' })

const form = ref<FlowDefUpsertFormLike>({ flowCode: '', flowName: '', graphJson: '' })
const formNodes = ref<FlowGraphNode[]>([])
const formEdges = ref<EdgeFormRow[]>([])
const saving = ref(false)
const validationErrors = ref<string[]>([])

const addEdgeOpen = ref(false)
const newEdgeFrom = ref('')
const newEdgeTo = ref('')

const diffOpen = ref(false)
const diffCode = ref('')
const diff = ref<GraphDiff>()

interface FlowDefUpsertFormLike {
  flowId?: number
  flowCode: string
  flowName: string
  graphJson: string
  remark?: string
}
/** 边的编辑形态（condition 拆为三控件 + hasCondition 开关） */
interface EdgeFormRow {
  from: string
  to: string
  hasCondition: boolean
  condField: string
  condOp: string
  condValue: string
}

const diffEmpty = computed(() => {
  if (!diff.value) return true
  const d = diff.value
  return (
    d.addedNodes.length + d.removedNodes.length + d.changedNodes.length +
    d.addedEdges.length + d.removedEdges.length + d.changedEdges.length === 0
  )
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await listFlowDefinitions({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      flowCode: query.value.flowCode || undefined
    })
    rows.value = res.rows ?? []
    total.value = res.total ?? 0
  } finally {
    loading.value = false
  }
}

function handleQuery(): void {
  pageNum.value = 1
  load()
}

async function openEdit(row?: FlowDefinition): Promise<void> {
  if (row) {
    const res = await getFlowDefinition(row.flowId)
    const d = res.data
    form.value = {
      flowId: d?.flowId,
      flowCode: d?.flowCode ?? '',
      flowName: d?.flowName ?? '',
      graphJson: d?.graphJson ?? '',
      remark: d?.remark
    }
    const g = parseGraphJson(d?.graphJson)
    formNodes.value = g.nodes.map((n: FlowGraphNode) => ({ ...n }))
    formEdges.value = g.edges.map((e: FlowGraphEdge) => ({
      from: e.from,
      to: e.to,
      hasCondition: !!e.condition,
      condField: e.condition?.field ?? '',
      condOp: e.condition?.op ?? '=',
      condValue: e.condition?.value !== undefined ? String(e.condition.value) : ''
    }))
  } else {
    // 新建：缺省三节点骨架（start → 审批 → end）
    form.value = {
      flowCode: `flow_${Date.now()}`,
      flowName: t('flowDef.newDefinitionDefaultName'),
      graphJson: ''
    }
    formNodes.value = [
      { id: 'start', type: 'start' },
      nodeSkeleton('a1'),
      { id: 'end', type: 'end' }
    ]
    formEdges.value = [
      { from: 'start', to: 'a1', hasCondition: false, condField: '', condOp: '=', condValue: '' },
      { from: 'a1', to: 'end', hasCondition: false, condField: '', condOp: '=', condValue: '' }
    ]
  }
  validationErrors.value = []
  mode.value = 'edit'
}

function nodeSkeleton(id: string): FlowGraphNode {
  return { id, type: 'approve', name: id, assignees: ['dept_leader'], multi: 'single' }
}

function addNode(type: FlowNodeType): void {
  const used = new Set(formNodes.value.map((n: FlowGraphNode) => n.id))
  let i = formNodes.value.length + 1
  while (used.has(type === 'end' ? `end${i > 1 ? i : ''}` : `${type}_${i}`)) i++
  const id = type === 'end' ? `end${i > 1 ? i : ''}` : `${type}_${i}`
  formNodes.value.push(
    type === 'end' ? { id, type: 'end' } : nodeSkeleton(id)
  )
}

function confirmAddEdge(): void {
  if (!newEdgeFrom.value || !newEdgeTo.value) return
  formEdges.value.push({
    from: newEdgeFrom.value,
    to: newEdgeTo.value,
    hasCondition: false,
    condField: '',
    condOp: '=',
    condValue: ''
  })
  addEdgeOpen.value = false
  newEdgeFrom.value = ''
  newEdgeTo.value = ''
}

/** 表单 → graph_json（条件值按数字优先归型） */
function buildGraphJson(): string {
  const nodes: FlowGraphNode[] = formNodes.value.map((n: FlowGraphNode) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    ...(n.type === 'approve'
      ? {
          assignees: n.assignees,
          multi: n.multi ?? 'single',
          threshold: n.threshold,
          actions: n.actions
        }
      : {})
  }))
  const edges: FlowGraphEdge[] = formEdges.value.map((e: EdgeFormRow) => ({
    from: e.from,
    to: e.to,
    ...(e.hasCondition && e.condField
      ? {
          condition: {
            field: e.condField,
            op: e.condOp as (typeof CONDITION_OPS)[number],
            value: /^\d+$/.test(e.condValue) ? Number(e.condValue) : e.condValue
          } as FlowGraphEdge['condition']
        }
      : {})
  }))
  return JSON.stringify({ nodes, edges })
}

async function handleSave(): Promise<void> {
  const graph: { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] } = JSON.parse(buildGraphJson())
  const result = validateGraph(graph)
  validationErrors.value = result.errors
  if (!result.ok) {
    ElMessage.error(t('flowDef.graphInvalid'))
    return
  }
  if (!form.value.flowCode || !form.value.flowName) {
    ElMessage.warning(t('flowDef.codeNameRequired'))
    return
  }
  saving.value = true
  try {
    form.value.graphJson = JSON.stringify(graph)
    if (form.value.flowId) await editFlowDefinition(form.value)
    else await addFlowDefinition(form.value)
    ElMessage.success(t('common.operationSuccess'))
    mode.value = 'list'
    load()
  } finally {
    saving.value = false
  }
}

async function handlePublish(row: FlowDefinition): Promise<void> {
  await ElMessageBox.confirm(t('flowDef.publishConfirm'), t('common.warning'), { type: 'warning' })
  const res = await publishFlowDefinition(row.flowId)
  ElMessage.success(t('flowDef.publishDone', { version: res.data?.version ?? '' }))
  load()
}

// ==================== 批次十七：提交测试单据（按图推进体验入口） ====================
const graphSubmitOpen = ref(false)
const graphSubmitting = ref(false)
const graphSubmitCode = ref('')
const graphSubmitTitle = ref('')
const graphSubmitFields = ref('{\n  "days": 5\n}')

function openGraphSubmit(row: FlowDefinition): void {
  graphSubmitCode.value = row.flowCode
  graphSubmitTitle.value = t('flowDef.submitTitleDefault', { code: row.flowCode })
  graphSubmitFields.value = '{\n  "days": 5\n}'
  graphSubmitOpen.value = true
}

async function confirmGraphSubmit(): Promise<void> {
  if (!graphSubmitTitle.value.trim()) {
    ElMessage.warning(t('flowDef.submitTitleRequired'))
    return
  }
  let fields: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(graphSubmitFields.value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    fields = parsed as Record<string, unknown>
  } catch {
    ElMessage.warning(t('flowDef.fieldsJsonInvalid'))
    return
  }
  graphSubmitting.value = true
  try {
    const res = await submitGraphDoc({
      flowCode: graphSubmitCode.value,
      title: graphSubmitTitle.value.trim(),
      fields
    })
    ElMessage.success(t('flowDef.submitOk'))
    graphSubmitOpen.value = false
    void res
  } finally {
    graphSubmitting.value = false
  }
}

async function handleRemove(row: FlowDefinition): Promise<void> {
  await ElMessageBox.confirm(t('flowDef.removeConfirm'), t('common.warning'), { type: 'warning' })
  await removeFlowDefinition(row.flowId)
  ElMessage.success(t('common.operationSuccess'))
  load()
}

/** 版本对比：历史版本 vs 同 code 最新版本 */
async function openDiff(row: FlowDefinition): Promise<void> {
  diffCode.value = row.flowCode
  const sameCode = rows.value.filter((r: FlowDefinition) => r.flowCode === row.flowCode)
  const latest = sameCode.find((r: FlowDefinition) => r.isLatest)
  if (!latest || latest.flowId === row.flowId) {
    ElMessage.info(t('flowDef.diffNoOlderVersion'))
    return
  }
  const [oldRes, newRes] = await Promise.all([
    getFlowDefinition(row.flowId),
    getFlowDefinition(latest.flowId)
  ])
  diff.value = diffGraphs(parseGraphJson(oldRes.data?.graphJson), parseGraphJson(newRes.data?.graphJson))
  diffOpen.value = true
}

onMounted(load)
</script>
