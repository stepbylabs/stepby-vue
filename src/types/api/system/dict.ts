import type { PageDomain, BaseEntity } from '../common'

/** 字典分页查询参数 */
export interface DictTypeQueryParams extends PageDomain {
  /** 字典名称 */
  dictName?: string
  /** 字典类型 */
  dictType?: string
  /** 状态 */
  status?: string
  /** 创建时间 */
  params?: {
    beginTime?: string
    endTime?: string
  }
}

/** 字典数据查询参数 */
export interface DictDataQueryParams extends PageDomain {
  /** 字典名称 */
  dictName?: string
  /** 字典标签 */
  dictLabel?: string
  /** 字典类型 */
  dictType?: string
  /** 状态 */
  status?: string
}

/** 字典类型信息 */
export interface SysDictType extends BaseEntity {
  /** 字典编号 */
  dictId?: number
  /** 字典名称 */
  dictName?: string
  /** 字典类型 */
  dictType?: string
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 字典数据信息 */
export interface SysDictData extends BaseEntity {
  /** 字典编码 */
  dictCode?: number
  /** 字典标签（中文） */
  dictLabel?: string
  /** 字典标签（英文，国际化） */
  dictLabelEn?: string
  /** 字典键值 */
  dictValue?: string
  /** 字典类型 */
  dictType?: string
  /** 样式属性 */
  cssClass?: string
  /** 表格字典样式 */
  listClass?: string
  /** 字典排序 */
  dictSort?: number
  /** 是否默认（Y是 N否） */
  isDefault?: 'Y' | 'N'
  /** 状态（0正常 1停用） */
  status?: '0' | '1'
}

/** 前端使用的字典选项（由 SysDictData 映射而来，供 DictTag、selectDictLabel 等使用） */
export interface DictOption {
  /** 显示标签（按当前 locale 选择） */
  label: string
  /** 中文标签 */
  labelZh?: string
  /** 英文标签 */
  labelEn?: string
  /** 字典值 */
  value: string | number
  /** Element Plus 标签类型（primary/success/warning/danger/info） */
  elTagType?: string
  /** 自定义标签 class */
  elTagClass?: string
}
