<template>
  <div class="app-container p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('dataRule.title') }}</span>
          <el-button
            v-hasPermi="['system:dataRule:add']"
            type="primary"
            icon="Plus"
            @click="openCreate"
          >
            {{ t('common.add') }}
          </el-button>
        </div>
      </template>

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
            <el-button
              v-hasPermi="['system:dataRule:edit']"
              link
              type="primary"
              @click="openEdit(scope.row)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-hasPermi="['system:dataRule:remove']"
              link
              type="danger"
              @click="removeRule(scope.row.ruleId)"
            >
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

    <el-dialog v-model="dialogVisible" :title="form.ruleId ? t('common.edit') : t('common.add')" width="560px">
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
          <el-select v-model="form.roleIds" multiple class="w-full" :placeholder="t('dataRule.ph.roles')">
            <el-option v-for="r in roles" :key="r.roleId" :value="r.roleId" :label="r.roleName" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('dataRule.status')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
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
import { ElMessageBox, ElMessage } from 'element-plus'
import request from '@/utils/request'

interface DataRuleRow {
  ruleId: number
  ruleName: string
  tableName: string
  fieldName: string
  op: string
  valueType: string
  ruleValue?: string
  status: string
}

interface RoleOption {
  roleId: number
  roleName: string
}

const { t } = useI18n()
const rows = ref<DataRuleRow[]>([])
const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const size = 20
const total = ref(0)
const ops = ['eq', 'ne', 'like', 'gt', 'lt', 'ge', 'le', 'in']
const valueTypes = ['fixed', 'current_user', 'current_dept', 'current_dept_children', 'current_tenant']
const roles = ref<RoleOption[]>([])

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

async function load(p?: number) {
  if (p) page.value = p
  loading.value = true
  try {
    const res = (await request({
      url: '/system/dataRule/list',
      method: 'get',
      params: { page: page.value, size }
    })) as unknown as { rows?: DataRuleRow[]; total?: number }
    rows.value = res.rows ?? []
    total.value = res.total ?? 0
  } catch (e) {
    if (import.meta.env.DEV) console.error('[dataRule] load failed:', e)
  } finally {
    loading.value = false
  }
}

async function loadRoles() {
  try {
    const res = (await request({
      url: '/system/role/optionselect',
      method: 'get'
    })) as unknown as { data?: RoleOption[] }
    roles.value = res.data ?? []
  } catch (e) {
    if (import.meta.env.DEV) console.error('[dataRule] loadRoles failed:', e)
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
  form.roleIds = []
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
  try {
    await ElMessageBox.confirm(t('dataRule.ph.confirmRemove'), t('common.confirm'))
    await request({ url: `/system/dataRule/${id}`, method: 'delete' })
    ElMessage.success(t('common.success'))
    load(page.value)
  } catch (e) {
    if (import.meta.env.DEV) console.error('[dataRule] remove failed:', e)
  }
}

onMounted(() => {
  load(1)
  loadRoles()
})
</script>
