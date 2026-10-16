/**
 * 流程图前端校验与规范化 · 纯函数（G-02 M3）
 *
 * 与后端 `common/flow_graph.rs` 白名单校验器**双份对齐**（前后端双份校验中，
 * 前端保存前先拦——防绕过语义一致、错误提示即时）。规模上界/类型白名单/
 * id 唯一/连通性（BFS start→end + 孤儿审批节点）/环检测（DFS 三色）/
 * 条件白名单/多签门槛合法性，逐条对齐后端实现。
 */
import type { FlowGraph, FlowGraphNode, FlowGraphEdge, FlowNodeType } from '@/api/flow'

const NODE_ID_MAX = 32
const MAX_NODES = 64
const MAX_EDGES = 128
const NODE_TYPES: FlowNodeType[] = ['start', 'approve', 'end']
const ACTIONS_WHITELIST = ['delegate', 'countersign_add', 'countersign_del']
const CONDITION_OPS = ['=', '!=', '>', '>=', '<', '<=']
const MULTI_MODES = ['single', 'countersign', 'or_sign', 'weighted']

/**
 * 校验失败消息（i18n key + 插值参数）
 *
 * 本模块是**无 Vue 上下文的纯函数**，不能直接调 `t()`：只产出稳定的 `flowDef.validate.*`
 * 键名，渲染端（`views/flow/designer/index.vue` 的错误清单）用 `t(msg.key, msg.params)` 翻译，
 * 中文文案的唯一事实源在 `src/i18n/locales/{zh-CN,en-US}/system.ts` 的 `flowDef.validate`。
 */
export interface GraphValidationMessage {
  /** i18n 消息键（flowDef.validate.*） */
  key: string
  /** 插值参数（节点 id、上界值等；键名与消息里的 {x} 对应） */
  params?: Record<string, string | number>
}

/** 校验失败错误（含所有问题清单，便于表单一次性呈现） */
export interface GraphValidationResult {
  ok: boolean
  errors: GraphValidationMessage[]
}

function isIdChar(c: string): boolean {
  return /[A-Za-z0-9_-]/.test(c)
}

function validateAssignee(a: string, nodeId: string, errors: GraphValidationMessage[]): void {
  if (a === 'dept_leader') return
  if (a.startsWith('role:')) {
    const key = a.slice(5)
    if (key.length > 0 && key.length <= 64 && [...key].every(isIdChar)) return
  }
  errors.push({ key: 'flowDef.validate.assigneeInvalid', params: { id: nodeId, assignee: a } })
}

