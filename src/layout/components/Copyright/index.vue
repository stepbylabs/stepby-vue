<template>
  <Transition name="expand-fade">
    <footer
      v-if="visible"
      class="copyright fixed bottom-0 left-0 right-0 text-right text-text-secondary text-sm border-t border-border-lighter"
    >
      <span>{{ content }}</span>
    </footer>
  </Transition>
</template>

<script setup lang="ts">
import useSettingsStore from '@/store/modules/settings'

const settingsStore = useSettingsStore()

const visible = computed(() => settingsStore.footerVisible)
const content = computed(() => settingsStore.footerContent)
</script>

<style scoped>
.copyright {
  height: 36px;
  padding: 10px 20px;
  background-color: var(--el-bg-color-page);
  z-index: 999;
}
</style>
