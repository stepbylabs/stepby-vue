<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <span>{{ t('tenantDomain.myTitle') }}</span>
      </template>
      <tenant-domain-panel />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import TenantDomainPanel from '../TenantDomainPanel.vue'

const { t } = useI18n()
</script>
