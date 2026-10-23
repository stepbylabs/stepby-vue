<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('backup.search.type')" prop="backupType">
          <el-select
            :aria-label="t('backup.search.type')"
            v-model="queryParams.backupType"
            :placeholder="t('backup.search.phType')"
            clearable
            class="w-[160px]"
          >
            <el-option :label="t('backup.form.manual')" value="manual" />
            <el-option :label="t('backup.form.auto')" value="auto" />
            <el-option :label="t('backup.form.tenantExport')" value="tenant_export" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('backup.search.status')" prop="status">
          <el-select
            :aria-label="t('backup.search.status')"
            v-model="queryParams.status"
            :placeholder="t('backup.search.phStatus')"
            clearable
            class="w-[160px]"
          >
            <el-option :label="t('backup.form.success')" value="success" />
            <el-option :label="t('backup.form.fail')" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('backup.search.createTime')" prop="createTime">
          <el-date-picker
            v-model="dateRange"
            :aria-label="t('backup.search.createTime')"
            value-format="YYYY-MM-DD"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('common.form.startDate')"
            :end-placeholder="t('common.form.endDate')"
            class="w-[240px]"
          />
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
          icon="Plus"
          :loading="creating"
          @click="handleCreate"
          v-hasPermi="['system:backup:add']"
        >
          {{ t('backup.btn.create') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['system:backup:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-tooltip :content="t('backup.tip.selfExportTooltip')" placement="top">
          <el-button
            type="warning"
            plain
            icon="Upload"
            :loading="selfExporting"
            @click="handleSelfExport"
            v-hasPermi="['system:backup:export']"
          >
            {{ t('backup.btn.exportSelf') }}
          </el-button>
        </el-tooltip>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="9" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="dataList"
        :row-key="(row: SysBackupLog) => row.backupId"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('backup.column.id')" align="center" prop="backupId" width="80" />
        <el-table-column
          :label="t('backup.column.fileName')"
          align="center"
          prop="fileName"
          min-width="220"
          show-overflow-tooltip
        />
        <el-table-column :label="t('backup.column.size')" align="center" width="120">
          <template #default="scope">
            <span>{{ formatFileSize(scope.row.fileSize) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('backup.column.type')" align="center" width="110">
          <template #default="scope">
            <el-tag :type="backupTypeMeta(scope.row.backupType).tag" size="small">
              {{ backupTypeMeta(scope.row.backupType).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('backup.column.status')" align="center" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ scope.row.status === 'success' ? t('backup.form.success') : t('backup.form.fail') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('backup.column.createBy')" align="center" prop="createBy" width="100" />
        <el-table-column :label="t('backup.column.createTime')" align="center" prop="createTime" width="180">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.operation')"
          align="center"
          width="220"
          class-name="small-padding fixed-width"
        >
          <template #default="scope">
            <el-button
              link
              type="primary"
              icon="Download"
              :loading="downloadingIds.includes(scope.row.backupId)"
              :disabled="scope.row.status !== 'success'"
              @click="handleDownload(scope.row)"
              v-hasPermi="['system:backup:download']"
            >
              {{ t('backup.btn.download') }}
            </el-button>
            <el-button
              link
              type="warning"
              icon="RefreshRight"
              :disabled="scope.row.status !== 'success' || scope.row.backupType === 'tenant_export'"
              @click="handleRestore(scope.row)"
              v-hasPermi="['system:backup:edit']"
            >
              {{ t('backup.btn.restore') }}
            </el-button>
            <el-button
              link
              type="danger"
              icon="Delete"
              @click="handleDelete(scope.row)"
              v-hasPermi="['system:backup:remove']"
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
  </div>
</template>

<script setup lang="ts" name="Backup">
import {
  listBackup,
  createBackup,
  restoreBackup,
  delBackup,
  downloadBackup,
  selfExportTenantPackage
} from '@/api/system/backup'
import type { SysBackupLog, BackupLogQueryParams } from '@/api/system/backup'
import { addDateRange } from '@/utils/stepby'
import { formatFileSize } from '@/utils'
import modal from '@/plugins/modal'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import { resetQueryDefaults, useCrudTable } from '@/composables/useCrudTable'
import { useMobileFilter } from '@/composables/useMobileFilter'
import type { Ref } from 'vue'

const { t } = useI18n()
const queryRef = useTemplateRef('queryRef')

const creating = ref(false)
const selfExporting = ref(false)
const downloadingIds = ref<number[]>([])
const dateRange = ref<string[]>([])

const queryParams = ref<BackupLogQueryParams>({
  pageNum: 1,
  pageSize: 10,
  backupType: undefined,
  status: undefined
})

// 本页无新增/编辑表单（创建/恢复为独立确认流程）：getApi/addApi/updateApi 按只读页惯例传空实现
const form = ref({}) as Ref<SysBackupLog>
const formRef = ref<unknown>(null)

const { dataList, loading, showSearch, total, ids, multiple, getList, handleQuery, handleSelectionChange } =
  useCrudTable<SysBackupLog, BackupLogQueryParams>({
    listApi: (params) =>
      listBackup(addDateRange({ ...params } as Record<string, unknown>, dateRange.value) as BackupLogQueryParams),
    deleteApi: (deleteIds) =>
      delBackup(String(Array.isArray(deleteIds) ? deleteIds.join(',') : deleteIds) as unknown as number),
    idField: 'backupId',
    defaultForm: () => ({}) as SysBackupLog,
    titleKey: 'backup.column.fileName',
    deleteTipKey: 'backup.tip.confirmDelete',
    queryParams,
    form,
    formRef: formRef as never,
    queryRef
  })

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)

/** 重置按钮操作 - 清空 dateRange */
function resetQuery() {
  dateRange.value = []
  queryRef.value?.resetFields()
  // 批六十四修复（F137⑤ 实证）：EP form-item initialValue 被「URL 同步 + fullPath 重挂载」
  // 污染为搜索值，resetFields 只会“重置回搜索值”——必须显式恢复页面定义的干净默认快照
  resetQueryDefaults(queryParams)
  handleQuery()
}

function handleCreate() {
  modal
    .confirm(t('backup.tip.confirmCreate'))
    .then(() => {
      creating.value = true
      return createBackup()
    })
    .then((_res: unknown) => {
      modal.msgSuccess(t('backup.tip.backupSuccess'))
      getList()
    })
    .catch((err: unknown) => {
      if (err !== 'cancel' && err !== 'close') {
        if (import.meta.env.DEV) console.error('Backup failed:', err)
      }
    })
    .finally(() => {
      creating.value = false
    })
}

/** 租户自助导出：导出当前登录账号所属租户的数据包 */
function handleSelfExport() {
  selfExporting.value = true
  selfExportTenantPackage()
    .then(() => {
      modal.msgSuccess(t('backup.tip.selfExportSuccess'))
      getList()
    })
    .catch((err: unknown) => {
      if (import.meta.env.DEV) console.error('Self export failed:', err)
    })
    .finally(() => {
      selfExporting.value = false
    })
}

function handleRestore(row: SysBackupLog) {
  modal
    .confirm(t('backup.tip.confirmRestore', { name: row.fileName }))
    .then(() => {
      return restoreBackup(row.backupId)
    })
    .then(() => {
      modal.msgSuccess(t('backup.tip.restoreSuccess'))
    })
    .catch((err: unknown) => {
      if (err !== 'cancel' && err !== 'close') {
        if (import.meta.env.DEV) console.error('Restore failed:', err)
      }
    })
}

/**
 * 备份类型标签元信息（手动/自动/租户数据包）
 *
 * `tenant_export` 为租户数据包导出（只导出不导入，故表格中「恢复」按钮对其禁用），
 * 复用同一张 `sys_backup_log` 表与下载/删除链路，无需独立列表页。
 */
function backupTypeMeta(backupType: string): { label: string; tag: 'info' | 'success' | 'warning' } {
  if (backupType === 'manual') return { label: t('backup.form.manual'), tag: 'info' }
  if (backupType === 'tenant_export') return { label: t('backup.form.tenantExport'), tag: 'warning' }
  return { label: t('backup.form.auto'), tag: 'success' }
}

function handleDownload(row: SysBackupLog) {
  downloadingIds.value = [...downloadingIds.value, row.backupId]
  downloadBackup(row.backupId, row.fileName)
    .catch((err: unknown) => {
      if (import.meta.env.DEV) console.error('Download failed:', err)
      modal.msgError(t('backup.tip.downloadFail'))
    })
    .finally(() => {
      downloadingIds.value = downloadingIds.value.filter((id: number) => id !== row.backupId)
    })
}

/** 删除按钮操作 - 覆盖以使用 count 提示和 join(',') 调用 */
function handleDelete(row?: SysBackupLog) {
  const deleteIds = row ? [row.backupId] : ids.value
  if (!deleteIds.length) return
  modal
    .confirm(t('backup.tip.confirmDelete', { count: deleteIds.length }))
    .then(() => {
      return delBackup(deleteIds.join(',') as unknown as number)
    })
    .then(() => {
      modal.msgSuccess(t('common.deleteSuccess'))
      getList()
    })
    .catch(() => {})
}

getList()
</script>

<style lang="scss" scoped>
/* 备份列表表格行 hover 过渡 */
:deep(.el-table__row) {
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

/* 状态/类型标签切换过渡 */
:deep(.el-tag) {
  transition: all 0.2s ease;
}

/* 操作按钮点击反馈 */
:deep(.el-button) {
  transition: all 0.15s ease;
}
</style>
