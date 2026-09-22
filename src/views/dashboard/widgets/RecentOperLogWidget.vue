<template>
  <WidgetCard :title="t('dashboard.recentOperLog')" icon="List">
    <template #header-actions>
      <el-button link type="primary" @click="goToOperLog">{{ t('common.viewAll') }}</el-button>
    </template>

    <SkeletonTable v-if="loading && !loaded" :columns="4" :rows="6" />
    <el-table v-else :data="rows" size="small" :show-header="true" style="width: 100%">
      <el-table-column :label="t('common.tip')" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ moduleTitle(row.title) }}</template>
      </el-table-column>
      <el-table-column prop="operName" :label="t('common.column.operator')" width="100" />
      <el-table-column :label="t('common.column.status')" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">
            {{ row.status === 0 ? t('dashboard.buttonSuccess') : t('dashboard.buttonFail') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="costTime" :label="t('common.column.duration')" width="80" align="right">
        <template #default="{ row }">{{ row.costTime }}ms</template>
      </el-table-column>
    </el-table>
  </WidgetCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import request from '@/utils/request'
import { formatModuleTitle } from '@/utils/operModuleTitle'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import WidgetCard from '../WidgetCard.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'

interface RecentOperLog {
  title: string
  operName: string
  status: number | string
  costTime: number
}

const { t, te } = useI18n()
const router = useRouter()

function moduleTitle(title: string): string {
  return formatModuleTitle(title, t, te)
}

const loading = ref(false)
const loaded = ref(false)
const rows = ref<RecentOperLog[]>([])

async function load() {
  loading.value = true
  try {
    const res: { data?: { recentOperLogs?: RecentOperLog[] } } = await request({
      url: '/dashboard/stats',
      method: 'get'
    })
    rows.value = (res.data?.recentOperLogs || []).map((r) => ({
      title: r.title,
      operName: r.operName,
      status: typeof r.status === 'string' ? (r.status === '0' ? 0 : 1) : r.status,
      costTime: r.costTime
    }))
    loaded.value = true
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to load recent oper logs:', e)
  } finally {
    loading.value = false
  }
}

function goToOperLog() {
  // 操作日志菜单动态注册路径为 /system/log/operlog（组件 monitor/operlog/index），
  // 旧值 /monitor/operlog 并非已注册路由，会命中 404 兜底页。
  router.push('/system/log/operlog')
}

onMounted(load)
useAutoRefresh(load)
</script>
