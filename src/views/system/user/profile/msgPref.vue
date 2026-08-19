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

    <el-form ref="formRef" :model="form" label-width="120px" v-loading="loading">
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
            <el-switch v-model="form.dndEnabled" active-value="1" inactive-value="0" />
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
        <el-button type="primary" :loading="saving" @click="handleSave">
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
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

function handleSave(): void {
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
