<template>
  <el-dialog
    :title="t('gen.msg.previewTitle')"
    v-model="visible"
    width="80%"
    top="5vh"
    append-to-body
    destroy-on-close
    class="scrollbar gen-preview-dialog"
  >
    <div v-loading="loading" class="gen-preview-body">
      <template v-if="fileList.length">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <el-select
              v-model="activeFile"
              :placeholder="t('gen.preview.file')"
              clearable
              filterable
              class="gen-preview-select"
            >
              <el-option v-for="file in fileList" :key="file.path" :value="file.path" :label="file.name" />
            </el-select>
            <el-tag type="info" effect="plain">{{ activeLanguage }}</el-tag>
          </div>
          <el-button
            type="primary"
            plain
            icon="DocumentCopy"
            v-copyText="activeContent"
            v-copyText:callback="copyTextSuccess"
            :aria-label="t('common.copy')"
          >
            {{ t('common.copy') }}
          </el-button>
        </div>
        <pre class="gen-preview-code" :class="`language-${activeLanguage}`">
          <code :class="`language-${activeLanguage}`" v-html="highlightedCode"></code>
        </pre>
      </template>
      <el-empty v-else :description="t('gen.preview.empty')" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts" name="GenPreview">
import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/themes/prism-tomorrow.css'
import { previewTable } from '@/api/tool/gen'
import modal from '@/plugins/modal'

const { t } = useI18n()
const visible = ref(false)
const loading = ref(false)
const dataMap = ref<Record<string, string>>({})
const activeFile = ref<string>('')

interface GenPreviewFile {
  path: string
  name: string
  language: string
  content: string
}

/** 从模板文件路径解析展示文件名（取 basename 并隐藏 .vm 后缀） */
function basename(path: string): string {
  const parts = path.split('/')
  const last = parts[parts.length - 1] || path
  return last.replace(/\.vm$/i, '')
}

/** 文件扩展名 → Prism 语言标识（.vm 模板与真实产物路径共用同一映射） */
const LANG_BY_EXT: Record<string, string> = {
  java: 'java',
  xml: 'xml',
  htm: 'markup',
  html: 'markup',
  vue: 'markup',
  ts: 'typescript',
  js: 'javascript',
  sql: 'sql',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  py: 'python',
  rs: 'rust'
}

/** 根据文件路径推断 Prism 语言标识（先剥掉模板 .vm 后缀，再按扩展名映射） */
function detectLanguage(path: string): string {
  const bare = path.replace(/\.vm$/i, '')
  const ext = (bare.split('.').pop() || '').toLowerCase()
  return LANG_BY_EXT[ext] ?? 'plaintext'
}

/** 转义 HTML，用于无匹配文法（plaintext）时的兜底，避免注入 */
function escapeHtml(code: string): string {
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const fileList = computed<GenPreviewFile[]>(() =>
  Object.entries(dataMap.value)
    .map(([path, content]) => ({
      path,
      name: basename(path),
      language: detectLanguage(path),
      content
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
)

// 数据加载完成后默认选中第一个文件
watch(fileList, (list: GenPreviewFile[]) => {
  if (list.length && !list.some((f: GenPreviewFile) => f.path === activeFile.value)) {
    activeFile.value = list[0].path
  }
})

const activeContent = computed(() => dataMap.value[activeFile.value] ?? '')
const activeLanguage = computed(
  () => fileList.value.find((f: GenPreviewFile) => f.path === activeFile.value)?.language ?? 'plaintext'
)

/** 按已返回的代码手动高亮（避免在组合式 setup 中重复调用 Prism.highlightAll） */
const highlightedCode = computed(() => {
  const code = activeContent.value
  const grammar = Prism.languages[activeLanguage.value]
  if (grammar) {
    return Prism.highlight(code, grammar, activeLanguage.value)
  }
  return escapeHtml(code)
})

function copyTextSuccess() {
  modal.msgSuccess(t('common.copySuccess'))
}

/** 打开预览弹窗并拉取指定表的生成代码 */
function openPreview(tableId: number): void {
  if (!tableId) return
  visible.value = true
  loading.value = true
  activeFile.value = ''
  dataMap.value = {}
  previewTable(tableId)
    .then((response) => {
      dataMap.value = (response.data ?? {}) as Record<string, string>
    })
    .catch((error) => {
      if (import.meta.env.DEV) console.error('Failed to load preview code:', error)
      modal.msgError(t('gen.preview.loadFailed'))
    })
    .finally(() => {
      loading.value = false
    })
}

defineExpose({ openPreview })
</script>

<style lang="scss" scoped>
.gen-preview-select {
  width: 360px;
  max-width: 100%;
}

.gen-preview-code {
  margin: 0;
  padding: 12px 16px;
  border-radius: 6px;
  max-height: 60vh;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
}
</style>
