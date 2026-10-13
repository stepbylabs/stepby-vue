<template>
  <el-dialog
    :title="t('operlog.detail.title')"
    v-model="dialogVisible"
    width="min(80%, 780px)"
    append-to-body
    destroy-on-close
  >
    <div class="detail-wrap">
      <!-- 基本信息 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><InfoFilled /></el-icon>
          {{ t('operlog.detail.basicInfo') }}
        </div>
        <el-row class="detail-row">
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.operModule') }}</span>
              <span class="detail-value">{{ formatModuleTitle(form.title) }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.businessType') }}</span>
              <span class="detail-value">{{ typeLabel }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row class="detail-row">
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.operTime') }}</span>
              <span class="detail-value">{{ form.operTime }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.execStatus') }}</span>
              <Transition mode="out-in" name="fade">
                <el-tag v-if="form.status === 0" key="success" type="success" size="small">
                  {{ t('operlog.detail.normal') }}
                </el-tag>
                <el-tag v-else key="fail" type="danger" size="small">{{ t('operlog.detail.abnormal') }}</el-tag>
              </Transition>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 操作人员 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><User /></el-icon>
          {{ t('operlog.detail.operUser') }}
        </div>
        <el-row class="detail-row">
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.operUser') }}</span>
              <span class="detail-value">{{ form.operName }}</span>
            </div>
          </el-col>
          <el-col :span="12" v-if="form.deptName">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.dept') }}</span>
              <span class="detail-value">{{ form.deptName }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row class="detail-row">
          <el-col :span="24">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.operAddress') }}</span>
              <span class="detail-value">
                {{ form.operIp }}&nbsp;&nbsp;
                <span class="detail-location">{{ form.operLocation }}</span>
              </span>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 请求信息 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><Sort /></el-icon>
          {{ t('operlog.detail.requestInfo') }}
        </div>
        <el-row class="detail-row">
          <el-col :span="24">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.operUrl') }}</span>
              <span class="detail-value">
                <span :class="'method-tag method-' + form.requestMethod">{{ form.requestMethod }}</span>
                {{ form.operUrl }}
              </span>
            </div>
          </el-col>
        </el-row>
        <el-row class="detail-row">
          <el-col :span="24">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.operMethod') }}</span>
              <span class="detail-value mono">{{ form.method }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row class="detail-row">
          <el-col :span="12">
            <div class="detail-item">
              <span class="detail-label">{{ t('operlog.detail.costTime') }}</span>
              <span class="detail-value">{{ form.costTime }} {{ t('operlog.detail.millisecond') }}</span>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 请求参数 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><Upload /></el-icon>
          {{ t('operlog.detail.requestParam') }}
        </div>
        <div class="code-body">
          <div class="code-wrap">
            <div class="code-action">
              <el-button size="small" :icon="CopyDocument" @click="copyText(form.operParam)">
                {{ t('operlog.detail.copy') }}
              </el-button>
            </div>
            <pre class="code-pre">{{ formatJson(form.operParam) }}</pre>
          </div>
        </div>
      </div>

      <!-- 返回参数 -->
      <div class="detail-card">
        <div class="detail-card-title">
          <el-icon><Download /></el-icon>
          {{ t('operlog.detail.responseParam') }}
        </div>
        <div class="code-body">
          <div class="code-wrap">
            <div class="code-action">
              <el-button size="small" :icon="CopyDocument" @click="copyText(form.jsonResult)">
                {{ t('operlog.detail.copy') }}
              </el-button>
            </div>
            <pre class="code-pre">{{ formatJson(form.jsonResult) }}</pre>
          </div>
        </div>
      </div>

      <!-- 变更对比（仅修改操作显示，对比 oper_param 与 json_result 中相同字段） -->
      <Transition name="expand-fade">
        <div class="detail-card" v-if="showDiff">
          <div class="detail-card-title">
            <el-icon><Switch /></el-icon>
            {{ t('operlog.detail.diffCompare') }}
            <el-tooltip :content="t('operlog.detail.diffTip')" placement="top">
              <el-icon class="diff-help ml-2 text-text-secondary cursor-help align-middle"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <div class="diff-body py-2">
            <Transition mode="out-in" name="fade">
              <div v-if="diffList.length === 0" key="empty" class="diff-empty text-center text-text-secondary p-4">
                {{ t('operlog.detail.noDiff') }}
              </div>
              <div v-else key="diff" class="diff-list flex flex-col gap-2">
                <div
                  v-for="item in diffList"
                  :key="item.field"
                  class="diff-item bg-fill-light border border-border-lighter rounded p-2 px-3"
                >
                  <div class="diff-field font-semibold text-text-primary mb-1.5">{{ item.field }}</div>
                  <div class="diff-values flex items-center gap-3">
                    <div class="diff-old flex-1 flex flex-col gap-0.5">
                      <span class="diff-label text-text-secondary">{{ t('operlog.detail.oldValue') }}</span>
                      <span class="diff-value break-all" :class="{ 'diff-changed': item.changed }">
                        {{ item.oldVal || t('operlog.detail.empty') }}
                      </span>
                    </div>
                    <el-icon class="diff-arrow text-text-secondary text-base"><Right /></el-icon>
                    <div class="diff-new flex-1 flex flex-col gap-0.5">
                      <span class="diff-label text-text-secondary">{{ t('operlog.detail.newValue') }}</span>
                      <span class="diff-value break-all" :class="{ 'diff-changed': item.changed }">
                        {{ item.newVal || t('operlog.detail.empty') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </Transition>

      <!-- 异常信息 -->
      <Transition name="expand-fade">
        <div class="detail-card" v-if="form.status !== 0">
          <div class="detail-card-title error-title">
            <el-icon><Warning /></el-icon>
            {{ t('operlog.detail.errorMsg') }}
          </div>
          <div class="error-body">
            <div class="error-msg">{{ form.errorMsg }}</div>
          </div>
        </div>
      </Transition>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue'
import modal from '@/plugins/modal'
import type { SysOperLog } from '@/types/api/monitor/operlog'
import { formatModuleTitle as resolveModuleTitle } from '@/utils/operModuleTitle'
import { parseOperDiff, heuristicDiff, type DiffItem } from './diff'

const { t, te } = useI18n()

// T-11：title 存量可能是 i18n key（module.*）或历史中文原文，与列表页同样经字典回退展示
const formatModuleTitle = (title?: string | null) => resolveModuleTitle(title, t, te)

const props = defineProps<{
  row: SysOperLog
}>()

const dialogVisible = defineModel<boolean>('visible')

const { sys_oper_type } = useDict('sys_oper_type')

const form = computed<SysOperLog>(() => props.row || {})
const typeLabel = computed<string>(() => selectDictLabel(sys_oper_type.value, form.value.businessType) || '-')

function formatJson(str?: string): string {
  if (!str) return t('operlog.detail.noData')
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

function copyText(str?: string): void {
  const text = formatJson(str)
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => modal.msgSuccess(t('common.copySuccess')))
      .catch(() => modal.msgError(t('common.copyFail')))
  } else {
    // 已废弃：execCommand('copy') 在部分浏览器中已被弃用，仅在 navigator.clipboard 不可用时作为降级方案
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    modal.msgSuccess(t('common.copySuccess'))
  }
}

// 变更对比逻辑：仅修改操作（businessType=2）展示
const showDiff = computed(() => {
  // businessType: 1=新增 2=修改 3=删除
  return form.value.businessType === 2 && !!(form.value.operDiff || form.value.operParam || form.value.jsonResult)
})

// 优先使用服务端权威的字段级差异（oper_diff）；无该字段的历史日志回退到启发式对比
const diffList = computed<DiffItem[]>(() => {
  if (!showDiff.value) return []
  const serverDiff = parseOperDiff(form.value.operDiff)
  if (serverDiff.length > 0) return serverDiff
  // oper_diff 存在但为空数组：说明服务端已确认无字段变化，直接返回空，不再回退启发式
  if (form.value.operDiff) return []
  return heuristicDiff(form.value.operParam, form.value.jsonResult)
})
</script>

<style scoped>
:deep(.el-tag) {
  transition: all 0.2s ease;
}

/* diff 样式 */
.diff-empty {
  font-size: 13px;
}
.diff-field {
  font-size: 13px;
}
.diff-label {
  font-size: 11px;
}
.diff-value {
  font-size: 13px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
}
.diff-changed {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 2px 4px;
  border-radius: 2px;
}
</style>
