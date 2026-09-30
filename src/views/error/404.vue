<template>
  <div class="wscn-http404-container absolute top-[40%] left-1/2 w-full max-w-[1200px] px-5 box-border">
    <div class="wscn-http404 relative flex w-full max-w-[1200px] items-center px-[50px] box-border overflow-hidden">
      <div class="pic-404 relative w-[600px] max-w-[60%] shrink-0 overflow-hidden">
        <img class="w-full" src="@/assets/404_images/404.webp" alt="404" loading="lazy" />
        <img class="pic-404__child left" src="@/assets/404_images/404_cloud.webp" alt="404" loading="lazy" />
        <img class="pic-404__child mid" src="@/assets/404_images/404_cloud.webp" alt="404" loading="lazy" />
        <img class="pic-404__child right" src="@/assets/404_images/404_cloud.webp" alt="404" loading="lazy" />
      </div>
      <div class="bullshit relative w-[300px] py-[30px] pl-10 overflow-hidden">
        <div class="bullshit__oops text-[32px] font-bold leading-10 text-primary opacity-0 mb-5">
          {{ t('error.e404.title') }}
        </div>
        <div class="bullshit__headline text-xl leading-6 text-text-primary font-bold opacity-0 mb-2.5">
          {{ message }}
        </div>
        <div class="bullshit__info text-[13px] leading-[21px] text-text-regular opacity-0 mb-[30px]">
          {{ t('error.e404.message') }}
        </div>
        <router-link
          to="/index"
          class="bullshit__return-home inline-block w-[110px] h-9 rounded-full text-center text-white opacity-0 text-sm leading-9 cursor-pointer"
        >
          {{ t('error.e404.backHome') }}
        </router-link>
        <div class="bullshit__countdown text-[13px] leading-[21px] text-text-secondary opacity-0 mt-3">
          {{ t('error.e404.autoBack', { seconds: countdown }) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
const { t } = useI18n()
const router = useRouter()
const message = computed(() => {
  return t('error.e404.notFound')
})

// 落到 404 后自动倒计时跳回首页，避免浏览器"卡"在错误地址上无法退出
const AUTO_BACK_SECONDS = 5
const countdown = ref(AUTO_BACK_SECONDS)
onMounted(() => {
  const timer = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      window.clearInterval(timer)
      router.replace('/index')
    }
  }, 1000)
})
</script>

<style lang="scss" scoped>
.wscn-http404-container {
  transform: translate(-50%, -50%);
}
.wscn-http404 {
  .pic-404 {
    &__child {
      position: absolute;
      &.left {
        width: 80px;
        top: 17px;
        left: 220px;
        opacity: 0;
        animation-name: cloudLeft;
        animation-duration: 2s;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        animation-delay: 1s;
      }
      &.mid {
        width: 46px;
        top: 10px;
        left: 420px;
        opacity: 0;
        animation-name: cloudMid;
        animation-duration: 2s;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        animation-delay: 1.2s;
      }
      &.right {
        width: 62px;
        top: 100px;
        left: 500px;
        opacity: 0;
        animation-name: cloudRight;
        animation-duration: 2s;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        animation-delay: 1s;
      }
      @keyframes cloudLeft {
        0% {
          top: 17px;
          left: 220px;
          opacity: 0;
        }
        20% {
          top: 33px;
          left: 188px;
          opacity: 1;
        }
        80% {
          top: 81px;
          left: 92px;
          opacity: 1;
        }
        100% {
          top: 97px;
          left: 60px;
          opacity: 0;
        }
      }
      @keyframes cloudMid {
        0% {
          top: 10px;
          left: 420px;
          opacity: 0;
        }
        20% {
          top: 40px;
          left: 360px;
          opacity: 1;
        }
        70% {
          top: 130px;
          left: 180px;
          opacity: 1;
        }
        100% {
          top: 160px;
          left: 120px;
          opacity: 0;
        }
      }
      @keyframes cloudRight {
        0% {
          top: 100px;
          left: 500px;
          opacity: 0;
        }
        20% {
          top: 120px;
          left: 460px;
          opacity: 1;
        }
        80% {
          top: 180px;
          left: 340px;
          opacity: 1;
        }
        100% {
          top: 200px;
          left: 300px;
          opacity: 0;
        }
      }
    }
  }
  .bullshit {
    &__oops {
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-fill-mode: forwards;
    }
    &__headline {
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-delay: 0.1s;
      animation-fill-mode: forwards;
    }
    &__info {
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-delay: 0.2s;
      animation-fill-mode: forwards;
    }
    &__return-home {
      background: var(--el-color-primary);
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-delay: 0.3s;
      animation-fill-mode: forwards;
    }
    &__countdown {
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-delay: 0.35s;
      animation-fill-mode: forwards;
    }
    @keyframes slideUp {
      0% {
        transform: translateY(60px);
        opacity: 0;
      }
      100% {
        transform: translateY(0);
        opacity: 1;
      }
    }
  }
  /* 兼容"减少动态效果"系统设置：动画被禁用时直接显示终态，避免元素永远 opacity:0 */
  @media (prefers-reduced-motion: reduce) {
    .wscn-http404 {
      .bullshit__oops,
      .bullshit__headline,
      .bullshit__info,
      .bullshit__return-home,
      .bullshit__countdown {
        opacity: 1 !important;
        animation: none !important;
        transform: none !important;
      }
      .pic-404__child {
        display: none;
      }
    }
  }
}
</style>
