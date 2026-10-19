/**
 * 表单构建器右侧属性面板：树节点编辑逻辑
 * 封装 el-tree 的渲染、增删节点操作与节点对话框状态（逻辑与原 RightPanel.vue 完全一致）
 */
import { h, ref, resolveComponent, type Ref, type VNode } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

/** vue h 函数类型（供 render-content 回调签名使用） */
type HType = typeof h

/** 树节点数据结构（表单构建器组件配置，允许任意扩展字段） */
export interface TreeNodeData {
  id: string | number
  label?: string
  children?: TreeNodeData[]
  [key: string]: unknown
}

/** el-tree 内部节点对象（render-content 回调第二参数中的 node 结构） */
export interface ElTreeNodeCtx {
  label: string
  data: TreeNodeData
  parent?: ElTreeNodeCtx
}

export interface UseTreeNodeReturn {
  currentNode: Ref<TreeNodeData[] | null>
  dialogVisible: Ref<boolean>
  renderContent: (h: HType, ctx: { node: ElTreeNodeCtx; data: TreeNodeData }) => VNode
  append: (data: TreeNodeData) => void
  remove: (node: ElTreeNodeCtx, data: TreeNodeData) => void
  addNode: (data: TreeNodeData) => void
}

/**
 * 树节点操作 composable
 * @param idGlobal 全局 id 计数器，新增节点时递增保证唯一
 */
export function useTreeNode(idGlobal: Ref<number>): UseTreeNodeReturn {
  const { t } = useI18n()
  const currentNode = ref<TreeNodeData[] | null>(null)
  const dialogVisible = ref(false)

  function renderContent(h: HType, { node, data }: { node: ElTreeNodeCtx; data: TreeNodeData }): VNode {
    return h(
      'div',
      {
        class: 'custom-tree-node'
      },
      [
        h('span', node.label),
        h(
          'span',
          {
            class: 'node-operation'
          },
          [
            h(resolveComponent('el-link'), {
              type: 'primary',
              icon: 'Plus',
              underline: false,
              onClick: () => {
                append(data)
              }
            }),
            h(resolveComponent('el-link'), {
              type: 'danger',
              icon: 'Delete',
              underline: false,
              style: 'margin-left: 5px;',
              onClick: () => {
                remove(node, data)
              }
            })
          ]
        )
      ]
    )
  }

  function append(data: TreeNodeData): void {
    if (!data.children) {
      data.children = []
    }
    idGlobal.value++
    dialogVisible.value = true
    currentNode.value = data.children
  }

  function remove(node: ElTreeNodeCtx, data: TreeNodeData): void {
    const parent = node.parent
    if (!parent) {
      return
    }
    // 顶层节点：parent.data 即整棵树的顶层数组；子节点：parent.data.children
    const container: unknown = parent.data.children ?? parent.data
    if (Array.isArray(container)) {
      const index = container.findIndex((d: TreeNodeData) => d.id === data.id)
      if (index > -1) {
        container.splice(index, 1)
      }
    }
  }

  function addNode(data: TreeNodeData): void {
    const container = currentNode.value
    if (container) {
      container.push(data)
      return
    }
    // b72：此前只 `if (import.meta.env.DEV) console.warn(...)` —— 生产环境**静默丢弃**用户
    // 刚填完的字段（b70 的"P2 修复"只做了半截：DEV 里看得见、用户看不见）。
    // 丢数据必须当场可见；同时保留 dialogVisible（不关窗），让用户可以直接重试提交。
    // 语言包命名空间是 `build.*`（zh-CN/index.ts 将 tool.ts 的顶层键直接展开，
    // 故 `tool.build.*` 会命中缺失兜底、把裸键刷进 toast）
    ElMessage.error(t('build.addNodeTargetMissing'))
  }

  return {
    currentNode,
    dialogVisible,
    renderContent,
    append,
    remove,
    addNode
  }
}
