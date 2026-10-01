import request from '@/utils/request'
import type { AjaxResult } from '@/types'

/**
 * 租户域名管理 API（多租户 Phase 3 域名链路，文档 §27.7 / §29.6）
 *
 * 后端契约（src/handler/sys_tenant_domain_handler.rs）：
 * - GET    /system/tenant/domain/list               域名列表（仅平台可传 tenantId 过滤；租户操作者 403）
 * - POST   /system/tenant/domain                    新增绑定（仅平台；冲突 400）
 * - POST   /system/tenant/domain/verify/{domainId}  DNS TXT 验证（仅平台）
 * - PUT    /system/tenant/domain/primary            设为主域名（仅平台；未验证 400）
 * - PUT    /system/tenant/domain/changeStatus       启停（仅平台）
 * - DELETE /system/tenant/domain/{domainId}         删除绑定（仅平台）
 *
 * 安全：本接口组整体为平台专属（tenant_id=0），租户操作者一律 403（不静默降级为
 * "只读本租户"，避免域名台账成为租户侧无授权信息面）；租户自助延后至 P3。
 */

/** 域名视图（对齐后端 TenantDomainVo） */
export interface TenantDomainVo {
  domainId: number
  tenantId: number
  /** 归属租户名（缺失为空） */
  tenantName?: string
  domain: string
  /** '0' 子域名 / '1' 自定义域名 */
  domainType: string
  /** '0' 主域名 / '1' 附加域名 */
  isPrimary?: string
  /** '0' 待验证 / '1' 已验证 / '2' 验证失败 */
  verifyStatus?: string
  /** DNS TXT 校验 token（仅平台操作者可见——本接口组整体平台专属） */
  verifyToken?: string
  /** 验证通过时间 */
  verifiedAt?: string
  /** '0' 启用 / '1' 停用 */
  status?: string
  createBy?: string
  createTime?: string
  remark?: string
}

/** 新增域名入参（对齐后端 TenantDomainAddDto） */
export interface TenantDomainAddDto {
  tenantId: number
  /** 绑定域名（小写、去端口） */
  domain: string
  /** '0' 子域名 / '1' 自定义域名 */
  domainType: string
  /** '0' 主域名 / '1' 附加域名（缺省：该租户首个域名自动为主域名） */
  isPrimary?: string
  remark?: string
}

/** 验证结果（对齐后端 TenantDomainVerifyVo） */
export interface TenantDomainVerifyVo {
  domainId: number
  tenantId: number
  domain: string
  /** 是否验证通过 */
  verified: boolean
  /** '1' 已验证 / '2' 验证失败 */
  verifyStatus: string
  /** 需配置的 TXT 记录名 */
  txtRecord: string
  /** 需配置的 TXT 记录值（仅平台操作者可见） */
  txtValue?: string
  verifiedAt?: string
}

/** 域名列表（tenantId 缺省时：平台 = 全量，租户操作者 = 强制本租户） */
export function listTenantDomain(tenantId?: number): Promise<AjaxResult<TenantDomainVo[]>> {
  return request({
    url: '/system/tenant/domain/list',
    method: 'get',
    params: tenantId != null ? { tenantId } : undefined
  })
}

/** 新增域名绑定（仅平台） */
export function addTenantDomain(data: TenantDomainAddDto): Promise<AjaxResult<TenantDomainVo>> {
  return request({
    url: '/system/tenant/domain',
    method: 'post',
    data
  })
}

/** DNS TXT 验证（仅平台；返回需配置的 TXT 记录名/值与验证结果） */
export function verifyTenantDomain(domainId: number): Promise<AjaxResult<TenantDomainVerifyVo>> {
  return request({
    url: '/system/tenant/domain/verify/' + domainId,
    method: 'post'
  })
}

/** 设为主域名（仅平台；需已验证） */
export function setPrimaryTenantDomain(domainId: number): Promise<AjaxResult<TenantDomainVo>> {
  return request({
    url: '/system/tenant/domain/primary',
    method: 'put',
    data: { domainId }
  })
}

/** 域名启停（仅平台） */
export function changeTenantDomainStatus(domainId: number, status: string): Promise<AjaxResult> {
  return request({
    url: '/system/tenant/domain/changeStatus',
    method: 'put',
    data: { domainId, status }
  })
}

/** 删除域名绑定（仅平台） */
export function delTenantDomain(domainId: number): Promise<AjaxResult> {
  return request({
    url: '/system/tenant/domain/' + domainId,
    method: 'delete'
  })
}