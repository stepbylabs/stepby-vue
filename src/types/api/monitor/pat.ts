import type { PageDomain } from '../common'

/** 个人访问令牌（后端生成脱敏视图，不含 token_hash） */
export type SysPat = import('@/types/api/generated/SysPat').PatVo

/** 新建令牌请求（后端生成类型） */
export type CreatePatDto = import('@/types/api/generated/PatCreateDto').CreatePatDto

/** 新建令牌结果：明文 token 仅此一次返回（后端生成类型） */
export type CreatePatResult = import('@/types/api/generated/PatCreateResult').CreatePatResult

/** 管理员令牌分页查询参数（可选按属主过滤） */
export interface PatAdminQueryParams extends PageDomain {
  /** 属主用户 ID（省略为全部） */
  userId?: number
}
