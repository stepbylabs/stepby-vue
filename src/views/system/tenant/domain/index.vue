<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <span>{{ t('tenantDomain.myTitle') }}</span>
      </template>
      <!-- 平台操作者：自助页语义 = 管理某个租户的域名。后端按操作者租户收窄，
           平台必须显式指定 tenantId（否则新增会归属到平台租户 0 形成脏数据）。
           选中租户后以平台模式（TenantDomainPanel tenantId prop）代管该租户域名；
           租户操作者保持自助模式（不传 tenantId，后端强制本租户）。 -->
      <el-form v-if="isPlatform" v-loading="loading" inline class="mb-2" @submit.prevent>
        <el-form-item :label="t('tenantDomain.targetTenant')">
          <el-select
            :aria-label="t('tenantDomain.targetTenant')"
            v-model="selectedTenantId"
            filterable
            :placeholder="t('tenantDomain.targetTenantPlaceholder')"
            class="w-[280px]"
          >
            <el-option
              v-for="tnt in tenantOptions"
              :key="tnt.tenantId"
              :label="`${tnt.tenantName} (${tnt.tenantCode})`"
              :value="tnt.tenantId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="isPlatform && !selectedTenantId"
        :title="t('tenantDomain.platformPickTenant')"
        type="warning"
        :closable="false"
        class="mb-2"
      />
      <el-alert
        v-if="!isPlatform"
        :title="t('tenantDomain.selfServiceTip')"
        type="info"
        :closable="false"
        class="mb-2"
      />
      <el-alert
        v-if="isPlatform && tenantOptionsFailed"
        type="error"
        :closable="false"
        show-icon
        class="mb-2"
        :title="t('tenantDomain.tenantListFailed')"
      >
        <el-button link type="primary" @click="loadTenantOptions">{{ t('common.retry') }}</el-button>
      </el-alert>
      <el-empty
        v-if="isPlatform && !loading && !tenantOptionsFailed && selectedTenantId == null && tenantOptions.length === 0"
        :description="t('common.noData')"
      />
      <TenantDomainPanel v-if="!isPlatform || selectedTenantId != null" :tenant-id="selectedTenantId" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import TenantDomainPanel from '../TenantDomainPanel.vue'
import { listTenant } from '@/api/system/tenant'
import type { TenantVo } from '@/api/system/tenant'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()
const userStore = useUserStore()
/** 平台操作者（tid=0）：需先选目标租户再管理其域名 */
const isPlatform = userStore.tenantId === 0
const tenantOptions = ref<TenantVo[]>([])
const selectedTenantId = ref<number | undefined>(undefined)
const loading = ref(false)
/** 平台租户清单读取失败（b141）：失败不得显示成"没有租户"，否则平台会以为系统里一个租户都没有 */
const tenantOptionsFailed = ref(false)

onMounted(() => {
  if (isPlatform) void loadTenantOptions()
})

async function loadTenantOptions(): Promise<void> {
  loading.value = true
  tenantOptionsFailed.value = false
  try {
    const res = await listTenant()
    tenantOptions.value = res.data ?? []
  } catch (e) {
    // 拦截器已提示；此处标记失败态，空态由 !tenantOptionsFailed 闸住
    tenantOptions.value = []
    tenantOptionsFailed.value = true
    if (import.meta.env.DEV) console.error('[tenantDomain] loadTenantOptions:', e)
  } finally {
    loading.value = false
  }
}
</script>
