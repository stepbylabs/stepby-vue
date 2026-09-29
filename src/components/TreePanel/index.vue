<template>
  <div
    class="tree-sidebar flex flex-col overflow-hidden relative bg-bg-overlay border-r border-border-light shrink-0"
    :class="{ collapsed: collapsed, resizing: isResizing, 'no-initial-transition': isLoadingFromStorage }"
    :style="{ width: sidebarWidth + 'px' }"
  >
    <!-- 右侧拖动条 -->
    <div
      v-if="!collapsed"
      class="resize-handle"
      @mousedown="startResize"
      @touchstart="startResize"
      :class="{ active: isResizing }"
    />
    <div class="tree-header">
      <span class="tree-title" v-show="!collapsed">
        <el-icon><component :is="titleIcon" /></el-icon>
        {{ displayTitle }}
      </span>
      <div class="tree-actions" v-show="!collapsed">
        <el-tooltip :content="isExpandedAll ? t('treePanel.collapseAll') : t('treePanel.expandAll')" placement="right">
          <el-icon class="tree-action-icon" @click="toggleExpandAll">
            <ArrowDown v-if="isExpandedAll" />
            <ArrowUp v-else />
          </el-icon>
        </el-tooltip>
        <el-tooltip :content="t('treePanel.refresh')" placement="right">
          <el-icon class="tree-action-icon" @click="handleRefresh"><Refresh /></el-icon>
        </el-tooltip>
        <slot name="actions"></slot>
      </div>
    </div>

    <!-- 侧边栏展开/收起按钮 -->
    <div class="collapse-button-container">
      <el-tooltip :content="collapsed ? t('treePanel.expand') : t('treePanel.collapse')" placement="right">
        <el-icon class="collapse-button" @click="toggleCollapsed">
          <DArrowRight v-if="collapsed" />
          <DArrowLeft v-else />
        </el-icon>
      </el-tooltip>
    </div>

    <Transition name="fade">
      <div class="tree-search shrink-0 px-2.5 pt-2.5 pb-1" v-if="!collapsed && showSearch">
        <el-input
          v-model="searchKeyword"
          :placeholder="displaySearchPlaceholder"
          :aria-label="displaySearchPlaceholder"
          :maxlength="50"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </Transition>

    <Transition name="fade">
      <div class="tree-wrap" v-if="!collapsed">
        <el-tree
          ref="treeRef"
          :data="treeData"
          :props="treeProps"
          :expand-on-click-node="expandOnClickNode"
          :filter-node-method="filterNodeMethod"
          :default-expand-all="defaultExpandAll"
          :default-expanded-keys="defaultExpandedKeys"
          :node-key="nodeKey"
          :check-strictly="checkStrictly"
          :show-checkbox="showCheckbox"
          @node-click="onNodeClick"
          @check="onCheck"
          @node-expand="onNodeExpand"
          @node-collapse="onNodeCollapse"
        >
          <template #default="{ node, data }">
            <slot name="node" :node="node" :data="data">
              <span class="tree-node">
                <el-icon class="node-icon">
                  <Folder v-if="data.children && data.children.length" />
                  <Document v-else />
                </el-icon>
                <span class="node-label" :title="node.label">{{ node.label }}</span>
              </span>
            </slot>
          </template>
        </el-tree>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { TreeInstance } from 'element-plus'

/** 树节点数据结构（最小约束：label 用于过滤，children 用于层级） */
interface TreeNodeData {
  label?: string
  children?: TreeNodeData[]
  [key: string]: unknown
}

/** ElTree 内部 Node 结构（未公开类型，仅约束本组件用到的属性） */
interface TreeInternalNode {
  expanded?: boolean
  childNodes?: TreeInternalNode[]
  [key: string]: unknown
}

