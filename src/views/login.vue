<template>
  <div class="login flex justify-center items-center h-full bg-cover">
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
          auto-complete="off"
          :placeholder="t('login.username')"
          :maxlength="30"
        >
          <template #prefix><svg-icon icon-class="user" class="el-input__icon input-icon" /></template>
        </el-input>
      </el-form-item>
      <el-form-item prop="password">
        <el-input
          v-model.trim="loginForm.password"
          :type="passwordVisible ? 'text' : 'password'"
          size="large"
          auto-complete="off"
          :placeholder="t('login.password')"
          :aria-label="t('login.password')"
          :maxlength="20"
          @keyup.enter="handleLogin"
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
      <Transition name="expand-fade">
        <el-form-item prop="code" v-if="captchaEnabled">
          <el-input
            v-model="loginForm.code"
            size="large"
            auto-complete="off"
            :placeholder="t('login.code')"
            :aria-label="t('login.code')"
            :maxlength="10"
            class="w-[63%]"
            @keyup.enter="handleLogin"
          >
            <template #prefix><svg-icon icon-class="validCode" class="el-input__icon input-icon" /></template>
          </el-input>
          <div
            class="w-[33%] h-10 float-right flex items-center justify-center"
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
                class="h-10 pl-3 cursor-pointer align-middle transition-opacity duration-300"
                :alt="t('login.clickRefreshCaptcha')"
              />
            </Transition>
          </div>
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
          <div class="float-right" v-if="register">
            <router-link class="link-type" :to="'/register'">{{ t('login.registerNow') }}</router-link>
          </div>
        </Transition>
      </el-form-item>
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
import { getCodeImg } from '@/api/login'
import { isSafeRedirect } from '@/utils/redirect'
import Cookies from 'js-cookie'
import useUserStore from '@/store/modules/user'
import defaultSettings from '@/settings'
import type { LoginForm } from '@/types/api/login'
import type { RouteLocationNormalized, LocationQueryRaw } from 'vue-router'

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
  uuid: ''
})

const loginRules = computed(() => ({
  username: [{ required: true, trigger: 'blur', message: t('common.form.inputPlaceholder') + t('login.username') }],
  password: [{ required: true, trigger: 'blur', message: t('common.form.inputPlaceholder') + t('login.password') }],
  code: captchaEnabled.value
    ? [{ required: true, trigger: 'change', message: t('common.form.inputPlaceholder') + t('login.code') }]
    : []
}))

const codeUrl = ref('')
const loading = ref(false)
// 密码显示/隐藏切换
const passwordVisible = ref(false)
// 验证码刷新 loading
const codeLoading = ref(false)
// 验证码开关
const captchaEnabled = ref(true)
// 注册开关
const register = ref(false)
const redirect = ref<string | undefined>(undefined)

watch(
  route,
  (newRoute: RouteLocationNormalized) => {
    redirect.value = (newRoute.query && newRoute.query.redirect) as string | undefined
  },
  { immediate: true }
)

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
        .then(() => {
          const query = route.query
          const otherQueryParams = Object.keys(query).reduce((acc: LocationQueryRaw, cur) => {
            if (cur !== 'redirect') {
              acc[cur] = query[cur]
            }
            return acc
          }, {} as LocationQueryRaw)
          // F1 审计加固：校验用户可控的 redirect，防止开放重定向 / 协议相对路径
          const target = isSafeRedirect(redirect.value) ? (redirect.value as string) : '/'
          router.push({ path: target, query: otherQueryParams }).catch(() => {})
        })
        .catch(() => {
          loading.value = false
          // 重新获取验证码
          if (captchaEnabled.value) {
            getCode()
          }
        })
    }
  })
}

function getCode(): void {
  // P2 修复: 添加 .catch 处理验证码接口故障，避免未处理的 Promise rejection
  codeLoading.value = true
  getCodeImg()
    .then((res) => {
      captchaEnabled.value = res.captchaEnabled === undefined ? true : res.captchaEnabled
      // 同时读取注册开关（后端 /captchaImage 已返回 registerEnabled 字段，避免探测 /register 触发 403）
      register.value = res.registerEnabled === true
      // 仅在 captchaEnabled 且 res.img 非空时设置验证码图片
      // 防止 res.img 为 undefined/空字符串时生成 data:image/gif;base64,undefined 的无效 URL
      if (captchaEnabled.value && res.img) {
        codeUrl.value = 'data:image/gif;base64,' + res.img
        loginForm.value.uuid = res.uuid
      } else {
        // 后端返回 captchaEnabled=true 但 img 为空，或 captchaEnabled=false 时
        // 关闭验证码显示，避免渲染破损图片
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
</script>

<style lang="scss" scoped>
.login {
  background-image: url('../assets/images/login-background.jpg');
}

.login-form {
  background: var(--el-bg-color-overlay);
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
.el-login-footer {
  font-family: Arial;
}

html.dark .login {
  background-image:
    linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url('../assets/images/login-background.jpg');
  .login-form {
    background: var(--el-bg-color-overlay) !important;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
}
</style>
