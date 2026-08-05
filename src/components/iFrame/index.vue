<template>
  <div v-loading="loading" :element-loading-text="t('layout.innerLink.loading')" :style="'height:' + height">
    <!--
      P0-8 修复说明：iFrame 用于加载同源内部工具（如 Swagger），内容由后端提供可信；
      点击劫持防护通过后端 X-Frame-Options/CSP frame-ancestors 实现，不依赖 iframe sandbox。
      同时避免 sandbox 同时带 allow-scripts + allow-same-origin 触发浏览器安全警告，
      以及单独 allow-scripts 导致 Swagger fetch OpenAPI spec 被阻止。
    -->
    <iframe ref="iframeRef" :src="url" frameborder="no" class="w-full h-full" scrolling="auto" loading="lazy" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const props = defineProps({
  src: {
    type: String,
    required: true
  }
})

const height = ref<string>(document.documentElement.clientHeight - 94.5 + 'px;')
const loading = ref<boolean>(true)
const url = computed(() => props.src)
const iframeRef = ref<HTMLIFrameElement>()

const handleResize = (): void => {
  height.value = document.documentElement.clientHeight - 94.5 + 'px;'
}

let loadingTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  // 用 onload 事件替代固定 300ms 定时器，让 loading 动画持续到 iframe 真正加载完成
  if (iframeRef.value) {
    iframeRef.value.onload = () => {
      loading.value = false
    }
  }
  // 兜底：超时 15s 仍未加载完，隐藏 loading 避免一直转圈
  loadingTimer = setTimeout(() => {
    loading.value = false
  }, 15000)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (loadingTimer) {
    clearTimeout(loadingTimer)
    loadingTimer = null
  }
})
</script>
