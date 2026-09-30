<template>
  <el-dialog
    :title="t('frontendError.detail.title')"
    v-model="dialogVisible"
    width="min(80%, 720px)"
    append-to-body
    destroy-on-close
  >
    <div class="detail-wrap">
      <!-- 基本信息 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><InfoFilled /></el-icon>
          {{ t('frontendError.detail.basicInfo') }}
        </div>
        <el-row class="detail-row">
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('frontendError.detail.level') }}</span>
              <span class="detail-value">
                <el-tag :type="levelTagType(form.level)" size="small">{{ levelLabel(form.level) }}</el-tag>
              </span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('frontendError.detail.source') }}</span>
              <span class="detail-value">{{ sourceLabel(form.source) }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row class="detail-row">
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('frontendError.detail.name') }}</span>
              <span class="detail-value mono">{{ form.name || '-' }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('frontendError.detail.createTime') }}</span>
              <span class="detail-value">{{ parseTime(form.createTime) }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row class="detail-row">
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('frontendError.detail.userName') }}</span>
              <span class="detail-value">{{ form.userName || '-' }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('frontendError.detail.viewport') }}</span>
              <span class="detail-value">
                {{ form.viewWidth && form.viewHeight ? `${form.viewWidth} × ${form.viewHeight}` : '-' }}
              </span>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 性能指标（仅 vital 记录展示） -->
      <div class="detail-card" v-if="form.source === 'vital'">
        <div class="detail-card-title">
          <el-icon><TrendCharts /></el-icon>
          {{ t('frontendError.detail.vitalInfo') }}
        </div>
        <el-row class="detail-row">
          <el-col :span="24">
            <div class="detail-item">
              <span class="detail-label">{{ t('frontendError.detail.value') }}</span>
              <span class="detail-value mono">{{ vitalText }}</span>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 发生页面 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><Link /></el-icon>
          {{ t('frontendError.detail.pageUrl') }}
        </div>
        <div class="detail-item">
          <span class="detail-value break-all mono">{{ form.pageUrl || '-' }}</span>
        </div>
        <div class="detail-item mt-2">
          <span class="detail-label">{{ t('frontendError.detail.userAgent') }}</span>
          <span class="detail-value break-all text-xs">{{ form.userAgent || '-' }}</span>
        </div>
      </div>

      <!-- 信息 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><ChatLineSquare /></el-icon>
          {{ t('frontendError.detail.message') }}
        </div>
        <div class="code-wrap">
          <div class="code-action">
            <el-button size="small" :icon="CopyDocument" @click="copyText(form.message)">
              {{ t('frontendError.detail.copy') }}
            </el-button>
          </div>
          <pre class="code-pre">{{ form.message || t('frontendError.detail.noData') }}</pre>
        </div>
      </div>

      <!-- 堆栈（errors） -->
      <div class="detail-card" v-if="form.stack">
        <div class="detail-card-title">
          <el-icon><Document /></el-icon>
          {{ t('frontendError.detail.stack') }}
        </div>
        <div class="code-wrap">
          <div class="code-action">
            <el-button size="small" :icon="CopyDocument" @click="copyText(form.stack)">
              {{ t('frontendError.detail.copy') }}
            </el-button>
          </div>
          <pre class="code-pre">{{ form.stack }}</pre>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue'
import modal from '@/plugins/modal'
import type { SysFrontendError } from '@/types/api/monitor/frontendError'

const { t, te } = useI18n()

const props = defineProps<{
  row: SysFrontendError
}>()

const dialogVisible = defineModel<boolean>('visible')

const form = computed<SysFrontendError>(() => props.row || {})

function levelLabel(level?: string): string {
  if (!level) return '-'
  const key = `frontendError.level.${level}`
  return te(key) ? t(key) : level
}
function levelTagType(level?: string): 'danger' | 'warning' | 'info' {
  if (level === 'error') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}
function sourceLabel(source?: string): string {
  if (!source) return '-'
  const key = `frontendError.source.${source}`
  return te(key) ? t(key) : source
}

// CLS 是分数，其余指标单位为毫秒
const vitalText = computed<string>(() => {
  const v = form.value.value
  if (v == null) return '-'
  if (form.value.name === 'CLS') return String(Math.round(v * 1000) / 1000)
  return `${Math.round(v)} ms`
})

function copyText(str?: string): void {
  const text = str || ''
  if (!text) return
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => modal.msgSuccess(t('common.copySuccess')))
      .catch(() => modal.msgError(t('common.copyFail')))
  } else {
    // 已废弃：仅在 navigator.clipboard 不可用时降级
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    modal.msgSuccess(t('common.copySuccess'))
  }
}
</script>

<style scoped>
.mono {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
}
.break-all {
  word-break: break-all;
}
.detail-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
}
.detail-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
}
.detail-row {
  margin-bottom: 8px;
}
.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detail-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.detail-value {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.code-wrap {
  position: relative;
}
.code-action {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
}
.code-pre {
  margin: 0;
  padding: 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow: auto;
}
</style>
