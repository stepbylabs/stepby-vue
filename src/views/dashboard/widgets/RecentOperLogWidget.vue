<template>
  <WidgetCard :title="t('dashboard.recentOperLog')" icon="List">
    <template #header-actions>
      <el-button link type="primary" @click="goToOperLog">{{ t('common.viewAll') }}</el-button>
    </template>

    <SkeletonTable v-if="loading && !loaded" :columns="4" :rows="6" />
    <el-empty
      v-else-if="loadError && !loaded"
      class="widget-load-fail"
      :image-size="60"
      :description="t('dashboard.recentOperLogLoadFail')"
    >
      <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
    </el-empty>
    <template v-else>
      <el-alert
        v-if="loadError"
        class="mb-2"
        type="warning"
        :closable="false"
        show-icon
        :title="t('common.staleDataHint')"
      >
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </el-alert>
      <el-table :data="rows" size="small" :show-header="true" class="w-full">
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
    </template>
  </WidgetCard>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import request from '@/utils/request'
import { formatModuleTitle } from '@/utils/operModuleTitle'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useWidgetLoad } from '@/composables/useWidgetLoad'
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

// 失败不再显示成"一张空表"：空表与"取数失败"必须可区分（b107）
const { data, loading, loaded, loadError, load } = useWidgetLoad<RecentOperLog[]>(async () => {
  const res: { data?: { recentOperLogs?: RecentOperLog[] } } = await request({
    url: '/dashboard/stats',
    method: 'get'
  })
  return (res.data?.recentOperLogs || []).map((r) => ({
    title: r.title,
    operName: r.operName,
    status: typeof r.status === 'string' ? (r.status === '0' ? 0 : 1) : r.status,
    costTime: r.costTime
  }))
}, [])

const rows = computed(() => data.value)

function goToOperLog() {
  // 操作日志菜单动态注册路径为 /system/log/operlog（组件 monitor/operlog/index），
  // 旧值 /monitor/operlog 并非已注册路由，会命中 404 兜底页。
  router.push('/system/log/operlog')
}

onMounted(load)
useAutoRefresh(load)
</script>

<style lang="scss" scoped>
.widget-load-fail {
  padding: 8px 0;
}
</style>
