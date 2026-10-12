<template>
  <el-dialog
    :title="displayTitle"
    v-model="visible"
    :width="width"
    append-to-body
    @close="handleClose"
    destroy-on-close
  >
    <el-upload
      ref="uploadRef"
      :limit="1"
      accept=".xlsx, .xls"
      :headers="headers"
      :action="uploadUrl"
      :disabled="isUploading"
      :on-progress="handleProgress"
      :on-change="handleFileChange"
      :on-remove="handleFileRemove"
      :on-success="handleSuccess"
      :on-error="handleError"
      :auto-upload="false"
      drag
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">
        {{ t('excelImport.dragText') }}
        <em>{{ t('excelImport.clickUpload') }}</em>
      </div>
      <template #tip>
        <div class="el-upload__tip text-center">
          <div class="el-upload__tip">
            <el-checkbox v-model="updateSupport">{{ displayUpdateSupportLabel }}</el-checkbox>
          </div>
          <span>{{ t('excelImport.tip') }}</span>
          <el-link
            v-if="templateUrl"
            type="primary"
            underline="never"
            class="text-xs align-baseline"
            @click="handleDownloadTemplate"
          >
            {{ t('excelImport.downloadTemplate') }}
          </el-link>
        </div>
      </template>
    </el-upload>
    <template v-if="result">
      <el-alert
        class="mt-3"
        :type="errorList.length ? 'warning' : 'success'"
        :title="resultMessage"
        :closable="false"
        show-icon
      />
      <el-table
        v-if="errorList.length"
        :data="errorList"
        size="small"
        max-height="260"
        border
        class="mt-3"
        :header-cell-style="{ background: '#f5f7fa' }"
      >
        <el-table-column :label="t('excelImport.column.rowNum')" prop="rowNum" align="center" width="100" />
        <el-table-column :label="t('excelImport.column.error')" prop="error" min-width="240" show-overflow-tooltip />
      </el-table>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" :loading="isUploading" @click="handleSubmit">
          {{ t('excelImport.confirm') }}
        </el-button>
        <el-button @click="visible = false">{{ t('excelImport.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import type { UploadInstance, UploadFile } from 'element-plus'
import type { AjaxResult } from '@/types/api/common'
import { getToken } from '@/utils/auth'
import modal from '@/plugins/modal'
import { download } from '@/utils/request'

// 后端导入结果（AjaxResult.data）：成功数 + 校验失败明细
interface ImportResultData {
  success: number
  errorList: { rowNum: number; error: string }[]
}

const { t } = useI18n()

const props = defineProps({
  // 对话框标题
  title: {
    type: String,
    default: undefined
  },
  // 对话框宽度
  width: {
    type: String,
    default: '480px'
  },
  // 上传接口地址（必传）
  action: {
    type: String,
    required: true
  },
  // 模板下载接口地址，不传则不显示下载模板链接
  templateAction: {
    type: String,
    default: ''
  },
  // 模板文件名前缀
  templateFileName: {
    type: String,
    default: 'template'
  },
  // 覆盖更新勾选框的说明文字
  updateSupportLabel: {
    type: String,
    default: undefined
  }
})

// props 默认值通过 computed 实现 i18n 响应式
const displayTitle = computed(() => props.title || t('excelImport.title'))
const displayUpdateSupportLabel = computed(() => props.updateSupportLabel || t('excelImport.updateSupportLabel'))

const emit = defineEmits(['success'])

const uploadRef = useTemplateRef<UploadInstance>('uploadRef')
const visible = ref<boolean>(false)
const selectedFile = ref<UploadFile | null>(null)
const isUploading = ref<boolean>(false)
const updateSupport = ref<boolean>(false)
const errorList = ref<{ rowNum: number; error: string }[]>([])
const successCount = ref<number>(0)
const result = computed(() => successCount.value > 0 || errorList.value.length > 0)
const resultMessage = computed(() =>
  errorList.value.length
    ? t('excelImport.successCount', { success: successCount.value, error: errorList.value.length })
    : t('excelImport.allSuccess')
)
const headers = computed(() => ({ Authorization: 'Bearer ' + getToken() }))

const uploadUrl = computed(() => {
  return import.meta.env.VITE_APP_BASE_API + props.action + '?updateSupport=' + (updateSupport.value ? 1 : 0)
})

const templateUrl = computed(() => !!props.templateAction)

// 打开对话框（供父组件通过 ref 调用）
function open(): void {
  updateSupport.value = false
  isUploading.value = false
  successCount.value = 0
  errorList.value = []
  visible.value = true
  nextTick(() => {
    selectedFile.value = null
    uploadRef.value?.clearFiles()
  })
}

// 关闭时清理
function handleClose(): void {
  isUploading.value = false
  selectedFile.value = null
  successCount.value = 0
  errorList.value = []
  uploadRef.value?.clearFiles()
}

// 下载模板
function handleDownloadTemplate(): void {
  download(props.templateAction, {}, `${props.templateFileName}_${new Date().getTime()}.xlsx`)
}

// 上传进度
function handleProgress(): void {
  isUploading.value = true
}

/** 文件选择处理 */
const handleFileChange = (file: UploadFile): void => {
  selectedFile.value = file
  // 重新选择文件时清空上一次的导入结果
  successCount.value = 0
  errorList.value = []
}

/** 文件删除处理 */
const handleFileRemove = (_file: UploadFile) => {
  selectedFile.value = null
  successCount.value = 0
  errorList.value = []
}

/**
 * 上传成功：解析后端 AjaxResult，提取成功数 + 校验失败明细。
 * - 存在失败行时保留对话框并回显错误表，供用户修正后重试
 * - 全部成功时给出提示并触发 success 事件（父组件刷新数据）
 */
function handleSuccess(response: AjaxResult & { data?: ImportResultData }) {
  isUploading.value = false
  const data = response?.data
  successCount.value = data?.success ?? 0
  errorList.value = data?.errorList ?? []
  if (errorList.value.length === 0) {
    const msg = response?.msg || t('excelImport.allSuccess') + '（' + successCount.value + '）'
    visible.value = false
    ElMessageBox.alert(msg, t('excelImport.importResult'))
    emit('success')
  }
}

// 上传失败（HTTP 非 2xx）
function handleError(_err: Error, _file: UploadFile) {
  isUploading.value = false
  modal.msgError(t('common.failed'))
}

// 提交上传
function handleSubmit() {
  const file = selectedFile.value
  if (!file || (!file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx'))) {
    modal.msgError(t('excelImport.fileTypeError'))
    return
  }
  uploadRef.value.submit()
}

defineExpose({ open })
</script>
