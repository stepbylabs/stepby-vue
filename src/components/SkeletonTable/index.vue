<template>
  <div class="skeleton-table">
    <el-skeleton animated>
      <template #template>
        <div class="skeleton-table__header">
          <div
            v-for="n in columns"
            :key="`head-${n}`"
            class="skeleton-table__cell skeleton-table__cell--head flex-1 min-w-0"
          >
            <el-skeleton-item variant="text" />
          </div>
        </div>
        <div v-for="r in rows" :key="`row-${r}`" class="skeleton-table__row">
          <div v-for="n in columns" :key="`cell-${r}-${n}`" class="skeleton-table__cell flex-1 min-w-0">
            <el-skeleton-item variant="text" />
          </div>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
const { columns = 8, rows = 5 } = defineProps<{
  columns?: number
  rows?: number
}>()
</script>

<style scoped>
.skeleton-table {
  width: 100%;
  border: 1px solid var(--el-table-border-color);
  border-bottom: none;
  background-color: var(--el-table-bg-color);
  box-sizing: border-box;
}

.skeleton-table__header {
  display: flex;
  background-color: var(--el-table-header-bg-color);
  border-bottom: 1px solid var(--el-table-border-color);
}

.skeleton-table__row {
  display: flex;
  border-bottom: 1px solid var(--el-table-border-color);
}

.skeleton-table__cell {
  padding: 13px 10px;
}

.skeleton-table__cell--head {
  padding-top: 11px;
  padding-bottom: 11px;
}
</style>