/** 全量校验（对齐后端 validate 语义，返回问题清单而非首错） */
export function validateGraph(graph: FlowGraph): GraphValidationResult {
  const errors: GraphValidationMessage[] = []
  // 1. 规模上界
  if (graph.nodes.length === 0) errors.push({ key: 'flowDef.validate.nodesEmpty' })
  if (graph.nodes.length > MAX_NODES) errors.push({ key: 'flowDef.validate.nodesOverLimit', params: { max: MAX_NODES } })
  if (graph.edges.length > MAX_EDGES) errors.push({ key: 'flowDef.validate.edgesOverLimit', params: { max: MAX_EDGES } })
  // 2. 节点逐一校验
  const ids = new Set<string>()
  const starts: FlowGraphNode[] = []
  const ends: FlowGraphNode[] = []
  for (const n of graph.nodes) {
    if (!n.id || n.id.length > NODE_ID_MAX) {
      errors.push({ key: 'flowDef.validate.nodeIdInvalid', params: { max: NODE_ID_MAX, id: n.id } })
      continue
    }
    if (ids.has(n.id)) {
      errors.push({ key: 'flowDef.validate.nodeIdDuplicated', params: { id: n.id } })
      continue
    }
    ids.add(n.id)
    if (!NODE_TYPES.includes(n.type)) {
      errors.push({ key: 'flowDef.validate.nodeTypeNotAllowed', params: { type: n.type } })
      continue
    }
    if (n.type === 'approve') {
      if (!n.assignees || n.assignees.length === 0) {
        errors.push({ key: 'flowDef.validate.approveNodeMissingAssignees', params: { id: n.id } })
      } else {
        for (const a of n.assignees) validateAssignee(a, n.id, errors)
      }
      const mode = n.multi ?? 'single'
      if (!MULTI_MODES.includes(mode)) {
        errors.push({ key: 'flowDef.validate.multiModeInvalid', params: { id: n.id, mode } })
      }
      if (n.threshold !== undefined) {
        if (!Number.isInteger(n.threshold) || n.threshold <= 0) {
          errors.push({ key: 'flowDef.validate.thresholdNotPositiveInt', params: { id: n.id } })
        } else if (n.threshold > 1000) {
          errors.push({ key: 'flowDef.validate.thresholdOutOfRange', params: { id: n.id, threshold: n.threshold } })
        }
      }
      if (mode === 'weighted' && n.threshold === undefined) {
        errors.push({ key: 'flowDef.validate.weightedMissingThreshold', params: { id: n.id } })
      }
    }
    for (const act of n.actions ?? []) {
      if (!ACTIONS_WHITELIST.includes(act)) {
        errors.push({ key: 'flowDef.validate.actionNotAllowed', params: { id: n.id, action: act } })
      }
    }
    if (n.type === 'start') starts.push(n)
    if (n.type === 'end') ends.push(n)
  }
  if (starts.length !== 1) errors.push({ key: 'flowDef.validate.startCountMustBeOne', params: { count: starts.length } })
  if (ends.length !== 1) errors.push({ key: 'flowDef.validate.endCountMustBeOne', params: { count: ends.length } })
  if (errors.length > 0 || starts.length !== 1 || ends.length !== 1) {
    return { ok: false, errors: dedupeMessages(errors) }
  }
  const startId = starts[0].id
  const endId = ends[0].id
  // 3. 边校验：端点存在 + 无自环 + 重复 + 条件白名单
  const seenEdges = new Set<string>()
  const adj = new Map<string, string[]>()
  for (const e of graph.edges as FlowGraphEdge[]) {
    if (!ids.has(e.from)) errors.push({ key: 'flowDef.validate.edgeFromMissing', params: { from: e.from } })
    if (!ids.has(e.to)) errors.push({ key: 'flowDef.validate.edgeToMissing', params: { to: e.to } })
    if (e.from === e.to) errors.push({ key: 'flowDef.validate.selfLoop', params: { id: e.from } })
    const key = `${e.from}\u0000${e.to}`
    if (seenEdges.has(key)) errors.push({ key: 'flowDef.validate.duplicateEdge', params: { from: e.from, to: e.to } })
    seenEdges.add(key)
    if (e.condition) {
      const c = e.condition
      if (!c.field || c.field.length > 64 || !/^[A-Za-z0-9_]+$/.test(c.field)) {
        errors.push({
          key: 'flowDef.validate.conditionFieldInvalid',
          params: { from: e.from, to: e.to, field: c.field }
        })
      }
      if (!CONDITION_OPS.includes(c.op)) {
        errors.push({
          key: 'flowDef.validate.conditionOpNotAllowed',
          params: { from: e.from, to: e.to, op: c.op }
        })
      }
      if (typeof c.value !== 'string' && typeof c.value !== 'number') {
        errors.push({ key: 'flowDef.validate.conditionValueInvalid', params: { from: e.from, to: e.to } })
      }
    }
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(e.to)
  }
  // 4. 可达性：start 可达 end + 孤儿审批节点
  const visited = new Set<string>([startId])
  const queue = [startId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const nx of adj.get(cur) ?? []) {
      if (!visited.has(nx)) {
        visited.add(nx)
        queue.push(nx)
      }
    }
  }
  if (!visited.has(endId)) errors.push({ key: 'flowDef.validate.endUnreachable' })
  for (const n of graph.nodes) {
    if (n.type === 'approve' && !visited.has(n.id)) {
      errors.push({ key: 'flowDef.validate.approveNodeUnreachable', params: { id: n.id } })
    }
  }
  // 5. 环检测：DFS 三色标记（允许汇聚，不允许环）
  const state = new Map<string, 0 | 1 | 2>()
  const dfs = (id: string): void => {
    state.set(id, 1)
    for (const nx of adj.get(id) ?? []) {
      const st = state.get(nx) ?? 0
      if (st === 1) errors.push({ key: 'flowDef.validate.cycleDetected', params: { from: id, to: nx } })
      else if (st === 0) dfs(nx)
    }
    state.set(id, 2)
  }
  dfs(startId)
  // 环错误去重（DFS 可能报同环多次）
  return { ok: errors.length === 0, errors: dedupeMessages(errors) }
}

