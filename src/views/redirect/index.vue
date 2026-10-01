<template>
  <div class="flex justify-center items-center h-full">
    <el-icon class="is-loading text-3xl text-primary"><Loading /></el-icon>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { isSafeRedirect } from '@/utils/redirect'

const route = useRoute()
const router = useRouter()
const { params, query } = route
const { path } = params

// F2 审计加固：route.params.path 未校验，拼接后可能形成 //host 或绝对地址
// 统一经 isSafeRedirect 白名单校验，不安全则回落到首页
const target = '/' + (path as string)
if (isSafeRedirect(target)) {
  router.replace({ path: target, query }).catch(() => {})
} else {
  router.replace('/')
}
</script>
