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
              :aria-label="t('gen.preview.file')"
              v-model="activeFile"
              :placeholder="t('gen.preview.file')"
              clearable
              filterable
              class="gen-preview-select"
            >
              <!-- 体验阶段 gen 方案首步：文件下拉按五组分组（后端 Java / 前端 Vue / SQL / XML / 其他） -->
              <el-option-group v-for="group in groupedFiles" :key="group.label" :label="group.label">
                <el-option v-for="file in group.files" :key="file.path" :value="file.path" :label="file.name" />
              </el-option-group>
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
        <!-- 行号列自实现（prismjs line-numbers 插件在按需引入链下不可用，不引新依赖）：
             flex 两列，行号列与代码列同字号/同行高逐行对齐 -->
        <pre class="gen-preview-code" :class="`language-${activeLanguage}`">
          <span class="gen-preview-gutter" aria-hidden="true">
            <span v-for="n in lineCount" :key="n" class="gen-preview-line-no">{{ n }}</span>
          </span>
          <code class="gen-preview-source" :class="`language-${activeLanguage}`" v-html="highlightedCode"></code>
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
// HTML 转义统一走 @/utils 的规范实现（此处原为只转义 & < > 的私有副本，多份实现会漂移）
import { escapeHtml } from '@/utils'

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

/** 行号列行数：按换行拆分，与代码列 line-height 一致逐行对齐 */
const lineCount = computed(() => activeContent.value.split('\n').length)

/** 文件下拉五组分组（体验阶段 gen 方案首步）：按路径后缀与目录关键词归类。
 * b71 i18n 治理：key 为稳定分组标识、label 经 i18n 渲染（原中文字面量直接渲染给用户）。 */
const FILE_GROUP_KEYS = ['java', 'vue', 'sql', 'xml', 'other'] as const
type FileGroupKey = (typeof FILE_GROUP_KEYS)[number]
const FILE_GROUP_TKEYS: Record<FileGroupKey, string> = {
  java: 'tool.gen.fileGroupJava',
  vue: 'tool.gen.fileGroupVue',
  sql: 'tool.gen.fileGroupSql',
  xml: 'tool.gen.fileGroupXml',
  other: 'tool.gen.fileGroupOther'
}

function fileGroup(path: string): FileGroupKey {
  const bare = path.replace(/\.vm$/i, '')
  const ext = (bare.split('.').pop() || '').toLowerCase()
  if (ext === 'java' || /(^|\/)(pojo|domain|entity)(\/|$)/i.test(bare)) return 'java'
  if (ext === 'vue') return 'vue'
  if (ext === 'sql') return 'sql'
  if (ext === 'xml' && /mapper\.xml$/i.test(bare)) return 'xml'
  return 'other'
}

const groupedFiles = computed(() => {
  const buckets = new Map<FileGroupKey, GenPreviewFile[]>()
  for (const f of fileList.value) {
    const group = fileGroup(f.path)
    const bucket = buckets.get(group)
    if (bucket) bucket.push(f)
    else buckets.set(group, [f])
  }
  return FILE_GROUP_KEYS.filter((key) => buckets.has(key)).map((key) => ({
    label: t(FILE_GROUP_TKEYS[key]),
    files: buckets.get(key)!
  }))
})

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

/* 行号列 + 代码列 flex 两列布局：
   纵向滚动由 pre 统一承担（两列同步滚动，保证逐行对齐）；
   横向滚动由代码列自担（向右滚动时行号保持可见）。 */
.gen-preview-code {
  display: flex;
  align-items: flex-start;
  margin: 0;
  padding: 12px 0;
  border-radius: 6px;
  max-height: 60vh;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;

  .gen-preview-gutter {
    flex-shrink: 0;
    padding: 0 12px;
    text-align: right;
    user-select: none;
    opacity: 0.6;
    border-right: 1px solid var(--el-border-color-lighter);
  }

  .gen-preview-line-no {
    display: block;
  }

  .gen-preview-source {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 16px;
    white-space: pre;
    overflow-x: auto;
  }
}
</style>
