<template>
  <div class="app-container p-4">
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="card-header flex items-center justify-between font-medium">
          <span class="flex items-center gap-1.5">
            <el-icon><Upload /></el-icon>
            {{ t('uploadConfig.title') }}
          </span>
          <div class="flex items-center gap-3">
            <el-button :loading="testing" type="warning" plain icon="Connection" @click="onTest">
              {{ t('uploadConfig.btn.test') }}
            </el-button>
            <el-button
              type="primary"
              icon="Check"
              :loading="saving"
              v-hasPermi="['system:uploadConfig:edit']"
              @click="onSave"
            >
              {{ t('common.save') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        :title="t('uploadConfig.tip.dualSource')"
        type="info"
        :closable="false"
        class="mb-4"
      />
      <el-alert
        :title="t('uploadConfig.tip.mode', { mode: vo?.backendMode ?? 'local' })"
        :type="vo?.backendMode === 's3' ? 'success' : 'warning'"
        :closable="false"
        class="mb-4"
      />

      <el-form label-width="180px" class="max-w-[720px]">
        <el-form-item :label="t('uploadConfig.field.accessKey')">
          <el-input
            v-model="accessKeyInput"
            :placeholder="vo?.hasAccessKey ? t('uploadConfig.ph.keyKeep') : t('uploadConfig.ph.keyNew')"
            class="w-[420px]"
          />
          <div v-if="vo?.hasAccessKey" class="text-xs text-text-secondary mt-1 w-[420px]">
            {{ t('uploadConfig.tip.keyMasked', { masked: vo.accessKeyMasked }) }}
          </div>
        </el-form-item>
        <el-form-item :label="t('uploadConfig.field.secretKey')">
          <el-input
            v-model="secretKeyInput"
            type="password"
            show-password
            :placeholder="vo?.hasSecretKey ? t('uploadConfig.ph.keyKeep') : t('uploadConfig.ph.keyNew')"
            class="w-[420px]"
          />
          <div v-if="vo?.hasSecretKey" class="text-xs text-text-secondary mt-1 w-[420px]">
            {{ t('uploadConfig.tip.keyMasked', { masked: vo.secretKeyMasked }) }}
          </div>
        </el-form-item>
        <el-form-item :label="t('uploadConfig.field.endpoint')">
          <el-input
            v-model="form.endpoint"
            :placeholder="t('uploadConfig.ph.endpoint')"
            class="w-[420px]"
          />
        </el-form-item>
        <el-form-item :label="t('uploadConfig.field.region')">
          <el-input v-model="form.region" class="w-[280px]" />
        </el-form-item>
        <el-form-item :label="t('uploadConfig.field.bucket')">
          <el-input v-model="form.bucket" class="w-[280px]" />
        </el-form-item>
        <el-form-item :label="t('uploadConfig.field.pathStyle')">
          <el-switch v-model="form.pathStyle" />
          <div class="text-xs text-text-secondary ml-3">{{ t('uploadConfig.tip.pathStyle') }}</div>
        </el-form-item>
        <el-form-item :label="t('uploadConfig.field.publicEndpoint')">
          <el-input
            v-model="form.publicEndpoint"
            :placeholder="t('uploadConfig.ph.publicEndpoint')"
            class="w-[420px]"
          />
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="UploadConfig">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import {
  getUploadConfig,
  testUploadConfig,
  updateUploadConfig,
  type UploadConfigMaskedVo
} from '@/api/system/uploadConfig'

const { t } = useI18n()
const saving = ref(false)
const testing = ref(false)
const vo = ref<UploadConfigMaskedVo | null>(null)
const accessKeyInput = ref('')
const secretKeyInput = ref('')

const form = ref({
  endpoint: '',
  region: '',
  bucket: '',
  pathStyle: true,
  publicEndpoint: ''
})

async function load() {
  try {
    const res = await getUploadConfig()
    if (res.data) {
      vo.value = res.data
      form.value.endpoint = res.data.endpoint
      form.value.region = res.data.region
      form.value.bucket = res.data.bucket
      form.value.pathStyle = res.data.pathStyle
      form.value.publicEndpoint = res.data.publicEndpoint
    }
  } catch (e) {
    if (import.meta.env.DEV) console.error('[uploadConfig] load failed:', e)
  }
}

async function onSave() {
  saving.value = true
  try {
    await updateUploadConfig({
      // 留空 = 保留原值（不覆盖已存密文）
      accessKey: accessKeyInput.value.trim(),
      secretKey: secretKeyInput.value.trim(),
      endpoint: form.value.endpoint.trim(),
      region: form.value.region.trim(),
      bucket: form.value.bucket.trim(),
      pathStyle: form.value.pathStyle,
      publicEndpoint: form.value.publicEndpoint.trim()
    })
    ElMessage.success(t('common.saveSuccess'))
    accessKeyInput.value = ''
    secretKeyInput.value = ''
    await load()
  } catch {
    // request 拦截器已统一弹错误
  } finally {
    saving.value = false
  }
}

async function onTest() {
  testing.value = true
  try {
    const res = await testUploadConfig()
    ElMessage.success(res.data || res.msg || t('uploadConfig.tip.testOk'))
  } catch {
    // 拦截器已弹错误摘要
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>
