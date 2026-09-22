<template>
  <WidgetCard :title="t('dashboard.layout.widgetStats')" icon="DataLine">
    <div v-loading="loading && !loaded" :element-loading-text="t('common.loading')">
      <StatCards :stats="stats" />
    </div>
  </WidgetCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import request from '@/utils/request'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
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

const loading = ref(false)
const loaded = ref(false)
const stats = ref({
  totalUsers: 0,
  newUsers: 0,
  totalRoles: 0,
  activeRoles: 0,
  todayLogins: 0,
  loginFail: 0,
  onlineCount: 0,
  todayAnomalyIps: 0
})

async function load() {
  loading.value = true
  try {
    const res: { data?: DashboardStats } = await request({ url: '/dashboard/stats', method: 'get' })
    const data = res.data || {}
    stats.value = {
      totalUsers: data.totalUsers || 0,
      newUsers: data.newUsersThisWeek || 0,
      totalRoles: data.totalRoles || 0,
      activeRoles: data.activeRoles || 0,
      todayLogins: data.todayLogins || 0,
      loginFail: data.loginFail || 0,
      onlineCount: data.onlineCount || 0,
      todayAnomalyIps: data.todayAnomalyIps || 0
    }
    loaded.value = true
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to load stats:', e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
useAutoRefresh(load)
</script>
