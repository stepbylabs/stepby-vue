import request from '@/utils/request'
import type { RouterVo, AjaxResult } from '@/types'

// 获取动态路由（登录后由后端按用户权限下发菜单/路由表）
export const getRouters = (): Promise<AjaxResult<RouterVo>> => {
  return request({
    url: '/getRouters',
    method: 'get'
  })
}
