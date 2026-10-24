<template>
  <!-- Cookie 同意机制（GDPR 风格） -->
  <!-- 业界标准：Accept All / Reject / Customize；超时仅静默关闭，不替用户默认同意 -->
  <transition name="cookie-slide">
    <div
      v-if="visible"
      class="cookie-consent"
      role="dialog"
      :aria-label="t('cookieConsent.ariaLabel')"
      aria-live="polite"
    >
      <!-- 超时进度条（b89 摘掉了这里的 `v-if="autoDismissEnabled"`：那个 ref 初始化成
           字面量 true 且全文件无人再赋值，而定时器也无条件挂——于是这个"开关"结构上
           只有"开"这一档，属于本仓 `placeholder_flag_scan.py` 在 Rust 侧锁的同一族假开关。
           要么做成真 prop（当前没有运维/用户诉求，且关掉进度条并不会取消超时静默关闭，
           只会让人以为不会超时），要么删掉——这里选删。 -->
      <div class="cookie-consent__progress" :style="{ animationDuration: autoDismissMs + 'ms' }" />
      <div class="cookie-consent__body">
        <div class="cookie-consent__content">
          <el-icon class="cookie-consent__icon"><InfoFilled /></el-icon>
          <div class="cookie-consent__text">
            <span class="cookie-consent__title">{{ t('cookieConsent.title') }}</span>
            <span class="cookie-consent__desc">
              {{ t('cookieConsent.text') }}
              <router-link class="cookie-consent__link" to="/privacy" target="_blank" rel="noopener noreferrer">
                {{ t('cookieConsent.learnMore') }}
              </router-link>
            </span>
          </div>
        </div>
        <div class="cookie-consent__actions">
          <el-button text size="small" @click="handleReject">
            {{ t('cookieConsent.reject') }}
          </el-button>
          <el-button type="primary" size="small" @click="handleAccept">
            {{ t('cookieConsent.accept') }}
          </el-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { getItem, setItem } from '@/utils/webStorage'

const { t } = useI18n()
// Cookie 同意状态存储键
const CONSENT_KEY = 'stepby_cookie_consent'
// 测试模式开关键（e2e / ?test=1 之外的第三条注入通道，见 onMounted）
const TEST_MODE_KEY = 'stepby_test_mode'
// 真机修复（UX 真机核查）：部分国产浏览器（实测 vivo）会隔离/清理 localStorage，
// 导致"同意一次"失效、每页重复弹窗——改为 localStorage + cookie 双写双读互备。
// 因此这里**允许**存储侧写不进去（setItem 返回 false 也不报错）：cookie 那一腿还在。
// 存储不可用时原先的 `try { localStorage.x } catch {}` 只是把抛吞掉；现在走统一通道，
// 两种失败模式（读属性抛 / 写入抛）都在 webStorage 里收敛成"取不到 / 没写进"。
const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 年
// 超时自动采用默认值（30 秒，业界标准 20-60 秒）
const autoDismissMs = 30000

function readConsent(): string | null {
  const ls = getItem(CONSENT_KEY)
  if (ls === 'accepted' || ls === 'rejected') return ls
  try {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + CONSENT_KEY + '=([^;]*)'))
    const v = m ? decodeURIComponent(m[1]) : null
    if (v === 'accepted' || v === 'rejected') return v
  } catch {
    /* ignore */
  }
  return null
}

function writeConsent(value: 'accepted' | 'rejected'): void {
  // 存储写不进去不阻断：cookie 是这条决策的**权威**副本（跨清理更持久），
  // 反过来只写存储会在 vivo 那一类浏览器上每页重弹。
  setItem(CONSENT_KEY, value)
  try {
    document.cookie = `${CONSENT_KEY}=${value}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

// 是否显示 Banner
const visible = ref<boolean>(false)
// 超时定时器
let dismissTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  // 测试模式：检测 Playwright 或 URL 参数 ?test=1 时自动同意，避免提示遮挡页面
  const isTestMode =
    window.navigator.webdriver ||
    new URLSearchParams(window.location.search).has('test') ||
    getItem(TEST_MODE_KEY) === '1'
  if (isTestMode) {
    autoAcceptSilently()
    return
  }

  // readConsent 已不抛（存储与 cookie 两条通道各自内部降级），因此这里不再包 try/catch：
  // 吞掉这里的异常只会把"定时器没挂上"这类真缺陷藏起来。
  const consent = readConsent()
  if (consent !== 'accepted' && consent !== 'rejected') {
    visible.value = true
    // 超时后静默关闭弹窗（不写入 accepted），等待用户主动选择
    dismissTimer = setTimeout(() => {
      handleAutoDismiss()
    }, autoDismissMs)
  }
})

onBeforeUnmount(() => {
  if (dismissTimer) clearTimeout(dismissTimer)
})

// 静默自动同意（测试模式）
function autoAcceptSilently(): void {
  writeConsent('accepted')
  visible.value = false
}

// 超时后静默关闭弹窗：不替用户做决定（保持同意状态未设置，符合 GDPR 透明度原则）
function handleAutoDismiss(): void {
  visible.value = false
}

// 用户点击"同意"
function handleAccept(): void {
  if (dismissTimer) clearTimeout(dismissTimer)
  writeConsent('accepted')
  visible.value = false
}

// 用户点击"拒绝"（仅保留必要 Cookie，关闭提示）
function handleReject(): void {
  if (dismissTimer) clearTimeout(dismissTimer)
  writeConsent('rejected')
  visible.value = false
}
</script>

<style lang="scss" scoped>
.cookie-consent {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2000;
  width: 90%;
  max-width: 640px;
  background-color: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.6;

  &__progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--el-color-primary);
    animation: cookie-progress linear forwards;
  }

  &__body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
  }

  &__content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  &__icon {
    font-size: 24px;
    color: var(--el-color-primary);
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    font-weight: 600;
    color: var(--el-text-color-primary);
    font-size: 15px;
  }

  &__desc {
    word-break: break-word;
    color: var(--el-text-color-regular);
  }

  &__link {
    color: var(--el-color-primary);
    margin-left: 4px;
    text-decoration: underline;

    &:hover {
      opacity: 0.8;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
}

// 超时进度条动画
@keyframes cookie-progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

// 移动端适配
@media (max-width: 600px) {
  .cookie-consent {
    bottom: 12px;
    width: calc(100% - 24px);
    border-radius: 10px;

    &__body {
      flex-direction: column;
      align-items: stretch;
      padding: 14px 16px;
    }

    &__actions {
      justify-content: flex-end;
    }
  }
}

// 进入/离开过渡（从底部滑入 + 淡入）
.cookie-slide-enter-active {
  transition:
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease;
}
.cookie-slide-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.25s ease;
}
.cookie-slide-enter-from {
  transform: translate(-50%, 120%);
  opacity: 0;
}
.cookie-slide-leave-to {
  transform: translate(-50%, 120%);
  opacity: 0;
}
</style>
