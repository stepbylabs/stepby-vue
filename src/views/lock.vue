<template>
  <div class="lock-container fixed inset-0 flex flex-col items-center justify-center z-[9999] overflow-hidden">
    <!-- 动态粒子背景 -->
    <canvas ref="particleCanvas" class="absolute inset-0 z-0"></canvas>

    <!-- 时钟 -->
    <div class="lock-time relative z-[1] text-[72px] font-extralight text-white tracking-[4px] mb-2 tabular-nums">
      {{ currentTime }}
    </div>
    <div class="lock-date relative z-[1] text-[15px] mb-12 tracking-[2px]">{{ currentDate }}</div>

    <!-- 锁屏卡片 -->
    <div
      class="lock-card relative z-[1] rounded-3xl py-10 px-12 w-[360px] max-w-[calc(100vw-32px)] flex flex-col items-center"
    >
      <div class="relative mb-4">
        <img
          :src="userStore.avatar"
          class="lock-avatar w-20 h-20 rounded-full object-cover block"
          :alt="t('layout.navbar.avatarAlt', { name: userStore.nickName })"
          @error="onAvatarError"
          loading="lazy"
        />
        <div
          class="lock-icon absolute -bottom-1 -right-1 rounded-full w-[26px] h-[26px] flex items-center justify-center text-[13px]"
          aria-hidden="true"
        >
          <el-icon :size="13"><Lock /></el-icon>
        </div>
      </div>
      <div class="text-white text-lg font-semibold mb-1.5 tracking-[1px]">{{ userStore.nickName }}</div>
      <div class="lock-hint text-[13px] mb-7">{{ t('lock.tip') }}</div>

      <div class="input-wrap w-full flex items-center rounded-full pt-1 pb-1 pr-1 pl-5" :class="{ shake: isShaking }">
        <input
          ref="passwordInput"
          v-model.trim="password"
          type="password"
          :placeholder="t('lock.passwordPlaceholder')"
          class="flex-1 bg-transparent border-none outline-none text-white text-[15px] py-2.5"
          :aria-label="t('lock.passwordPlaceholder')"
          @keydown.enter="handleUnlock"
          autocomplete="current-password"
        />
        <button
          class="unlock-btn w-[42px] h-[42px] rounded-full border-none text-white text-lg cursor-pointer flex items-center justify-center shrink-0"
          @click="handleUnlock"
          :disabled="loading"
          :aria-label="loading ? t('lock.unlocking') : t('lock.unlock')"
        >
          <Transition mode="out-in" name="fade">
            <span v-if="!loading" key="arrow">→</span>
            <span v-else key="dots" class="text-[13px] tracking-[1px]">···</span>
          </Transition>
        </button>
      </div>

      <Transition name="fade">
        <div v-if="errorMsg" class="error-msg mt-[14px] text-danger text-[13px] text-center">{{ errorMsg }}</div>
      </Transition>

      <div class="mt-6 lock-footer">
        <el-button text type="primary" @click="goLogin">{{ t('lock.logout') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
import { useRouter } from 'vue-router'
import useUserStore from '@/store/modules/user'
import useLockStore from '@/store/modules/lock'
import { unlockScreen } from '@/api/login'
import defAva from '@/assets/images/profile.webp'

const router = useRouter()
const userStore = useUserStore()
const lockStore = useLockStore()

const password = ref<string>('')
const loading = ref<boolean>(false)
const errorMsg = ref<string>('')
const isShaking = ref<boolean>(false)
const currentTime = ref<string>('')
const currentDate = ref<string>('')
const passwordInput = useTemplateRef<HTMLInputElement>('passwordInput')
const particleCanvas = useTemplateRef<HTMLCanvasElement>('particleCanvas')

interface Particle {
  x: number
  y: number
  r: number
  dx: number
  dy: number
  alpha: number
}

let timer: ReturnType<typeof setInterval> | null = null
let animationId: number | null = null
let particles: Particle[] = []
let resizeHandler: (() => void) | null = null
// P1 修复: 标签页后台时暂停 setInterval/requestAnimationFrame，节省 CPU
let visibilityHandler: (() => void) | null = null

const onAvatarError = (e: Event) => {
  ;(e.target as HTMLImageElement).src = defAva
}

const startClock = () => {
  const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
  const update = () => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    currentTime.value = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    const weekdayKey = 'lock.weekdays.' + weekdayKeys[now.getDay()]
    currentDate.value =
      now.getFullYear() +
      t('lock.year') +
      ' ' +
      (now.getMonth() + 1) +
      t('lock.month') +
      ' ' +
      now.getDate() +
      t('lock.day') +
      ' ' +
      t(weekdayKey)
  }
  update()
  timer = setInterval(update, 1000)
  // P1 修复: 标签页后台时暂停时钟和粒子动画，节省 CPU
  visibilityHandler = () => {
    if (document.hidden) {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (animationId) {
        cancelAnimationFrame(animationId)
        animationId = null
      }
    } else {
      if (!timer) {
        update()
        timer = setInterval(update, 1000)
      }
      if (!animationId && particleCanvas.value) {
        initParticles()
      }
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)
}

const handleUnlock = async () => {
  if (!password.value) {
    showError(t('lock.passwordRequired'))
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await unlockScreen(password.value)
    const lockPath = lockStore.lockPath
    lockStore.unlockScreen()
    router.replace(lockPath)
  } catch {
    // P0 修复：拦截器已通过 ElMessage 显示后端错误信息，这里不再重复 showError
    // 仅做交互反馈：抖动动画 + 清空密码 + 重新聚焦
    isShaking.value = true
    if (shakeTimer) clearTimeout(shakeTimer)
    shakeTimer = setTimeout(() => {
      isShaking.value = false
    }, 600)
    password.value = ''
    nextTick(() => passwordInput.value?.focus())
  } finally {
    loading.value = false
  }
}

// P2 修复: shake 动画 setTimeout 句柄，组件卸载时清理避免内存泄漏
let shakeTimer: ReturnType<typeof setTimeout> | null = null

const showError = (msg: string) => {
  errorMsg.value = msg
  isShaking.value = true
  if (shakeTimer) clearTimeout(shakeTimer)
  shakeTimer = setTimeout(() => {
    isShaking.value = false
  }, 600)
}

const goLogin = () => {
  lockStore.unlockScreen()
  userStore
    .logOut()
    .then(() => {
      router.push('/login')
    })
    .catch(() => {
      router.push('/login')
    })
}

const initParticles = () => {
  const canvas = particleCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  // P1 修复: 移除旧的 resize 监听器，避免累积泄漏
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  // P1 修复: 取消旧的动画循环，避免多个 draw 并行
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  resizeHandler = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resizeHandler()
  window.addEventListener('resize', resizeHandler)

  particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2 + 1,
    dx: (Math.random() - 0.5) * 0.6,
    dy: (Math.random() - 0.5) * 0.6,
    alpha: Math.random() * 0.5 + 0.2
  }))

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    particles.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${p.alpha})`
      ctx.fill()
      p.x += p.dx
      p.y += p.dy
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1
    })
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i],
          b = particles[j]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (dist < 120) {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(255,255,255,${0.15 * (1 - dist / 120)})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }
    animationId = requestAnimationFrame(draw)
  }
  draw()
}

onMounted(() => {
  startClock()
  initParticles()
  nextTick(() => passwordInput.value?.focus())
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (animationId) cancelAnimationFrame(animationId)
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  // P1 修复: 移除 visibilitychange 监听，避免内存泄漏
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  // P2 修复: 清理 shake 动画 setTimeout
  if (shakeTimer) {
    clearTimeout(shakeTimer)
    shakeTimer = null
  }
})
</script>

<style scoped>
.lock-container {
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.lock-time {
  text-shadow: 0 0 40px rgba(255, 255, 255, 0.3);
}

.lock-date {
  color: rgba(255, 255, 255, 0.6);
}

.lock-card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4);
}

.lock-avatar {
  border: 3px solid rgba(255, 255, 255, 0.3);
}

.lock-icon {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
}

.lock-hint {
  color: rgba(255, 255, 255, 0.5);
}

.input-wrap {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: border-color 0.3s;
}

.input-wrap:focus-within {
  border-color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.13);
}

.input-wrap.shake {
  animation: shake 0.5s ease;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-8px);
  }
  40% {
    transform: translateX(8px);
  }
  60% {
    transform: translateX(-6px);
  }
  80% {
    transform: translateX(6px);
  }
}

.lock-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.unlock-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  transition:
    transform 0.2s,
    opacity 0.2s;
}

.unlock-btn:hover:not(:disabled) {
  transform: scale(1.08);
}

.unlock-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.lock-footer :deep(.el-button) {
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  transition: color 0.2s;
}

.lock-footer :deep(.el-button:hover) {
  color: rgba(255, 255, 255, 0.8);
}
</style>
