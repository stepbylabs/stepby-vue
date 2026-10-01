<template>
  <div class="shortcuts-container app-container p-4">
    <!-- 页面头部 -->
    <el-card class="page-header-card mb-4" shadow="never">
      <div class="page-header flex justify-between items-center flex-wrap gap-3">
        <div class="header-left flex items-center gap-4">
          <el-icon class="header-icon text-4xl text-primary"><Key /></el-icon>
          <div>
            <h2 class="page-title m-0 mb-1 text-xl font-semibold text-text-primary">{{ t('shortcuts.title') }}</h2>
            <p class="page-desc m-0 text-[13px] text-text-secondary">{{ t('shortcuts.desc') }}</p>
          </div>
        </div>
        <div class="header-right">
          <el-input
            v-model="searchKeyword"
            :placeholder="t('shortcuts.searchPlaceholder')"
            :maxlength="50"
            clearable
            class="w-[240px]"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </div>
    </el-card>

    <!-- 快捷键分类展示 -->
    <Transition mode="out-in" name="fade">
      <el-row :gutter="16" v-if="filteredGroups.length > 0" key="list">
        <el-col v-for="group in filteredGroups" :key="group.name" :xs="24" :md="12" :lg="8">
          <el-card class="shortcut-group-card mb-4" shadow="hover">
            <template #header>
              <div class="group-header flex items-center gap-2 font-semibold">
                <el-icon class="group-icon text-lg text-primary"><component :is="group.icon" /></el-icon>
                <span class="group-name flex-1">{{ t(`shortcuts.groups.${group.name}`) }}</span>
                <el-tag size="small" type="info" effect="plain">{{ group.items.length }}</el-tag>
              </div>
            </template>
            <TransitionGroup name="list" tag="div" class="shortcut-list flex flex-col gap-2">
              <div
                v-for="item in group.items"
                :key="item.action"
                class="shortcut-row flex justify-between items-center py-2 px-3 rounded-md cursor-pointer"
                @click="copyShortcut(item.displayKeys.join('+'))"
              >
                <div class="shortcut-info flex-1 min-w-0">
                  <span class="shortcut-action block text-sm font-medium text-text-primary">
                    {{ t(`shortcuts.actions.${item.action}`) }}
                  </span>
                  <span class="shortcut-desc block text-xs text-text-secondary mt-0.5">
                    {{ t(`shortcuts.descriptions.${item.action}`) }}
                  </span>
                </div>
                <div class="shortcut-keys flex gap-1 shrink-0">
                  <kbd v-for="k in item.displayKeys" :key="k" class="key-cap">{{ k }}</kbd>
                </div>
              </div>
            </TransitionGroup>
          </el-card>
        </el-col>
      </el-row>

      <!-- 搜索结果为空时的提示 -->
      <el-empty
        v-else
        :description="t('shortcuts.noResult')"
        :image-size="120"
        class="empty-result py-12"
        key="empty"
      />
    </Transition>

    <!-- 提示信息 -->
    <el-alert :title="t('shortcuts.tipTitle')" type="info" show-icon :closable="false" class="tip-alert mt-4">
      <template #default>
        <p class="my-1 text-[13px] leading-[1.6]">{{ t('shortcuts.tipCustomize') }}</p>
        <p class="my-1 text-[13px] leading-[1.6]">{{ t('shortcuts.tipConflicts') }}</p>
        <p class="my-1 text-[13px] leading-[1.6]">{{ t('shortcuts.tipBrowser') }}</p>
      </template>
    </el-alert>
  </div>
</template>

<script setup lang="ts" name="Shortcuts">
import { ref, computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Key, Search, Compass, Setting, Monitor } from '@element-plus/icons-vue'
import useSettingsStore, { DEFAULT_HOTKEYS } from '@/store/modules/settings'
import { formatHotkey } from '@/composables/useGlobalHotkeys'
import { errorHub } from '@/utils/errorHub'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const searchKeyword = ref('')

// 复制快捷键组合到剪贴板
async function copyShortcut(keys: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(keys)
    ElMessage.success(t('shortcuts.copySuccess'))
  } catch {
    errorHub.report('warning', 'other', t('shortcuts.copyFail'))
  }
}

