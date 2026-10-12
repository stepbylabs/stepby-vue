import request from '@/utils/request'
import type { AjaxResult } from '@/types'

/** 全局搜索结果项（GET /common/global-search 返回行） */
export interface GlobalSearchItem {
  /** 结果类型（如 menu / user / job 等，供分组展示） */
  type: string
  /** 业务对象 ID */
  id: string | number
  /** 主标题 */
  title: string
  /** 副标题（可选） */
  subtitle?: string
  /** 跳转地址（应用内路由或外链） */
  url: string
}

// 全局搜索（命令面板"搜索模式"数据源；q 最少 2 字符，limit 限制条数）
export function globalSearch(q: string, limit = 20): Promise<AjaxResult<GlobalSearchItem[]>> {
  return request({
    url: '/common/global-search',
    method: 'get',
    params: { q, limit }
  })
}
