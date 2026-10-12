<template>
  <el-row :gutter="10">
    <el-col :xs="24" :sm="24" :md="12" class="card-box">
      <el-card>
        <template #header>
          <Histogram class="align-middle w-[1em] h-[1em]"/>
          <span class="align-middle">{{ t('cache.prefix.title') }}</span>
          <el-button
            v-hasPermi="['monitor:cache:list']"
            class="ml-auto py-[3px]"
            link
            type="primary"
            icon="Refresh"
            :aria-label="t('cache.prefix.refresh')"
            @click="loadStats()" ></el-button>
        </template>
        <el-table v-loading="prefixLoading" :data="prefixStats" :height="statsTableHeight" class="w-full">
          <el-table-column
            :label="t('cache.prefix.column.cacheName')"
            align="center"
            prop="cacheName"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('cache.prefix.column.keyCount')"
            align="center"
            prop="keyCount"
            width="110"
          />
          <el-table-column :label="t('cache.prefix.column.memory')" align="center" width="140">
            <template #default="scope">
              <span :class="{ 'memory-large': isLargeMemory(scope.row.memoryBytes) }">
                <el-icon v-if="isLargeMemory(scope.row.memoryBytes)"><WarningFilled /></el-icon>
                {{ formatBytes(scope.row.memoryBytes) }}
              </span>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="t('cache.prefix.empty')" />
          </template>
        </el-table>
      </el-card>
    </el-col>

    <el-col :xs="24" :sm="24" :md="12" class="card-box">
      <el-card>
        <template #header>
          <Warning class="align-middle w-[1em] h-[1em]"/>
          <span class="align-middle">{{ t('cache.hot.title') }}</span>
          <el-button
            v-hasPermi="['monitor:cache:list']"
            class="ml-auto py-[3px]"
            link
            type="primary"
            icon="Refresh"
            :aria-label="t('cache.hot.refresh')"
            @click="loadStats()" ></el-button>
        </template>
        <el-table v-loading="hotLoading" :data="hotKeys" :height="statsTableHeight" class="w-full">
          <el-table-column :label="t('cache.hot.column.key')" align="center" prop="key" show-overflow-tooltip />
          <el-table-column :label="t('cache.hot.column.type')" align="center" prop="keyType" width="90" />
          <el-table-column :label="t('cache.hot.column.memory')" align="center" width="120">
            <template #default="scope">{{ formatBytes(scope.row.memoryBytes) }}</template>
          </el-table-column>
          <el-table-column :label="t('cache.hot.column.hotspot')" align="center" width="90">
            <template #default="scope">
              <el-tag v-if="scope.row.memoryBytes > HOT_KEY_THRESHOLD" type="danger" size="small">
                {{ t('cache.hot.hotspot') }}
              </el-tag>
              <span v-else>{{ t('common.normal') }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('cache.list.column.operation')"
            width="60"
            align="center"
            class-name="small-padding fixed-width" >
            <template #default="scope">
              <el-button
                v-hasPermi="['monitor:cache:clearKey']"
                link
                type="primary"
                icon="Delete"
                :aria-label="t('common.delete')"
                @click="handleClearHotKey(scope.row)" ></el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="t('common.empty')" />
          </template>
        </el-table>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup lang="ts" name="CacheStats">
import { Histogram, Warning, WarningFilled } from '@element-plus/icons-vue'
import { getHotKeys, getPrefixStats, clearCacheKey } from '@/api/monitor/cache'
import type { HotKey, CachePrefixStat } from '@/types/api/monitor/cache'
import modal from '@/plugins/modal'

const props = defineProps<{ active: boolean }>()

const { t } = useI18n()

// ====== 统计 / 热 Key 数据 ======
// 热 Key 判定阈值（>1MB 标「热点」）
const HOT_KEY_THRESHOLD = 1024 * 1024
// 前缀「大内存」红色高亮阈值（>5MB）
const PREFIX_LARGE_THRESHOLD = 5 * 1024 * 1024
const statsTableHeight = ref<number>(window.innerHeight - 300)
const prefixStats = shallowRef<CachePrefixStat[]>([])
const hotKeys = shallowRef<HotKey[]>([])
const prefixLoading = ref(false)
const hotLoading = ref(false)
let initStats = false

function handleListResize(): void {
  statsTableHeight.value = window.innerHeight - 300
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(2)} ${units[i]}`
}

function isLargeMemory(bytes: number): boolean {
  return bytes > PREFIX_LARGE_THRESHOLD
}

function loadStats(): void {
  initStats = true
  prefixLoading.value = true
  hotLoading.value = true
  getPrefixStats()
    .then((response) => {
      prefixStats.value = response.data!
    })
    .catch(() => {})
    .finally(() => {
      prefixLoading.value = false
    })
  getHotKeys()
    .then((response) => {
      hotKeys.value = response.data!
    })
    .catch(() => {})
    .finally(() => {
      hotLoading.value = false
    })
}

// 清理热 Key：业务缓存，二次确认后调用 clearCacheKey
function handleClearHotKey(row: HotKey): void {
  modal
    .confirm(t('cache.hot.tip.confirmClearKey', { key: row.key }))
    .then(() => {
      return clearCacheKey(row.key)
    })
    .then(() => {
      modal.msgSuccess(t('cache.hot.tip.clearKeySuccess', { key: row.key }))
      // 清理后同步刷新热 Key 列表与统计
      getHotKeys()
        .then((response) => {
          hotKeys.value = response.data!
        })
        .catch(() => {})
      getPrefixStats()
        .then((response) => {
          prefixStats.value = response.data!
        })
        .catch(() => {})
    })
    .catch(() => {})
}

// 切换到统计 / 热 Key Tab 时首次加载
watch(
  () => props.active,
  (val: boolean) => {
    if (val && !initStats) {
      loadStats()
    }
  }
)

onMounted(() => {
  window.addEventListener('resize', handleListResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleListResize)
})
</script>

<style scoped lang="scss">
.memory-large {
  color: var(--el-color-danger);
  font-weight: 600;

  .el-icon {
    margin-right: 4px;
    vertical-align: -2px;
  }
}
</style>
