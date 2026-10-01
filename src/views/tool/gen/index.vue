<template>
  <div class="app-container">
    <Transition name="fade-slide">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('gen.search.tableName')" prop="tableName">
          <el-input
            v-model="queryParams.tableName"
            :placeholder="t('gen.search.phTableName')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('gen.search.tableComment')" prop="tableComment">
          <el-input
            v-model="queryParams.tableComment"
            :placeholder="t('gen.search.phTableComment')"
            :maxlength="100"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.column.createTime')" class="w-[308px]">
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
        <el-button
          type="primary"
          plain
          icon="Download"
          :disabled="multiple"
          @click="handleGenTable()"
          v-hasPermi="['tool:gen:code']"
        >
          {{ t('gen.btn.generate') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Upload" @click="openImportTable" v-hasPermi="['tool:gen:import']">
          {{ t('common.import') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Plus" @click="openCreateTable" v-hasPermi="['tool:gen:edit']">
          {{ t('common.create') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleEditTable"
          v-hasPermi="['tool:gen:edit']"
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
          v-hasPermi="['tool:gen:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      ref="genRef"
      v-loading="loading"
      :data="tableList"
      :row-key="(row: GenTable) => row.tableId"
      @selection-change="handleSelectionChange"
      :default-sort="defaultSort"
      @sort-change="handleSortChange"
    >
      <el-table-column type="selection" align="center" width="55"></el-table-column>
      <el-table-column :label="t('common.column.sort')" type="index" width="50" align="center">
        <template #default="scope">
          <span>{{ (queryParams.pageNum - 1) * queryParams.pageSize + scope.$index + 1 }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('gen.column.tableName')" align="center" prop="tableName" show-overflow-tooltip />
      <el-table-column :label="t('gen.column.tableComment')" align="center" prop="tableComment" show-overflow-tooltip />
      <el-table-column :label="t('gen.column.className')" align="center" prop="className" show-overflow-tooltip />
      <el-table-column
        :label="t('common.column.createTime')"
        align="center"
        prop="createTime"
        width="160"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('common.column.updateTime')"
        align="center"
        prop="updateTime"
        width="160"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="330"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-tooltip :content="t('common.preview')" placement="top">
            <el-button
              link
              type="primary"
              icon="View"
              :aria-label="t('gen.btn.preview')"
              @click="handlePreview(scope.row)"
              v-hasPermi="['tool:gen:preview']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('gen.btn.edit')" placement="top">
            <el-button
              link
              type="primary"
              icon="Edit"
              :aria-label="t('gen.btn.edit')"
              @click="handleEditTable(scope.row)"
              v-hasPermi="['tool:gen:edit']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('common.delete')" placement="top">
            <el-button
              link
              type="primary"
              icon="Delete"
              :aria-label="t('gen.btn.delete')"
              @click="handleDelete(scope.row)"
              v-hasPermi="['tool:gen:remove']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('gen.btn.sync')" placement="top">
            <el-button
              link
              type="primary"
              icon="Refresh"
              :aria-label="t('gen.btn.refresh')"
              @click="handleSynchDb(scope.row)"
              v-hasPermi="['tool:gen:edit']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('gen.btn.generateCode')" placement="top">
            <el-button
              link
              type="primary"
              icon="Download"
              :aria-label="t('gen.btn.download')"
              @click="handleGenTable(scope.row)"
              v-hasPermi="['tool:gen:code']"
            ></el-button>
          </el-tooltip>
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
    <!-- 代码预览（Prism 语法高亮） -->
    <gen-preview ref="previewRef" />
    <import-table ref="importRef" @ok="handleQuery" />
    <create-table ref="createRef" @ok="handleQuery" />
  </div>
</template>

<script setup lang="ts" name="Gen">
const { t } = useI18n()
import { listTable, delTable, genCode, batchGenCode, synchDb } from '@/api/tool/gen'
import importTable from './importTable.vue'
import createTable from './createTable.vue'
import GenPreview from './preview.vue'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import downloadPlugin from '@/plugins/download'
import { addDateRange } from '@/utils/stepby'
import type { GenTable, GenQueryParams } from '@/types/api/tool/gen'

const route = useRoute()
const queryRef = useTemplateRef('queryRef')
const genRef = useTemplateRef('genRef')
const importRef = useTemplateRef('importRef')
const createRef = useTemplateRef('createRef')
const previewRef = useTemplateRef('previewRef')

const tableList = ref<GenTable[]>([])
const loading = ref<boolean>(true)
const showSearch = ref<boolean>(true)
const ids = ref<number[]>([])
const single = ref<boolean>(true)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
const tableNames = ref<string[]>([])
const dateRange = ref<string[]>([])
const uniqueId = ref<string>('')
const defaultSort = ref({ prop: 'createTime', order: 'descending' })

const data = reactive({
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    tableName: undefined,
    tableComment: undefined,
    orderByColumn: defaultSort.value.prop,
    isAsc: defaultSort.value.order
  } as GenQueryParams
})

const { queryParams } = toRefs(data)

onActivated(() => {
  const time = route.query.t
  if (time != null && time != uniqueId.value) {
    uniqueId.value = time
    queryParams.value.pageNum = Number(route.query.pageNum)
    dateRange.value = []
    queryRef.value?.resetFields()
    getList()
  }
})

/** 查询表集合 */
function getList() {
  loading.value = true
  listTable(addDateRange(queryParams.value, dateRange.value))
    .then((response) => {
      tableList.value = response.rows
      total.value = response.total
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 生成代码操作 */
function handleGenTable(row?: GenTable) {
  const names = row?.tableName ? [row.tableName] : tableNames.value
  if (!names.length) {
    modal.msgError(t('gen.msg.selectToGen'))
    return
  }
  if (row?.genType === '1') {
    genCode(row.tableName!)
      .then(() => {
        modal.msgSuccess(t('gen.msg.genCustomSuccess', { path: row.genPath }))
      })
      .catch(() => {})
  } else {
    const tbNames = names.join(',')
    downloadPlugin.zip(batchGenCode(names), `${tbNames}.zip`)
  }
}

/** 同步数据库操作 */
function handleSynchDb(row: GenTable) {
  const tableName = row.tableName
  modal
    .confirm(t('gen.msg.syncConfirm', { name: tableName }))
    .then(function () {
      return synchDb(tableName!)
    })
    .then(() => {
      modal.msgSuccess(t('gen.msg.syncSuccess'))
      getList() // R12：同步后刷新列表，确保展示最新表元数据
    })
    .catch(() => {})
}

/** 打开导入表弹窗 */
function openImportTable() {
  importRef.value?.show()
}

/** 打开创建表弹窗（结构化建表） */
function openCreateTable() {
  createRef.value?.show()
}

/** 重置按钮操作 */
function resetQuery() {
  dateRange.value = []
  queryRef.value?.resetFields()
  queryParams.value.pageNum = 1
  genRef.value?.sort(defaultSort.value.prop, defaultSort.value.order)
}

/** 预览按钮：打开代码预览弹窗（Prism 高亮） */
function handlePreview(row: GenTable) {
  previewRef.value?.openPreview(row.tableId!)
}

// 多选框选中数据
function handleSelectionChange(selection: GenTable[]) {
  ids.value = selection.map((item) => item.tableId)
  tableNames.value = selection.map((item) => item.tableName)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

/** 排序触发事件 */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  queryParams.value.orderByColumn = column.prop
  queryParams.value.isAsc = column.order
  getList()
}

/** 修改按钮操作 */
function handleEditTable(row?: GenTable) {
  const tableId = row?.tableId || ids.value[0]
  const tableName = row?.tableName || tableNames.value[0]
  const params = { pageNum: queryParams.value.pageNum }
  tab.openPage(t('gen.msg.editTitle', { name: tableName }), '/tool/gen-edit/index/' + tableId, params)
}

/** 删除按钮操作 */
function handleDelete(row?: GenTable) {
  const tableIds = row?.tableId || ids.value
  modal
    .confirm(t('common.confirmDelete', { ids: tableIds }))
    .then(function () {
      return delTable(tableIds)
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

getList()
</script>
