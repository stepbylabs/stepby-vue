/**
 * 流程图前端校验纯函数测试（G-02 M3 + b71 i18n 治理）
 *
 * b71 变更：validateGraph 不再产出中文字面量，而是 `{ key: 'flowDef.validate.*', params }`
 * ——本模块是无 i18n 上下文的纯函数，渲染端（views/flow/designer/index.vue）用
 * `t(msg.key, msg.params)` 翻译。故断言口径改为「稳定 key + 参数」，并新增语言包对账：
 * 任何一条产出的 key 在 zh-CN / en-US 缺失、或语言包里留着模块从未产出的死消息，都会变红。
 */
import { describe, expect, it } from 'vitest'
import { diffGraphs, parseGraphJson, validateGraph, type GraphValidationMessage } from './flowGraph'
import type { FlowGraph, FlowGraphNode, FlowNodeAction } from '@/api/flow'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

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

const keysOf = (errors: GraphValidationMessage[]): string[] => errors.map((e) => e.key.replace('flowDef.validate.', ''))

/** 按点分路径取语言包叶子（缺失返回 undefined） */
function pickLocale(root: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k]
    return undefined
  }, root)
}

/** 触发各类校验分支，收集所有会被产出的消息 key */
function collectAllBranchKeys(): Set<string> {
  const produced = new Set<string>()
  const push = (g: FlowGraph): void => {
    validateGraph(g).errors.forEach((e) => produced.add(e.key))
  }
  push({ nodes: [], edges: [] })
  const twoStarts = validGraph()
  twoStarts.nodes.push({ id: 'start2', type: 'start' })
  push(twoStarts)
  const dupNode = validGraph()
  dupNode.nodes.push(node({ id: 'a1' }))
  push(dupNode)
  const badType = validGraph()
  badType.nodes[1] = { ...badType.nodes[1], type: 'banana' as never }
  push(badType)
  const emptyId = validGraph()
  emptyId.nodes[1] = { ...emptyId.nodes[1], id: '' }
  push(emptyId)
  const noAssignee = validGraph()
  noAssignee.nodes[1] = { ...noAssignee.nodes[1], assignees: [] }
  push(noAssignee)
  const badAssignee = validGraph()
  badAssignee.nodes[1] = { ...badAssignee.nodes[1], assignees: ['javascript:alert(1)'] }
  push(badAssignee)
  const badMode = validGraph()
  badMode.nodes[1] = { ...badMode.nodes[1], multi: 'random' as never }
  push(badMode)
  const badThreshold = validGraph()
  badThreshold.nodes[1] = { ...badThreshold.nodes[1], multi: 'weighted', threshold: 1001 }
  push(badThreshold)
  const negThreshold = validGraph()
  negThreshold.nodes[1] = { ...negThreshold.nodes[1], threshold: 0 }
  push(negThreshold)
  const noThreshold = validGraph()
  noThreshold.nodes[1] = { ...noThreshold.nodes[1], multi: 'weighted' }
  push(noThreshold)
  const badAction = validGraph()
  badAction.nodes[1] = { ...badAction.nodes[1], actions: (['delegate', 'hack'] as unknown) as FlowNodeAction[] }
  push(badAction)
  const ghostEdge = validGraph()
  ghostEdge.edges.push({ from: 'a1', to: 'ghost' })
  push(ghostEdge)
  const missingFrom = validGraph()
  missingFrom.edges.push({ from: 'nobody', to: 'end' })
  push(missingFrom)
  const selfLoop = validGraph()
  selfLoop.edges.push({ from: 'a1', to: 'a1' })
  push(selfLoop)
  const dupEdge = validGraph()
  dupEdge.edges.push({ from: 'start', to: 'a1' })
  push(dupEdge)
  const badOp = validGraph()
  badOp.edges[0] = { ...badOp.edges[0], condition: { field: 'amount', op: '~' as never, value: 1 } }
  push(badOp)
  const badField = validGraph()
  badField.edges[0] = { ...badField.edges[0], condition: { field: 'a b', op: '=', value: 1 } }
  push(badField)
  const badValue = validGraph()
  badValue.edges[0] = { ...badValue.edges[0], condition: { field: 'amount', op: '=', value: true as never } }
  push(badValue)
  const noExit = validGraph()
  noExit.edges = [{ from: 'start', to: 'a1' }]
  push(noExit)
  const orphan = validGraph()
  orphan.nodes.push(node({ id: 'orphan' }))
  push(orphan)
  const cycle = validGraph()
  cycle.edges.push({ from: 'a1', to: 'start' })
  push(cycle)
  const overNodes = validGraph()
  for (let i = 0; i < 70; i++) overNodes.nodes.push(node({ id: `n${i}` }))
  push(overNodes)
  const overEdges = validGraph()
  for (let i = 0; i < 140; i++) overEdges.edges.push({ from: 'start', to: 'a1' })
  push(overEdges)
  return produced
}

