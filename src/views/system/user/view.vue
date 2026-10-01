<template>
  <el-drawer
    :title="t('userView.title')"
    v-model="visible"
    direction="rtl"
    size="min(80%, 700px)"
    append-to-body
    :before-close="handleClose"
    class="detail-drawer"
  >
    <div v-loading="loading" class="drawer-content">
      <!-- 基本信息 -->
      <h4 class="section-header">{{ t('userView.basicInfo') }}</h4>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.userName') }}</label>
            <span class="info-value plaintext">{{ info.nickName }}</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.dept') }}</label>
            <span class="info-value plaintext">{{ info.dept && info.dept.deptName }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.phone') }}</label>
            <span class="info-value plaintext">{{ info.phonenumber }}</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.email') }}</label>
            <span class="info-value plaintext">{{ info.email }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.loginAccount') }}</label>
            <span class="info-value plaintext">{{ info.userName }}</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.status') }}</label>
            <span class="info-value plaintext">
              <el-tag size="small" :type="info.status === '0' ? 'success' : 'danger'">
                {{ info.status === '0' ? t('common.normal') : t('common.disabled') }}
              </el-tag>
            </span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.post') }}</label>
            <span class="info-value plaintext">{{ postNames || t('userView.placeholder.noPost') }}</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.sex') }}</label>
            <span class="info-value plaintext">{{ sexLabel }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item full-width">
            <label class="info-label">{{ t('userView.label.role') }}</label>
            <span class="info-value plaintext">{{ roleNames || t('userView.placeholder.noRole') }}</span>
          </div>
        </el-col>
      </el-row>
      <!-- 其他信息 -->
      <h4 class="section-header">{{ t('userView.otherInfo') }}</h4>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.createBy') }}</label>
            <span class="info-value plaintext">{{ info.createBy }}</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.createTime') }}</label>
            <span class="info-value plaintext">{{ info.createTime }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.updateBy') }}</label>
            <span class="info-value plaintext">{{ info.updateBy }}</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.updateTime') }}</label>
            <span class="info-value plaintext">{{ info.updateTime }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.lastLoginIp') }}</label>
            <span class="info-value plaintext">{{ info.loginIp }}</span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">{{ t('userView.label.lastLoginTime') }}</label>
            <span class="info-value plaintext">{{ info.loginDate }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item full-width">
            <label class="info-label">{{ t('userView.label.remark') }}</label>
            <span class="info-value plaintext">{{ info.remark }}</span>
          </div>
        </el-col>
      </el-row>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { getUser } from '@/api/system/user'
import type { SysUser } from '@/types/api/system/user'
import type { SysRole } from '@/types/api/system/role'
import type { SysPost } from '@/types/api/system/post'

const { t } = useI18n()

const visible = ref<boolean>(false)
const loading = ref<boolean>(false)
const info = reactive<SysUser>({})
const postOptions = ref<SysPost[]>([])
const roleOptions = ref<SysRole[]>([])

const { sys_user_sex } = useDict('sys_user_sex')

const sexLabel = computed(() => selectDictLabel(sys_user_sex.value, info.sex) || '-')

const postNames = computed<string>(() => {
  if (!postOptions.value.length || !info.postIds) return ''
  return (
    postOptions.value
      .filter((p: SysPost) => info.postIds?.includes(p.postId))
      .map((p: SysPost) => p.postName)
      .join('、') || ''
  )
})

const roleNames = computed<string>(() => {
  if (!roleOptions.value.length || !info.roleIds) return ''
  return (
    roleOptions.value
      .filter((r: SysRole) => info.roleIds?.includes(r.roleId))
      .map((r: SysRole) => r.roleName)
      .join('、') || ''
  )
})

const open = async (userId: number): Promise<void> => {
  visible.value = true
  loading.value = true
  try {
    const res = await getUser(userId)
    Object.assign(info, res.data || {})
    postOptions.value = res.posts || []
    roleOptions.value = res.roles || []
    info.postIds = res.postIds || []
    info.roleIds = res.roleIds || []
  } catch (error) {
    if (import.meta.env.DEV) console.error('Failed to get user info:', error)
  } finally {
    loading.value = false
  }
}

const handleClose = (): void => {
  visible.value = false
}

defineExpose({
  open
})
</script>
