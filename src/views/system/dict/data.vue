<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('dict.search.dictName')" prop="dictType">
          <el-select v-model="queryParams.dictType" class="w-[200px]">
            <el-option v-for="item in typeOptions" :key="item.dictId" :label="item.dictName" :value="item.dictType" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('dict.data.label')" prop="dictLabel">
          <el-input
            v-model="queryParams.dictLabel"
            :placeholder="t('common.form.inputPlaceholder')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('dict.search.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('dict.search.phStatus')" clearable class="w-[200px]">
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
        <el-button type="warning" plain icon="Close" @click="handleClose">{{ t('common.close') }}</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysDictData) => row.dictCode"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('dict.column.id')" align="center" prop="dictCode" />
      <el-table-column :label="t('dict.data.label')" align="center" prop="dictLabel">
        <template #default="scope">
          <span
            v-if="
              (scope.row.listClass == '' || scope.row.listClass == 'default') &&
              (scope.row.cssClass == '' || scope.row.cssClass == null)
            "
            class="dict-label-text"
          >
            {{ scope.row.dictLabel }}
          </span>
          <el-tag
            v-else
            :type="
              ['success', 'info', 'warning', 'danger'].includes(scope.row.listClass) ? scope.row.listClass : undefined
            "
            :class="scope.row.cssClass"
          >
            {{ scope.row.dictLabel }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('dict.data.labelEn')"
        align="center"
        prop="dictLabelEn"
        width="120"
        show-overflow-tooltip
      />
      <el-table-column :label="t('dict.data.value')" align="center" prop="dictValue" />
      <el-table-column :label="t('dict.data.sort')" align="center" prop="dictSort" />
      <el-table-column :label="t('dict.column.status')" align="center" prop="status">
        <template #default="scope">
          <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column :label="t('dict.column.remark')" align="center" prop="remark" show-overflow-tooltip />
      <el-table-column :label="t('dict.column.createTime')" align="center" prop="createTime" width="180">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="160"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['system:dict:edit']">
            {{ t('common.edit') }}
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

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加或修改参数配置对话框 -->
    <el-dialog :title="title" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close>
      <el-form ref="dataRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('dict.form.dictType')">
          <el-input v-model="form.dictType" :disabled="true" />
        </el-form-item>
        <el-form-item :label="t('dict.data.label')" prop="dictLabel">
          <el-input v-model.trim="form.dictLabel" :placeholder="t('common.form.inputPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('dict.data.labelEn')" prop="dictLabelEn">
          <el-input v-model.trim="form.dictLabelEn" :placeholder="t('common.form.inputPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('dict.data.value')" prop="dictValue">
          <el-input v-model.trim="form.dictValue" :placeholder="t('common.form.inputPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('dict.data.cssClass')" prop="cssClass">
          <el-input v-model="form.cssClass" :placeholder="t('common.form.inputPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('dict.data.sort')" prop="dictSort">
          <el-input-number v-model="form.dictSort" controls-position="right" :min="0" />
        </el-form-item>
        <el-form-item :label="t('dict.data.listClass')" prop="listClass">
          <el-select v-model="form.listClass">
            <el-option
              v-for="item in listClassOptions"
              :key="item.value"
              :label="item.label + '(' + item.value + ')'"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('dict.data.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
              {{ dict.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('dict.data.remark')" prop="remark">
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
  </div>
</template>

<script setup lang="ts" name="Data">
import useDictStore from '@/store/modules/dict'
import { optionselect as getDictOptionselect, getType } from '@/api/system/dict/type'
import { listData, getData, delData, addData, updateData } from '@/api/system/dict/data'
import type { SysDictData, SysDictType, DictDataQueryParams } from '@/types/api/system/dict'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import { useExport } from '@/composables/useExport'

interface ListClassOption {
  value: string
  label: string
}

const dataRefRef = useTemplateRef('dataRef')
const queryRefRef = useTemplateRef('queryRef')
const { t } = useI18n()
const { sys_normal_disable } = useDict('sys_normal_disable')

const dataList = shallowRef<SysDictData[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
const submitLoading = ref<boolean>(false)
const showSearch = ref<boolean>(true)
const ids = ref<number[]>([])
const single = ref<boolean>(true)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
const title = ref<string>('')
const defaultDictType = ref<string>('')
const typeOptions = ref<SysDictType[]>([])
const route = useRoute()
// 数据标签回显样式
const listClassOptions = ref<ListClassOption[]>([
  { value: 'default', label: t('dict.data.listClassOptions.default') },
  { value: 'primary', label: t('dict.data.listClassOptions.primary') },
  { value: 'success', label: t('dict.data.listClassOptions.success') },
  { value: 'info', label: t('dict.data.listClassOptions.info') },
  { value: 'warning', label: t('dict.data.listClassOptions.warning') },
  { value: 'danger', label: t('dict.data.listClassOptions.danger') }
])

const data = reactive({
  form: {} as SysDictData,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    dictType: undefined,
    dictLabel: undefined,
    status: undefined
  } as DictDataQueryParams,
  rules: {
    dictLabel: [{ required: true, message: t('dict.validate.dataLabelRequired'), trigger: 'blur' }],
    dictValue: [{ required: true, message: t('dict.validate.dataValueRequired'), trigger: 'blur' }],
    dictSort: [{ required: true, message: t('dict.validate.dataSortRequired'), trigger: 'blur' }]
  }
})

const { queryParams, form, rules } = toRefs(data)

/** 查询字典类型详细 */
function getTypes(dictId: number) {
  getType(dictId)
    .then((response) => {
      queryParams.value.dictType = response.data!.dictType
      defaultDictType.value = response.data!.dictType!
      getList()
    })
    .catch(() => {})
}

/** 查询字典类型列表 */
function getTypeList() {
  getDictOptionselect()
    .then((response) => {
      typeOptions.value = response.data
    })
    .catch(() => {})
}

/** 查询字典数据列表 */
function getList() {
  loading.value = true
  listData(queryParams.value)
    .then((response) => {
      dataList.value = response.rows
      total.value = response.total
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

/** 取消按钮 */
function cancel() {
  open.value = false
  reset()
}

/** 表单重置 */
function reset() {
  form.value = {
    dictCode: undefined,
    dictLabel: undefined,
    dictLabelEn: undefined,
    dictValue: undefined,
    cssClass: undefined,
    listClass: 'default',
    dictSort: 0,
    status: '0',
    remark: undefined
  }
  dataRefRef.value?.resetFields()
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 返回按钮操作 */
function handleClose() {
  const obj = { path: '/system/dict' }
  tab.closeOpenPage(obj)
}

/** 重置按钮操作 */
function resetQuery() {
  queryRefRef.value?.resetFields()
  queryParams.value.dictType = defaultDictType.value
  handleQuery()
}

/** 新增按钮操作 */
function handleAdd() {
  reset()
  open.value = true
  title.value = t('common.add')
  form.value.dictType = queryParams.value.dictType
}

/** 多选框选中数据 */
function handleSelectionChange(selection: SysDictData[]) {
  ids.value = selection.map((item) => item.dictCode!)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

/** 修改按钮操作 */
function handleUpdate(row?: SysDictData) {
  reset()
  const dictCode = row?.dictCode || ids.value[0]
  getData(dictCode)
    .then((response) => {
      form.value = response.data!
      open.value = true
      title.value = t('common.edit')
    })
    .catch(() => {})
}

/** 提交按钮 */
function submitForm() {
  dataRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.dictCode != undefined) {
        updateData(form.value)
          .then(() => {
            useDictStore().removeDict(queryParams.value.dictType!)
            modal.msgSuccess(t('common.editSuccess'))
            open.value = false
            getList()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        addData(form.value)
          .then(() => {
            useDictStore().removeDict(queryParams.value.dictType!)
            modal.msgSuccess(t('common.addSuccess'))
            open.value = false
            getList()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      }
    }
  })
}

/** 删除按钮操作 */
function handleDelete(row?: SysDictData) {
  const dictCodes = row?.dictCode || ids.value
  modal
    .confirm(t('common.confirmDelete', { ids: dictCodes }))
    .then(function () {
      return delData(dictCodes)
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
      useDictStore().removeDict(queryParams.value.dictType!)
    })
    .catch(() => {})
}

/** 导出按钮操作（由 useExport 提供） */
const { handleExport: rawHandleExport } = useExport('/system/dict/data/export', 'dict_data', {
  successKey: 'common.exportSuccess'
})
function handleExport() {
  rawHandleExport({ ...queryParams.value })
}

getTypes(route.params && Number(route.params.dictId))
getTypeList()

// FE-15: keep-alive 缓存后从字典类型页带不同 dictId 跳转时，setup 不会重新执行，
// 需 watch route.params.dictId 自动重新查询
watch(
  () => route.params.dictId,
  (newDictId: string | string[] | undefined) => {
    if (newDictId) {
      getTypes(Number(newDictId))
    }
  }
)
</script>

<style scoped>
/* 字典标签列：el-tag 颜色/背景过渡（纯 CSS，避免 Transition 包裹单元素） */
:deep(.el-tag) {
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.dict-label-text {
  transition: color 0.2s ease;
}
</style>
