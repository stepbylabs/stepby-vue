<template>
  <div>
    <el-upload
      :action="uploadUrl"
      :before-upload="handleBeforeUpload"
      :on-success="handleUploadSuccess"
      :on-error="handleUploadError"
      name="file"
      :show-file-list="false"
      :headers="headers"
      class="editor-img-uploader hidden"
      v-if="type == 'url'"
    >
      <i ref="uploadRef" class="editor-img-uploader hidden"></i>
    </el-upload>
  </div>
  <div class="editor" :style="editorCssVars">
    <quill-editor
      ref="quillEditorRef"
      v-model:content="modelValue"
      contentType="html"
      :options="options"
      :style="styles"
      @ready="handleQuillReady"
    />
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'
import type Quill from 'quill'
import type { UploadInstance } from 'element-plus'
import { getToken } from '@/utils/auth'
import modal from '@/plugins/modal'
import { verifyImageMagicBytes } from '@/utils/validate'
import type { UploadFileResult } from '@/types/api/common'
import { getLanguage } from '@/i18n'

const { t } = useI18n()
const quillEditorRef = useTemplateRef<InstanceType<typeof QuillEditor>>('quillEditorRef')
const uploadRef = useTemplateRef<UploadInstance>('uploadRef')
// P3-4：将 quillInstance 类型从 any 收窄为 Quill | null，便于静态分析与重构
let quillInstance: Quill | null = null
const uploadUrl = ref(import.meta.env.VITE_APP_BASE_API + '/common/upload') // 上传的图片服务器地址
// C-1：使用 computed 保证 token 刷新后上传携带最新 token（ref 会在初始化时固化旧值）
const headers = computed(() => ({ Authorization: 'Bearer ' + getToken() }))

// FE-001：使用 defineModel 替代 props.modelValue + watch + $emit('update:modelValue')
const modelValue = defineModel<string>()

// Vue 3.5 响应式解构默认值替代 withDefaults
const {
  /* 高度 */
  height = null,
  /* 最小高度 */
  minHeight = null,
  /* 只读 */
  readOnly = false,
  /* 上传文件大小限制(MB) */
  fileSize = 5,
  /* 类型（base64格式、url格式） */
  type = 'url'
} = defineProps<{
  height?: number | null
  minHeight?: number | null
  readOnly?: boolean
  fileSize?: number
  type?: string
}>()

const options = computed(() => ({
  theme: 'snow',
  bounds: document.body,
  debug: 'warn',
  modules: {
    // 工具栏配置
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'], // 加粗 斜体 下划线 删除线
      ['blockquote', 'code-block'], // 引用  代码块
      [{ list: 'ordered' }, { list: 'bullet' }], // 有序、无序列表
      [{ indent: '-1' }, { indent: '+1' }], // 缩进
      [{ size: ['small', false, 'large', 'huge'] }], // 字体大小
      [{ header: [1, 2, 3, 4, 5, 6, false] }], // 标题
      [{ color: [] }, { background: [] }], // 字体颜色、字体背景颜色
      [{ align: [] }], // 对齐方式
      ['clean'], // 清除文本格式
      ['link', 'image', 'video'] // 链接、图片、视频
    ]
  },
  placeholder: t('editor.placeholder'),
  readOnly: readOnly
}))

const styles = computed(() => {
  const style: Record<string, string> = {}
  if (minHeight) {
    style.minHeight = `${minHeight}px`
  }
  if (height) {
    style.height = `${height}px`
  }
  return style
})

// CSS 伪元素 content 无法直接使用 t()，通过 CSS 变量注入实现 i18n 响应式更新
const editorCssVars = computed<Record<string, string>>(() => ({
  '--editor-link-placeholder': `'${t('editor.linkPlaceholder')}'`,
  '--editor-save': `'${t('editor.save')}'`,
  '--editor-video-placeholder': `'${t('editor.videoPlaceholder')}'`,
  '--editor-text-normal': `'${t('editor.textNormal')}'`,
  '--editor-heading1': `'${t('editor.heading1')}'`,
  '--editor-heading2': `'${t('editor.heading2')}'`,
  '--editor-heading3': `'${t('editor.heading3')}'`,
  '--editor-heading4': `'${t('editor.heading4')}'`,
  '--editor-heading5': `'${t('editor.heading5')}'`,
  '--editor-heading6': `'${t('editor.heading6')}'`,
  '--editor-font-standard': `'${t('editor.fontStandard')}'`,
  '--editor-font-serif': `'${t('editor.fontSerif')}'`,
  '--editor-font-monospace': `'${t('editor.fontMonospace')}'`
}))

