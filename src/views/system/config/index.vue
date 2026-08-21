<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('config.search.configName')" prop="configName">
          <el-input
            v-model="queryParams.configName"
            :placeholder="t('config.search.phConfigName')"
            :maxlength="100"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('config.search.configKey')" prop="configKey">
          <el-input
            v-model="queryParams.configKey"
            :placeholder="t('config.search.phConfigKey')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('config.search.configType')" prop="configType">
          <el-select
            v-model="queryParams.configType"
            :placeholder="t('config.search.phConfigType')"
            clearable
            class="w-[240px]"
          >
            <el-option v-for="dict in sys_yes_no" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('config.search.createTime')" class="w-[308px]">
          <el-date-picker
            v-model="dateRange"
            value-format="YYYY-MM-DD"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('common.form.startDate')"
            :end-placeholder="t('common.form.endDate')"
          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:config:add']">
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
          v-hasPermi="['system:config:edit']"
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
          v-hasPermi="['system:config:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:config:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="danger" plain icon="Refresh" @click="handleRefreshCache" v-hasPermi="['system:config:remove']">
          {{ t('common.refresh') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <SkeletonTable v-if="loading" :columns="6" :rows="8" />
    <el-table
      v-else
      :data="dataList"
      :row-key="(row: SysConfig) => row.configId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('config.column.id')" align="center" prop="configId" width="80" />
      <el-table-column
        :label="t('config.column.configName')"
        align="center"
        prop="configName"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('config.column.configKey')"
        align="center"
        prop="configKey"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('config.column.configValue')"
        align="center"
        prop="configValue"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column :label="t('config.column.configType')" align="center" prop="configType" width="90">
        <template #default="scope">
          <dict-tag :options="sys_yes_no" :value="scope.row.configType" />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('config.column.remark')"
        align="center"
        prop="remark"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('config.column.createTime')" align="center" prop="createTime" width="180">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
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
            v-hasPermi="['system:config:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:config:remove']"
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

    <!-- 添加或修改参数配置对话框 -->
    <el-dialog :title="title" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close>
      <el-form ref="configRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('config.form.configName')" prop="configName">
          <el-input v-model.trim="form.configName" :placeholder="t('config.search.phConfigName')" />
        </el-form-item>
        <el-form-item :label="t('config.form.configKey')" prop="configKey">
          <el-input v-model.trim="form.configKey" :placeholder="t('config.search.phConfigKey')" />
        </el-form-item>
        <el-form-item :label="t('config.form.configValue')" prop="configValue">
          <el-input
            v-model="form.configValue"
            type="textarea"
            :placeholder="t('common.form.inputPlaceholder')"
            :maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('config.form.configType')" prop="configType">
          <el-radio-group v-model="form.configType">
            <el-radio v-for="dict in sys_yes_no" :key="dict.value" :value="dict.value">{{ dict.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('config.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :placeholder="t('common.form.inputPlaceholder')"
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

<script setup lang="ts" name="Config">
import type { SysConfig, ConfigQueryParams } from '@/types/api/system/config'
import {
  listConfig,
  getConfig,
  delConfig,
  addConfig,
  updateConfig,
  refreshCache,
  invalidateConfigCache
} from '@/api/system/config'
import { useCrudTable } from '@/composables/useCrudTable'
import { addDateRange } from '@/utils/yebot'
import modal from '@/plugins/modal'
import SkeletonTable from '@/components/SkeletonTable/index.vue'

const configRefRef = useTemplateRef('configRef')
const queryRefRef = useTemplateRef('queryRef')
const { t } = useI18n()
const { sys_yes_no } = useDict('sys_yes_no')

const dateRange = ref<string[]>([])

const data = reactive({
  form: {} as SysConfig,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    configName: undefined,
    configKey: undefined,
    configType: undefined
  } as ConfigQueryParams,
  rules: {
    configName: [{ required: true, message: t('config.validate.configNameRequired'), trigger: 'blur' }],
    configKey: [{ required: true, message: t('config.validate.configKeyRequired'), trigger: 'blur' }],
    configValue: [{ required: true, message: t('config.validate.configValueRequired'), trigger: 'blur' }]
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
  cancel,
  handleQuery,
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  submitForm,
  handleDelete,
  handleExport
} = useCrudTable<SysConfig, ConfigQueryParams>({
  listApi: (params) =>
    listConfig(addDateRange(params as Record<string, unknown>, dateRange.value) as ConfigQueryParams),
  getApi: getConfig,
  addApi: addConfig,
  updateApi: updateConfig,
  deleteApi: delConfig,
  idField: 'configId',
  exportUrl: '/system/config/export',
  defaultForm: () => ({
    configId: undefined,
    configName: undefined,
    configKey: undefined,
    configValue: undefined,
    configType: 'Y',
    remark: undefined
  }),
  titleKey: 'config.title',
  deleteTipKey: 'common.confirmDelete',
  queryParams,
  form,
  formRef: configRefRef,
  queryRef: queryRefRef,
  onAfterSubmit: () => {
    // P1 修复: 双层缓存失效
    // 1. invalidateConfigCache: 失效前端 cachedApi（getConfigKey 的 30s TTL 内存缓存）
    // 2. refreshCache: 失效后端 Redis 缓存（让其它节点/进程也拿到最新值）
    invalidateConfigCache()
    refreshCache().catch(() => {})
  },
  onAfterDelete: () => {
    invalidateConfigCache()
    refreshCache().catch(() => {})
  }
})

/** 重置按钮操作 - 覆盖以清空 dateRange */
function resetQuery() {
  dateRange.value = []
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 刷新缓存按钮操作 */
function handleRefreshCache() {
  // P1 修复: 同时失效前端内存缓存和后端 Redis 缓存
  invalidateConfigCache()
  refreshCache()
    .then(() => {
      modal.msgSuccess(t('common.refreshSuccess'))
    })
    .catch(() => {})
}

getList()
</script>
