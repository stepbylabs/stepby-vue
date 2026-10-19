import request from '@/utils/request'
import type { SysCache, HotKey, CachePrefixStat, AjaxResult } from '@/types'

// 查询缓存详细
export function getCache(): Promise<AjaxResult<unknown>> {
  return request({
    url: '/monitor/cache',
    method: 'get'
  })
}

// 查询缓存名称列表
export function listCacheName(): Promise<AjaxResult<SysCache[]>> {
  return request({
    url: '/monitor/cache/getNames',
    method: 'get'
  })
}

// 查询热 key（大内存键）提示
export function getHotKeys(): Promise<AjaxResult<HotKey[]>> {
  return request({
    url: '/monitor/cache/hotKeys',
    method: 'get'
  })
}

// 查询缓存前缀内存统计
export function getPrefixStats(): Promise<AjaxResult<CachePrefixStat[]>> {
  return request({
    url: '/monitor/cache/prefixStats',
    method: 'get'
  })
}

// 查询缓存键名列表
// 缓存名/键名是自由字符串，必须按路径段编码：含 # 时未编码会被浏览器当片段丢弃，
// 导致这条查询/清理指令静默作用到另一个目标（键名含 / 时同理会被当成多一层路径段）
export function listCacheKey(cacheName: string): Promise<AjaxResult<string[]>> {
  return request({
    url: '/monitor/cache/getKeys/' + encodeURIComponent(cacheName),
    method: 'get'
  })
}

// 查询缓存内容
export function getCacheValue(cacheName: string, cacheKey: string): Promise<AjaxResult<SysCache>> {
  return request({
    url: '/monitor/cache/getValue/' + encodeURIComponent(cacheName) + '/' + encodeURIComponent(cacheKey),
    method: 'get'
  })
}

// 清理指定名称缓存
export function clearCacheName(cacheName: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/cache/clearCacheName/' + encodeURIComponent(cacheName),
    method: 'delete'
  })
}

// 清理指定键名缓存
export function clearCacheKey(cacheKey: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/cache/clearCacheKey/' + encodeURIComponent(cacheKey),
    method: 'delete'
  })
}
