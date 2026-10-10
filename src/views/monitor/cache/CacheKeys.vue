<template>
  <el-row :gutter="10">
    <el-col :xs="24" :sm="24" :md="8">
      <el-card class="h-[calc(100vh-180px)]">
        <template #header>
          <Collection class="align-middle w-[1em] h-[1em]"/>
          <span class="align-middle">{{ t('cache.list.title') }}</span>
          <el-button
            v-hasPermi="['monitor:cache:list']"
            class="ml-auto py-[3px]"
            link
            type="primary"
            icon="Refresh"
            :aria-label="t('common.refresh')"
            @click="refreshCacheNames()" ></el-button>
        </template>
        <el-table
          v-loading="listLoading"
          :data="cacheNames"
          :height="listTableHeight"
          highlight-current-row
          @row-click="getCacheKeys"
          class="w-full" >
          <el-table-column :label="t('cache.list.column.id')" width="60" type="index"></el-table-column>
          <el-table-column
            :label="t('cache.list.column.name')"
            align="center"
            prop="cacheName"
            show-overflow-tooltip
            :formatter="nameFormatte" ></el-table-column>
          <el-table-column
            :label="t('cache.list.column.remark')"
            align="center"
            prop="remark"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('cache.list.column.operation')"
            width="60"
            align="center"
            class-name="small-padding fixed-width" >
            <template #default="scope">
              <el-button
                v-hasPermi="['monitor:cache:clearName']"
                link
                type="primary"
                icon="Delete"
                :aria-label="t('common.delete')"
                @click.stop="handleClearCacheName(scope.row)" ></el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="t('common.empty')" />
          </template>
        </el-table>
      </el-card>
    </el-col>

    <el-col :xs="24" :sm="24" :md="8">
      <el-card class="h-[calc(100vh-180px)]">
        <template #header>
          <Key class="align-middle w-[1em] h-[1em]"/>
          <span class="align-middle">{{ t('cache.list.keyListTitle') }}</span>
          <Transition name="fade">
            <el-button
              v-if="nowCacheName"
              v-hasPermi="['monitor:cache:list']"
              class="ml-auto py-[3px]"
              link
              type="primary"
              icon="Refresh"
              :aria-label="t('common.refresh')"
              @click="refreshCacheKeys()" ></el-button>
          </Transition>
        </template>
        <el-table
          v-loading="subLoading"
          :data="cacheKeys"
          :height="listTableHeight"
          highlight-current-row
          @row-click="handleCacheValue"
          class="w-full" >
          <el-table-column :label="t('cache.list.keyColumn.id')" width="60" type="index"></el-table-column>
          <el-table-column
            :label="t('cache.list.keyColumn.key')"
            align="center"
            show-overflow-tooltip
            :formatter="keyFormatte" ></el-table-column>
          <el-table-column
            :label="t('cache.list.keyColumn.operation')"
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
                @click.stop="handleClearCacheKey(scope.row)" ></el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="nowCacheName ? t('common.empty') : t('cache.list.tip.selectCacheFirst')" />
          </template>
        </el-table>
      </el-card>
    </el-col>

    <el-col :xs="24" :sm="24" :md="8">
      <el-card :bordered="false" class="h-[calc(100vh-180px)]">
        <template #header>
          <Document class="align-middle w-[1em] h-[1em]"/>
          <span class="align-middle">{{ t('cache.list.contentTitle') }}</span>
        </template>
        <Transition mode="out-in" name="fade">
          <el-form v-if="cacheForm.cacheKey" key="form" :model="cacheForm">
            <el-row :gutter="32">
              <el-col :offset="1" :span="22">
                <el-form-item :label="t('cache.list.form.name')" prop="cacheName">
                  <el-input v-model="cacheForm.cacheName" :readOnly="true" :maxlength="100" />
                </el-form-item>
              </el-col>
              <el-col :offset="1" :span="22">
                <el-form-item :label="t('cache.list.form.key')" prop="cacheKey">
                  <el-input v-model="cacheForm.cacheKey" :readOnly="true" :maxlength="100" />
                </el-form-item>
              </el-col>
              <el-col :offset="1" :span="22">
                <el-form-item :label="t('cache.list.form.content')" prop="cacheValue">
                  <el-input
                    v-model="cacheForm.cacheValue"
                    type="textarea"
                    :rows="8"
                    :readOnly="true"
                    :maxlength="500"
                    show-word-limit
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <el-empty v-else key="empty" :description="t('cache.list.tip.selectKeyFirst')" :image-size="80" />
        </Transition>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup lang="ts" name="CacheKeys">
