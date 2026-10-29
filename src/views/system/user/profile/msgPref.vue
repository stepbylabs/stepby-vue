<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center gap-3">
        <span>
          <el-icon><Bell /></el-icon>
          {{ t('profile.pref.title') }}
        </span>
        <el-tooltip :content="t('profile.pref.tip')">
          <el-icon class="cursor-pointer text-text-secondary"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
    </template>

    <el-alert :title="t('profile.pref.tip')" type="info" :closable="false" show-icon class="mb15" />

    <!-- b133：读失败必须可见且可重试。此前失败静默，表单停在默认值上——
         用户点一次保存就把真实偏好覆盖成默认值，失败被签成了一次写入。 -->
    <el-alert v-if="loadError" type="error" :closable="false" show-icon class="mb15" data-test="msg-pref-load-error">
      <div class="flex items-center gap-3">
        <span>{{ t('profile.pref.loadFailed') }}</span>
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </div>
    </el-alert>

    <el-form ref="formRef" :model="form" label-width="120px" v-loading="loading" :disabled="!loaded">
      <el-divider content-position="left">
        <span class="divider-text">{{ t('profile.pref.notifyLabel') }}</span>
      </el-divider>

      <el-form-item :label="t('profile.pref.email')">
        <el-switch v-model="form.emailNotify" active-value="1" inactive-value="0" />
      </el-form-item>

      <el-form-item :label="t('profile.pref.sysmsg')">
        <el-switch v-model="form.sysmsgNotify" active-value="1" inactive-value="0" />
      </el-form-item>

      <el-form-item :label="t('profile.pref.announce')">
        <el-switch v-model="form.announceNotify" active-value="1" inactive-value="0" />
      </el-form-item>

      <el-divider content-position="left">
        <span class="divider-text">{{ t('profile.pref.dndTitle') }}</span>
      </el-divider>

      <el-form-item>
        <div class="dnd-box">
          <div class="flex items-center gap-[12px]">
            <el-switch
              v-model="form.dndEnabled"
              :aria-label="t('profile.pref.dnd')"
              active-value="1"
              inactive-value="0"
            />
            <span>{{ t('profile.pref.dnd') }}</span>
          </div>
          <div v-if="form.dndEnabled === '1'" class="dnd-times">
            <el-time-select
              v-model="form.dndStart"
              :start="'00:00'"
              :step="'00:30'"
              :end="'23:30'"
              format="HH:MM"
              :placeholder="t('profile.pref.dndStart')"
            />
            <span class="dnd-sep">→</span>
            <el-time-select
              v-model="form.dndEnd"
              :start="'00:00'"
              :step="'00:30'"
              :end="'23:30'"
              format="HH:MM"
              :placeholder="t('profile.pref.dndEnd')"
            />
          </div>
          <div v-if="form.dndEnabled !== '1'" class="dnd-time-tip">{{ t('profile.pref.timeRequired') }}</div>
        </div>
        <div class="dnd-tip">{{ t('profile.pref.dndTip') }}</div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" :disabled="!loaded" @click="handleSave">
          {{ t('profile.pref.save') }}
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts" name="MsgPref">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getMessagePref, updateMessagePref } from '@/api/system/pref'
import type { MessagePrefForm } from '@/types'
import { errorHub } from '@/utils/errorHub'

const { t } = useI18n()
const formRef = ref()
const loading = ref(true)
const saving = ref(false)
// 读成功闸（b133）：读到真实偏好之前，表单里的值只是默认值，不允许被保存
const loaded = ref(false)
const loadError = ref(false)

const form = reactive<MessagePrefForm & { dndEnabled: string; dndStart: string; dndEnd: string }>({
  emailNotify: '1',
  sysmsgNotify: '1',
  announceNotify: '1',
  dndEnabled: '0',
  dndStart: '',
  dndEnd: ''
})

function load(): void {
  loading.value = true
  loaded.value = false
  loadError.value = false
  getMessagePref()
    .then((res) => {
      const d = res.data
      if (d) {
        form.emailNotify = d.emailNotify
        form.sysmsgNotify = d.sysmsgNotify
        form.announceNotify = d.announceNotify
        form.dndEnabled = d.dndEnabled
        form.dndStart = d.dndStart
        form.dndEnd = d.dndEnd
      }
      // 后端 200 但无 data 也算"没读到真实偏好"：保持未就绪，保存入口继续封锁
      loaded.value = !!d
    })
    .catch(() => {
      loadError.value = true
      loaded.value = false
    })
    .finally(() => {
      loading.value = false
    })
}

function handleSave(): void {
  // 纵深防御：按钮已禁用，这里再挡一次（读失败时保存 = 用默认值覆盖真实偏好）
  if (!loaded.value) return
  if (form.dndEnabled === '1' && (!form.dndStart || !form.dndEnd)) {
    errorHub.report('warning', 'other', t('profile.pref.timeRequired'))
    return
  }
  saving.value = true
  updateMessagePref({ ...form })
    .then(() => {
      ElMessage.success(t('profile.pref.saveSuccess'))
      load()
    })
    .catch(() => errorHub.report('error', 'other', t('profile.pref.saveError')))
    .finally(() => {
      saving.value = false
    })
}

onMounted(load)
</script>

<style lang="scss" scoped>
.divider-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.dnd-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dnd-times {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dnd-sep {
  color: var(--el-text-color-secondary);
}
.dnd-time-tip,
.dnd-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
