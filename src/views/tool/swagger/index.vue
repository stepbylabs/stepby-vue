<template>
  <i-frame :src="url"></i-frame>
</template>

<script setup lang="ts">
import iFrame from '@/components/iFrame/index.vue'

// P2 修复: iFrame 组件未 emit update:src，原 v-model:src 误用，改为单向 :src 绑定
const url = ref<string>(import.meta.env.VITE_APP_BASE_API + '/swagger-ui/index.html')
</script>