// FE-001：defineModel 自动双向绑定，无需 watch + $emit

// ==================== U4：键盘可达性 / 可访问名称 ====================
//
// 实测取证（Chromium，2026-09-28，公告管理「新增」弹窗内的真实 DOM）：
//   ① `.ql-editor`（contenteditable 编辑区）**无 role / aria-label / aria-multiline**，
//      且 `tabIndex` 为 `-1` ⇒ 读屏只能读到一个"无名可编辑区域"，键盘也无法 Tab 进入；
//   ② `.ql-picker-label`（字号/标题/字体/颜色/背景/对齐 6 个下拉）有 `role="button"` + `tabindex="0"`
//      却**没有任何可访问名称** ⇒ 读屏只念"按钮"；
//   ③ 工具栏 `button` 有 `aria-label` 但**是 Quill 硬编码的英文**（`list: ordered` / `indent: -1`），
//      `.ql-toolbar` 虽已 `role="toolbar"` 也无名称。
// 处理：统一补齐语义 + 把名称本地化，并同步写入 `title`（鼠标悬停提示）——
// 读屏与鼠标用户因此拿到**同一套**措辞；本地化随 locale 变化重新应用。

/** Quill 自带 `aria-label` 文本 → i18n 键（取值形如 `bold` / `list: ordered` / `indent: -1`） */
const QUILL_TOOLBAR_LABEL_KEYS: Record<string, string> = {
  bold: 'editor.a11y.bold',
  italic: 'editor.a11y.italic',
  underline: 'editor.a11y.underline',
  strike: 'editor.a11y.strike',
  blockquote: 'editor.a11y.blockquote',
  'code-block': 'editor.a11y.codeBlock',
  'list: ordered': 'editor.a11y.orderedList',
  'list: bullet': 'editor.a11y.bulletList',
  'indent: -1': 'editor.a11y.indentDecrease',
  'indent: +1': 'editor.a11y.indentIncrease',
  clean: 'editor.a11y.clean',
  link: 'editor.a11y.link',
  image: 'editor.a11y.image',
  video: 'editor.a11y.video'
}

/** `.ql-picker` 的类型类名 → i18n 键 */
const QUILL_PICKER_LABEL_KEYS: Record<string, string> = {
  'ql-size': 'editor.a11y.size',
  'ql-header': 'editor.a11y.header',
  'ql-font': 'editor.a11y.font',
  'ql-color': 'editor.a11y.color',
  'ql-background': 'editor.a11y.background',
  'ql-align': 'editor.a11y.align'
}

/** 下拉项 `data-value` → 复用既有 i18n 键（标题/字体项的可见文案由 CSS content 提供，文本抓不到） */
const QUILL_PICKER_ITEM_KEYS: Record<string, Record<string, string>> = {
  'ql-header': {
    '': 'editor.textNormal',
    false: 'editor.textNormal',
    '1': 'editor.heading1',
    '2': 'editor.heading2',
    '3': 'editor.heading3',
    '4': 'editor.heading4',
    '5': 'editor.heading5',
    '6': 'editor.heading6'
  },
  'ql-font': {
    '': 'editor.fontStandard',
    false: 'editor.fontStandard',
    serif: 'editor.fontSerif',
    monospace: 'editor.fontMonospace'
  }
}

/** 取 picker 的类型类名（如 `ql-color`）；取不到返回空串 */
function pickerTypeOf(picker: Element): string {
  // 用已知类型表 + classList.contains 判定（避免展开 DOMTokenList —— 本项目 tsconfig 未引 DOM.Iterable）
  for (const known of Object.keys(QUILL_PICKER_LABEL_KEYS)) {
    if (picker.classList.contains(known)) return known
  }
  return ''
}

