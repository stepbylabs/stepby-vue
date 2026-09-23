<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center gap-3">
        <span>
          <el-icon><Key /></el-icon>
          {{ t('sso.grants.title') }}
        </span>
        <el-tooltip :content="t('sso.grants.tip')">
          <el-icon class="cursor-pointer text-text-secondary"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
    </template>

    <el-alert :title="t('sso.grants.tip')" type="info" :closable="false" show-icon class="mb15" />

    <div v-loading="loading" class="grant-list">
      <template v-if="grants.length > 0">
        <div v-for="g in grants" :key="g.clientId" class="grant-item flex items-center justify-between">
          <div class="flex items-center gap-[12px]">
            <el-avatar :size="36">{{ g.clientName.charAt(0).toUpperCase() }}</el-avatar>
            <div>
              <div class="grant-name">{{ g.clientName }}</div>
              <div class="grant-meta text-text-secondary">
                <span class="grant-client-id">{{ g.clientId }}</span>
                <span>· {{ scopeText(g.scopes) }}</span>
                <span v-if="g.consentedAt">· {{ t('sso.grants.column.consentedAt') }}: {{ g.consentedAt }}</span>
              </div>
            </div>
          </div>
          <el-button type="danger" plain size="small" :loading="revoking === g.clientId" @click="handleRevoke(g)">
            {{ t('sso.grants.revoke') }}
          </el-button>
        </div>
      </template>

      <el-empty v-if="loading === false && grants.length === 0" :description="t('sso.grants.empty')" />
    </div>
  </el-card>
</template>

<script setup lang="ts" name="SsoGrants">
import { ElMessage, ElMessageBox } from 'element-plus'
import { listSsoGrants, revokeSsoGrant } from '@/api/sso'
import type { SsoGrant } from '@/types'

// SSO「已授权应用」（v4-R8 自助撤销授权）：
// client_name 为同意时快照；撤销 = 软删同意记录 + 服务端级联吊销该应用名下全部访问令牌。
const { t } = useI18n()
const loading = ref(true)
const grants = ref<SsoGrant[]>([])
const revoking = ref('')

function scopeText(scopes: string[]): string {
  if (!scopes || scopes.length === 0) return t('sso.grants.scopeAll')
  return scopes.join(' · ')
}

function load(): void {
  loading.value = true
  listSsoGrants()
    .then((res) => {
      grants.value = res.data || []
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

function handleRevoke(g: SsoGrant): void {
  ElMessageBox.confirm(t('sso.grants.revokeConfirm', { name: g.clientName }), t('common.warning'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  })
    .then(() => {
      revoking.value = g.clientId
      revokeSsoGrant(g.clientId)
        .then(() => {
          ElMessage.success(t('sso.grants.revoked'))
          load()
        })
        .catch(() => {})
        .finally(() => {
          revoking.value = ''
        })
    })
    .catch(() => {})
}

onMounted(load)
</script>

<style lang="scss" scoped>
.grant-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.grant-item:last-child {
  border-bottom: none;
}
.grant-name {
  font-weight: 600;
}
.grant-meta {
  font-size: 12px;
  margin-top: 2px;
}
.grant-client-id {
  font-family: monospace;
}
</style>
