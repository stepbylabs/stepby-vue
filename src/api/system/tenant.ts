import request from '@/utils/request'
import type { AjaxResult } from '@/types'
import type { PackageFeaturesVo } from '@/types/api/generated/PackageFeaturesVo'
import type { PackageFeaturesUpdateDto } from '@/types/api/generated/PackageFeaturesUpdateDto'

/**
 * 租户管理 API（多租户 Phase 3：事实源 = sys_tenant，主键 = tenantId 独立 id 空间）
 *
 * 后端契约（src/handler/sys_tenant_handler.rs / src/service/sys_tenant_service.rs）：
 * - GET    /system/tenant/list            租户列表（平台全量；租户操作者仅本租户）
 * - GET    /system/tenant/{tenantId}      租户详情
 * - POST   /system/tenant                 新建租户（仅平台；响应含一次性管理员初始密码）
 * - PUT    /system/tenant                 修改租户（平台可改全部；租户仅名称/联系人/备注）
 * - PUT    /system/tenant/changeStatus    租户启停（停用立即吊销该租户全部会话，仅平台）
 * - DELETE /system/tenant/{tenantId}      删除租户（软删回收站；租户内仍有用户时拒绝，仅平台）
 * - PUT    /system/tenant/restore/{tenantId}  恢复租户（回收站 → 停用态，仅平台）
 * - GET    /system/tenant/package/options 套餐下拉（仅平台；租户表单选择套餐用）
 * - GET    /system/tenant/package/{packageId}/features 套餐能力位查询（仅平台）
 * - PUT    /system/tenant/package/features             套餐能力位保存（仅平台）
 * - POST   /system/backup/tenant-export/{tenantId} 租户数据包导出（仅平台；复用备份下载链路）
 */

/** 租户查询参数 */
export interface TenantQueryParams {
  /** 租户名称（模糊） */
  tenantName?: string
  /** 租户短码（精确） */
  tenantCode?: string
  /** 生命周期过滤：'0' 在册（默认）/ '2' 回收站 */
  delFlag?: string
}

/** 租户视图（对齐后端 TenantVo） */
export interface TenantVo {
  /** 租户 ID（独立 id 空间；接口主键） */
  tenantId: number
  /** 租户短码（域名/展示/管理员用户名前缀） */
  tenantCode: string
  tenantName: string
  /** 组织树挂载根部门（可能缺省） */
  deptId?: number
  packageId?: number
  packageName?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  /** 主域名（冗余自 sys_tenant_domain） */
  domain?: string
  /** 到期时间（空 = 永不过期） */
  expireTime?: string
  /** 账号数上限（0 = 不限） */
  accountCount: number
  /** '0' 正常 / '1' 停用 */
  status?: string
  /** '0' 存在 / '2' 已删除（回收站） */
  delFlag?: string
  /** 租户内用户数 */
  userCount: number
  /** 根部门负责人（组织树展示字段） */
  leader?: string
  phone?: string
  email?: string
  orderNum?: number
  remark?: string
  createTime?: string
  /** 租户管理员用户名（仅新建响应返回） */
  adminUserName?: string
  /** 租户管理员初始密码（**仅新建响应返回一次**） */
  adminInitPassword?: string
}

/** 租户新增入参（仅平台管理员，对齐后端 TenantAddDto） */
export interface TenantAddDto {
  tenantName: string
  /** 租户短码（可选；缺省由后端按 t{uuid 前 8 位} 生成） */
  tenantCode?: string
  packageId?: number
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  /** 到期时间（可空 = 永不过期；格式 YYYY-MM-DD HH:mm:ss） */
  expireTime?: string
  /** 账号数上限（0 = 不限；缺省取套餐默认值） */
  accountCount?: number
  /** '0' 正常 / '1' 停用 */
  status?: string
  orderNum?: number
  /** 根部门负责人 */
  leader?: string
  phone?: string
  email?: string
  remark?: string
}

/**
 * 租户修改入参（平台可改全部；租户仅可改名称/联系人/备注，对齐后端 TenantEditDto）
 *
 * 平台分配项（packageId/accountCount/expireTime）为**三态语义**（对齐后端）：
 * - 字段缺省（undefined）→ 不修改该字段；
 * - 显式 `null` → 清空（packageId = 不分配套餐 / accountCount = 0 不限 / expireTime = 永不过期）；
 * - 传值 → 设置为该值。
 *
 * 前端清理表单后必须显式传 null（而非省略字段），否则"清空到期时间/套餐"不会生效。
 */
