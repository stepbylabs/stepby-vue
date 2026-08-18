<template>
  <div class="sidebar-logo-container" :class="{ 'is-collapsed': collapse }">
    <router-link class="sidebar-logo-link" :class="collapse ? 'is-collapse' : ''" to="/" :aria-label="title">
      <img v-if="logo" :src="logo" class="sidebar-logo w-8 h-8 shrink-0" :class="collapse ? '' : 'mr-3'" :alt="title" />
      <Transition name="fade" mode="out-in">
        <h1 v-if="!collapse" key="title" class="sidebar-title">{{ title }}</h1>
      </Transition>
    </router-link>
  </div>
</template>

<script setup lang="ts">
import logo from '@/assets/logo/logo.svg'
import useSettingsStore from '@/store/modules/settings'

defineProps({
  collapse: {
    type: Boolean,
    required: true
  }
})

const title = import.meta.env.VITE_APP_TITLE
const settingsStore = useSettingsStore()

// Logo 背景色/文字色：统一通过 CSS 变量驱动
// navType=3（纯顶部栏）时 Logo 在 Navbar 中，用 navbar 变量；否则在侧边栏，用 sidebar 变量
// theme-auto/theme-dark/theme-light 由 CSS 变量层级自动处理
const getLogoBackground = computed(() => {
  return settingsStore.navType === 3 ? 'var(--navbar-bg)' : 'var(--sidebar-bg)'
})

const getLogoTextColor = computed(() => {
  return settingsStore.navType === 3 ? 'var(--navbar-text)' : 'var(--sidebar-logo-text)'
})
</script>

<style lang="scss" scoped>
.sidebar-logo-container {
  position: relative;
  height: 50px;
  background: v-bind(getLogoBackground);
  overflow: hidden;

  &.is-collapsed {
    .sidebar-logo-link {
      padding-left: 0;
    }
  }

  .sidebar-logo-link {
    display: flex !important;
    align-items: center;
    width: 100%;
    height: 100%;
    padding-left: 12px;
    transition: padding 0.2s ease;

    /* 折叠时水平居中且去掉左内边距 */
    &.is-collapse {
      justify-content: center;
      padding-left: 0;
    }

    .sidebar-logo {
      flex-shrink: 0;
      vertical-align: middle;
      transition:
        margin 0.2s ease,
        padding 0.2s ease;
    }

    .sidebar-title {
      margin: 0;
      min-width: 0;
      flex-shrink: 1;
      color: v-bind(getLogoTextColor);
      font-weight: 600;
      font-size: 15px;
      font-family:
        Avenir,
        Helvetica Neue,
        Arial,
        Helvetica,
        sans-serif;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}
</style>
