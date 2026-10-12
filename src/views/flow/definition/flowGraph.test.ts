import { describe, expect, it } from 'vitest'
import { diffGraphs, parseGraphJson, validateGraph } from './flowGraph'
import type { FlowGraph, FlowGraphNode, FlowNodeAction } from '@/api/flow'

const node = (over: Partial<FlowGraphNode> & { id: string }): FlowGraphNode => ({
  type: 'approve',
  name: over.id,
  assignees: ['dept_leader'],
  ...over
})

/** 合法基线图：start → a1 → end */
const validGraph = (): FlowGraph => ({
  nodes: [
    { id: 'start', type: 'start' },
    node({ id: 'a1' }),
    { id: 'end', type: 'end' }
  ],
  edges: [
    { from: 'start', to: 'a1' },
    { from: 'a1', to: 'end' }
  ]
})

describe('validateGraph（对齐后端 flow_graph.rs 白名单）', () => {
  it('合法基线图通过', () => {
    expect(validateGraph(validGraph()).ok).toBe(true)
  })

  it('规模与结构：空图 / start-end 数量 / 重复 id / 类型白名单', () => {
    expect(validateGraph({ nodes: [], edges: [] }).ok).toBe(false)
    const twoStarts = validGraph()
    twoStarts.nodes.push({ id: 'start2', type: 'start' })
    expect(validateGraph(twoStarts).errors.join()).toContain('start 节点必须恰好 1 个')
    const dup = validGraph()
    dup.nodes.push(node({ id: 'a1' }))
    expect(validateGraph(dup).errors.join()).toContain('节点 id 重复: a1')
    const badType = validGraph()
    badType.nodes[1] = { ...badType.nodes[1], type: 'banana' as never }
    expect(validateGraph(badType).errors.join()).toContain('节点类型不在白名单')
  })

  it('approve 必填 assignees + 形态白名单 + weighted 必填 threshold', () => {
    const noAssignee = validGraph()
    noAssignee.nodes[1] = { ...noAssignee.nodes[1], assignees: [] }
    expect(validateGraph(noAssignee).errors.join()).toContain('缺少 assignees')
    const badAssignee = validGraph()
    badAssignee.nodes[1] = { ...badAssignee.nodes[1], assignees: ['javascript:alert(1)'] }
    expect(validateGraph(badAssignee).errors.join()).toContain('审批人形态非法')
    const noThreshold = validGraph()
    noThreshold.nodes[1] = { ...noThreshold.nodes[1], multi: 'weighted' }
    expect(validateGraph(noThreshold).errors.join()).toContain('缺少 threshold')
    const overThreshold = validGraph()
    overThreshold.nodes[1] = { ...overThreshold.nodes[1], multi: 'weighted', threshold: 1001 }
    expect(validateGraph(overThreshold).errors.join()).toContain('threshold 越界')
  })

  it('动作白名单', () => {
    const g = validGraph()
    g.nodes[1] = { ...g.nodes[1], actions: (['delegate', 'hack'] as unknown) as FlowNodeAction[] }
    expect(validateGraph(g).errors.join()).toContain('动作不在白名单: hack')
  })

  it('边：端点存在 / 自环 / 重复 / 条件白名单', () => {
    const ghost = validGraph()
    ghost.edges.push({ from: 'a1', to: 'ghost' })
    expect(validateGraph(ghost).errors.join()).toContain('边终点不存在: ghost')
    const selfLoop = validGraph()
    selfLoop.edges.push({ from: 'a1', to: 'a1' })
    expect(validateGraph(selfLoop).errors.join()).toContain('自环边: a1')
    const dup = validGraph()
    dup.edges.push({ from: 'start', to: 'a1' })
    expect(validateGraph(dup).errors.join()).toContain('重复边: start → a1')
    const badOp = validGraph()
    badOp.edges[0] = { ...badOp.edges[0], condition: { field: 'amount', op: '~' as never, value: 1 } }
    expect(validateGraph(badOp).errors.join()).toContain('比较符不在白名单')
    const badField = validGraph()
    badField.edges[0] = { ...badOp.edges[0], condition: { field: 'a b', op: '=', value: 1 } }
    expect(validateGraph(badField).errors.join()).toContain('条件字段名非法')
  })

  it('可达性：start 不可达 end / 孤儿审批节点', () => {
    const noExit = validGraph()
    noExit.edges = [{ from: 'start', to: 'a1' }]
    expect(validateGraph(noExit).errors.join()).toContain('start 不可达 end')
    const orphan = validGraph()
    orphan.nodes.push(node({ id: 'orphan' }))
    expect(validateGraph(orphan).errors.join()).toContain('审批节点 orphan 不可达（孤立节点）')
  })

  it('环检测：DFS 三色（允许汇聚，拒绝环）', () => {
    const cycle = validGraph()
    cycle.edges.push({ from: 'a1', to: 'start' })
    expect(validateGraph(cycle).errors.join()).toContain('检测到环')
    // 汇聚（菱形）不误报
    const diamond: FlowGraph = {
      nodes: [
        { id: 'start', type: 'start' },
        node({ id: 'a' }),
        node({ id: 'b' }),
        node({ id: 'c' }),
        { id: 'end', type: 'end' }
      ],
      edges: [
        { from: 'start', to: 'a' },
        { from: 'start', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'end' }
      ]
    }
    expect(validateGraph(diamond).ok).toBe(true)
  })

  it('错误清单去重且一次呈现', () => {
    const cycle = validGraph()
    cycle.edges.push({ from: 'a1', to: 'start' }, { from: 'start', to: 'a1' })
    const r = validateGraph(cycle)
    expect(r.ok).toBe(false)
    const dup = r.errors.filter((e) => e.includes('检测到环'))
    expect(new Set(dup).size).toBe(dup.length)
  })
})

describe('parseGraphJson / diffGraphs', () => {
  it('parseGraphJson：非法输入回退空图', () => {
    expect(parseGraphJson(undefined).nodes).toHaveLength(0)
    expect(parseGraphJson('not-json').nodes).toHaveLength(0)
    expect(parseGraphJson('{"nodes":"x"}').nodes).toHaveLength(0)
    expect(parseGraphJson('{"nodes":[],"edges":[]}').nodes).toHaveLength(0)
  })

  it('diffGraphs：节点/边增删改', () => {
    const oldG = validGraph()
    const newG = validGraph()
    newG.nodes[1] = { ...newG.nodes[1], name: '改名了' }
    newG.edges.push({ from: 'start', to: 'end' })
    const d = diffGraphs(oldG, newG)
    expect(d.changedNodes).toEqual(['a1'])
    expect(d.addedEdges).toEqual(['start->end'])
    expect(d.removedNodes).toHaveLength(0)
    // 旧图多出的边
    const shrunk = diffGraphs(newG, oldG)
    expect(shrunk.removedEdges).toEqual(['start->end'])
  })
})
