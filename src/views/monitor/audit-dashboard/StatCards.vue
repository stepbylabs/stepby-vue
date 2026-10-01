<template>
  <el-col v-motion="staggerChildren(0)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card shadow="hover" class="stat-card stat-total mb-3 transition-all duration-200 hover:-translate-y-1">
      <div class="stat-content flex items-center gap-3.5">
        <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
          <el-icon><Document /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">{{ stats.totalOps }}</div>
          <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.totalOps') }}</div>
        </div>
      </div>
    </el-card>
  </el-col>
  <el-col v-motion="staggerChildren(1)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card shadow="hover" class="stat-card stat-success mb-3 transition-all duration-200 hover:-translate-y-1">
      <div class="stat-content flex items-center gap-3.5">
        <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">
            {{ stats.successOps }}
          </div>
          <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.successOps') }}</div>
        </div>
      </div>
    </el-card>
  </el-col>
  <el-col v-motion="staggerChildren(2)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card shadow="hover" class="stat-card stat-fail mb-3 transition-all duration-200 hover:-translate-y-1">
      <div class="stat-content flex items-center gap-3.5">
        <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
          <el-icon><CircleClose /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">{{ stats.failOps }}</div>
          <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.failOps') }}</div>
        </div>
      </div>
    </el-card>
  </el-col>
  <el-col v-motion="staggerChildren(3)" :xs="12" :sm="12" :md="6" :lg="6">
    <el-card shadow="hover" class="stat-card stat-active mb-3 transition-all duration-200 hover:-translate-y-1">
      <div class="stat-content flex items-center gap-3.5">
        <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
          <el-icon><User /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">
            {{ stats.activeUsers }}
          </div>
          <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.activeUsers') }}</div>
        </div>
      </div>
    </el-card>
  </el-col>
</template>

<script setup lang="ts">
import { Document, CircleCheck, CircleClose, User } from '@element-plus/icons-vue'
import { useMotionPresets } from '@/composables/useMotion'

interface Stats {
  totalOps: number
  successOps: number
  failOps: number
  activeUsers: number
}

defineProps<{
  stats: Stats
}>()

const { t } = useI18n()
const { staggerChildren } = useMotionPresets()
</script>

<style lang="scss" scoped>
.stat-card {
  :deep(.el-card__body) {
    padding: 16px;
  }
}

.stat-icon {
  border-radius: 10px;
  color: var(--el-color-white);
}

.stat-total .stat-icon {
  background: linear-gradient(135deg, #409eff, #66b1ff);
}
.stat-success .stat-icon {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}
.stat-fail .stat-icon {
  background: linear-gradient(135deg, #f56c6c, #f89898);
}
.stat-active .stat-icon {
  background: linear-gradient(135deg, #e6a23c, #ebb563);
}

.stat-label {
  font-size: 13px;
}
</style>
