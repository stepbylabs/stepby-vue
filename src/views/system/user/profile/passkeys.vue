<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1">
          <svg-icon icon-class="lock" />
          {{ t('profile.passkey.title') }}
        </span>
        <el-tooltip :content="t('profile.passkey.tip')">
          <svg-icon icon-class="question" class="cursor-pointer text-text-secondary" />
        </el-tooltip>
        <div class="ml-auto">
          <el-button v-if="supported" type="primary" size="small" @click="openDialog">
            {{ t('profile.passkey.add') }}
          </el-button>
        </div>
      </div>
    </template>

    <el-alert :title="t('profile.passkey.tip')" type="info" :closable="false" show-icon class="mb15" />

    <el-alert
      v-if="!supported"
      :title="t('profile.passkey.unsupported')"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-table v-else v-loading="loading" :data="credentials">
      <el-table-column prop="name" :label="t('profile.passkey.column.name')" show-overflow-tooltip />
      <el-table-column :label="t('profile.passkey.column.createTime')" width="170" align="center">
        <template #default="scope">
          <span>{{ scope.row.createTime ? parseTime(scope.row.createTime) : '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('profile.passkey.column.lastUsedAt')" width="170" align="center">
        <template #default="scope">
          <span>{{ scope.row.lastUsedAt ? parseTime(scope.row.lastUsedAt) : t('profile.passkey.neverUsed') }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="signCount" :label="t('profile.passkey.column.signCount')" width="100" align="center" />
      <el-table-column :label="t('profile.passkey.column.action')" width="90" align="center">
        <template #default="scope">
          <el-button link type="danger" :loading="deleting === scope.row.credId" @click="handleDelete(scope.row)">
            {{ t('profile.passkey.delete') }}
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('profile.passkey.empty')" />
      </template>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="t('profile.passkey.dialogTitle')" width="420px" append-to-body>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('profile.passkey.nameLabel')" prop="name">
          <el-input v-model.trim="form.name" :maxlength="50" :placeholder="t('profile.passkey.namePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="adding" @click="handleAdd">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts" name="ProfilePasskeys">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { listCredentials, registerStart, registerFinish, deleteCredential } from '@/api/webauthn'
import type { WebauthnCredentialVo } from '@/types'
import { isWebauthnSupported, isUserCancelled, toCreationOptions, registrationToDto } from '@/utils/webauthn'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()
// 能力位 `auth.webauthn` 是否开启（后端 getInfo 下发；关闭态端点一律 404）
const userStore = useUserStore()
const supported = ref(isWebauthnSupported())
const loading = ref(false)
const adding = ref(false)
const credentials = ref<WebauthnCredentialVo[]>([])
const deleting = ref(0)
const dialogVisible = ref(false)
const formRef = useTemplateRef<FormInstance>('formRef')
const form = reactive<{ name: string }>({ name: '' })

const rules = computed<FormRules>(() => ({
  name: [{ required: true, trigger: 'blur', message: t('profile.passkey.nameRequired') }]
}))

function load(): void {
  loading.value = true
  listCredentials()
    .then((res) => {
      credentials.value = res.data || []
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

function openDialog(): void {
  form.name = ''
  dialogVisible.value = true
}

function handleAdd(): void {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid) return
    adding.value = true
    try {
      const startRes = await registerStart()
      const options = startRes.data
      if (!options) return
      const credential = await navigator.credentials.create({ publicKey: toCreationOptions(options) })
      if (!credential) return
      await registerFinish(registrationToDto(credential as PublicKeyCredential, form.name || null))
      ElMessage.success(t('profile.passkey.addSuccess'))
      dialogVisible.value = false
      load()
    } catch (err) {
      // 用户取消认证器交互：安静返回，不报错
      if (isUserCancelled(err)) return
      // 其余错误（含能力位关闭的 404）已由 request 拦截器统一提示
    } finally {
      adding.value = false
    }
  })
}

function handleDelete(row: WebauthnCredentialVo): void {
  ElMessageBox.confirm(t('profile.passkey.deleteConfirm', { name: row.name }), t('common.warning'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  })
    .then(() => {
      deleting.value = row.credId
      return deleteCredential(row.credId)
    })
    .then(() => {
      ElMessage.success(t('profile.passkey.deleteSuccess'))
      load()
    })
    .catch(() => {})
    .finally(() => {
      deleting.value = 0
    })
}

onMounted(() => {
  // 双重保险：父级已按能力位 `v-if` 收敛该页签；这里再判一次，保证组件被别处复用时
  // 也不会在能力位关闭态去探测端点（关闭态该端点 404 ⇒ 控制台报错 + 假入口）
  if (supported.value && userStore.showPasskey) load()
})
</script>