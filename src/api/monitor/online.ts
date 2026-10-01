import request from '@/utils/request'
import type { OnlineQueryParams, SysUserOnline, AjaxResult, TableDataInfo } from '@/types'

// 查询在线用户列表
export function list(query: OnlineQueryParams): Promise<TableDataInfo<SysUserOnline>> {
  return request({
    url: '/monitor/online/list',
    method: 'get',
    params: query
  })
}

// 强退用户
export function forceLogout(tokenId: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/online/' + tokenId,
    method: 'delete'
  })
}

// v5-N5：自助会话列表（后端强制按当前登录用户过滤，仅登录权限）
export function listMySessions(query: OnlineQueryParams): Promise<TableDataInfo<SysUserOnline>> {
  return request({
    url: '/monitor/my-session/list',
    method: 'get',
    params: query
  })
}

// v5-N5：自助注销本人会话（后端属主校验，仅登录权限）
export function logoutMySession(tokenId: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/my-session/' + tokenId,
    method: 'delete'
  })
}
