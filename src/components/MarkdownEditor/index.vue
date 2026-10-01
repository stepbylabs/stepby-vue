<template>
  <MdEditor
    ref="mdRef"
    v-model="content"
    :theme="isDark ? 'dark' : 'light'"
    :language="lang"
    :toolbars="toolbars"
    :preview="preview"
    :style="{ height: height }"
    @on-upload-img="onUploadImg"
  />
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { MdEditor } from 'md-editor-v3'
import type { ToolbarNames } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import useSettingsStore from '@/store/modules/settings'
import request from '@/utils/request'
import { ElMessage } from 'element-plus'
import i18n, { getLanguage } from '@/i18n'
import { errorHub } from '@/utils/errorHub'

interface Props {
  modelValue?: string
  height?: string
  preview?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  height: '400px',
  preview: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const settingsStore = useSettingsStore()
const isDark = computed(() => settingsStore.isDark)
// G16：编辑器语言跟随当前 i18n locale 切换（md-editor-v3 仅支持 'zh-CN' | 'en-US'）
const lang = computed<'zh-CN' | 'en-US'>(() => (getLanguage() === 'en-US' ? 'en-US' : 'zh-CN'))

// ==================== U4：键盘可达性 / 可访问名称 ====================
//
// 实测取证（jsdom 挂载真实组件，2026-09-28）：md-editor-v3 已为工具栏按钮写好**本地化**的
// `aria-label` + `title`（如「加粗」），但其
//   ① 输入区（CodeMirror 的 `.cm-content`：已有 `role="textbox"` / `aria-multiline="true"`）
//      **没有可访问名称** ⇒ 读屏只念"可编辑文本"；
//   ② 根容器 `.md-editor` 也没有区域名称。
// 这里只补这两处（不改上游行为），并在 locale 切换时重放（属性是命令式写入的）。
const mdRef = useTemplateRef<ComponentPublicInstance>('mdRef')

function applyA11y(): void {
  const el = mdRef.value?.$el as HTMLElement | undefined
  if (!el || typeof el.querySelector !== 'function') return
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', i18n.global.t('editor.a11y.markdown'))
  const area = el.querySelector('[role="textbox"]')
  if (area) {
    area.setAttribute('aria-label', i18n.global.t('editor.a11y.editorArea'))
    area.setAttribute('aria-multiline', 'true')
  }
}

onMounted(() => {
  nextTick(() => applyA11y())
})
watch(
  () => getLanguage(),
  () => nextTick(() => applyA11y())
)

const content = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val)
})

const toolbars: ToolbarNames[] = [
  'bold',
  'underline',
  'italic',
  'strikeThrough',
  '-',
  'title',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'codeRow',
  'code',
  'link',
  'image',
  'table',
  'mermaid',
  '-',
  'revoke',
  'next',
  '=',
  'preview',
  'previewOnly'
]

/** 图片上传回调（对接后端通用上传接口） */
async function onUploadImg(files: File[], callback: (urls: string[]) => void): Promise<void> {
  const urls: string[] = []
  let failCount = 0
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = (await request({
        url: '/system/file/upload',
        method: 'post',
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' }
      })) as { url?: string }
      if (res.url) {
        urls.push(res.url)
      } else {
        failCount++
      }
    } catch (err) {
      failCount++
      if (import.meta.env.DEV) console.error('[MarkdownEditor] Image upload failed:', err)
    }
  }
  // P1 修复: 上传失败时给用户明确反馈
  if (failCount > 0) {
    errorHub.report('error', 'other', i18n.global.t('editor.uploadFail', { n: failCount }))
  }
  if (urls.length > 0) {
    ElMessage.success(i18n.global.t('editor.uploadSuccess', { n: urls.length }))
  }
  callback(urls)
}
</script>

<style scoped>
/* U4：键盘焦点可见指示（仅 focus-visible，不干扰鼠标点击的视觉） */
:deep(.md-editor-toolbar-item:focus-visible),
:deep(.md-editor-dropdown-toolbar-item:focus-visible) {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
  border-radius: 2px;
}
</style>