describe('validateGraph（对齐后端 flow_graph.rs 白名单）', () => {
  it('合法基线图通过', () => {
    expect(validateGraph(validGraph()).ok).toBe(true)
  })

  it('规模与结构：空图 / start-end 数量 / 重复 id / 类型白名单', () => {
    expect(validateGraph({ nodes: [], edges: [] }).errors.map((e) => e.key)).toContain('flowDef.validate.nodesEmpty')
    const twoStarts = validGraph()
    twoStarts.nodes.push({ id: 'start2', type: 'start' })
    expect(keysOf(validateGraph(twoStarts).errors)).toContain('startCountMustBeOne')
    const dup = validGraph()
    dup.nodes.push(node({ id: 'a1' }))
    expect(validateGraph(dup).errors.find((e) => e.key === 'flowDef.validate.nodeIdDuplicated')?.params).toEqual({
      id: 'a1'
    })
    const badType = validGraph()
    badType.nodes[1] = { ...badType.nodes[1], type: 'banana' as never }
    expect(keysOf(validateGraph(badType).errors)).toContain('nodeTypeNotAllowed')
  })

  it('节点 id 非法带出上界与非法值参数（不再把中文文案写进代码）', () => {
    const bad = validGraph()
    bad.nodes[1] = { ...bad.nodes[1], id: 'x'.repeat(40) }
    const msg = validateGraph(bad).errors.find((e) => e.key === 'flowDef.validate.nodeIdInvalid')
    expect(msg?.params).toMatchObject({ max: 32 })
    expect(String(msg?.params?.id)).toHaveLength(40)
  })

  it('approve 必填 assignees + 形态白名单 + weighted 必填 threshold', () => {
    const noAssignee = validGraph()
    noAssignee.nodes[1] = { ...noAssignee.nodes[1], assignees: [] }
    expect(keysOf(validateGraph(noAssignee).errors)).toContain('approveNodeMissingAssignees')
    const badAssignee = validGraph()
    badAssignee.nodes[1] = { ...badAssignee.nodes[1], assignees: ['javascript:alert(1)'] }
    expect(validateGraph(badAssignee).errors.find((e) => e.key === 'flowDef.validate.assigneeInvalid')?.params).toEqual({
      id: 'a1',
      assignee: 'javascript:alert(1)'
    })
    const noThreshold = validGraph()
    noThreshold.nodes[1] = { ...noThreshold.nodes[1], multi: 'weighted' }
    expect(keysOf(validateGraph(noThreshold).errors)).toContain('weightedMissingThreshold')
    const overThreshold = validGraph()
    overThreshold.nodes[1] = { ...overThreshold.nodes[1], multi: 'weighted', threshold: 1001 }
    expect(keysOf(validateGraph(overThreshold).errors)).toContain('thresholdOutOfRange')
    const zeroThreshold = validGraph()
    zeroThreshold.nodes[1] = { ...zeroThreshold.nodes[1], threshold: 0 }
    expect(keysOf(validateGraph(zeroThreshold).errors)).toContain('thresholdNotPositiveInt')
  })

  it('多签模式白名单', () => {
    const badMode = validGraph()
    badMode.nodes[1] = { ...badMode.nodes[1], multi: 'random' as never }
    expect(validateGraph(badMode).errors.find((e) => e.key === 'flowDef.validate.multiModeInvalid')?.params).toEqual({
      id: 'a1',
      mode: 'random'
    })
  })

  it('动作白名单', () => {
    const g = validGraph()
    g.nodes[1] = { ...g.nodes[1], actions: (['delegate', 'hack'] as unknown) as FlowNodeAction[] }
    expect(validateGraph(g).errors.find((e) => e.key === 'flowDef.validate.actionNotAllowed')?.params).toEqual({
      id: 'a1',
      action: 'hack'
    })
  })

  it('边：端点存在 / 自环 / 重复 / 条件白名单', () => {
    const ghost = validGraph()
    ghost.edges.push({ from: 'a1', to: 'ghost' })
    expect(validateGraph(ghost).errors.find((e) => e.key === 'flowDef.validate.edgeToMissing')?.params).toEqual({
      to: 'ghost'
    })
    const selfLoop = validGraph()
    selfLoop.edges.push({ from: 'a1', to: 'a1' })
    expect(keysOf(validateGraph(selfLoop).errors)).toContain('selfLoop')
    const dup = validGraph()
    dup.edges.push({ from: 'start', to: 'a1' })
    expect(validateGraph(dup).errors.find((e) => e.key === 'flowDef.validate.duplicateEdge')?.params).toEqual({
      from: 'start',
      to: 'a1'
    })
    const badOp = validGraph()
    badOp.edges[0] = { ...badOp.edges[0], condition: { field: 'amount', op: '~' as never, value: 1 } }
    expect(keysOf(validateGraph(badOp).errors)).toContain('conditionOpNotAllowed')
    const badField = validGraph()
    badField.edges[0] = { ...badField.edges[0], condition: { field: 'a b', op: '=', value: 1 } }
    expect(keysOf(validateGraph(badField).errors)).toContain('conditionFieldInvalid')
    const badValue = validGraph()
    badValue.edges[0] = {
      ...badValue.edges[0],
      condition: { field: 'amount', op: '=', value: true as never }
    }
    expect(keysOf(validateGraph(badValue).errors)).toContain('conditionValueInvalid')
  })

  it('可达性：start 不可达 end / 孤儿审批节点', () => {
    const noExit = validGraph()
    noExit.edges = [{ from: 'start', to: 'a1' }]
    expect(keysOf(validateGraph(noExit).errors)).toContain('endUnreachable')
    const orphan = validGraph()
    orphan.nodes.push(node({ id: 'orphan' }))
    expect(validateGraph(orphan).errors.find((e) => e.key === 'flowDef.validate.approveNodeUnreachable')?.params).toEqual(
      { id: 'orphan' }
    )
  })

  it('环检测：DFS 三色（允许汇聚，拒绝环）', () => {
    const cycle = validGraph()
    cycle.edges.push({ from: 'a1', to: 'start' })
    expect(keysOf(validateGraph(cycle).errors)).toContain('cycleDetected')
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
    const cycles = r.errors.filter((e) => e.key.endsWith('cycleDetected'))
    expect(cycles.length).toBeGreaterThan(0)
    // 去重按 key + params（对象引用不可比，旧的 [...new Set(errors)] 语义迁移到结构化去重）
    const unique = new Set(cycles.map((e) => `${e.key}|${JSON.stringify(e.params)}`))
    expect(unique.size).toBe(cycles.length)
    expect(r.errors.every((e) => e.key.startsWith('flowDef.validate.'))).toBe(true)
  })
})

