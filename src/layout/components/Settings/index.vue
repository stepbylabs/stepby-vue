<template>
  <el-drawer v-model="showSettings" :withHeader="false" :lock-scroll="false" direction="rtl" size="min(90%, 300px)">
    <div class="setting-drawer-title">
      <h3 class="drawer-title">{{ t('layout.settings.menuNavSetting') }}</h3>
    </div>
    <div class="nav-wrap flex justify-start items-center mt-2.5 mb-5">
      <el-tooltip :content="t('layout.settings.leftMenu')" placement="bottom">
        <div
          class="item left"
          role="button"
          tabindex="0"
          :aria-label="t('layout.settings.leftMenu')"
          :aria-pressed="navType == 1"
          @click="handleNavType(1)"
          @keydown.enter.prevent="handleNavType(1)"
          :class="{ activeItem: navType == 1 }">
          <b></b>
          <b></b>
        </div>
      </el-tooltip>

      <el-tooltip :content="t('layout.settings.mixedMenu')" placement="bottom">
        <div
          class="item mix"
          role="button"
          tabindex="0"
          :aria-label="t('layout.settings.mixedMenu')"
          :aria-pressed="navType == 2"
          @click="handleNavType(2)"
          @keydown.enter.prevent="handleNavType(2)"
          :class="{ activeItem: navType == 2 }">
          <b></b>
          <b></b>
        </div>
      </el-tooltip>
      <el-tooltip :content="t('layout.settings.topMenu')" placement="bottom">
        <div
          class="item top"
          role="button"
          tabindex="0"
          :aria-label="t('layout.settings.topMenu')"
          :aria-pressed="navType == 3"
          @click="handleNavType(3)"
          @keydown.enter.prevent="handleNavType(3)"
          :class="{ activeItem: navType == 3 }">
          <b></b>
          <b></b>
        </div>
      </el-tooltip>
    </div>
    <div class="setting-drawer-title">
      <h3 class="drawer-title">{{ t('layout.settings.themeStyleSetting') }}</h3>
    </div>
    <div class="setting-drawer-block-checbox flex justify-start items-center mt-2.5 mb-5">
      <div
        class="setting-drawer-block-checbox-item"
        role="button"
        tabindex="0"
        :aria-label="t('layout.settings.autoThemeStyle')"
        :aria-pressed="sideTheme === 'theme-auto'"
        @click="handleTheme('theme-auto')"
        @keydown.enter.prevent="handleTheme('theme-auto')" >
        <img src="@/assets/images/auto.svg" :alt="t('layout.settings.autoThemePreview')" loading="lazy" />
        <Transition name="fade">
          <div v-if="sideTheme === 'theme-auto'" class="setting-drawer-block-checbox-selectIcon !block">
            <i :aria-label="t('layout.settings.iconCheck')" class="anticon anticon-check">
              <svg
                viewBox="64 64 896 896"
                data-icon="check"
                width="1em"
                height="1em"
                :fill="theme"
                aria-hidden="true"
                focusable="fals" >
                <path
                  d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 0 0-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l488.4-618.9c4.1-5.1.4-12.8-6.3-12.8z"
                />
              </svg>
            </i>
          </div>
        </Transition>
      </div>
      <div
        class="setting-drawer-block-checbox-item"
        role="button"
        tabindex="0"
        :aria-label="t('layout.settings.darkThemeStyle')"
        :aria-pressed="sideTheme === 'theme-dark'"
        @click="handleTheme('theme-dark')"
        @keydown.enter.prevent="handleTheme('theme-dark')" >
        <img src="@/assets/images/dark.svg" :alt="t('layout.settings.darkThemePreview')" loading="lazy" />
        <Transition name="fade">
          <div v-if="sideTheme === 'theme-dark'" class="setting-drawer-block-checbox-selectIcon !block">
            <i :aria-label="t('layout.settings.iconCheck')" class="anticon anticon-check">
              <svg
                viewBox="64 64 896 896"
                data-icon="check"
                width="1em"
                height="1em"
                :fill="theme"
                aria-hidden="true"
                focusable="fals" >
                <path
                  d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 0 0-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l488.4-618.9c4.1-5.1.4-12.8-6.3-12.8z"
                />
              </svg>
            </i>
          </div>
        </Transition>
      </div>
      <div
        class="setting-drawer-block-checbox-item"
        role="button"
        tabindex="0"
        :aria-label="t('layout.settings.lightThemeStyle')"
        :aria-pressed="sideTheme === 'theme-light'"
        @click="handleTheme('theme-light')"
        @keydown.enter.prevent="handleTheme('theme-light')" >
        <img src="@/assets/images/light.svg" :alt="t('layout.settings.lightThemePreview')" loading="lazy" />
        <Transition name="fade">
          <div
            v-if="sideTheme === 'theme-light'"
            class="setting-drawer-block-checbox-selectIcon !block">
            <i :aria-label="t('layout.settings.iconCheck')" class="anticon anticon-check">
              <svg
                viewBox="64 64 896 896"
                data-icon="check"
                width="1em"
                height="1em"
                :fill="theme"
                aria-hidden="true"
                focusable="fals" >
                <path
                  d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 0 0-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l488.4-618.9c4.1-5.1.4-12.8-6.3-12.8z"
                />
              </svg>
            </i>
          </div>
        </Transition>
      </div>
    </div>
    <div class="drawer-item">
      <span>{{ t('layout.settings.themeColor') }}</span>
      <span class="comp-style">
        <el-color-picker v-model="theme" :predefine="predefineColors" @change="themeChange" />
      </span>
    </div>

    <div class="drawer-item theme-mode-item">
      <span>{{ t('theme.modeTitle') }}</span>
      <span class="comp-style theme-mode-group">
        <el-radio-group :model-value="themeMode" @change="handleThemeModeChange" size="small">
          <el-radio-button value="light">
            <svg-icon icon-class="sunny" class="mr-1" />
            {{ t('theme.light') }}
          </el-radio-button>
          <el-radio-button value="dark">
            <svg-icon icon-class="moon" class="mr-1" />
            {{ t('theme.dark') }}
          </el-radio-button>
          <el-radio-button value="auto">
            <svg-icon icon-class="international" class="mr-1" />
            {{ t('theme.auto') }}
          </el-radio-button>
        </el-radio-group>
      </span>
    </div>
    <div class="theme-mode-desc">{{ themeModeDesc }}</div>
    <el-divider />

    <h3 class="drawer-title">{{ t('layout.settings.systemLayoutConfig') }}</h3>

    <div class="drawer-item">
      <span>{{ t('layout.settings.enableTagsView') }}</span>
      <span class="comp-style">
        <el-switch v-model="settingsStore.tagsView" class="drawer-switch" />
      </span>
    </div>

    <div class="drawer-item">
      <span>{{ t('layout.settings.persistTagsView') }}</span>
      <span class="comp-style">
        <el-switch
          v-model="settingsStore.tagsViewPersist"
          :disabled="!settingsStore.tagsView"
          @change="tagsViewPersistChange"
          class="drawer-switch"
        />
      </span>
    </div>

    <div class="drawer-item">
      <span>{{ t('layout.settings.showTagsIcon') }}</span>
      <span class="comp-style">
        <el-switch v-model="settingsStore.tagsIcon" :disabled="!settingsStore.tagsView" class="drawer-switch" />
      </span>
    </div>

    <div class="drawer-item">
      <span>{{ t('layout.settings.tagsViewStyle') }}</span>
      <span class="comp-style">
        <el-radio-group v-model="settingsStore.tagsViewStyle" :disabled="!settingsStore.tagsView" size="small">
          <el-radio-button value="card">{{ t('layout.settings.styleCard') }}</el-radio-button>
          <el-radio-button value="chrome">{{ t('layout.settings.styleChrome') }}</el-radio-button>
        </el-radio-group>
      </span>
    </div>

    <div class="drawer-item">
      <span>{{ t('layout.settings.fixedHeader') }}</span>
      <span class="comp-style">
        <el-switch v-model="settingsStore.fixedHeader" class="drawer-switch" />
      </span>
    </div>

    <div class="drawer-item">
      <span>{{ t('layout.settings.showLogo') }}</span>
      <span class="comp-style">
        <el-switch v-model="settingsStore.sidebarLogo" class="drawer-switch" />
      </span>
    </div>

    <div class="drawer-item">
      <span>{{ t('layout.settings.dynamicTitle') }}</span>
      <span class="comp-style">
        <el-switch v-model="settingsStore.dynamicTitle" @change="dynamicTitleChange" class="drawer-switch" />
      </span>
    </div>

    <div class="drawer-item">
      <span>{{ t('layout.settings.footerCopyright') }}</span>
      <span class="comp-style">
        <el-switch v-model="settingsStore.footerVisible" class="drawer-switch" />
      </span>
    </div>

    <el-divider />

    <h3 class="drawer-title">{{ t('layout.settings.advancedThemeEditor') }}</h3>
    <theme-editor />

    <el-divider />

    <el-button type="primary" plain icon="DocumentAdd" @click="saveSetting">
      {{ t('layout.settings.saveConfig') }}
    </el-button>
    <el-button plain icon="Refresh" @click="resetSetting">{{ t('layout.settings.resetConfig') }}</el-button>
  </el-drawer>
