<template>
  <div class="app-container ip-location-page p-4">
    <!-- 顶部操作栏 -->
    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Refresh" :loading="refreshing" @click="handleRefresh">
          {{ t('common.refresh') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="RefreshRight"
          :loading="reloading"
          :disabled="!status?.mmdbLoaded"
          @click="handleReload"
          v-hasPermi="['monitor:iplocation:edit']"
        >
          {{ t('ipLocation.btn.reload') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="RefreshRight"
          :loading="reloadingXdb"
          :disabled="!status?.xdbLoaded"
          @click="handleReloadXdb"
          v-hasPermi="['monitor:iplocation:edit']"
        >
          {{ t('ipLocation.btn.reloadXdb') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Download"
          :loading="updating"
          @click="handleUpdate"
          v-hasPermi="['monitor:iplocation:edit']"
        >
          {{ t('ipLocation.btn.updateNow') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Setting" @click="handleOpenConfig" v-hasPermi="['monitor:iplocation:edit']">
          {{ t('ipLocation.btn.config') }}
        </el-button>
      </el-col>
    </el-row>

    <el-alert
      v-if="refreshError"
      type="error"
      :title="t('ipLocation.tip.loadFailed')"
      :closable="false"
      class="mb-4"
      data-test="ip-location-load-error"
    >
      <template #default>
        <el-button link type="primary" @click="handleRefresh">{{ t('common.retry') }}</el-button>
      </template>
    </el-alert>

    <!-- b145（N-144-I）：管理配置读失败必须单独成一条，绝不与"功能没开"共用一个界面。
         服务端在这一路回的是 200 + 默认值，所以 load-error 那条不会亮——只能由这个标记点亮。 -->
    <el-alert
      v-if="status && !configAvailable"
      type="error"
      :closable="false"
      show-icon
      class="mb-4"
      :title="t('ipLocation.hint.configUnavailableTip')"
      data-test="ip-location-config-unavailable"
    >
      <template #default>
        <el-button link type="primary" @click="handleRefresh">{{ t('common.retry') }}</el-button>
      </template>
    </el-alert>

    <!-- 凭据解不开是"数据坏了"，不是"请求失败"：给的是去重新保存的出口，不是重试 -->
    <el-alert
      v-if="anyCredentialUnreadable"
      type="warning"
      :closable="false"
      show-icon
      class="mb-4"
      :title="t('ipLocation.hint.credentialUnreadableTip')"
      data-test="ip-location-credential-unreadable"
    >
      <template #default>
        <el-button v-hasPermi="['monitor:iplocation:edit']" link type="primary" @click="handleOpenConfig">
          {{ t('ipLocation.btn.config') }}
        </el-button>
      </template>
    </el-alert>

    <!-- 状态卡片 -->
    <el-row :gutter="16" v-loading="loading">
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="stat-card mb-4 text-center transition-all duration-200 hover:-translate-y-1">
          <div class="stat-title text-sm text-text-secondary mb-2">{{ t('ipLocation.stat.mmdbStatus') }}</div>
          <div class="stat-value text-xl font-semibold text-text-primary mb-2 min-h-7">
            <el-tag :type="status?.mmdbLoaded ? 'success' : 'danger'" size="large">
              {{ status?.mmdbLoaded ? t('common.successStatus') : t('ipLocation.stat.notLoaded') }}
            </el-tag>
          </div>
          <div class="stat-desc text-xs text-text-placeholder">{{ t('ipLocation.stat.mmdbDesc') }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="stat-card mb-4 text-center transition-all duration-200 hover:-translate-y-1">
          <div class="stat-title text-sm text-text-secondary mb-2">{{ t('ipLocation.stat.currentSource') }}</div>
          <div class="stat-value text-xl font-semibold text-text-primary mb-2 min-h-7">
            <el-tag :type="sourceTagType()" size="large">{{ sourceTagLabel() }}</el-tag>
          </div>
          <div class="stat-desc text-xs text-text-placeholder">{{ t('ipLocation.stat.sourceDesc') }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="stat-card mb-4 text-center transition-all duration-200 hover:-translate-y-1">
          <div class="stat-title text-sm text-text-secondary mb-2">{{ t('ipLocation.stat.fileSize') }}</div>
          <div class="stat-value text-xl font-semibold text-text-primary mb-2 min-h-7">
            {{ formatSize(status?.mmdbSize || 0) }}
          </div>
          <div class="stat-desc text-xs text-text-placeholder">{{ t('ipLocation.stat.sizeDesc') }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="stat-card mb-4 text-center transition-all duration-200 hover:-translate-y-1">
          <div class="stat-title text-sm text-text-secondary mb-2">{{ t('ipLocation.stat.lastModified') }}</div>
          <div class="stat-value text-xl font-semibold text-text-primary mb-2 min-h-7">
            {{ formatTime(status?.mmdbModified || 0) }}
          </div>
          <div class="stat-desc text-xs text-text-placeholder">{{ t('ipLocation.stat.modifiedDesc') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 详细信息 -->
    <el-card shadow="never" class="info-card mt-4" v-loading="loading">
      <template #header>
        <div class="card-header font-semibold">
          <span>{{ t('ipLocation.title.detail') }}</span>
        </div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item :label="t('ipLocation.field.mmdbPath')">
          {{ status?.mmdbPath || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.mmdbSize')">
          {{ formatSize(status?.mmdbSize || 0) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.mmdbModified')">
          {{ formatTime(status?.mmdbModified || 0) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.currentSource')">
          <el-tag :type="sourceTagType()" size="small">{{ sourceTagLabel() }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.maxmindAccountId')">
          <el-tag :type="credTagType(accountIdState)" size="small">
            {{ credTagLabel(accountIdState) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.maxmindLicenseKey')">
          <el-tag :type="credTagType(licenseKeyState)" size="small">
            {{ credTagLabel(licenseKeyState) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.autoUpdateCron')">
          <code class="bg-fill-light py-0.5 px-1.5 text-warning">{{ status?.autoUpdateCron || '-' }}</code>
          <span class="cron-hint text-text-secondary text-xs ml-2">（{{ t('ipLocation.hint.cronFormat') }}）</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.xdbStatus')">
          <el-tag :type="status?.xdbLoaded ? 'success' : 'info'" size="small">
            {{ status?.xdbLoaded ? t('common.successStatus') : t('ipLocation.stat.notLoaded') }}
          </el-tag>
          <Transition name="expand-fade">
            <span v-if="status?.xdbEnabled" class="cron-hint text-text-secondary text-xs ml-2">
              （{{ t('ipLocation.hint.xdbEnabled') }}）
            </span>
          </Transition>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 配置对话框 -->
    <el-dialog
      :close-on-click-modal="false"
      :title="t('ipLocation.title.config')"
      v-model="configOpen"
      :before-close="beforeConfigClose"
      width="min(90%, 600px)"
      append-to-body
      destroy-on-close
    >
      <el-form ref="configFormRef" :model="configForm" :rules="configRules" label-width="160px">
        <el-form-item :label="t('ipLocation.field.updateSource')" prop="updateSource">
          <el-radio-group v-model="configForm.updateSource">
            <el-radio value="p3terx">P3TERX {{ t('ipLocation.source.mirror') }}</el-radio>
            <el-radio value="maxmind">MaxMind {{ t('ipLocation.source.official') }}</el-radio>
          </el-radio-group>
          <div class="form-tip mt-1 leading-normal">
            <el-text type="info" size="small">
              {{ t('ipLocation.hint.sourceP3terx') }}
            </el-text>
          </div>
        </el-form-item>

        <Transition name="expand-fade">
          <div v-if="configForm.updateSource === 'maxmind'">
            <el-form-item :label="t('ipLocation.field.accountId')" prop="maxmindAccountId">
              <el-input
                v-model="configForm.maxmindAccountId"
                :placeholder="
                  config.accountIdUnreadable
                    ? t('ipLocation.hint.phAccountIdUnreadable')
                    : config.maxmindAccountIdConfigured
                      ? t('ipLocation.hint.credentialsConfigured')
                      : t('ipLocation.hint.phAccountId')
                "
                :maxlength="100"
                clearable
              />
            </el-form-item>
            <el-form-item :label="t('ipLocation.field.licenseKey')" prop="maxmindLicenseKey">
              <el-input
                v-model="configForm.maxmindLicenseKey"
                type="password"
                show-password
                :placeholder="
                  config.licenseKeyUnreadable
                    ? t('ipLocation.hint.phLicenseKeyUnreadable')
                    : config.maxmindLicenseKeyConfigured
                      ? t('ipLocation.hint.credentialsConfigured')
                      : t('ipLocation.hint.phLicenseKey')
                "
                :maxlength="100"
                clearable
              />
            </el-form-item>
          </div>
        </Transition>

        <el-form-item :label="t('ipLocation.field.autoUpdateEnabled')" prop="autoUpdateEnabled">
          <el-switch v-model="configForm.autoUpdateEnabled" />
          <div class="form-tip mt-1 leading-normal">
            <el-text type="info" size="small">
              {{ t('ipLocation.hint.autoUpdateTip', { cron: status?.autoUpdateCron || '-' }) }}
            </el-text>
          </div>
        </el-form-item>

        <Transition name="expand-fade">
          <el-form-item v-if="hasStoredCredentials">
            <el-checkbox v-model="configForm.clearCredentials">
              {{ t('ipLocation.field.clearCredentials') }}
            </el-checkbox>
            <div class="form-tip mt-1 leading-normal">
              <el-text type="warning" size="small">
                {{ t('ipLocation.hint.clearCredentialsTip') }}
              </el-text>
            </div>
          </el-form-item>
        </Transition>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="saving" @click="submitConfig">
            {{ t('common.save') }}
          </el-button>
          <el-button @click="cancelConfig">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 更新源选择对话框（点击"立即更新"时弹出） -->
    <el-dialog
      :close-on-click-modal="false"
      :title="t('ipLocation.title.updateNow')"
      v-model="updateOpen"
      :before-close="beforeUpdateClose"
      width="min(90%, 480px)"
      append-to-body
      destroy-on-close
    >
      <el-form label-width="120px">
        <el-form-item :label="t('ipLocation.field.updateSource')">
          <el-radio-group v-model="updateSource">
            <el-radio value="p3terx">P3TERX {{ t('ipLocation.source.mirror') }}</el-radio>
            <el-radio value="maxmind">MaxMind {{ t('ipLocation.source.official') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-alert :title="t('ipLocation.hint.updateAlert')" type="info" :closable="false" show-icon />
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="updating" @click="confirmUpdate">
            {{ t('ipLocation.btn.confirmUpdate') }}
          </el-button>
          <el-button @click="cancelUpdate">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="IpLocation">
import type { IpLocationStatus, IpLocationConfigVo, SaveConfigDto } from '@/api/monitor/ipLocation'
import {
  getIpLocationStatus,
  getIpLocationConfig,
  saveIpLocationConfig,
  updateIpLocationNow,
  reloadIpLocation,
  reloadIpXdb
} from '@/api/monitor/ipLocation'
import modal from '@/plugins/modal'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { credentialTagState, type CredentialTagState } from '@/utils/ipCredentialState'

const { t } = useI18n()
const configFormRef = useTemplateRef('configFormRef')

// 状态数据
const status = ref<IpLocationStatus | null>(null)
const config = ref<IpLocationConfigVo>({
  updateSource: 'p3terx',
  maxmindAccountIdConfigured: false,
  maxmindLicenseKeyConfigured: false,
  autoUpdateEnabled: false,
  accountIdPresent: false,
  accountIdUnreadable: false,
  licenseKeyPresent: false,
  licenseKeyUnreadable: false
})

// 加载状态
const loading = ref(false)
const refreshing = ref(false)
const reloading = ref(false)
const reloadingXdb = ref(false)
const updating = ref(false)
const saving = ref(false)
/** 任一取数失败即置位：页面不得在"状态/配置有一路没读到"时提示刷新成功。 */
const refreshError = ref(false)

// ==================== 凭据三态（b145 · N-144-I）====================
//
// 改造前两处会撒谎：① 管理配置读失败时服务端回默认档，页面显示"更新源 P3TERX / 凭据 否"，
// 把一次 sys_config 读故障显示成"这个功能没开"；② 凭据密文解不开（主密钥缺失或轮换过）
// 也被折成"否"，于是运维去重填一个库里本来就有的凭据，真故障没人看见。
// 判定口径由 `utils/ipCredentialState` 单点给出，这里只做"状态 → 显示"的映射。

/**
 * 管理配置这一路是否真读到。
 *
 * 取 `!== false` 而不是 `!!`：**只有后端明说"没读到"才报**，字段缺失按"读到了"处理。
 * 两个方向不对称的理由：这条告警是对**当前部署**的事实陈述，而老后端/fork 不带这个字段时
 * 页面并没有任何证据说它读失败——按 `!!` 写会把"我不知道"显示成"配置读不出来"，
 * 与 b90/b118 立的"失败与没有必须可区分"正好相反（那是把没有伪装成失败）。
 * 生产者侧由 `IpLocationStatus::config_available` 的 serde 断言钉住"一定带这个键"，
 * 所以这里不需要为"字段悄悄没了"再设一道哨兵。
 */
const configAvailable = computed(() => status.value?.configAvailable !== false)

const accountIdState = computed<CredentialTagState>(() =>
  credentialTagState({
    available: configAvailable.value,
    present: !!status.value?.accountIdPresent,
    unreadable: !!status.value?.accountIdUnreadable,
    configured: !!status.value?.maxmindAccountIdConfigured
  })
)
const licenseKeyState = computed<CredentialTagState>(() =>
  credentialTagState({
    available: configAvailable.value,
    present: !!status.value?.licenseKeyPresent,
    unreadable: !!status.value?.licenseKeyUnreadable,
    configured: !!status.value?.maxmindLicenseKeyConfigured
  })
)

/** 任一凭据解不开 ⇒ 顶部给一条可操作的告警（逐字段由标签说清是哪个） */
const anyCredentialUnreadable = computed(
  () => accountIdState.value === 'unreadable' || licenseKeyState.value === 'unreadable'
)

/**
 * "清空已存储凭据"这一项何时该出现：库里**有**凭据就要给出口，
 * 包括解不开的那种——改造前只看 `*Configured`（解密成功才为真），
 * 于是坏掉的密文既看不见也清不掉，唯一出路是手改参数表。
 */
const hasStoredCredentials = computed(
  () =>
    config.value.maxmindAccountIdConfigured ||
    config.value.maxmindLicenseKeyConfigured ||
    config.value.accountIdPresent ||
    config.value.licenseKeyPresent
)

function credTagType(s: CredentialTagState): 'success' | 'warning' | 'info' {
  if (s === 'configured') return 'success'
  if (s === 'unreadable') return 'warning'
  return 'info'
}

function credTagLabel(s: CredentialTagState): string {
  switch (s) {
    case 'unknown':
      return t('ipLocation.stat.configUnavailable')
    case 'unreadable':
      return t('ipLocation.stat.credentialUnreadable')
    case 'configured':
      return t('common.yes')
    default:
      return t('common.no')
  }
}

/** 更新源同理：配置没读到时不得断言"P3TERX"（那是默认值，不是事实） */
function sourceTagType(): 'warning' | 'info' {
  return status.value?.currentSource === 'maxmind' ? 'warning' : 'info'
}

function sourceTagLabel(): string {
  if (!configAvailable.value) return t('ipLocation.stat.configUnavailable')
  return status.value?.currentSource === 'maxmind'
    ? t('ipLocation.source.maxmindOfficial')
    : t('ipLocation.source.p3terxMirror')
}

// 对话框
const configOpen = ref(false)
const updateOpen = ref(false)
const updateSource = ref('p3terx')

// 配置表单
const configForm = reactive<SaveConfigDto>({
  updateSource: 'p3terx',
  maxmindAccountId: '',
  maxmindLicenseKey: '',
  autoUpdateEnabled: false,
  clearCredentials: false
})

const configRules = {
  updateSource: [{ required: true, message: t('ipLocation.validate.sourceRequired'), trigger: 'change' }]
}

// 关闭语义（b135）：配置改到一半 / 换过更新源时按 Esc、点遮罩或点 × 原先会静默丢弃
const { beforeClose: beforeConfigClose, cancel: cancelConfig } = useDialogDirtyGuard(configOpen, configForm)
const { beforeClose: beforeUpdateClose, cancel: cancelUpdate } = useDialogDirtyGuard(updateOpen, updateSource)

// ==================== 数据加载 ====================

async function loadStatus(): Promise<boolean> {
  loading.value = true
  try {
    const res = await getIpLocationStatus()
    status.value = res.data || null
    return true
  } catch {
    // 错误已由 request 拦截器统一提示；结局交回调用方（不在这里吞掉）
    refreshError.value = true
    return false
  } finally {
    loading.value = false
  }
}

async function loadConfig(): Promise<boolean> {
  try {
    const res = await getIpLocationConfig()
    if (res.data) {
      config.value = res.data
    }
    return true
  } catch {
    refreshError.value = true
    return false
  }
}

async function handleRefresh() {
  refreshing.value = true
  refreshError.value = false
  try {
    // 两路都必须真的成功才叫"刷新成功"；旧实现里两个 loader 各自吞错，
    // Promise.all 永远 resolve ⇒ 网络故障也弹成功，页面保留旧值。
    const [okStatus, okConfig] = await Promise.all([loadStatus(), loadConfig()])
    if (okStatus && okConfig) {
      modal.msgSuccess(t('common.success'))
    } else {
      refreshError.value = true
    }
  } finally {
    refreshing.value = false
  }
}

// ==================== 热加载 ====================

async function handleReload() {
  modal
    .confirm(t('ipLocation.tip.confirmReload'))
    .then(() => {
      reloading.value = true
      return reloadIpLocation()
    })
    .then(() => {
      modal.msgSuccess(t('ipLocation.tip.reloadSuccess'))
      return loadStatus()
    })
    .catch(() => {})
    .finally(() => {
      reloading.value = false
    })
}

// ==================== xdb 热加载 ====================

async function handleReloadXdb() {
  modal
    .confirm(t('ipLocation.tip.confirmReloadXdb'))
    .then(() => {
      reloadingXdb.value = true
      return reloadIpXdb()
    })
    .then(() => {
      modal.msgSuccess(t('ipLocation.tip.reloadXdbSuccess'))
      return loadStatus()
    })
    .catch(() => {})
    .finally(() => {
      reloadingXdb.value = false
    })
}

// ==================== 立即更新 ====================

function handleUpdate() {
  updateSource.value = config.value.updateSource || 'p3terx'
  updateOpen.value = true
}

async function confirmUpdate() {
  updating.value = true
  try {
    const res = await updateIpLocationNow(updateSource.value)
    if (res.data) {
      modal.msgSuccess(
        t('ipLocation.tip.updateSuccess', {
          size: formatSize(res.data.newSize),
          elapsed: res.data.elapsedSeconds.toFixed(2)
        })
      )
    } else {
      modal.msgSuccess(t('common.success'))
    }
    updateOpen.value = false
    await loadStatus()
  } catch {
    // 错误已由 request 拦截器提示
  } finally {
    updating.value = false
  }
}

// ==================== 配置保存 ====================

function handleOpenConfig() {
  // 同步当前配置到表单
  configForm.updateSource = config.value.updateSource || 'p3terx'
  configForm.maxmindAccountId = ''
  configForm.maxmindLicenseKey = ''
  configForm.autoUpdateEnabled = config.value.autoUpdateEnabled
  configForm.clearCredentials = false
  configOpen.value = true
}

async function submitConfig() {
  if (!configFormRef.value) return
  // b140（项8 C2）：占闸必须早于任何 await。原先 `saving` 排在 validate 之后，
  // 连点会各自等校验、各自通过、各自发一次保存（按钮 :loading 在第一次点击时还是 false）。
  if (saving.value) return
  saving.value = true
  try {
    // 使用 Promise 形式 validate + .catch，避免校验失败时 unhandledrejection
    const valid = await configFormRef.value.validate().catch(() => false)
    if (!valid) return

    // b145：这里**不再**本地预检"切到 maxmind 必须有凭据"。原先那段是同一件事的第二份实现，
    // 而且它只查 Account ID、不查 License Key，并把"存了但解不开"也说成"请填写凭据"——
    // 服务端现在给出的是分因的两条理由（没存过 ⇒ 去填；解不开 ⇒ 重填或清空），
    // 且拦在抢锁与任何副作用之前。后端的理由严格比前端映射更具体（b125 口径），少一份实现就少一份漂移。
    await saveIpLocationConfig({ ...configForm })
    modal.msgSuccess(t('common.success'))
    configOpen.value = false
    await Promise.all([loadStatus(), loadConfig()])
  } catch {
    // 错误已由 request 拦截器提示
  } finally {
    saving.value = false
  }
}

// ==================== 工具函数 ====================

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(2)} ${units[i]}`
}

function formatTime(timestamp: number): string {
  // 后端返回的为秒级 Unix 时间戳，需 *1000 转毫秒供 Date 构造
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 初始化加载
onMounted(() => {
  loadStatus()
  loadConfig()
})
</script>

<style scoped>
code {
  border-radius: 3px;
  font-family: 'Courier New', monospace;
}

:deep(.el-tag) {
  transition: all 0.2s ease;
}
</style>