export interface TenantEditDto {
  tenantId: number
  tenantName: string
  packageId?: number | null
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  expireTime?: string | null
  accountCount?: number | null
  orderNum?: number
  leader?: string
  phone?: string
  email?: string
  remark?: string
}

/** 套餐下拉项（对齐后端 TenantPackageOptionVo） */
export interface TenantPackageOption {
  packageId: number
  packageName: string
  /** 套餐默认账号数（0 = 不限） */
  defaultAccountCount: number
}

// 查询租户列表（delFlag='0' 在册 / '2' 回收站；平台全量，租户仅本租户）
export function listTenant(query?: TenantQueryParams): Promise<AjaxResult<TenantVo[]>> {
  return request({
    url: '/system/tenant/list',
    method: 'get',
    params: query
  })
}

// 查询租户详情
export function getTenant(tenantId: number): Promise<AjaxResult<TenantVo>> {
  return request({
    url: '/system/tenant/' + tenantId,
    method: 'get'
  })
}

// 新增租户（仅平台；响应 data 含一次性 adminInitPassword）
export function addTenant(data: TenantAddDto): Promise<AjaxResult<TenantVo>> {
  return request({
    url: '/system/tenant',
    method: 'post',
    data: data
  })
}

// 修改租户
export function updateTenant(data: TenantEditDto): Promise<AjaxResult<TenantVo>> {
  return request({
    url: '/system/tenant',
    method: 'put',
    data: data
  })
}

// 租户启停（停用后该租户全部会话立即吊销，用户无法登录）
export function changeTenantStatus(tenantId: number, status: string): Promise<AjaxResult> {
  return request({
    url: '/system/tenant/changeStatus',
    method: 'put',
    data: { tenantId, status }
  })
}

// 删除租户（软删至回收站；租户内仍有用户时拒绝）
export function delTenant(tenantId: number): Promise<AjaxResult> {
  return request({
    url: '/system/tenant/' + tenantId,
    method: 'delete'
  })
}

// 恢复租户（回收站 → 停用态，需再显式启用）
export function restoreTenant(tenantId: number): Promise<AjaxResult<TenantVo>> {
  return request({
    url: '/system/tenant/restore/' + tenantId,
    method: 'put'
  })
}

// 套餐下拉（仅平台；用于租户表单选择套餐白名单）
export function listTenantPackageOptions(): Promise<AjaxResult<TenantPackageOption[]>> {
  return request({
    url: '/system/tenant/package/options',
    method: 'get'
  })
}

/**
 * 查询套餐能力位配置（仅平台）
 *
 * 能力位 = 三层开关的**中间层**：平台 `config.toml [features]`（能开什么）
 * → 本配置（这个租户能开什么）→ 角色授权（这个人能用什么）。
 * 返回值含**全量注册表** `items`（前端不硬编码能力位清单）与 `platformEnabled`
 * （平台层天花板：未出现在此数组的能力位无法开启，开启会被后端 400 拒绝）。
 */
export function getPackageFeatures(packageId: number): Promise<AjaxResult<PackageFeaturesVo>> {
  return request({
    url: '/system/tenant/package/' + packageId + '/features',
    method: 'get'
  })
}

/**
 * 保存套餐能力位配置（仅平台）
 *
 * 落库前由后端做三道校验：键必须已登记、模式必须在允许集合内、
 * **非 off 的项必须在平台层 `[features]` 已开启**（否则 400）。
 * 保存后后端会立即收敛该套餐下全部租户的角色菜单授权（关闭能力位同步回收菜单）。
 */
export function updatePackageFeatures(
  data: PackageFeaturesUpdateDto
): Promise<AjaxResult<PackageFeaturesVo>> {
  return request({
    url: '/system/tenant/package/features',
    method: 'put',
    data
  })
}

/** 租户数据包导出响应（对齐后端 BackupCreateVo） */
export interface TenantExportVo {
  backupId: number
  fileName: string
  filePath: string
  fileSize: number
}

/**
 * 导出租户数据包（仅平台；平台专属能力 system:backup:query）
 *
 * 后端把该租户在全部承载 `tenant_id` 的表（含 `sys_tenant` / `sys_tenant_domain` /
 * `sys_tenant_menu`）的行导出为单个 JSON 文件并登记一条 `backup_type = "tenant_export"`
 * 的备份日志；随后用 `downloadBackup(backupId)` 走既有下载链路取文件。
 * 租户级恢复不支持（只导出不导入）。
 */
export function exportTenantPackage(tenantId: number): Promise<AjaxResult<TenantExportVo>> {
  return request({
    url: '/system/backup/tenant-export/' + tenantId,
    method: 'post'
  })
}