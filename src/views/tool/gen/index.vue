<template>
  <div class="app-container">
    <Transition name="fade-slide">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('gen.search.tableName')" prop="tableName">
          <el-input
            v-model="queryParams.tableName"
            :placeholder="t('gen.search.phTableName')"
            :aria-label="t('gen.search.tableName')"
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
            :aria-label="t('gen.search.tableComment')"
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
      :default-sort="sortArrow"
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
              :aria-label="t('gen.btn.sync')"
              @click="handleSynchDb(scope.row)"
              v-hasPermi="['tool:gen:edit']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('gen.btn.generateCode')" placement="top">
            <el-button
              link
              type="primary"
              icon="Download"
              :aria-label="t('gen.btn.generateCode')"
              @click="handleGenTable(scope.row)"
              v-hasPermi="['tool:gen:code']"
            ></el-button>
          </el-tooltip>
        </template>
      </el-table-column>
      <template #empty>
        <list-empty :load-error="loadError" @retry="retryLoad" />
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
import { applySortChange } from '@/utils/sortDirection'
import { useSortArrow } from '@/composables/useSortArrow'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { listTable, delTable, genCodeUrl, batchGenCode, synchDb } from '@/api/tool/gen'
import importTable from './importTable.vue'
import createTable from './createTable.vue'
import GenPreview from './preview.vue'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import downloadPlugin from '@/plugins/download'
import { addDateRange } from '@/utils/stepby'
import { toPositiveInt } from '@/utils/validate'
import type { GenTable, GenQueryParams } from '@/types/api/tool/gen'
import type { FormInstance } from 'element-plus'
import { resetQueryDefaults, useCrudTable } from '@/composables/useCrudTable'

const route = useRoute()
const queryRef = useTemplateRef('queryRef')
const genRef = useTemplateRef('genRef')
const importRef = useTemplateRef('importRef')
const createRef = useTemplateRef('createRef')
const previewRef = useTemplateRef('previewRef')

const dateRange = ref<string[]>([])
const uniqueId = ref<string>('')
const defaultSort = ref({ prop: 'createTime', order: 'descending' })

const queryParams = ref<GenQueryParams>({
  pageNum: 1,
  pageSize: 10,
  tableName: undefined,
  tableComment: undefined,
  orderByColumn: defaultSort.value.prop,
  isAsc: defaultSort.value.order
})

// 只读接入（仅 listApi + deleteApi）：列表/查询/删除走 useCrudTable；
// 预览/生成/导入/建表/同步/排序/多选 tableNames 保留手写。form 相关为契约占位（只读模式不暴露表单流程）
const {
  dataList: tableList,
  loading,
  showSearch,
  ids,
  single,
  multiple,
  total,
  getList,
  loadError,
  retryLoad,
  handleQuery,
  handleDelete
} = useCrudTable<GenTable, GenQueryParams>({
  listApi: (params) => listTable(addDateRange({ ...params }, dateRange.value) as GenQueryParams),
  deleteApi: (targetIds) => delTable(targetIds as number | number[]),
  idField: 'tableId',
  defaultForm: () => ({}) as GenTable,
  titleKey: 'gen.title',
  deleteTipKey: 'common.confirmDelete',
  queryParams,
  form: ref<GenTable>({} as GenTable),
  formRef: ref<FormInstance | null>(null),
  queryRef,
  // 迁移等价性：原页面无 URL 查询同步，关闭以保持行为零变化
  syncQueryToUrl: false
})

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

const tableNames = ref<string[]>([])

onActivated(() => {
  const time = route.query.t
  if (time != null && time != uniqueId.value) {
    uniqueId.value = time
    const backPageNum = toPositiveInt(route.query.pageNum)
    if (backPageNum) queryParams.value.pageNum = backPageNum
    dateRange.value = []
    queryRef.value?.resetFields()
    getList()
  }
})

/** 重置按钮操作（保留手写：需恢复表格默认排序） */
function resetQuery() {
  dateRange.value = []
  queryRef.value?.resetFields()
  // 批六十四修复（F137⑤ 实证）：EP form-item initialValue 被「URL 同步 + fullPath 重挂载」
  // 污染为搜索值，resetFields 只会“重置回搜索值”——必须显式恢复页面定义的干净默认快照
  resetQueryDefaults(queryParams)
  queryParams.value.pageNum = 1
  genRef.value?.sort(defaultSort.value.prop, defaultSort.value.order)
}

/** 预览按钮：打开代码预览弹窗（Prism 高亮） */
function handlePreview(row: GenTable) {
  previewRef.value?.openPreview(row.tableId!)
}

// 多选框选中数据（写入 useCrudTable 的 ids/single/multiple，并额外维护 tableNames 供生成/编辑用）
function handleSelectionChange(selection: GenTable[]) {
  ids.value = selection.map((item) => item.tableId)
  tableNames.value = selection.map((item) => item.tableName)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

/** 箭头由页面实际下发的排序参数派生（成因见 composables/useSortArrow） */
const sortArrow = useSortArrow(queryParams, () => defaultSort.value)

/** 排序触发事件（保留手写以维持既有参数语义） */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  applySortChange(queryParams.value, column)
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
    // b139：自定义路径不再是"后端写磁盘"，而是**压缩包内目录前缀**——
    // 走与批量同一条下载通道，并按真实结局提示（`true` 只代表已交给浏览器）
    void downloadPlugin
      .zip(genCodeUrl(row.tableName!, row.genPath), `${row.tableName}.zip`)
      .then((ok) => {
        if (ok) modal.msgSuccess(t('gen.msg.genCustomSuccess', { path: (row.genPath || '').trim() || '/' }))
      })
      // 下载原语内部已上报失败并 resolve(false)；这一支兜的是"成功提示自身抛错"，
      // 不能让拒绝逸出成 unhandledrejection（否则真实故障会被埋进 console 噪声）
      .catch((err) => console.error('[tool/gen] 生成代码结局处理异常', err))
  } else {
    const tbNames = names.join(',')
    void downloadPlugin
      .zip(batchGenCode(names), `${tbNames}.zip`)
      .then((ok) => {
        if (ok) modal.msgSuccess(t('gen.msg.genZipSuccess'))
      })
      .catch((err) => console.error('[tool/gen] 批量生成结局处理异常', err))
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

/** 修改按钮操作 */
function handleEditTable(row?: GenTable) {
  const tableId = row?.tableId || ids.value[0]
  const tableName = row?.tableName || tableNames.value[0]
  const params = { pageNum: queryParams.value.pageNum }
  tab.openPage(t('gen.msg.editTitle', { name: tableName }), '/tool/gen-edit/index/' + tableId, params)
}

getList()
</script>
