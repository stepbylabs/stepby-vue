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
          @change="onBoardChange"
          :aria-label="t('reportBoard.selectBoard')"
        >
          <el-option v-for="b in boards" :key="b.id" :value="b.id" :label="b.name" />
        </el-select>

        <el-button icon="Plus" v-hasPermi="['tool:reportBoard:save']" @click="createBoard">
          {{ t('reportBoard.newBoard') }}
        </el-button>
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

        <el-radio-group v-model="range" size="small" @change="onRangeChange">
          <el-radio-button value="7d">{{ t('reportBoard.range7d') }}</el-radio-button>
          <el-radio-button value="30d">{{ t('reportBoard.range30d') }}</el-radio-button>
        </el-radio-group>

        <el-button icon="Refresh" @click="refreshData">{{ t('reportBoard.refresh') }}</el-button>

        <el-switch
          v-model="editing"
          :active-text="t('reportBoard.modeEdit')"
          :inactive-text="t('reportBoard.modeView')"
          :aria-label="t('reportBoard.modeToggle')"
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

    <!-- 初始加载失败是第三种状态：既不是"没有看板"也不是"看板为空"（b141） -->
    <el-alert
      v-if="pageLoadError"
      type="error"
      :closable="false"
      show-icon
      class="mb-2"
      :title="t('common.loadFailed')"
    >
      <el-button link type="primary" @click="loadPage">{{ t('common.retry') }}</el-button>
    </el-alert>

    <!-- 空态：无看板（只在加载成功后显示） -->
    <el-card v-else-if="!activeBoard" shadow="never">
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
        <!-- 局部失败且从未成功过：失败占位（可重试；此时没有任何旧图可展示） -->
        <div
          v-if="failedSources.has(c.sourceKey) && !sourceLoadedAt.has(c.sourceKey)"
          class="h-full w-full flex items-center justify-center"
        >
          <el-empty :image-size="60" :description="t('reportBoard.dataLoadFail')">
            <el-button link type="primary" @click="refreshData">{{ t('common.retry') }}</el-button>
          </el-empty>
        </div>
        <!-- 图表容器（ECharts，useChart 复用实例 + ResizeObserver 自适应） -->
        <div v-else :ref="(el) => setChartEl(c.id, el)" class="h-full w-full" />
        <!-- 失败但已有旧快照：旧图继续展示，徽标写明"几点的数据"（b109） -->
        <div
          v-if="failedSources.has(c.sourceKey) && sourceLoadedAt.has(c.sourceKey)"
          class="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded bg-[var(--el-color-warning-light-9)] px-2 py-1 text-xs text-[var(--el-color-warning-dark-2)]"
        >
          <el-icon><Warning /></el-icon>
          <span class="truncate">{{ staleSnapshotText(c.sourceKey) }}</span>
          <el-button link type="primary" size="small" @click="refreshData">{{ t('common.retry') }}</el-button>
        </div>
      </el-card>
    </div>

    <!-- 空态：看板无卡片 -->
    <el-card v-else shadow="never">
      <el-empty :description="t('reportBoard.empty')">
        <template #image>
          <el-icon :size="48" class="text-text-secondary"><DataAnalysis /></el-icon>
        </template>
        <el-button type="primary" v-hasPermi="['tool:reportBoard:save']" @click="openAddDialog">
          {{ t('reportBoard.addCard') }}
        </el-button>
        <p class="mt-2 text-sm text-text-secondary">{{ t('reportBoard.emptyHint') }}</p>
      </el-empty>
    </el-card>

    <!-- 添加卡片对话框（表单配置，非拖拽——大屏路线 v1） -->
    <el-dialog v-model="dialogVisible" :title="t('reportBoard.addCard')" :before-close="beforeAddClose" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item :label="t('reportBoard.cardTitle')" required>
          <el-input
            v-model="form.title"
            maxlength="64"
            :placeholder="t('reportBoard.cardTitlePlaceholder')"
            :aria-label="t('reportBoard.cardTitlePlaceholder')"
          />
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
            class="w-full"
            :aria-label="t('reportBoard.sourceKeyPlaceholder')"
          >
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
        <el-button @click="cancelAdd">{{ t('reportBoard.cancel') }}</el-button>
        <el-button type="primary" @click="confirmAddCard">{{ t('reportBoard.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="ToolReportBoard">
import { DataBoard, DataAnalysis, Warning } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'
import type { EChartsOption } from '@/utils/echarts'
import { formatClockTime } from '@/utils'
import { readCssVar, useChart } from '@/composables/useChart'
import { createLatestGuard } from '@/composables/latestRequest'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
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
import { addCard, genCardId, parseConfig, removeCard, sizeToGridClass, validateConfig } from '@/utils/reportBoard'

const { t } = useI18n()

/** useChart：图表实例复用 + ResizeObserver 尺寸自适应 + 卸载清理 */
const { getChart, withDark } = useChart()

// ==================== 状态 ====================

const loading = ref(false)
/** 初始加载（数据源白名单 + 看板清单）失败：与"没有看板"是两种状态（b141） */
const pageLoadError = ref(false)
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
/** 加载失败的数据源（对应卡片显示局部失败占位或"陈旧快照"徽标） */
const failedSources = ref<Set<string>>(new Set())
/** 数据源快照时刻：sourceKey → 最近一次成功取数的毫秒时间戳（b109：陈旧必须说得出"几点的数据"） */
const sourceLoadedAt = ref<Map<string, number>>(new Map())
/** 刷新守卫：快速切换看板/范围时只让最后一次请求的结局生效（b119 单一实现） */
const refreshGuard = createLatestGuard()

/** 添加卡片对话框 */
const dialogVisible = ref(false)
const form = reactive<{
  title: string
  chartType: ChartType
  sourceKey: string
  sizeKey: '1x1' | '2x1' | '2x2'
}>({ title: '', chartType: 'line', sourceKey: '', sizeKey: '1x1' })
// 关闭语义（b135）：卡片参数填一半按 Esc / 点遮罩原先会静默丢弃
const { beforeClose: beforeAddClose, cancel: cancelAdd } = useDialogDirtyGuard(dialogVisible, form)

/** 图表容器元素缓存：卡片 id → DOM */
const chartEls = new Map<string, HTMLElement>()

function setChartEl(id: string, el: Element | ComponentPublicInstance | null): void {
  if (el instanceof HTMLElement) chartEls.set(id, el)
  else chartEls.delete(id)
}

// ==================== 数据加载 ====================

onMounted(loadPage)

/**
 * 页面初始加载：数据源白名单 + 看板清单，任一失败都算整页没读到。
 * 白名单是保存校验的唯一依据，缺失时"能看不能存"是假可用 ⇒ 两者同进同退（b141）。
 */
async function loadPage(): Promise<void> {
  loading.value = true
  pageLoadError.value = false
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
    } else {
      activeId.value = null
      config.value = { cards: [] }
    }
  } catch (e) {
    // 失败态必须与"没有看板"可区分：清掉半截数据，整页交给失败提示 + 重试
    pageLoadError.value = true
    boards.value = []
    activeId.value = null
    config.value = { cards: [] }
    if (import.meta.env.DEV) console.error('[reportBoard] loadPage:', e)
  } finally {
    loading.value = false
  }
}

/** 切换看板：加载该看板配置并刷新数据 */
async function onBoardChange(): Promise<void> {
  // 查询身份变了 ⇒ 旧快照必须先丢（否则新看板失败时屏上留着上一个看板的数据）
  resetSnapshots()
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

/** 切换时间范围：同样是"换了一个问题"，旧范围的快照不得冒充新范围的结果 */
function onRangeChange(): void {
  resetSnapshots()
  void refreshData()
}

/**
 * 查询身份变了（换看板 / 换时间范围）就必须丢弃旧快照：
 * 否则新看板/新范围取数失败时屏上留着的是**上一个看板或上一个范围**的数据，
 * 还挂着"陈旧"徽标，读报表的人会把旧结论当成新范围的结果（b109，同 b108 日志页）。
 */
function resetSnapshots(): void {
  // 票据前移 ⇒ 任何在飞的旧请求结局直接作废，不得在下一次取数之前回填旧数据
  refreshGuard.invalidate()
  dataMap.value = new Map()
  failedSources.value = new Set()
  sourceLoadedAt.value = new Map()
}

/** 拉取看板所有 sourceKey 的数据并渲染图表（同一 sourceKey 只请求一次） */
async function refreshData(): Promise<void> {
  const my = refreshGuard.begin()
  const cards: ReportCard[] = config.value.cards
  const keys: string[] = [...new Set<string>(cards.map((c: ReportCard) => c.sourceKey))]
  // 错误提示由 @/utils/request 响应拦截器 errorHub 统一弹出，此处记录失败源并区分"有无旧快照"
  const results = await Promise.all(
    keys.map(async (key: string): Promise<readonly [string, SourcePoint[], boolean]> => {
      try {
        const resp = await getSourceData(key, range.value)
        return [key, resp.data?.items ?? [], true]
      } catch {
        return [key, [], false]
      }
    })
  )
  // 后发先回：旧请求的结局一律丢弃（既不覆盖数据，也不改失败集合）
  if (!refreshGuard.isCurrent(my)) return
  const nextData = new Map<string, SourcePoint[]>(dataMap.value)
  const nextAt = new Map<string, number>(sourceLoadedAt.value)
  const nextFailed = new Set<string>()
  for (const [key, items, ok] of results) {
    if (ok) {
      nextData.set(key, items)
      nextAt.set(key, Date.now())
    } else {
      nextFailed.add(key)
      // 失败且从未成功过 ⇒ 没有旧图可留，清掉占位数据；有快照则保留旧值（旧图继续展示）
      if (!nextAt.has(key)) nextData.set(key, [])
    }
  }
  dataMap.value = nextData
  failedSources.value = nextFailed
  sourceLoadedAt.value = nextAt
  await renderCharts()
}

/** 卡片上的陈旧徽标文案（时刻取该数据源最近一次成功取数） */
function staleSnapshotText(key: string): string {
  return t('reportBoard.staleSnapshot', { time: formatClockTime(sourceLoadedAt.value.get(key) ?? null) })
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
  } catch (e) {
    // 失败提示由 @/utils/request 拦截器统一弹出；此处只阻止拒绝逸出（async 事件处理器的拒绝会被全局 errorHandler 接管）
    if (import.meta.env.DEV) console.error('[reportBoard] saveBoard:', e)
  } finally {
    loading.value = false
  }
}

// ==================== 看板管理 ====================

/** 新建看板：弹窗输入名称 → POST → 选中新看板 */
async function createBoard(): Promise<void> {
  let name: string
  try {
    const { value } = await ElMessageBox.prompt(t('reportBoard.boardName'), t('reportBoard.newBoard'), {
      inputPattern: /^.{1,64}$/u,
      inputPlaceholder: t('reportBoard.boardNamePlaceholder'),
      inputErrorMessage: t('reportBoard.nameRequired')
    })
    name = value.trim()
  } catch {
    return // 取消/关闭：不产生副作用，也不得把拒绝逸出成全局错误
  }
  if (!name) {
    ElMessage.warning(t('reportBoard.nameRequired'))
    return
  }
  loading.value = true
  try {
    const resp = await addBoard({ name, config: { cards: [] } })
    const created = resp.data
    if (!created) {
      // 200 但没有看板载荷 ⇒ 本次创建结果未知，不得静默当成功（界面会停在旧状态）
      ElMessage.warning(t('reportBoard.createUnknown'))
      return
    }
    boards.value.unshift(created)
    activeId.value = created.id
    await onBoardChange()
  } catch (e) {
    if (import.meta.env.DEV) console.error('[reportBoard] createBoard:', e)
  } finally {
    loading.value = false
  }
}

/** 删除当前看板（二次确认） */
async function removeBoard(): Promise<void> {
  if (!activeId.value) return
  try {
    await ElMessageBox.confirm(t('reportBoard.confirmDeleteBoard'), t('reportBoard.deleteBoard'), {
      type: 'warning'
    })
  } catch {
    return // 取消：不产生副作用，也不得把拒绝逸出成全局错误
  }
  try {
    await deleteBoardApi(activeId.value)
    boards.value = boards.value.filter((b: BoardVo) => b.id !== activeId.value)
    activeId.value = boards.value.length ? boards.value[0].id : null
    await onBoardChange()
  } catch (e) {
    // 拦截器已提示；阻止拒绝逸出（async 事件处理器的拒绝会被全局 errorHandler 接管）
    if (import.meta.env.DEV) console.error('[reportBoard] removeBoard:', e)
  }
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