/** 给一个下拉项生成可访问名称（文本优先，其次按类型的值映射，最后回落到"类型名 + 值"） */
function pickerItemLabel(type: string, pickerLabel: string, item: HTMLElement): string {
  const value = item.dataset.value ?? ''
  const text = (item.textContent || '').trim()
  if (text) return text
  const mapped = QUILL_PICKER_ITEM_KEYS[type]?.[value]
  if (mapped) return t(mapped)
  if (type === 'ql-color' || type === 'ql-background') {
    return t('editor.a11y.colorValue', { value: value || '-' })
  }
  if (type === 'ql-align') {
    return value ? t('editor.a11y.alignValue', { value }) : t('editor.a11y.align')
  }
  return value ? `${pickerLabel}：${value}` : pickerLabel
}

/** 把可访问名称同时写进 `aria-label` 与 `title`（读屏 + 鼠标提示一套措辞） */
function setName(el: Element, name: string): void {
  if (!name) return
  el.setAttribute('aria-label', name)
  el.setAttribute('title', name)
}

/**
 * 补齐 / 本地化编辑器各区域的可访问名称。幂等：可重复调用（locale 切换时重放）。
 * 刻意**只补不覆盖**：Quill 未提供名称的项才补，已提供且不在映射表内的保留原值。
 */
function applyEditorA11y(): void {
  const root = quillInstance?.root
  const container = root?.closest('.ql-container')?.parentElement ?? root?.parentElement
  if (!root || !container) return

  // ① 编辑区：补 role=textbox / aria-multiline / 可访问名称 + tabindex（保证 Tab 可达）
  root.setAttribute('role', 'textbox')
  root.setAttribute('aria-multiline', 'true')
  root.setAttribute('tabindex', '0')
  setName(root, t('editor.a11y.richText'))
  root.setAttribute('aria-placeholder', t('editor.placeholder'))

  // ② 工具栏区域名称
  const toolbar = container.querySelector('.ql-toolbar')
  if (toolbar) setName(toolbar, t('editor.a11y.toolbar'))

  // ③ 工具栏按钮：把 Quill 的英文 aria-label 换成本地化文案（不在映射表内则保留原值）
  container.querySelectorAll<HTMLElement>('.ql-toolbar button').forEach((btn) => {
    const raw = (btn.getAttribute('aria-label') || '').trim()
    const key = QUILL_TOOLBAR_LABEL_KEYS[raw]
    const name = key ? t(key) : raw
    if (name) setName(btn, name)
  })

  // ④ 下拉控件（picker）：label 补名称；展开后的 item 也补齐（色板项无文本，只有色块）
  container.querySelectorAll<HTMLElement>('.ql-picker').forEach((picker) => {
    const type = pickerTypeOf(picker)
    const key = QUILL_PICKER_LABEL_KEYS[type]
    const pickerLabel = key ? t(key) : type
    const label = picker.querySelector('.ql-picker-label')
    if (label) setName(label, pickerLabel)
    picker.querySelectorAll<HTMLElement>('.ql-picker-item').forEach((item) => {
      setName(item, pickerItemLabel(type, pickerLabel, item))
    })
  })
}

// locale 切换后重放（属性是命令式写入的，不会随 i18n 响应式自动更新）
watch(
  () => getLanguage(),
  () => applyEditorA11y()
)

