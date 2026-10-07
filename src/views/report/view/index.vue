<template>
  <div class="p-4">
    <!-- 顶栏：大屏选择 + 模式切换 + 全屏 -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-select
        v-model="selectedId"
        :placeholder="t('rp.pickDashboard')"
        class="w-64"
        filterable
      >
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
    loadDashboards().then(() => {
      reloadTick.value++
      if (selectedId.value) {
        getDashboard(selectedId.value).then((res) => {
          charts.value = parseLayout(res.data?.layoutJson).charts
        })
      }
    })
  }
})
</script>
