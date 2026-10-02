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
export function listCacheKey(cacheName: string): Promise<AjaxResult<string[]>> {
  return request({
    url: '/monitor/cache/getKeys/' + cacheName,
    method: 'get'
  })
}

// 查询缓存内容
export function getCacheValue(cacheName: string, cacheKey: string): Promise<AjaxResult<SysCache>> {
  return request({
    url: '/monitor/cache/getValue/' + cacheName + '/' + cacheKey,
    method: 'get'
  })
}

// 清理指定名称缓存
export function clearCacheName(cacheName: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/cache/clearCacheName/' + cacheName,
    method: 'delete'
  })
}

// 清理指定键名缓存
export function clearCacheKey(cacheKey: string): Promise<AjaxResult> {
  return request({
    url: '/monitor/cache/clearCacheKey/' + cacheKey,
    method: 'delete'
  })
}