const { t } = useI18n()
const props = defineProps({
  // 树形数据
  treeData: {
    type: Array,
    default: () => []
  },
  // 标题
  title: {
    type: String,
    default: undefined
  },
  // 标题图标
  titleIcon: {
    type: [String, Object],
    default: 'OfficeBuilding'
  },
  // 是否显示搜索框
  showSearch: {
    type: Boolean,
    default: true
  },
  // 搜索框占位符
  searchPlaceholder: {
    type: String,
    default: undefined
  },
  // 是否默认收起侧边栏
  defaultCollapsed: {
    type: Boolean,
    default: false
  },
  // 树配置项
  treeProps: {
    type: Object,
    default: () => ({
      children: 'children',
      label: 'label'
    })
  },
  // 节点唯一标识字段
  nodeKey: {
    type: String,
    default: 'id'
  },
  // 是否在点击节点时展开或收起
  expandOnClickNode: {
    type: Boolean,
    default: false
  },
  // 是否显示复选框
  showCheckbox: {
    type: Boolean,
    default: false
  },
  // 是否严格的遵循父子不互相关联
  checkStrictly: {
    type: Boolean,
    default: false
  },
  // 是否默认展开所有节点
  defaultExpandAll: {
    type: Boolean,
    default: false
  },
  // 默认展开的节点的key数组
  defaultExpandedKeys: {
    type: Array,
    default: () => []
  },
  // 默认宽度
  defaultWidth: {
    type: Number,
    default: 220
  },
  // 收起时的宽度
  collapsedWidth: {
    type: Number,
    default: 20
  },
  // 最小宽度
  minWidth: {
    type: Number,
    default: 180
  },
  // 最大宽度
  maxWidth: {
    type: Number,
    default: 400
  },
  // 本地存储的宽度key
  storageKey: {
    type: String,
    default: 'tree-sidebar-width'
  },
  // 是否启用本地存储宽度
  enableStorage: {
    type: Boolean,
    default: true
  },
  // 自定义过滤方法
  filterMethod: {
    type: Function,
    default: null
  }
})

const emit = defineEmits([
  'collapsed-change',
  'expanded-all-change',
  'refresh',
  'node-click',
  'check',
  'node-expand',
  'node-collapse',
  'search'
])

const treeRef = useTemplateRef<TreeInstance>('treeRef')

// props 默认值通过 computed 实现 i18n 响应式
const displayTitle = computed(() => props.title || t('treePanel.title'))
const displaySearchPlaceholder = computed(() => props.searchPlaceholder || t('treePanel.searchPlaceholder'))

// 响应式数据
const searchKeyword = ref<string>('')
const collapsed = ref<boolean>(props.defaultCollapsed)
const sidebarWidth = ref<number>(props.defaultCollapsed ? props.collapsedWidth : props.defaultWidth)
const isResizing = ref<boolean>(false)
const startX = ref<number>(0)
const startWidth = ref<number>(0)
const saveWidthTimer = ref<NodeJS.Timeout | null>(null)
const rafId = ref<number | null>(null)
const isLoadingFromStorage = ref<boolean>(false)
const expandedAll = ref<boolean>(props.defaultExpandAll)

// 计算属性
const isExpandedAll = computed<boolean>({
  get: () => expandedAll.value,
  set: (val: boolean) => {
    expandedAll.value = val
  }
})

// 节点过滤方法
const filterNodeMethod = (value: string, data: TreeNodeData): boolean => {
  if (props.filterMethod) {
    return props.filterMethod(value, data)
  }
  if (!value) return true
  return !!(data.label && data.label.indexOf(value) !== -1)
}

// 监听折叠状态
watch(collapsed, (newVal: boolean, oldVal: boolean) => {
  if (newVal !== oldVal) {
    handleCollapseChange(newVal)
    emit('collapsed-change', newVal)
  }
})

// 监听内部展开状态变化，触发实际树的展开/收起
watch(expandedAll, (newVal: boolean) => {
  nextTick(() => {
    if (newVal) {
      expandAllNodes()
    } else {
      collapseAllNodes()
    }
  })
  emit('expanded-all-change', newVal)
})

// 监听搜索关键词
watch(searchKeyword, (val: string) => {
  if (treeRef.value) {
    treeRef.value.filter(val)
    emit('search', val)
  }
})

// 清理定时器和动画帧
const cleanup = (): void => {
  if (rafId.value) {
    cancelAnimationFrame(rafId.value)
    rafId.value = null
  }
  if (saveWidthTimer.value) {
    clearTimeout(saveWidthTimer.value)
    saveWidthTimer.value = null
  }
}

// 处理收起/展开状态变化
const handleCollapseChange = (isCollapsed: boolean): void => {
  if (isCollapsed) {
    saveWidthToStorage()
    sidebarWidth.value = props.collapsedWidth
  } else {
    const savedWidth = getSavedWidth()
    sidebarWidth.value = savedWidth !== null ? savedWidth : props.defaultWidth
  }
}

// 获取保存的宽度
const getSavedWidth = (): number | null => {
  if (!props.enableStorage) {
    return null
  }
  try {
    const savedWidth = localStorage.getItem(props.storageKey)
    if (savedWidth) {
      const width = parseInt(savedWidth, 10)
      if (!isNaN(width) && width >= props.minWidth && width <= props.maxWidth) {
        return width
      }
    }
  } catch (error) {
    if (import.meta.env.DEV)
      console.warn(`Failed to load sidebar width from storage with key ${props.storageKey}:`, error)
  }
  return null
}

