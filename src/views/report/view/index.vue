<template>
  <div class="p-4">
    <!-- 顶栏：大屏选择 + 模式切换 + 全屏 -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-select
        v-model="selectedId"
        :placeholder="t('rp.pickDashboard')"
        class="w-64"
        filterable :aria-label="t('rp.pickDashboard')">
        <el-option
          v-for="d in dashboards"
          :key="d.dashboardId"
          :value="d.dashboardId"
          :label="d.dashboardName"
        />
      </el-select>
      <el-radio-group v-model="mode">
        <el-radio-button value="view">{{ t('rp.modeView') }}</el-radio-button>
        <el-radio-button value="design">{{ t('rp.modeDesign') }}</el-radio-button>
      </el-radio-group>
      <el-button
        v-if="mode === 'view' && selectedId"
        icon="FullScreen"
        plain
        @click="toggleFullscreen"
      >
        {{ t('rp.fullscreen') }}
      </el-button>
      <el-button
        v-if="mode === 'view' && selectedId"
        icon="Refresh"
        plain
        @click="reloadTick++"
      >
        {{ t('common.refresh') }}
      </el-button>
      <!-- G-01 M3：自动刷新间隔（0=关闭） -->
      <el-select v-if="mode === 'view' && selectedId" v-model="refreshInterval" class="w-28">
        <el-option :value="0" :label="t('rp.refreshOff')" />
        <el-option :value="10" :label="t('rp.refresh10s')" />
        <el-option :value="30" :label="t('rp.refresh30s')" />
        <el-option :value="60" :label="t('rp.refresh60s')" />
      </el-select>
      <!-- G-01 M3：PDF 导出 = 打印对话框（另存 PDF）；print 样式仅保留画布 -->
      <el-button
        v-if="mode === 'view' && selectedId"
        icon="Printer"
        plain
        @click="exportPdf"
      >
        {{ t('rp.exportPdf') }}
      </el-button>
    </div>

    <!-- 设计态：复用设计器画布 -->
    <Designer v-if="mode === 'design'" />

    <!-- 运行态：只读渲染 -->
    <template v-else>
      <div
        v-if="selectedId"
        ref="boardRef"
        class="report-board bg-[var(--el-bg-color)] p-2"
      >
        <el-row :gutter="12">
          <el-col v-for="c in charts" :key="c.chartId" :span="c.span" class="mb-3">
            <ChartCard :key="`${c.chartId}-${reloadTick}`" :chart="c" />
          </el-col>
        </el-row>
        <el-empty v-if="charts.length === 0" :description="t('rp.boardEmpty')" />
      </div>
      <el-empty v-else :description="t('rp.pickDashboardFirst')" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getDashboard, listDashboard, type ReportDashboard } from '@/api/report'
import { parseLayout } from '@/views/report/designer/canvasLayout'
import ChartCard from '../components/ChartCard.vue'
import Designer from '../designer/index.vue'

const { t } = useI18n()

const dashboards = ref<ReportDashboard[]>([])
const selectedId = ref<number>()
const charts = ref<ReturnType<typeof parseLayout>['charts']>([])
const mode = ref<'view' | 'design'>('view')
/** 手动刷新键：重建卡片触发数据重拉 */
const reloadTick = ref(0)
const boardRef = ref<HTMLElement>()

async function loadDashboards() {
  const res = await listDashboard()
  dashboards.value = res.rows ?? []
  if (selectedId.value && !dashboards.value.some((d: ReportDashboard) => d.dashboardId === selectedId.value)) {
    selectedId.value = undefined
  }
  if (!selectedId.value && dashboards.value.length > 0) {
    selectedId.value = dashboards.value[0].dashboardId
  }
}

watch(selectedId, async (id: number | undefined) => {
  if (!id) {
    charts.value = []
    return
  }
  const res = await getDashboard(id)
  charts.value = parseLayout(res.data?.layoutJson).charts
})

async function toggleFullscreen() {
  const el = boardRef.value
  if (!el) return
  if (document.fullscreenElement) {
    await document.exitFullscreen()
  } else {
    await el.requestFullscreen()
  }
}

onMounted(loadDashboards)

// 从设计态切回运行态时刷新布局
watch(mode, (m: 'view' | 'design') => {
  if (m === 'view') {
    // b72：整条链原先无 catch——切回运行态时若看板接口失败（401 之外的 5xx / 网络），
    // 会产生 unhandledrejection 污染前端错误遥测。失败提示仍由全局响应拦截器给出，
    // 这里只保证"结局有主"（内层 getDashboard 同样挂在链尾，一并覆盖）。
    loadDashboards()
      .then(() => {
        reloadTick.value++
        if (selectedId.value) {
          return getDashboard(selectedId.value).then((res) => {
            charts.value = parseLayout(res.data?.layoutJson).charts
          })
        }
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) console.error('[report/view] 刷新看板失败:', e)
      })
  }
})

// ==================== G-01 M3：自动刷新（递归 setTimeout，对齐 useAutoRefresh P2 范式） ====================
const refreshInterval = ref(0)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshStopped = true

function clearRefreshTimer(): void {
  refreshStopped = true
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleRefresh(): void {
  clearRefreshTimer()
  refreshStopped = false
  // 标签页隐藏时不启动（与 useVisibilityPause 同口径），间隔 0 = 关闭
  if (refreshInterval.value > 0 && !document.hidden) {
    const next = (): void => {
      refreshTimer = setTimeout(async () => {
        refreshTimer = null
        try {
          reloadTick.value++ // 重建卡片 → ChartCard onMounted 重拉数据
        } finally {
          if (refreshTimer === null && !refreshStopped) next()
        }
      }, refreshInterval.value * 1000)
    }
    next()
  }
}

watch(refreshInterval, scheduleRefresh)
onBeforeUnmount(clearRefreshTimer)

// ==================== G-01 M3：PDF 导出（打印对话框另存 PDF） ====================
function exportPdf(): void {
  window.print()
}
</script>

<!-- 样式豁免：打印场景需隐藏导航/工具栏并平铺画布（visibility 方案保留 echarts canvas），
     属「打印专项」全局级联，scoped 无法覆盖兄弟节点——限定 .report-board 作用域 -->
<style>
@media print {
  body * {
    visibility: hidden;
  }
  .report-board,
  .report-board * {
    visibility: visible;
  }
  .report-board {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
</style>
