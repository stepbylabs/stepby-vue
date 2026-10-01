<template>
  <el-form ref="pwdRef" :model="user" :rules="rules" label-width="80px">
    <el-form-item :label="t('user.tip.oldPwd')" prop="oldPassword">
      <el-input
        v-model.trim="user.oldPassword"
        :placeholder="t('user.tip.oldPwd')"
        type="password"
        :maxlength="20"
        show-password
      />
    </el-form-item>
    <el-form-item :label="t('user.tip.editPwd')" prop="newPassword" :rules="infoPwdValidator">
      <el-input
        v-model.trim="user.newPassword"
        :placeholder="t('user.tip.editPwd')"
        type="password"
        :maxlength="20"
        show-password
      />
      <!-- TierA-5: 密码强度指示器 -->
      <PasswordStrength :password="user.newPassword || ''" />
    </el-form-item>
    <el-form-item :label="t('register.confirmPassword')" prop="confirmPassword">
      <el-input
        v-model.trim="user.confirmPassword"
        :placeholder="t('register.confirmPassword')"
        type="password"
        :maxlength="20"
        show-password
      />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" :loading="submitLoading" @click="submit">{{ t('common.save') }}</el-button>
      <el-button type="danger" @click="close">{{ t('common.close') }}</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { ElLoading } from 'element-plus'
import { usePasswordRule } from '@/utils/passwordRule'
import { updateUserPwd } from '@/api/system/user'
import PasswordStrength from '@/components/PasswordStrength/index.vue'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'

const { t } = useI18n()
const pwdRefRef = useTemplateRef('pwdRef')
const { infoPwdValidator } = usePasswordRule()
const userStore = useUserStore()
const submitLoading = ref(false)

interface UserProfilePwd {
  // 旧密码
  oldPassword?: string
  // 新密码
  newPassword?: string
  // 确认密码
  confirmPassword?: string
}

const user = reactive<UserProfilePwd>({
  oldPassword: undefined,
  newPassword: undefined,
  confirmPassword: undefined
})

const equalToPassword = (rule: Record<string, unknown>, value: string, callback: (error?: Error) => void): void => {
  if (user.newPassword !== value) {
    callback(new Error(t('user.validate.passwordNotMatch')))
  } else {
    callback()
  }
}

const rules = {
  oldPassword: [{ required: true, message: t('user.validate.oldPasswordRequired'), trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: t('user.validate.confirmPasswordRequired'), trigger: 'blur' },
    { required: true, validator: equalToPassword, trigger: 'blur' }
  ]
}

/** 修改密码成功后的登出跳转句柄，组件卸载时清理 */
let logoutTimer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => {
  if (logoutTimer !== null) {
    clearTimeout(logoutTimer)
    logoutTimer = null
  }
})

/** 提交按钮 */
function submit() {
  pwdRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      updateUserPwd(user.oldPassword!, user.newPassword!)
        .then(() => {
          // FE-24: 清空表单，避免残留旧密码明文（安全）
          pwdRefRef.value?.resetFields()
          // FE-25: 提示用户需重新登录（密码修改后后端会使旧 token 失效）
          modal.msgSuccess(t('profile.tip.modifyPwdSuccess'))
          // V-2 修复: 密码修改后后端立即失效旧 token，必须立即登出，避免延迟期间用户操作触发 401
          // 使用全屏 loading 阻止任何交互，1500ms 仅用于让用户看到成功提示
          const loading = ElLoading.service({
            lock: true,
            text: t('profile.tip.modifyPwdSuccess'),
            background: 'rgba(0, 0, 0, 0.7)'
          })
          logoutTimer = setTimeout(() => {
            userStore.logOut().finally(() => {
              loading.close()
              goLogin()
            })
          }, 1500)
        })
        .catch(() => {})
        .finally(() => {
          submitLoading.value = false
        })
    }
  })
}

/** 关闭按钮 */
function close() {
  tab.closePage()
}
</script>
