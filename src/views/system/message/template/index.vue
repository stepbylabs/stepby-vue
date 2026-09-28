<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('msg.template.search.templateName')" prop="templateName">
          <el-input
            v-model="queryParams.templateName"
            :placeholder="t('msg.template.search.phTemplateName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('msg.template.search.templateCode')" prop="templateCode">
          <el-input
            v-model="queryParams.templateCode"
            :placeholder="t('msg.template.search.phTemplateCode')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('msg.template.search.phStatus')"
            clearable
            class="w-[140px]"
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:msg:template:add']">
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
          v-hasPermi="['system:msg:template:edit']"
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
          v-hasPermi="['system:msg:template:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysMsgTemplate) => row.templateId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        :label="t('msg.template.column.templateName')"
        align="center"
        prop="templateName"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('msg.template.column.templateCode')"
        align="center"
        prop="templateCode"
        min-width="130"
        show-overflow-tooltip
      />
      <el-table-column :label="t('msg.template.column.channelCode')" align="center" prop="channelCode" width="110">
        <template #default="scope">
          <dict-tag :options="channelTypeOptions" :value="scope.row.channelCode" />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('msg.template.column.templateSubject')"
        align="center"
        prop="templateSubject"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.column.status')" align="center" prop="status" width="90">
        <template #default="scope">
          <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.column.createTime')" align="center" prop="createTime" width="170" />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="150"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['system:msg:template:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:msg:template:remove']"
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

    <!-- 添加或修改消息模板对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(92%, 720px)" append-to-body destroy-on-close>
      <el-form ref="templateRef" :model="form" :rules="rules" label-width="80px" class="template-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item :label="t('msg.template.form.templateName')" prop="templateName">
              <el-input
                v-model.trim="form.templateName"
                :placeholder="t('msg.template.search.phTemplateName')"
                :maxlength="64"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('msg.template.form.templateCode')" prop="templateCode">
              <el-input
                v-model.trim="form.templateCode"
                :placeholder="t('msg.template.search.phTemplateCode')"
                :maxlength="64"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('msg.template.form.channelCode')" prop="channelCode">
              <el-select v-model="form.channelCode" :placeholder="t('common.form.selectPlaceholder')" clearable>
                <el-option
                  v-for="dict in channelTypeOptions"
                  :key="dict.value"
                  :label="dict.label"
                  :value="dict.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('msg.template.form.status')">
              <el-switch
                v-model="form.status"
                active-value="0"
                inactive-value="1"
                :active-text="t('msg.template.form.statusNormal')"
                :inactive-text="t('msg.template.form.statusDisabled')"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('msg.template.form.templateSubject')" prop="templateSubject">
          <el-input
            v-model.trim="form.templateSubject"
            :placeholder="t('msg.template.form.phTemplateSubject')"
            :maxlength="200"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('msg.template.form.templateContent')" prop="templateContent">
          <el-input
            v-model="form.templateContent"
            type="textarea"
            :rows="6"
            :placeholder="t('msg.template.form.phTemplateContent')"
          />
        </el-form-item>

        <!-- 变量插入与预览 -->
        <el-form-item :label="t('msg.template.var.label')">
          <div class="w-full">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="text-text-secondary">{{ t('msg.template.var.hint') }}</span>
              <el-tag v-for="v in varList" :key="v" class="cursor-pointer" effect="plain" @click="insertVar(v)">
                {{ '{' }}{{ '{' }}{{ v }}{{ '}' }}{{ '}' }}
              </el-tag>
            </div>
            <div class="rounded border border-dashed border-text-divider p-2">
              <div class="mb-1 text-xs text-text-secondary">
                {{ t('msg.template.var.previewSubject') }}
              </div>
              <div class="rounded bg-bg-tertiary px-2 py-1 text-sm">{{ previewSubject }}</div>
              <div class="mb-1 mt-2 text-xs text-text-secondary">
                {{ t('msg.template.var.previewContent') }}
              </div>
              <div class="whitespace-pre-wrap rounded bg-bg-tertiary px-2 py-1 text-sm">{{ previewContent }}</div>
            </div>
          </div>
        </el-form-item>

        <el-form-item :label="t('msg.template.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            :placeholder="t('msg.template.form.phRemark')"
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
  </div>
</template>

<script setup lang="ts" name="MsgTemplate">
import { listTemplate, getTemplate, delTemplate, addTemplate, updateTemplate } from '@/api/system/msg'
import type { SysMsgTemplate, TemplateQueryParams } from '@/types/api/system/msg'
import { useCrudTable } from '@/composables/useCrudTable'

const { t } = useI18n()
const templateRefRef = useTemplateRef('templateRef')
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// 渠道类型选项（email/sms/site）
const channelTypeOptions = [
  { value: 'email', label: t('msg.channel.type.email') },
  { value: 'sms', label: t('msg.channel.type.sms') },
  { value: 'site', label: t('msg.channel.type.site') }
]

// 常用可插入变量
const varList = ['userName', 'nickName', 'email', 'phone', 'code', 'content']

// 变量预览示例值（渲染时替换）
const sampleVars: Record<string, string> = {
  userName: t('msg.template.var.sampleName'),
  nickName: t('msg.template.var.sampleName'),
  email: 'user@example.com',
  phone: '13800000000',
  code: '123456',
  content: t('msg.template.var.sampleContent')
}

/** 将模板文本中的 {{var}} 变量替换为示例值，用于预览 */
function renderPreview(text?: string): string {
  if (!text) return ''
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, name: string) => sampleVars[name.trim()] ?? `[${name.trim()}]`)
}

const previewSubject = computed(() => renderPreview(form.value.templateSubject))
const previewContent = computed(() => renderPreview(form.value.templateContent))

const data = reactive({
  form: {} as SysMsgTemplate,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    templateName: undefined,
    templateCode: undefined,
    status: undefined
  } as TemplateQueryParams,
  rules: {
    templateName: [{ required: true, message: t('msg.template.validate.templateNameRequired'), trigger: 'blur' }],
    templateCode: [{ required: true, message: t('msg.template.validate.templateCodeRequired'), trigger: 'blur' }],
    templateSubject: [{ required: true, message: t('msg.template.validate.templateSubjectRequired'), trigger: 'blur' }],
    templateContent: [{ required: true, message: t('msg.template.validate.templateContentRequired'), trigger: 'blur' }]
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
} = useCrudTable<SysMsgTemplate, TemplateQueryParams>({
  listApi: listTemplate,
  getApi: getTemplate,
  addApi: addTemplate,
  updateApi: updateTemplate,
  deleteApi: delTemplate,
  idField: 'templateId',
  defaultForm: () => ({
    templateId: undefined,
    templateName: undefined,
    templateCode: undefined,
    channelCode: 'email',
    templateSubject: undefined,
    templateContent: undefined,
    status: '0',
    remark: undefined
  }),
  titleKey: 'msg.template.title',
  deleteTipKey: 'msg.template.tip.confirmDelete',
  queryParams,
  form,
  formRef: templateRefRef,
  queryRef: queryRefRef
})

/** 点击变量标签插入占位到内容末尾 */
function insertVar(v: string) {
  const cur = form.value.templateContent ?? ''
  form.value.templateContent = cur + (cur ? ' ' : '') + `{{${v}}} `
}

getList()
</script>

<style lang="scss" scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