// 保存宽度到本地存储
const saveWidthToStorage = (): void => {
  if (collapsed.value || !props.enableStorage) return
  try {
    localStorage.setItem(props.storageKey, sidebarWidth.value.toString())
  } catch (error) {
    if (import.meta.env.DEV)
      console.warn(`Failed to save sidebar width to storage with key ${props.storageKey}:`, error)
  }
}

// 切换侧边栏收起/展开状态
const toggleCollapsed = (): void => {
  collapsed.value = !collapsed.value
}

// 切换展开/折叠所有节点
const toggleExpandAll = (): void => {
  expandedAll.value = !expandedAll.value
}

// 展开所有节点
const expandAllNodes = (): void => {
  if (!treeRef.value) return
  const allNodes = getAllNodes(treeRef.value.root as TreeInternalNode)
  allNodes.forEach((node) => {
    if (node.expanded !== undefined && !node.expanded) {
      node.expanded = true
    }
  })
}

// 获取所有节点（ElTree 内部 Node 结构未公开类型，用 TreeInternalNode 约束）
const getAllNodes = (rootNode: TreeInternalNode): TreeInternalNode[] => {
  const nodes: TreeInternalNode[] = []
  const traverse = (node: TreeInternalNode): void => {
    if (!node) return
    nodes.push(node)
    if (node.childNodes && node.childNodes.length) {
      node.childNodes.forEach((child: TreeInternalNode) => traverse(child))
    }
  }
  traverse(rootNode)
  return nodes
}

// 收起所有节点
const collapseAllNodes = (): void => {
  if (!treeRef.value) return
  const allNodes = getAllNodes(treeRef.value.root as TreeInternalNode)
  allNodes.forEach((node) => {
    if (node.expanded !== undefined && node.expanded) {
      node.expanded = false
    }
  })
}

// 处理刷新操作
const handleRefresh = (): void => {
  emit('refresh')
}

// 节点点击事件
const onNodeClick = (data: TreeNodeData, node: unknown, e: Event): void => {
  emit('node-click', data, node, e)
}

// 复选框选中事件
const onCheck = (data: TreeNodeData, checkedInfo: unknown): void => {
  emit('check', data, checkedInfo)
}

// 节点展开事件
const onNodeExpand = (data: TreeNodeData, node: unknown, e: Event): void => {
  emit('node-expand', data, node, e)
}

// 节点折叠事件
const onNodeCollapse = (data: TreeNodeData, node: unknown, e: Event): void => {
  emit('node-collapse', data, node, e)
}

const setCurrentKey = (key: string | number): void => {
  if (treeRef.value) {
    treeRef.value.setCurrentKey(key)
  }
}

const getCurrentNode = (): TreeNodeData | null => {
  if (treeRef.value) {
    return treeRef.value.getCurrentNode() as TreeNodeData
  }
  return null
}

const getCurrentKey = (): string | number | null => {
  if (treeRef.value) {
    return treeRef.value.getCurrentKey()
  }
  return null
}

const setCheckedKeys = (keys: (string | number)[]): void => {
  if (treeRef.value && props.showCheckbox) {
    treeRef.value.setCheckedKeys(keys)
  }
}

const getCheckedKeys = (): (string | number)[] => {
  if (treeRef.value && props.showCheckbox) {
    return treeRef.value.getCheckedKeys()
  }
  return []
}

const getCheckedNodes = (): TreeNodeData[] => {
  if (treeRef.value && props.showCheckbox) {
    return treeRef.value.getCheckedNodes() as TreeNodeData[]
  }
  return []
}

const clearSearch = (): void => {
  searchKeyword.value = ''
  if (treeRef.value) {
    treeRef.value.filter('')
  }
}

const filter = (value: string): void => {
  searchKeyword.value = value
}

const startResize = (e: MouseEvent | TouchEvent): void => {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  startX.value = e.type === 'mousedown' ? (e as MouseEvent).clientX : (e as TouchEvent).touches[0].clientX
  startWidth.value = sidebarWidth.value

  if (e.type === 'mousedown') {
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', stopResize)
  } else {
    document.addEventListener('touchmove', handleResizeMove, { passive: false })
    document.addEventListener('touchend', stopResize)
  }
  disableUserSelect()
}

const handleResizeMove = (e: MouseEvent | TouchEvent): void => {
  if (!isResizing.value) return
  if (rafId.value) {
    cancelAnimationFrame(rafId.value)
  }
  rafId.value = requestAnimationFrame(() => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = e.type === 'mousemove' ? (e as MouseEvent).clientX : (e as TouchEvent).touches[0].clientX
    const deltaX = clientX - startX.value
    const newWidth = startWidth.value + deltaX
    const clampedWidth = Math.max(props.minWidth, Math.min(props.maxWidth, newWidth))
    if (Math.abs(clampedWidth - sidebarWidth.value) >= 1) {
      sidebarWidth.value = clampedWidth
    }
  })
}

