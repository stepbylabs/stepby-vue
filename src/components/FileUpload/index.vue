<template>
  <div class="upload-file">
    <el-upload
      multiple
      :action="uploadFileUrl"
      :before-upload="handleBeforeUpload"
      :file-list="fileList"
      :data="data"
      :limit="limit"
      :on-error="handleUploadError"
      :on-exceed="handleExceed"
      :on-success="handleUploadSuccess"
      :show-file-list="false"
      :headers="headers"
      class="upload-file-uploader mb-[5px]"
      ref="fileUpload"
      v-if="!disable" >
      <!-- 上传按钮 -->
      <el-button type="primary">{{ t('fileUpload.selectFile') }}</el-button>
    </el-upload>
    <!-- 上传提示 -->
    <div class="el-upload__tip" v-if="showTip && !disabled">
      {{ t('fileUpload.uploadTip') }}
      <template v-if="fileSize">
        {{ t('fileUpload.maxSize') }}
        <b class="text-[var(--el-color-danger)]">{{ fileSize }}MB</b>
      </template>
      <template v-if="fileType">
        {{ t('fileUpload.format') }}
        <b class="text-[var(--el-color-danger)]">{{ fileType.join('/') }}</b>
      </template>
      {{ t('fileUpload.fileSuffix') }}
    </div>
    <!-- 文件列表 -->
    <transition-group
      ref="uploadFileList"
      class="upload-file-list el-upload-list el-upload-list--text"
      name="el-fade-in-linear"
      tag="u" >
      <li :key="file.uid" class="el-upload-list__item ele-upload-list__item-content" v-for="(file, index) in fileList">
        <el-link :href="`${baseUrl}${file.url}`" underline="never" target="_blank">
          <span class="el-icon-document">{{ getFileName(file.name) }}</span>
        </el-link>
        <div class="ele-upload-list__item-content-action">
          <el-link underline="never" @click="handleDelete(index)" type="danger" v-if="!disabled">
            &nbsp;{{ t('fileUpload.delete') }}
          </el-link>
        </div>
      </li>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { getToken } from '@/utils/auth'
import Sortable from 'sortablejs'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'
import modal from '@/plugins/modal'
import type { UploadFile as ElUploadFile } from 'element-plus'
import type { UploadFileResult } from '@/types/api/common'

const { t } = useI18n()

interface UploadFileItem {
  uid?: number | string
  name: string
  url: string
}

const props = defineProps({
  modelValue: [String, Object, Array],
  // 上传接口地址
  action: {
    type: String,
    default: '/common/upload'
  },
  // 上传携带的参数
  data: {
    type: Object
  },
  // 数量限制
  limit: {
    type: Number,
    default: 5
  },
  // 大小限制(MB)
  fileSize: {
    type: Number,
    default: 5
  },
  // 文件类型, 例如['png', 'jpg', 'jpeg']
  fileType: {
    type: Array as () => string[],
    default: () => ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'pdf']
  },
  // 是否显示提示
  isShowTip: {
    type: Boolean,
    default: true
  },
  // 禁用组件（仅查看文件）
  disabled: {
    type: Boolean,
    default: false
  },
  // 拖动排序
  drag: {
    type: Boolean,
    default: true
  }
})

const fileUploadRef = useTemplateRef('fileUpload')
const uploadFileListRef = useTemplateRef('uploadFileList')
const emit = defineEmits(['update:modelValue'])
const number = ref(0)
let sortableInstance: InstanceType<typeof Sortable> | null = null
const uploadList = ref<UploadFileItem[]>([])
const baseUrl = import.meta.env.VITE_APP_BASE_API
const uploadFileUrl = ref(import.meta.env.VITE_APP_BASE_API + props.action) // 上传文件服务器地址
const headers = computed(() => ({ Authorization: 'Bearer ' + getToken() }))
const fileList = ref<UploadFileItem[]>([])
const showTip = computed(() => props.isShowTip && (props.fileType || props.fileSize))

watch(
  () => props.modelValue,
  (val: string | string[] | undefined) => {
    if (val) {
      let temp = 1
      // 首先将值转为数组
      const list: (string | UploadFileItem)[] = Array.isArray(val) ? val : String(val).split(',')
      // 然后将数组转为对象数组
      fileList.value = list.map((item: string | UploadFileItem) => {
        const normalized: UploadFileItem = typeof item === 'string' ? { name: item, url: item } : { ...item }
        normalized.uid = normalized.uid || new Date().getTime() + temp++
        return normalized
      })
    } else {
      fileList.value = []
      return []
    }
  },
  { deep: true, immediate: true }
)