</template>

<script setup lang="ts">
import useAppStore from '@/store/modules/app'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'
import { handleThemeStyle } from '@/utils/theme'
import modal from '@/plugins/modal'
import cache from '@/plugins/cache'
import ThemeEditor from '@/components/ThemeEditor/index.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const permissionStore = usePermissionStore()
const showSettings = ref<boolean>(false)
// 收集所有 setTimeout 句柄，组件卸载时统一清理，避免内存泄漏与回调误触发
const timers = ref<ReturnType<typeof setTimeout>[]>([])

onBeforeUnmount(() => {
  timers.value.forEach(clearTimeout)
  timers.value = []
})
const navType = ref<number>(settingsStore.navType)
const theme = ref<string>(settingsStore.theme)
const sideTheme = ref<string>(settingsStore.sideTheme)
const predefineColors = ref<string[]>([
  '#409EFF',
  '#ff4500',
  '#ff8c00',
  '#ffd700',
  '#90ee90',
  '#00ced1',
  '#1e90ff',
  '#c71585'
])

/** 主题模式：light / dark / auto（根据 isDark + followSystemDark 派生） */
const themeMode = computed<'light' | 'dark' | 'auto'>(() => {
  if (settingsStore.userPrefs.followSystemDark) return 'auto'
  return settingsStore.isDark ? 'dark' : 'light'
})

