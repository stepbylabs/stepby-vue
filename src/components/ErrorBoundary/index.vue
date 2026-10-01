<template>
  <!--
    TierB-1: ErrorBoundary 错误边界组件
    - 捕获子组件树渲染错误，避免整页白屏
    - 显示友好的错误提示 + 重试按钮
    - 通过 onErrorCaptured 钩子捕获同步/异步错误
  -->
  <slot v-if="!hasError" />
  <Transition name="fade">
    <div
      v-if="hasError"
      class="error-boundary flex flex-col items-center justify-center py-[60px] px-5 text-center min-h-[320px]"
      role="alert"
      aria-live="assertive"
    >
      <div class="error-boundary__icon text-danger mb-4">
        <el-icon :size="56"><WarningFilled /></el-icon>
      </div>
      <h3 class="error-boundary__title m-0 mb-2 text-lg font-semibold text-text-primary">
        {{ t('errorBoundary.title') }}
      </h3>
      <p class="error-boundary__desc m-0 mb-6 text-text-secondary text-sm max-w-[480px]">
        {{ t('errorBoundary.desc') }}
      </p>
      <div class="error-boundary__actions flex gap-3 mb-5">
        <el-button type="primary" @click="handleRetry">
          <el-icon class="el-icon--left"><Refresh /></el-icon>
          {{ t('errorBoundary.retry') }}
        </el-button>
        <el-button @click="handleGoHome">
          {{ t('errorBoundary.goHome') }}
        </el-button>
      </div>
      <details
        class="error-boundary__details max-w-[800px] w-full mt-3 text-left bg-fill-light rounded py-2 px-3 text-xs"
        v-if="errorMessage"
      >
        <summary>{{ t('errorBoundary.details') }}</summary>
        <pre>{{ errorMessage }}</pre>
      </details>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * TierB-1: ErrorBoundary 错误边界组件
 *
 * 使用方式：
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 * 工作原理：
 * - Vue 3 的 onErrorCaptured 钩子捕获后代组件抛出的错误
 * - 设置 hasError = true，渲染错误占位 UI
 * - 通过 retry 重置 hasError，重新渲染子组件树
 * - 错误信息会上报到 errorReporter（与全局 errorHandler 联动）
 */
import { ref, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { WarningFilled, Refresh } from '@element-plus/icons-vue'
import { errorReporter } from '@/utils/errorReporter'

const { t } = useI18n()
const router = useRouter()

const hasError = ref(false)
const errorMessage = ref('')

onErrorCaptured((err: unknown, _instance: unknown, info: string) => {
  hasError.value = true
  const errMsg = err instanceof Error ? err.message : String(err)
  errorMessage.value = `${errMsg}\nInfo: ${info}`

  // 上报错误（与全局 errorHandler 联动）
  errorReporter.report(err, {
    type: 'ErrorBoundary',
    info
  })

  // 阻止错误继续向上传播
  return false
})

function handleRetry(): void {
  hasError.value = false
  errorMessage.value = ''
}

function handleGoHome(): void {
  hasError.value = false
  errorMessage.value = ''
  router.push('/')
}
</script>

<style lang="scss" scoped>
.error-boundary {
  &__details {
    summary {
      cursor: pointer;
      color: var(--el-text-color-secondary, #909399);
      user-select: none;
    }

    pre {
      margin: 8px 0 0 0;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--el-color-danger, #f56c6c);
      font-family: 'Consolas', 'Monaco', monospace;
    }
  }
}
</style>
