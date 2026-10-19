import request from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'
import type { FlowGraphDoc } from '@/types/api/generated/FlowGraphDoc'

// 审批待办任务（sys_flow_task，方案 B′）
export interface SysFlowTask {
  taskId: number
  bizType: string
  bizId: number
  roundNo: number
  nodeSeq: number
  nodeName?: string
  assigneeId: number
  /** 引擎四模式定格值（后端 NodeSpec::task_type）；单审以外均须按会签族渲染 */
  taskType: 'single' | 'countersign' | 'or_sign' | 'weighted'
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'transferred'
  title?: string
  applicantId: number
  applicantName?: string
  comment?: string
  actedAt?: string
  dueAt?: string
  lastRemindedAt?: string
  createTime?: string
}

// 示例审批单据（请假申请，flow_demo_doc）
export interface FlowDemoDoc {
  docId: number
  title: string
  applicantId: number
  applicantName?: string
  deptId?: number
  leaveType: 'annual' | 'sick' | 'personal'
  days: number
  reason?: string
  /** 四模式（后端 is_valid_flow_mode 枚举：single/countersign/or_sign/weighted） */
  flowMode: 'single' | 'countersign' | 'or_sign' | 'weighted'
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn'
  currentRound: number
  currentNodeSeq?: number
  submittedAt?: string
  finishedAt?: string
  createTime?: string
}

// 审批流水（sys_flow_log）
export interface SysFlowLog {
  logId: number
  bizType: string
  bizId: number
  roundNo: number
  nodeSeq?: number
  action:
    | 'submit'
    | 'approve'
    | 'reject'
    | 'withdraw'
    | 'transfer'
    | 'delegate'
    | 'countersign_add'
    | 'countersign_del'
    | 'timeout_remind'
  fromStatus?: string
  toStatus?: string
  operatorId?: number
  toUserId?: number
  comment?: string
  actedAt?: string
}

export interface FlowPageQuery {
  pageNum?: number
  pageSize?: number
  status?: string
}

// 已办视图行（W-8）：流水字段 + 单据标题，由后端 ts-rs 生成（含查得的 title）
export type FlowDoneVo = import('@/types/api/generated/FlowDoneVo').FlowDoneVo

// 提交示例请假单
export interface FlowSubmitForm {
  title: string
  leaveType: 'annual' | 'sick' | 'personal'
  days: number
  reason?: string
  flowMode: 'single' | 'countersign' | 'or_sign' | 'weighted'
}

// 审批动作
export interface FlowActionForm {
  action: 'approve' | 'reject' | 'withdraw' | 'transfer'
  comment?: string
  toUserId?: number
}

export interface FlowTaskDetail {
  task: SysFlowTask
  doc?: FlowDemoDoc
  timeline: SysFlowLog[]
}

// 我的待办
export function listFlowTodo(query: FlowPageQuery): Promise<TableDataInfo<SysFlowTask>> {
  return request({
    url: '/system/flow/todo',
    method: 'get',
    params: query
  })
}

// 待办数量（红点）
export function flowPendingCount(): Promise<AjaxResult<number>> {
  return request({
    url: '/system/flow/pending-count',
    method: 'get'
  })
}

// 我发起的单据
export function listFlowMine(query: FlowPageQuery): Promise<TableDataInfo<FlowDemoDoc>> {
  return request({
    url: '/system/flow/mine',
    method: 'get',
    params: query
  })
}

// 我的已办（我作为审批人处理过的流水，action 为 approve/reject，W-8）
export function listFlowDone(query: FlowPageQuery): Promise<TableDataInfo<FlowDoneVo>> {
  return request({
    url: '/system/flow/done',
    method: 'get',
    params: query
  })
}

// 全部单据（管理视图，需 system:flow:list）
export function listFlowAll(query: FlowPageQuery): Promise<TableDataInfo<FlowDemoDoc>> {
  return request({
    url: '/system/flow/list',
    method: 'get',
    params: query
  })
}

// 任务详情 + 时间线
export function getFlowTaskDetail(taskId: number): Promise<AjaxResult<FlowTaskDetail>> {
  return request({
    url: `/system/flow/task/${taskId}`,
    method: 'get'
  })
}

// 提交示例请假单并发起审批
export function submitFlowDemo(data: FlowSubmitForm): Promise<AjaxResult<FlowDemoDoc>> {
  return request({
    url: '/system/flow/demo/submit',
    method: 'post',
    data
  })
}

// 重新提交（round_no + 1）
export function resubmitFlowDemo(docId: number): Promise<AjaxResult<FlowDemoDoc>> {
  return request({
    url: `/system/flow/demo/${docId}/resubmit`,
    method: 'post'
  })
}

// 撤回（发起人，按单据维度）
export function withdrawFlowDemo(docId: number): Promise<AjaxResult<SysFlowTask>> {
  return request({
    url: `/system/flow/demo/${docId}/withdraw`,
    method: 'post'
  })
}

