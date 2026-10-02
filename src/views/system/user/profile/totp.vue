<template>
  <el-card class="totp-card" shadow="hover">
    <template #header>
      <div class="flex items-center gap-3">
        <span>
          <el-icon><Lock /></el-icon>
          {{ t('profile.mfaSetting') }}
        </span>
        <el-tag v-if="status.enabled" type="success">{{ t('profile.totp.enabled') }}</el-tag>
        <el-tag v-else type="info">{{ t('profile.totp.disabled') }}</el-tag>
      </div>
    </template>

    <Transition mode="out-in" name="fade-slide">
      <!-- 已启用 TOTP 状态 -->
      <div v-if="status.enabled && !showDisable" key="enabled" class="enabled-state">
        <el-alert :title="t('profile.totp.enabledTip')" type="success" :closable="false" show-icon>
          <template #default>
            <p>{{ t('profile.totp.enabledDesc') }}</p>
          </template>
        </el-alert>
        <el-button type="danger" plain icon="Close" @click="showDisable = true" class="mt20">
          {{ t('profile.totp.disabled') }}
        </el-button>
      </div>

      <!-- 关闭 TOTP 表单 -->
      <div v-else-if="status.enabled && showDisable" key="disabling" class="disable-form">
        <el-form ref="disableRef" :model="disableForm" :rules="disableRules" label-width="120px">
          <el-form-item :label="t('register.password')" prop="password">
            <el-input
              v-model="disableForm.password"
              type="password"
              :placeholder="t('lock.passwordPlaceholder')"
              :maxlength="20"
              show-password
            />
          </el-form-item>
          <el-form-item :label="t('login.code')" prop="code">
            <el-input v-model="disableForm.code" :placeholder="t('profile.totp.codePlaceholder')" maxlength="6" />
          </el-form-item>
          <el-form-item>
            <el-button type="danger" :loading="disableLoading" @click="handleDisable">
              {{ t('common.confirm') }}
            </el-button>
            <el-button @click="showDisable = false">{{ t('common.cancel') }}</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 未启用 TOTP - 引导流程 -->
      <div v-else key="setup" class="setup-state">
        <el-steps :active="stepActive" align-center class="mb20">
          <el-step :title="t('profile.totp.step1')" />
          <el-step :title="t('profile.totp.step2')" />
          <el-step :title="t('profile.totp.step3')" />
        </el-steps>

        <Transition mode="out-in" name="fade">
          <!-- Step 1: 生成密钥 -->
          <div v-if="stepActive === 0" key="step1" class="text-center">
            <p class="mb20">{{ t('profile.totp.setupIntro') }}</p>
            <el-button type="primary" size="large" :loading="setupLoading" @click="handleSetup">
              <el-icon><Key /></el-icon>
              {{ t('profile.totp.step1') }}
            </el-button>
          </div>

          <!-- Step 2: 扫码绑定 -->
          <div v-else-if="stepActive === 1" key="step2" class="qr-section">
            <el-row :gutter="20">
              <el-col :span="12" class="text-center">
                <p class="text-text-regular mb-3">{{ t('profile.totp.scanQrTip') }}</p>
                <img
                  v-if="setupData.qrCode"
                  :src="setupData.qrCode"
                  alt="TOTP QR Code"
                  class="w-[200px] h-[200px] border border-border-light p-2 rounded"
                  loading="lazy"
                />
              </el-col>
              <el-col :span="12">
                <p class="text-text-regular mb-3">{{ t('profile.totp.manualInputTip') }}</p>
                <el-input :model-value="setupData.secret" readonly>
                  <template #append>
                    <el-button icon="DocumentCopy" v-copyText="setupData.secret" v-copyText:callback="copySuccess">
                      {{ t('common.copy') }}
                    </el-button>
                  </template>
                </el-input>
                <el-alert type="info" :closable="false" class="mt20">
                  <template #default>
                    <ol>
                      <li>{{ t('profile.totp.manualStep1') }}</li>
                      <li>{{ t('profile.totp.manualStep2') }}</li>
                      <li>{{ t('profile.totp.manualStep3') }}</li>
                      <li>{{ t('profile.totp.manualStep4') }}</li>
                    </ol>
                  </template>
                </el-alert>
              </el-col>
            </el-row>
            <div class="text-center mt20">
              <el-button type="primary" @click="stepActive = 2">{{ t('common.confirm') }}</el-button>
            </div>
          </div>

          <!-- Step 3: 验证启用 -->
          <div v-else key="step3" class="verify-section">
            <el-form ref="verifyRef" :model="verifyForm" :rules="verifyRules" label-width="120px">
              <el-form-item :label="t('login.code')" prop="code">
                <el-input v-model="verifyForm.code" :placeholder="t('profile.totp.codePlaceholder')" maxlength="6" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="verifyLoading" @click="handleVerify">
                  {{ t('profile.totp.step3') }}
                </el-button>
                <el-button @click="stepActive = 1">{{ t('common.back') }}</el-button>
              </el-form-item>
            </el-form>
          </div>
        </Transition>
      </div>
    </Transition>
  </el-card>
