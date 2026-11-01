/**
 * 操作录制与回放 API（b147）
 *
 * 路径与后端 `router/op_recording_router.rs` 一一对应：
 * - 列表/详情/新建/编辑/删除 走抬头
 * - 步骤：追加 / 删一步 / 清空
 * - 回放：启动（异步）/ 预检（dryRun）/ 运行列表 / 运行详情
 * - 导出：POST + blob（复用 `utils/request` 的 `download()`——它是全仓唯一把
 *   "HTTP 200 + JSON 错误体 / 0 字节载荷 / 保存通道失败"三条失败出口都判掉的通道）
 */
import request, { download } from '@/utils/request'

/** 录制抬头 */
export interface OpRecording {
  recordingId: number
  tenantId?: number
  name: string
  description?: string | null
  source: string
  status: string
  stepCount: number
  lastRunStatus?: string | null
  lastRunTime?: string | null
  ownerId?: number | null
  ownerName?: string | null
  createTime?: string | null
  updateTime?: string | null
}

/** 录制步骤 */
export interface OpRecordingStep {
  stepId: number
  recordingId: number
  seq: number
  method: string
  path: string
  queryString?: string | null
  contentType?: string | null
  body?: string | null
  headersJson?: string | null
  extractJson?: string | null
  expectStatus?: number | null
  note?: string | null
  createTime?: string | null
}

/** 录制详情（抬头 + 步骤） */
export type OpRecordingDetail = OpRecording & { steps: OpRecordingStep[] }

/** 回放逐步骤结论 */
export interface OpReplayStep {
  seq: number
  method: string
  path: string
  status?: number | null
  ok: boolean
  skipped: boolean
  durationMs: number
  error?: string | null
  responseExcerpt?: string | null
}

/** 回放运行记录 */
export interface OpReplayRun {
  runId: number
  recordingId: number
  taskId?: number | null
  status: string
  total: number
  succeeded: number
  failed: number
  skipped: number
  operator?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}

/** 运行详情（运行 + 逐步骤） */
export type OpReplayRunDetail = OpReplayRun & { steps: OpReplayStep[] }

/** 预检渲染的一步 */
export interface OpStepPreview {
  seq: number
  method: string
  url: string
  contentType?: string | null
  body?: string | null
  expectStatus?: number | null
  problem?: string | null
}

/** 回放启动结果 */
export interface OpReplayStart {
  runId: number
  taskId: number
  total: number
  preview?: OpStepPreview[] | null
}

/** 回放选项 */
export interface OpReplayOptions {
  stopOnError?: boolean
  vars?: Record<string, string>
  timeoutSecs?: number
  maxSteps?: number
  dryRun?: boolean
}

/** 分页查询参数 */
export interface OpRecordingQuery {
  pageNum?: number
  pageSize?: number
  name?: string
  status?: string
  source?: string
  orderByColumn?: string
  isAsc?: string
}

/** 分页查询录制 */
export function listRecording(query: OpRecordingQuery): Promise<{ rows: OpRecording[]; total: number }> {
  return request({
    url: '/tool/recording/list',
    method: 'get',
    params: query
  })
}

/** 录制详情 */
export function getRecording(recordingId: number | string): Promise<{ data: OpRecordingDetail }> {
  return request({
    url: '/tool/recording/' + recordingId,
    method: 'get'
  })
}

/** 新建录制 */
export function addRecording(data: OpRecording): Promise<unknown> {
  return request({
    url: '/tool/recording',
    method: 'post',
    data
  })
}

/** 编辑录制 */
export function updateRecording(data: OpRecording): Promise<unknown> {
  return request({
    url: '/tool/recording',
    method: 'put',
    data
  })
}

/** 删除录制（连带步骤与运行记录） */
export function delRecording(ids: string | number | (string | number)[]): Promise<unknown> {
  const list = Array.isArray(ids) ? ids.join(',') : String(ids)
  return request({
    url: '/tool/recording/' + list,
    method: 'delete'
  })
}

/** 单步写入载荷（追加与就地改共用同一形状） */
export interface StepWritePayload {
  method: string
  path: string
  queryString?: string
  body?: string
  note?: string
  expectStatus?: number
  extractJson?: string
}

