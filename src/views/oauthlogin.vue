<template>
<div class="relative flex justify-center items-center h-full overflow-hidden auth-aurora">
  <!-- Aurora 科技背景（与 login.vue 共用 .auth-aurora） -->
  <div class="aurora-blob aurora-1" aria-hidden="true"></div>
  <div class="aurora-blob aurora-2" aria-hidden="true"></div>
  <div class="aurora-grid" aria-hidden="true"></div>
    <div class="panel rounded-md w-[400px] max-w-[calc(100vw-20px)] pt-[25px] px-[25px] pb-[25px] z-[1] text-center">
      <el-icon v-if="!showLoginLink" class="is-loading spin-icon"><Loading /></el-icon>
      <h3 class="title mt20 text-text-regular">{{ t('login.oauthTitle') }}</h3>
      <p class="desc mt10 text-text-secondary">{{ status }}</p>
      <el-button v-if="showLoginLink" type="primary" class="mt20" @click="toLogin">
        {{ t('login.oauthGoLogin') }}
      </el-button>
    </div>
    <div
      class="el-login-footer absolute bottom-0 w-full h-10 leading-10 text-center text-white text-xs tracking-[1px] z-[1]"
    >
      <span>{{ footerContent }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// 第三方登录回调落地页（/oauth-login）
//
// 后端 /oauth2/callback 用 302 把浏览器带到本页，通过查询参数传递结果：
//   ?token=xxx&username=xxx  → 登录成功，落地 token 后进入首页
//   ?handoff=xxx              → 第三方身份未绑定系统账号，存档后引导用户先密码登录再绑定
//   ?error=xxx                → 授权失败，展示错误并给出返回登录入口
import { setToken, getToken } from '@/utils/auth'
import { bindOauth } from '@/api/oauth'
import { ElMessage } from 'element-plus'
import useUserStore from '@/store/modules/user'
import useNotificationStore from '@/store/modules/notification'
import useLockStore from '@/store/modules/lock'
import defaultSettings from '@/settings'
import { PENDING_HANDOFF_KEY } from '@/utils/oauth'
import { isSafeRedirect } from '@/utils/redirect'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const footerContent = defaultSettings.footerContent

const status = ref('')
const showLoginLink = ref(false)

async function land() {
  const error = route.query.error as string | undefined
  const handoff = decodeURIComponent((route.query.handoff as string) || '')

  // 1. 授权失败
  if (error) {
    status.value = t('oauth.error.callbackError', { msg: error })
    showLoginLink.value = true
    return
  }

  // 2. 第三方身份需绑定系统账号
  if (handoff) {
    // 已登录用户（如从个人中心发起绑定）→ 直接用当前登录态完成绑定
    if (getToken()) {
      try {
        await bindOauth(handoff)
        ElMessage.success(t('oauth.tip.bindSuccess'))
        const redirect = isSafeRedirect(route.query.redirect as string) ? (route.query.redirect as string) : '/'
        await router.replace(redirect)
        return
      } catch {
        // 绑定失败（如 handoff 已过期/第三方身份已被他人绑定），回落到登录页重新走流程
        router.replace('/login')
        return
      }
    }
    // 未登录 → 归档 handoff，等用户密码登录成功后由 login.vue 自动完成绑定
    try {
      sessionStorage.setItem(PENDING_HANDOFF_KEY, handoff)
    } catch {
      // sessionStorage 不可用时忽略（如严格隐私模式）
    }
    status.value = t('login.oauthBindRequired')
    showLoginLink.value = true
    return
  }

  // 3. 登录成功（后端已签发 token）
  const token = route.query.token as string | undefined
  if (!token) {
    status.value = t('oauth.error.loadFailed')
    showLoginLink.value = true
    return
  }
  const username = route.query.username as string | undefined
  setToken(token)
  userStore.token = token
  useLockStore().unlockScreen()
  useNotificationStore().init()
  const redirect = isSafeRedirect(route.query.redirect as string) ? (route.query.redirect as string) : '/'
  await router.replace({ path: redirect, query: { oauthWelcome: username || undefined } })
}

function toLogin() {
  router.replace('/login')
}

onMounted(land)
</script>

<style lang="scss" scoped>
.oauth-login {
}
.panel {
  background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.5);
}
.spin-icon {
  font-size: 42px;
  color: var(--el-color-primary);
}
.desc {
  font-size: 14px;
}
.el-login-footer {
  font-family: Arial;
}
html.dark .oauth-login {
  
  .panel {
    background: rgba(15, 23, 42, 0.72);
  }
}
</style>
