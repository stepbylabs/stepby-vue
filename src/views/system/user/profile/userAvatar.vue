<template>
  <div
    class="user-info-head relative inline-block h-[120px]"
    role="button"
    tabindex="0"
    :aria-label="t('profile.avatar.uploadTip')"
    @click="editCropper()"
    @keydown.enter.prevent="editCropper()"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    :class="{ 'drag-over': isDragOver }"
  >
    <img
      :src="options.img"
      :title="t('profile.avatar.uploadTip')"
      :alt="t('profile.avatar.currentAvatar')"
      class="img-circle img-lg"
      loading="lazy"
      @error="onAvatarError"
    />
    <el-dialog
      :title="t('profile.avatar.modifyTitle')"
      v-model="open"
      width="min(80%, 800px)"
      append-to-body
      @opened="modalOpened"
      @close="closeDialog"
      destroy-on-close
    >
      <el-row>
        <el-col :xs="24" :md="12" :style="{ height: '350px' }">
          <Transition name="fade">
            <vue-cropper
              ref="cropper"
              :img="options.img"
              :info="true"
              :autoCrop="options.autoCrop"
              :autoCropWidth="options.autoCropWidth"
              :autoCropHeight="options.autoCropHeight"
              :fixedBox="options.fixedBox"
              :outputType="options.outputType"
              @realTime="realTime"
              v-if="visible"
            />
          </Transition>
        </el-col>
        <el-col :xs="24" :md="12" :style="{ height: '350px' }">
          <div class="avatar-upload-preview">
            <img
              :src="options.previews.url"
              :style="options.previews.img"
              :alt="t('profile.avatar.previewAlt')"
              loading="lazy"
            />
          </div>
        </el-col>
      </el-row>
      <div class="h-4"></div>
      <el-row>
        <el-col :lg="2" :md="2">
          <el-upload
            action="#"
            :http-request="requestUpload"
            :show-file-list="false"
            :before-upload="beforeUpload"
            accept="image/jpeg,image/png,image/gif"
          >
            <el-button>
              {{ t('common.upload') }}
              <el-icon class="el-icon--right"><Upload /></el-icon>
            </el-button>
          </el-upload>
        </el-col>
        <el-col :lg="{ span: 1, offset: 2 }" :md="2">
          <el-button icon="Plus" :aria-label="t('profile.avatar.zoomIn')" @click="changeScale(1)"></el-button>
        </el-col>
        <el-col :lg="{ span: 1, offset: 1 }" :md="2">
          <el-button icon="Minus" :aria-label="t('profile.avatar.zoomOut')" @click="changeScale(-1)"></el-button>
        </el-col>
        <el-col :lg="{ span: 1, offset: 1 }" :md="2">
          <el-button icon="RefreshLeft" :aria-label="t('profile.avatar.rotateLeft')" @click="rotateLeft()"></el-button>
        </el-col>
        <el-col :lg="{ span: 1, offset: 1 }" :md="2">
          <el-button
            icon="RefreshRight"
            :aria-label="t('profile.avatar.rotateRight')"
            @click="rotateRight()"
          ></el-button>
        </el-col>
        <el-col :lg="{ span: 2, offset: 6 }" :md="2">
          <el-button type="primary" :loading="submitLoading" @click="uploadImg()">{{ t('common.submit') }}</el-button>
        </el-col>
      </el-row>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// VueCropper 依赖较重且仅在头像编辑弹窗打开时使用，懒加载 JS+CSS 以减小主包体积
const VueCropper = defineAsyncComponent(async () => {
  await import('vue-cropper/dist/index.css')
  const m = await import('vue-cropper')
  return m.VueCropper
})
import { uploadAvatar } from '@/api/system/user'
import useUserStore from '@/store/modules/user'
import modal from '@/plugins/modal'
import { verifyImageMagicBytes } from '@/utils/validate'
import defAva from '@/assets/images/profile.webp'

const { t } = useI18n()
const userStore = useUserStore()
const cropperRef = useTemplateRef('cropper')

const open = ref<boolean>(false)
const visible = ref<boolean>(false)
const submitLoading = ref<boolean>(false)
// TierB-4: 拖拽上传支持
const isDragOver = ref<boolean>(false)

//图片裁剪数据
interface CropperPreview {
  url?: string
  img?: Record<string, string> | string
}

interface CropperOptions {
  img: string
  autoCrop: boolean
  autoCropWidth: number
  autoCropHeight: number
  fixedBox: boolean
  outputType: string
  filename: string
  previews: CropperPreview
}

