<template>
  <div class="p-4">
    <!-- 工具栏（G-15a：移动端筛选收纳，v-show 与 useMobileFilter 共用 showSearch） -->
    <div v-show="showSearch" class="mb-4 flex flex-wrap items-center gap-2">
      <el-input
        v-model="queryParams.datasetName"
        :aria-label="t('rp.searchByName')"
        :placeholder="t('rp.searchByName')"
        class="w-56"
        clearable
        @keyup.enter="handleQuery"
      />
      <el-button icon="Search" type="primary" plain @click="handleQuery">
        {{ t('common.search') }}
      </el-button>
      <el-button v-if="canEdit" icon="Plus" type="primary" @click="openEdit()">
        {{ t('common.add') }}
      </el-button>
    </div>

    <el-table v-loading="loading" :data="dataList" border>
      <el-table-column :label="t('rp.datasetCode')" prop="datasetCode" min-width="140" />
      <el-table-column :label="t('rp.datasetName')" prop="datasetName" min-width="160" />
      <el-table-column :label="t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === '0' ? 'success' : 'info'">
            {{ row.status === '0' ? t('common.enabled') : t('common.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.column.remark')" prop="remark" min-width="140" show-overflow-tooltip />
      <el-table-column :label="t('common.column.operation')" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canEdit" link type="primary" icon="Edit" @click="openEdit(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button v-if="canEdit" link type="success" icon="VideoPlay" @click="openPreview(row)">
            {{ t('rp.preview') }}
          </el-button>
          <el-button v-if="canEdit" link type="danger" icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
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
      :page-sizes="[10, 20, 50]"
      @pagination="getList"
    />

    <!-- 新增/编辑 -->
    <el-dialog
      v-model="editOpen"
      :title="form.datasetId ? t('common.edit') : t('common.add')"
      width="720px"
      :close-on-click-modal="false"
      :before-close="beforeClose"
    >
      <el-form label-width="110px">
        <el-form-item :label="t('rp.datasetCode')" required>
          <el-input v-model="form.datasetCode" maxlength="64" :disabled="!!form.datasetId" />
        </el-form-item>
        <el-form-item :label="t('rp.datasetName')" required>
          <el-input v-model="form.datasetName" maxlength="128" />
        </el-form-item>
        <el-form-item :label="t('rp.sqlTemplate')" required>
          <el-input
            v-model="form.sqlTemplate"
            type="textarea"
            :rows="6"
            class="font-mono"
            :placeholder="t('rp.sqlPlaceholder')"
          />
          <div class="w-full text-xs text-[var(--el-text-color-secondary)]">
            {{ t('rp.sqlRuleHint') }}
          </div>
        </el-form-item>
        <el-form-item :label="t('rp.paramsSchema')">
          <el-input
            v-model="paramsSchemaText"
            type="textarea"
            :rows="3"
            class="font-mono"
            :placeholder="`[{&quot;name&quot;:&quot;days&quot;,&quot;type&quot;:&quot;number&quot;,&quot;required&quot;:true}]`"
          />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="form.status">
            <el-radio value="0">{{ t('common.enabled') }}</el-radio>
            <el-radio value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('common.column.remark')">
          <el-input v-model="form.remark" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 试跑预览 -->
    <el-dialog v-model="previewOpen" :title="t('rp.previewTitle')" width="860px">
      <div v-if="previewParams.length > 0" class="mb-3 flex flex-wrap items-center gap-2">
        <span class="text-sm">{{ t('rp.queryParams') }}:</span>
        <el-input
          v-for="p in previewParams"
          :key="p.name"
          v-model="previewInput[p.name]"
          :placeholder="p.name"
          class="w-36"
          size="small"
        />
        <el-button size="small" type="primary" :loading="previewing" @click="runPreview">
          {{ t('rp.runQuery') }}
        </el-button>
      </div>
      <el-alert
        v-if="previewResult?.truncated"
        :title="t('rp.truncatedHint')"
        type="warning"
        :closable="false"
        class="mb-2"
      />
      <el-alert
        v-if="previewError"
        :title="t('rp.previewFailed')"
        type="error"
        :closable="false"
        show-icon
        class="mb-2"
      >
        <el-button link type="primary" @click="runPreview">{{ t('common.retry') }}</el-button>
      </el-alert>
      <el-table v-loading="previewing" :data="previewResult?.rows ?? []" border size="small" max-height="420">
        <el-table-column
          v-for="col in previewResult?.columns ?? []"
          :key="col"
          :prop="col"
          :label="col"
          show-overflow-tooltip
        />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { createLatestGuard } from '@/composables/latestRequest'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  addDataset,
  editDataset,
  getDataset,
  getDatasetSql,
  listDataset,
  previewDataset,
  removeDataset,
  type DatasetPreviewVo,
  type DatasetUpsertForm,
  type ReportDataset
} from '@/api/report'
import { checkPermi } from '@/utils/permission'
import { useCrudTable } from '@/composables/useCrudTable'
import { useMobileFilter } from '@/composables/useMobileFilter'

const { t } = useI18n()

/** sql_template 明文仅 report:dataset:edit 持有者可见（后端裁剪），无权限则只读
 *  批次十八：改用 checkPermi——裸 includes 不识别超管 *:*:*，超管在数据集页看不到任何操作按钮 */
const canEdit = computed(() => checkPermi(['report:dataset:edit']))

const queryParams = ref<{ pageNum: number; pageSize: number; datasetName?: string }>({
  pageNum: 1,
  pageSize: 20,
  datasetName: undefined
})

const form = ref<DatasetUpsertForm>({
  datasetCode: '',
  datasetName: '',
  sqlTemplate: '',
  status: '0'
})
// 数据集页无 el-form rules 校验（保存前手工校验），formRef 仅为契约占位
const formRef = ref<unknown>(null)
const queryRef = ref<unknown>(null)

const {
  dataList,
  loading,
  showSearch,
  total,
  loadError,
  retryLoad,
  getList,
  handleQuery,
  handleDelete: crudHandleDelete
} = useCrudTable<ReportDataset, { pageNum: number; pageSize: number; datasetName?: string }>({
  listApi: listDataset,
  getApi: (id) => getDataset(id as number),
  addApi: (data) => addDataset(data as DatasetUpsertForm),
  updateApi: (data) => editDataset(data as DatasetUpsertForm),
  deleteApi: (ids) => removeDataset(String(Array.isArray(ids) ? ids[0] : ids)),
  idField: 'datasetId',
  defaultForm: () => ({ datasetCode: '', datasetName: '', sqlTemplate: '', status: '0' }) as unknown as ReportDataset,
  titleKey: 'rp.datasetName',
  deleteTipKey: 'rp.removeDatasetConfirm',
  queryParams: queryParams as never,
  form: form as never,
  formRef: formRef as never,
  queryRef: queryRef as never
})

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)

const editOpen = ref(false)
const saving = ref(false)
const paramsSchemaText = ref('')
/** 详情时间线（b144）：列表由组合子的 `listGuard` 管，编辑表单的两次取详情另算一条线 */
const detailGuard = createLatestGuard()

const previewOpen = ref(false)
const previewing = ref(false)
const previewTarget = ref<ReportDataset>()
const previewResult = ref<DatasetPreviewVo>()
/** 预览取数失败（b141）：试跑失败必须与"查询结果为 0 行"可区分 */
const previewError = ref(false)
const previewInput = ref<Record<string, string>>({})
/** 由 params_schema 渲染参数输入行 */
const previewParams = computed<{ name: string; type: string; required: boolean }[]>(() => {
  const schema = previewTarget.value?.paramsSchema
  if (!Array.isArray(schema)) return []
  return schema
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({
      name: String(x.name ?? ''),
      type: String(x.type ?? 'string'),
      required: x.required === true
    }))
    .filter((x) => x.name)
})

