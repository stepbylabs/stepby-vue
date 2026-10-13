<template>
  <div class="login auth-aurora relative flex justify-center items-center h-full overflow-hidden">
    <!-- Aurora 科技背景：光斑 + 网格（纯 CSS，reduced-motion 由全局规则接管） -->
    <div class="aurora-blob aurora-1" aria-hidden="true"></div>
    <div class="aurora-blob aurora-2" aria-hidden="true"></div>
    <div class="aurora-grid" aria-hidden="true"></div>
    <el-form
      ref="loginRef"
      :model="loginForm"
      :rules="loginRules"
      class="login-form rounded-md w-[400px] max-w-[calc(100vw-20px)] pt-[25px] px-[25px] pb-[5px] z-[1]"
    >
      <h3 class="title text-center text-text-regular mx-auto mb-[30px]">{{ title }}</h3>
      <el-form-item prop="username">
        <el-input
          v-model.trim="loginForm.username"
          type="text"
          size="large"
          name="username"
          autocomplete="username"
          :aria-label="t('login.username')"
          :placeholder="t('login.username')"
          :maxlength="30"
        >
          <template #prefix><svg-icon icon-class="user" class="el-input__icon input-icon" /></template>
        </el-input>
      </el-form-item>
      <el-form-item prop="password">
        <el-input
          v-model="loginForm.password"
          :type="passwordVisible ? 'text' : 'password'"
          size="large"
          name="password"
          autocomplete="current-password"
          :placeholder="t('login.password')"
          :aria-label="t('login.password')"
          :maxlength="20"
          @keyup.enter="handleLogin"
          @keyup="capsLockOn = $event.getModifierState?.('CapsLock') ?? capsLockOn"
          @blur="capsLockOn = false"
        >
          <template #prefix><svg-icon icon-class="password" class="el-input__icon input-icon" /></template>
          <template #suffix>
            <el-icon
              class="cursor-pointer text-base text-text-secondary hover:text-primary transition-colors"
              @click="passwordVisible = !passwordVisible"
            >
              <View v-if="passwordVisible" />
              <Hide v-else />
            </el-icon>
          </template>
        </el-input>
      </el-form-item>
      <!-- Caps Lock 检测提示（UX-4）：大小写敏感是登录失败常见原因 -->
      <Transition name="expand-fade">
        <el-alert
          v-if="capsLockOn"
          :title="t('login.capsLockOn')"
          type="warning"
          :closable="false"
          class="mb-1 -mt-1"
        />
      </Transition>
      <Transition name="expand-fade">
        <el-form-item prop="code" v-if="captchaEnabled">
          <!-- 成熟后台标准布局：验证码输入框与图片同行 flex，图片等高输入框贴右侧（点击刷新） -->
          <div class="flex w-full items-center gap-2.5">
            <el-input
              v-model="loginForm.code"
              size="large"
              name="captcha"
              autocomplete="one-time-code"
              :placeholder="t('login.code')"
              :aria-label="t('login.code')"
              :maxlength="10"
              class="flex-1 min-w-0"
              @keyup.enter="handleLogin"
            >
              <template #prefix><svg-icon icon-class="validCode" class="el-input__icon input-icon" /></template>
            </el-input>
            <div
              class="h-10 w-[110px] shrink-0 flex items-center justify-center overflow-hidden rounded border border-[var(--el-border-color-lighter)] bg-[var(--el-fill-color-light)]"
              role="button"
              tabindex="0"
              :aria-label="t('login.clickRefreshCaptcha')"
              @click="getCode"
              @keydown.enter.prevent="getCode"
            >
              <Transition mode="out-in" name="fade">
                <el-icon v-if="codeLoading" key="loading" class="is-loading text-2xl text-primary"><Loading /></el-icon>
                <img
                  v-else-if="codeUrl"
                  key="img"
                  :src="codeUrl"
                  class="h-10 w-full cursor-pointer object-cover align-middle transition-opacity duration-300"
                  :alt="t('login.clickRefreshCaptcha')"
                />
              </Transition>
            </div>
          </div>
        </el-form-item>
      </Transition>
      <Transition name="expand-fade">
        <el-form-item prop="totpCode" v-if="totpRequired">
          <el-input
            v-model="loginForm.totpCode"
            size="large"
            auto-complete="off"
            :placeholder="t('login.totpCode')"
            :aria-label="t('login.totpCode')"
            :maxlength="6"
            @keyup.enter="handleLogin"
          >
            <template #prefix><svg-icon icon-class="validCode" class="el-input__icon input-icon" /></template>
          </el-input>
        </el-form-item>
      </Transition>
      <el-checkbox v-model="loginForm.rememberMe" class="mb-[25px]">{{ t('login.remember') }}</el-checkbox>
      <el-form-item class="w-full">
        <el-button :loading="loading" size="large" type="primary" class="w-full" @click.prevent="handleLogin">
          <Transition mode="out-in" name="fade">
            <span v-if="!loading" key="text">{{ t('common.login') }}</span>
            <span v-else key="loading">{{ t('common.logging') }}</span>
          </Transition>
        </el-button>
        <Transition name="fade">
          <div class="ml-auto" v-if="register">
            <router-link class="link-type" :to="'/register'">{{ t('login.registerNow') }}</router-link>
          </div>
        </Transition>
      </el-form-item>
      <!-- WebAuthn / Passkey：通行密钥登录入口（**浏览器支持 且 服务端能力位 auth.webauthn 开启**时渲染；
           能力位关闭态后端端点为 404，若仍渲染即"入口可见但请求 404"的假入口） -->
      <!-- 注意：分隔线必须用**独立类名** `passkey-divider`，不得复用 `.oauth-divider`
           —— 后者是「OAuth 第三方登录」区块的语义锚点（e2e 功能 55 以 `.oauth-divider`
           计数断言"分隔线出现与否与 /oauth2/providers 启用数一致"）；复用会让
           "无 OAuth 供应商时计数应为 0" 的断言被 passkey 分隔线污染。视觉样式两处共用。 -->
      <template v-if="webauthnSupported && webauthnEnabled">
        <el-divider class="passkey-divider">
          <span class="passkey-divider-text">{{ t('login.passkeyDivider') }}</span>
        </el-divider>
        <el-form-item class="w-full">
          <el-button size="large" class="w-full" :loading="webauthnLoading" @click.prevent="handlePasskeyLogin">
            <svg-icon icon-class="lock" class="passkey-icon" />
            {{ t('login.passkeyLogin') }}
          </el-button>
        </el-form-item>
      </template>
      <!-- P0 OAuth：第三方登录入口 -->
      <template v-if="oauthProviders.length > 0">
        <el-divider class="oauth-divider">
          <span class="oauth-divider-text">{{ t('login.oauthDivider') }}</span>
        </el-divider>
        <div class="oauth-buttons flex justify-center gap-[16px] pb-[10px]">
          <el-tooltip v-for="p in oauthProviders" :key="p.providerCode" :content="p.providerName" placement="top">
            <el-button
              circle
              size="large"
              :aria-label="t('login.oauthTitle') + '-' + p.providerName"
              :loading="oauthLoading === p.providerCode"
              @click="handleOauthLogin(p.providerCode)"
            >
              <svg-icon :icon-class="oauthIcon(p.providerType)" class="oauth-icon" />
            </el-button>
          </el-tooltip>
        </div>
      </template>
    </el-form>
    <!--  底部  -->
    <div
      class="el-login-footer absolute bottom-0 w-full h-10 leading-10 text-center text-white text-xs tracking-[1px] z-[1]"
    >
      <span>{{ footerContent }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
import { ElMessage } from 'element-plus'
import { errorHub } from '@/utils/errorHub'
import { getCodeImg } from '@/api/login'
import { listEnabledProviders, getAuthorizeUrl, bindOauth } from '@/api/oauth'
import { webauthnLoginStart, webauthnLoginFinish } from '@/api/webauthn'
import { isWebauthnSupported, isUserCancelled, toRequestOptions, assertionToDto } from '@/utils/webauthn'
import { takePendingHandoff } from '@/utils/oauth'
import { resolveLoginTarget } from '@/utils/redirect'
import Cookies from 'js-cookie'
import useUserStore from '@/store/modules/user'
import defaultSettings from '@/settings'
import type { LoginForm } from '@/types/api/login'
import type { RouteLocationNormalized } from 'vue-router'
import type { EnabledOauthProvider } from '@/types/api/oauth'

const title = import.meta.env.VITE_APP_TITLE
const footerContent = defaultSettings.footerContent
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const loginRefRef = useTemplateRef('loginRef')

const loginForm = ref<LoginForm>({
  username: import.meta.env.DEV ? import.meta.env.VITE_DEV_USER || '' : '',
  password: import.meta.env.DEV ? import.meta.env.VITE_DEV_PWD || '' : '',
  rememberMe: false,
  code: '',
  uuid: '',
  totpCode: ''
})

const loginRules = computed(() => ({
  username: [{ required: true, trigger: 'blur', message: t('common.form.inputPlaceholder') + t('login.username') }],
  password: [{ required: true, trigger: 'blur', message: t('common.form.inputPlaceholder') + t('login.password') }],
  code: captchaEnabled.value
    ? [{ required: true, trigger: 'change', message: t('common.form.inputPlaceholder') + t('login.code') }]
    : [],
  // P0-4：TOTP 输入步骤中必填 6 位动态码
  totpCode: totpRequired.value
    ? [{ required: true, trigger: 'change', message: t('common.form.inputPlaceholder') + t('login.totpCode') }]
    : []
}))

const codeUrl = ref('')
const loading = ref(false)
// 密码显示/隐藏切换
const passwordVisible = ref(false)
/** Caps Lock 开启检测（UX-4）：密码框 keyup 时刷新，失焦即隐藏 */
const capsLockOn = ref(false)
// 验证码刷新 loading
const codeLoading = ref(false)
// 验证码开关
const captchaEnabled = ref(true)
// 注册开关
const register = ref(false)
// P0-4：是否进入 TOTP 多因子验证步骤（后端返回业务码 1003 时置为 true）
const totpRequired = ref(false)
const redirect = ref<string | undefined>(undefined)

// P0 OAuth：登录页第三方登录提供商列表 + 跳转 loading
const oauthProviders = ref<EnabledOauthProvider[]>([])
const oauthLoading = ref('')

// WebAuthn / Passkey：浏览器是否支持 + 通行密钥登录 loading
const webauthnSupported = isWebauthnSupported()
// 服务端能力位 `auth.webauthn` 开关（由 /captchaImage 下发，与 WebAuthn 端点守卫同一判据）。
// 默认 false（fail-safe）：未取到时宁可不显示入口，避免"入口可见但请求 404"的假入口。
const webauthnEnabled = ref(false)
const webauthnLoading = ref(false)

// 第三方类型 → 图标名（svg 位于 src/assets/icons/svg）
function oauthIcon(providerType: string): string {
  switch (providerType) {
    case 'github':
      return 'github'
    case 'gitee':
      return 'gitee'
    case 'wecom':
      return 'wecom'
    default:
      return 'user'
  }
}

// 加载登录页启用的第三方提供商（静默失败：无第三方登录也不影响常规登录）
function loadOauthProviders(): void {
  listEnabledProviders()
    .then((res) => {
      if (res.data && Array.isArray(res.data)) {
        oauthProviders.value = res.data
      }
    })
    .catch(() => {
      oauthProviders.value = []
    })
}

// 点击第三方图标：生成授权 URL 后跳转第三方
function handleOauthLogin(providerCode: string): void {
  if (oauthLoading.value) return
  oauthLoading.value = providerCode
  getAuthorizeUrl(providerCode)
    .then((res) => {
      if (res.authorizeUrl) {
        window.location.href = res.authorizeUrl
      } else {
        errorHub.report('error', 'other', t('oauth.error.authorizeFailed'))
      }
    })
    .catch(() => {
      errorHub.report('error', 'other', t('oauth.error.authorizeFailed'))
    })
    .finally(() => {
      oauthLoading.value = ''
    })
}

watch(
  route,
  (newRoute: RouteLocationNormalized) => {
    redirect.value = (newRoute.query && newRoute.query.redirect) as string | undefined
  },
  { immediate: true }
)

// 登录成功后的统一处理（密码登录与通行密钥登录共用同一套，避免两套链路漂移）：
// 重置 loading、处理待绑定第三方身份、解析并跳转目标（拉取用户信息由路由守卫完成）。
function afterLoginSuccess(): void {
  // P1 修复：成功路径也重置 loading，避免 router.push 被守卫拒绝/重复导航失败时按钮永久 loading
  loading.value = false
  // P0 OAuth：登录成功后，若存在待绑定的第三方身份（授权回调归档的 handoff），自动完成绑定
  const pendingHandoff = takePendingHandoff()
  if (pendingHandoff) {
    bindOauth(pendingHandoff)
      .then(() => {
        ElMessage.success(t('oauth.tip.pendingHandoff'))
      })
      .catch(() => {
        // 绑定失败不阻塞登录，稍后可到个人中心「OAuth 绑定」页手动处理
      })
  }
  // F1 审计加固：校验用户可控的 redirect，防止开放重定向 / 协议相对路径；
  // 后端协议路由（SSO authorize/logout）非 SPA 路由，必须整页跳转交给后端
  // （判定逻辑与原因见 utils/redirect.ts resolveLoginTarget，已有单测钉死）。
  const { kind, target } = resolveLoginTarget(redirect.value)
  if (kind === 'backend') {
    window.location.href = target
    return
  }
  // SPA 路由：以字符串形式导航，保留 target 内嵌的 query/hash（对象 path 形式会丢查询）。
  router.push(target).catch(() => {})
}

function handleLogin(): void {
  loginRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      loading.value = true
      // 勾选了"记住用户名"则在 cookie 中保存用户名（不再保存密码）
      if (loginForm.value.rememberMe) {
        Cookies.set('username', loginForm.value.username, { expires: 30 })
        Cookies.set('rememberMe', loginForm.value.rememberMe, { expires: 30 })
      } else {
        // 否则移除
        Cookies.remove('username')
        Cookies.remove('rememberMe')
      }
      // 调用action的登录方法
      userStore
        .login(loginForm.value)
        .then(() => afterLoginSuccess())
        .catch((err: Error & { code?: number }) => {
          loading.value = false
          // P0-4：TOTP 多因子登录——进入/停留在 TOTP 输入步骤（密码已通过，仅缺动态码）
          if (err?.code === 1003) {
            totpRequired.value = true
            return
          }
          // 重新获取验证码
          if (captchaEnabled.value) {
            getCode()
          }
        })
    }
  })
}