// 如果设置了上传地址则自定义图片上传事件；同时（无条件）注入可访问名称
// 使用 @ready 事件确保 Quill 编辑器完全初始化后再注册图片上传处理器
// 修复 "The quill editor hasn't been instantiated yet" 错误
function handleQuillReady() {
  // U4：先拿实例 + 注入可访问名称 —— 这两步与"是否自定义图片上传"无关，
  // 必须在任何 early-return 之前完成（否则 type!=='url' 时编辑器会缺少可访问名称）。
  const quillComp = quillEditorRef.value
  if (!quillComp) {
    if (import.meta.env.DEV)
      console.warn('[Editor] Quill component ref is null, skip image upload handler registration')
    return
  }
  quillInstance = quillComp.getQuill()
  if (!quillInstance) {
    if (import.meta.env.DEV) console.warn('[Editor] Quill instance is null, skip image upload handler registration')
    return
  }
  applyEditorA11y()

  // 仅 url 上传模式才注册自定义图片上传处理器
  if (type !== 'url') return
  // P3-4：捕获局部变量避免闭包内 quillInstance 被 onBeforeUnmount 置 null 后触发空指针
  const inst = quillInstance
  const toolbar = inst.getModule('toolbar') as {
    addHandler: (name: string, handler: (value: boolean) => void) => void
  }
  toolbar.addHandler('image', (value: boolean) => {
    if (value) {
      uploadRef.value?.click()
    } else {
      inst.format('image', false)
    }
  })
  inst.root.addEventListener('paste', handlePasteCapture, true)
}

onBeforeUnmount(() => {
  if (quillInstance) {
    quillInstance.root.removeEventListener('paste', handlePasteCapture, true)
    quillInstance.enable(false)
    quillInstance = null
  }
})

// 同步 readOnly prop 变化到 Quill 实例（Quill 仅在初始化时读取 options.readOnly）
watch(
  () => readOnly,
  (val: boolean) => {
    quillInstance?.enable(!val)
  }
)

// 上传前校检格式和大小（FE-002：magic bytes 校验替代 file.type 扩展名推断）
async function handleBeforeUpload(file: File) {
  // 检验文件格式：通过 magic bytes 判断真实类型，扩展名可伪造
  const isValid = await verifyImageMagicBytes(file, ['jpeg', 'png', 'gif'])
  if (!isValid) {
    modal.msgError(t('editor.imageFormatError'))
    return false
  }
  // 校检文件大小
  if (fileSize) {
    const isLt = file.size / 1024 / 1024 < fileSize
    if (!isLt) {
      modal.msgError(t('editor.fileSizeExceeded', { size: fileSize }))
      return false
    }
  }
  return true
}

// 上传成功处理
function handleUploadSuccess(res: UploadFileResult, _file: File) {
  // 如果上传成功
  if (res.code === 200) {
    // 复用已存储的 quillInstance，避免重复调用 getQuill()
    const quill = quillInstance
    if (!quill) return
    // 获取光标位置：编辑器未聚焦时 savedRange 可能为 null，需降级处理
    const range = quill.getSelection() ?? quill.selection?.savedRange ?? { index: quill.getLength() }
    const length = range.index
    // 插入图片，res.url为服务器返回的图片链接地址
    quill.insertEmbed(length, 'image', import.meta.env.VITE_APP_BASE_API + res.fileName)
    // 调整光标到最后
    quill.setSelection(length + 1)
  } else {
    modal.msgError(t('editor.imageInsertFailed'))
  }
}

// 上传失败处理
function handleUploadError() {
  modal.msgError(t('editor.imageInsertFailed'))
}

// 复制粘贴图片处理
function handlePasteCapture(e: ClipboardEvent) {
  const clipboard = e.clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData
  if (clipboard && clipboard.items) {
    for (let i = 0; i < clipboard.items.length; i++) {
      const item = clipboard.items[i]
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) insertImage(file)
      }
    }
  }
}

async function insertImage(file: File) {
  // C-2 修复：粘贴路径也需经过 magic bytes 校验和大小校验
  const isValid = await verifyImageMagicBytes(file, ['jpeg', 'png', 'gif'])
  if (!isValid) {
    return
  }
  if (file.size / 1024 / 1024 > fileSize) {
    return
  }
  const formData = new FormData()
  formData.append('file', file)
  // M-5 修复：删除手动设置的 Content-Type，让 axios 自动生成带 boundary 的正确头部
  // P0 修复：添加 .catch 处理上传失败场景，避免 unhandled rejection
  axios
    .post(uploadUrl.value, formData, { headers: { Authorization: headers.value.Authorization } })
    .then((res: { data: UploadFileResult }) => {
      handleUploadSuccess(res.data as UploadFileResult, file)
    })
    .catch((err: unknown) => {
      if (import.meta.env.DEV) console.error('[Editor] Paste image upload failed:', err)
      modal.msgError(t('editor.imageInsertFailed'))
    })
}
</script>

