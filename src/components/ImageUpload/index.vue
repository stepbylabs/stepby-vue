<template>
  <div class="component-upload-image">
    <el-upload
      multiple
      :disabled="disabled"
      list-type="picture-card"
      :http-request="handleHttpRequest"
      :on-success="handleUploadSuccess"
      :before-upload="handleBeforeUpload"
      :data="data"
      :limit="limit"
      :on-error="handleUploadError"
      :on-exceed="handleExceed"
      ref="imageUpload"
      :before-remove="handleDelete"
      :show-file-list="true"
      :file-list="fileList"
      :on-preview="handlePictureCardPreview"
      :class="{ hide: fileList.length >= limit }"
    >
      <el-icon class="avatar-uploader-icon"><plus /></el-icon>
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

    <el-dialog
      v-model="dialogVisible"
      :title="t('imageUpload.preview')"
      width="min(80%, 800px)"
      append-to-body
      destroy-on-close
    >
      <img :src="dialogImageUrl" :alt="t('imageUpload.imagePreview')" loading="lazy" class="block max-w-full mx-auto" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { isExternal, verifyImageMagicBytes } from '@/utils/validate'
import Sortable from 'sortablejs'
import modal from '@/plugins/modal'
import type { UploadFile as ElUploadFile } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import type { UploadFileResult } from '@/types/api/common'
import { uploadViaRequest } from '@/utils/uploadRequest'

const { t } = useI18n()

interface UploadImageItem {
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
  // 图片数量限制
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
    default: () => ['png', 'jpg', 'jpeg']
  },
  // 是否显示提示
  isShowTip: {
    type: Boolean,
    default: true
  },
  // 禁用组件（仅查看图片）
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

const imageUploadRef = useTemplateRef('imageUpload')
const emit = defineEmits(['update:modelValue'])
const number = ref(0)
let sortableInstance: InstanceType<typeof Sortable> | null = null
const uploadList = ref<UploadImageItem[]>([])
const dialogImageUrl = ref('')
const dialogVisible = ref(false)
const baseUrl = import.meta.env.VITE_APP_BASE_API
// C-1：使用 computed 保证 token 刷新后上传携带最新 token（ref 会在初始化时固化旧值）
const fileList = ref<UploadImageItem[]>([])
const showTip = computed(() => props.isShowTip && (props.fileType || props.fileSize))

watch(
  () => props.modelValue,
  (val: string | string[] | undefined) => {
    if (val) {
      // 首先将值转为数组
      const list: (string | UploadImageItem)[] = Array.isArray(val) ? val : String(val).split(',')
      // 然后将数组转为对象数组
      fileList.value = list.map((item: string | UploadImageItem) => {
        let normalized: UploadImageItem
        if (typeof item === 'string') {
          if (item.indexOf(baseUrl) === -1 && !isExternal(item)) {
            normalized = { name: baseUrl + item, url: baseUrl + item }
          } else {
            normalized = { name: item, url: item }
          }
        } else {
          normalized = { ...item }
        }
        return normalized
      })
    } else {
      fileList.value = []
    }
  },
  { deep: true, immediate: true }
)

// 上传前loading加载
// C-4：使用 magic bytes 校验真实图片类型，扩展名与 file.type 均可被伪造
async function handleBeforeUpload(file: File): Promise<boolean> {
  // 校验文件类型（magic bytes）
  const isValid = await verifyImageMagicBytes(file, props.fileType)
  if (!isValid) {
    modal.msgError(t('imageUpload.fileFormatError', { types: props.fileType.join('/') }))
    return false
  }
  if (file.name.includes(',')) {
    modal.msgError(t('imageUpload.fileNameError'))
    return false
  }
  if (props.fileSize) {
    const isLt = file.size / 1024 / 1024 < props.fileSize
    if (!isLt) {
      modal.msgError(t('imageUpload.fileSizeExceeded', { size: props.fileSize }))
      return false
    }
  }
  modal.loading(t('imageUpload.uploadingImage'))
  number.value++
  return true
}

// 文件个数超出
function handleExceed(): void {
  modal.msgError(t('imageUpload.fileCountExceed', { limit: props.limit }))
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
    imageUploadRef.value?.handleRemove(file)
    uploadedSuccessfully()
  }
}

// 删除图片
function handleDelete(file: ElUploadFile): boolean {
  const findex = fileList.value.map((f: UploadImageItem) => f.name).indexOf(file.name)
  if (findex > -1 && uploadList.value.length === number.value) {
    fileList.value.splice(findex, 1)
    emit('update:modelValue', listToString(fileList.value))
    return false
  }
  return true
}

// 上传结束处理
function uploadedSuccessfully(): void {
  if (number.value > 0 && uploadList.value.length === number.value) {
    fileList.value = fileList.value.filter((f: UploadImageItem) => f.url !== undefined).concat(uploadList.value)
    uploadList.value = []
    number.value = 0
    emit('update:modelValue', listToString(fileList.value))
    modal.closeLoading()
  }
}

/**
 * 自定义传输（b138）：EP 内置 XHR 不经请求层 ⇒ 令牌过期不会触发会话失效、失败没有追踪号。
 * 401 由拦截器统一弹重新登录框，这里不再补提示（同一次失败只一条结局）；其它失败必须可见。
 * 收尾（计数 / 遮罩 / 列表同步）统一交给 EP 随后触发的 `handleUploadError`，避免两处各减一次计数。
 */
async function handleHttpRequest(options: UploadRequestOptions): Promise<void> {
  const outcome = await uploadViaRequest(options, { url: props.action })
  if (outcome.failed && !outcome.sessionExpired) modal.msgError(t('imageUpload.uploadFailed'))
}

// 上传失败（EP 的 onError 必然触发；提示已由 handleHttpRequest 给出，这里只做收尾与 DEV 留痕）
function handleUploadError(err: unknown): void {
  if (import.meta.env.DEV) console.error('[ImageUpload] upload failed:', err)
  // 递减上传计数并触发同步，避免上传失败后 number.value 与 uploadList 长度不匹配
  number.value = Math.max(0, number.value - 1)
  modal.closeLoading()
  uploadedSuccessfully()
}

// 预览
function handlePictureCardPreview(file: ElUploadFile): void {
  dialogImageUrl.value = file.url || ''
  dialogVisible.value = true
}

// 对象转成指定字符串分隔
function listToString(list: UploadImageItem[], separator?: string): string {
  let strs = ''
  separator = separator || ','
  for (const i in list) {
    if (undefined !== list[i].url && list[i].url.indexOf('blob:') !== 0) {
      strs += list[i].url.replace(baseUrl, '') + separator
    }
  }
  return strs !== '' ? strs.slice(0, -1) : ''
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
    const element = imageUploadRef.value?.$el?.querySelector('.el-upload-list') as HTMLElement
    if (element) {
      sortableInstance = Sortable.create(element, {
        animation: 200,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        ghostClass: 'sortable-ghost',
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
// .el-upload--picture-card 控制加号部分
:deep(.hide .el-upload--picture-card) {
  display: none;
}

:deep(.el-upload.el-upload--picture-card.is-disabled) {
  display: none !important;
}
</style>
