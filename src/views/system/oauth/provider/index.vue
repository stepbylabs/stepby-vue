<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="80px">
        <el-form-item :label="t('oauth.search.providerName')" prop="providerName">
          <el-input
            v-model.trim="queryParams.providerName"
            :placeholder="t('common.form.inputPlaceholder') + t('oauth.search.providerName')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('oauth.search.providerCode')" prop="providerCode">
          <el-input
            v-model.trim="queryParams.providerCode"
            :placeholder="t('common.form.inputPlaceholder') + t('oauth.search.providerCode')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('oauth.search.enabled')" prop="enabled">
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
        <el-button type="primary" plain icon="Plus" v-hasPermi="['system:oauth:provider:add']" @click="handleAdd">
          {{ t('oauth.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          v-hasPermi="['system:oauth:provider:edit']"
          @click="handleUpdate"
        >
          {{ t('oauth.edit') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          v-hasPermi="['system:oauth:provider:remove']"
          @click="handleDelete"
        >
          {{ t('oauth.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: OauthProvider) => row.providerId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('oauth.providerCode')" align="center" prop="providerCode" width="110" />
      <el-table-column
        :label="t('oauth.providerName')"
        align="center"
        prop="providerName"
        min-width="130"
        show-overflow-tooltip
      />
      <el-table-column :label="t('oauth.providerType')" align="center" prop="providerType" width="120">
        <template #default="scope">
          <el-tag>{{ typeLabel(scope.row.providerType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('oauth.clientId')"
        align="center"
        prop="clientId"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('oauth.redirectUri')"
        align="center"
        prop="redirectUri"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('oauth.ownership')" align="center" width="90">
        <template #default="scope">
          <el-tag :type="scope.row.tenantId === 0 ? 'warning' : 'primary'" disable-transitions>
            {{ scope.row.tenantId === 0 ? t('oauth.ownershipPlatform') : t('oauth.ownershipTenant') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('oauth.displayOrder')" align="center" prop="displayOrder" width="90" />
      <el-table-column :label="t('oauth.autoCreateUser')" align="center" prop="autoCreateUser" width="130">
        <template #default="scope">
          <dict-tag :options="sys_yes_no" :value="scope.row.autoCreateUser" />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('oauth.enabled')"
        align="center"
        width="90"
        v-hasPermi="['system:oauth:provider:toggle']"
      >
        <template #default="scope">
          <el-switch
            :model-value="scope.row.enabled === '1'"
            :disabled="toggleLoading !== scope.row.providerId"
            @change="(val: string | number | boolean) => handleToggle(scope.row, val)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('oauth.createTime')" align="center" prop="createTime" width="170">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('oauth.column.operation')"
        align="center"
        width="150"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Edit"
            v-hasPermi="['system:oauth:provider:edit']"
            @click="handleUpdate(scope.row)"
          >
            {{ t('oauth.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            v-hasPermi="['system:oauth:provider:remove']"
            @click="handleDelete(scope.row)"
          >
            {{ t('oauth.delete') }}
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

    <!-- 新增 / 编辑提供商 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(94%, 720px)" append-to-body destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="t('oauth.providerName')" prop="providerName">
              <el-input
                v-model.trim="form.providerName"
                :maxlength="64"
                :placeholder="t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('oauth.providerCode')" prop="providerCode">
              <el-input
                v-model.trim="form.providerCode"
                :maxlength="64"
                :disabled="form.providerId !== undefined && form.providerId !== null"
                :placeholder="'github / gitee / wecom / oidc'"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('oauth.providerType')" prop="providerType">
              <el-select v-model="form.providerType" :placeholder="t('common.form.selectPlaceholder')">
                <el-option v-for="(label, key) in typeOptions" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('oauth.clientId')" prop="clientId">
              <el-input
                v-model.trim="form.clientId"
                :maxlength="200"
                :placeholder="t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('oauth.clientSecret')" prop="clientSecret">
              <el-input
                v-model.trim="form.clientSecret"
                type="password"
                show-password
                :maxlength="400"
                :placeholder="isEdit ? t('oauth.tip.secretMasked') : t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('oauth.displayOrder')" prop="displayOrder">
              <el-input-number
                v-model="form.displayOrder"
                :min="0"
                :max="9999"
                controls-position="right"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.authorizeUrl')" prop="authorizeUrl">
              <el-input
                v-model.trim="form.authorizeUrl"
                :maxlength="500"
                :placeholder="t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.tokenUrl')" prop="tokenUrl">
              <el-input
                v-model.trim="form.tokenUrl"
                :maxlength="500"
                :placeholder="t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.userInfoUrl')" prop="userInfoUrl">
              <el-input
                v-model.trim="form.userInfoUrl"
                :maxlength="500"
                :placeholder="t('common.form.inputPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.redirectUri')" prop="redirectUri">
              <el-input
                v-model.trim="form.redirectUri"
                :maxlength="500"
                :placeholder="t('oauth.redirectUriPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.scope')" prop="scope">
              <el-input v-model.trim="form.scope" :maxlength="200" :placeholder="t('oauth.scopePlaceholder')" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.autoCreateUser')" prop="autoCreateUser">
              <el-radio-group v-model="form.autoCreateUser">
                <el-radio v-for="dict in sys_yes_no" :key="dict.value" :value="dict.value">{{ dict.label }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.enabled')" prop="enabled">
              <el-radio-group v-model="form.enabled">
                <el-radio v-for="dict in sys_yes_no" :key="dict.value" :value="dict.value">{{ dict.label }}</el-radio>
              </el-radio-group>
              <div class="el-form-item__tip">{{ t('oauth.status.enabledTip') }}</div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('oauth.remark')" prop="remark">
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
  </div>
</template>

<script setup lang="ts" name="OauthProvider">
import type { OauthProvider, OauthProviderQueryParams, OauthProviderForm } from '@/types/api/oauth'
import {
  listOauthProviders,
  getOauthProvider,
  addOauthProvider,
  updateOauthProvider,
  delOauthProvider,
  toggleOauthProvider
} from '@/api/oauth'
import { useCrudTable } from '@/composables/useCrudTable'
import modal from '@/plugins/modal'

const { t } = useI18n()
const { sys_yes_no } = useDict('sys_yes_no')
const formRef = useTemplateRef('formRef')
const queryRef = useTemplateRef('queryRef')

const typeOptions = computed<Record<string, string>>(() => ({
  github: t('oauth.type.github'),
  gitee: t('oauth.type.gitee'),
  wecom: t('oauth.type.wecom'),
  oidc: t('oauth.type.oidc')
}))

function typeLabel(type: string): string {
  return typeOptions.value[type] || type
}

const data = reactive({
  form: {} as OauthProviderForm,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    providerName: undefined,
    providerCode: undefined,
    providerType: undefined,
    enabled: undefined
  } as OauthProviderQueryParams
})
const { queryParams, form } = toRefs(data)

const isEdit = ref(false)

// clientSecret 仅在「新增」时必填；「编辑」时后端脱敏返回空串，留空表示不修改
const rules = computed(() => ({
  providerName: [{ required: true, message: t('oauth.tip.nameRequired'), trigger: 'blur' }],
  providerCode: [{ required: true, message: t('oauth.tip.codeRequired'), trigger: 'blur' }],
  providerType: [{ required: true, message: t('oauth.tip.typeRequired'), trigger: 'change' }],
  clientSecret: !isEdit.value ? [{ required: true, message: t('oauth.tip.secretRequired'), trigger: 'blur' }] : [],
  authorizeUrl: [
    { required: true, message: t('common.form.inputPlaceholder') + t('oauth.authorizeUrl'), trigger: 'blur' }
  ],
  tokenUrl: [{ required: true, message: t('common.form.inputPlaceholder') + t('oauth.tokenUrl'), trigger: 'blur' }],
  userInfoUrl: [
    { required: true, message: t('common.form.inputPlaceholder') + t('oauth.userInfoUrl'), trigger: 'blur' }
  ]
}))

const toggleLoading = ref(0)

const {
  dataList,
  open,
  loading,
  submitLoading,
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
  submitForm,
  handleAdd: _handleAdd,
  handleUpdate: _handleUpdate,
  resetQuery: _resetQuery
} = useCrudTable<OauthProviderForm, OauthProviderQueryParams>({
  listApi: (params) => listOauthProviders(params) as Promise<unknown>,
  getApi: (id) => getOauthProvider(id) as unknown as Promise<{ data: OauthProviderForm }>,
  addApi: addOauthProvider,
  updateApi: updateOauthProvider,
  deleteApi: delOauthProvider,
  idField: 'providerId',
  defaultForm: (): OauthProviderForm => ({
    providerId: undefined,
    providerCode: '',
    providerName: '',
    providerType: 'github',
    clientId: '',
    clientSecret: '',
    authorizeUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    scope: '',
    redirectUri: '',
    autoCreateUser: '0',
    enabled: '1',
    displayOrder: 0,
    remark: ''
  }),
  titleKey: 'oauth.title',
  deleteTipKey: 'common.confirmDelete',
  queryParams,
  form,
  formRef,
  queryRef
})

/** 新增：标记为新增模式（clientSecret 必填），打开弹窗 */
function handleAdd(): void {
  isEdit.value = false
  _handleAdd()
}

/** 编辑：标记为编辑模式（clientSecret 可留空），打开弹窗 */
function handleUpdate(row?: OauthProvider): void {
  isEdit.value = true
  _handleUpdate(row)
}

/** 重置按钮操作 - 清空查询条件 */
function resetQuery() {
  queryRef.value?.resetFields()
  _resetQuery()
}

/** 启停提供商 */
function handleToggle(row: OauthProvider, val: string | number | boolean): void {
  const enabled = val ? '1' : '0'
  toggleLoading.value = row.providerId
  toggleOauthProvider(row.providerId, enabled)
    .then(() => {
      row.enabled = enabled
      modal.msgSuccess(t('common.operationSuccess'))
    })
    .catch(() => {})
    .finally(() => {
      toggleLoading.value = 0
    })
}

getList()
</script>
