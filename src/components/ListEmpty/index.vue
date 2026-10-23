<template>
  <!--
    列表页空态唯一实现（UX：区分「加载失败」与「暂无数据」）。

    缺陷形态（全仓取证）：41 处列表空态一律绑 `common.empty`，
    请求失败被 catch 静默吞成空列表后，toast 消失页面落回"暂无数据"——
    用户在屏幕上无法分辨"加载失败"与"真的没有数据"（后者是正常业务态）。

    分工：
    - loadError=true：显示 `common.loadFailed`（既有词条）+ 重试按钮（emit retry）；
    - loadError=false：默认渲染"暂无数据"el-empty；页面若有自己的空态 CTA
      （如 EmptyState 的「新建/重置筛选」），放进默认插槽即可原样保留——
      成功路径的既有观感零变化，只多出失败分支。

    样式口径（《前端样式规范》优先级 1）：全部由 el-empty 的 description/默认插槽
    与 el-button props（type/plain/icon）+ Tailwind 工具类构成，
    不触 EP 深层 DOM，故本组件无 scoped 样式、无 SCSS 豁免。

    数据源接线：useCrudTable 页面绑组合子的 `loadError`/`retryLoad`；
    手写 getList 的页面（monitor/server、logtail、pat、job/log、system/user 等）
    用本地 ref 接同一个组件——单一实现、两路数据源同形。
  -->
  <el-empty v-if="loadError" :description="t('common.loadFailed')">
    <el-button type="primary" plain icon="Refresh" @click="emit('retry')">
      {{ t('common.retry') }}
    </el-button>
  </el-empty>
  <slot v-else>
    <el-empty :description="t('common.empty')" />
  </slot>
</template>

<script setup lang="ts">
/**
 * 列表空态组件（全仓列表页空态的单一实现，禁止在页面里复制本模板结构）。
 *
 * Props:
 * - loadError: 列表请求是否失败（true = 显示"加载失败 + 重试"；缺省/ false = 正常空态）
 *
 * Events:
 * - retry: 重试按钮点击（调用方接 `retryLoad()` 或页面自己的取列表函数）
 *
 * Slots:
 * - default: 覆写"正常空态"的展示内容（如带 CTA 的 EmptyState），失败分支不受影响
 */
interface Props {
  loadError?: boolean
}

const { t } = useI18n()

withDefaults(defineProps<Props>(), {
  loadError: false
})

const emit = defineEmits<{
  (e: 'retry'): void
}>()
</script>