describe('validateGraph 消息 key 与语言包对账（b71 i18n 治理）', () => {
  const produced = collectAllBranchKeys()

  it('每条产出的 key 在 zh-CN 与 en-US 都有文案（缺一条即渲染裸键）', () => {
    const missing: string[] = []
    for (const key of produced) {
      if (typeof pickLocale(zhCN, key) !== 'string') missing.push(`${key} <- zh-CN`)
      if (typeof pickLocale(enUS, key) !== 'string') missing.push(`${key} <- en-US`)
    }
    expect(missing, missing.join('\n')).toEqual([])
  })

  it('语言包 validate.* 里没有 flowGraph.ts 从未产出的死消息', () => {
    const declared = Object.keys(
      (pickLocale(zhCN, 'flowDef.validate') ?? {}) as Record<string, unknown>
    ).map((k) => `flowDef.validate.${k}`)
    expect(declared.length).toBeGreaterThan(20)
    const dead = declared.filter((k) => !produced.has(k))
    expect(dead, `未被任何校验分支产出：${dead.join(', ')}`).toEqual([])
  })

  it('zh-CN 与 en-US 的 validate 键集合一致（防语言包漂移）', () => {
    const zh = Object.keys((pickLocale(zhCN, 'flowDef.validate') ?? {}) as Record<string, unknown>).sort()
    const en = Object.keys((pickLocale(enUS, 'flowDef.validate') ?? {}) as Record<string, unknown>).sort()
    expect(en).toEqual(zh)
  })

  it('代码里不再残留中文校验字面量（文案唯一事实源在语言包）', async () => {
    // 读源码口径对齐 `src/views/system/file/index.guard.test.ts`：jsdom/happy-dom 环境下
    // `import.meta.url` 不保证是 file: scheme，`new URL(..., it)` 直喂 readFileSync 必报
    // "The URL must be of scheme file"，须先 fileURLToPath 还原成本地路径再拼接。
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const src = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'flowGraph.ts'),
      'utf8'
    )
    const chineseLiterals = src
      .split('\n')
      .filter((l) => /errors\.push\(/.test(l) || /push\(`/.test(l))
      .filter((l) => /[一-龥]/.test(l))
    expect(chineseLiterals).toEqual([])
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
  })
})
