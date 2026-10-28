<template>
  <WidgetCard :title="t('dashboard.layout.widgetStats')" icon="DataLine">
    <div v-loading="loading && !loaded" :element-loading-text="t('common.loading')">
      <el-empty
        v-if="loadError && !loaded"
        class="widget-load-fail"
        :image-size="60"
        :description="t('dashboard.statsLoadFail')"
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
        <!-- StatCards 输出的是 5 个 el-col（24 栅格各占 6 → 一行 4 张），
             el-col 必须作为 el-row 的直接子元素才成横向栅格；widget 化改造时
             遗漏了 el-row 容器导致卡片默认竖排（用户实测缺陷） -->
        <el-row :gutter="10">
          <StatCards :stats="cards" />
        </el-row>
      </template>
    </div>
  </WidgetCard>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import request from '@/utils/request'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useWidgetLoad } from '@/composables/useWidgetLoad'
import WidgetCard from '../WidgetCard.vue'
import StatCards from '../StatCards.vue'

const { t } = useI18n()

interface DashboardStats {
  totalUsers?: number
  totalRoles?: number
  activeRoles?: number
  todayLogins?: number
  loginFail?: number
  onlineCount?: number
  todayAnomalyIps?: number
  newUsersThisWeek?: number
}

const EMPTY_STATS = {
  totalUsers: 0,
  newUsers: 0,
  totalRoles: 0,
  activeRoles: 0,
  todayLogins: 0,
  loginFail: 0,
  onlineCount: 0,
  todayAnomalyIps: 0
}

// 失败不再显示成"全是 0"：首载失败给失败态 + 重试；刷新失败保留上次数据并标注（b107）
const { data, loading, loaded, loadError, load } = useWidgetLoad<DashboardStats>(async () => {
  const res: { data?: DashboardStats } = await request({ url: '/dashboard/stats', method: 'get' })
  return res.data || {}
}, {})

const cards = computed(() => {
  const d = data.value
  return {
    ...EMPTY_STATS,
    totalUsers: d.totalUsers || 0,
    newUsers: d.newUsersThisWeek || 0,
    totalRoles: d.totalRoles || 0,
    activeRoles: d.activeRoles || 0,
    todayLogins: d.todayLogins || 0,
    loginFail: d.loginFail || 0,
    onlineCount: d.onlineCount || 0,
    todayAnomalyIps: d.todayAnomalyIps || 0
  }
})

onMounted(load)
useAutoRefresh(load)
</script>

<style lang="scss" scoped>
.widget-load-fail {
  padding: 8px 0;
}
</style>
