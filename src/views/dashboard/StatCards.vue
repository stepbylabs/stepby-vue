<template>
  <!-- 顶部统计卡片（5 张，错峰入场动效保留在父级 el-row 内） -->
  <el-col v-motion="staggerChildren(0)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card class="stat-card mb-3 stat-users" shadow="hover">
      <div class="stat-content flex items-center gap-[14px]">
        <div class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0">
          <el-icon><User /></el-icon>
        </div>
        <div class="stat-info flex-1 min-w-0">
          <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
            {{ stats.totalUsers }}
          </div>
          <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.totalUsers') }}</div>
          <div
            class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5"
            :class="stats.newUsers > 0 ? 'up' : ''"
          >
            <el-icon v-if="stats.newUsers > 0"><Top /></el-icon>
            {{ t('dashboard.weekNew') }} {{ stats.newUsers }}
          </div>
        </div>
      </div>
    </el-card>
  </el-col>
  <el-col v-motion="staggerChildren(1)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card class="stat-card mb-3 stat-roles" shadow="hover">
      <div class="stat-content flex items-center gap-[14px]">
        <div class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0">
          <el-icon><UserFilled /></el-icon>
        </div>
        <div class="stat-info flex-1 min-w-0">
          <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
            {{ stats.totalRoles }}
          </div>
          <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.activeRoles') }}</div>
          <div class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5">
            {{ stats.activeRoles }} {{ t('dashboard.activeRolesSuffix') }}
          </div>
        </div>
      </div>
    </el-card>
  </el-col>
  <el-col v-motion="staggerChildren(2)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card class="stat-card mb-3 stat-logins" shadow="hover">
      <div class="stat-content flex items-center gap-[14px]">
        <div class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0">
          <el-icon><Monitor /></el-icon>
        </div>
        <div class="stat-info flex-1 min-w-0">
          <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
            {{ stats.todayLogins }}
          </div>
          <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.todayLogin') }}</div>
          <div
            class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5"
            :class="stats.loginFail > 0 ? 'down' : ''"
          >
            {{ t('dashboard.buttonFail') }} {{ stats.loginFail }}
          </div>
        </div>
      </div>
    </el-card>
  </el-col>
  <el-col v-motion="staggerChildren(3)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card class="stat-card mb-3 stat-online" shadow="hover">
      <div class="stat-content flex items-center gap-[14px]">
        <div class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0">
          <el-icon><Connection /></el-icon>
        </div>
        <div class="stat-info flex-1 min-w-0">
          <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
            {{ stats.onlineCount }}
          </div>
          <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.onlineUsers') }}</div>
          <div class="stat-trend up text-[11px] text-text-secondary mt-1 flex items-center gap-0.5">
            {{ t('dashboard.realtime') }}
          </div>
        </div>
      </div>
    </el-card>
  </el-col>
  <el-col v-motion="staggerChildren(4)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card class="stat-card mb-3 stat-anomaly" shadow="hover">
      <div class="stat-content flex items-center gap-[14px]">
        <div class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0">
          <el-icon><Warning /></el-icon>
        </div>
        <div class="stat-info flex-1 min-w-0">
          <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
            {{ stats.todayAnomalyIps }}
          </div>
          <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.todayAnomaly') }}</div>
          <div
            class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5"
            :class="stats.todayAnomalyIps > 0 ? 'down' : ''"
          >
            {{ t('dashboard.failIpCount') }}
          </div>
        </div>
      </div>
    </el-card>
  </el-col>
</template>

<script setup lang="ts">
import { User, UserFilled, Monitor, Connection, Warning, Top } from '@element-plus/icons-vue'
import { useMotionPresets } from '@/composables/useMotion'

interface StatCardStats {
  totalUsers: number
  newUsers: number
  totalRoles: number
  activeRoles: number
  todayLogins: number
  loginFail: number
  onlineCount: number
  todayAnomalyIps: number
}

defineProps<{ stats: StatCardStats }>()

const { t } = useI18n()
// P0 动效：统计卡片错峰入场
const { staggerChildren } = useMotionPresets()
</script>

<style lang="scss" scoped>
.stat-card {
  :deep(.el-card__body) {
    padding: 16px;
  }
}

.stat-users .stat-icon {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
}
.stat-roles .stat-icon {
  background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-3));
}
.stat-logins .stat-icon {
  background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-light-3));
}
.stat-online .stat-icon {
  background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-light-3));
}
.stat-anomaly .stat-icon {
  background: linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-3));
}

.stat-trend {
  &.up {
    color: var(--el-color-success, #67c23a);
  }
  &.down {
    color: var(--el-color-danger, #f56c6c);
  }
}
</style>