/** 主题模式描述文案 */
const themeModeDesc = computed(() => {
  switch (themeMode.value) {
    case 'light':
      return t('theme.lightDesc')
    case 'dark':
      return t('theme.darkDesc')
    case 'auto':
      return t('theme.autoDesc')
    default:
      return t('theme.autoDesc')
  }
})

/** 切换主题模式 */
function handleThemeModeChange(mode: 'light' | 'dark' | 'auto'): void {
  if (mode === 'auto') {
    // 跟随系统：开启 followSystemDark，watcher 会自动同步 isDark
    settingsStore.updateUserPrefs({ followSystemDark: true })
  } else {
    // 手动模式：关闭 followSystemDark，并设置 isDark
    const wantDark = mode === 'dark'
    settingsStore.updateUserPrefs({ followSystemDark: false })
    if (settingsStore.isDark !== wantDark) {
      settingsStore.toggleTheme()
    }
  }
  modal.msgSuccess(t('theme.applied'))
}

/** 是否需要dynamicTitle */
function dynamicTitleChange(): void {
  useSettingsStore().setTitle(useSettingsStore().title)
}

function tagsViewPersistChange(val: boolean): void {
  settingsStore.tagsViewPersist = val
}

function themeChange(val: string): void {
  settingsStore.theme = val
  handleThemeStyle(val)
}

function handleTheme(val: string): void {
  settingsStore.sideTheme = val
  sideTheme.value = val
}

function handleNavType(val: number): void {
  settingsStore.navType = val
  navType.value = val
}

/** 菜单导航设置 */
watch(
  navType,
  (val: number) => {
    // S2（UX-RESPONSIVE-PLAN）：手机/平板档的侧边栏开合由响应式布局接管
    // （layout watchEffect 收起为抽屉/折叠条）——此处不得强制展开覆盖之，
    // 否则平板/手机首屏会残留全宽侧边栏 + 遮罩（immediate watch 晚于布局层 close）。
    const responsiveDevice = appStore.device === 'mobile' || appStore.device === 'tablet'
    if (val === 1) {
      if (responsiveDevice) {
        appStore.closeSideBar({ withoutAnimation: true })
      } else {
        appStore.sidebar.opened = true
      }
      appStore.toggleSideBarHide(false)
    }
    if (val === 2) {
      if (!responsiveDevice) {
        appStore.sidebar.opened = true
      }
    }
    if (val === 3) {
      appStore.sidebar.opened = false
      appStore.toggleSideBarHide(true)
    }
    if ([1, 3].includes(val)) {
      permissionStore.setSidebarRouters(permissionStore.defaultRoutes)
    }
  },
  { immediate: true }
)

