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
        <el-button icon="Refresh" @click="getList">{{ t('common.refresh') }}</el-button>
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
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" class="mb8">
        <el-form-item :label="t('file.search.fileName')" prop="fileName">
          <el-input
            v-model="queryParams.fileName"
            :aria-label="t('file.search.fileName')"
            :placeholder="t('file.search.phFileName')"
            :maxlength="100"
            clearable
            @keyup.enter="handleQuery"
            class="w-[180px]"
          />
        </el-form-item>
        <el-form-item :label="t('file.search.type')" prop="ext">
          <el-select
            :aria-label="t('file.search.type')"
            v-model="queryParams.ext"
            :placeholder="t('file.search.phType')"
            clearable
            class="w-[120px]"
            @change="handleQuery"
          >
            <el-option v-for="ext in extOptions" :key="ext" :label="ext" :value="ext" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button v-hasPermi="['system:file:list']" type="primary" icon="Search" @click="handleQuery">
            {{ t('common.search') }}
          </el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-table
      v-loading="loading"
      :data="dataList"
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
          <el-tooltip v-else-if="isPdf(row.ext)" :content="t('file.btn.previewPdf')" placement="top">
            <!-- 已有 role="button" + 可访问名，但 el-icon 渲染成 <i> 仍不可聚焦：补 tabindex 与键盘激活 -->
            <el-icon
              size="32"
              class="cursor-pointer text-text-secondary transition-all duration-200 hover:scale-110 hover:text-primary"
              role="button"
              tabindex="0"
              :aria-label="t('file.btn.previewPdf')"
              @click="handlePdfPreview(row)"
              @keydown.enter.prevent="handlePdfPreview(row)"
              @keydown.space.prevent="handlePdfPreview(row)"
            >
              <Document />
            </el-icon>
          </el-tooltip>
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
    <!-- PDF 在线预览（G-06 缺口②）：同源代理 blob → objectURL → iframe，
         鉴权与下载同链（带 Authorization），关闭时 revoke 释放 -->
    <el-dialog
      v-model="pdfPreview.open"
      :title="pdfPreview.name"
      width="min(92%, 1100px)"
      top="4vh"
      append-to-body
      destroy-on-close
      @closed="revokePdfUrl"
    >
      <div v-loading="pdfPreview.loading" class="min-h-[60vh]">
        <iframe
          v-if="pdfPreview.url && !pdfPreview.loading"
          :src="pdfPreview.url"
          class="w-full h-[76vh] border-0 rounded"
          :title="pdfPreview.name"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="SystemFile">
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useCrudTable } from '@/composables/useCrudTable'
import { Document } from '@element-plus/icons-vue'
import type { UploadRequestOptions } from 'element-plus'
import download from '@/plugins/download'
import modal from '@/plugins/modal'
import { listFiles, uploadFile, deleteFile, downloadFileBlob } from '@/api/system/file'
import type { FileInfo } from '@/api/system/file'
import { shouldChunk, uploadFileChunked } from '@/api/upload'
import { copyText as writeClipboard } from '@/utils/clipboard'

const { t } = useI18n()

const showSearch = ref(true)

const queryParams = ref({
  pageNum: 1,
  pageSize: 20,
  fileName: '',
  ext: ''
})

// 本页无新增/编辑表单（上传/删除为独立流程）：getApi/addApi/updateApi 按惯例传空实现；
// 删除按 fileName 逐个调用且批量删除需 allSettled 部分成功统计，故删除保留页面级实现
const form = ref({}) as Ref<FileInfo>
const formRef = ref<unknown>(null)
const queryRef = useTemplateRef('queryRef')

const {
  dataList,
  loading,
  showSearch: _unusedShowSearch,
  total,
  loadError,
  retryLoad,
  ids,
  multiple,
  getList,
  handleQuery,
  resetQuery,
  handleSelectionChange
} = useCrudTable<FileInfo, { pageNum: number; pageSize: number; fileName: string; ext: string }>({
  // 后端 /system/file/list 响应可能包一层 data：兼容 { data: { rows, total } } 与 { rows, total }
  listApi: (params) =>
    listFiles(params).then((res: unknown) => {
      const r = res as { data?: { rows?: FileInfo[]; total?: number }; rows?: FileInfo[]; total?: number }
      return { rows: r.data?.rows || r.rows || [], total: r.data?.total || r.total || 0 }
    }),
  idField: 'fileName',
  defaultForm: () => ({}) as FileInfo,
  titleKey: 'file.column.fileName',
  queryParams,
  form,
  formRef: formRef as never,
  queryRef
})

void _unusedShowSearch
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)

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