import { Collection, Key, Document } from '@element-plus/icons-vue'
import { listCacheName, listCacheKey, getCacheValue, clearCacheName, clearCacheKey } from '@/api/monitor/cache'
import type { SysCache } from '@/types/api/monitor/cache'
import modal from '@/plugins/modal'

const props = defineProps<{ active: boolean }>()

const { t } = useI18n()

// ====== 键管理数据 ======
interface CacheName {
  cacheName: string
  [key: string]: unknown
}

interface CacheForm {
  cacheName?: string
  cacheKey?: string
  cacheValue?: string
}

const cacheNames = shallowRef<CacheName[]>([])
const cacheKeys = shallowRef<string[]>([])
// 历史遗留修复：模板曾绑定不存在的 nameFormatte/keyFormatte（undefined，el-table 静默回退
// 默认渲染，行为=原样显示 prop/行值）。补上等价显式实现，消除悬空引用。
function nameFormatte(row: SysCache): string {
  return row?.cacheName ?? ''
}
function keyFormatte(row: string): string {
  return row ?? ''
}
const cacheForm = ref<CacheForm>({})
const listLoading = ref<boolean>(false)
const subLoading = ref<boolean>(false)
const nowCacheName = ref<string>('')
const listTableHeight = ref<number>(window.innerHeight - 260)

function handleListResize(): void {
  listTableHeight.value = window.innerHeight - 260
}

function getCacheNames(): void {
  listLoading.value = true
  listCacheName()
    .then((response) => {
      cacheNames.value = response.data!
    })
    .catch(() => {})
    .finally(() => {
      listLoading.value = false
    })
}

function refreshCacheNames(): void {
  getCacheNames()
  modal.msgSuccess(t('cache.list.tip.refreshSuccess'))
}

function handleClearCacheName(row: SysCache): void {
  modal
    .confirm(t('cache.list.tip.confirmClearName', { name: row.cacheName }))
    .then(() => {
      return clearCacheName(row.cacheName as string)
    })
    .then(() => {
      modal.msgSuccess(t('cache.list.tip.clearNameSuccess', { name: row.cacheName }))
      getCacheKeys()
    })
    .catch(() => {})
}

function getCacheKeys(row?: SysCache): void {
  const cacheName = row !== undefined ? row.cacheName : nowCacheName.value
  if (cacheName === '') {
    return
  }
  subLoading.value = true
  listCacheKey(cacheName)
    .then((response) => {
      cacheKeys.value = response.data!
      nowCacheName.value = cacheName
    })
    .catch(() => {})
    .finally(() => {
      subLoading.value = false
    })
}

function refreshCacheKeys(): void {
  getCacheKeys()
  modal.msgSuccess(t('cache.list.tip.refreshKeySuccess'))
}

function handleClearCacheKey(cacheKey: string): void {
  modal
    .confirm(t('cache.list.tip.confirmClearKey', { key: cacheKey }))
    .then(() => {
      return clearCacheKey(cacheKey)
    })
    .then(() => {
      modal.msgSuccess(t('cache.list.tip.clearKeySuccess', { key: cacheKey }))
      getCacheKeys()
    })
    .catch(() => {})
}

function handleCacheValue(cacheKey: string): void {
  getCacheValue(nowCacheName.value, cacheKey)
    .then((response) => {
      cacheForm.value = response.data!
    })
    .catch(() => {})
}

// 切换到键管理 Tab 时首次加载
watch(
  () => props.active,
  (val: boolean) => {
    if (val && cacheNames.value.length === 0 && !listLoading.value) {
      getCacheNames()
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
