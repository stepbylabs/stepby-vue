/**
 * 表单构建器右侧属性面板：树节点编辑逻辑
 * 封装 el-tree 的渲染、增删节点操作与节点对话框状态（逻辑与原 RightPanel.vue 完全一致）
 */
import { h, ref, resolveComponent, type Ref, type VNode } from 'vue'

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
    if (currentNode.value) {
      currentNode.value.push(data)
    } else {
      // P2 修复: currentNode 为空时不再静默丢弃数据，给出提示
      if (import.meta.env.DEV) console.warn('[build/addNode] currentNode is null, data not added:', data)
    }
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
