<template>
  <div class="app-container">
    <!-- 输入卡 -->
    <el-card shadow="never" class="mb-3">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('aiPanel.title') }}</span>
          <el-button
            link
            type="primary"
            :aria-expanded="showTables"
            aria-controls="ai-panel-tables-card"
            @click="showTables = !showTables"
          >
            {{ t('aiPanel.toggleTables') }}
          </el-button>
        </div>
      </template>

      <el-input
        v-model="question"
        type="textarea"
        :rows="3"
        :maxlength="500"
        show-word-limit
        :placeholder="t('aiPanel.placeholder')"
        :aria-label="t('aiPanel.placeholder')"
        @keydown.ctrl.enter.prevent="ask"
      />

      <!-- 快捷模板（UX v5-D：降低输入门槛） -->
      <div class="mt-2 flex flex-wrap gap-2">
        <!-- el-tag 渲染成 span：不可聚焦，补 role/tabindex/键盘激活三件（可访问名取标签自身文本） -->
        <el-tag
          v-for="tpl in templates"
          :key="tpl"
          class="cursor-pointer"
          effect="plain"
          role="button"
          tabindex="0"
          @click="question = tpl"
          @keydown.enter.prevent="question = tpl"
          @keydown.space.prevent="question = tpl"
        >
          {{ tpl }}
        </el-tag>
      </div>

      <div class="mt-3 flex items-center gap-3">
        <el-button
          type="primary"
          icon="Promotion"
          :loading="loading"
          :disabled="!question.trim()"
          v-hasPermi="['ai:chat']"
          @click="ask"
        >
          {{ t('aiPanel.ask') }}
        </el-button>
        <span class="text-xs text-text-secondary">{{ t('aiPanel.hint') }}</span>
      </div>
    </el-card>

    <!-- 白名单表范围（可折叠）：v-if 收起时整块不在文档里，aria-expanded=false 已表达"无受控区可见"；
         展开时 id 与表头按钮的 aria-controls 对齐（v-show 常驻的结构才谈得上"关联收起的 DOM"） -->
    <el-card v-if="showTables" id="ai-panel-tables-card" shadow="never" class="mb-3">
      <template #header>
        <span class="font-medium">{{ t('aiPanel.tablesTitle') }}</span>
      </template>
      <el-skeleton v-if="tablesLoading" :rows="3" animated />
      <template v-else>
        <div v-for="t in tables" :key="t.table" class="mb-2">
          <el-tag effect="dark" size="small" class="mr-2">{{ t.table }}</el-tag>
          <span class="text-xs text-text-secondary">
            {{ t.columns.map((c: any) => c.name).join(', ') }}
          </span>
        </div>
        <el-empty
          v-if="tables.length === 0"
          :description="tablesLoadError ? t('aiPanel.tablesLoadFail') : t('aiPanel.noTables')"
        >
          <el-button v-if="tablesLoadError" link type="primary" @click="loadTables">
            {{ t('common.retry') }}
          </el-button>
        </el-empty>
      </template>
    </el-card>

    <!-- 错误/降级提示（UX v5-D：AI 不可用/无权限时明确反馈，禁止裸 500） -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="warning"
      :closable="true"
      show-icon
      class="mb-3"
      @close="errorMsg = ''"
    />

    <!-- 结果卡 -->
    <el-card v-if="result" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('aiPanel.resultTitle') }}</span>
          <div class="flex items-center gap-2">
            <el-tag size="small" type="info">{{ t('aiPanel.rowCount', { n: result.rowCount }) }}</el-tag>
            <el-tag v-if="result.tokenUsage" size="small" type="warning">
              {{ t('aiPanel.tokenUsage', result.tokenUsage) }}
            </el-tag>
            <el-button link type="primary" icon="Download" @click="exportCsv">
              {{ t('aiPanel.exportCsv') }}
            </el-button>
          </div>
        </div>
      </template>

      <!-- SQL（引用来源：让用户看到 AI 生成了什么、查了哪些表） -->
      <div class="mb-3">
        <div class="text-xs text-text-secondary mb-1">
          {{ t('aiPanel.generatedSql') }}
          <el-tag v-for="tb in result.tables" :key="tb" size="small" class="ml-1">{{ tb }}</el-tag>
        </div>
        <pre class="sql-block">{{ result.sql }}</pre>
      </div>

      <!-- AI 文本回答 -->
      <el-alert v-if="result.answer" :title="result.answer" type="info" :closable="false" class="mb-3" />

      <!-- 数据表格（动态列） -->
      <el-table :data="result.rows" border stripe max-height="480">
        <el-table-column
          v-for="col in result.columns"
          :key="col"
          :prop="col"
          :label="col"
          min-width="120"
          show-overflow-tooltip
        />
      </el-table>
      <el-empty v-if="result.columns.length > 0 && result.rows.length === 0" :description="t('aiPanel.emptyResult')" />
    </el-card>

    <!-- 查询历史（AI-02：本人历史，列表+删除；重放端点下批） -->
    <el-card shadow="never" class="mt-3">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('aiPanel.historyTitle') }}</span>
          <el-button link type="primary" icon="Refresh" @click="loadHistory">
            {{ t('common.refresh') }}
          </el-button>
        </div>
      </template>
      <!-- 成功过再失败：旧行保留但标注"是几点的数据"，不让它看起来像刚刷过（b108） -->
      <el-alert
        v-if="historyLoadError && historyRows.length > 0"
        class="mb-2"
        type="warning"
        :closable="false"
        show-icon
        :title="historyStaleHint"
      />
      <el-table :data="historyRows" border stripe max-height="320" v-loading="historyLoading">
        <el-table-column prop="createTime" :label="t('aiPanel.history.time')" width="170" />
        <el-table-column prop="question" :label="t('aiPanel.history.question')" min-width="180" show-overflow-tooltip />
        <el-table-column prop="rowsCount" :label="t('aiPanel.history.rows')" width="90" align="center" />
        <el-table-column :label="t('aiPanel.history.status')" width="90" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.success ? 'success' : 'danger'" size="small">
              {{ scope.row.success ? t('aiPanel.history.ok') : t('aiPanel.history.failed') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" width="140" align="center">
          <template #default="scope">
            <el-button link type="primary" :disabled="!scope.row.success" @click="replay(scope.row)">
              {{ t('aiPanel.history.replay') }}
            </el-button>
            <el-button link type="danger" @click="removeHistory(scope.row.id)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="historyRows.length === 0 && !historyLoading"
        :description="historyLoadError ? t('aiPanel.history.loadFail') : t('aiPanel.history.empty')"
      >
        <el-button v-if="historyLoadError" link type="primary" @click="loadHistory">
          {{ t('common.retry') }}
        </el-button>
      </el-empty>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="AiPanel">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { aiChat, aiTables } from '@/api/ai/chat'
import request from '@/utils/request'
import { formatClockTime } from '@/utils'
import { csvEscape } from '@/utils/csv'
import { saveBlob } from '@/utils/saveBlob'
import { confirmAction } from '@/utils/confirm'
import { useWidgetLoad } from '@/composables/useWidgetLoad'

interface ChatResult {
  answer: string
  sql: string
  tables: string[]
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

interface AiChatResp {
  code: number
  msg?: string
  data?: ChatResult
}

interface AiTablesResp {
  code: number
  msg?: string
  data?: Array<{ table: string; columns: Array<{ name: string; type: string }> }>
}

const { t } = useI18n()
const question = ref('')
const loading = ref(false)
const errorMsg = ref('')
const result = ref<ChatResult | null>(null)

const tables = ref<Array<{ table: string; columns: Array<{ name: string }> }>>([])
const tablesLoading = ref(false)
const showTables = ref(false)

// AI-02：查询历史（本人）
interface HistoryItem {
  id: number
  question: string
  sql: string
  tables: string
  rowsCount: number
  durationMs: number
  success: boolean
  errorMsg?: string
  createTime: string
}
// 历史是辅助信息，但"取数失败"不得伪装成"没有历史"（b107）：失败态给文案 + 重试
const {
  data: historyRows,
  loading: historyLoading,
  loadError: historyLoadError,
  lastSuccessAt: historyLastSuccessAt,
  load: loadHistory
} = useWidgetLoad<HistoryItem[]>(async () => {
  const res = await request({
    url: '/system/ai/history',
    method: 'get',
    params: { page: 1, size: 20 }
  })
  const d = (res as { data?: unknown }).data ?? res
  return ((d as { items?: HistoryItem[] }).items ?? []) as HistoryItem[]
}, [])

// 陈旧提示必须说得出"屏上是几点的数据"（b108）
const historyStaleHint = computed(() =>
  t('common.staleDataHintAt', { time: formatClockTime(historyLastSuccessAt.value) })
)

async function removeHistory(id: number) {
  // 历史行是用户可见数据的物理删除：先确认，取消不是错误（confirmAction 折叠成 false）
  if (!(await confirmAction(t('aiPanel.history.confirmRemove')))) return
  try {
    await request({ url: `/system/ai/history/${id}`, method: 'delete' })
    historyRows.value = historyRows.value.filter((r: HistoryItem) => r.id !== id)
  } catch (e) {
    if (import.meta.env.DEV) console.error('[aiPanel] removeHistory failed:', e)
  }
}

// AI-02 决策 2：重放本人历史（历史 SQL 重新走服务端守卫 + 受控执行）
const replaying = ref(false)
async function replay(row: HistoryItem) {
  if (replaying.value) return
  replaying.value = true
  try {
    const resp = (await request({
      url: '/ai/replay',
      method: 'post',
      data: { historyId: row.id }
    })) as unknown as AiChatResp
    if (resp.code === 200 && resp.data) {
      result.value = resp.data
      loadHistory()
    } else {
      errorMsg.value = resp.msg || t('aiPanel.history.replayFailed')
    }
  } catch (e) {
    if (import.meta.env.DEV) console.error('[aiPanel] replay failed:', e)
  } finally {
    replaying.value = false
  }
}

// 快捷模板（引导首次使用；命中实际数据形态）
const templates = computed(() => [t('aiPanel.tpl1'), t('aiPanel.tpl2'), t('aiPanel.tpl3')])

// 白名单表范围（懒加载：展开时才拉）；失败不得显示成"没有可选表"（b107）
const tablesLoadError = ref(false)
async function loadTables(): Promise<void> {
  if (tablesLoading.value) return
  tablesLoading.value = true
  tablesLoadError.value = false
  try {
    const resp = (await aiTables()) as unknown as AiTablesResp
    tables.value = resp?.data ?? []
  } catch (e) {
    tablesLoadError.value = true
    if (import.meta.env.DEV) console.warn('[aiPanel] loadTables failed:', e)
  } finally {
    tablesLoading.value = false
  }
}

watch(showTables, (v: boolean) => {
  if (v && tables.value.length === 0 && !tablesLoading.value) void loadTables()
})

async function ask() {
  const q = question.value.trim()
  if (!q || loading.value) return
  loading.value = true
  errorMsg.value = ''
  loadHistory()
  result.value = null
  try {
    const resp = (await aiChat({ question: q })) as unknown as AiChatResp
    if (resp?.code === 200 && resp?.data) {
      result.value = {
        answer: resp.data.answer ?? '',
        sql: resp.data.sql ?? '',
        tables: resp.data.tables ?? [],
        columns: resp.data.columns ?? [],
        rows: resp.data.rows ?? [],
        rowCount: resp.data.rowCount ?? 0,
        tokenUsage: resp.data.tokenUsage ?? undefined
      }
    } else {
      errorMsg.value = resp?.msg || t('aiPanel.askFailed')
    }
  } catch (e) {
    // request 拦截器对业务错误会弹 ElMessage；此处捕获网络层/未弹层错误
    const msg = e instanceof Error ? e.message : String(e)
    errorMsg.value = msg.slice(0, 200) || t('aiPanel.askFailed')
  } finally {
    loading.value = false
  }
}

/** 前端导出 CSV（结果已在内存，无需再走后端；转义走 utils/csv 的公式注入防护） */
function exportCsv() {
  if (!result.value || result.value.columns.length === 0) return
  const lines = [result.value.columns.map(csvEscape).join(',')]
  for (const row of result.value.rows) {
    lines.push(result.value.columns.map((c: string) => csvEscape((row as Record<string, unknown>)?.[c])).join(','))
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  // 保存走 utils/saveBlob：原先手搓 anchor 且同步 revokeObjectURL（Safari/Firefox 上会拿到 0 字节），
  // 抛错时还会把异常穿给点击处理器让 ErrorBoundary 接管整页
  if (!saveBlob(blob, `ai_result_${Date.now()}.csv`)) {
    ElMessage.error(t('common.downloadError'))
  }
}
onMounted(() => {
  // AI-02：面板加载即拉本人历史（失败静默，历史为辅助信息）
  loadHistory()
})
</script>

<style scoped>
.sql-block {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 10px 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
