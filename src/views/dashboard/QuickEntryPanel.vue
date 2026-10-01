<template>
  <!-- 快捷入口 -->
  <el-row :gutter="16" class="mb-4">
    <el-col :span="24">
      <el-card shadow="hover" class="rounded-lg">
        <template #header>
          <div class="card-header flex items-center justify-between font-medium">
            <span>
              <el-icon><Promotion /></el-icon>
              {{ t('dashboard.quickEntry.title') }}
            </span>
            <el-tooltip :content="t('dashboard.quickEntry.tip')" placement="top">
              <el-icon class="header-tip-icon text-text-secondary cursor-help text-base"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </template>
        <div class="quick-entry-grid grid gap-3">
          <div
            v-for="entry in quickEntries"
            :key="entry.path"
            class="quick-entry-item flex items-center gap-3 p-3 px-[14px] rounded-lg cursor-pointer border border-transparent"
            :class="{ disabled: entry.disabled }"
            @click="handleQuickEntry(entry)"
          >
            <div
              class="entry-icon w-10 h-10 rounded-lg flex items-center justify-center text-xl text-white shrink-0"
              :style="{ background: entry.bgColor }"
            >
              <el-icon><component :is="entry.icon" /></el-icon>
            </div>
            <div class="entry-text flex-1 min-w-0">
              <div class="entry-title text-sm font-semibold text-text-primary leading-[1.2]">
                {{ t(entry.titleKey) }}
              </div>
              <div class="entry-desc text-[11px] text-text-secondary mt-1 truncate">{{ t(entry.descKey) }}</div>
            </div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { ref, markRaw, onMounted } from 'vue'
import type { Component } from 'vue'
import {
  User,
  UserFilled,
  Bell,
  Files,
  Document,
  Guide,
  Setting,
  InfoFilled,
  Promotion,
  QuestionFilled
} from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()

// 快捷入口配置（根据权限动态过滤）
interface QuickEntry {
  path: string
  titleKey: string
  descKey: string
  icon: Component
  // M2: bgColor 为图标背景渐变色，属于设计变体（非语义色）。
  // 暗色模式下鲜艳渐变色仍然合适，故保留 inline style 不做暗色模式适配。
  bgColor: string
  permission?: string
  disabled?: boolean
}

const allQuickEntries: QuickEntry[] = [
  {
    path: '/system/user',
    titleKey: 'dashboard.quickEntry.userManage',
    descKey: 'dashboard.quickEntry.userManageDesc',
    icon: markRaw(User),
    bgColor: 'linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3))',
    permission: 'system:user:list'
  },
  {
    path: '/system/role',
    titleKey: 'dashboard.quickEntry.roleManage',
    descKey: 'dashboard.quickEntry.roleManageDesc',
    icon: markRaw(UserFilled),
    bgColor: 'linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-3))',
    permission: 'system:role:list'
  },
  {
    path: '/system/notice',
    titleKey: 'dashboard.quickEntry.notice',
    descKey: 'dashboard.quickEntry.noticeDesc',
    icon: markRaw(Bell),
    bgColor: 'linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-light-3))',
    permission: 'system:notice:list'
  },
  {
    path: '/monitor/backup',
    titleKey: 'dashboard.quickEntry.backup',
    descKey: 'dashboard.quickEntry.backupDesc',
    icon: markRaw(Files),
    bgColor: 'linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-light-3))',
    permission: 'system:backup:list'
  },
  {
    path: '/system/log/operlog',
    titleKey: 'dashboard.quickEntry.operLog',
    descKey: 'dashboard.quickEntry.operLogDesc',
    icon: markRaw(Document),
    bgColor: 'linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-3))',
    permission: 'monitor:operlog:list'
  },
  {
    path: '/monitor/logininfor',
    titleKey: 'dashboard.quickEntry.myLogin',
    descKey: 'dashboard.quickEntry.myLoginDesc',
    icon: markRaw(Guide),
    bgColor: 'linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-5))'
  },
  {
    path: '/system/config',
    titleKey: 'dashboard.quickEntry.config',
    descKey: 'dashboard.quickEntry.configDesc',
    icon: markRaw(Setting),
    bgColor: 'linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-3))',
    permission: 'system:config:list'
  },
  {
    path: '/tool/about',
    titleKey: 'dashboard.quickEntry.about',
    descKey: 'dashboard.quickEntry.aboutDesc',
    icon: markRaw(InfoFilled),
    bgColor: 'linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-5))'
  }
]

const quickEntries = ref<QuickEntry[]>([])

function hasPermission(perm?: string): boolean {
  if (!perm) return true
  // 超管拥有所有权限
  if (userStore.roles?.includes('admin')) return true
  return (userStore.permissions || []).includes(perm) || (userStore.permissions || []).includes('*:*:*')
}

function loadQuickEntries() {
  quickEntries.value = allQuickEntries.filter((e) => hasPermission(e.permission))
}

function handleQuickEntry(entry: QuickEntry) {
  if (entry.disabled) return
  router.push(entry.path)
}

onMounted(() => {
  loadQuickEntries()
})
</script>

<style lang="scss" scoped>
.quick-entry-grid {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.quick-entry-item {
  background: var(--el-fill-color-light, #f5f7fa);
  transition: all 0.25s ease;

  &:hover {
    background: var(--el-fill-color, #ebeef5);
    transform: translateY(-2px);
    border-color: var(--el-color-primary-light-7, #d9ecff);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    &:hover {
      transform: none;
    }
  }
}
</style>
