<template>
  <!-- 导入表 -->
  <el-dialog
    :close-on-click-modal="false"
    :before-close="beforeClose"
    :title="t('gen.importTable.title')"
    v-model="visible"
    width="800px"
    top="5vh"
    append-to-body
    destroy-on-close
  >
    <el-form :model="queryParams" ref="queryRef" :inline="true">
      <el-form-item :label="t('gen.importTable.tableName')" prop="tableName">
        <el-input
          v-model="queryParams.tableName"
          :placeholder="t('gen.importTable.phTableName')"
          :maxlength="64"
          clearable
          class="w-[180px]"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item :label="t('gen.importTable.tableComment')" prop="tableComment">
        <el-input
          v-model="queryParams.tableComment"
          :placeholder="t('gen.importTable.phTableComment')"
          :maxlength="100"
          clearable
          class="w-[180px]"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
        <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
      </el-form-item>
    </el-form>
    <el-row>
      <el-table
        v-loading="loading"
        @row-click="clickRow"
        ref="table"
        :data="dbTableList"
        :row-key="(row: { tableName: string }) => row.tableName"
        @selection-change="handleSelectionChange"
        height="260px"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column
          prop="tableName"
          :label="t('gen.importTable.tableName')"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column
          prop="tableComment"
          :label="t('gen.importTable.tableComment')"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column prop="createTime" :label="t('common.column.createTime')"></el-table-column>
        <el-table-column prop="updateTime" :label="t('common.column.updateTime')"></el-table-column>
        <template #empty>
          <list-empty :load-error="loadError" @retry="getList" />
        </template>
      </el-table>
      <pagination
        v-show="total > 0"
        :total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </el-row>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" @click="handleImportTable">{{ t('common.confirm') }}</el-button>
        <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
const { t } = useI18n()
import { listDbTable, importTable } from '@/api/tool/gen'
import { createLatestGuard } from '@/composables/latestRequest'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import modal from '@/plugins/modal'
import type { GenQueryParams, GenTable } from '@/types/api/tool/gen'

const total = ref<number>(0)
// 列表加载失败标记：失败置真（空态显示"加载失败 + 重试"），成功置假
const loadError = ref<boolean>(false)
// 取数中的可见反馈：此前本页没有 loading 态，打开弹窗到数据回来之间是一张空表（b119）
const loading = ref<boolean>(false)
/** 列表请求守卫：连点搜索/翻页时只让最后一次请求的结局生效（b119） */
const listGuard = createLatestGuard()
const visible = ref<boolean>(false)
const tables = ref<string[]>([])
const dbTableList = ref<GenTable[]>([])
const tableRef = useTemplateRef('table')
const queryRefRef = useTemplateRef('queryRef')

const queryParams = reactive<GenQueryParams>({
  pageNum: 1,
  pageSize: 10,
  tableName: undefined,
  tableComment: undefined
})

/** 关闭语义（b135）：勾选要导入的表之后按 Esc 原先会静默丢弃整批勾选 */
const { beforeClose, cancel, markSaved } = useDialogDirtyGuard(visible, () => ({ tables: tables.value }))

const emit = defineEmits(['ok'])

/** 查询参数列表 */
function show(): void {
  getList()
  visible.value = true
}

/** 单击选择行（点击复选框列不重复切换，避免与 checkbox 原生切换叠加导致抖动，G8） */
function clickRow(row: GenTable, column: { type?: string }, event: Event) {
  const target = event.target as HTMLElement | null
  if (column?.type === 'selection' || target?.closest('.el-table-column--selection')) {
    return
  }
  tableRef.value?.toggleRowSelection(row)
}

/** 多选框选中数据 */
function handleSelectionChange(selection: GenTable[]) {
  tables.value = selection.map((item) => item.tableName)
}

/** 查询表数据 */
function getList() {
  const ticket = listGuard.begin()
  loading.value = true
  listDbTable(queryParams)
    .then((res) => {
      if (!listGuard.isCurrent(ticket)) return
      const nextPage = pageAfterEmptyResult(queryParams.pageNum, res.rows?.length ?? 0, res.total ?? 0)
      if (nextPage !== queryParams.pageNum) {
        queryParams.pageNum = nextPage
        getList()
        return
      }
      loadError.value = false
      dbTableList.value = res.rows
      total.value = res.total
    })
    .catch((err: unknown) => {
      if (!listGuard.isCurrent(ticket)) return
      // b105：失败落在空态里（带重试），不再只用一条会自动消失的 toast；
      // 错误文案仍由全局拦截器提示，此处只在 DEV 留痕，避免同一失败弹两次
      loadError.value = true
      dbTableList.value = []
      total.value = 0
      if (import.meta.env.DEV) console.error('[gen/importTable] getList:', err)
    })
    .finally(() => {
      if (listGuard.isCurrent(ticket)) loading.value = false
    })
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.pageNum = 1
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 导入按钮操作 */
function handleImportTable() {
  const tableNames = tables.value.join(',')
  if (tableNames == '') {
    modal.msgError(t('gen.importTable.tipSelectTable'))
    return
  }
  importTable({ tables: tableNames, tplWebType: 'element-plus-typescript' })
    .then((res) => {
      modal.msgSuccess(res.msg)
      if (res.code === 200) {
        markSaved()
        visible.value = false
        emit('ok')
      }
    })
    .catch((err: unknown) => modal.msgError(err instanceof Error ? err.message : String(err)))
}

defineExpose({
  show
})
</script>
