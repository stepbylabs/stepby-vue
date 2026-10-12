<template>
  <el-card shadow="hover" class="alarm-card" :class="{ 'alarm-triggered': alarmData?.alertTriggered }">
    <template #header>
      <div class="card-header flex items-center justify-between font-medium">
        <span class="flex items-center gap-1.5">
          <el-icon><Bell /></el-icon>
          {{ t('auditDashboard.alarm.title') }}
        </span>
        <el-tooltip :content="alarmThresholdTip" placement="top">
          <el-icon class="text-text-secondary cursor-help"><InfoFilled /></el-icon>
        </el-tooltip>
      </div>
    </template>
    <div v-loading="alarmLoading" :element-loading-text="t('common.loading')">
      <el-alert
        v-if="alarmData"
        :type="alarmData.alertTriggered ? 'error' : 'success'"
        :title="alarmData.alertTriggered ? t('auditDashboard.alarm.triggered') : t('auditDashboard.alarm.normal')"
        :closable="false"
        show-icon
        class="mb-4"
      />
      <div v-if="alarmData" class="alarm-metrics grid grid-cols-3 gap-3 mb-4">
        <div class="alarm-metric flex flex-col items-center">
          <span class="metric-value text-xl font-semibold">{{ alarmData.totalInWindow }}</span>
          <span class="metric-label text-xs text-text-secondary mt-1">
            {{ t('auditDashboard.alarm.totalInWindow') }}
          </span>
        </div>
        <div class="alarm-metric flex flex-col items-center">
          <span class="metric-value text-xl font-semibold" :class="{ 'text-red': alarmData.failInWindow > 0 }">
            {{ alarmData.failInWindow }}
          </span>
          <span class="metric-label text-xs text-text-secondary mt-1">
            {{ t('auditDashboard.alarm.failInWindow') }}
          </span>
        </div>
        <div class="alarm-metric flex flex-col items-center">
          <span class="metric-value text-xl font-semibold" :class="{ 'text-red': alarmData.failRateAlarm }">
            {{ alarmData.failRate.toFixed(2) }}%
          </span>
          <span class="metric-label text-xs text-text-secondary mt-1">
            {{ t('auditDashboard.alarm.failRate') }}
          </span>
        </div>
      </div>
      <div v-if="alarmData && !alarmData.alertTriggered" class="alarm-empty text-center py-6">
        <el-icon class="text-4xl text-text-secondary"><CircleCheck /></el-icon>
      </div>
      <template v-if="alarmData && alarmData.alertTriggered">
        <div v-if="alarmData.operatorBursts && alarmData.operatorBursts.length" class="mb-3">
          <div class="alarm-subtitle flex items-center gap-1.5 text-sm font-medium mb-2">
            <el-icon><User /></el-icon>
            {{ t('auditDashboard.alarm.burstOperators') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <el-tag v-for="item in alarmData.operatorBursts" :key="item.name" type="danger" effect="dark">
              {{ item.name }} · {{ t('auditDashboard.alarm.times', { count: item.count }) }}
            </el-tag>
          </div>
        </div>
        <div v-if="alarmData.moduleBursts && alarmData.moduleBursts.length">
          <div class="alarm-subtitle flex items-center gap-1.5 text-sm font-medium mb-2">
            <el-icon><Collection /></el-icon>
            {{ t('auditDashboard.alarm.burstModules') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <el-tag v-for="item in alarmData.moduleBursts" :key="item.name" type="warning" effect="dark">
              {{ item.name }} · {{ t('auditDashboard.alarm.times', { count: item.count }) }}
            </el-tag>
          </div>
        </div>
      </template>
      <el-empty v-if="!alarmData && !alarmLoading" :description="t('common.noData')" :image-size="60" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { Bell, InfoFilled, CircleCheck, User, Collection } from '@element-plus/icons-vue'

interface AlarmItem {
  name: string
  count: number
}

interface AlarmData {
  alertTriggered: boolean
  totalInWindow: number
  failInWindow: number
  failRate: number
  failRateAlarm: boolean
  operatorBursts?: AlarmItem[]
  moduleBursts?: AlarmItem[]
}

defineProps<{
  alarmData: AlarmData | null
  alarmLoading: boolean
  alarmThresholdTip: string
}>()

const { t } = useI18n()
</script>

<style lang="scss" scoped>
/* 异常告警卡片：触发时为边框/顶部描边高亮 */
.alarm-card {
  :deep(.el-card__body) {
    min-height: 380px;
  }
}

.alarm-triggered {
  border-color: var(--el-color-danger);

  :deep(.el-card__header) {
    border-bottom-color: var(--el-color-danger);
  }
}
</style>
