import request from '@/utils/request'
import { download } from '@/utils/request'
import type { AjaxResult, TableDataInfo } from '@/types'
import type { SysAlertRule, AlertRuleQueryParams, AlertRuleSaveDto, AlertEvaluateResult } from '@/types'

// ==================== 告警规则引擎 ====================

// 分页查询告警规则
export function listAlert(query: AlertRuleQueryParams): Promise<TableDataInfo<SysAlertRule>> {
  return request({
    url: '/monitor/alert/list',
    method: 'get',
    params: query
  })
}

// 查询告警规则详细
export function getAlert(id: number | string): Promise<AjaxResult<SysAlertRule>> {
  return request({
    url: '/monitor/alert/' + id,
    method: 'get'
  })
}

// 新增告警规则
export function addAlert(data: AlertRuleSaveDto): Promise<AjaxResult<SysAlertRule>> {
  return request({
    url: '/monitor/alert',
    method: 'post',
    data
  })
}

// 修改告警规则
export function updateAlert(data: AlertRuleSaveDto): Promise<AjaxResult<SysAlertRule>> {
  return request({
    url: '/monitor/alert',
    method: 'put',
    data
  })
}

// 批量删除告警规则
export function delAlert(ids: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/monitor/alert/' + ids,
    method: 'delete'
  })
}

// 启用/停用切换
export function changeAlertEnabled(id: number | string, enabled: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/alert/changeEnabled',
    method: 'put',
    data: { id, enabled }
  })
}

// 手动评估一次：立即采集指标并按规则判定
export function evaluateAlert(id: number | string): Promise<AjaxResult<AlertEvaluateResult>> {
  return request({
    url: '/monitor/alert/' + id + '/evaluate',
    method: 'post'
  })
}

// 导出告警规则列表为 Excel（后端表单 POST）
export function exportAlert(query: AlertRuleQueryParams): void {
  download('/monitor/alert/export', { ...query }, `alert_rule_${new Date().getTime()}.xlsx`)
}
