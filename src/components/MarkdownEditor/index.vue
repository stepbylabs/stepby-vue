<template>
  <MdEditor
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
import { MdEditor } from 'md-editor-v3'
import type { ToolbarNames } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import useSettingsStore from '@/store/modules/settings'
import request from '@/utils/request'
import { ElMessage } from 'element-plus'
import i18n, { getLanguage } from '@/i18n'

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
    ElMessage.error(i18n.global.t('editor.uploadFail', { n: failCount }))
  }
  if (urls.length > 0) {
    ElMessage.success(i18n.global.t('editor.uploadSuccess', { n: urls.length }))
  }
  callback(urls)
}
</script>
