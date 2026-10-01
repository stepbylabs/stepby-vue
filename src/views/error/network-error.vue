<template>
  <div class="flex items-center justify-center min-h-[60vh] py-10 px-5" role="main" :aria-label="ariaLabel">
    <el-result icon="warning" :title="t('error.network.title')" :sub-title="t('error.network.message')">
      <template #extra>
        <el-button type="primary" @click="retry">{{ t('error.network.retry') }}</el-button>
        <el-button @click="goHome">{{ t('error.network.backHome') }}</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts" name="ErrorNetwork">
const { t } = useI18n()
import { ElResult, ElButton } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// a11y 标签：包含当前路径，便于辅助技术识别上下文
const ariaLabel = computed(() => t('error.network.ariaLabel', { path: route.fullPath }))

function retry(): void {
  location.reload()
}

function goHome(): void {
  router.push('/')
}
</script>
