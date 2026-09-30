<template>
<div class="relative flex justify-center items-center h-full overflow-hidden auth-aurora">
  <!-- Aurora 科技背景（与 login.vue 共用 .auth-aurora） -->
  <div class="aurora-blob aurora-1" aria-hidden="true"></div>
  <div class="aurora-blob aurora-2" aria-hidden="true"></div>
  <div class="aurora-grid" aria-hidden="true"></div>
    <div class="panel rounded-md w-[440px] max-w-[calc(100vw-20px)] pt-[28px] px-[28px] pb-[28px] z-[1]">
      <template v-if="valid">
        <div class="app-head flex flex-col items-center">
          <!-- v4-R6：logo 加载失败/跨源不可达时回落到首字母头像，绝不显示空白或占位图 -->
          <el-avatar v-if="logoUri" :size="60" :src="logoUri">{{ initial }}</el-avatar>
          <el-avatar v-else :size="60">{{ initial }}</el-avatar>
          <h3 class="title mt15">{{ t('sso.consent.title', { client: clientName }) }}</h3>
        </div>
        <p class="subtitle mt10 text-text-secondary">{{ t('sso.consent.subtitle', { user: userNick }) }}</p>

        <div class="scopes mt15">
          <div class="scopes-label text-text-regular">{{ t('sso.consent.willAllow') }}</div>
          <ul class="scope-list">
            <li v-for="s in scopes" :key="s">
              <el-icon color="var(--el-color-success)"><Select /></el-icon>
              <span>{{ scopeLabel(s) }}</span>
            </li>
          </ul>
        </div>

        <!-- v4-R6 防钓鱼：明示授权后代码回跳的主机，用户可核对是否为预期应用 -->
        <div class="redirect-host mt10 text-text-secondary">
          <el-icon><Warning /></el-icon>
          <span>{{ t('sso.consent.redirectHost') }}</span>
          <span class="host">{{ redirectHost }}</span>
        </div>

        <div class="actions mt20 flex gap-10">
          <el-button class="flex-1" :loading="submitting" @click="submit(false)">
            {{ t('sso.consent.deny') }}
          </el-button>
          <el-button class="flex-1" type="primary" :loading="submitting" @click="submit(true)">
            {{ t('sso.consent.approve') }}
          </el-button>
        </div>
      </template>

      <template v-else>
        <el-result icon="warning" :title="t('sso.consent.invalidTitle')" :sub-title="t('sso.consent.invalidTip')">
          <template #extra>
            <el-button type="primary" @click="toHome">{{ t('sso.consent.backHome') }}</el-button>
          </template>
        </el-result>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts" name="SsoConsent">
import { ElMessage } from 'element-plus'
import { submitSsoConsent } from '@/api/sso'
import type { SsoConsentForm } from '@/types'
import useUserStore from '@/store/modules/user'

// SSO 授权同意页（/sso-consent）
//
// 后端 authorize 判定「需用户同意」后用 302 把浏览器带到本页，通过查询参数回显授权上下文。
// 该跳转的接收方是我方前端页面（非外部 RP），故按「应用私有 API」约定使用 camelCase，
// 与 SsoConsentDto（ts-rs 生成）字段一一对应。
//   批准 / 拒绝 → POST /sso/consent（SsoConsentForm），后端返回 { redirect }（含 code 或 error 的 RP 回跳地址），
//   本页据 window.location 完成最终跳转（跨源，不能用前端路由）。
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const q = (k: string): string => (route.query[k] as string) || ''

const form = ref<SsoConsentForm>({
  clientId: q('clientId'),
  redirectUri: q('redirectUri') || undefined,
  scope: q('scope'),
  state: q('state') || undefined,
  nonce: q('nonce') || undefined,
  codeChallenge: q('codeChallenge') || undefined,
  codeChallengeMethod: q('codeChallengeMethod') || undefined,
  // v5-D9：后端开启 `[sso].consent_ticket = required` 时会在跳转 query 带 ticket，
  // 本页原样回传供服务端校验"同意参数未被篡改"；未开启时后端不下发 ⇒ undefined，
  // 与改造前逐字节等价（后端 off 档完全忽略该字段）。
  ticket: q('ticket') || undefined,
  approved: false
})

const clientName = q('clientName') || form.value.clientId
// 批次 4（D9）：后端开启 `[sso].proxy_logo_uri` 时，同意页用**同源**代理端点取 logo，
// 避免把用户 IP/Referer 泄漏给第三方主机；未开启则沿用原有外链行为（= 历史行为）。
const logoProxy = q('logoProxy') === '1'
const logoUri =
  logoProxy && form.value.clientId
    ? `/sso/client-logo/${encodeURIComponent(form.value.clientId)}`
    : q('logoUri')
const scopes = computed(() => (form.value.scope || '').split(/\s+/).filter(Boolean))
const userNick = computed(() => userStore.nickName || userStore.name || '')
const initial = computed(() => (clientName ? clientName.charAt(0).toUpperCase() : '?'))
// v4-R6 防钓鱼：解析回跳地址主机名展示给用户核对；非法 URL 时原样展示（后端 authorize
// 已精确匹配白名单，此处仅为展示层兜底）
const redirectHost = computed(() => {
  const uri = form.value.redirectUri || ''
  try {
    return new URL(uri).host
  } catch {
    return uri
  }
})
// authorize 硬约束：必须带 openid，且 clientId 缺一不可，否则视为非法入口
const valid = computed(() => Boolean(form.value.clientId) && scopes.value.includes('openid'))

function scopeLabel(s: string): string {
  const key = `sso.consent.scope.${s}`
  const label = t(key)
  return label === key ? s : label
}

const submitting = ref(false)
function submit(approved: boolean): void {
  submitting.value = true
  const payload: SsoConsentForm = { ...form.value, approved }
  submitSsoConsent(payload)
    .then((res) => {
      const redirect = res.data?.redirect
      if (!redirect) {
        ElMessage.error(t('sso.consent.noRedirect'))
        return
      }
      // RP 回跳为跨源绝对地址，交给浏览器整页跳转
      window.location.href = redirect
    })
    .catch((e) => {
      if (import.meta.env.DEV) console.error('[sso-consent]', e)
    })
    .finally(() => {
      submitting.value = false
    })
}

function toHome(): void {
  router.replace('/')
}
</script>

<style lang="scss" scoped>
.sso-consent {
}
.panel {
  background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.5);
}
.title {
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  word-break: break-all;
}
.subtitle {
  text-align: center;
  font-size: 13px;
}
.scopes-label {
  font-size: 13px;
  margin-bottom: 8px;
}
.scope-list {
  list-style: none;
  margin: 0;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 13px;
  }
}
.actions {
  :deep(.el-button) {
    margin-left: 0;
  }
}
.redirect-host {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  .host {
    font-family: monospace;
    font-weight: 600;
    color: var(--el-color-warning);
    word-break: break-all;
  }
}
html.dark .sso-consent {
  
  .panel {
    background: rgba(15, 23, 42, 0.72);
  }
}
</style>
