/**
 * 表单构建器（tool/build）共享类型
 *
 * 背景：构建器节点/表单配置由用户拖拽动态生成，历史上统一标为 `any`，
 * 丢失全部类型安全（F-3）。此处给出「最小结构化类型」：只约束构建器确有读写的字段，
 * 其余未知字段通过索引签名放行 —— 既恢复 IDE 补全与拼写纠错，
 * 又不与运行时动态行为冲突（不夸大断言、不引入虚构字段）。
 *
 * 说明（live-editing contract）：`activeData` 由父组件以**整对象**持有并向下传递，
 * 子组件 RightPanel 直接 `v-model` 就地修改其字段（低代码场景的既有且有意设计，
 * 见 AGENTS.md `vue/no-mutating-props` 豁免登记）。因此这里只做「只读形状约束」，
 * 不改写为 emit 单向数据流 —— 单字段 emit 与父组件 188 处整对象引用天然冲突。
 */

/** 正则校验项（activeData.regList 元素） */
export interface BuildNodeRegItem {
  pattern: string
  message: string
}

/** 构建器节点数据（最小约束；其余动态字段由索引签名放行） */
export interface BuildNodeData {
  /** 节点唯一 id（新增/复制节点时递增分配） */
  formId?: number
  /** 渲染键（drawingList 内部排序/去重用） */
  renderKey?: number
  /** Element Plus 组件标签，如 el-input / el-select */
  tag?: string
  /** 组件中文名（右侧面板标题展示） */
  componentName?: string
  /** 组件图标名 */
  tagIcon?: string
  /** 绑定字段名（v-model） */
  vModel?: string
  /** 显示标题 */
  label?: string
  /** 占位文案 */
  placeholder?: string
  /** 栅格宽度（1-24） */
  span?: number
  /** 布局类型（rowFormItem 等特殊节点） */
  layout?: string
  /** 正则校验列表 */
  regList?: BuildNodeRegItem[]
  /** 文档链接 */
  document?: string
  /** 表单项 label 宽度（px；生成器配置中可能为 null 表示未设置） */
  labelWidth?: number | null
  /** 是否必填（透传 el-form-item required） */
  required?: boolean
  /** 栅格间距（rowFormItem） */
  gutter?: number
  /** 默认值（类型由所选组件决定，保持未知） */
  defaultValue?: unknown
  /** 子节点（rowFormItem 嵌套） */
  children?: BuildNodeData[]
  /** 已知动态字段（读写均可能）——保留宽松类型，其余由索引签名兜底 */
  [key: string]: unknown
}

/** 表单整体配置（formConf，仅约束确有读写的字段） */
export interface BuildFormConf {
  /** 表单列宽（label-width） */
  span?: number
  [key: string]: unknown
}