</template>

<script setup lang="ts" name="TotpSetting">
import { Lock, Key } from '@element-plus/icons-vue'
import { setupTotp, verifyTotp, getTotpStatus, disableTotp } from '@/api/system/totp'
import type { TotpSetupResponse, TotpStatusResponse } from '@/api/system/totp'
import modal from '@/plugins/modal'
import type { FormInstance, FormRules } from 'element-plus'

const { t } = useI18n()

const status = ref<TotpStatusResponse>({ enabled: false })
const setupData = ref<TotpSetupResponse>({ secret: '', otpauthUrl: '', qrCode: '' })
const stepActive = ref(0)
const setupLoading = ref(false)
const verifyLoading = ref(false)
const disableLoading = ref(false)
const showDisable = ref(false)

const verifyRef = useTemplateRef<FormInstance>('verifyRef')
const disableRef = useTemplateRef<FormInstance>('disableRef')

const verifyForm = reactive({ secret: '', code: '' })
const disableForm = reactive({ password: '', code: '' })

const verifyRules: FormRules = {
  code: [
    { required: true, message: t('profile.totp.codeRequired'), trigger: 'blur' },
    { min: 6, max: 6, message: t('profile.totp.codeRule'), trigger: 'blur' }
  ]
}

const disableRules: FormRules = {
  password: [{ required: true, message: t('profile.totp.passwordRequired'), trigger: 'blur' }],
  code: [
    { required: true, message: t('profile.totp.codeRequired'), trigger: 'blur' },
    { min: 6, max: 6, message: t('profile.totp.codeRule'), trigger: 'blur' }
  ]
}

async function loadStatus(): Promise<void> {
  try {
    const res = await getTotpStatus()
    status.value = res.data || { enabled: false }
  } catch (err) {
    if (import.meta.env.DEV) console.error('[TOTP] Failed to load status:', err)
  }
}

async function handleSetup(): Promise<void> {
  setupLoading.value = true
  try {
    const res = await setupTotp()
    setupData.value = res.data || { secret: '', otpauthUrl: '', qrCode: '' }
    verifyForm.secret = setupData.value.secret
    stepActive.value = 1
    modal.msgSuccess(t('profile.totp.keyGenSuccess'))
  } catch (err) {
    if (import.meta.env.DEV) console.error('[TOTP] Failed to generate secret:', err)
    modal.msgError(t('profile.totp.keyGenFail'))
  } finally {
    setupLoading.value = false
  }
}

async function handleVerify(): Promise<void> {
  if (!verifyRef.value) return
  await verifyRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    verifyLoading.value = true
    try {
      await verifyTotp(verifyForm.code, verifyForm.secret)
      modal.msgSuccess(t('profile.totp.enableSuccess'))
      status.value.enabled = true
      stepActive.value = 0
      verifyForm.code = ''
      verifyForm.secret = ''
    } catch (err) {
      if (import.meta.env.DEV) console.error('[TOTP] Verification failed:', err)
    } finally {
      verifyLoading.value = false
    }
  })
}

async function handleDisable(): Promise<void> {
  if (!disableRef.value) return
  await disableRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    disableLoading.value = true
    try {
      await disableTotp(disableForm.password, disableForm.code)
      modal.msgSuccess(t('profile.totp.disableSuccess'))
      status.value.enabled = false
      showDisable.value = false
      disableForm.password = ''
      disableForm.code = ''
    } catch (err) {
      if (import.meta.env.DEV) console.error('[TOTP] Disable failed:', err)
    } finally {
      disableLoading.value = false
    }
  })
}

function copySuccess(): void {
  modal.msgSuccess(t('profile.totp.keyCopied'))
}

onMounted(loadStatus)
</script>