/** 同 key + 同参数的消息只留一条（DFS 报环会重复推送完全相同的项） */
function dedupeMessages(list: GraphValidationMessage[]): GraphValidationMessage[] {
  const seen = new Set<string>()
  const out: GraphValidationMessage[] = []
  for (const m of list) {
    const id = `${m.key}|${JSON.stringify(m.params ?? null)}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(m)
  }
  return out
}

/** 解析 graph_json 字符串（非法 JSON/结构不符 → null，由调用方给空图） */
export function parseGraphJson(raw: string | undefined): FlowGraph {
  if (!raw) return { nodes: [], edges: [] }
  try {
    const v = JSON.parse(raw) as Partial<FlowGraph>
    if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) return { nodes: [], edges: [] }
    return { nodes: v.nodes as FlowGraphNode[], edges: v.edges as FlowGraphEdge[] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

/** 版本对比：两图的节点/边差异清单（用于版本对比视图） */
export interface GraphDiff {
  addedNodes: string[]
  removedNodes: string[]
  changedNodes: string[]
  addedEdges: string[]
  removedEdges: string[]
  changedEdges: string[]
}

function edgeKey(e: FlowGraphEdge): string {
  return `${e.from}->${e.to}`
}

function nodeFingerprint(n: FlowGraphNode): string {
  return JSON.stringify({ t: n.type, n: n.name ?? '', a: n.assignees ?? [], m: n.multi ?? 'single', th: n.threshold, ac: n.actions ?? [] })
}

function edgeFingerprint(e: FlowGraphEdge): string {
  return JSON.stringify({ c: e.condition ?? null })
}

/** 语义化版本对比（same-code 跨版本：节点/边的增删改） */
export function diffGraphs(oldG: FlowGraph, newG: FlowGraph): GraphDiff {
  const oldNodes = new Map(oldG.nodes.map((n) => [n.id, n]))
  const newNodes = new Map(newG.nodes.map((n) => [n.id, n]))
  const oldEdges = new Map(oldG.edges.map((e) => [edgeKey(e), e]))
  const newEdges = new Map(newG.edges.map((e) => [edgeKey(e), e]))
  const diff: GraphDiff = {
    addedNodes: [], removedNodes: [], changedNodes: [],
    addedEdges: [], removedEdges: [], changedEdges: []
  }
  for (const [id, n] of newNodes) {
    if (!oldNodes.has(id)) diff.addedNodes.push(id)
    else if (nodeFingerprint(n) !== nodeFingerprint(oldNodes.get(id)!)) diff.changedNodes.push(id)
  }
  for (const [id, _n] of oldNodes) {
    if (!newNodes.has(id)) diff.removedNodes.push(id)
  }
  for (const [k, e] of newEdges) {
    if (!oldEdges.has(k)) diff.addedEdges.push(k)
    else if (edgeFingerprint(e) !== edgeFingerprint(oldEdges.get(k)!)) diff.changedEdges.push(k)
  }
  for (const [k] of oldEdges) {
    if (!newEdges.has(k)) diff.removedEdges.push(k)
  }
  return diff
}
