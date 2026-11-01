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
            <el-button :loading="testing" type="warning" plain icon="Connection" :disabled="!loaded" @click="onTest">
              {{ t('uploadConfig.btn.test') }}
            </el-button>
            <el-button
              type="primary"
              icon="Check"
              :loading="saving"
              :disabled="!loaded"
              v-hasPermi="['system:uploadConfig:edit']"
              @click="onSave"
            >
              {{ t('common.save') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-alert :title="t('uploadConfig.tip.dualSource')" type="info" :closable="false" class="mb-4" />
      <el-alert
        :title="t('uploadConfig.tip.mode', { mode: vo?.backendMode ?? 'local' })"
        :type="vo?.backendMode === 's3' ? 'success' : 'warning'"
        :closable="false"
        class="mb-4"
      />

      <el-alert v-if="loadError" type="error" :closable="false" class="mb-4" data-test="upload-config-load-error">
        <template #title>
          <div class="flex items-center justify-between">
            <span>{{ t('uploadConfig.loadFailed') }}</span>
            <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
          </div>
        </template>
      </el-alert>

      <el-empty v-if="!loading && !loadError && !vo" :description="t('common.noData')" class="mt-2" />
      <el-form v-loading="loading" label-width="180px" class="max-w-[720px]" :disabled="!loaded">
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
            :aria-label="t('uploadConfig.ph.endpoint')"
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
            :aria-label="t('uploadConfig.ph.publicEndpoint')"
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
  buildCredentialPatch,
  getUploadConfig,
  testUploadConfig,
  updateUploadConfig,
  type UploadConfigMaskedVo,
  type UploadConfigUpdateForm
} from '@/api/system/uploadConfig'

const { t } = useI18n()
const saving = ref(false)
const testing = ref(false)
const loading = ref(false)
const vo = ref<UploadConfigMaskedVo | null>(null)
/** 服务端配置是否已成功读到：未读到就不允许保存——否则表单里的空默认值
 * （endpoint/region/bucket 全空）会被写回 `sys.upload.s3.*`，把上传链路打瘫；
 * 同时 `el-empty` 只在"读成功但没有数据"时出现，失败不得伪装成"暂无数据"。 */
const loaded = ref(false)
const loadError = ref(false)
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
  loading.value = true
  loaded.value = false
  loadError.value = false
  try {
    const res = await getUploadConfig()
    if (res.data) {
      vo.value = res.data
      form.value.endpoint = res.data.endpoint
      form.value.region = res.data.region
      form.value.bucket = res.data.bucket
      form.value.pathStyle = res.data.pathStyle
      form.value.publicEndpoint = res.data.publicEndpoint
      loaded.value = true
    }
  } catch (e) {
    loadError.value = true
    if (import.meta.env.DEV) console.error('[uploadConfig] load failed:', e)
  } finally {
    loading.value = false
  }
}

/**
 * 屏上这份草稿 = 保存要发的载荷 = 测试要发的载荷。
 *
 * 三者必须同源：一处一份实现时，「测试通过」与「保存生效」就可以是两个答案
 * （这正是改造前那句"测试只测已存配置"的病根）。凭据留空经
 * `buildCredentialPatch` 折算成「不发这个字段」，与后端"不带=不动那一列"同口径。
 */
function draftPayload(): UploadConfigUpdateForm {
  return {
    ...buildCredentialPatch(accessKeyInput.value, secretKeyInput.value),
    endpoint: form.value.endpoint.trim(),
    region: form.value.region.trim(),
    bucket: form.value.bucket.trim(),
    pathStyle: form.value.pathStyle,
    publicEndpoint: form.value.publicEndpoint.trim()
  }
}

async function onSave() {
  if (!loaded.value) return
  saving.value = true
  try {
    await updateUploadConfig(draftPayload())
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
  // 未读到服务端配置 ⇒ 表单里的空默认值不是"用户清空了这些字段"，而是"还不知道"，
  // 拿它当草稿探活会得到一句与真实配置无关的结论。与保存同一道闸（按钮同时禁用）。
  if (!loaded.value) return
  testing.value = true
  try {
    const res = await testUploadConfig(draftPayload())
    ElMessage.success(res.data || res.msg || t('uploadConfig.tip.testOk'))
  } catch {
    // 拦截器已弹错误摘要
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>