// 上传前校检格式和大小
function handleBeforeUpload(file: File): boolean {
  // 校检文件类型
  if (props.fileType.length > 0) {
    const fileName = file.name.split('.')
    const fileExt = fileName[fileName.length - 1]
    const isTypeOk = props.fileType.indexOf(fileExt) >= 0
    if (!isTypeOk) {
      modal.msgError(t('fileUpload.fileFormatError', { types: props.fileType.join('/') }))
      return false
    }
  }
  // 校检文件名是否包含特殊字符
  if (file.name.includes(',')) {
    modal.msgError(t('fileUpload.fileNameError'))
    return false
  }
  // 校检文件大小
  if (props.fileSize) {
    const isLt = file.size / 1024 / 1024 < props.fileSize
    if (!isLt) {
      modal.msgError(t('fileUpload.fileSizeExceeded', { size: props.fileSize }))
      return false
    }
  }
  modal.loading(t('fileUpload.uploadingFile'))
  number.value++
  return true
}

// 文件个数超出
function handleExceed(): void {
  modal.msgError(t('fileUpload.fileCountExceed', { limit: props.limit }))
}

// 上传失败
function handleUploadError(err: unknown): void {
  // 检查 401 未授权，触发重新登录
  const errObj = err as { status?: number; response?: { status?: number } } | undefined
  const status = errObj?.status || errObj?.response?.status
  if (status === 401) {
    modal.closeLoading()
    useUserStore()
      .logOut()
      .then(() => {
        // P1 修复: 跳 /login 而非 /index，避免二次重定向（与 request.ts 一致）
        goLogin()
      })
      .catch(() => {
        goLogin()
      })
    return
  }
  modal.msgError(t('fileUpload.uploadFailed'))
  modal.closeLoading()
}

// 上传成功回调
function handleUploadSuccess(res: UploadFileResult, file: ElUploadFile): void {
  if (res.code === 200) {
    uploadList.value.push({ name: res.fileName, url: res.fileName })
    uploadedSuccessfully()
  } else {
    number.value--
    modal.closeLoading()
    modal.msgError(res.msg)
    fileUploadRef.value?.handleRemove(file)
    uploadedSuccessfully()
  }
}

// 删除文件
function handleDelete(index: number): void {
  fileList.value.splice(index, 1)
  emit('update:modelValue', listToString(fileList.value))
}

// 上传结束处理
function uploadedSuccessfully(): void {
  if (number.value > 0 && uploadList.value.length === number.value) {
    fileList.value = fileList.value.filter((f: UploadFileItem) => f.url !== undefined).concat(uploadList.value)
    uploadList.value = []
    number.value = 0
    emit('update:modelValue', listToString(fileList.value))
    modal.closeLoading()
  }
}

// 获取文件名称
function getFileName(name: string): string {
  // 如果是url那么取最后的名字 如果不是直接返回
  if (name.lastIndexOf('/') > -1) {
    return name.slice(name.lastIndexOf('/') + 1)
  } else {
    return name
  }
}

// 对象转成指定字符串分隔
function listToString(list: UploadFileItem[], separator?: string): string {
  let strs = ''
  separator = separator || ','
  for (const i in list) {
    if (list[i].url) {
      strs += list[i].url + separator
    }
  }
  return strs != '' ? strs.slice(0, strs.length - 1) : ''
}

// 初始化或重建拖拽排序实例
function setupSortable(): void {
  // 先销毁旧实例
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
  if (!props.drag || props.disabled) return
  nextTick(() => {
    const element = uploadFileListRef.value?.$el || (uploadFileListRef.value as HTMLElement)
    if (element) {
      sortableInstance = Sortable.create(element, {
        animation: 200,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        ghostClass: 'file-upload-darg',
        chosenClass: 'sortable-chosen',
        onEnd: (evt) => {
          const movedItem = fileList.value.splice(evt.oldIndex, 1)[0]
          fileList.value.splice(evt.newIndex, 0, movedItem)
          emit('update:modelValue', listToString(fileList.value))
        }
      })
    }
  })
}

// P2 修复: 监听 drag/disabled 变化，重建 Sortable 实例
watch(
  () => [props.drag, props.disabled],
  () => {
    setupSortable()
  }
)

onMounted(() => {
  setupSortable()
})

onBeforeUnmount(() => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
})
</script>
<style scoped lang="scss">
.file-upload-darg {
  opacity: 0.5;
  background: var(--el-color-primary-light-9);
}
.upload-file-list .el-upload-list__item {
  border: 1px solid var(--el-border-color);
  line-height: 2;
  margin-bottom: 10px;
  position: relative;
  // 保留 el-upload-list__item 自带过渡（移除 transition: none !important）
}
.upload-file-list .ele-upload-list__item-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: inherit;
}
.ele-upload-list__item-content-action .el-link {
  margin-right: 10px;
}
</style>
