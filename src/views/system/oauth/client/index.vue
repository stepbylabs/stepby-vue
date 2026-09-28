<template>
  <div class="app-container">
    <el-alert :title="t('sso.tip')" type="info" :closable="false" show-icon class="mb8" />

    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="80px">
        <el-form-item :label="t('sso.clientName')" prop="clientName">
          <el-input
            v-model.trim="queryParams.clientName"
            :placeholder="t('common.form.inputPlaceholder') + t('sso.clientName')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('sso.clientId')" prop="clientId">
          <el-input
            v-model.trim="queryParams.clientId"
            :placeholder="t('common.form.inputPlaceholder') + t('sso.clientId')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('sso.enabled')" prop="enabled">
          <el-select
            v-model="queryParams.enabled"
            :placeholder="t('common.form.selectPlaceholder')"
            clearable
            class="w-[140px]"
          >
            <el-option v-for="dict in sys_yes_no" :key="dict.value" :label="dict.label" :value="dict.value" />
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
        <el-button type="primary" plain icon="Plus" v-hasPermi="['system:oauth:client:add']" @click="handleAdd">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          v-hasPermi="['system:oauth:client:edit']"
          @click="handleUpdate"
        >
          {{ t('common.edit') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          v-hasPermi="['system:oauth:client:remove']"
          @click="handleDelete"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SsoClient) => row.ssoClientId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        :label="t('sso.clientName')"
        align="center"
        prop="clientName"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column :label="t('sso.clientId')" align="center" prop="clientId" min-width="160" show-overflow-tooltip>
        <template #default="scope">
          <code class="mono">{{ scope.row.clientId }}</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('sso.scopes')" align="center" min-width="180">
        <template #default="scope">
          <el-tag v-for="s in scopesOf(scope.row)" :key="s" size="small" class="scope-tag">{{ s }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('sso.grantTypes')" align="center" min-width="160">
        <template #default="scope">
          <el-tag v-for="g in grantsOf(scope.row)" :key="g" size="small" type="info" class="scope-tag">
            {{ g }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('sso.consentRequired')" align="center" width="110">
        <template #default="scope">
          <dict-tag :options="sys_yes_no" :value="scope.row.consentRequired" />
        </template>
      </el-table-column>
      <el-table-column :label="t('sso.enabled')" align="center" width="90" v-hasPermi="['system:oauth:client:toggle']">
        <template #default="scope">
          <el-switch
            :model-value="scope.row.enabled === '1'"
            :disabled="toggleLoading !== 0 && toggleLoading !== scope.row.ssoClientId"
            @change="(val: string | number | boolean) => handleToggle(scope.row, val)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('sso.redirectUris')" align="center" min-width="200" show-overflow-tooltip>
        <template #default="scope">
          <span class="mono">{{ (scope.row.redirectUris || []).join(', ') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('sso.createTime')" align="center" prop="createTime" width="170">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="260"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Edit"
            v-hasPermi="['system:oauth:client:edit']"
            @click="handleUpdate(scope.row)"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Key"
            v-hasPermi="['system:oauth:client:edit']"
            :loading="rotateLoading === scope.row.ssoClientId"
            @click="handleRotateSecret(scope.row)"
          >
            {{ t('sso.rotateSecret') }}
          </el-button>
          <el-button
            link
            type="warning"
            icon="Unlock"
            v-hasPermi="['system:oauth:client:edit']"
            @click="handleClearPrevSecret(scope.row)"
          >
            {{ t('sso.clearPrevSecret') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            v-hasPermi="['system:oauth:client:remove']"
            @click="handleDelete(scope.row)"
          >
            {{ t('common.delete') }}
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

    <!-- 新增 / 编辑客户端 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(94%, 720px)" append-to-body destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item :label="t('sso.clientName')" prop="clientName">
              <el-input
                v-model.trim="form.clientName"
                :maxlength="64"
                :placeholder="t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('sso.clientId')" prop="clientId">
              <el-input
                v-model.trim="form.clientId"
                :maxlength="64"
                :disabled="isEdit"
                :placeholder="isEdit ? '' : t('sso.clientIdAuto')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('sso.logoUri')" prop="logoUri">
              <el-input v-model.trim="form.logoUri" :maxlength="500" :placeholder="t('common.form.inputPlaceholder')" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('sso.redirectUris')" prop="redirectUris">
              <el-input v-model="redirectUrisText" type="textarea" :rows="3" :placeholder="t('sso.redirectUrisPh')" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('sso.scopes')" prop="scopes">
              <el-select
                v-model="form.scopes"
                multiple
                :placeholder="t('common.form.selectPlaceholder')"
                class="w-full"
              >
                <el-option v-for="s in scopeOptions" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('sso.grantTypes')" prop="grantTypes">
              <el-select
                v-model="form.grantTypes"
                multiple
                :placeholder="t('common.form.selectPlaceholder')"
                class="w-full"
              >
                <el-option v-for="g in grantOptions" :key="g" :label="g" :value="g" />
              </el-select>
              <div class="el-form-item__tip">{{ t('sso.grantTypesTip') }}</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <!-- v5-D2：ID Token 签名算法（新增默认 RS256；HS256 用对称密钥，互操作兼容） -->
            <el-form-item :label="t('sso.idTokenAlg')" prop="idTokenAlg">
              <el-select v-model="form.idTokenAlg" class="w-full">
                <el-option label="RS256" value="RS256" />
                <el-option label="HS256" value="HS256" />
              </el-select>
              <div class="el-form-item__tip">{{ t('sso.idTokenAlgTip') }}</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <!-- v5-D5：subject 标识类型（pairwise 切换会使已发令牌 sub 变化，RP 视为新用户） -->
            <el-form-item :label="t('sso.subjectType')" prop="subjectType">
              <el-select v-model="form.subjectType" class="w-full">
                <el-option label="public" value="public" />
                <el-option label="pairwise" value="pairwise" />
              </el-select>
              <div class="el-form-item__tip">{{ t('sso.subjectTypeTip') }}</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <!-- v5-D5：sector 聚合标识（pairwise 下同 sector 的多个 RP 获得相同 sub） -->
            <el-form-item :label="t('sso.sectorIdentifier')" prop="sectorIdentifierUri">
              <el-input
                v-model.trim="form.sectorIdentifierUri"
                :maxlength="255"
                placeholder="https://"
              />
              <div class="el-form-item__tip">{{ t('sso.sectorIdentifierTip') }}</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('sso.consentRequired')" prop="consentRequired">
              <el-radio-group v-model="form.consentRequired">
                <el-radio v-for="dict in sys_yes_no" :key="dict.value" :value="dict.value">{{ dict.label }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('sso.enabled')" prop="enabled">
              <el-radio-group v-model="form.enabled">
                <el-radio v-for="dict in sys_yes_no" :key="dict.value" :value="dict.value">{{ dict.label }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('sso.remark')" prop="remark">
              <el-input
                v-model.trim="form.remark"
                type="textarea"
                :maxlength="500"
                show-word-limit
                :placeholder="t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 一次性明文密钥展示对话框 -->
    <el-dialog
      v-model="revealVisible"
      :title="t('sso.secret.title')"
      width="min(94%, 600px)"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-alert :title="t('sso.secret.warning')" type="warning" :closable="false" show-icon class="mb15" />
      <el-descriptions :column="1" border>
        <el-descriptions-item :label="t('sso.clientId')">
          <div class="reveal-row">
            <code class="mono">{{ revealed.clientId }}</code>
            <el-button type="primary" link icon="DocumentCopy" @click="copy(revealed.clientId, t('sso.clientId'))" />
          </div>
        </el-descriptions-item>
        <el-descriptions-item :label="t('sso.clientSecret')">
          <div class="reveal-row">
            <code class="mono">{{ revealed.clientSecret }}</code>
            <el-button
              type="primary"
              link
              icon="DocumentCopy"
              @click="copy(revealed.clientSecret, t('sso.clientSecret'))"
            />
          </div>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button type="primary" @click="finishReveal">{{ t('sso.secret.done') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="SsoClient">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type { SsoClient, SsoClientForm, SsoClientQueryParams } from '@/types'
import { listSsoClients, getSsoClient, addSsoClient, updateSsoClient, delSsoClient, toggleSsoClient, rotateSsoClientSecret, clearSsoClientPrevSecret } from '@/api/sso'
import { useCrudTable } from '@/composables/useCrudTable'
import modal from '@/plugins/modal'

const { t } = useI18n()
const { sys_yes_no } = useDict('sys_yes_no')
const formRef = useTemplateRef<FormInstance>('formRef')
const queryRef = useTemplateRef<FormInstance>('queryRef')

const scopeOptions = ['openid', 'profile', 'email']
const grantOptions = ['authorization_code', 'refresh_token']

const data = reactive({
  form: {} as SsoClientForm,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    clientName: undefined,
    clientId: undefined,
    enabled: undefined
  } as SsoClientQueryParams
})
const { queryParams, form } = toRefs(data)

const isEdit = ref(false)

const rules = computed<FormRules>(() => ({
  clientName: [{ required: true, message: t('sso.rule.nameRequired'), trigger: 'blur' }],
  redirectUris: [{ required: true, type: 'array', min: 1, message: t('sso.rule.redirectRequired'), trigger: 'blur' }],
  scopes: [{ required: true, type: 'array', min: 1, message: t('sso.rule.scopeRequired'), trigger: 'change' }]
}))

/** 回调地址多行文本 <-> 数组 */
const redirectUrisText = computed({
  get: () => (form.value.redirectUris ?? []).join('\n'),
  set: (v: string) => {
    form.value.redirectUris = v
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
})

const {
  dataList,
  open,
  loading,
  showSearch,
  single,
  multiple,
  total,
  title,
  getList,
  beforeDialogClose,
  cancel,
  handleQuery,
  handleSelectionChange,
  handleDelete,
  handleAdd: _handleAdd,
  handleUpdate: _handleUpdate,
  resetQuery: _resetQuery
} = useCrudTable<SsoClientForm, SsoClientQueryParams>({
  listApi: (params) => listSsoClients(params as SsoClientQueryParams) as unknown as Promise<unknown>,
  getApi: (id) => getSsoClient(id) as unknown as Promise<{ data: SsoClientForm }>,
  addApi: (d) => addSsoClient(d),
  updateApi: (d) => updateSsoClient(d),
  deleteApi: delSsoClient,
  idField: 'ssoClientId',
  defaultForm: (): SsoClientForm => ({
    ssoClientId: 0,
    clientId: '',
    clientName: '',
    logoUri: '',
    redirectUris: [],
    scopes: ['openid'],
    grantTypes: ['authorization_code'],
    idTokenAlg: 'RS256',
    subjectType: 'public',
    sectorIdentifierUri: '',
    consentRequired: '1',
    enabled: '1',
    remark: ''
  }),
  titleKey: 'sso.title',
  deleteTipKey: 'sso.deleteTip',
  queryParams,
  form,
  formRef,
  queryRef
})

function scopesOf(row: SsoClient): string[] {
  return row.scopes || []
}
function grantsOf(row: SsoClient): string[] {
  return row.grantTypes || []
}

/** 新增：标记新增模式（clientId 可留空自动生成） */
function handleAdd(): void {
  isEdit.value = false
  _handleAdd()
}

/** 编辑：标记编辑模式（clientId 不可改） */
function handleUpdate(row?: SsoClient): void {
  isEdit.value = true
  _handleUpdate(row as unknown as SsoClientForm)
}

/** 重置查询条件 */
function resetQuery(): void {
  queryRef.value?.resetFields()
  _resetQuery()
}

// 一次性密钥：新增需捕获明文 clientSecret，故不使用 useCrudTable 的通用 submit
const submitLoading = ref(false)
const revealVisible = ref(false)
const revealed = ref<{ clientId: string; clientSecret: string }>({ clientId: '', clientSecret: '' })

function submitForm(): void {
  formRef.value?.validate((valid: boolean) => {
    if (!valid) return
    submitLoading.value = true
    if (isEdit.value) {
      updateSsoClient(form.value)
        .then(() => {
          modal.msgSuccess(t('common.editSuccess'))
          open.value = false
          getList()
        })
        .catch((e) => {
          if (import.meta.env.DEV) console.error('[sso] update:', e)
        })
        .finally(() => {
          submitLoading.value = false
        })
      return
    }
    addSsoClient(form.value)
      .then((res) => {
        revealed.value = {
          clientId: res.data?.clientId ?? form.value.clientId ?? '',
          clientSecret: res.data?.clientSecret ?? ''
        }
        revealVisible.value = true
        open.value = false
        getList()
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.error('[sso] add:', e)
      })
      .finally(() => {
        submitLoading.value = false
      })
  })
}

function finishReveal(): void {
  revealVisible.value = false
  revealed.value = { clientId: '', clientSecret: '' }
}

function copy(text: string, label: string): void {
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
      .then(() => ElMessage.success(t('sso.secret.copied', { label })))
      .catch(() => {
        if (fallback()) ElMessage.success(t('sso.secret.copied', { label }))
        else ElMessage.error(t('sso.secret.copyFailed'))
      })
  } else if (fallback()) {
    ElMessage.success(t('sso.secret.copied', { label }))
  } else {
    ElMessage.error(t('sso.secret.copyFailed'))
  }
}

const toggleLoading = ref(0)
function handleToggle(row: SsoClient, val: string | number | boolean): void {
  const enabled = val ? '1' : '0'
  toggleLoading.value = row.ssoClientId
  toggleSsoClient(row.ssoClientId, enabled)
    .then(() => {
      row.enabled = enabled
      modal.msgSuccess(t('common.operationSuccess'))
    })
    .catch(() => {})
    .finally(() => {
      toggleLoading.value = 0
    })
}

// ==================== SSO D9：client_secret 零停机轮换 ====================

const rotateLoading = ref(0)

// 轮换密钥：新密钥立即生效，旧密钥进入"双密钥读取期"（RP 换配期间不断服）。
// 复用新增流程的"一次性明文"弹窗（revealed + revealVisible），避免第二套展示组件。
async function handleRotateSecret(row: SsoClient): Promise<void> {
  try {
    await modal.confirm(t('sso.rotateTip', { client: row.clientName }))
  } catch {
    // 用户取消：不执行
    return
  }
  rotateLoading.value = row.ssoClientId
  try {
    const res = await rotateSsoClientSecret(row.ssoClientId)
    const data = res.data
    if (!data?.clientSecret) {
      modal.msgError(t('sso.secret.copyFailed'))
      return
    }
    // 展示一次性明文（与新增一致：关闭后无法再次查看）
    revealed.value = { clientId: data.clientId, clientSecret: data.clientSecret }
    revealVisible.value = true
    modal.msgSuccess(t('sso.rotateDone'))
  } catch (e) {
    if (import.meta.env.DEV) console.error('[sso] rotate secret:', e)
  } finally {
    rotateLoading.value = 0
  }
}

// 结束双密钥读取期：旧密钥立即失效（幂等）。
async function handleClearPrevSecret(row: SsoClient): Promise<void> {
  try {
    await modal.confirm(t('sso.clearPrevTip', { client: row.clientName }))
  } catch {
    return
  }
  try {
    await clearSsoClientPrevSecret(row.ssoClientId)
    modal.msgSuccess(t('sso.clearDone'))
  } catch (e) {
    if (import.meta.env.DEV) console.error('[sso] clear previous secret:', e)
  }
}

getList()
</script>

<style lang="scss" scoped>
.mono {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  word-break: break-all;
}
.scope-tag {
  margin: 2px 4px 2px 0;
}
.reveal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
</style>
