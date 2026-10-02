<template>
<div class="relative flex justify-center items-center h-full overflow-hidden auth-aurora">
  <!-- Aurora 科技背景（与 login.vue 共用 .auth-aurora） -->
  <div class="aurora-blob aurora-1" aria-hidden="true"></div>
  <div class="aurora-blob aurora-2" aria-hidden="true"></div>
  <div class="aurora-grid" aria-hidden="true"></div>
    <el-form
      ref="registerRef"
      :model="registerForm"
      :rules="registerRules"
      class="register-form rounded-md w-[400px] max-w-[calc(100vw-20px)] pt-[25px] px-[25px] pb-[5px]"
    >
      <h3 class="title text-center text-text-regular mx-auto mb-[30px]">{{ title }}</h3>
      <Transition name="fade-slide">
        <el-alert
          v-if="registerEnabled === false"
          :title="t('login.registerDisabled')"
          type="warning"
          :closable="false"
          show-icon
          class="mb-[15px]"
        />
      </Transition>
      <el-form-item prop="username">
        <el-input
          v-model.trim="registerForm.username"
          type="text"
          size="large"
          name="username"
          autocomplete="username"
          :placeholder="t('register.username')"
          :aria-label="t('register.username')"
          :maxlength="30"
        >
          <template #prefix><svg-icon icon-class="user" class="el-input__icon input-icon" /></template>
        </el-input>
      </el-form-item>
      <el-form-item prop="password" :rules="registerPwdValidator">
        <el-input
          v-model="registerForm.password"
          type="password"
          size="large"
          name="new-password"
          autocomplete="new-password"
          :aria-label="t('register.password')"
          :placeholder="t('register.password')"
          :maxlength="20"
          @keyup.enter="handleRegister"
        >
          <template #prefix><svg-icon icon-class="password" class="el-input__icon input-icon" /></template>
        </el-input>
        <!-- TierA-5: 密码强度指示器 -->
        <PasswordStrength :password="registerForm.password" />
      </el-form-item>
      <el-form-item prop="confirmPassword">
        <el-input
          v-model="registerForm.confirmPassword"
          type="password"
          size="large"
          name="confirm-password"
          autocomplete="new-password"
          :aria-label="t('register.confirmPassword')"
          :placeholder="t('register.confirmPassword')"
          :maxlength="20"
          @keyup.enter="handleRegister"
        >
          <template #prefix><svg-icon icon-class="password" class="el-input__icon input-icon" /></template>
        </el-input>
      </el-form-item>
      <Transition name="expand-fade">
        <el-form-item prop="code" v-if="captchaEnabled">
          <!-- 成熟后台标准布局：验证码输入框与图片同行 flex（与 login.vue 一致） -->
          <div class="flex w-full items-center gap-2.5">
            <el-input
              size="large"
              v-model="registerForm.code"
              auto-complete="off"
              :placeholder="t('register.code')"
              :aria-label="t('register.code')"
              :maxlength="10"
              class="flex-1 min-w-0"
              @keyup.enter="handleRegister"
            >
              <template #prefix><svg-icon icon-class="validCode" class="el-input__icon input-icon" /></template>
            </el-input>
            <div
              class="h-10 w-[110px] shrink-0 flex items-center justify-center overflow-hidden rounded border border-[var(--el-border-color-lighter)] bg-[var(--el-fill-color-light)]"
              role="button"
              tabindex="0"
              :aria-label="t('register.clickRefreshCaptcha')"
              @click="getCode"
              @keydown.enter.prevent="getCode"
            >
              <Transition name="fade" mode="out-in">
                <img
                  v-if="codeUrl"
                  :src="codeUrl"
                  class="h-10 w-full cursor-pointer object-cover align-middle"
                  :alt="t('register.clickRefreshCaptcha')"
                />
              </Transition>
            </div>
          </div>
        </el-form-item>
      </Transition>
      <el-form-item class="w-full">
        <el-button :loading="loading" size="large" type="primary" class="w-full" @click.prevent="handleRegister">
          <Transition mode="out-in" name="fade">
            <span v-if="!loading" key="text">{{ t('common.register') }}</span>
            <span v-else key="loading">{{ t('common.registering') }}</span>
          </Transition>
        </el-button>
        <div class="ml-auto">
          <router-link class="link-type" :to="'/login'">{{ t('login.signIn') }}</router-link>
        </div>
      </el-form-item>
    </el-form>
    <!--  底部  -->
    <div class="el-register-footer fixed bottom-0 w-full h-10 leading-10 text-center text-white text-xs tracking-[1px]">
      <span>{{ footerContent }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
import { ElMessageBox } from 'element-plus'
import { errorHub } from '@/utils/errorHub'
import { getCodeImg, register } from '@/api/login'
import defaultSettings from '@/settings'
import { usePasswordRule } from '@/utils/passwordRule'
import PasswordStrength from '@/components/PasswordStrength/index.vue'
import type { RegisterForm } from '@/types/api/login'

const title = import.meta.env.VITE_APP_TITLE
const footerContent = defaultSettings.footerContent
const router = useRouter()
const registerRefRef = useTemplateRef('registerRef')
const { registerPwdValidator } = usePasswordRule()

const codeUrl = ref<string>('')
const loading = ref<boolean>(false)
const codeLoading = ref<boolean>(false)
const captchaEnabled = ref<boolean>(true)
const registerEnabled = ref<boolean | null>(null)

const registerForm = ref<RegisterForm>({
  username: '',
  password: '',
  confirmPassword: '',
  code: '',
  uuid: ''
})

const equalToPassword = (rule: Record<string, unknown>, value: string, callback: (error?: Error) => void): void => {
  if (registerForm.value.password !== value) {
    // P1 修复：使用明确的"两次密码不一致"文案（原为通用"提示"）
    callback(new Error(t('register.passwordMismatch')))
  } else {
    callback()
  }
}

const registerRules = computed(() => ({
  username: [
    { required: true, trigger: 'blur', message: t('common.form.inputPlaceholder') + t('register.username') },
    { min: 2, max: 20, message: t('common.tip'), trigger: 'blur' }
  ],
  password: registerPwdValidator.value,
  confirmPassword: [
    { required: true, trigger: 'blur', message: t('common.form.inputPlaceholder') + t('register.confirmPassword') },
    { validator: equalToPassword, trigger: 'blur' }
  ],
  // 验证码关闭时（captchaEnabled=false）code 输入框 v-if 隐藏，规则也应为空避免校验失败
  code: captchaEnabled.value
    ? [{ required: true, trigger: 'change', message: t('common.form.inputPlaceholder') + t('register.code') }]
    : []
}))

function handleRegister(): void {
  registerRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      loading.value = true
      register(registerForm.value)
        .then(() => {
          // P1 修复：成功路径先复位 loading，再弹窗跳转（避免弹窗/跳转失败时按钮永久 loading）
          loading.value = false
          const username = registerForm.value.username
          ElMessageBox.alert(t('register.successTitle', { username: username }), t('common.tip'), {
            type: 'success'
          })
            .then(() => {
              router.push('/login')
            })
            .catch(() => {})
        })
        .catch(() => {
          loading.value = false
          if (captchaEnabled.value) {
            getCode()
          }
        })
    }
  })
}