// WebAuthn / Passkey：使用通行密钥登录。
// 取用户名 → login/start → navigator.credentials.get → login/finish →
// 复用密码登录同一套成功链路（写 token + 成功处理，用户信息由路由守卫拉取、跳转）。
async function handlePasskeyLogin(): Promise<void> {
  if (webauthnLoading.value) return
  const username = loginForm.value.username.trim()
  if (!username) {
    ElMessage.warning(t('login.passkeyUsernameRequired'))
    return
  }
  webauthnLoading.value = true
  try {
    const startRes = await webauthnLoginStart({ username })
    const options = startRes.data
    if (!options) return
    const credential = await navigator.credentials.get({ publicKey: toRequestOptions(options) })
    if (!credential) return
    const finishRes = await webauthnLoginFinish(assertionToDto(credential as PublicKeyCredential, username))
    userStore.applyLoginToken(finishRes.token)
    afterLoginSuccess()
  } catch (err) {
    // 用户取消认证器交互（NotAllowedError）：安静返回，不报错刷红
    if (isUserCancelled(err)) return
    // 其余错误（含能力位关闭的 404、登录失败反枚举统一的 401）已由 request 拦截器展示后端 msg
  } finally {
    webauthnLoading.value = false
  }
}

function getCode(): void {
  // P1 修复：防重复点击（快速点击验证码会并发请求，导致 uuid 与图片错配）
  if (codeLoading.value) return
  // P2 修复: 添加 .catch 处理验证码接口故障，避免未处理的 Promise rejection
  codeLoading.value = true
  getCodeImg()
    .then((res) => {
      captchaEnabled.value = res.captchaEnabled === undefined ? true : res.captchaEnabled
      // 同时读取注册开关（后端 /captchaImage 已返回 registerEnabled 字段，避免探测 /register 触发 403）
      register.value = res.registerEnabled === true
      // 通行密钥登录开关：同样由后端算好下发（能力位 auth.webauthn 关闭 ⇒ 端点为 404，
      // 故入口必须同步隐藏，避免控制台 404 与"假入口"）
      webauthnEnabled.value = res.webauthnEnabled === true
      // 仅在 captchaEnabled 且 res.img 非空时设置验证码图片
      // 防止 res.img 为 undefined/空字符串时生成 data:image/gif;base64,undefined 的无效 URL
      if (captchaEnabled.value && res.img) {
        codeUrl.value = 'data:image/gif;base64,' + res.img
        loginForm.value.uuid = res.uuid
      } else if (captchaEnabled.value) {
        // P1 修复：后端声明启用验证码但图片为空时，不再静默关闭验证码（会绕过防爆破），
        // 而是保留开启状态并提示用户重试刷新。
        captchaEnabled.value = true
        codeUrl.value = ''
        loginForm.value.uuid = ''
        errorHub.report('warning', 'other', t('login.captchaLoadFailed'))
      } else {
        // 后端明确关闭验证码
        captchaEnabled.value = false
        codeUrl.value = ''
        loginForm.value.uuid = ''
      }
    })
    .catch((err) => {
      if (import.meta.env.DEV) console.error('[login] Captcha fetch failed:', err)
      captchaEnabled.value = false
    })
    .finally(() => {
      codeLoading.value = false
    })
}