interface ShortcutItem {
  action: string
  keys: string
  displayKeys: string[]
}

interface ShortcutGroup {
  name: string
  icon: Component
  items: ShortcutItem[]
}

// 用户当前生效的快捷键（合并默认 + 自定义）
const effectiveHotkeys = computed(() => ({
  ...DEFAULT_HOTKEYS,
  ...(settingsStore.userPrefs.customHotkeys || {})
}))

// 将快捷键名（如 ctrl_k）拆分为显示数组（如 ['Ctrl', 'K']）
function parseKeys(keyName: string): string[] {
  if (!keyName) return []
  return formatHotkey(keyName).split(' + ')
}

// 快捷键分组定义
const allGroups = computed<ShortcutGroup[]>(() => {
  const hk = effectiveHotkeys.value
  return [
    {
      name: 'global',
      icon: Compass,
      items: [
        { action: 'search', keys: hk.search, displayKeys: parseKeys(hk.search) },
        { action: 'help', keys: hk.help, displayKeys: parseKeys(hk.help) },
        { action: 'fullscreen', keys: hk.fullscreen, displayKeys: parseKeys(hk.fullscreen) },
        { action: 'toggleSidebar', keys: hk.toggleSidebar, displayKeys: parseKeys(hk.toggleSidebar) }
      ]
    },
    {
      name: 'personal',
      icon: Setting,
      items: [
        { action: 'lockScreen', keys: hk.lockScreen, displayKeys: parseKeys(hk.lockScreen) },
        { action: 'toggleDark', keys: hk.toggleDark, displayKeys: parseKeys(hk.toggleDark) },
        { action: 'settings', keys: hk.settings, displayKeys: parseKeys(hk.settings) },
        { action: 'cycleTheme', keys: hk.cycleTheme, displayKeys: parseKeys(hk.cycleTheme) }
      ]
    },
    {
      name: 'navigation',
      icon: Monitor,
      items: [
        { action: 'goBack', keys: 'alt_left', displayKeys: ['Alt', '←'] },
        { action: 'goForward', keys: 'alt_right', displayKeys: ['Alt', '→'] },
        { action: 'closeTab', keys: 'ctrl_w', displayKeys: ['Ctrl', 'W'] },
        { action: 'refreshTab', keys: 'f5', displayKeys: ['F5'] }
      ]
    }
  ]
})

// 搜索过滤
const filteredGroups = computed<ShortcutGroup[]>(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return allGroups.value

  return allGroups.value
    .map((group: ShortcutGroup) => ({
      ...group,
      items: group.items.filter((item: ShortcutItem) => {
        const actionText = t(`shortcuts.actions.${item.action}`).toLowerCase()
        const descText = t(`shortcuts.descriptions.${item.action}`).toLowerCase()
        const keysText = item.displayKeys.join(' ').toLowerCase()
        return actionText.includes(keyword) || descText.includes(keyword) || keysText.includes(keyword)
      })
    }))
    .filter((group: ShortcutGroup) => group.items.length > 0)
})
</script>

<style lang="scss" scoped>
.shortcuts-container {
  .shortcut-row {
    background: var(--el-fill-color-light, #fafafa);
    transition:
      background 0.2s,
      transform 0.15s;

    &:hover {
      background: var(--el-fill-color, #f0f2f5);
      transform: translateX(2px);
    }

    &:active {
      transform: translateX(0);
    }
  }

  .key-cap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 24px;
    padding: 0 6px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color, #dcdfe6);
    border-bottom-width: 2px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
}

// 暗色模式适配
:deep(html.dark) .shortcut-row {
  background: var(--el-fill-color-dark, #262727);
}

:deep(html.dark) .key-cap {
  background: var(--el-bg-color, #141414);
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color-dark, #4c4d4f);
}

:deep(html.dark) .page-title {
  color: var(--el-text-color-primary);
}

:deep(html.dark) .shortcut-action {
  color: var(--el-text-color-primary);
}

:deep(html.dark) .shortcut-desc {
  color: var(--el-text-color-secondary);
}

// 响应式适配
@media screen and (max-width: 768px) {
  .shortcuts-container .page-header-card .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