function getCode(): void {
  // 防止快速重复点击导致的竞态：上一次请求未完成时忽略新请求
  if (codeLoading.value) return
  codeLoading.value = true
  getCodeImg()
    .then((res) => {
      captchaEnabled.value = res.captchaEnabled === undefined ? true : res.captchaEnabled
      // 同时读取注册开关（后端 /captchaImage 已返回 registerEnabled 字段，避免探测 /register 触发 403）
      registerEnabled.value = res.registerEnabled === true
      // 仅在 captchaEnabled 且 res.img 非空时设置验证码图片
      // 防止 res.img 为 undefined/空字符串时生成 data:image/gif;base64,undefined 的无效 URL
      if (captchaEnabled.value && res.img) {
        codeUrl.value = 'data:image/gif;base64,' + res.img
        registerForm.value.uuid = res.uuid
      } else if (captchaEnabled.value) {
        // P1 修复：后端声明启用验证码但图片为空时，不再静默关闭验证码（会绕过防爆破）
        captchaEnabled.value = true
        codeUrl.value = ''
        registerForm.value.uuid = ''
        errorHub.report('warning', 'other', t('login.captchaLoadFailed'))
      } else {
        captchaEnabled.value = false
        codeUrl.value = ''
        registerForm.value.uuid = ''
      }
    })
    .catch(() => {})
    .finally(() => {
      codeLoading.value = false
    })
}

// 注册开关由 getCode() 一次性获取（通过 /captchaImage 响应的 registerEnabled 字段），
// 不再单独调用 checkRegisterEnabled() 探测 /register，避免触发 403 控制台错误
getCode()
</script>

<style lang="scss" scoped>
.register {
}

.register-form {
  background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.5);
  .el-input {
    height: 40px;
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
.register-tip {
  font-size: 13px;
  text-align: center;
  color: var(--el-text-color-placeholder);
}
.el-register-footer {
  font-family: Arial;
}
</style>