/** 关闭语义（b135）：填一半按 Esc / 点遮罩原先会静默丢弃 */
const { beforeClose, cancel } = useDialogDirtyGuard(editOpen, form)

async function openEdit(row?: ReportDataset) {
  if (row) {
    // 竞态 + 拒绝逸出（b144）：连点两行的「编辑」时，先发的详情可能后到并把 A 的编码/名称/SQL
    // 填进 B 的表单——用户接着点保存就等于覆盖了另一条数据集。
    // 此前这条 await 没有任何 catch，一次 5xx 会把整页交给 ErrorBoundary（r44 同型），
    // 用户看到的是「页面加载失败」而不是一句失败理由。
    const ticket = detailGuard.begin()
    try {
      const res = await getDataset(row.datasetId)
      if (!detailGuard.isCurrent(ticket)) return
      const d = res.data
      form.value = {
        datasetId: d?.datasetId,
        datasetCode: d?.datasetCode ?? '',
        datasetName: d?.datasetName ?? '',
        // VO 恒不含 SQL 明文，必须走 edit 权限专属端点回填；取不到则留空并提示
        // （保存时 SQL 为空会被必填校验拦住，不会把空串写回覆盖原模板）
        sqlTemplate: '',
        paramsSchema: d?.paramsSchema,
        status: d?.status ?? '0',
        remark: d?.remark
      }
      paramsSchemaText.value = d?.paramsSchema != null ? JSON.stringify(d.paramsSchema) : ''
      try {
        const sqlRes = await getDatasetSql(Number(d?.datasetId ?? row.datasetId))
        if (!detailGuard.isCurrent(ticket)) return
        form.value.sqlTemplate = sqlRes.data ?? ''
      } catch (e) {
        if (!detailGuard.isCurrent(ticket)) return
        ElMessage.warning(t('rp.sqlLoadFailed'))
        if (import.meta.env.DEV && e instanceof Error) console.error('[reportDataset] sql 明文回填:', e)
      }
    } catch (e) {
      if (import.meta.env.DEV && e instanceof Error) console.error('[reportDataset] openEdit 详情读取失败:', e)
      return
    }
  } else {
    // 新建也是"换查询身份"：在飞的详情不得把内容写进这张空表单
    detailGuard.invalidate()
    form.value = { datasetCode: '', datasetName: '', sqlTemplate: '', status: '0' }
    paramsSchemaText.value = ''
  }
  editOpen.value = true
}

