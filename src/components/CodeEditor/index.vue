<template>
  <div class="code-editor w-full border border-border rounded overflow-hidden" :style="{ height: height }">
    <vue-monaco-editor
      v-model:value="code"
      :language="language"
      :theme="theme"
      :options="editorOptions"
      @mount="handleMount"
    />
  </div>
</template>

<script setup lang="ts">
import { VueMonacoEditor, loader } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'

// 配置 Monaco 编辑器（使用本地依赖而非 CDN）
loader.config({ monaco })

interface Props {
  modelValue?: string
  language?: string
  theme?: 'vs' | 'vs-dark' | 'hc-black'
  height?: string
  readOnly?: boolean
  minimap?: boolean
  lineNumbers?: boolean
  wordWrap?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  language: 'java',
  theme: 'vs',
  height: '500px',
  readOnly: false,
  minimap: false,
  lineNumbers: true,
  wordWrap: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const code = computed({
  get: () => props.modelValue,
  set: (val: string) => {
    emit('update:modelValue', val)
    emit('change', val)
  }
})

const editorOptions = computed(() => ({
  readOnly: props.readOnly,
  minimap: { enabled: props.minimap },
  lineNumbers: props.lineNumbers ? 'on' : 'off',
  wordWrap: props.wordWrap ? 'on' : 'off',
  automaticLayout: true,
  fontSize: 13,
  tabSize: 2,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
  fontFamily: 'Consolas, "Courier New", monospace',
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10
  }
}))

let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

function handleMount(editor: monaco.editor.IStandaloneCodeEditor): void {
  editorInstance = editor
}

// 组件卸载时释放 Monaco 编辑器实例，避免内存泄漏
onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.getModel()?.dispose()
    editorInstance.dispose()
    editorInstance = null
  }
})

// 暴露方法给父组件
defineExpose({
  focus: () => editorInstance?.focus(),
  format: () => editorInstance?.getAction('editor.action.formatDocument')?.run(),
  getValue: () => editorInstance?.getValue() || ''
})
</script>