const stopResize = (): void => {
  if (!isResizing.value) return
  isResizing.value = false
  if (rafId.value) {
    cancelAnimationFrame(rafId.value)
    rafId.value = null
  }
  startX.value = 0
  startWidth.value = 0
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('touchmove', handleResizeMove)
  document.removeEventListener('touchend', stopResize)
  enableUserSelect()
  saveWidthToStorage()
}

const disableUserSelect = (): void => {
  const bodyStyle = document.body.style
  bodyStyle.userSelect = 'none'
  bodyStyle.setProperty('-webkit-user-select', 'none')
  bodyStyle.setProperty('-moz-user-select', 'none')
  bodyStyle.setProperty('-ms-user-select', 'none')
}

const enableUserSelect = (): void => {
  const bodyStyle = document.body.style
  bodyStyle.userSelect = ''
  bodyStyle.setProperty('-webkit-user-select', '')
  bodyStyle.setProperty('-moz-user-select', '')
  bodyStyle.setProperty('-ms-user-select', '')
}

const resetWidth = (): void => {
  sidebarWidth.value = props.defaultWidth
  saveWidthToStorage()
}

const getCurrentWidth = (): number => {
  return sidebarWidth.value
}

const setWidth = (width: number): void => {
  if (typeof width === 'number' && width >= props.minWidth && width <= props.maxWidth) {
    sidebarWidth.value = width
    if (!collapsed.value) {
      saveWidthToStorage()
    }
  }
}

defineExpose({
  setCurrentKey,
  getCurrentNode,
  getCurrentKey,
  setCheckedKeys,
  getCheckedKeys,
  getCheckedNodes,
  clearSearch,
  filter,
  resetWidth,
  getCurrentWidth,
  setWidth,
  expandAllNodes,
  collapseAllNodes,
  toggleCollapsed,
  treeRef
})

onMounted(() => {
  isLoadingFromStorage.value = true
  // S5（UX-RESPONSIVE-PLAN）：手机视口下树面板默认折叠——「左树右表」布局在
  // 窄屏并排会把内容区挤压到不可用（实测 375px 下搜索框仅 ~40px 宽）。
  // 折叠为横条后用户仍可点击展开临时查看树。
  if (window.innerWidth < 768 && !collapsed.value) {
    collapsed.value = true
  }
  if (!collapsed.value && props.enableStorage) {
    const savedWidth = getSavedWidth()
    if (savedWidth !== null) {
      sidebarWidth.value = savedWidth
    }
  }
  nextTick(() => {
    isLoadingFromStorage.value = false
  })
  if (expandedAll.value) {
    nextTick(() => {
      expandAllNodes()
    })
  }
})

onBeforeUnmount(() => {
  cleanup()
  stopResize()
})
</script>

<style lang="scss" scoped>
.tree-sidebar {
  width: 220px;
  transition: width 0.25s ease;

  &.collapsed {
    width: 42px;
  }

  &.resizing {
    transition: none;
    will-change: width;

    * {
      pointer-events: none !important;
    }
  }

  &.no-initial-transition {
    transition: none;
  }
}

.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 20;
  background: transparent;
  transition: background 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
  }

  &.active {
    background: color-mix(in srgb, var(--el-color-primary) 50%, transparent);
  }
}

.collapse-button-container {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 20px;
  background: var(--el-bg-overlay);
  border-radius: 0 4px 4px 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;

  .tree-sidebar.collapsed & {
    right: 0;
    background: var(--el-fill-color-light);
    border-radius: 0 4px 4px 0;
  }

  .tree-sidebar.resizing & {
    pointer-events: none;
  }
}

.collapse-button {
  font-size: 20px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  height: 40px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
  flex-shrink: 0;

  .tree-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    white-space: nowrap;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 5px;

    .el-icon {
      color: var(--el-color-primary);
      font-size: 16px;
    }
  }

  .tree-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
}

.tree-action-icon {
  font-size: 20px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.tree-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 6px 6px 12px;

  .tree-sidebar.resizing & {
    overflow: hidden;
  }

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color);
    border-radius: 4px;

    &:hover {
      background: var(--el-text-color-disabled);
    }
  }

  :deep(.el-tree-node__content) {
    height: 32px;
    border-radius: 4px;
    margin-bottom: 1px;

    &:hover {
      background: var(--el-color-primary-light-9);
    }
  }

  :deep(.el-tree-node.is-current > .el-tree-node__content) {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 600;

    .node-icon {
      color: var(--el-color-primary) !important;
    }
  }
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  overflow: hidden;

  .node-icon {
    font-size: 14px;
    color: var(--el-color-warning);
    flex-shrink: 0;
  }

  .node-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