const options = reactive<CropperOptions>({
  img: userStore.avatar, // 裁剪图片的地址
  autoCrop: true, // 是否默认生成截图框
  autoCropWidth: 200, // 默认生成截图框宽度
  autoCropHeight: 200, // 默认生成截图框高度
  fixedBox: true, // 固定截图框大小 不允许改变
  outputType: 'png', // 默认生成截图为PNG格式
  filename: 'avatar', // 文件名称
  previews: {} //预览数据
})

// 监听 userStore.avatar 变化，同步到 options.img
// 解决 reactive 初始化快照不更新的问题（getInfo 完成后 avatar 才有值）
watch(
  () => userStore.avatar,
  (newAvatar: string) => {
    // 仅在弹窗关闭状态同步，避免覆盖用户正在裁剪的新图
    if (!open.value) {
      options.img = newAvatar
    }
  }
)

// 头像加载失败时回退到默认头像
function onAvatarError(e: Event): void {
  const img = e.target as HTMLImageElement
  if (img.src !== defAva) {
    img.src = defAva
  }
}

/** 编辑头像 */
function editCropper() {
  open.value = true
}

/** 打开弹出层结束时的回调 */
function modalOpened() {
  visible.value = true
}

/** 覆盖默认上传行为 */
function requestUpload() {}

/** 向左旋转 */
function rotateLeft() {
  cropperRef.value?.rotateLeft()
}

/** 向右旋转 */
function rotateRight() {
  cropperRef.value?.rotateRight()
}

/** 图片缩放 */
function changeScale(num: number) {
  num = num || 1
  cropperRef.value?.changeScale(num)
}

/** 上传预处理（FE-002：magic bytes 校验替代 file.type 扩展名推断） */
async function beforeUpload(file: File) {
  const isValid = await verifyImageMagicBytes(file, ['jpeg', 'png', 'gif'])
  if (!isValid) {
    modal.msgError(t('profile.avatar.formatError'))
    return false
  }
  const reader = new FileReader()
  reader.readAsDataURL(file)
  reader.onload = () => {
    options.img = reader.result
    options.filename = file.name
  }
  return true
}

/** TierB-4: 拖拽上传 - dragover 处理 */
function onDragOver(): void {
  isDragOver.value = true
}

/** TierB-4: 拖拽上传 - dragleave 处理 */
function onDragLeave(): void {
  isDragOver.value = false
}

/** TierB-4: 拖拽上传 - drop 处理 */
async function onDrop(e: DragEvent): Promise<void> {
  try {
    isDragOver.value = false
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return
    const file = e.dataTransfer.files[0]
    if (!file) return
    // 复用 beforeUpload 的校验逻辑（magic 校验失败返回 false，禁止打开裁剪框）
    const ok = await beforeUpload(file)
    if (!ok) return
    // 自动打开裁剪对话框
    open.value = true
  } catch {
    // 忽略拖拽上传错误
  }
}

/** 上传图片 */
function uploadImg() {
  cropperRef.value?.getCropBlob((data: Blob) => {
    const formData = new FormData()
    formData.append('avatarfile', data, options.filename)
    submitLoading.value = true
    uploadAvatar(formData)
      .then((_response) => {
        open.value = false
        // 上传成功后调用 getInfo 重新拉取用户信息，让 user store 统一处理 avatar 前缀拼接
        // 避免此处手动拼前缀与 getInfo 中的逻辑不一致（FE-AVATAR-001）
        userStore
          .getInfo()
          .then(() => {
            options.img = userStore.avatar
            visible.value = false
          })
          .catch(() => {})
        modal.msgSuccess(t('common.editSuccess'))
      })
      .catch(() => {})
      .finally(() => {
        submitLoading.value = false
      })
  })
}

/** 实时预览 */
function realTime(data: CropperPreview) {
  options.previews = data
}

/** 关闭窗口 */
function closeDialog() {
  options.img = userStore.avatar
  // P0 修复: visible 是顶层 ref，不是 options 的属性
  visible.value = false
}
</script>

<style lang="scss" scoped>
.user-info-head:hover:after {
  content: '+';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  color: var(--el-color-white);
  background: rgba(0, 0, 0, 0.5);
  font-size: 24px;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  cursor: pointer;
  line-height: 110px;
  border-radius: 50%;
}

/* TierB-4: 拖拽上传视觉反馈 */
.user-info-head.drag-over {
  outline: 3px dashed var(--el-color-primary, #409eff);
  outline-offset: 4px;
  border-radius: 50%;
}

.user-info-head.drag-over:after {
  content: '↓';
  background: color-mix(in srgb, var(--el-color-primary) 70%, transparent);
  line-height: 110px;
}
</style>
