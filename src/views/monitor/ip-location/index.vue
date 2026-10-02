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
            <el-tag :type="status?.currentSource === 'maxmind' ? 'warning' : 'info'" size="large">
              {{ status?.currentSource === 'maxmind' ? 'MaxMind' : 'P3TERX' }}
            </el-tag>
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
          <el-tag :type="status?.currentSource === 'maxmind' ? 'warning' : 'info'" size="small">
            {{
              status?.currentSource === 'maxmind'
                ? t('ipLocation.source.maxmindOfficial')
                : t('ipLocation.source.p3terxMirror')
            }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.maxmindAccountId')">
          <el-tag :type="status?.maxmindAccountIdConfigured ? 'success' : 'info'" size="small">
            {{ status?.maxmindAccountIdConfigured ? t('common.yes') : t('common.no') }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('ipLocation.field.maxmindLicenseKey')">
          <el-tag :type="status?.maxmindLicenseKeyConfigured ? 'success' : 'info'" size="small">
            {{ status?.maxmindLicenseKeyConfigured ? t('common.yes') : t('common.no') }}
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
      :title="t('ipLocation.title.config')"
      v-model="configOpen"
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
                  config.maxmindAccountIdConfigured
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
                  config.maxmindLicenseKeyConfigured
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
          <el-form-item v-if="config.maxmindAccountIdConfigured || config.maxmindLicenseKeyConfigured">
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
          <el-button @click="configOpen = false">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 更新源选择对话框（点击"立即更新"时弹出） -->
    <el-dialog
      :title="t('ipLocation.title.updateNow')"
      v-model="updateOpen"
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
          <el-button @click="updateOpen = false">{{ t('common.cancel') }}</el-button>
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
  reloadIpLocation
} from '@/api/monitor/ipLocation'
import modal from '@/plugins/modal'

const { t } = useI18n()
const configFormRef = useTemplateRef('configFormRef')

// 状态数据
const status = ref<IpLocationStatus | null>(null)
const config = ref<IpLocationConfigVo>({
  updateSource: 'p3terx',
  maxmindAccountIdConfigured: false,
  maxmindLicenseKeyConfigured: false,
  autoUpdateEnabled: false
})

// 加载状态
const loading = ref(false)
const refreshing = ref(false)
const reloading = ref(false)
const updating = ref(false)
const saving = ref(false)

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

// ==================== 数据加载 ====================

async function loadStatus() {
  loading.value = true
  try {
    const res = await getIpLocationStatus()
    status.value = res.data || null
  } catch {
    // 错误已由 request 拦截器统一提示
  } finally {
    loading.value = false
  }
}

async function loadConfig() {
  try {
    const res = await getIpLocationConfig()
    if (res.data) {
      config.value = res.data
    }
  } catch {
    // 忽略
  }
}

async function handleRefresh() {
  refreshing.value = true
  try {
    await Promise.all([loadStatus(), loadConfig()])
    modal.msgSuccess(t('common.success'))
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
  // 使用 Promise 形式 validate + .catch，避免校验失败时 unhandledrejection
  const valid = await configFormRef.value.validate().catch(() => false)
  if (!valid) return

  // 切换到 maxmind 时若凭据未配置且表单也空，提示
  if (
    configForm.updateSource === 'maxmind' &&
    !configForm.clearCredentials &&
    !config.value.maxmindAccountIdConfigured &&
    !configForm.maxmindAccountId
  ) {
    modal.msgWarning(t('ipLocation.validate.maxmindCredentialsRequired'))
    return
  }

  saving.value = true
  try {
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
