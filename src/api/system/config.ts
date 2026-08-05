import request from '@/utils/request'
import { cachedApi, invalidateApiCache, invalidateByPrefix } from '@/utils/apiCache'
import type { ConfigQueryParams, SysConfig, AjaxResult, TableDataInfo } from '@/types'

// 查询参数列表
export function listConfig(query: ConfigQueryParams): Promise<TableDataInfo<SysConfig>> {
  return request({
    url: '/system/config/list',
    method: 'get',
    params: query
  })
}

// 查询参数详细
export function getConfig(configId: number | string): Promise<AjaxResult<SysConfig>> {
  return request({
    url: '/system/config/' + configId,
    method: 'get'
  })
}

// 根据参数键名查询参数值（带 30s TTL 内存缓存 + 并发请求去重，按 configKey 区分）
// 缓存 key 形如 system:config:configKey:sys.user.initPassword，避免与其它接口冲突
export const getConfigKey = cachedApi(
  (configKey: string) => `system:config:configKey:${configKey}`,
  (configKey: string): Promise<AjaxResult> =>
    request({
      url: '/system/config/configKey/' + configKey,
      method: 'get'
    })
)

/**
 * 强制刷新指定 configKey 的缓存（下次调用 getConfigKey(configKey) 时会重新请求后端）
 *
 * 用途：参数配置页修改某项参数后，可通过此方法让其它页面立即拿到最新值
 */
export function refreshConfigKey(configKey: string): void {
  invalidateApiCache(`system:config:configKey:${configKey}`)
}

/**
 * 失效所有 getConfigKey 内存缓存（前缀匹配）
 *
 * 用途：参数配置页的新增/修改/删除操作后，无法精确知道前端有多少页面缓存了哪个 configKey，
 * 统一按 `system:config:configKey:` 前缀失效，确保下次读取全部从后端拉取最新值。
 * 与后端 refreshCache（清理 Redis）配合，形成"前端内存 + 后端 Redis"双层失效。
 */
export function invalidateConfigCache(): void {
  invalidateByPrefix('system:config:configKey:')
}

// 新增参数配置
export function addConfig(data: SysConfig): Promise<AjaxResult> {
  return request({
    url: '/system/config',
    method: 'post',
    data: data
  })
}

// 修改参数配置
export function updateConfig(data: SysConfig): Promise<AjaxResult> {
  return request({
    url: '/system/config',
    method: 'put',
    data: data
  })
}

// 删除参数配置
export function delConfig(configId: number | string | Array<number | string>): Promise<AjaxResult> {
  return request({
    url: '/system/config/' + configId,
    method: 'delete'
  })
}

// 刷新参数缓存
export function refreshCache(): Promise<AjaxResult> {
  return request({
    url: '/system/config/refreshCache',
    method: 'delete'
  })
}
