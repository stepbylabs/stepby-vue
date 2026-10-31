<template>
  <div class="app-container p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('dataRule.title') }}</span>
          <el-button v-hasPermi="['system:dataRule:add']" type="primary" icon="Plus" @click="openCreate">
            {{ t('common.add') }}
          </el-button>
        </div>
      </template>

      <el-alert
        v-if="loadError"
        type="error"
        :title="t('dataRule.loadFailed')"
        :closable="false"
        class="mb-3"
        data-test="data-rule-load-error"
      >
        <template #default>
          <el-button link type="primary" @click="load()">{{ t('common.retry') }}</el-button>
        </template>
      </el-alert>

      <el-table :data="rows" border stripe max-height="560" v-loading="loading">
        <el-table-column prop="ruleId" label="ID" width="80" align="center" />
        <el-table-column prop="ruleName" :label="t('dataRule.name')" min-width="150" />
        <el-table-column prop="tableName" :label="t('dataRule.table')" min-width="140" />
        <el-table-column prop="fieldName" :label="t('dataRule.field')" min-width="130" />
        <el-table-column :label="t('dataRule.op')" width="80" align="center">
          <template #default="scope">
            <el-tag size="small">{{ scope.row.op }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="valueType" :label="t('dataRule.valueType')" width="170" />
        <el-table-column prop="ruleValue" :label="t('dataRule.value')" min-width="120" show-overflow-tooltip />
        <el-table-column :label="t('dataRule.status')" width="90" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.status === '0' ? 'success' : 'info'" size="small">
              {{ scope.row.status === '0' ? t('common.enabled') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" width="150" align="center">
          <template #default="scope">
            <el-button v-hasPermi="['system:dataRule:edit']" link type="primary" @click="openEdit(scope.row)">
              {{ t('common.edit') }}
            </el-button>
            <el-button v-hasPermi="['system:dataRule:remove']" link type="danger" @click="removeRule(scope.row.ruleId)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :page-size="size"
        :total="total"
        layout="total, prev, pager, next"
        class="mt-3 justify-end"
        @current-change="load"
      />
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="form.ruleId ? t('common.edit') : t('common.add')"
      width="min(90%, 560px)"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
      :before-close="beforeClose"
    >
      <el-form :model="form" label-width="110px">
        <el-form-item :label="t('dataRule.name')">
          <el-input v-model="form.ruleName" maxlength="64" />
        </el-form-item>
        <el-form-item :label="t('dataRule.table')">
          <el-input v-model="form.tableName" placeholder="sys_user" />
        </el-form-item>
        <el-form-item :label="t('dataRule.field')">
          <el-input v-model="form.fieldName" placeholder="create_by" />
        </el-form-item>
        <el-form-item :label="t('dataRule.op')">
          <el-select v-model="form.op" class="w-full">
            <el-option v-for="op in ops" :key="op" :value="op" :label="op" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('dataRule.valueType')">
          <el-select v-model="form.valueType" class="w-full">
            <el-option v-for="vt in valueTypes" :key="vt" :value="vt" :label="vt" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.valueType === 'fixed'" :label="t('dataRule.value')">
          <el-input v-model="form.ruleValue" />
        </el-form-item>
        <el-form-item :label="t('dataRule.role')">
          <el-select
            v-model="form.roleIds"
            multiple
            class="w-full"
            :placeholder="t('dataRule.ph.roles')"
            :aria-label="t('dataRule.ph.roles')"
          >
            <el-option v-for="r in roles" :key="r.roleId" :value="r.roleId" :label="r.roleName" />
          </el-select>
          <!-- 读失败 ≠ 没有角色（b142）：原实现只写 DEV console，下拉空白且无重试 -->
          <div
            v-if="rolesLoadFailed"
            class="mt-1 flex items-center gap-2 text-xs text-[var(--el-color-danger)]"
            role="alert"
          >
            <span>{{ t('dataRule.rolesLoadFailed') }}</span>
            <el-button link type="primary" size="small" :loading="rolesLoading" @click="loadRoles">
              {{ t('common.retry') }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('dataRule.status')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitRule">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="DataRule">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { confirmAction } from '@/utils/confirm'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'

interface DataRuleRow {
  ruleId: number
  ruleName: string
  tableName: string
  fieldName: string
  op: string
  valueType: string
  ruleValue?: string
  status: string
  /** 已绑定角色 ID 集（列表接口返回，编辑回显用） */
  roleIds?: number[]
}

interface RoleOption {
  roleId: number
  roleName: string
}

const { t } = useI18n()
const rows = ref<DataRuleRow[]>([])
const loading = ref(false)
const saving = ref(false)
/** 列表加载失败时不得与"没有规则"同形（表格空态会静默承担后者）。 */
const loadError = ref(false)
const page = ref(1)
const size = 20
const total = ref(0)
const ops = ['eq', 'ne', 'like', 'gt', 'lt', 'ge', 'le', 'in']
const valueTypes = ['fixed', 'current_user', 'current_dept', 'current_dept_children', 'current_tenant']
const roles = ref<RoleOption[]>([])
/** 角色下拉读取失败（与"没有角色"是两个事实：失败时下拉空白但可重试） */
const rolesLoadFailed = ref(false)
const rolesLoading = ref(false)

const dialogVisible = ref(false)
const form = reactive({
  ruleId: undefined as number | undefined,
  ruleName: '',
  tableName: '',
  fieldName: '',
  op: 'eq',
  valueType: 'fixed',
  ruleValue: '',
  roleIds: [] as number[],
  enabled: true
})

/** 关闭语义（b135）：填一半按 Esc / 点遮罩原先会静默丢弃 */
const { beforeClose, cancel } = useDialogDirtyGuard(dialogVisible, form)

async function load(p?: number) {
  if (p) page.value = p
  loading.value = true
  loadError.value = false
  try {
    const res = (await request({
      url: '/system/dataRule/list',
      method: 'get',
      params: { page: page.value, size }
    })) as unknown as { rows?: DataRuleRow[]; total?: number }
    rows.value = res.rows ?? []
    total.value = res.total ?? 0
    // 删掉末页最后一条后回到上一页（与 useCrudTable 页面同口径）：只有"有数据但本页为空"才回退
    const nextPage = pageAfterEmptyResult(page.value, rows.value.length, total.value)
    if (nextPage !== page.value) {
      page.value = nextPage
      await load()
    }
  } catch (e) {
    loadError.value = true
    if (import.meta.env.DEV) console.error('[dataRule] load failed:', e)
  } finally {
    loading.value = false
  }
}

async function loadRoles() {
  rolesLoading.value = true
  rolesLoadFailed.value = false
  try {
    const res = (await request({
      url: '/system/role/optionselect',
      method: 'get'
    })) as unknown as { data?: RoleOption[] }
    roles.value = res.data ?? []
  } catch (e) {
    // 读失败必须可见：下拉空白会让用户以为"系统里没有角色"，且无法调整绑定
    rolesLoadFailed.value = true
    if (import.meta.env.DEV) console.error('[dataRule] loadRoles failed:', e)
  } finally {
    rolesLoading.value = false
  }
}

function openCreate() {
  form.ruleId = undefined
  form.ruleName = ''
  form.tableName = ''
  form.fieldName = ''
  form.op = 'eq'
  form.valueType = 'fixed'
  form.ruleValue = ''
  form.roleIds = []
  form.enabled = true
  dialogVisible.value = true
}

function openEdit(row: DataRuleRow) {
  form.ruleId = row.ruleId
  form.ruleName = row.ruleName
  form.tableName = row.tableName
  form.fieldName = row.fieldName
  form.op = row.op
  form.valueType = row.valueType
  form.ruleValue = row.ruleValue ?? ''
  form.enabled = row.status === '0'
  // 回显已绑定角色（列表接口带 roleIds）。此前恒置空 → 编辑弹窗不显示现有绑定，
  // 管理员改动即触发后端 upsert 全量覆盖、静默清除未勾选的原绑定。
  form.roleIds = [...(row.roleIds ?? [])]
  dialogVisible.value = true
}

async function submitRule() {
  saving.value = true
  try {
    await request({
      url: '/system/dataRule',
      method: 'post',
      data: {
        ruleId: form.ruleId,
        ruleName: form.ruleName,
        tableName: form.tableName,
        fieldName: form.fieldName,
        op: form.op,
        valueType: form.valueType,
        ruleValue: form.ruleValue || undefined,
        status: form.enabled ? '0' : '1',
        roleIds: form.roleIds.length > 0 ? form.roleIds : undefined
      }
    })
    ElMessage.success(t('common.success'))
    dialogVisible.value = false
    load(page.value)
  } catch (e) {
    if (import.meta.env.DEV) console.error('[dataRule] submit failed:', e)
  } finally {
    saving.value = false
  }
}

async function removeRule(id: number) {
  // 取消不是错误：confirmAction 把 rejected 折叠成 false，DEV 日志里也不再出现
  // "删除失败"；接口失败由拦截器提示，页面保留现状。
  if (!(await confirmAction(t('dataRule.ph.confirmRemove')))) return
  try {
    await request({ url: `/system/dataRule/${id}`, method: 'delete' })
    ElMessage.success(t('common.success'))
    await load(page.value)
  } catch (e) {
    if (import.meta.env.DEV) console.error('[dataRule] remove failed:', e)
  }
}

onMounted(() => {
  load(1)
  loadRoles()
})
</script>
