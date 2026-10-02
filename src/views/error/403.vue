<template>
  <div class="flex items-center justify-center min-h-[60vh] py-10 px-5" role="main" :aria-label="ariaLabel">
    <el-result icon="warning" :title="t('error.e403.title')" :sub-title="t('error.e403.message')">
      <template #extra>
        <el-button type="primary" @click="goHome">{{ t('error.e403.backHome') }}</el-button>
        <el-button @click="goBack">{{ t('error.e403.backPrev') }}</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts" name="Error403">
const { t } = useI18n()
import { ElResult, ElButton } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// a11y 标签：包含当前路径，便于辅助技术识别上下文
const ariaLabel = computed(() => t('error.e403.ariaLabel', { path: route.fullPath }))

function goHome(): void {
  router.push('/')
}

function goBack(): void {
  router.back()
}
</script>
