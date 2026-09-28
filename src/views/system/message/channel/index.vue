<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('msg.channel.search.channelName')" prop="channelName">
          <el-input
            v-model="queryParams.channelName"
            :placeholder="t('msg.channel.search.phChannelName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('msg.channel.search.phStatus')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="dict in sys_normal_disable" :key="dict.value" :label="dict.label" :value="dict.value" />
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:msg:channel:add']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['system:msg:channel:edit']"
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
          @click="handleDelete"
          v-hasPermi="['system:msg:channel:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysMsgChannel) => row.channelId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        :label="t('msg.channel.column.channelName')"
        align="center"
        prop="channelName"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column :label="t('msg.channel.column.channelCode')" align="center" prop="channelCode" width="120" />
      <el-table-column :label="t('msg.channel.column.channelType')" align="center" prop="channelType" width="110">
        <template #default="scope">
          <dict-tag :options="channelTypeOptions" :value="scope.row.channelType" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.column.status')" align="center" prop="status" width="90">
        <template #default="scope">
          <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('msg.channel.column.remark')"
        align="center"
        prop="remark"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.column.createTime')" align="center" prop="createTime" width="170" />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="170"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Promotion"
            @click="handleTest(scope.row)"
            v-hasPermi="['system:msg:channel:test']"
          >
            {{ t('msg.channel.btn.test') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['system:msg:channel:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:msg:channel:remove']"
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

    <!-- 添加或修改消息渠道对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(90%, 560px)" append-to-body destroy-on-close>
      <el-form ref="channelRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('msg.channel.form.channelName')" prop="channelName">
          <el-input
            v-model.trim="form.channelName"
            :placeholder="t('msg.channel.search.phChannelName')"
            :maxlength="64"
          />
        </el-form-item>
        <el-form-item :label="t('msg.channel.form.channelType')" prop="channelType">
          <el-select
            v-model="form.channelType"
            :placeholder="t('common.form.selectPlaceholder')"
            @change="onChannelTypeChange"
          >
            <el-option v-for="dict in channelTypeOptions" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('msg.channel.form.status')">
          <el-switch
            v-model="form.status"
            active-value="0"
            inactive-value="1"
            :active-text="t('msg.channel.form.statusNormal')"
            :inactive-text="t('msg.channel.form.statusDisabled')"
          />
        </el-form-item>
        <el-form-item v-if="form.channelType === 'email'" :label="t('msg.channel.form.configJson')" prop="configJson">
          <div class="w-full">
            <el-input
              v-model="form.configJson"
              type="textarea"
              :rows="5"
              :placeholder="t('msg.channel.form.phConfigJson')"
              :disabled="clearConfig"
              class="font-mono"
            />
            <div class="mt-1 text-xs text-text-secondary">{{ t('msg.channel.form.configSecretTip') }}</div>
          </div>
        </el-form-item>
        <el-form-item v-else :label="t('msg.channel.form.configJson')">
          <div class="w-full">
            <el-input
              v-model="form.configJson"
              type="textarea"
              :rows="5"
              :placeholder="t('msg.channel.form.phConfigGeneric')"
              :disabled="clearConfig"
              class="font-mono"
            />
            <div class="mt-1 text-xs text-text-secondary">{{ t('msg.channel.form.configSecretTip') }}</div>
          </div>
        </el-form-item>
        <!-- 显式清空（后端 `common::clear_fields`）：缺省「留空」= 保持现值（防误擦密钥），
             故「清空」必须显式声明，避免"清空了却没生效"的静默失败 -->
        <el-form-item v-if="form.channelId != null">
          <el-checkbox v-model="clearConfig">{{ t('msg.channel.form.clearConfig') }}</el-checkbox>
        </el-form-item>
        <el-form-item :label="t('msg.channel.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            :placeholder="t('msg.channel.form.phRemark')"
            :maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 渠道连通性测试对话框 -->
    <el-dialog
      :title="t('msg.channel.test.title')"
      v-model="testOpen"
      width="min(90%, 480px)"
      append-to-body
      destroy-on-close
    >
      <el-descriptions :column="1" border>
        <el-descriptions-item :label="t('msg.channel.form.channelName')">
          {{ testRow.channelName }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('msg.channel.column.channelCode')">
          {{ testRow.channelCode }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('msg.channel.column.channelType')">
          {{ testRow.channelType }}
        </el-descriptions-item>
      </el-descriptions>
      <div class="mt-3 text-xs text-text-secondary">{{ t('msg.channel.test.tip') }}</div>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="testLoading" @click="runTest">
            {{ t('msg.channel.test.start') }}
          </el-button>
          <el-button @click="testOpen = false">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="MsgChannel">
import { listChannel, getChannel, delChannel, addChannel, updateChannel, testChannel } from '@/api/system/msg'
import type { SysMsgChannel, ChannelQueryParams } from '@/types/api/system/msg'
import { useCrudTable } from '@/composables/useCrudTable'
import modal from '@/plugins/modal'

const { t } = useI18n()
const channelRefRef = useTemplateRef('channelRef')

/** 显式清空渠道配置（编辑态可选）：对应后端 `clearFields: ['configJson']` */
const clearConfig = ref(false)
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// 渠道类型选项（email/sms/site）
const channelTypeOptions = [
  { value: 'email', label: t('msg.channel.type.email') },
  { value: 'sms', label: t('msg.channel.type.sms') },
  { value: 'site', label: t('msg.channel.type.site') }
]

const data = reactive({
  form: {} as SysMsgChannel,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    channelName: undefined,
    status: undefined
  } as ChannelQueryParams,
  rules: {
    channelName: [{ required: true, message: t('msg.channel.validate.channelNameRequired'), trigger: 'blur' }],
    channelType: [{ required: true, message: t('msg.channel.validate.channelTypeRequired'), trigger: 'change' }]
  }
})

const { queryParams, form, rules } = toRefs(data)

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
  resetQuery,
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  submitForm,
  handleDelete
} = useCrudTable<SysMsgChannel, ChannelQueryParams>({
  listApi: listChannel,
  getApi: getChannel,
  addApi: addChannel,
  updateApi: updateChannel,
  deleteApi: delChannel,
  idField: 'channelId',
  defaultForm: () => ({
    channelId: undefined,
    channelName: undefined,
    channelCode: 'email',
    channelType: 'email',
    configJson: undefined,
    status: '0',
    remark: undefined
  }),
  titleKey: 'msg.channel.title',
  deleteTipKey: 'msg.channel.tip.confirmDelete',
  queryParams,
  form,
  formRef: channelRefRef,
  queryRef: queryRefRef,
  beforeSubmit: (payload) => {
    // 显式清空渠道配置：值必须同时置空（后端对「既给值又声明清空」返回 400）
    if (payload.channelId == null || !clearConfig.value) return payload
    const withClear: SysMsgChannel & { clearFields: string[] } = {
      ...payload,
      configJson: undefined,
      clearFields: ['configJson']
    }
    return withClear
  }
})

// 每次打开弹窗重置「清空配置」勾选，避免上一轮的选择残留导致误清
watch(open, (visible: boolean) => {
  if (visible) clearConfig.value = false
})

/** 渠道类型变化时同步渠道编码 */
function onChannelTypeChange() {
  form.value.channelCode = form.value.channelType
}

// ----- 渠道连通性测试 -----
const testOpen = ref(false)
const testLoading = ref(false)
const testRow = ref<SysMsgChannel>({})

/** 打开测试弹窗 */
function handleTest(row: SysMsgChannel) {
  testRow.value = row
  testOpen.value = true
}

/** 执行连通性测试 */
function runTest() {
  if (!testRow.value.channelId) return
  testLoading.value = true
  testChannel(testRow.value.channelId)
    .then(() => {
      modal.msgSuccess(t('msg.channel.testSuccess'))
      testOpen.value = false
    })
    .finally(() => {
      testLoading.value = false
    })
}

getList()
</script>

<style lang="scss" scoped>
.font-mono :deep(textarea),
.font-mono :deep(.el-textarea__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
</style>
