<template>
  <div class="app-container" v-loading="loading">
    <el-card shadow="hover" class="http-debug-card">
      <template #header>
        <div class="header-flex flex justify-between items-center">
          <span class="flex items-center gap-2">
            <el-icon><Connection /></el-icon>
            {{ t('httpDebug.title') }}
          </span>
          <el-tag type="info" size="small">{{ t('httpDebug.ssrfTag') }}</el-tag>
        </div>
      </template>

      <!-- 请求面板 -->
      <div class="request-panel">
        <div class="flex items-center gap-2 mb-4">
          <el-select v-model="form.method" class="method-select w-[130px]">
            <el-option v-for="m in ALLOWED_METHODS" :key="m" :value="m" :label="m" />
          </el-select>
          <el-input v-model="form.url" :placeholder="t('httpDebug.urlPlaceholder')" clearable />
          <el-select v-model="form.timeoutSecs" style="width: 150px">
            <el-option v-for="s in [5, 10, 20, 30]" :key="s" :value="s" :label="`${s}s`" />
          </el-select>
          <el-button type="primary" :loading="loading" @click="send">
            <el-icon class="mr-1"><Position /></el-icon>
            {{ t('httpDebug.send') }}
          </el-button>
        </div>

        <el-divider content-position="left">
          <span class="text-sm text-text-secondary">{{ t('httpDebug.headers') }}</span>
        </el-divider>
        <el-table :data="headers" size="small" border>
          <el-table-column :label="t('httpDebug.key')" min-width="200">
            <template #default="{ row }">
              <el-input v-model="row.name" :placeholder="t('httpDebug.keyPlaceholder')" size="small" />
            </template>
          </el-table-column>
          <el-table-column :label="t('httpDebug.value')" min-width="260">
            <template #default="{ row }">
              <el-input v-model="row.value" :placeholder="t('httpDebug.valuePlaceholder')" size="small" />
            </template>
          </el-table-column>
          <el-table-column :label="t('httpDebug.action')" width="90" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" icon="Delete" @click="headers.splice($index, 1)" />
            </template>
          </el-table-column>
          <template #append>
            <el-button
              class="w-full mt-2"
              link
              type="primary"
              icon="Plus"
              @click="headers.push({ name: '', value: '' })"
            >
              {{ t('httpDebug.addHeader') }}
            </el-button>
          </template>
        </el-table>

        <el-divider content-position="left">
          <span class="text-sm text-text-secondary">{{ t('httpDebug.body') }}</span>
        </el-divider>
        <el-input v-model="form.body" type="textarea" :rows="6" :placeholder="t('httpDebug.bodyPlaceholder')" />

        <div v-if="showBodyHint && allowsBody" class="mt-2 text-xs text-text-secondary">
          <el-icon><InfoFilled /></el-icon>
          {{ t('httpDebug.bodyHint') }}
        </div>
      </div>
    </el-card>

    <!-- 响应面板 -->
    <el-card v-if="result || errorMsg" shadow="hover" class="mt-5">
      <template #header>
        <div class="header-flex flex justify-between items-center">
          <span>
            <el-icon><DArrowRight /></el-icon>
            {{ t('httpDebug.response') }}
          </span>
          <el-button link type="primary" size="small" @click="copyResponse">
            <el-icon class="mr-1"><DocumentCopy /></el-icon>
            {{ t('httpDebug.copy') }}
          </el-button>
        </div>
      </template>

      <template v-if="errorMsg">
        <el-alert type="danger" :title="errorMsg" :closable="false" show-icon />
      </template>

      <template v-else-if="result">
        <div class="flex flex-wrap items-center gap-4 mb-4">
          <el-tag :type="statusTagType" size="large">{{ result.status }} {{ result.statusText || '' }}</el-tag>
          <el-tag type="info">
            <el-icon class="mr-1"><Clock /></el-icon>
            {{ result.timeMs }} ms
          </el-tag>
          <el-tag type="info">
            <el-icon class="mr-1"><ScaleToOriginal /></el-icon>
            {{ formatSize(result.sizeBytes) }}
          </el-tag>
          <el-tag v-if="result.redirected > 0" type="warning">
            {{ t('httpDebug.redirects', { n: result.redirected }) }}
          </el-tag>
        </div>

        <el-descriptions v-if="result.headers.length" :column="1" border size="small" class="mb-4">
          <el-descriptions-item v-for="h in result.headers" :key="h.name + ':' + h.value" :label="h.name">
            {{ h.value }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="result.body" class="response-body">
          <el-scrollbar max-height="420px">
            <pre class="body-pre">{{ result.body }}</pre>
          </el-scrollbar>
        </div>
        <el-alert v-else type="info" :title="t('httpDebug.emptyBody')" :closable="false" show-icon />
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="ToolHttpDebug">
import {
  Connection,
  Position,
  DArrowRight,
  Clock,
  ScaleToOriginal,
  DocumentCopy,
  InfoFilled
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { ALLOWED_METHODS, executeHttpDebug, type HttpDebugHeader, type HttpDebugResult } from '@/api/tool/httpDebug'
import { errorHub } from '@/utils/errorHub'

const { t } = useI18n()

const loading = ref(false)
const headers = ref<HttpDebugHeader[]>([{ name: 'Accept', value: '*/*' }])
const form = reactive<{ method: string; url: string; body?: string; timeoutSecs: number }>({
  method: 'GET',
  url: 'https://httpbin.org/get',
  body: '',
  timeoutSecs: 10
})
const result = ref<HttpDebugResult | null>(null)
const errorMsg = ref('')

const allowsBody = computed(() => !['GET', 'HEAD', 'OPTIONS'].includes(form.method))
// body 文本框有非空内容时展示提示（GET/HEAD/OPTIONS 将被服务端忽略）
const showBodyHint = computed(() => !!form.body && !allowsBody.value)

const statusTagType = computed<'success' | 'danger' | 'info'>(() => {
  if (!result.value) return 'info'
  const s = result.value.status
  if (s >= 200 && s < 300) return 'success'
  if (s >= 400) return 'danger'
  return 'info'
})

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return bytes + ' B'
}

async function send(): Promise<void> {
  const url = form.url.trim()
  if (!url) {
    errorHub.report('warning', 'other', t('httpDebug.urlRequired'))
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    errorHub.report('warning', 'other', t('httpDebug.urlSchemeInvalid'))
    return
  }
  loading.value = true
  errorMsg.value = ''
  result.value = null
  try {
    const resp = await executeHttpDebug({
      method: form.method,
      url,
      headers: headers.value.filter((h: HttpDebugHeader) => h.name.trim()),
      body: allowsBody.value ? form.body : undefined,
      timeoutSecs: form.timeoutSecs
    })
    const data = resp.data
    if (data && data.error) {
      // 传输层错误：status=0（连接被拒/超时），以错误姿态展示
      errorMsg.value = t('httpDebug.transportError', { detail: data.error })
    } else if (data) {
      result.value = data
    }
  } catch (e) {
    // SSRF 拒绝 / 参数非法 → 400 由 request 拦截器弹出错误；此处兜底展示
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function copyResponse(): Promise<void> {
  const payload = result.value
    ? `${result.value.status} ${result.value.statusText || ''}\n\n${result.value.body}`
    : errorMsg.value
  try {
    await navigator.clipboard.writeText(payload)
    ElMessage.success(t('httpDebug.copied'))
  } catch {
    errorHub.report('error', 'other', t('httpDebug.copyFail'))
  }
}
</script>

<style lang="scss" scoped>
.http-debug-card {
  .request-panel {
    .method-select :deep(.el-select__wrapper) {
      font-weight: 600;
    }
  }
}

.response-body {
  .body-pre {
    margin: 0;
    padding: 12px;
    border-radius: 6px;
    background: var(--el-fill-color-light);
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
</style>