function getCookie(): void {
  const username = Cookies.get('username')
  const rememberMe = Cookies.get('rememberMe')
  loginForm.value = {
    ...loginForm.value,
    username: username === undefined ? loginForm.value.username : username,
    password: loginForm.value.password,
    rememberMe: rememberMe === undefined ? false : Boolean(rememberMe)
  }
}

getCookie()
getCode()
// P0 OAuth：加载登录页第三方登录提供商
loadOauthProviders()
</script>

<style lang="scss" scoped>
.login-form {
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 24px 64px rgba(2, 6, 23, 0.35);
  transition:
    box-shadow 0.3s ease,
    transform 0.3s ease;
  &:hover {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  }
  .el-input {
    height: 40px;
    transition: border-color 0.3s ease;
    input {
      height: 40px;
    }
  }
  .input-icon {
    height: 39px;
    width: 14px;
    margin-left: 0px;
  }
}
.login-tip {
  font-size: 13px;
  text-align: center;
  color: var(--el-text-color-placeholder);
}
.oauth-icon {
  font-size: 20px;
  color: var(--el-text-color-regular);
}
.passkey-icon {
  font-size: 18px;
  margin-right: 6px;
  color: var(--el-text-color-regular);
}
.oauth-divider,
.passkey-divider {
  margin: 8px 0 6px;
}
.oauth-divider-text,
.passkey-divider-text {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  white-space: nowrap;
}
.el-login-footer {
  font-family: Arial;
}

html.dark .login {
  .login-form {
    background: rgba(15, 23, 42, 0.72);
    border-color: rgba(148, 163, 184, 0.18);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
}
</style>
