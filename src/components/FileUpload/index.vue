<template>
  <div class="upload-file">
    <el-upload
      multiple
      :before-upload="handleBeforeUpload"
      :http-request="handleHttpRequest"
      :file-list="fileList"
      :data="data"
      :limit="limit"
      :on-error="handleUploadError"
      :on-exceed="handleExceed"
      :on-success="handleUploadSuccess"
      :show-file-list="false"
      class="upload-file-uploader mb-[5px]"
      ref="fileUpload"
      v-if="!disabled"
    >
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
      tag="u"
    >
      <li :key="file.uid" class="el-upload-list__item ele-upload-list__item-content" v-for="(file, index) in fileList">
        <el-link :href="`${baseUrl}${file.url}`" underline="never" target="_blank" rel="noopener noreferrer">
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
import Sortable from 'sortablejs'
import modal from '@/plugins/modal'
import type { UploadFile as ElUploadFile } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { uploadViaRequest } from '@/utils/uploadRequest'
// G-10 批次十八：分片上传 / 断点续传（>8MB 自动分流；后端总上限 1GB）
import { shouldChunk, uploadFileChunked } from '@/api/upload'
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
// G-10 批次十八：>8MB 文件自动分流到分片链（before-upload 返回 false 阻止 el-upload
// 默认单请求上传，改走 handleChunkedUpload 编排器）。
//
// b146：`fileSize` 是**策略**、分片阈值是**传输方式**，两者不得互相顶班。改造前分流排在
// 大小校验之前 ⇒ 屏上提示写着「大小不超过 5MB」，而 9MB 的文件绕过校验直接传成功——界面在
// 撒谎（同 b139 的「字段存在但没人消费」：声明与判据分家）。现在两条路径都以声明上限为准，
// 上限之内的 8MB+ 文件仍走分片链（能力没被砍，只是兑现了承诺）；总上限由后端
// common_chunk_max_total_size（1GB）在 init 阶段裁决。
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
  // 校检文件大小（两条路径共用这一道闸）
  if (props.fileSize) {
    const isLt = file.size / 1024 / 1024 < props.fileSize
    if (!isLt) {
      modal.msgError(t('fileUpload.fileSizeExceeded', { size: props.fileSize }))
      return false
    }
  }
  // 分流：在声明上限之内、但超过单请求阈值 ⇒ 走分片链
  if (shouldChunk(file.size)) {
    modal.loading(t('fileUpload.uploadingFile'))
    number.value++
    void handleChunkedUpload(file)
    return false
  }
  modal.loading(t('fileUpload.uploadingFile'))
  number.value++
  return true
}

// G-10 批次十八：分片上传编排（断点续传 / 并发 / 进度见 api/upload.ts 编排器）
// 成功/失败计数与列表收敛复用单请求路径的 uploadList + uploadedSuccessfully 逻辑
async function handleChunkedUpload(file: File): Promise<void> {
  try {
    // b117：把编排器的进度接到遮罩文案上（此前 onProgress 无消费点，>8MB 文件只有静态"请稍候"）
    const result = await uploadFileChunked(file, {
      onProgress: (percent) => modal.updateLoading(t('fileUpload.uploadingProgress', { percent }))
    })
    if (result.code === 200) {
      uploadList.value.push({ name: result.fileName, url: result.fileName })
      uploadedSuccessfully()
    } else {
      throw new Error(result.msg || 'chunk upload failed')
    }
  } catch {
    number.value--
    modal.closeLoading()
    modal.msgError(t('fileUpload.uploadFailed'))
  }
}

// 文件个数超出
function handleExceed(): void {
  modal.msgError(t('fileUpload.fileCountExceed', { limit: props.limit }))
}

/**
 * 自定义传输（b138）：EP 内置 XHR 不经请求层 ⇒ 令牌过期不会触发会话失效、失败没有追踪号。
 * 大文件（>8MB）在 before-upload 就分流到分片链（返回 false，不走这里）。
 * 401 由拦截器统一弹重新登录框，这里不再补提示；其它失败必须可见。
 */
async function handleHttpRequest(options: UploadRequestOptions): Promise<void> {
  const outcome = await uploadViaRequest(options, { url: props.action })
  if (outcome.failed && !outcome.sessionExpired) modal.msgError(t('fileUpload.uploadFailed'))
}

// 上传失败（EP 的 onError 必然触发；提示已由 handleHttpRequest 给出，这里只做收尾与 DEV 留痕）
function handleUploadError(err: unknown): void {
  if (import.meta.env.DEV) console.error('[FileUpload] upload failed:', err)
  // 失败必须从在飞计数里扣掉：否则一次失败会让后续成功的文件永远等不到 number === uploadList.length
  number.value = Math.max(0, number.value - 1)
  modal.closeLoading()
  uploadedSuccessfully()
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
