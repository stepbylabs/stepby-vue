import request from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'

// 审批待办任务（sys_flow_task，方案 B′）
export interface SysFlowTask {
  taskId: number
  bizType: string
  bizId: number
  roundNo: number
  nodeSeq: number
  nodeName?: string
  assigneeId: number
  taskType: 'single' | 'countersign'
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
  flowMode: 'single' | 'countersign'
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
    | 'countersign_add'
    | 'timeout_remind'
    | 'auto_approve'
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
  flowMode: 'single' | 'countersign'
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
