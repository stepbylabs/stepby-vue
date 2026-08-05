<template>
  <div role="button" tabindex="0" :aria-label="t('yebot.docAriaLabel')" @click="goto" @keydown.enter.prevent="goto">
    <svg-icon icon-class="documentation" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const url = ref<string>('https://yebot.dev/docs')

function goto(): void {
  window.open(url.value, '_blank', 'noopener,noreferrer')
}
</script>
