<template>
  <div class="app-container p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('aiHistory.title') }}</span>
          <div class="flex items-center gap-2">
            <el-input
              v-model="tenantFilter"
              :aria-label="t('aiHistory.tenant')"
              :placeholder="t('aiHistory.ph.tenantFilter')"
              clearable
              class="w-[180px]"
              @keyup.enter="load(1)"
            />
            <el-button type="primary" icon="Search" @click="load(1)">
              {{ t('common.search') }}
            </el-button>
            <el-button icon="Refresh" @click="load(page)">
              {{ t('common.refresh') }}
            </el-button>
            <el-button icon="Download" :loading="exportLoading" @click="exportHistory">
              {{ t('aiHistory.exportBtn') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="rows" border stripe max-height="560" v-loading="loading">
        <el-table-column prop="createTime" :label="t('aiHistory.time')" width="170" />
        <el-table-column prop="tenantId" :label="t('aiHistory.tenant')" width="90" align="center" />
        <el-table-column prop="userId" :label="t('aiHistory.user')" width="90" align="center" />
        <el-table-column prop="question" :label="t('aiHistory.question')" min-width="200" show-overflow-tooltip />
        <el-table-column prop="sql" :label="t('aiHistory.sql')" min-width="220" show-overflow-tooltip />
        <el-table-column prop="rowsCount" :label="t('aiHistory.rows')" width="80" align="center" />
        <el-table-column prop="durationMs" :label="t('aiHistory.duration')" width="100" align="center" />
        <el-table-column :label="t('aiHistory.status')" width="90" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.success ? 'success' : 'danger'" size="small">
              {{ scope.row.success ? t('aiHistory.ok') : t('aiHistory.failed') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="errorMsg" :label="t('aiHistory.error')" min-width="160" show-overflow-tooltip />
        <template #empty>
          <list-empty :load-error="loadError" @retry="load()" />
        </template>
      </el-table>

      <div class="mt-3 flex justify-end">
        <pagination v-model:page="page" v-model:limit="size" :total="total" :auto-scroll="false" @pagination="load()" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="AiHistory">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { createLatestGuard } from '@/composables/latestRequest'
import { saveBlob } from '@/utils/saveBlob'
import { blobRequest, failureText } from '@/utils/blobRequest'
import { FILE_DOWNLOAD_TIMEOUT } from '@/utils/timeouts'
import { errorHub } from '@/utils/errorHub'

interface AiHistoryAdminRow {
  id: number
  tenantId: number
  userId: number
  question: string
  sql: string
  tables: string
  rowsCount: number
  durationMs: number
  success: boolean
  errorMsg?: string
  createTime: string
}

const { t } = useI18n()
/**
 * 取数守卫（b119 单一实现）：这一页的「查询身份」由 页码 + 租户筛选 共同决定，
 * 连点翻页 / 改筛选后重查时，先发的响应后到会把**上一个筛选条件**的行集与总数
 * 写在当前条件下（表格内容与输入框对不上，而总数还会跟着一起错）。
 */
const loadGuard = createLatestGuard()
const rows = ref<AiHistoryAdminRow[]>([])
const loading = ref(false)
const loadError = ref(false)
const page = ref(1)
const size = ref(20)
const total = ref(0)
const tenantFilter = ref('')
// 导出按钮 loading：防连点并发两次 fetch 下载
const exportLoading = ref(false)

/**
 * 租户筛选输入归一：空 ⇒ null（不筛选）；非法 ⇒ 'invalid'（调用方提示并中止）。
 *
 * 原实现直接 `Number(tid)`：`abc` 会变成 NaN 拼进查询串、超长数字串折成 `1e+21`
 * ——两者都只在后端 400 时才可见，用户看不出是自己输入的问题（b97）。
 */
function parseTenantFilter(): number | null | 'invalid' {
  const raw = tenantFilter.value.trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 0) return 'invalid'
  return n
}

async function load(p?: number) {
  const tid = parseTenantFilter()
  if (tid === 'invalid') {
    ElMessage.warning(t('aiHistory.tenantInvalid'))
    return
  }
  if (p) page.value = p
  const ticket = loadGuard.begin()
  loading.value = true
  loadError.value = false
  try {
    const params: Record<string, unknown> = { page: page.value, size: size.value }
    if (tid !== null) params.tenantFilter = tid
    const res = (await request({
      url: '/system/ai/history/admin',
      method: 'get',
      params
    })) as unknown as { code: number; data?: { items?: AiHistoryAdminRow[]; total?: number } }
    if (!loadGuard.isCurrent(ticket)) return
    const d = res.data
    rows.value = d?.items ?? []
    total.value = d?.total ?? 0
  } catch (e) {
    // 错误提示由响应拦截器统一弹出；页面侧负责把"加载失败"与"暂无数据"分开（ListEmpty）。
    // 判票：更晚一次查询正在等它自己的结果时，旧失败不得把新页判成"加载失败"。
    if (!loadGuard.isCurrent(ticket)) return
    loadError.value = true
    if (import.meta.env.DEV) console.error('[aiHistory] load failed:', e)
  } finally {
    if (loadGuard.isCurrent(ticket)) loading.value = false
  }
}

onMounted(() => load(1))

// §5.55 AI-02 结果导出：下载管理视图 Excel（服务端生成，带租户过滤口径）
//
// b138：原实现是裸 `fetch` —— 无超时、失败只抛 `Error('export failed: 状态码')`、
// 后端理由与追踪号整段丢弃、401 不走会话失效。b137 给该端点加了 5/s 的独立外带限流后，
// 用户连点两次就 429，而屏幕上只有"导出失败"一句。现统一走 `utils/blobRequest`。
async function exportHistory() {
  const tid = parseTenantFilter()
  if (tid === 'invalid') {
    ElMessage.warning(t('aiHistory.tenantInvalid'))
    return
  }
  exportLoading.value = true
  try {
    const params: Record<string, string | number> = {}
    if (tid !== null) params.tenantFilter = tid
    const res = await blobRequest({
      url: '/system/ai/history/admin/export',
      params,
      responseType: 'blob',
      timeout: FILE_DOWNLOAD_TIMEOUT
    })
    if (!res.ok) {
      // 有响应就听后端的（429 会带"请在 N 秒后重试"）；完全没响应（网络中断/超时）
      // 才落回导出动作自己的失败文案——那时后端理由不存在，不能拿通用"下载失败"顶替。
      const text = res.failure.status === null ? t('aiHistory.exportFailed') : failureText(res.failure)
      errorHub.report('error', 'download', text, res.failure.traceId)
      return
    }
    const fileName = `ai_history_${new Date().toISOString().slice(0, 10)}.xlsx`
    if (!saveBlob(res.data, fileName)) {
      errorHub.report('error', 'download', t('aiHistory.exportFailed'))
      return
    }
    // saveBlob 的 true 只证明"载荷非空且保存通道未抛错"，不证明已落盘（b112 口径）
    ElMessage.success(t('aiHistory.exportStarted'))
  } catch (e) {
    if (import.meta.env.DEV) console.error('[aiHistory] export failed:', e)
    errorHub.report('error', 'download', t('aiHistory.exportFailed'))
  } finally {
    exportLoading.value = false
  }
}
</script>
