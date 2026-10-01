<template>
  <el-drawer v-model="visible" direction="rtl" size="min(80%, 700px)" append-to-body>
    <!-- 自定义标题 -->
    <template #header>
      <div class="flex items-center">
        <el-icon class="mr-2 text-[var(--el-color-primary)]"><List /></el-icon>
        <span class="drawer-head-name text-base font-semibold mr-2">{{ row?.dictName }}</span>
        <span class="drawer-head-type text-sm font-mono">{{ row?.dictType }}</span>
      </div>
    </template>

    <div class="px-5 pb-5">
      <Transition mode="out-in" name="fade">
        <!-- 加载中 -->
        <div
          v-if="loading"
          key="loading"
          class="drawer-loading flex items-center justify-center h-[120px] text-[13px] gap-2"
        >
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ t('dict.detail.loading') }}</span>
        </div>

        <!-- 空数据 -->
        <el-empty
          v-else-if="!dataList.length"
          key="empty"
          :description="t('dict.detail.noData')"
          :image-size="60"
          class="py-[60px]"
        />

        <div v-else key="content">
          <!-- 统计卡片 -->
          <el-row :gutter="12" class="mb-4">
            <el-col :span="disabledCount > 0 ? 8 : 12">
              <div class="stat-card rounded-md py-2.5 px-3.5 text-center">
                <div class="stat-num text-[22px] font-bold">{{ dataList.length }}</div>
                <div class="stat-label text-[11px] mt-1">{{ t('dict.detail.total') }}</div>
              </div>
            </el-col>
            <el-col :span="disabledCount > 0 ? 8 : 12">
              <div class="stat-card rounded-md py-2.5 px-3.5 text-center">
                <div class="stat-num success text-[22px] font-bold">{{ normalCount }}</div>
                <div class="stat-label text-[11px] mt-1">{{ t('dict.detail.normal') }}</div>
              </div>
            </el-col>
            <el-col v-if="disabledCount > 0" :span="8">
              <div class="stat-card rounded-md py-2.5 px-3.5 text-center">
                <div class="stat-num danger text-[22px] font-bold">{{ disabledCount }}</div>
                <div class="stat-label text-[11px] mt-1">{{ t('dict.detail.disabled') }}</div>
              </div>
            </el-col>
          </el-row>

          <!-- 数据列表 -->
          <TransitionGroup name="list" tag="div" class="dict-list">
            <div
              v-for="item in dataList"
              :key="item.dictCode"
              class="dict-item grid grid-cols-3 rounded-md overflow-hidden mb-2"
            >
              <div class="dict-cell grid grid-cols-[70px_1fr]">
                <div class="dict-cell-key">{{ t('dict.detail.label') }}</div>
                <div class="dict-cell-val flex items-center text-[13px] break-all py-[9px] px-3.5">
                  <el-tag
                    v-if="item.listClass && item.listClass !== 'default'"
                    :type="item.listClass === 'primary' ? undefined : item.listClass"
                    size="small"
                  >
                    {{ item.dictLabel }}
                  </el-tag>
                  <span v-else>{{ item.dictLabel }}</span>
                </div>
              </div>
              <div class="dict-cell grid grid-cols-[70px_1fr]">
                <div class="dict-cell-key">{{ t('dict.detail.value') }}</div>
                <div class="dict-cell-val flex items-center text-[13px] break-all py-[9px] px-3.5">
                  {{ item.dictValue }}
                </div>
              </div>
              <div class="dict-cell grid grid-cols-[70px_1fr]">
                <div class="dict-cell-key">{{ t('dict.detail.status') }}</div>
                <div class="dict-cell-val flex items-center text-[13px] break-all py-[9px] px-3.5">
                  <el-tag :type="item.status === '0' ? 'success' : 'danger'" size="small">
                    {{ item.status === '0' ? t('dict.detail.normal') : t('dict.detail.disabled') }}
                  </el-tag>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </Transition>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { listData } from '@/api/system/dict/data'
import type { SysDictData, SysDictType } from '@/types/api/system/dict'

const { t } = useI18n()

const props = defineProps<{ row: SysDictType | null }>()

const visible = defineModel<boolean>('visible', { default: false })

const loading = ref<boolean>(false)
const dataList = ref<SysDictData[]>([])

const normalCount = computed(() => dataList.value.filter((r: SysDictData) => r.status === '0').length)
const disabledCount = computed(() => dataList.value.filter((r: SysDictData) => r.status !== '0').length)

watch(visible, (val: boolean) => {
  if (val) {
    loadData()
  } else {
    dataList.value = []
  }
})

function loadData() {
  if (!props.row?.dictType) return
  loading.value = true
  dataList.value = []
  listData({ dictType: props.row.dictType, pageSize: 50, pageNum: 1 })
    .then((response) => {
      dataList.value = response.rows || []
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}
</script>

<style scoped>
/* P1 修复: 移除硬编码 fallback 颜色，直接使用 Element Plus CSS 变量适配暗色模式 */
.drawer-head-name {
  color: var(--el-text-color-primary);
}
.drawer-head-type {
  color: var(--el-text-color-secondary);
}
.drawer-loading {
  color: var(--el-text-color-secondary);
}
.stat-card {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    transform 0.2s ease;
}
.stat-num {
  color: var(--el-text-color-primary);
}
.stat-num.success {
  color: var(--el-color-success);
}
.stat-num.danger {
  color: var(--el-color-danger);
}
.stat-label {
  color: var(--el-text-color-secondary);
}
.dict-item {
  border: 1px solid var(--el-border-color-lighter);
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    transform 0.2s ease;

  &:hover {
    background-color: var(--el-fill-color-light);
    border-color: var(--el-color-primary-light-5);
    transform: translateX(2px);
  }
}
.dict-cell {
  border-right: 1px solid var(--el-border-color-lighter);
}
.dict-cell:last-child {
  border-right: 0;
}
.dict-cell-key {
  padding: 9px 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-right: 1px solid var(--el-border-color-lighter);
}
.dict-cell-val {
  color: var(--el-text-color-primary);
}
</style>
