<template>
  <div class="app-container">
    <!-- 概览统计（可折叠） -->
    <el-card class="mb8" shadow="never">
      <template #header>
        <div class="stats-header" @click="statsExpanded = !statsExpanded">
          <span class="stats-title">
            <el-icon><DataAnalysis /></el-icon>
            {{ t('frontendError.stats.title') }}
          </span>
          <el-icon class="stats-toggle" :class="{ 'is-expanded': statsExpanded }">
            <ArrowDown />
          </el-icon>
        </div>
      </template>
      <Transition name="expand-fade">
        <div v-show="statsExpanded" class="stats-body">
          <el-row :gutter="16">
            <el-col :xs="24" :sm="10">
              <div class="stats-sub">{{ t('frontendError.stats.bySource') }}</div>
              <div v-if="statsLoading" class="stats-loading">
                <el-skeleton :rows="4" animated />
              </div>
              <div v-else-if="stats && stats.bySource.length" class="source-list">
                <div v-for="s in stats.bySource" :key="s.source" class="source-row">
                  <span class="source-name">{{ sourceLabel(s.source) }}</span>
                  <el-progress
                    class="source-bar"
                    :percentage="sourcePercent(s.count)"
                    :stroke-width="12"
                    :show-text="false"
                  />
                  <span class="source-count">{{ s.count }}</span>
                </div>
              </div>
              <el-empty v-else :image-size="60" :description="t('common.empty')" />
            </el-col>
            <el-col :xs="24" :sm="14">
              <div class="stats-sub">
                {{ t('frontendError.stats.daily') }}
                <span class="stats-days">{{ t('frontendError.stats.days', { days: statsDays }) }}</span>
              </div>
              <div ref="dailyRef" class="daily-chart"></div>
            </el-col>
          </el-row>
        </div>
      </Transition>
    </el-card>

    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('frontendError.search.level')" prop="level">
          <el-select
            v-model="queryParams.level"
            :placeholder="t('frontendError.search.phLevel')"
            clearable
            class="w-[180px]"
          >
            <el-option v-for="v in levelOptions" :key="v" :label="levelLabel(v)" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('frontendError.search.source')" prop="source">
          <el-select
            v-model="queryParams.source"
            :placeholder="t('frontendError.search.phSource')"
            clearable
            class="w-[180px]"
          >
            <el-option v-for="v in sourceOptions" :key="v" :label="sourceLabel(v)" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('frontendError.search.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('frontendError.search.phName')"
            :maxlength="50"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('frontendError.search.deviceType')" prop="deviceType">
          <el-select
            v-model="queryParams.deviceType"
            :placeholder="t('frontendError.search.phDeviceType')"
            clearable
            class="w-[140px]"
          >
            <el-option v-for="v in deviceTypeOptions" :key="v" :label="deviceTypeLabel(v)" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('frontendError.search.createTime')" class="w-[308px]">
          <el-date-picker
            v-model="dateRange"
            value-format="YYYY-MM-DD HH:mm:ss"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('common.form.startDate')"
            :end-placeholder="t('common.form.endDate')"
            :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
          />
        </el-form-item>
        <el-form-item>
          <TenantFilter v-model="queryParams.tenantId" @search="handleQuery" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['monitor:frontendError:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :loading="cleanLoading"
          @click="handleClean"
          v-hasPermi="['monitor:frontendError:remove']"
        >
          {{ t('common.clear') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="refreshAll"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="8" :rows="8" />
      <el-table
        v-else
        ref="tableRef"
        v-loading="loading"
        :data="dataList"
        :row-key="(row: SysFrontendError) => row.id"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" align="center" />
        <el-table-column :label="t('frontendError.column.id')" align="center" prop="id" width="80" />
        <TenantColumn />
        <el-table-column :label="t('frontendError.column.level')" align="center" prop="level" width="90">
          <template #default="scope">
            <el-tag :type="levelTagType(scope.row.level)" size="small">{{ levelLabel(scope.row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('frontendError.column.source')" align="center" prop="source" width="120">
          <template #default="scope">
            <span>{{ sourceLabel(scope.row.source) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('frontendError.column.name')" align="center" prop="name" show-overflow-tooltip />
        <el-table-column :label="t('frontendError.column.message')" align="center" prop="message" show-overflow-tooltip>
          <template #default="scope">
            <span class="msg-cell">{{ scope.row.message }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('frontendError.column.value')" align="center" prop="value" width="100">
          <template #default="scope">
            <span>{{ scope.row.value != null ? formatVital(scope.row) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('frontendError.column.userName')"
          align="center"
          prop="userName"
          width="120"
          show-overflow-tooltip
        />
        <el-table-column :label="t('frontendError.column.createTime')" align="center" prop="createTime" width="180">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('frontendError.column.operation')"
          align="center"
          width="90"
          class-name="small-padding fixed-width"
        >
          <template #default="scope">
            <el-button
              link
              type="primary"
              icon="View"
              @click="handleDetail(scope.row)"
              v-hasPermi="['monitor:frontendError:list']"
            >
              {{ t('frontendError.btn.detail') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="t('common.empty')" />
        </template>
      </el-table>
    </Transition>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <frontend-error-detail v-model:visible="detailVisible" :row="detailRow" />
  </div>
</template>

<script setup lang="ts" name="FrontendError">
import FrontendErrorDetail from './detail.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import TenantColumn from '@/components/TenantColumn/index.vue'
import TenantFilter from '@/components/TenantFilter/index.vue'
import {
  listFrontendError,
  delFrontendError,
  cleanFrontendError,
  getFrontendErrorStats
} from '@/api/monitor/frontendError'
import type { FormInstance } from 'element-plus'
import modal from '@/plugins/modal'
import { addDateRange } from '@/utils/stepby'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useCrudTable } from '@/composables/useCrudTable'
import { useChart } from '@/composables/useChart'
import type { SysFrontendError, FrontendErrorQueryParams, FrontendErrorStats } from '@/types/api/monitor/frontendError'
import type { EChartsOption } from '@/utils/echarts'

const { t, te } = useI18n()
const queryRef = useTemplateRef('queryRef')
const tableRef = useTemplateRef('tableRef')
const dailyRef = useTemplateRef<HTMLElement>('dailyRef')
const { getChart, withDark } = useChart()

const detailVisible = ref<boolean>(false)
const detailRow = ref<SysFrontendError>({})
const cleanLoading = ref(false)
const dateRange = ref<string[]>([])

const levelOptions = ['error', 'warning', 'info']
const sourceOptions = ['vue', 'global', 'unhandledrejection', 'resource', 'api', 'download', 'vital', 'other']

function levelLabel(v?: string): string {
  if (!v) return '-'
  const key = `frontendError.level.${v}`
  return te(key) ? t(key) : v
}
function levelTagType(v?: string): 'danger' | 'warning' | 'info' {
  if (v === 'error') return 'danger'
  if (v === 'warning') return 'warning'
  return 'info'
}
function sourceLabel(v?: string): string {
  if (!v) return '-'
  const key = `frontendError.source.${v}`
  return te(key) ? t(key) : v
}
/** 设备类型分桶（FCP-011） */
const deviceTypeOptions = ['mobile', 'tablet', 'desktop']
function deviceTypeLabel(v?: string): string {
  if (!v) return '-'
  const key = `frontendError.deviceType.${v}`
  return te(key) ? t(key) : v
}
function formatVital(row: SysFrontendError): string {
  if (row.value == null) return '-'
  if (row.name === 'CLS') return String(Math.round(row.value * 1000) / 1000)
  return `${Math.round(row.value)} ms`
}

const data = reactive({
  form: {} as SysFrontendError,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    level: undefined,
    source: undefined,
    name: undefined,
    deviceType: undefined
  } as FrontendErrorQueryParams
})
const { queryParams, form } = toRefs(data)
const formRef = ref<FormInstance | null>(null)

const { dataList, loading, showSearch, multiple, total, getList, handleQuery, handleSelectionChange, handleDelete } =
  useCrudTable<SysFrontendError, FrontendErrorQueryParams>({
    listApi: (params) =>
      listFrontendError(addDateRange(params as Record<string, unknown>, dateRange.value) as FrontendErrorQueryParams),
    getApi: () => Promise.resolve({}),
    addApi: () => Promise.resolve({}),
    updateApi: () => Promise.resolve({}),
    deleteApi: (ids) => delFrontendError(ids as unknown as number | number[]),
    idField: 'id',
    defaultForm: () => ({}) as SysFrontendError,
    titleKey: 'frontendError.title',
    deleteTipKey: 'frontendError.tip.confirmDelete',
    queryParams,
    form,
    formRef,
    queryRef
  })

function resetQuery() {
  dateRange.value = []
  queryParams.value.tenantId = undefined
  queryRef.value?.resetFields()
  handleQuery()
  loadStats()
}

function handleDetail(row: SysFrontendError) {
  detailRow.value = row
  detailVisible.value = true
}

function handleClean() {
  cleanLoading.value = true
  modal
    .confirm(t('frontendError.tip.confirmClear'))
    .then(() => {
      const params = dateRange.value.length ? addDateRange({}, dateRange.value) : undefined
      return cleanFrontendError(params as Record<string, unknown> | undefined)
    })
    .then(() => {
      getList()
      loadStats()
      modal.msgSuccess(t('frontendError.tip.clearSuccess'))
    })
    .catch(() => {})
    .finally(() => {
      cleanLoading.value = false
    })
}

// ==================== 概览统计 ====================
const statsExpanded = ref(true)
const statsLoading = ref(false)
const stats = ref<FrontendErrorStats | null>(null)
const statsDays = 7

const sourceTotal = computed<number>(() => {
  const arr: FrontendErrorStats['bySource'] = stats.value?.bySource || []
  return arr.reduce((s, x) => s + x.count, 0)
})
function sourcePercent(count: number): number {
  if (sourceTotal.value === 0) return 0
  return Math.round((count / sourceTotal.value) * 100)
}

async function loadStats(): Promise<void> {
  statsLoading.value = true
  try {
    const res = await getFrontendErrorStats(statsDays)
    stats.value = (res.data || { bySource: [], daily: [] }) as FrontendErrorStats
    await renderDailyChart()
  } catch {
    stats.value = null
  } finally {
    statsLoading.value = false
  }
}

async function renderDailyChart(): Promise<void> {
  const el = dailyRef.value
  if (!el) return
  const chart = await getChart(el)
  if (!chart) return
  const daily: FrontendErrorStats['daily'] = stats.value?.daily || []
  const option: EChartsOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 36, right: 16, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: daily.map((d) => d.date.slice(5)) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: t('frontendError.level.error'),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: daily.map((d) => d.count)
      }
    ]
  }
  chart.setOption(withDark(chart, option), true)
}

function refreshAll() {
  getList()
  loadStats()
}

getList()
loadStats()
// 自动刷新：跟随页面刷新回调，同时刷新统计
useAutoRefresh(() => refreshAll())
</script>

<style scoped>
.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.stats-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.stats-toggle {
  transition: transform 0.2s ease;
}
.stats-toggle.is-expanded {
  transform: rotate(180deg);
}
.stats-body {
  overflow: hidden;
}
.stats-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}
.stats-days {
  font-weight: 400;
  margin-left: 6px;
  color: var(--el-text-color-placeholder);
}
.source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.source-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.source-name {
  width: 84px;
  flex-shrink: 0;
  font-size: 12px;
}
.source-bar {
  flex: 1;
}
.source-count {
  width: 40px;
  text-align: right;
  font-size: 12px;
}
.daily-chart {
  width: 100%;
  height: 200px;
}
.msg-cell {
  font-size: 12px;
}
</style>
