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
    default: '400px'
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
const headers = computed(() => ({ Authorization: 'Bearer ' + getToken() }))

const uploadUrl = computed(() => {
  return import.meta.env.VITE_APP_BASE_API + props.action + '?updateSupport=' + (updateSupport.value ? 1 : 0)
})

const templateUrl = computed(() => !!props.templateAction)

// 打开对话框（供父组件通过 ref 调用）
function open(): void {
  updateSupport.value = false
  isUploading.value = false
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
}

/** 文件删除处理 */
const handleFileRemove = (_file: UploadFile) => {
  selectedFile.value = null
}

// 上传成功
function handleSuccess(response: AjaxResult) {
  visible.value = false
  isUploading.value = false
  selectedFile.value = null
  uploadRef.value?.clearFiles()
  ElMessageBox.alert(response.msg, t('excelImport.importResult'))
  emit('success')
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