function saveSetting(): void {
  modal.loading(t('layout.settings.savingTip'))
  if (!settingsStore.tagsViewPersist) {
    cache.local.remove('tags-view-visited')
  }
  const layoutSetting = {
    navType: settingsStore.navType,
    tagsView: settingsStore.tagsView,
    tagsIcon: settingsStore.tagsIcon,
    tagsViewStyle: settingsStore.tagsViewStyle,
    tagsViewPersist: settingsStore.tagsViewPersist,
    fixedHeader: settingsStore.fixedHeader,
    sidebarLogo: settingsStore.sidebarLogo,
    dynamicTitle: settingsStore.dynamicTitle,
    footerVisible: settingsStore.footerVisible,
    sideTheme: settingsStore.sideTheme,
    theme: settingsStore.theme
  }
  cache.local.set('layout-setting', JSON.stringify(layoutSetting))
  timers.value.push(setTimeout(() => modal.closeLoading(), 1000))
}

function resetSetting(): void {
  cache.local.remove('tags-view-visited')
  modal.loading(t('layout.settings.resettingTip'))
  cache.local.remove('layout-setting')
  timers.value.push(
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  )
}

function openSetting(): void {
  showSettings.value = true
}

defineExpose({
  openSetting
})
</script>

<style lang="scss" scoped>
.setting-drawer-title {
  margin-bottom: 12px;
  color: var(--el-text-color-primary, rgba(0, 0, 0, 0.85));
  line-height: 22px;
  font-weight: bold;

  .drawer-title {
    font-size: 14px;
  }
}

.setting-drawer-block-checbox {
  .setting-drawer-block-checbox-item {
    position: relative;
    margin-right: 16px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s ease;

    img {
      width: 48px;
      height: 48px;
    }

    .setting-drawer-block-checbox-selectIcon {
      position: absolute;
      top: 0;
      right: 0;
      width: 100%;
      height: 100%;
      padding-top: 15px;
      padding-left: 24px;
      color: var(--el-color-primary);
      font-weight: 700;
      font-size: 14px;
    }
  }
}

.drawer-item {
  color: var(--el-text-color-regular, rgba(0, 0, 0, 0.65));
  padding: 12px 0;
  font-size: 14px;

  .comp-style {
    float: right;
    margin: -3px 8px 0px 0px;
  }
}

/* 主题模式选择器 */
.theme-mode-item {
  .theme-mode-group {
    :deep(.el-radio-button__inner) {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
    }
  }
}

.theme-mode-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  padding: 4px 0 12px 0;
  line-height: 1.5;
}

// 导航模式
.nav-wrap {
  .activeItem {
    border: 2px solid var(--el-color-primary) !important;
  }

  .item {
    position: relative;
    margin-right: 16px;
    cursor: pointer;
    width: 56px;
    height: 48px;
    border-radius: 4px;
    background: var(--el-fill-color);
    border: 2px solid transparent;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;
  }

  .left {
    b:first-child {
      display: block;
      height: 30%;
      background: var(--el-bg-overlay);
    }
    b:last-child {
      width: 30%;
      background: var(--el-menu-bg-color, #1b2a47);
      position: absolute;
      height: 100%;
      top: 0;
      border-radius: 4px 0 0 4px;
    }
  }
  .mix {
    b:first-child {
      border-radius: 4px 4px 0 0;
      display: block;
      height: 30%;
      background: var(--el-menu-bg-color, #1b2a47);
    }
    b:last-child {
      width: 30%;
      background: var(--el-menu-bg-color, #1b2a47);
      position: absolute;
      height: 70%;
      border-radius: 0 0 0 4px;
    }
  }
  .top {
    b:first-child {
      display: block;
      height: 30%;
      background: var(--el-menu-bg-color, #1b2a47);
      border-radius: 4px 4px 0 0;
    }
  }
}
</style>
