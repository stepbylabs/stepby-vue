<template>
  <div class="flex items-center justify-center min-h-[60vh] py-10 px-5" role="main" :aria-label="ariaLabel">
    <el-result icon="error" :title="t('error.e500.title')" :sub-title="t('error.e500.message')">
      <template #extra>
        <el-button type="primary" @click="reload">{{ t('error.e500.refresh') }}</el-button>
        <el-button @click="goHome">{{ t('error.e500.backHome') }}</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts" name="Error500">
const { t } = useI18n()
import { ElResult, ElButton } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// a11y 标签：包含当前路径，便于辅助技术识别上下文
const ariaLabel = computed(() => t('error.e500.ariaLabel', { path: route.fullPath }))

function reload(): void {
  location.reload()
}

function goHome(): void {
  router.push('/')
}
</script>
