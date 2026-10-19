<template>
  <div :style="'height:' + height" v-loading="loading" :element-loading-text="t('layout.innerLink.loading')">
    <!--
      P0-8 修复说明：InnerLink 加载的是同源内链页面，已受 SameSite cookie + 后端 CSRF 保护，
      不需要 sandbox 隔离；同时避免 sandbox 同时带 allow-scripts + allow-same-origin 触发浏览器安全警告
    -->
    <!-- 收尾十一：iframe 加载完成淡入（loading 遮罩消失瞬间无跳变） -->
    <iframe
      :id="iframeId"
      class="inner-link-iframe w-full h-full"
      :class="{ 'inner-link-iframe--loaded': loaded }"
      :src="src"
      ref="iframeRef"
      frameborder="no"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()

defineProps({
  src: {
    type: String,
    default: '/'
  },
  iframeId: {
    type: String
  }
})

const loading = ref<boolean>(true)
const loaded = ref<boolean>(false)
const height = ref<string>(document.documentElement.clientHeight - 94.5 + 'px')
const iframeRef = useTemplateRef<HTMLIFrameElement>('iframeRef')
let loadingTimer: ReturnType<typeof setTimeout> | null = null

function handleResize(): void {
  height.value = document.documentElement.clientHeight - 94.5 + 'px'
}

onMounted(() => {
  if (iframeRef.value) {
    iframeRef.value.onload = () => {
      loaded.value = true
      loading.value = false
      // iframe 加载完成时清除超时兜底定时器，避免冗余触发
      if (loadingTimer) {
        clearTimeout(loadingTimer)
        loadingTimer = null
      }
    }
  }
  // 加载超时兜底：15s 后强制关闭 loading，避免 iframe 加载失败时永久转圈
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
  if (iframeRef.value) iframeRef.value.onload = null
})
</script>

<style scoped>
/* 收尾十一：加载完成淡入——onload 与 loading 遮罩移除同帧触发，
   300ms opacity 过渡消除内容突现 */
.inner-link-iframe {
  opacity: 0;
  transition: opacity 0.3s ease;
}

.inner-link-iframe--loaded {
  opacity: 1;
}
</style>
