<template>
  <div class="theme-editor">
    <el-form label-width="100px" size="small">
      <el-form-item :label="t('themeEditor.themeColor')">
        <div class="theme-colors flex gap-2 flex-wrap">
          <div
            v-for="color in presetColors"
            :key="color"
            class="color-dot w-6 h-6 rounded-full cursor-pointer border-2 border-transparent"
            :class="{ active: theme === color }"
            :style="{ background: color }"
            @click="handleThemeChange(color)"
          />
        </div>
      </el-form-item>
      <el-form-item :label="t('themeEditor.custom')">
        <el-color-picker v-model="customColor" @change="handleCustomColor" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('themeEditor.customTip') }}</span>
      </el-form-item>
      <el-form-item :label="t('themeEditor.sideTheme')">
        <el-radio-group v-model="sideTheme" @change="handleSideTheme">
          <el-radio value="theme-auto">{{ t('themeEditor.sideAuto') }}</el-radio>
          <el-radio value="theme-dark">{{ t('themeEditor.sideDark') }}</el-radio>
          <el-radio value="theme-light">{{ t('themeEditor.sideLight') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('themeEditor.darkMode')">
        <el-switch :model-value="isDark" @change="toggleDark" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('themeEditor.darkModeTip') }}</span>
      </el-form-item>
      <el-form-item :label="t('themeEditor.followSystem')">
        <el-switch v-model="followSystem" @change="handleFollowSystem" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('themeEditor.followSystemTip') }}</span>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleReset">{{ t('themeEditor.reset') }}</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import useSettingsStore from '@/store/modules/settings'
import { handleThemeStyle } from '@/utils/theme'
import modal from '@/plugins/modal'
import cache from '@/plugins/cache'

const { t } = useI18n()
const settingsStore = useSettingsStore()

const theme = computed(() => settingsStore.theme)
const isDark = computed(() => settingsStore.isDark)
const sideTheme = ref(settingsStore.sideTheme)
const followSystem = ref(settingsStore.userPrefs.followSystemDark)
const customColor = ref(theme.value)

const presetColors = [
  '#409EFF', // 极客蓝
  '#13ce66', // 极光绿
  '#f56c6c', // 玫瑰红
  '#ffba00', // 阳光橙
  '#909399', // 钢琴灰
  '#5ac8fa', // 天空蓝
  '#ff5722', // 火焰红
  '#9c27b0', // 紫罗兰
  '#3f51b5', // 靛青蓝
  '#009688' // 湖水绿
]

function handleThemeChange(color: string) {
  settingsStore.changeSetting({ key: 'theme', value: color })
  customColor.value = color
  nextTick(() => {
    handleThemeStyle(color)
  })
  saveLayoutSetting()
}

function handleCustomColor(color: string | null) {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    handleThemeChange(color)
  }
}

function handleSideTheme(val: string) {
  settingsStore.changeSetting({ key: 'sideTheme', value: val })
  saveLayoutSetting()
}

function toggleDark() {
  settingsStore.toggleTheme()
}

function handleFollowSystem(val: boolean) {
  settingsStore.updateUserPrefs({ followSystemDark: val })
  if (val) {
    modal.msgSuccess(t('themeEditor.followSystemEnabled'))
  }
}

function handleReset() {
  handleThemeChange('#409EFF')
  sideTheme.value = 'theme-auto'
  handleSideTheme('theme-auto')
  settingsStore.updateUserPrefs({ followSystemDark: false })
  followSystem.value = false
  if (settingsStore.isDark) settingsStore.toggleTheme()
  modal.msgSuccess(t('themeEditor.resetSuccess'))
}

function saveLayoutSetting() {
  const layoutSetting = {
    theme: settingsStore.theme,
    sideTheme: settingsStore.sideTheme,
    navType: settingsStore.navType,
    tagsView: settingsStore.tagsView,
    tagsViewPersist: settingsStore.tagsViewPersist,
    tagsIcon: settingsStore.tagsIcon,
    tagsViewStyle: settingsStore.tagsViewStyle,
    fixedHeader: settingsStore.fixedHeader,
    sidebarLogo: settingsStore.sidebarLogo,
    dynamicTitle: settingsStore.dynamicTitle
  }
  cache.local.set('layout-setting', JSON.stringify(layoutSetting))
}
</script>

<style lang="scss" scoped>
.color-dot {
  transition: all 0.2s;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: var(--el-text-color-primary, #303133);
    box-shadow:
      0 0 0 2px var(--el-bg-color, #fff),
      0 0 0 4px currentColor;
  }
}
</style>
