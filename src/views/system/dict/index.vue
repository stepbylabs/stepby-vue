<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('dict.search.dictName')" prop="dictName">
          <el-input
            v-model="queryParams.dictName"
            :placeholder="t('dict.search.phDictName')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('dict.search.dictType')" prop="dictType">
          <el-input
            v-model="queryParams.dictType"
            :placeholder="t('dict.search.phDictType')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('dict.search.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('dict.search.phStatus')" clearable class="w-[240px]">
            <el-option v-for="dict in sys_normal_disable" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('dict.search.createTime')" class="w-[308px]">
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:dict:add']">
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
          v-hasPermi="['system:dict:edit']"
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
          v-hasPermi="['system:dict:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:dict:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="danger" plain icon="Refresh" @click="handleRefreshCache" v-hasPermi="['system:dict:remove']">
          {{ t('common.refresh') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="9" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="dataList"
        :row-key="(row: SysDictType) => row.dictId"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('dict.column.id')" align="center" prop="dictId" width="80" />
        <el-table-column
          :label="t('dict.column.dictName')"
          align="center"
          prop="dictName"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column :label="t('dict.column.dictType')" align="center" min-width="160" show-overflow-tooltip>
          <template #default="scope">
            <el-link type="primary" underline="never" @click="handleViewData(scope.row)">
              {{ scope.row.dictType }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column :label="t('dict.column.status')" align="center" prop="status" width="90">
          <template #default="scope">
            <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column
          :label="t('dict.column.remark')"
          align="center"
          prop="remark"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column :label="t('dict.column.createTime')" align="center" prop="createTime" width="180">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.operation')"
          align="center"
          width="280"
          class-name="small-padding fixed-width"
        >
          <template #default="scope">
            <el-button
              link
              type="primary"
              icon="Edit"
              @click="handleUpdate(scope.row)"
              v-hasPermi="['system:dict:edit']"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              link
              type="primary"
              icon="Operation"
              @click="handleDataList(scope.row)"
              v-hasPermi="['system:dict:edit']"
            >
              {{ t('common.detail') }}
            </el-button>
            <el-button
              link
              type="primary"
              icon="Delete"
              @click="handleDelete(scope.row)"
              v-hasPermi="['system:dict:remove']"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="t('common.empty')" />
        </template>
      </el-table>
    </Transition>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加或修改字典对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close>
      <el-form ref="dictRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item :label="t('dict.form.dictName')" prop="dictName">
          <el-input v-model.trim="form.dictName" :placeholder="t('dict.search.phDictName')" />
        </el-form-item>
        <el-form-item prop="dictType">
          <el-input v-model.trim="form.dictType" :placeholder="t('dict.search.phDictType')" />
          <template #label>
            <span>
              <el-tooltip :content="t('dict.tip.dictTypeHelp')" placement="top">
                <el-icon><question-filled /></el-icon>
              </el-tooltip>
              {{ t('dict.form.dictType') }}
            </span>
          </template>
        </el-form-item>
        <el-form-item :label="t('dict.form.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
              {{ dict.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('dict.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :placeholder="t('common.form.inputPlaceholder')"
            :maxlength="500"
            show-word-limit
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <dict-data-drawer v-model:visible="drawerVisible" :row="drawerRow" />
  </div>
</template>

<script setup lang="ts" name="Dict">
import DictDataDrawer from './detail.vue'
import useDictStore from '@/store/modules/dict'
import { listType, getType, delType, addType, updateType, refreshCache } from '@/api/system/dict/type'
import type { SysDictType, DictTypeQueryParams } from '@/types/api/system/dict'
import { useCrudTable } from '@/composables/useCrudTable'
import modal from '@/plugins/modal'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import tab from '@/plugins/tab'
import { addDateRange } from '@/utils/stepby'

const dictRefRef = useTemplateRef('dictRef')
const queryRefRef = useTemplateRef('queryRef')
const { t } = useI18n()
const { sys_normal_disable } = useDict('sys_normal_disable')

const dateRange = ref<string[]>([])
const drawerVisible = ref<boolean>(false)
const drawerRow = ref<SysDictType | null>(null)

const data = reactive({
  form: {} as SysDictType,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    dictName: undefined,
    dictType: undefined,
    status: undefined
  } as DictTypeQueryParams,
  rules: {
    dictName: [{ required: true, message: t('dict.validate.dictNameRequired'), trigger: 'blur' }],
    dictType: [{ required: true, message: t('dict.validate.dictTypeRequired'), trigger: 'blur' }]
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
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  submitForm,
  handleDelete,
  handleExport
} = useCrudTable<SysDictType, DictTypeQueryParams>({
  listApi: (params) =>
    listType(addDateRange(params as Record<string, unknown>, dateRange.value) as DictTypeQueryParams),
  getApi: getType,
  addApi: addType,
  updateApi: updateType,
  deleteApi: delType,
  idField: 'dictId',
  exportUrl: '/system/dict/type/export',
  defaultForm: () => ({
    dictId: undefined,
    dictName: undefined,
    dictType: undefined,
    status: '0',
    remark: undefined
  }),
  titleKey: 'dict.title',
  deleteTipKey: 'common.confirmDelete',
  queryParams,
  form,
  formRef: dictRefRef,
  queryRef: queryRefRef,
  onAfterSubmit: () => {
    // P0-M5 修复：await refreshCache 完成后再 cleanDict，避免后端缓存未刷新时前端重建脏数据
    refreshCache()
      .then(() => {
        useDictStore().cleanDict()
      })
      .catch(() => {})
  },
  onAfterDelete: () => {
    // P1 修复: 字典类型删除后也需失效缓存，与 onAfterSubmit 保持一致
    // 否则已删除的字典类型仍会残留在其他页面的下拉选项中
    refreshCache()
      .then(() => {
        useDictStore().cleanDict()
      })
      .catch(() => {})
  }
})

/** 重置按钮操作 - 覆盖以清空 dateRange */
function resetQuery() {
  dateRange.value = []
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 字典数据抽屉 */
function handleViewData(row: SysDictType) {
  drawerRow.value = row
  drawerVisible.value = true
}

/** 字典数据列表页面 */
function handleDataList(row: SysDictType) {
  tab.openPage(t('dict.data.title'), '/system/dict-data/index/' + row.dictId)
}

/** 刷新缓存按钮操作 */
function handleRefreshCache() {
  refreshCache()
    .then(() => {
      modal.msgSuccess(t('common.refreshSuccess'))
      useDictStore().cleanDict()
    })
    .catch(() => {})
}

getList()
</script>

<style scoped>
:deep(.el-table__row) {
  transition: background-color 0.2s ease;
}

:deep(.el-tag) {
  transition: all 0.2s ease;
}
</style>
