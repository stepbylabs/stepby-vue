<template>
  <!-- 事件目录对话框：展示可订阅事件清单（event_key/名称/说明/负载样例/状态） -->
  <el-dialog
    :title="t('webHook.eventCatalog.title')"
    v-model="open"
    width="min(92%, 860px)"
    append-to-body
    destroy-on-close
    @open="loadEventCatalog(true)"
  >
    <el-table
      v-loading="eventCatalogLoading"
      :data="eventCatalog"
      :row-key="(row: WebhookEventVo) => row.id"
      @sort-change="handleEventCatalogSortChange"
    >
      <el-table-column
        :label="t('webHook.eventCatalog.eventKey')"
        prop="eventKey"
        min-width="160"
        show-overflow-tooltip
        sortable="custom"
      />
      <el-table-column
        :label="t('webHook.eventCatalog.name')"
        prop="name"
        min-width="140"
        show-overflow-tooltip
        sortable="custom"
      />
      <el-table-column :label="t('webHook.eventCatalog.description')" min-width="200" show-overflow-tooltip>
        <template #default="scope">
          <span>{{ scope.row.description || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('webHook.eventCatalog.payloadExample')" min-width="220">
        <template #default="scope">
          <pre class="result-pre">{{ scope.row.payloadExample || '-' }}</pre>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('webHook.column.status')"
        align="center"
        width="120"
        prop="enabled"
        sortable="custom"
      >
        <template #default="scope">
          <!-- 停用 = 目录下架展示并拒绝新订阅与测试发送；存量 hook 投递不中断 -->
          <el-switch
            v-if="checkPermi(['system:webhook:event:edit'])"
            :model-value="scope.row.enabled === '1'"
            :loading="eventEnabledLoadingId === scope.row.id"
            @change="(val: string | number | boolean) => handleEventEnabledChange(scope.row, val)"
          />
          <el-tag v-else :type="scope.row.enabled === '1' ? 'success' : 'info'" size="small">
            {{ scope.row.enabled === '1' ? t('common.enabled') : t('common.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('common.empty')" />
      </template>
    </el-table>
    <pagination
      v-show="eventCatalogTotal > 0"
      :total="eventCatalogTotal"
      v-model:page="eventCatalogQuery.pageNum"
      v-model:limit="eventCatalogQuery.pageSize"
      @pagination="loadEventCatalog()"
    />
    <template #footer>
      <el-button @click="open = false">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="EventCatalogSection">
import { listWebhookEvents, changeWebhookEventEnabled } from '@/api/system/webHook'
import type { WebhookEventVo, WebhookEventQueryParams } from '@/types/api/system/webHook'
import { checkPermi } from '@/utils/permission'
import modal from '@/plugins/modal'

const { t } = useI18n()

interface EventCatalogOption {
  value: string
  label: string
  disabled: boolean
}

// 对话框开关由父组件控制（工具栏按钮打开）；全量下拉选项由本组件加载并回传父组件复用
const open = defineModel<boolean>('open', { required: true })
const options = defineModel<EventCatalogOption[]>('options', { required: true })

// ==================== 事件目录（GET /system/webhook/event/list） ====================
const eventCatalogLoading = ref(false)
const eventCatalog = ref<WebhookEventVo[]>([])
const eventCatalogTotal = ref(0)
// 目录是否已加载过（多选下拉/测试发送复用，避免重复请求）
const eventCatalogLoaded = ref(false)
const eventCatalogQuery = reactive<WebhookEventQueryParams>({ pageNum: 1, pageSize: 10 })

/** 加载事件目录（force=true 时重新拉取，如目录对话框分页） */
function loadEventCatalog(force = false): void {
  if (eventCatalogLoading.value) return
  if (eventCatalogLoaded.value && !force) return
  eventCatalogLoading.value = true
  listWebhookEvents({ ...eventCatalogQuery })
    .then((res) => {
      eventCatalog.value = res.rows || []
      eventCatalogTotal.value = res.total || 0
      eventCatalogLoaded.value = true
    })
    .catch(() => {})
    .finally(() => {
      eventCatalogLoading.value = false
    })
}

/** 排序触发事件（服务端排序：透传 orderByColumn/isAsc，仅白名单列可触发） */
function handleEventCatalogSortChange(column: { prop: string | null; order: string | null }): void {
  eventCatalogQuery.orderByColumn = column.prop ?? undefined
  eventCatalogQuery.isAsc = column.order ?? undefined
  loadEventCatalog(true)
}

// 缺陷修复：下拉数据源与目录对话框脱钩——此前订阅/测试发送下拉复用第一页
// 分页数据（pageSize=10），事件目录超过一页时下拉选项缺失。事件目录为系统级
// 枚举（量级有限），下拉统一全量拉取（pageSize: 500 覆盖足够）。
const eventOptionsFull = ref<WebhookEventVo[]>([])
const eventOptionsLoading = ref(false)

/** 全量加载事件目录（供订阅/测试发送下拉；防重入） */
function loadEventOptionsFull(): void {
  if (eventOptionsLoading.value) return
  eventOptionsLoading.value = true
  listWebhookEvents({ pageNum: 1, pageSize: 500 })
    .then((res) => {
      eventOptionsFull.value = res.rows || []
      // 下拉全量拉取上限保护：命中上限说明数据可能被截断（后端 limit 归后端变更，此处仅 DEV 提示）
      if (import.meta.env.DEV && (res.rows?.length ?? 0) >= 500) {
        console.warn('[webHook] 事件目录下拉拉取达到 pageSize=500 上限，可能存在截断')
      }
    })
    .catch(() => {})
    .finally(() => {
      eventOptionsLoading.value = false
    })
}

// 目录下拉选项（停用事件在测试发送中禁用；名称与 event_key 一并展示）
const eventCatalogOptions = computed(() =>
  eventOptionsFull.value.map((e: WebhookEventVo) => ({
    value: e.eventKey,
    label: e.name ? `${e.name} (${e.eventKey})` : e.eventKey,
    disabled: e.enabled !== '1'
  }))
)

// 回传父组件（订阅下拉/测试发送下拉/行内测试发送下拉共用）
watchEffect(() => {
  options.value = eventCatalogOptions.value
})

// 组件创建即拉取一次（表格行内测试发送下拉直接可用）；对话框打开时再次调用
// 会因防重入跳过，若首次因瞬时失败为空则重拉兜底
loadEventOptionsFull()

// ==================== 事件目录停用/启用（system:webhook:event:edit） ====================
// 语义：停用 = 目录下架展示并拒绝新订阅与测试发送；存量 hook 投递不中断
const eventEnabledLoadingId = ref<number | string | null>(null)

async function handleEventEnabledChange(
  row: WebhookEventVo,
  val: string | number | boolean
): Promise<void> {
  const target = val === true || val === '1' ? '1' : '0'
  const prev = row.enabled
  eventEnabledLoadingId.value = row.id
  try {
    await changeWebhookEventEnabled(row.id, target)
    row.enabled = target
    // 目录状态变化影响测试发送下拉的可用项，重新拉取
    await loadEventOptionsFull()
    modal.msgSuccess(t('common.success'))
  } catch {
    row.enabled = prev
  } finally {
    eventEnabledLoadingId.value = null
  }
}

defineExpose({
  /** 供父组件在打开表单/测试对话框时兜底重拉全量下拉（防重入逻辑在本组件内） */
  reloadOptions: loadEventOptionsFull
})
</script>

<style lang="scss" scoped>
.result-pre {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
}
</style>
