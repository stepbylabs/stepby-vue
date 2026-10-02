<template>
  <i-frame :src="url"></i-frame>
</template>

<script setup lang="ts">
import iFrame from '@/components/iFrame/index.vue'

// P2 修复: iFrame 组件未 emit update:src，原 v-model:src 误用，改为单向 :src 绑定
// Swagger UI 是后端静态页面而非 API：src 必须用同源页面路径 /swagger-ui/index.html，
// 不能拼 VITE_APP_BASE_API（/prod-api）——该前缀下无此路由，会 404 且被 X-Frame-Options
// 拒显（2026-10-02 M3 根因）；后端 security_headers 已对 /swagger-ui 发 SAMEORIGIN。
const url = ref<string>('/swagger-ui/index.html')
</script>
