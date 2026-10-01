<template>
  <el-form ref="userRef" :model="form" :rules="rules" label-width="80px">
    <el-form-item :label="t('user.column.nickName')" prop="nickName">
      <el-input v-model.trim="form.nickName" maxlength="30" />
    </el-form-item>
    <el-form-item :label="t('profile.label.phone')" prop="phonenumber">
      <el-input v-model.trim="form.phonenumber" maxlength="20" class="w-[70%]">
        <template #prepend>
          <el-select v-model="form.countryCode" placeholder="区号" class="w-[120px]">
            <el-option v-for="opt in regionOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </template>
      </el-input>
    </el-form-item>
    <el-form-item :label="t('profile.label.email')" prop="email">
      <el-input v-model.trim="form.email" maxlength="50" />
    </el-form-item>
    <el-form-item :label="t('user.form.sex')">
      <el-radio-group v-model="form.sex">
        <el-radio value="0">{{ t('profile.sex.male') }}</el-radio>
        <el-radio value="1">{{ t('profile.sex.female') }}</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" :loading="submitLoading" @click="submit">{{ t('common.save') }}</el-button>
      <el-button type="danger" @click="close">{{ t('common.close') }}</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { updateUserProfile } from '@/api/system/user'
import type { SysUser } from '@/types/api/system/user'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import useUserStore from '@/store/modules/user'
import { REGION_OPTIONS, isValidPhoneByRegion, normalizePhoneNumber } from '@/utils/phone'

const { t } = useI18n()
interface Props {
  user?: SysUser
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:user': [user: SysUser]
}>()
const userStore = useUserStore()

const regionOptions = REGION_OPTIONS

const userRefRef = useTemplateRef('userRef')
const submitLoading = ref(false)

const form = ref<SysUser>({})
const rules = {
  nickName: [{ required: true, message: t('user.validate.nickNameRequired'), trigger: 'blur' }],
  email: [
    { required: true, message: t('user.validate.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('user.validate.emailFormat'), trigger: ['blur', 'change'] }
  ],
  phonenumber: [
    { required: true, message: t('user.validate.phoneRequired'), trigger: 'blur' },
    {
      // 方案 D（G18）：按所选国家/地区校验手机号，不再写死中国号段
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        const phone = (value || '').trim()
        const region = (form.value.countryCode || 'CN').toUpperCase()
        if (phone && !isValidPhoneByRegion(phone, region)) {
          callback(new Error(t('user.validate.phoneRegion')))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

/** 提交按钮 */
function submit() {
  userRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      // 归一化手机号（去分隔符）后提交
      const payload: SysUser = {
        ...form.value,
        phonenumber: form.value.phonenumber ? normalizePhoneNumber(form.value.phonenumber) : form.value.phonenumber,
        countryCode: (form.value.countryCode || 'CN').toUpperCase()
      }
      updateUserProfile(payload)
        .then(() => {
          modal.msgSuccess(t('common.editSuccess'))
          // FE-26: 同步全部已修改字段到 props.user（原仅同步 phonenumber/email，遗漏 nickName/sex）
          if (props.user) {
            emit('update:user', {
              ...props.user,
              nickName: form.value.nickName,
              phonenumber: payload.phonenumber,
              countryCode: payload.countryCode,
              email: form.value.email,
              sex: form.value.sex
            })
          }
          // 同步到 userStore，确保 Navbar 等全局位置显示最新昵称
          if (userStore.nickName !== form.value.nickName) {
            userStore.nickName = form.value.nickName
          }
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

// 回显当前登录用户信息
watch(
  () => props.user,
  (user: SysUser) => {
    if (user) {
      form.value = {
        nickName: user.nickName,
        phonenumber: user.phonenumber,
        countryCode: user.countryCode || 'CN',
        email: user.email,
        sex: user.sex
      }
    }
  },
  { immediate: true }
)
</script>
