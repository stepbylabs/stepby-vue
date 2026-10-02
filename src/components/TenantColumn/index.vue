<template>
  <!--
    「所属租户」归属列（可复用列组件）

    多租户 Phase 3 / F-6：原判定"业务页不加归属列"（理由：租户用户看到的天然只有本租户
    数据，加列零收益）。按项目准则⑥（原判"不进本仓"的项改为**提供集成点/开关**），
    本组件即那个集成点——是否渲染由后端下发的 `[ui].show_tenant_column` 决策统一控制：

      auto   （默认）仅平台操作者可见 ⇒ 等价于历史行为（租户侧零行为变更）
      always 平台与租户操作者均可见
      never  一律不隐藏

    判定口径只有一处 —— 后端 `GetInfoVo.showTenantColumn`（前端不做二次推断），
    本组件只消费 `userStore.showTenantColumn`。
  -->
  <el-table-column
    v-if="visible"
    :label="label ?? t('common.tenantColumn')"
    :prop="prop"
    :width="width"
    align="center"
    show-overflow-tooltip
  >
    <template #default="scope">
      <slot :row="scope.row" :tenant-id="scope.row?.[prop]">
        <el-tag v-if="isPlatform(scope.row?.[prop])" type="info" size="small" effect="plain">
          {{ t('common.platformTenant') }}
        </el-tag>
        <el-tag v-else type="warning" size="small" effect="plain">
          #{{ scope.row?.[prop] }}
        </el-tag>
      </slot>
    </template>
  </el-table-column>
</template>

<script setup lang="ts" name="TenantColumn">
import useUserStore from '@/store/modules/user'

interface Props {
  /** 行对象上承载租户号的字段名（默认 `tenantId`，与各 Vo 的 camelCase 字段一致） */
  prop?: string
  /** 列标题；缺省用 i18n `common.tenantColumn`（所属租户 / Tenant） */
  label?: string
  /** 列宽 */
  width?: number | string
}

const { prop = 'tenantId', label, width = 110 } = defineProps<Props>()

const { t } = useI18n()
const userStore = useUserStore()

/**
 * 是否渲染本列：**唯一判定源**是后端下发的决策（`[ui].show_tenant_column`）。
 * 默认 `false`（fail-safe：用户信息未取到时宁可不显示）。
 */
const visible = computed<boolean>(() => userStore.showTenantColumn === true)

/** `tenant_id === 0` 即平台租户（见 `common::tenant::tenant_scope`） */
function isPlatform(value: unknown): boolean {
  return value === 0 || value === '0' || value === null || value === undefined || value === ''
}
</script>
