<template>
  <el-dialog v-model="visible" :title="t('userPrefs.title')" width="min(90%, 540px)" append-to-body destroy-on-close>
    <el-form :model="form" label-width="140px" label-position="right">
      <el-divider content-position="left">{{ t('userPrefs.listDisplay') }}</el-divider>
      <el-form-item :label="t('userPrefs.defaultPageSize')">
        <el-select v-model="form.defaultPageSize" class="w-[160px]">
          <el-option :value="10" :label="`10 ${t('userPrefs.pageSizeUnit')}`" />
          <el-option :value="20" :label="`20 ${t('userPrefs.pageSizeUnit')}`" />
          <el-option :value="50" :label="`50 ${t('userPrefs.pageSizeUnit')}`" />
          <el-option :value="100" :label="`100 ${t('userPrefs.pageSizeUnit')}`" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('userPrefs.defaultSort')">
        <el-radio-group v-model="form.defaultSortOrder">
          <el-radio value="asc">{{ t('userPrefs.sortAsc') }}</el-radio>
          <el-radio value="desc">{{ t('userPrefs.sortDesc') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('userPrefs.tableDensity')">
        <el-radio-group v-model="form.tableDensity">
          <el-radio value="comfortable">{{ t('userPrefs.densityComfortable') }}</el-radio>
          <el-radio value="default">{{ t('userPrefs.densityDefault') }}</el-radio>
          <el-radio value="compact">{{ t('userPrefs.densityCompact') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('userPrefs.autoRefreshInterval')">
        <el-input-number v-model="form.autoRefreshInterval" :min="0" :max="600" :step="10" class="w-[160px]" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('userPrefs.autoRefreshTip') }}</span>
      </el-form-item>
      <el-form-item :label="t('userPrefs.mobileTableCards')">
        <el-switch v-model="form.mobileTableCards" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('userPrefs.mobileTableCardsTip') }}</span>
      </el-form-item>

      <el-divider content-position="left">{{ t('userPrefs.appearance') }}</el-divider>
      <el-form-item :label="t('userPrefs.followSystemDark')">
        <el-switch v-model="form.followSystemDark" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('userPrefs.followSystemDarkTip') }}</span>
      </el-form-item>

      <el-divider content-position="left">{{ t('userPrefs.security') }}</el-divider>
      <el-form-item :label="t('userPrefs.watermark')">
        <el-switch v-model="form.watermarkEnabled" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('userPrefs.watermarkTip') }}</span>
      </el-form-item>
      <el-form-item :label="t('userPrefs.sessionTimeout')">
        <el-input-number v-model="form.sessionTimeout" :min="0" :max="240" :step="5" class="w-[160px]" />
        <span class="form-tip ml-2 text-text-secondary text-xs">{{ t('userPrefs.sessionTimeoutTip') }}</span>
      </el-form-item>

      <el-divider content-position="left">{{ t('userPrefs.timezoneSection') }}</el-divider>
      <el-form-item :label="t('userPrefs.timezone')">
        <el-select v-model="form.timezone" filterable class="w-[240px]">
          <el-option v-for="tz in timezoneOptions" :key="tz.value" :value="tz.value" :label="tz.label" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('userPrefs.cancel') }}</el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleSave">{{ t('userPrefs.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useSettingsStore from '@/store/modules/settings'
import modal from '@/plugins/modal'

const { t } = useI18n()

const settingsStore = useSettingsStore()
const visible = ref(false)
const form = ref({ ...settingsStore.userPrefs })
const submitLoading = ref(false)

watch(visible, (v: boolean) => {
  if (v) {
    form.value = { ...settingsStore.userPrefs }
  }
})

const timezoneOptions = computed(() => [
  { value: 'Asia/Shanghai', label: `(UTC+8) ${t('userPrefs.tzShanghai')}` },
  { value: 'Asia/Tokyo', label: `(UTC+9) ${t('userPrefs.tzTokyo')}` },
  { value: 'Asia/Singapore', label: `(UTC+8) ${t('userPrefs.tzSingapore')}` },
  { value: 'America/New_York', label: `(UTC-5) ${t('userPrefs.tzNewYork')}` },
  { value: 'America/Los_Angeles', label: `(UTC-8) ${t('userPrefs.tzLosAngeles')}` },
  { value: 'Europe/London', label: `(UTC+0) ${t('userPrefs.tzLondon')}` },
  { value: 'Europe/Paris', label: `(UTC+1) ${t('userPrefs.tzParis')}` },
  { value: 'Australia/Sydney', label: `(UTC+10) ${t('userPrefs.tzSydney')}` },
  { value: 'UTC', label: `(UTC) ${t('userPrefs.tzUTC')}` }
])

async function handleSave() {
  submitLoading.value = true
  try {
    settingsStore.updateUserPrefs(form.value)
    modal.msgSuccess(t('userPrefs.saveSuccess'))
    visible.value = false
  } finally {
    submitLoading.value = false
  }
}

defineExpose({
  open: () => {
    visible.value = true
  }
})
</script>

<style scoped>
.form-tip {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