// 审批动作（approve/reject/withdraw/transfer）
export function actFlowTask(taskId: number, data: FlowActionForm): Promise<AjaxResult<SysFlowTask>> {
  return request({
    url: `/system/flow/task/${taskId}/action`,
    method: 'post',
    data
  })
}

// 加签（W-3：对当前节点追加一名会签审批人）
export function countersignAddFlowTask(
  taskId: number,
  toUserId: number
): Promise<AjaxResult<SysFlowTask>> {
  return request({
    url: `/system/flow/task/${taskId}/countersign-add`,
    method: 'post',
    data: { toUserId }
  })
}

// 减签（G-02 M2：从当前节点移除一名会签审批人）
// 目标须是同轮同节点的 pending/approved 行，且移除后节点仍需 ≥1 名有效审批人，
// 否则后端 400（countersign_del_not_found / countersign_del_last_assignee）。
export function countersignDelFlowTask(
  taskId: number,
  toUserId: number
): Promise<AjaxResult<SysFlowTask>> {
  return request({
    url: `/system/flow/task/${taskId}/countersign-del`,
    method: 'post',
    data: { toUserId }
  })
}

// ==================== G-02 M3：流程定义设计器（flow_definition） ====================

/** 图节点类型白名单（BPMN-lite） */
export type FlowNodeType = 'start' | 'approve' | 'end'
/** 多签模式（对齐后端 MultiMode 四模式） */
export type FlowMultiMode = 'single' | 'countersign' | 'or_sign' | 'weighted'
/** 节点开放动作白名单 */
export type FlowNodeAction = 'delegate' | 'countersign_add' | 'countersign_del'

/** 图节点（graph_json.nodes 元素） */
export interface FlowGraphNode {
  id: string
  type: FlowNodeType
  name?: string
  /** 审批人形态（approve 必填 ≥1）：dept_leader | role:<key> */
  assignees?: string[]
  /** 多签模式（缺省 single） */
  multi?: FlowMultiMode
  /** 门槛（weighted 必填；countersign 可选） */
  threshold?: number
  /** 开放的高级动作 */
  actions?: FlowNodeAction[]
}

/** 原子条件（字段 比较符 值，6 比较符白名单） */
export interface FlowEdgeCondition {
  field: string
  op: '=' | '!=' | '>' | '>=' | '<' | '<='
  value: string | number
}

/** 图边（graph_json.edges 元素） */
export interface FlowGraphEdge {
  from: string
  to: string
  condition?: FlowEdgeCondition
}

/** 图结构（graph_json 反序列化形态） */
export interface FlowGraph {
  nodes: FlowGraphNode[]
  edges: FlowGraphEdge[]
}

/** 流程定义行（flow_definition） */
export interface FlowDefinition {
  flowId: number
  tenantId: number
  flowCode: string
  flowName: string
  graphJson: string
  version: number
  isLatest: boolean
  status: string
  remark?: string
  createTime?: string
  updateTime?: string
}

/** 定义新增/编辑入参 */
export interface FlowDefUpsertForm {
  flowId?: number
  flowCode: string
  flowName: string
  graphJson: string
  remark?: string
}

export function listFlowDefinitions(query?: {
  pageNum?: number
  pageSize?: number
  flowCode?: string
}): Promise<TableDataInfo<FlowDefinition>> {
  return request({
    url: '/system/flow/definition/list',
    method: 'get',
    params: query
  })
}

export function getFlowDefinition(flowId: number): Promise<AjaxResult<FlowDefinition>> {
  return request({
    url: `/system/flow/definition/${flowId}`,
    method: 'get'
  })
}

export function addFlowDefinition(data: FlowDefUpsertForm): Promise<AjaxResult<FlowDefinition>> {
  return request({
    url: '/system/flow/definition',
    method: 'post',
    data
  })
}

export function editFlowDefinition(data: FlowDefUpsertForm): Promise<AjaxResult<FlowDefinition>> {
  return request({
    url: '/system/flow/definition',
    method: 'put',
    data
  })
}

export function removeFlowDefinition(flowId: number): Promise<AjaxResult<unknown>> {
  return request({
    url: `/system/flow/definition/${flowId}`,
    method: 'delete'
  })
}

/** 发布（生成新版本并切换 is_latest），返回新版本号 */
export function publishFlowDefinition(flowId: number): Promise<AjaxResult<{ flowId: number; version: number }>> {
  return request({
    url: `/system/flow/definition/publish/${flowId}`,
    method: 'post'
  })
}

/** 图驱动单据提交（批次十六：按图推进——任一已发布流程图驱动审批） */
export function submitGraphDoc(data: {
  flowCode: string
  title: string
  fields: Record<string, unknown>
}): Promise<AjaxResult<FlowGraphDoc>> {
  return request({
    url: '/system/flow/graph/submit',
    method: 'post',
    data
  })
}
