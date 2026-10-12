<template>
  <!--
    业务列表页「按租户筛选」入口（可复用筛选组件）

    多租户 Phase 3：平台操作者需要在业务列表里定位某个租户的数据。
    按项目准则⑥（原判"不进本仓"的项改为**提供集成点/开关**），本组件即那个集成点——
    是否渲染由后端下发的 `[ui].tenant_filter` 决策统一控制：

      off      （默认）不提供入口 ⇒ 等价于历史行为（零行为变更）
      platform 仅平台操作者（tid = 0）可见
      always   平台与租户操作者均可见

    判定口径只有一处 —— 后端 `GetInfoVo.showTenantFilter`（前端不做二次推断），
    本组件只消费 `userStore.showTenantFilter`。

    ⚠️ 该筛选仅用于**收窄**：后端把显式 tenantId 与行级 tenant_scope **相与**（AND），
    故它不构成安全边界 —— 租户即便手工传他租户 id 也只会得到空集。
  -->
  <el-input
    v-if="visible"
    v-model="model"
    class="tenant-filter"
    :placeholder="t('common.tenantFilterPlaceholder')"
    clearable
    @keyup.enter="emit('search')"
    @clear="emit('search')"
  />
</template>

<script setup lang="ts" name="TenantFilter">
import useUserStore from '@/store/modules/user'

/** 租户号（v-model）；空串 / undefined 表示不按租户筛选 */
const model = defineModel<string | number | undefined>()

/** 回车 / 清空时通知父组件触发查询（与页面搜索栏行为一致） */
const emit = defineEmits<{ search: [] }>()

const { t } = useI18n()
const userStore = useUserStore()

/**
 * 是否渲染本筛选入口：**唯一判定源**是后端下发的决策（`[ui].tenant_filter`）。
 * 默认 `false`（fail-safe：用户信息未取到时宁可不显示）。
 */
const visible = computed<boolean>(() => userStore.showTenantFilter === true)
</script>

<style scoped>
.tenant-filter {
  width: 160px;
}
</style>
