<template>
  <div role="button" tabindex="0" :aria-label="t('stepby.gitAriaLabel')" @click="goto" @keydown.enter.prevent="goto">
    <svg-icon icon-class="github" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const url = ref<string>('https://github.com/stepby/stepby')

function goto(): void {
  window.open(url.value, '_blank', 'noopener,noreferrer')
}
</script>
