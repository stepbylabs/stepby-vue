<template>
  <div class="app-container">
    <transition name="fade" enter-active-class="animate__animated animate__fadeInUp">
      <el-card v-if="showSearch" shadow="never" class="mb-2">
        <el-form :inline="true" :model="queryForm" @submit.prevent>
          <el-form-item :label="t('tenant.tenantName')">
            <el-input
              v-model.trim="queryForm.tenantName"
              :placeholder="t('common.inputText')"
              clearable
              style="width: 200px"
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleQuery">
              {{ t('common.search') }}
            </el-button>
            <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </transition>

    <el-card shadow="never">
      <template #header>
        <el-row :gutter="10" class="mb8">
          <el-col :span="1.5">
            <el-button
              v-hasPermi="['system:tenant:add']"
              type="primary"
              plain
              icon="Plus"
              @click="openAdd"
            >
              {{ t('common.add') }}
            </el-button>
          </el-col>
          <right-toolbar v-model:show-search="showSearch" @query-table="getList" />
        </el-row>
        <el-alert :title="t('tenant.modelTip')" type="info" :closable="false" class="mb-2" />
      </template>

      <el-table v-loading="loading" :data="tenantList">
        <el-table-column :label="t('tenant.tenantId')" prop="deptId" width="90" align="center" />
        <el-table-column
          :label="t('tenant.tenantName')"
          prop="tenantName"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column :label="t('tenant.leader')" prop="leader" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.leader || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('tenant.phone')" prop="phone" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('tenant.userCount')" prop="userCount" width="100" align="center" />
        <el-table-column :label="t('common.status')" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.status"
              active-value="0"
              inactive-value="1"
              :disabled="!hasEditPermi"
              @change="handleStatusChange(row)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.createTime')" prop="createTime" width="170" align="center">
          <template #default="{ row }">
            {{ (row.createTime || '').replace('T', ' ').slice(0, 19) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" width="150" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-hasPermi="['system:tenant:edit']"
              link
              type="primary"
              icon="Edit"
              @click="openEdit(row)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-hasPermi="['system:tenant:remove']"
              link
              type="danger"
              icon="Delete"
              @click="handleDelete(row)"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="formVisible" :title="formTitle" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
        <el-form-item :label="t('tenant.tenantName')" prop="tenantName">
          <el-input v-model.trim="form.tenantName" :placeholder="t('common.inputText')" maxlength="30" />
        </el-form-item>
        <el-form-item :label="t('tenant.leader')" prop="leader">
          <el-input v-model.trim="form.leader" :placeholder="t('common.inputText')" maxlength="20" />
        </el-form-item>
        <el-form-item :label="t('tenant.phone')" prop="phone">
          <el-input v-model.trim="form.phone" :placeholder="t('common.inputText')" maxlength="20" />
        </el-form-item>
        <el-form-item :label="t('tenant.email')" prop="email">
          <el-input v-model.trim="form.email" :placeholder="t('common.inputText')" maxlength="50" />
        </el-form-item>
        <el-form-item :label="t('common.column.sort')" prop="orderNum">
          <el-input-number v-model="form.orderNum" :min="0" :max="999" controls-position="right" />
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="t('common.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio value="0">{{ t('common.normal') }}</el-radio>
            <el-radio value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="saving" @click="saveForm">{{ t('common.save') }}</el-button>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { listTenant, getTenant, addTenant, updateTenant, changeTenantStatus, delTenant } from '@/api/system/tenant'
import type { TenantVo, TenantForm } from '@/api/system/tenant'
import type { ComponentInternalInstance } from 'vue'
import { checkPermi } from '@/utils/permission'

const { t } = useI18n()
const { proxy } = getCurrentInstance() as ComponentInternalInstance

const showSearch = ref(true)
const loading = ref(false)
const saving = ref(false)
const tenantList = ref<TenantVo[]>([])
const queryForm = reactive({ tenantName: '' })

const formVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const form = reactive<TenantForm>({
  tenantName: '',
  leader: '',
  phone: '',
  email: '',
  orderNum: 0,
  status: '0'
})

const rules = {
  tenantName: [{ required: true, message: () => t('tenant.nameRequired'), trigger: 'blur' }]
}

const formTitle = computed(() => (isEdit.value ? t('tenant.editTitle') : t('tenant.addTitle')))
const hasEditPermi = checkPermi(['system:tenant:edit'])

async function getList() {
  loading.value = true
  try {
    const res = await listTenant(queryForm)
    tenantList.value = res.data ?? []
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  getList()
}

function resetQuery() {
  queryForm.tenantName = ''
  handleQuery()
}

function openAdd() {
  isEdit.value = false
  editingId.value = null
  Object.assign(form, { tenantName: '', leader: '', phone: '', email: '', orderNum: 0, status: '0' })
  formVisible.value = true
}

async function openEdit(row: TenantVo) {
  isEdit.value = true
  editingId.value = row.deptId
  const res = await getTenant(row.deptId)
  const d = res.data
  Object.assign(form, {
    tenantName: d?.tenantName ?? '',
    leader: d?.leader ?? '',
    phone: d?.phone ?? '',
    email: d?.email ?? '',
    orderNum: d?.orderNum ?? 0
  })
  formVisible.value = true
}

async function saveForm() {
  await formRef.value?.validate()
  saving.value = true
  try {
    if (isEdit.value && editingId.value != null) {
      await updateTenant({ ...form, deptId: editingId.value })
    } else {
      await addTenant({ ...form })
    }
    proxy?.$modal.msgSuccess(t('common.success'))
    formVisible.value = false
    getList()
  } finally {
    saving.value = false
  }
}

async function handleStatusChange(row: TenantVo) {
  const next = row.status === '0' ? '0' : '1'
  const ok = await proxy?.$modal.confirm(
    row.status === '1' ? t('tenant.enableConfirm', [row.tenantName]) : t('tenant.disableConfirm', [row.tenantName])
  )
  if (!ok) {
    // 恢复原状态
    row.status = row.status === '0' ? '1' : '0'
    return
  }
  await changeTenantStatus(row.deptId, next)
  proxy?.$modal.msgSuccess(t('common.success'))
}

async function handleDelete(row: TenantVo) {
  const ok = await proxy?.$modal.confirm(t('tenant.deleteConfirm', [row.tenantName]))
  if (!ok) return
  await delTenant(row.deptId)
  proxy?.$modal.msgSuccess(t('common.success'))
  getList()
}

onMounted(getList)
</script>
