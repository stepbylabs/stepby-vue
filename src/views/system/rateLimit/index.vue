<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="80px">
        <el-form-item :label="t('rateLimit.search.routePattern')" prop="routePattern">
          <el-input
            v-model="queryParams.routePattern"
            :placeholder="t('rateLimit.search.phRoutePattern')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('rateLimit.search.enabled')" prop="enabled">
          <el-select
            v-model="queryParams.enabled"
            :placeholder="t('rateLimit.search.enabled')"
            clearable
            class="w-[240px]"
          >
            <el-option :label="t('common.enabled')" :value="true" />
            <el-option :label="t('common.disabled')" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('rateLimit.buttons.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('rateLimit.buttons.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:rateLimit:add']">
          {{ t('rateLimit.buttons.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['system:rateLimit:edit']"
        >
          {{ t('rateLimit.buttons.edit') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['system:rateLimit:remove']"
        >
          {{ t('rateLimit.buttons.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:rateLimit:export']">
          {{ t('rateLimit.buttons.export') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="9" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="rateLimitList"
        :row-key="(row: SysRateLimit) => row.id"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('rateLimit.column.id')" align="center" prop="id" width="80" />
        <el-table-column
          :label="t('rateLimit.column.routePattern')"
          align="center"
          prop="routePattern"
          show-overflow-tooltip
        >
          <template #default="scope">
            <Transition mode="out-in" name="fade">
              <el-tag v-if="scope.row.routePattern === '*'" type="success" key="tag">
                {{ t('rateLimit.buttons.globalDefault') }}
              </el-tag>
              <span v-else key="text">{{ scope.row.routePattern }}</span>
            </Transition>
          </template>
        </el-table-column>
        <el-table-column :label="t('rateLimit.column.capacity')" align="center" prop="capacity" width="100" />
        <el-table-column
          :label="t('rateLimit.column.refillPerSecond')"
          align="center"
          prop="refillPerSecond"
          width="140"
        />
        <el-table-column :label="t('rateLimit.column.enabled')" align="center" prop="enabled" width="100">
          <template #default="scope">
            <el-switch
              v-model="scope.row.enabled"
              :active-value="true"
              :inactive-value="false"
              @change="handleStatusChange(scope.row)"
            />
          </template>
        </el-table-column>
        <el-table-column
          :label="t('rateLimit.column.description')"
          align="center"
          prop="description"
          show-overflow-tooltip
        />
        <el-table-column :label="t('rateLimit.column.createTime')" align="center" prop="createTime" width="180">
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
              v-hasPermi="['system:rateLimit:edit']"
            >
              {{ t('rateLimit.buttons.edit') }}
            </el-button>
            <el-button
              link
              type="primary"
              icon="Delete"
              @click="handleDelete(scope.row)"
              v-hasPermi="['system:rateLimit:remove']"
            >
              {{ t('rateLimit.buttons.delete') }}
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

    <!-- 添加或修改限流配置对话框 -->
    <el-dialog :title="title" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close>
      <el-form ref="rateLimitRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item :label="t('rateLimit.form.routePattern')" prop="routePattern">
          <el-input v-model.trim="form.routePattern" :placeholder="t('rateLimit.form.phRoutePattern')" />
        </el-form-item>
        <el-form-item :label="t('rateLimit.form.capacity')" prop="capacity">
          <el-input-number v-model="form.capacity" :min="1" :max="10000" controls-position="right" class="w-[200px]" />
          <span class="ml-2.5 text-text-placeholder text-xs">{{ t('rateLimit.form.capacityTip') }}</span>
        </el-form-item>
        <el-form-item :label="t('rateLimit.form.refillPerSecond')" prop="refillPerSecond">
          <el-input-number
            v-model="form.refillPerSecond"
            :min="0.1"
            :max="1000"
            :step="0.1"
            :precision="2"
            controls-position="right"
            class="w-[200px]"
          />
          <span class="ml-2.5 text-text-placeholder text-xs">{{ t('rateLimit.form.refillTip') }}</span>
        </el-form-item>
        <el-form-item :label="t('rateLimit.form.enabled')" prop="enabled">
          <el-switch v-model="form.enabled" :active-value="true" :inactive-value="false" />
        </el-form-item>
        <el-form-item :label="t('rateLimit.form.description')" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :placeholder="t('rateLimit.form.phDescription')"
            :maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">
            {{ t('rateLimit.buttons.confirm') }}
          </el-button>
          <el-button @click="cancel">{{ t('rateLimit.buttons.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="RateLimit">
import type { SysRateLimit, RateLimitQueryParams } from '@/api/system/rateLimit'
import { listRateLimit, getRateLimit, delRateLimit, addRateLimit, updateRateLimit } from '@/api/system/rateLimit'
import modal from '@/plugins/modal'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import { useExport } from '@/composables/useExport'

const rateLimitRefRef = useTemplateRef('rateLimitRef')
const queryRefRef = useTemplateRef('queryRef')
const { t } = useI18n()

const rateLimitList = ref<SysRateLimit[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
const submitLoading = ref<boolean>(false)
const showSearch = ref<boolean>(true)
const ids = ref<number[]>([])
const single = ref<boolean>(true)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
const title = ref<string>('')

const data = reactive({
  form: {} as SysRateLimit,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    routePattern: undefined,
    enabled: undefined
  } as RateLimitQueryParams,
  rules: {
    routePattern: [{ required: true, message: t('rateLimit.validate.routePatternRequired'), trigger: 'blur' }],
    capacity: [
      { required: true, message: t('rateLimit.validate.capacityRequired'), trigger: 'blur' },
      { type: 'number', min: 1, max: 10000, message: t('rateLimit.validate.capacityRange'), trigger: 'blur' }
    ],
    refillPerSecond: [
      { required: true, message: t('rateLimit.validate.refillRequired'), trigger: 'blur' },
      { type: 'number', min: 0.1, max: 1000, message: t('rateLimit.validate.refillRange'), trigger: 'blur' }
    ]
  }
})

const { queryParams, form, rules } = toRefs(data)

/** 查询限流配置列表 */
function getList() {
  loading.value = true
  listRateLimit(queryParams.value)
    .then((response) => {
      rateLimitList.value = response.rows
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
    id: undefined,
    routePattern: '',
    capacity: 100,
    refillPerSecond: 10.0,
    enabled: true,
    description: undefined
  }
  rateLimitRefRef.value?.resetFields()
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 多选框选中数据 */
function handleSelectionChange(selection: SysRateLimit[]) {
  ids.value = selection.map((item) => item.id)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

/** 新增按钮操作 */
function handleAdd() {
  reset()
  open.value = true
  title.value = t('rateLimit.titleAdd')
}

/** 修改按钮操作 */
function handleUpdate(row?: SysRateLimit) {
  reset()
  const id = row?.id || ids.value[0]
  getRateLimit(id)
    .then((response) => {
      form.value = response.data
      open.value = true
      title.value = t('rateLimit.titleEdit')
    })
    .catch(() => {})
}

/** 提交按钮 */
function submitForm() {
  rateLimitRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.id) {
        updateRateLimit(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
            open.value = false
            getList()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        addRateLimit(form.value)
          .then(() => {
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
function handleDelete(row?: SysRateLimit) {
  // 单条传数字 ID，批量显式 join 为逗号分隔字符串（后端 parse_id_list 按逗号拆分）
  const delIds = row ? row.id : ids.value.join(',')
  modal
    .confirm(t('rateLimit.tip.confirmDelete', { ids: delIds }))
    .then(function () {
      return delRateLimit(delIds)
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
      ids.value = []
      multiple.value = true
    })
    .catch(() => {})
}

/** 启用状态变更 */
function handleStatusChange(row: SysRateLimit) {
  const text = row.enabled ? t('common.enabled') : t('common.disabled')
  modal
    .confirm(t('rateLimit.tip.confirmStatusChange', { text, name: row.routePattern }))
    .then(function () {
      return updateRateLimit(row)
    })
    .then(() => {
      modal.msgSuccess(t('rateLimit.tip.statusChangeSuccess', { text }))
    })
    .catch(function () {
      row.enabled = !row.enabled
    })
}

/** 导出按钮操作（由 useExport 提供） */
const { handleExport: rawHandleExport } = useExport('/system/rateLimit/export', 'rate_limit', {
  successKey: 'common.exportSuccess'
})
function handleExport() {
  rawHandleExport({ ...queryParams.value })
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
