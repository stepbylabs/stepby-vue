import type { PageDomain, BaseEntity } from "../common";

/** 参数配置分页查询参数 */
export interface ConfigQueryParams extends PageDomain {
  /** 参数名称 */
  configName?: string;
  /** 参数键名 */
  configKey?: string;
  /** 系统内置 */
  configType?: string;
  /** 创建时间 */
  params?: {
    beginTime?: string;
    endTime?: string;
  };
}

/**
 * 参数配置信息
 *
 * 契约单一事实源：`src/types/api/generated/SysConfig.ts`（ts-rs 从后端生成），
 * 字段名与可空性以该文件为准；本接口同时充当新增/修改的请求体（故保留 BaseEntity 的可选项）。
 */
export interface SysConfig extends BaseEntity {
  /** 参数编号 */
  configId?: number;
  /** 参数名称 */
  configName?: string;
  /** 参数键名 */
  configKey?: string;
  /** 参数键值 */
  configValue?: string;
  /** 系统内置（Y是 N否） */
  configType?: 'Y' | 'N';
  /** 多租户归属（后端实发且非空；0 = 平台租户） */
  tenantId?: number;
  /**
   * 治理域：platform_only（平台锁定，租户不可见/不可改）/
   * platform_default（租户可见、可覆盖）/ tenant_private（租户私有）；列默认 platform_only（fail-closed）
   */
  scope?: string | null;
  /** 租户是否可覆盖（"1"=可 "0"=不可）；列默认 '0'（fail-closed） */
  tenantEditable?: string | null;
  /** 租户是否可见（"1"=可见 "0"=不可见）；列默认 '0'，平台安全项由后端常量锁定为 '0' */
  visibleToTenant?: string | null;
}
