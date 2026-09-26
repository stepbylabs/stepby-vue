<template>
  <el-drawer
    v-model="visible"
    :title="tenant ? t('tenantDomain.title', [tenant.tenantName]) : t('tenantDomain.manage')"
    size="860px"
    destroy-on-close
  >
    <TenantDomainPanel
      v-if="tenant"
      :tenant-id="tenant.tenantId"
      :tenant-name="tenant.tenantName"
      @refresh="emit('refresh')"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import type { TenantVo } from '@/api/system/tenant'
import TenantDomainPanel from './TenantDomainPanel.vue'

const props = defineProps<{
  modelValue: boolean
  tenant?: TenantVo | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'refresh'): void
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})
</script>
