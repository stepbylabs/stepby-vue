<template>
  <div class="app-container">
    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-upload
          :show-file-list="false"
          :http-request="handleUpload"
          :before-upload="beforeUpload"
          :accept="acceptTypes"
          multiple
        >
          <el-button v-hasPermi="['system:file:upload']" type="primary" icon="Upload">
            {{ t('file.btn.upload') }}
          </el-button>
        </el-upload>
      </el-col>
      <el-col :span="1.5">
        <el-button icon="Refresh" @click="loadList">{{ t('common.refresh') }}</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          v-hasPermi="['system:file:remove']"
          type="danger"
          icon="Delete"
          :disabled="multiple"
          @click="handleBatchDelete"
        >
          {{ t('common.batchDelete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="loadList"></right-toolbar>
    </el-row>

    <Transition name="expand-fade">
      <el-form :model="queryParams" :inline="true" v-show="showSearch" class="mb8">
        <el-form-item :label="t('file.search.fileName')" prop="fileName">
          <el-input
            v-model="queryParams.fileName"
            :placeholder="t('file.search.phFileName')"
            :maxlength="100"
            clearable
            @keyup.enter="loadList"
            class="w-[180px]"
          />
        </el-form-item>
        <el-form-item :label="t('file.search.type')" prop="ext">
          <el-select
            v-model="queryParams.ext"
            :placeholder="t('file.search.phType')"
            clearable
            class="w-[120px]"
            @change="loadList"
          >
            <el-option v-for="ext in extOptions" :key="ext" :label="ext" :value="ext" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button v-hasPermi="['system:file:list']" type="primary" icon="Search" @click="loadList">
            {{ t('common.search') }}
          </el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-table
      v-loading="loading"
      :data="fileList"
      :row-key="(row: { fileName: string }) => row.fileName"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" align="center" width="55" />
      <el-table-column :label="t('file.column.fileName')" prop="fileName" min-width="240" show-overflow-tooltip />
      <el-table-column :label="t('file.column.preview')" width="80" align="center">
        <template #default="{ row }">
          <el-image
            v-if="isImage(row.ext)"
            :src="row.url"
            :preview-src-list="[row.url]"
            fit="cover"
            class="w-10 h-10 rounded transition-all duration-200 hover:scale-110 hover:shadow-md"
            :alt="row.fileName"
            :aria-label="t('file.ariaLabel.preview')"
          />
          <el-icon v-else size="32" class="transition-all duration-200 hover:scale-110" :aria-label="row.fileName">
            <Document />
          </el-icon>
        </template>
      </el-table-column>
      <el-table-column :label="t('file.column.type')" prop="ext" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="extTagType(row.ext)">{{ row.ext || t('file.unknownType') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('file.column.size')" prop="fileSizeStr" width="120" align="right" />
      <el-table-column :label="t('file.column.updateTime')" prop="lastModified" width="180" align="center" />
      <el-table-column :label="t('common.column.operation')" width="220" align="center" fixed="right">
        <template #default="{ row }">
          <el-tooltip :content="t('file.btn.download')" placement="top">
            <el-button
              v-hasPermi="['system:file:download']"
              link
              type="primary"
              icon="Download"
              :aria-label="t('file.ariaLabel.download')"
              @click="handleDownload(row)"
            />
          </el-tooltip>
          <el-tooltip :content="t('file.btn.copyLink')" placement="top">
            <el-button
              v-hasPermi="['system:file:copy']"
              link
              type="primary"
              icon="DocumentCopy"
              :aria-label="t('file.ariaLabel.copyLink')"
              @click="handleCopyUrl(row)"
            />
          </el-tooltip>
          <el-tooltip :content="t('common.delete')" placement="top">
            <el-button
              v-hasPermi="['system:file:remove']"
              link
              type="danger"
              icon="Delete"
              :aria-label="t('common.delete')"
              @click="handleDelete(row)"
            />
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="loadList"
    />
  </div>
</template>

<script setup lang="ts" name="SystemFile">
import { Document } from '@element-plus/icons-vue'
import type { UploadRequestOptions } from 'element-plus'
import request from '@/utils/request'
import download from '@/plugins/download'
import modal from '@/plugins/modal'

const { t } = useI18n()

interface FileInfo {
  fileName: string
  fileSize: number
  fileSizeStr: string
  ext: string
  url: string
  lastModified: string
}

const loading = ref(false)
const fileList = shallowRef<FileInfo[]>([])
const total = ref(0)
const ids = ref<string[]>([])
const multiple = ref(true)
const showSearch = ref(true)

const queryParams = reactive({
  pageNum: 1,
  pageSize: 20,
  fileName: '',
  ext: ''
})

const extOptions = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'txt']
// accept 属性：el-upload 需要逗号分隔字符串（扩展名或 MIME 类型）
const acceptTypes = extOptions.join(',')
// 扩展名 → MIME 类型映射，用于 beforeUpload 对 file.type 精确匹配（避免子串误判）
const extToMime: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  txt: 'text/plain'
}
const acceptMimeSet = new Set(Object.values(extToMime))

function isImage(ext: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif'].includes(ext.toLowerCase())
}

function extTagType(ext: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  if (isImage(ext)) return 'success'
  if (['pdf'].includes(ext)) return 'danger'
  if (['doc', 'docx', 'xls', 'xlsx'].includes(ext)) return 'warning'
  if (['zip'].includes(ext)) return 'info'
  return 'primary'
}

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const res = (await request({
      url: '/system/file/list',
      method: 'get',
      params: queryParams
    })) as { data?: { rows?: FileInfo[]; total?: number }; rows?: FileInfo[]; total?: number }
    fileList.value = res.data?.rows || res.rows || []
    total.value = res.data?.total || res.total || 0
  } catch (err) {
    if (import.meta.env.DEV) console.error('[FileMgr] Failed to load list:', err)
  } finally {
    loading.value = false
  }
}

function resetQuery(): void {
  queryParams.fileName = ''
  queryParams.ext = ''
  queryParams.pageNum = 1
  loadList()
}

function handleSelectionChange(selection: FileInfo[]): void {
  ids.value = selection.map((f) => f.fileName)
  multiple.value = !selection.length
}

function beforeUpload(file: File): boolean {
  // 大小限制 10MB
  if (file.size > 10 * 1024 * 1024) {
    modal.msgError(t('common.fileTooLarge'))
    return false
  }
  // 扩展名白名单校验
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (!extOptions.includes(ext)) {
    modal.msgError(t('file.tip.unsupportedType'))
    return false
  }
  // MIME 类型校验（浏览器能识别时校验）：扩展名 → MIME 映射精确匹配，剥离 charset 参数避免误判
  if (file.type) {
    const baseType = file.type.split(';')[0].trim().toLowerCase()
    if (!acceptMimeSet.has(baseType)) {
      modal.msgError(t('file.tip.unsupportedType'))
      return false
    }
  }
  return true
}

async function handleUpload(options: UploadRequestOptions): Promise<void> {
  const formData = new FormData()
  formData.append('file', options.file)
  try {
    await request({
      url: '/system/file/upload',
      method: 'post',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    modal.msgSuccess(t('common.uploadSuccess'))
    loadList()
  } catch (err) {
    if (import.meta.env.DEV) console.error('[FileMgr] Upload failed:', err)
  }
}

/** 获取完整 URL（相对路径自动拼接 origin，s3 后端返回的已是绝对 URL） */
function getFullUrl(url: string): string {
  return new URL(url, window.location.origin).href
}

function handleDownload(row: FileInfo): void {
  // 统一走 /common/download 存储后端代理（local 读盘 / s3 下载对象），
  // 服务端按 fileName 做路径穿越校验并从受控目录读取，两种后端行为一致；
  // 不再直接跳转子资源 URL（既规避 s3 跨域直链被拦截导致下载失效，也杜绝信任外部 url）。
  download.name(row.fileName, false)
}

function handleCopyUrl(row: FileInfo): void {
  const fullUrl = getFullUrl(row.url)
  navigator.clipboard
    .writeText(fullUrl)
    .then(() => {
      modal.msgSuccess(t('file.tip.linkCopied'))
    })
    .catch(() => {
      modal.msgError(t('common.copyFail'))
    })
}

async function handleDelete(row: FileInfo): Promise<void> {
  try {
    await modal.confirm(t('file.tip.confirmDelete', { name: row.fileName }))
    await request({
      url: '/system/file/delete',
      method: 'delete',
      data: { fileName: row.fileName }
    })
    modal.msgSuccess(t('common.deleteSuccess'))
    loadList()
    // 清除选中状态：避免删除后按钮 disabled 状态与已删除数据不一致
    ids.value = []
    multiple.value = true
  } catch (err) {
    if (err !== 'cancel' && import.meta.env.DEV) console.error('[FileMgr] Delete failed:', err)
  }
}

async function handleBatchDelete(): Promise<void> {
  if (!ids.value.length) return
  try {
    await modal.confirm(t('file.tip.confirmBatchDelete', { count: ids.value.length }))
    // 使用 allSettled：部分失败时仍能正确统计成功/失败数，避免整体 reject 掩盖部分成功
    const results = await Promise.allSettled(
      ids.value.map((fileName: string) =>
        request({
          url: '/system/file/delete',
          method: 'delete',
          data: { fileName }
        })
      )
    )
    const successCount = results.filter((r: PromiseSettledResult<unknown>) => r.status === 'fulfilled').length
    const failCount = results.length - successCount
    if (failCount === 0) {
      modal.msgSuccess(t('common.batchDeleteSuccess'))
    } else {
      modal.msgWarning(
        t('file.tip.batchDeletePartial', { success: successCount, total: results.length, fail: failCount })
      )
    }
    loadList()
  } catch (err) {
    if (err !== 'cancel' && import.meta.env.DEV) console.error('[FileMgr] Batch delete failed:', err)
  }
}

onMounted(loadList)
</script>

<style lang="scss" scoped>
/* 文件列表表格行 hover 过渡 */
:deep(.el-table__row) {
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

/* 类型标签切换过渡 */
:deep(.el-tag) {
  transition: all 0.2s ease;
}
</style>
