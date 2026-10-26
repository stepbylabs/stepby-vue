<template>
  <div class="app-container p-4" v-loading="loading">
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="card-header flex items-center justify-between font-medium">
          <span class="flex items-center gap-1.5">
            <el-icon><Setting /></el-icon>
            {{ t('aiConfig.title') }}
          </span>
          <div class="flex items-center gap-3">
            <el-button :loading="testing" type="warning" plain icon="Connection" @click="onTest">
              {{ t('aiConfig.btn.test') }}
            </el-button>
            <el-button
              type="primary"
              icon="Check"
              :loading="saving"
              :disabled="!loaded"
              v-hasPermi="['system:aiConfig:edit']"
              @click="onSave"
            >
              {{ t('common.save') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-alert :title="t('aiConfig.tip.dualSource')" type="info" :closable="false" class="mb-4" />
      <el-alert v-if="loadError" type="error" :closable="false" class="mb-4" data-test="ai-config-load-error">
        <template #title>
          <div class="flex items-center justify-between">
            <span>{{ t('aiConfig.loadFailed') }}</span>
            <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
          </div>
        </template>
      </el-alert>

      <el-form label-width="180px" class="max-w-[720px]" :disabled="!loaded">
        <el-form-item :label="t('aiConfig.field.enabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item :label="t('aiConfig.field.provider')">
          <el-select v-model="form.provider" class="w-[280px]">
            <el-option :label="t('aiConfig.provider.openai')" value="openai" />
            <el-option :label="t('aiConfig.provider.custom')" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('aiConfig.field.baseUrl')">
          <el-input
            v-model="form.baseUrl"
            :placeholder="t('aiConfig.ph.baseUrl')"
            class="w-[420px]"
            :aria-label="t('aiConfig.ph.baseUrl')"
          />
        </el-form-item>
        <el-form-item :label="t('aiConfig.field.apiKey')">
          <el-input
            v-model="apiKeyInput"
            type="password"
            show-password
            :placeholder="hasKey ? t('aiConfig.ph.apiKeyKeep') : t('aiConfig.ph.apiKeyNew')"
            class="w-[420px]"
          />
          <div v-if="hasKey" class="text-xs text-text-secondary mt-1 w-[420px]">
            {{ t('aiConfig.tip.apiKeyMasked', { masked: maskedKey }) }}
          </div>
        </el-form-item>
        <el-form-item :label="t('aiConfig.field.model')">
          <el-input v-model="form.model" class="w-[280px]" />
        </el-form-item>
        <el-form-item :label="t('aiConfig.field.allowedTables')">
          <el-select
            v-model="form.allowedTables"
            multiple
            filterable
            allow-create
            default-first-option
            :placeholder="t('aiConfig.ph.allowedTables')"
            class="w-[520px]"
            :aria-label="t('aiConfig.ph.allowedTables')"
          >
            <el-option v-for="tb in tableOptions" :key="tb" :label="tb" :value="tb" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="AiConfig">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { getAiConfig, testAiConfig, updateAiConfig } from '@/api/system/aiConfig'

const { t } = useI18n()
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const hasKey = ref(false)
const maskedKey = ref('')
/** 服务端配置是否已成功读到：未读到就不允许保存——否则表单里的默认值
 * （enabled=false、空 baseUrl/model）会被当成用户输入写回 `sys.ai.*`，
 * 一次加载失败就能把整段 AI 配置清空并关闭。 */
const loaded = ref(false)
const loadError = ref(false)
const tableOptions = ref<string[]>([
  'sys_user',
  'sys_dept',
  'sys_role',
  'sys_post',
  'sys_config',
  'sys_dict_type',
  'sys_dict_data'
])

const form = ref({
  enabled: false,
  provider: 'openai',
  baseUrl: '',
  model: '',
  allowedTables: [] as string[]
})
const apiKeyInput = ref('')

async function load() {
  loading.value = true
  loaded.value = false
  loadError.value = false
  try {
    const res = await getAiConfig()
    const vo = res.data
    if (vo) {
      form.value.enabled = vo.enabled
      form.value.provider = vo.provider
      form.value.baseUrl = vo.baseUrl
      form.value.model = vo.model
      form.value.allowedTables = [...vo.allowedTables]
      hasKey.value = vo.hasApiKey
      maskedKey.value = vo.apiKeyMasked
      // 候选下拉合并服务端白名单
      for (const tb of vo.allowedTables) {
        if (!tableOptions.value.includes(tb)) tableOptions.value.push(tb)
      }
      loaded.value = true
    } else {
      loadError.value = true
    }
  } catch (e) {
    loadError.value = true
    if (import.meta.env.DEV) console.error('[aiConfig] load failed:', e)
  } finally {
    loading.value = false
  }
}

async function onSave() {
  if (!loaded.value) return
  saving.value = true
  try {
    await updateAiConfig({
      enabled: form.value.enabled,
      provider: form.value.provider,
      baseUrl: form.value.baseUrl.trim(),
      // 留空 = 保留原值（不覆盖已存密文）
      apiKey: apiKeyInput.value.trim(),
      model: form.value.model.trim(),
      allowedTables: form.value.allowedTables
    })
    ElMessage.success(t('common.saveSuccess'))
    await load()
    apiKeyInput.value = ''
  } catch {
    // request 拦截器已统一弹错误
  } finally {
    saving.value = false
  }
}

async function onTest() {
  testing.value = true
  try {
    const res = await testAiConfig()
    ElMessage.success(res.msg || t('aiConfig.tip.testOk'))
  } catch {
    // 拦截器已弹错误摘要
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>
