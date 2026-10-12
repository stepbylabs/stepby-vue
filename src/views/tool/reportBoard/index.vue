<template>
  <div class="app-container" v-loading="loading">
    <!-- 顶栏：看板选择 + 模式切换 + 数据范围 -->
    <el-card shadow="hover" class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <span class="flex items-center gap-2 text-base font-semibold">
          <el-icon><DataBoard /></el-icon>
          {{ t('reportBoard.title') }}
        </span>
        <el-tag type="info" size="small">{{ t('reportBoard.desc') }}</el-tag>

        <div class="flex-1" />

        <el-select
          v-model="activeId"
          :placeholder="t('reportBoard.selectBoard')"
          class="w-[200px]"
          clearable
          @change="onBoardChange" :aria-label="t('reportBoard.selectBoard')">
          <el-option v-for="b in boards" :key="b.id" :value="b.id" :label="b.name" />
        </el-select>

        <el-button icon="Plus" v-hasPermi="['tool:reportBoard:save']" @click="createBoard">{{
          t('reportBoard.newBoard')
        }}</el-button>
        <el-button
          v-if="activeBoard"
          icon="Delete"
          type="danger"
          plain
          v-hasPermi="['tool:reportBoard:save']"
          @click="removeBoard"
        >
          {{ t('reportBoard.deleteBoard') }}
        </el-button>

        <el-radio-group v-model="range" size="small" @change="refreshData">
          <el-radio-button value="7d">{{ t('reportBoard.range7d') }}</el-radio-button>
          <el-radio-button value="30d">{{ t('reportBoard.range30d') }}</el-radio-button>
        </el-radio-group>

        <el-button icon="Refresh" @click="refreshData">{{ t('reportBoard.refresh') }}</el-button>

        <el-switch
          v-model="editing"
          :active-text="t('reportBoard.modeEdit')"
          :inactive-text="t('reportBoard.modeView')"
          v-hasPermi="['tool:reportBoard:save']"
        />

        <template v-if="editing">
          <el-button type="primary" icon="Plus" @click="openAddDialog">
            {{ t('reportBoard.addCard') }}
          </el-button>
          <el-button type="success" icon="Check" :disabled="!activeBoard" @click="saveBoard">
            {{ t('reportBoard.save') }}
          </el-button>
        </template>
      </div>
    </el-card>

    <!-- 空态：无看板 -->
    <el-card v-if="!activeBoard" shadow="never">
      <el-empty :description="t('reportBoard.noBoard')" />
    </el-card>

    <!-- 卡片网格（Tailwind 2 列网格，尺寸由 config.size 控制 1x1/2x1/2x2） -->
    <div v-else-if="config.cards.length" class="grid grid-cols-2 gap-4 auto-rows-[240px]">
      <el-card
        v-for="c in config.cards"
        :key="c.id"
        shadow="hover"
        :class="sizeToGridClass(c.size)"
        class="board-card relative overflow-hidden"
      >
        <!-- 编辑模式：删除卡片按钮 -->
        <el-button
          v-if="editing"
          class="absolute right-2 top-2 z-10"
          link
          type="danger"
          icon="Delete"
          v-hasPermi="['tool:reportBoard:save']"
          :aria-label="t('reportBoard.deleteCard')"
          @click="deleteCard(c.id)"
        />
        <!-- 局部失败占位：该卡片数据源加载失败（全局错误由拦截器弹错，此处仅展示占位） -->
        <div v-if="failedSources.has(c.sourceKey)" class="h-full w-full flex items-center justify-center">
          <el-empty :image-size="60" :description="t('reportBoard.dataLoadFail')" />
        </div>
        <!-- 图表容器（ECharts，useChart 复用实例 + ResizeObserver 自适应） -->
        <div v-else :ref="(el) => setChartEl(c.id, el)" class="h-full w-full" />
      </el-card>
    </div>

    <!-- 空态：看板无卡片 -->
    <el-card v-else shadow="never">
      <el-empty :description="t('reportBoard.empty')">
        <template #image>
          <el-icon :size="48" class="text-text-secondary"><DataAnalysis /></el-icon>
        </template>
        <el-button type="primary" v-hasPermi="['tool:reportBoard:save']" @click="openAddDialog">{{ t('reportBoard.addCard') }}</el-button>
        <p class="mt-2 text-sm text-text-secondary">{{ t('reportBoard.emptyHint') }}</p>
      </el-empty>
    </el-card>

    <!-- 添加卡片对话框（表单配置，非拖拽——大屏路线 v1） -->
    <el-dialog v-model="dialogVisible" :title="t('reportBoard.addCard')" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item :label="t('reportBoard.cardTitle')" required>
          <el-input v-model="form.title" maxlength="64" :placeholder="t('reportBoard.cardTitlePlaceholder')" :aria-label="t('reportBoard.cardTitlePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('reportBoard.chartType')" required>
          <el-radio-group v-model="form.chartType">
            <el-radio-button value="line">{{ t('reportBoard.chartLine') }}</el-radio-button>
            <el-radio-button value="bar">{{ t('reportBoard.chartBar') }}</el-radio-button>
            <el-radio-button value="pie">{{ t('reportBoard.chartPie') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('reportBoard.sourceKey')" required>
          <el-select
            v-model="form.sourceKey"
            :placeholder="t('reportBoard.sourceKeyPlaceholder')"
            class="w-full" :aria-label="t('reportBoard.sourceKeyPlaceholder')">
            <el-option v-for="s in sources" :key="s.sourceKey" :value="s.sourceKey" :label="s.name" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('reportBoard.size')" required>
          <el-radio-group v-model="form.sizeKey">
            <el-radio-button value="1x1">{{ t('reportBoard.sizeSmall') }}</el-radio-button>
            <el-radio-button value="2x1">{{ t('reportBoard.sizeWide') }}</el-radio-button>
            <el-radio-button value="2x2">{{ t('reportBoard.sizeLarge') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('reportBoard.cancel') }}</el-button>
        <el-button type="primary" @click="confirmAddCard">{{ t('reportBoard.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="ToolReportBoard">
import { DataBoard, DataAnalysis } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'
import type { EChartsOption } from '@/utils/echarts'
import { readCssVar, useChart } from '@/composables/useChart'
import {
  addBoard,
  deleteBoard as deleteBoardApi,
  getSourceData,
  listBoards,
  listSources,
  updateBoard,
  type BoardVo,
  type ChartType,
  type ReportBoardConfig,
  type ReportCard,
  type SourceMeta,
  type SourcePoint,
  type SourceRange
} from '@/api/tool/reportBoard'
import {
  addCard,
  genCardId,
  parseConfig,
  removeCard,
  sizeToGridClass,
  validateConfig
} from '@/utils/reportBoard'

const { t } = useI18n()

/** useChart：图表实例复用 + ResizeObserver 尺寸自适应 + 卸载清理 */
const { getChart, withDark } = useChart()

// ==================== 状态 ====================

const loading = ref(false)
/** 看板清单（本人） */
const boards = ref<BoardVo[]>([])

/** 当前选中看板 ID */
const activeId = ref<number | null>(null)
/** 当前看板（选中项） */
const activeBoard = computed(() => boards.value.find((b: BoardVo) => b.id === activeId.value) ?? null)
/** 工作副本配置（编辑后需保存才持久化） */
const config = ref<ReportBoardConfig>({ cards: [] })
/** 数据源白名单（来自后端 /sources） */
const sources = ref<SourceMeta[]>([])
/** 时间范围 */
const range = ref<SourceRange>('7d')
/** 查看 / 编辑模式 */
const editing = ref(false)
/** 数据缓存：sourceKey → 数据点（同一 sourceKey 的卡片共享一次请求） */
const dataMap = ref<Map<string, SourcePoint[]>>(new Map())
/** 加载失败的数据源（对应卡片显示局部失败占位） */
const failedSources = ref<Set<string>>(new Set())

/** 添加卡片对话框 */
const dialogVisible = ref(false)
const form = reactive<{
  title: string
  chartType: ChartType
  sourceKey: string
  sizeKey: '1x1' | '2x1' | '2x2'
}>({ title: '', chartType: 'line', sourceKey: '', sizeKey: '1x1' })

/** 图表容器元素缓存：卡片 id → DOM */
const chartEls = new Map<string, HTMLElement>()

function setChartEl(id: string, el: Element | ComponentPublicInstance | null): void {
  if (el instanceof HTMLElement) chartEls.set(id, el)
  else chartEls.delete(id)
}

// ==================== 数据加载 ====================

onMounted(async () => {
  loading.value = true
  try {
    // 数据源白名单（下拉与保存校验的唯一依据）
    const srcResp = await listSources()
    sources.value = srcResp.data ?? []
    // 看板清单，默认选中第一个
    const boardResp = await listBoards()
    boards.value = boardResp.data ?? []
    if (boards.value.length) {
      activeId.value = boards.value[0].id
      await onBoardChange()
    }
  } finally {
    loading.value = false
  }
})

/** 切换看板：加载该看板配置并刷新数据 */
async function onBoardChange(): Promise<void> {
  if (!activeId.value) {
    config.value = { cards: [] }
    return
  }
  const board = activeBoard.value
  if (!board) return
  // 清单数据已含 config，直接取用（避免多一次详情请求）
  config.value = parseConfig(board.config) ?? { cards: [] }
  await refreshData()
}

/** 拉取看板所有 sourceKey 的数据并渲染图表（同一 sourceKey 只请求一次） */
async function refreshData(): Promise<void> {
  const cards: ReportCard[] = config.value.cards
  const keys: string[] = [...new Set<string>(cards.map((c: ReportCard) => c.sourceKey))]
  // 错误提示由 @/utils/request 响应拦截器 errorHub 统一弹出，此处仅记录失败源展示占位
  failedSources.value.clear()
  const results = await Promise.all(
    keys.map(async (key: string): Promise<readonly [string, SourcePoint[]]> => {
      try {
        const resp = await getSourceData(key, range.value)
        failedSources.value.delete(key)
        return [key, resp.data?.items ?? []]
      } catch {
        failedSources.value.add(key)
        return [key, []]
      }
    })
  )
  dataMap.value = new Map(results)
  await renderCharts()
}

// ==================== 图表渲染 ====================

/** 构建单卡片 ECharts 配置（line/bar 共用直角坐标系，pie 用扇区） */
function buildOption(card: ReportCard): EChartsOption {
  const items: SourcePoint[] = dataMap.value.get(card.sourceKey) ?? []
  const textColor = readCssVar('--el-text-color-primary', '#333')
  if (card.chartType === 'pie') {
    return {
      title: { text: card.title, left: 'center', textStyle: { fontSize: 13, color: textColor } },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['30%', '58%'],
          center: ['50%', '48%'],
          data: items.map((i: SourcePoint) => ({ name: i.label, value: i.value }))
        }
      ]
    }
  }
  return {
    title: { text: card.title, left: 'center', textStyle: { fontSize: 13, color: textColor } },
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 16, top: 40, bottom: 28 },
    xAxis: { type: 'category', data: items.map((i: SourcePoint) => i.label), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value' },
    series: [{ type: card.chartType, data: items.map((i: SourcePoint) => i.value), smooth: card.chartType === 'line' }]
  }
}

/** 逐卡片渲染图表（nextTick 等待 DOM 挂载；useChart 复用实例防内存泄漏） */
async function renderCharts(): Promise<void> {
  await nextTick()
  for (const card of config.value.cards) {
    const el = chartEls.get(card.id)
    if (!el) continue
    const chart = await getChart(el)
    if (chart) chart.setOption(withDark(chart, buildOption(card)), true)
  }
}

// ==================== 编辑操作 ====================

/** 打开添加卡片对话框（重置表单） */
function openAddDialog(): void {
  form.title = ''
  form.chartType = 'line'
  form.sourceKey = ''
  form.sizeKey = '1x1'
  dialogVisible.value = true
}

/** 确认添加卡片：前端校验（与后端同口径）后加入工作副本并即时预览 */
function confirmAddCard(): void {
  const sizeMap: Record<string, { w: 1 | 2; h: 1 | 2 }> = {
    '1x1': { w: 1, h: 1 },
    '2x1': { w: 2, h: 1 },
    '2x2': { w: 2, h: 2 }
  }
  const newCard: ReportCard = {
    id: genCardId(),
    title: form.title.trim(),
    chartType: form.chartType,
    sourceKey: form.sourceKey,
    size: sizeMap[form.sizeKey]
  }
  const next = addCard(config.value.cards, newCard)
  const reason = validateConfig({ cards: next }, allowedKeys())
  if (reason) {
    ElMessage.warning(t(reasonToI18n(reason)))
    return
  }
  config.value = { cards: next }
  dialogVisible.value = false
  void refreshData()
}

/** 删除卡片（编辑模式，工作副本内移除并重渲染） */
function deleteCard(id: string): void {
  config.value = { cards: removeCard(config.value.cards, id) }
  void refreshData()
}

/** 白名单 sourceKey 集合（来自 /sources；为空时回退已加载源，防误拒） */
function allowedKeys(): string[] {
  return sources.value.map((s: SourceMeta) => s.sourceKey)
}

/** 校验原因码 → i18n key */
function reasonToI18n(reason: string): string {
  switch (reason) {
    case 'count':
      return t('reportBoard.errCount', { max: 24 })
    case 'id':
      return t('reportBoard.errId')
    case 'title':
      return t('reportBoard.errTitle')
    case 'size':
      return t('reportBoard.errSize')
    default:
      return t('reportBoard.errSource')
  }
}

/** 保存看板（PUT config 全量覆盖；保存前做与后端一致的强校验） */
async function saveBoard(): Promise<void> {
  if (!activeId.value) return
  const reason = validateConfig(config.value, allowedKeys())
  if (reason) {
    ElMessage.warning(t(reasonToI18n(reason)))
    return
  }
  loading.value = true
  try {
    await updateBoard(activeId.value, { config: config.value })
    ElMessage.success(t('reportBoard.saveSuccess'))
  } finally {
    loading.value = false
  }
}

// ==================== 看板管理 ====================

/** 新建看板：弹窗输入名称 → POST → 选中新看板 */
async function createBoard(): Promise<void> {
  const { value } = await ElMessageBox.prompt(
    t('reportBoard.boardName'),
    t('reportBoard.newBoard'),
    {
      inputPattern: /^.{1,64}$/u,
      inputPlaceholder: t('reportBoard.boardNamePlaceholder'),
      inputErrorMessage: t('reportBoard.nameRequired')
    }
  )
  const name = value.trim()
  if (!name) return
  const resp = await addBoard({ name, config: { cards: [] } })
  if (resp.data) {
    boards.value.unshift(resp.data)
    activeId.value = resp.data.id
    await onBoardChange()
  }
}

/** 删除当前看板（二次确认） */
async function removeBoard(): Promise<void> {
  if (!activeId.value) return
  await ElMessageBox.confirm(t('reportBoard.confirmDeleteBoard'), t('reportBoard.deleteBoard'), {
    type: 'warning'
  })
  await deleteBoardApi(activeId.value)
  boards.value = boards.value.filter((b: BoardVo) => b.id !== activeId.value)
  activeId.value = boards.value.length ? boards.value[0].id : null
  await onBoardChange()
}
</script>

<style lang="scss" scoped>
.board-card {
  :deep(.el-card__body) {
    height: 100%;
    padding: 8px;
  }
}
</style>