async function handleSave() {
  if (!form.value.datasetCode || !form.value.datasetName || !form.value.sqlTemplate.trim()) {
    ElMessage.warning(t('rp.formRequired'))
    return
  }
  let schema: unknown
  if (paramsSchemaText.value.trim()) {
    try {
      schema = JSON.parse(paramsSchemaText.value)
    } catch {
      ElMessage.warning(t('rp.paramsSchemaInvalid'))
      return
    }
  }
  saving.value = true
  try {
    const payload: DatasetUpsertForm = {
      ...form.value,
      sqlTemplate: form.value.sqlTemplate.trim(),
      paramsSchema: schema
    }
    if (payload.datasetId) await editDataset(payload)
    else await addDataset(payload)
    editOpen.value = false
    ElMessage.success(t('common.operationSuccess'))
    getList()
  } catch {
    // 服务端拒绝（SQL 白名单 400/唯一约束等）：全局拦截器已弹具体错误，
    // 此处必须吞掉 rejection——否则 AxiosError 冒泡进 ErrorBoundary 整页崩溃
    // （r44 实证：负例 UPDATE 400 → 「页面加载失败」替换视图）。保持对话框打开让用户修正重试。
  } finally {
    saving.value = false
  }
}

async function openPreview(row: ReportDataset) {
  previewTarget.value = row
  previewResult.value = undefined
  previewError.value = false
  previewInput.value = {}
  previewOpen.value = true
  await runPreview()
}

async function runPreview() {
  if (!previewTarget.value) return
  previewing.value = true
  previewError.value = false
  try {
    // 参数按 schema 归型：number 走 Number()，其余原样字符串（空串按缺失处理 → NULL 语义）
    const params: Record<string, unknown> = {}
    for (const p of previewParams.value) {
      const raw = previewInput.value[p.name]
      if (raw === undefined || raw === '') continue
      params[p.name] = p.type === 'number' ? Number(raw) : raw
    }
    const res = await previewDataset({ datasetId: previewTarget.value.datasetId, params })
    previewResult.value = res.data
  } catch (e) {
    // 失败提示由拦截器统一弹出；此处标记失败态并吞掉拒绝——否则 AxiosError 逸出事件处理器，
    // ErrorBoundary 会把预览对话框连同整页一起卸载（b141，同 b95/r44 实证形态）
    previewError.value = true
    if (import.meta.env.DEV) console.error('[reportDataset] runPreview:', e)
  } finally {
    previewing.value = false
  }
}

// 删除走 useCrudTable 的确认链（确认文案 rp.removeDatasetConfirm 与迁移前一致）
function handleDelete(row: ReportDataset): void {
  void crudHandleDelete(row)
}

getList()
</script>
