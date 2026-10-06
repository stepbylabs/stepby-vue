<template>
  <div class="app-container">
    <!-- 输入卡 -->
    <el-card shadow="never" class="mb-3">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('aiPanel.title') }}</span>
          <el-button link type="primary" @click="showTables = !showTables">
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
        <el-tag
          v-for="tpl in templates"
          :key="tpl"
          class="cursor-pointer"
          effect="plain"
          @click="question = tpl"
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

    <!-- 白名单表范围（可折叠） -->
    <el-card v-if="showTables" shadow="never" class="mb-3">
      <template #header><span class="font-medium">{{ t('aiPanel.tablesTitle') }}</span></template>
      <el-skeleton v-if="tablesLoading" :rows="3" animated />
      <template v-else>
        <div v-for="t in tables" :key="t.table" class="mb-2">
          <el-tag effect="dark" size="small" class="mr-2">{{ t.table }}</el-tag>
          <span class="text-xs text-text-secondary">
            {{ t.columns.map((c: any) => c.name).join(', ') }}
          </span>
        </div>
        <el-empty v-if="tables.length === 0" :description="t('aiPanel.noTables')" />
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
      <el-table :data="tableRows" border stripe max-height="480">
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
            <el-button
              link
              type="primary"
              :disabled="!scope.row.success"
              @click="replay(scope.row)"
            >
              {{ t('aiPanel.history.replay') }}
            </el-button>
            <el-button link type="danger" @click="removeHistory(scope.row.id)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="historyRows.length === 0 && !historyLoading" :description="t('aiPanel.history.empty')" />
    </el-card>
  </div>
</template>

<script setup lang="ts" name="AiPanel">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { aiChat, aiTables } from '@/api/ai/chat'
import request from '@/utils/request'

interface ChatResult {
  answer: string
  sql: string
  tables: string[]
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
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
const historyRows = ref<HistoryItem[]>([])
const historyLoading = ref(false)

async function loadHistory() {
  historyLoading.value = true
  try {
    const res = await request({
      url: '/system/ai/history',
      method: 'get',
      params: { page: 1, size: 20 }
    })
    const d = (res as any).data ?? res
    historyRows.value = ((d as { items?: HistoryItem[] }).items ?? []) as HistoryItem[]
  } catch (e) {
    if (import.meta.env.DEV) console.error('[aiPanel] loadHistory failed:', e)
  } finally {
    historyLoading.value = false
  }
}

async function removeHistory(id: number) {
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
const templates = computed(() => [
  t('aiPanel.tpl1'),
  t('aiPanel.tpl2'),
  t('aiPanel.tpl3')
])

// 白名单表范围（懒加载：展开时才拉）
watch(showTables, async (v: boolean) => {
  if (v && tables.value.length === 0 && !tablesLoading.value) {
    tablesLoading.value = true
    try {
      const resp = (await aiTables()) as unknown as AiTablesResp
      tables.value = resp?.data ?? []
    } catch {
      tables.value = []
    } finally {
      tablesLoading.value = false
    }
  }
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
        rowCount: resp.data.rowCount ?? 0
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

/** 前端导出 CSV（结果已在内存，无需再走后端） */
function exportCsv() {
  if (!result.value || result.value.columns.length === 0) return
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [result.value.columns.map(esc).join(',')]
  for (const row of result.value.rows) {
    lines.push(result.value.columns.map((c: string) => esc((row as Record<string, unknown>)?.[c])).join(','))
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai_result_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
