<template>
  <div class="app-container p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ t('aiHistory.title') }}</span>
          <div class="flex items-center gap-2">
            <el-input
              v-model="tenantFilter"
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
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :page-size="size"
        :total="total"
        layout="total, prev, pager, next"
        class="mt-3 justify-end"
        @current-change="load"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts" name="AiHistory">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import request from '@/utils/request'

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
const rows = ref<AiHistoryAdminRow[]>([])
const loading = ref(false)
const page = ref(1)
const size = 20
const total = ref(0)
const tenantFilter = ref('')

async function load(p?: number) {
  if (p) page.value = p
  loading.value = true
  try {
    const params: Record<string, unknown> = { page: page.value, size }
    const tid = tenantFilter.value.trim()
    if (tid) params.tenantFilter = Number(tid)
    const res = (await request({
      url: '/system/ai/history/admin',
      method: 'get',
      params
    })) as unknown as { code: number; data?: { items?: AiHistoryAdminRow[]; total?: number } }
    const d = res.data
    rows.value = d?.items ?? []
    total.value = d?.total ?? 0
  } catch (e) {
    if (import.meta.env.DEV) console.error('[aiHistory] load failed:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => load(1))
</script>
