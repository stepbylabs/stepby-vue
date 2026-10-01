<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center gap-3">
        <span>
          <el-icon><Connection /></el-icon>
          {{ t('oauth.bindManagement') }}
        </span>
        <el-tooltip :content="t('oauth.tip.myBindings')">
          <el-icon class="cursor-pointer text-text-secondary"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
    </template>

    <el-alert :title="t('oauth.tip.myBindings')" type="info" :closable="false" show-icon class="mb15" />

    <div v-loading="loading" class="binding-list">
      <template v-if="bindingList.length > 0">
        <div v-for="b in bindingList" :key="b.provider" class="binding-item flex items-center justify-between">
          <div class="flex items-center gap-[12px]">
            <svg-icon :icon-class="oauthIcon(b.provider)" class="provider-icon" />
            <div>
              <div class="provider-name">{{ b.providerName }}</div>
              <div class="provider-meta text-text-secondary">
                <span v-if="b.nickname">{{ b.nickname }}</span>
                <span v-if="b.email">· {{ b.email }}</span>
                <span v-if="b.lastLoginTime">
                  · {{ t('oauth.column.lastLoginTime') }}: {{ parseTime(b.lastLoginTime) }}
                </span>
              </div>
            </div>
          </div>
          <el-button type="danger" plain size="small" :loading="unbinding === b.provider" @click="handleUnbind(b)">
            {{ t('oauth.action.unbind') }}
          </el-button>
        </div>
      </template>

      <!-- 可绑定的启用提供商（尚未绑定当前账号） -->
      <template v-if="availableProviders.length > 0">
        <el-divider content-position="left">
          <span class="divider-text">{{ t('oauth.providerList') }}</span>
        </el-divider>
        <div class="flex flex-wrap gap-[12px]">
          <el-button
            v-for="p in availableProviders"
            :key="p.providerCode"
            :loading="binding === p.providerCode"
            @click="handleBind(p)"
          >
            <svg-icon :icon-class="oauthIcon(p.providerCode)" class="provider-icon sm" />
            {{ p.providerName }}
          </el-button>
        </div>
      </template>

      <el-empty
        v-if="loading === false && bindingList.length === 0 && availableProviders.length === 0"
        :description="t('oauth.tip.empty')"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts" name="OauthBinding">
import { ElMessage, ElMessageBox } from 'element-plus'
import { listMyBindings, listEnabledProviders, getAuthorizeUrl, unbindOauth } from '@/api/oauth'
import type { MyOauthBinding, EnabledOauthProvider } from '@/types/api/oauth'
import { errorHub } from '@/utils/errorHub'

const { t } = useI18n()
const loading = ref(true)
const bindingList = ref<MyOauthBinding[]>([])
const allProviders = ref<EnabledOauthProvider[]>([])
const binding = ref('')
const unbinding = ref('')

const availableProviders = computed(() => {
  const bound = new Set(bindingList.value.map((b: MyOauthBinding) => b.provider))
  return allProviders.value.filter((p: EnabledOauthProvider) => !bound.has(p.providerCode))
})

// 提供商编码 → 图标名
function oauthIcon(providerCode: string): string {
  switch (providerCode) {
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

function load(): void {
  loading.value = true
  Promise.all([listMyBindings(), listEnabledProviders()])
    .then(([bindingsRes, providersRes]) => {
      bindingList.value = bindingsRes.data || []
      allProviders.value = providersRes.data || []
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

// 发起绑定：生成授权 URL 后跳转第三方，回调落地 /oauth-login 用当前登录态直接绑定
function handleBind(p: EnabledOauthProvider): void {
  if (binding.value) return
  binding.value = p.providerCode
  getAuthorizeUrl(p.providerCode)
    .then((res) => {
      if (res.authorizeUrl) {
        // 携带 redirect 返回到个人中心绑定页
        window.location.href = res.authorizeUrl
      } else {
        errorHub.report('error', 'other', t('oauth.error.authorizeFailed'))
      }
    })
    .catch(() => errorHub.report('error', 'other', t('oauth.error.authorizeFailed')))
    .finally(() => {
      binding.value = ''
    })
}

// 解绑：若为唯一第三方绑定则给出更强警告
function handleUnbind(b: MyOauthBinding): void {
  const isLast = bindingList.value.length === 1
  const message = isLast ? t('oauth.tip.unbindSelfLast') : t('oauth.tip.unbindConfirm')
  ElMessageBox.confirm(message, t('common.warning'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: isLast ? 'warning' : 'info'
  })
    .then(() => {
      unbinding.value = b.provider
      unbindOauth(b.provider)
        .then(() => {
          ElMessage.success(t('oauth.tip.unbindSuccess'))
          load()
        })
        .catch(() => {})
        .finally(() => {
          unbinding.value = ''
        })
    })
    .catch(() => {})
}

onMounted(load)
</script>

<style lang="scss" scoped>
.binding-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.binding-item:last-child {
  border-bottom: none;
}
.provider-icon {
  font-size: 26px;
  color: var(--el-text-color-primary);
  &.sm {
    font-size: 16px;
    margin-right: 4px;
  }
}
.provider-name {
  font-weight: 600;
}
.provider-meta {
  font-size: 12px;
  margin-top: 2px;
}
.divider-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
