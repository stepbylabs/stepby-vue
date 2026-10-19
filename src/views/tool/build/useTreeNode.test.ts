/**
 * useTreeNode 单测（b72）：表单构建器"结构树"节点增删逻辑。
 *
 * 存在理由：`addNode` 曾在 `currentNode` 为空时**只在 DEV 打 console.warn**，
 * 生产环境静默丢弃用户刚填完的字段（b70 的半截修复）。本测把"丢数据必须可见"
 * 与"append/addNode/remove 的容器语义"钉住。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const errorMessage = vi.fn()
const translated = vi.fn((key: string) => `t:${key}`)

vi.mock('element-plus', () => ({
  ElMessage: { error: (...args: unknown[]) => errorMessage(...args) }
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => translated(key) })
}))

import { useTreeNode, type ElTreeNodeCtx, type TreeNodeData } from './useTreeNode'

beforeEach(() => {
  errorMessage.mockClear()
  translated.mockClear()
})

describe('append → addNode 正常链', () => {
  it('append 打开对话框、递增全局 id，并把容器指向该节点的 children', () => {
    const idGlobal = ref(1)
    const { append, currentNode, dialogVisible } = useTreeNode(idGlobal)
    const node: TreeNodeData = { id: 'a', label: 'A' }

    append(node)

    expect(dialogVisible.value).toBe(true)
    expect(idGlobal.value).toBe(2)
    expect(node.children).toEqual([])
    // 注：`currentNode` 是 ref，Vue 会把数组包成 reactive 代理，故**不能用 toBe 比身份**
    // （代理 !== 原始数组）。"容器是否同一个"由下一条用例用行为证明：addNode 后
    // `node.children` 真的多了一项。
    expect(currentNode.value).toEqual([])
  })

  it('append 之后 addNode 必须真正落入该容器（行为证明：原数组确实增长）', () => {
    const idGlobal = ref(10)
    const { append, addNode, currentNode } = useTreeNode(idGlobal)
    const node: TreeNodeData = { id: 'b', label: 'B', children: [] }

    append(node)
    addNode({ id: 'c', label: 'C' })

    expect(node.children).toHaveLength(1)
    expect(node.children?.[0].label).toBe('C')
    expect(currentNode.value).toEqual([{ id: 'c', label: 'C' }])
    expect(errorMessage).not.toHaveBeenCalled()
  })
})

describe('addNode 容器缺失（历史丢数据缺陷）', () => {
  it('currentNode 为空时必须给出可见错误，而不是静默丢弃', () => {
    const { addNode } = useTreeNode(ref(1))

    addNode({ id: 'x', label: 'X' })

    // 键路径必须是 `build.*`（不是 `tool.build.*`）：本测的 t() 是桩，任何拼错的路径
    // 都会"绿着"返回假字符串，真正的兜底是 i18n-keys 静态守卫（它会核对真实语言包）。
    expect(translated).toHaveBeenCalledWith('build.addNodeTargetMissing')
    expect(errorMessage).toHaveBeenCalledTimes(1)
    expect(errorMessage.mock.calls[0][0]).toBe('t:build.addNodeTargetMissing')
  })

  it('容器缺失不得抛异常（否则 el-tree 交互直接崩面板）', () => {
    const { addNode } = useTreeNode(ref(1))
    expect(() => addNode({ id: 'y' })).not.toThrow()
  })
})

describe('remove 容器语义', () => {
  it('子节点：从父容器的 children 中按 id 精确移除一项', () => {
    const { remove } = useTreeNode(ref(1))
    const child: TreeNodeData = { id: 2, label: 'two' }
    const children = [{ id: 1, label: 'one' }, child]
    const ctx = { label: 'two', data: child, parent: { label: 'p', data: { children } } }

    remove(ctx as unknown as ElTreeNodeCtx, child)

    expect(children).toHaveLength(1)
    expect(children.map((c) => c.id)).toEqual([1])
  })

  it('顶层节点：parent.data 即整棵顶层数组，同样按 id 移除', () => {
    const { remove } = useTreeNode(ref(1))
    const root = ref<TreeNodeData[]>([{ id: 7, label: 'seven' }])
    const target = root.value[0]
    const ctx = { label: 'seven', data: target, parent: { label: '', data: root.value } }

    remove(ctx as unknown as ElTreeNodeCtx, target)

    expect(root.value).toHaveLength(0)
  })

  it('无父节点（根/孤立节点）时静默不动，不得误删他人', () => {
    const { remove } = useTreeNode(ref(1))
    const data: TreeNodeData = { id: 9, label: 'nine' }
    expect(() => remove({ label: 'nine', data } as ElTreeNodeCtx, data)).not.toThrow()
  })
})