/** 追加一步（API 方式写入录制的入口） */
export function appendStep(recordingId: number | string, data: StepWritePayload): Promise<unknown> {
  return request({
    url: '/tool/recording/' + recordingId + '/steps',
    method: 'post',
    data
  })
}

/**
 * 就地改一步。
 *
 * `seq` 由服务端保持不变（改「期望什么状态码」不是「把这一步挪到别处」），
 * `headers` 也不参与编辑——它是采集产物，不是界面上可编辑的字段。
 */
export function updateStep(
  recordingId: number | string,
  stepId: number | string,
  data: StepWritePayload
): Promise<{ data: OpRecordingStep }> {
  return request({
    url: '/tool/recording/' + recordingId + '/steps/' + stepId,
    method: 'put',
    data
  })
}

/** 导入脚本里的一步（与 `/export?format=json` 的输出逐字对齐） */
export interface ImportStepPayload {
  method: string
  path: string
  queryString?: string | null
  contentType?: string | null
  body?: string | null
  headers?: Record<string, string> | null
  extractJson?: Record<string, string> | string | null
  expectStatus?: number | null
  note?: string | null
}

/** 导入载荷（= 导出的 JSON 文件内容） */
export interface ImportPayload {
  name?: string
  description?: string
  steps: ImportStepPayload[]
}

/** 导入一份 JSON 脚本：整条事务，失败时服务端点名是第几步 */
export function importRecording(data: ImportPayload): Promise<{ data: OpRecordingDetail }> {
  return request({
    url: '/tool/recording/import',
    method: 'post',
    data
  })
}

/** 删除某一步（后续序号自动前移） */
export function delStep(recordingId: number | string, stepId: number | string): Promise<unknown> {
  return request({
    url: '/tool/recording/' + recordingId + '/steps/' + stepId,
    method: 'delete'
  })
}

/** 清空步骤 */
export function clearSteps(recordingId: number | string): Promise<unknown> {
  return request({
    url: '/tool/recording/' + recordingId + '/steps',
    method: 'delete'
  })
}

/** 启动回放（dryRun=true 时只预检，不发任何请求） */
export function replayRecording(
  recordingId: number | string,
  options: OpReplayOptions
): Promise<{ data: OpReplayStart }> {
  return request({
    url: '/tool/recording/' + recordingId + '/replay',
    method: 'post',
    data: options
    // 回放启动本身只做校验 + 建任务行，正常远快于全局超时；不额外放大上限
  })
}

/** 最近回放记录 */
export function listRuns(recordingId: number | string, limit = 20): Promise<{ data: OpReplayRun[] }> {
  return request({
    url: '/tool/recording/' + recordingId + '/runs',
    method: 'get',
    params: { limit }
  })
}

/** 单次回放详情 */
export function getRun(recordingId: number | string, runId: number | string): Promise<{ data: OpReplayRunDetail }> {
  return request({
    url: '/tool/recording/' + recordingId + '/runs/' + runId,
    method: 'get'
  })
}

/**
 * 导出脚本。
 *
 * 返回布尔值而不是 void：调用点只负责"成功话能不能说"，`false` 时不要再补一条通用
 * "下载失败"（会与 errorHub 重复）。
 *
 * 返回值刻意**按形态取值**而不是直接 return：`download()` 的契约正在演进——旧形态把结果
 * 交给保存通道后不返回任何值，新形态返回 boolean（`true` = 已交给通道 / `false` = 已按类
 * 别上报失败）。直接 `return download(...)` 会在旧形态下编译失败（`void` 不可赋给
 * `boolean`），而这处编译错误只有按提交树校验才会暴露（工作区里 `request.ts` 已被另一批
 * 改成 boolean）。取不到布尔值即视为"已交给通道"——失败分类始终由 `download()` 内部完成，
 * 本函数不替代它做判定。
 */
export async function exportScript(
  recordingId: number | string,
  format: 'curl' | 'http' | 'json',
  filename: string
): Promise<boolean> {
  const ext = format === 'curl' ? 'sh' : format
  const outcome = (await download(
    `/tool/recording/${recordingId}/export?format=${format}`,
    {},
    filename || `recording-${recordingId}.${ext}`
  )) as unknown as boolean | undefined
  return outcome !== false
}