function beforeUpload(file: File): boolean {
  // 体积不在这里一刀切（b118）：>8MB 走分片链，上限由后端 common_chunk_max_total_size
  // 裁决并在 init 阶段快速失败——前端写死 10MB 会让文件管理页永久失去上传大文件的能力，
  // 而分片链（断点续传 + 服务端权威进度）早已可用（口径与 components/FileUpload 一致）。
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

/**
 * 分片上传遮罩的并发计数（b118）。
 *
 * 文件页支持一次选多个文件；每个 >8MB 文件各自走分片编排器。若每个都 `modal.loading()`，
 * 遮罩会按开栈/关栈各自 LIFO，先完成的上传会关掉别人的遮罩（`closeLoading` 只认栈顶）。
 * 这里共用一个遮罩：第一个分片上传打开、最后一个结束关闭，进度文案由最近一次回调刷新。
 */
let chunkedInFlight = 0
function beginChunkedMask(): void {
  if (chunkedInFlight++ === 0) modal.loading(t('fileUpload.uploadingFile'))
}
function endChunkedMask(): void {
  if (chunkedInFlight > 0 && --chunkedInFlight === 0) modal.closeLoading()
}

async function handleUpload(options: UploadRequestOptions): Promise<void> {
  const file = options.file as File
  const chunked = shouldChunk(file.size)
  try {
    if (chunked) {
      // 分片链：单片请求体 ≤ 全局 body limit，>8MB 的整包单请求会被限长拒绝。
      // 进度只由服务端确认收下的片驱动（api/upload.ts 编排器），失败不谎报。
      beginChunkedMask()
      const result = await uploadFileChunked(file, {
        onProgress: (percent) => modal.updateLoading(t('fileUpload.uploadingProgress', { percent }))
      })
      if (result.code !== 200) throw new Error(result.msg || 'chunk upload failed')
    } else {
      const formData = new FormData()
      formData.append('file', file)
      // 走类型化 api（不手动设 Content-Type：浏览器自动带 boundary，手动设会丢 boundary 致后端解析失败）
      await uploadFile(formData)
    }
    modal.msgSuccess(t('common.uploadSuccess'))
    getList()
  } catch (err) {
    if (import.meta.env.DEV) console.error('[FileMgr] Upload failed:', err)
    // 单请求路径的错误提示由全局拦截器承担（service 实例）；分片链走裸 axios，
    // 不弹这一句的话用户只看到遮罩消失、什么都不知道（b118）。
    if (chunked) modal.msgError(t('fileUpload.uploadFailed'))
  } finally {
    if (chunked) endChunkedMask()
  }
}

/** PDF 在线预览状态（G-06 缺口②） */
const pdfPreview = reactive<{ open: boolean; loading: boolean; url: string; name: string }>({
  open: false,
  loading: false,
  url: '',
  name: ''
})

function isPdf(ext?: string): boolean {
  return (ext || '').toLowerCase() === 'pdf'
}

async function handlePdfPreview(row: FileInfo): Promise<void> {
  pdfPreview.open = true
  pdfPreview.loading = true
  pdfPreview.name = row.fileName
  pdfPreview.url = ''
  try {
    // 与 download.name 同鉴权链（带 Authorization 的同源代理请求），
    // blob → objectURL 交给 iframe 内嵌渲染，不引入 token 查询参数
    const res = await downloadFileBlob(row.fileName)
    pdfPreview.url = URL.createObjectURL(res)
  } catch (err) {
    if (import.meta.env.DEV) console.error('[FileMgr] PDF preview failed:', err)
    modal.msgError(t('file.tip.previewFail'))
    pdfPreview.open = false
  } finally {
    pdfPreview.loading = false
  }
}

function revokePdfUrl(): void {
  if (pdfPreview.url) {
    URL.revokeObjectURL(pdfPreview.url)
    pdfPreview.url = ''
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

async function handleCopyUrl(row: FileInfo): Promise<void> {
  const fullUrl = getFullUrl(row.url)
  // 走 utils/clipboard：自托管 http 内网地址下 navigator.clipboard 不存在（非安全上下文），
  // 原先直调会抛 TypeError 且 Promise 无人接住，按钮表现为"点了什么都不发生"
  if (await writeClipboard(fullUrl)) modal.msgSuccess(t('file.tip.linkCopied'))
  else modal.msgError(t('common.copyFail'))
}

async function handleDelete(row: FileInfo): Promise<void> {
  try {
    await modal.confirm(t('file.tip.confirmDelete', { name: row.fileName }))
    await deleteFile(row.fileName)
    modal.msgSuccess(t('common.deleteSuccess'))
    getList()
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
    const results = await Promise.allSettled(ids.value.map((fileName: string) => deleteFile(fileName)))
    const successCount = results.filter((r: PromiseSettledResult<unknown>) => r.status === 'fulfilled').length
    const failCount = results.length - successCount
    if (failCount === 0) {
      modal.msgSuccess(t('common.batchDeleteSuccess'))
    } else {
      modal.msgWarning(
        t('file.tip.batchDeletePartial', { success: successCount, total: results.length, fail: failCount })
      )
    }
    getList()
  } catch (err) {
    if (err !== 'cancel' && import.meta.env.DEV) console.error('[FileMgr] Batch delete failed:', err)
  }
}

onMounted(getList)
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