<style scoped>
.editor,
:deep(.ql-toolbar) {
  white-space: pre-wrap !important;
  line-height: normal !important;
}
/* U4：键盘焦点可见指示（仅 focus-visible，不干扰鼠标点击的视觉） */
:deep(.ql-toolbar button:focus-visible),
:deep(.ql-toolbar .ql-picker-label:focus-visible),
:deep(.ql-toolbar .ql-picker-item:focus-visible),
:deep(.ql-editor:focus-visible) {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
  border-radius: 2px;
}
:deep(.quill-img) {
  display: none;
}
:deep(.ql-snow .ql-tooltip[data-mode='link'])::before {
  content: var(--editor-link-placeholder);
}
:deep(.ql-snow .ql-tooltip.ql-editing a.ql-action)::after {
  border-right: 0px;
  content: var(--editor-save);
  padding-right: 0px;
}
:deep(.ql-snow .ql-tooltip[data-mode='video'])::before {
  content: var(--editor-video-placeholder);
}
:deep(.ql-snow .ql-picker.ql-size .ql-picker-label)::before,
:deep(.ql-snow .ql-picker.ql-size .ql-picker-item)::before {
  content: '14px';
}
:deep(.ql-snow .ql-picker.ql-size .ql-picker-label[data-value='small'])::before,
:deep(.ql-snow .ql-picker.ql-size .ql-picker-item[data-value='small'])::before {
  content: '10px';
}
:deep(.ql-snow .ql-picker.ql-size .ql-picker-label[data-value='large'])::before,
:deep(.ql-snow .ql-picker.ql-size .ql-picker-item[data-value='large'])::before {
  content: '18px';
}
:deep(.ql-snow .ql-picker.ql-size .ql-picker-label[data-value='huge'])::before,
:deep(.ql-snow .ql-picker.ql-size .ql-picker-item[data-value='huge'])::before {
  content: '32px';
}
:deep(.ql-snow .ql-picker.ql-header .ql-picker-label)::before,
:deep(.ql-snow .ql-picker.ql-header .ql-picker-item)::before {
  content: var(--editor-text-normal);
}
:deep(.ql-snow .ql-picker.ql-header .ql-picker-label[data-value='1'])::before,
:deep(.ql-snow .ql-picker.ql-header .ql-picker-item[data-value='1'])::before {
  content: var(--editor-heading1);
}
:deep(.ql-snow .ql-picker.ql-header .ql-picker-label[data-value='2'])::before,
:deep(.ql-snow .ql-picker.ql-header .ql-picker-item[data-value='2'])::before {
  content: var(--editor-heading2);
}
:deep(.ql-snow .ql-picker.ql-header .ql-picker-label[data-value='3'])::before,
:deep(.ql-snow .ql-picker.ql-header .ql-picker-item[data-value='3'])::before {
  content: var(--editor-heading3);
}
:deep(.ql-snow .ql-picker.ql-header .ql-picker-label[data-value='4'])::before,
:deep(.ql-snow .ql-picker.ql-header .ql-picker-item[data-value='4'])::before {
  content: var(--editor-heading4);
}
:deep(.ql-snow .ql-picker.ql-header .ql-picker-label[data-value='5'])::before,
:deep(.ql-snow .ql-picker.ql-header .ql-picker-item[data-value='5'])::before {
  content: var(--editor-heading5);
}
:deep(.ql-snow .ql-picker.ql-header .ql-picker-label[data-value='6'])::before,
:deep(.ql-snow .ql-picker.ql-header .ql-picker-item[data-value='6'])::before {
  content: var(--editor-heading6);
}
:deep(.ql-snow .ql-picker.ql-font .ql-picker-label)::before,
:deep(.ql-snow .ql-picker.ql-font .ql-picker-item)::before {
  content: var(--editor-font-standard);
}
:deep(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value='serif'])::before,
:deep(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value='serif'])::before {
  content: var(--editor-font-serif);
}
:deep(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value='monospace'])::before,
:deep(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value='monospace'])::before {
  content: var(--editor-font-monospace);
}
</style>
