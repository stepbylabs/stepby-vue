<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center justify-between">
        <span>
          <el-icon><Key /></el-icon>
          {{ t('pat.title') }}
        </span>
        <el-button type="primary" icon="Plus" @click="openCreate">
          {{ t('pat.btn.create') }}
        </el-button>
      </div>
    </template>

    <el-alert :title="t('pat.tip')" type="info" :closable="false" show-icon class="mb15" />

    <el-table v-loading="loading" :data="tokenList" :row-key="(row: SysPat) => row.patId">
      <el-table-column :label="t('pat.column.name')" prop="name" min-width="120" show-overflow-tooltip />
      <el-table-column :label="t('pat.column.token')" prop="tokenPrefix" width="130">
        <template #default="scope">
          <code class="token-prefix">{{ scope.row.tokenPrefix }}…</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.scopes')" min-width="200">
        <template #default="scope">
          <el-tag
            v-for="s in displayScopes(scope.row.scopes)"
            :key="s"
            size="small"
            class="scope-tag"
            :type="s === '*:*:*' ? 'danger' : 'info'"
          >
            {{ scopeLabel(s) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.status')" width="90" align="center">
        <template #default="scope">
          <el-tag v-if="isRevoked(scope.row.status)" type="info" size="small">{{ t('pat.status.revoked') }}</el-tag>
          <el-tag v-else type="success" size="small">{{ t('pat.status.active') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.expiresAt')" width="140" align="center">
        <template #default="scope">
          <el-tag v-if="!isRevoked(scope.row.status)" :type="expiryTagType(expiryInfo(scope.row).status)" size="small">
            {{ expiryText(scope.row) }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.lastUsedAt')" width="170" align="center">
        <template #default="scope">
          <span>{{ scope.row.lastUsedAt ? parseTime(scope.row.lastUsedAt) : t('pat.neverUsed') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.createTime')" width="170" align="center">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('pat.column.operation')"
        width="90"
        align="center"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            v-if="!isRevoked(scope.row.status)"
            link
            type="danger"
            icon="Delete"
            @click="handleRevoke(scope.row)"
          >
            {{ t('pat.btn.revoke') }}
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('common.empty')" />
      </template>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 新建令牌对话框 -->
    <el-dialog v-model="createVisible" :title="t('pat.create.title')" width="560px" append-to-body>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item :label="t('pat.form.name')" prop="name">
          <el-input v-model="form.name" :placeholder="t('pat.form.namePh')" :maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('pat.form.scopes')" prop="scopes">
          <el-select v-model="form.scopes" multiple filterable :placeholder="t('pat.form.scopesPh')" class="w-full">
            <el-option v-for="opt in scopeOptions" :key="opt" :label="scopeLabel(opt)" :value="opt" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pat.form.expireDays')" prop="expireDays">
          <el-input-number v-model="form.expireDays" :min="0" :max="3650" controls-position="right" />
          <span class="form-tip">{{ t('pat.form.expireDaysTip') }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 一次性明文令牌展示对话框 -->
    <el-dialog
      v-model="revealVisible"
      :title="t('pat.token.title')"
      width="560px"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-alert :title="t('pat.token.warning')" type="warning" :closable="false" show-icon class="mb15" />
      <div class="token-reveal">
        <code class="token-plain">{{ plainToken }}</code>
        <el-button type="primary" link icon="DocumentCopy" @click="copyToken">{{ t('pat.btn.copy') }}</el-button>
      </div>
      <template #footer>
        <el-button type="primary" @click="finishReveal">{{ t('pat.btn.done') }}</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts" name="PatToken">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { listMyTokens, getScopeOptions, createToken, revokeMyToken } from '@/api/system/patToken'
import type { SysPat } from '@/types/api/monitor/pat'
import { isRevoked, computeExpiryInfo, expiryTagType, summarizeScopes, type ExpiryStatus } from '@/utils/patUtils'

const { t } = useI18n()

const loading = ref(false)
const tokenList = ref<SysPat[]>([])
const total = ref(0)
const queryParams = reactive({ pageNum: 1, pageSize: 10 })

const scopeOptions = ref<string[]>([])

const createVisible = ref(false)
const creating = ref(false)
const formRef = useTemplateRef<FormInstance>('formRef')
const form = reactive<{ name: string; scopes: string[]; expireDays: number }>({
  name: '',
  scopes: [],
  expireDays: 90
})
const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('pat.rule.nameRequired'), trigger: 'blur' }],
  scopes: [{ required: true, type: 'array', min: 1, message: t('pat.rule.scopesRequired'), trigger: 'change' }]
}))

const revealVisible = ref(false)
const plainToken = ref('')

function getList(): void {
  loading.value = true
  listMyTokens(queryParams)
    .then((res) => {
      tokenList.value = res.rows || []
      total.value = res.total || 0
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

function loadScopes(): void {
  getScopeOptions()
    .then((res) => {
      scopeOptions.value = res.data || []
    })
    .catch(() => {})
}

function scopeLabel(scope: string): string {
  return scope === '*:*:*' ? t('pat.scopeAll') : scope
}
function displayScopes(scopes: string[]): string[] {
  return summarizeScopes(scopes || []).list
}
function expiryInfo(row: SysPat): { status: ExpiryStatus; days: number | null } {
  return computeExpiryInfo(row.expiresAt)
}
function expiryText(row: SysPat): string {
  const { status, days } = expiryInfo(row)
  if (status === 'never') return t('pat.expiry.never')
  if (status === 'expired') return t('pat.expiry.expired')
  if (status === 'soon') return t('pat.expiry.soon', { days })
  return t('pat.expiry.active', { days })
}

function openCreate(): void {
  form.name = ''
  form.scopes = []
  form.expireDays = 90
  formRef.value?.clearValidate()
  loadScopes()
  createVisible.value = true
}

function submitCreate(): void {
  formRef.value?.validate((valid: boolean) => {
    if (!valid) return
    creating.value = true
    createToken({ name: form.name.trim(), scopes: form.scopes, expireDays: form.expireDays })
      .then((res) => {
        plainToken.value = res.data?.token || ''
        revealVisible.value = true
        getList()
      })
      .catch(() => {})
      .finally(() => {
        creating.value = false
      })
  })
}

function copyToken(): void {
  const text = plainToken.value
  if (!text) return
  const fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(ta)
    return ok
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => ElMessage.success(t('pat.msg.copied')))
      .catch(() => {
        if (fallback()) ElMessage.success(t('pat.msg.copied'))
        else ElMessage.error(t('pat.msg.copyFailed'))
      })
  } else if (fallback()) {
    ElMessage.success(t('pat.msg.copied'))
  } else {
    ElMessage.error(t('pat.msg.copyFailed'))
  }
}

function finishReveal(): void {
  revealVisible.value = false
  plainToken.value = ''
}

function handleRevoke(row: SysPat): void {
  ElMessageBox.confirm(t('pat.msg.revokeConfirm', { name: row.name }), t('common.warning'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  })
    .then(() => revokeMyToken(row.patId))
    .then(() => {
      ElMessage.success(t('pat.msg.revoked'))
      getList()
    })
    .catch(() => {})
}

onMounted(getList)
</script>

<style lang="scss" scoped>
.token-prefix {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
}
.scope-tag {
  margin: 2px 4px 2px 0;
}
.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.token-reveal {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.token-plain {
  flex: 1;
  font-family: var(--el-font-family-mono, monospace);
  font-size: 13px;
  word-break: break-all;
}
</style>
