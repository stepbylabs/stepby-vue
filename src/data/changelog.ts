/**
 * 更新日志数据（首页"版本动态"卡片与 /tool/changelog 页面共用）
 * Copyright (c) 2026 Stepby
 *
 * 版本/日期是数据，条目**文案**的唯一事实源在语言包（locales 的 `changelog.item.*`）：
 * 本文件是无 i18n 上下文的纯数据模块，硬编码中文会让 en-US 用户看到整段中文，
 * 故 items 存稳定的 i18n key，由消费视图按序 `t(item)` 渲染（搜索也按翻译后的文案匹配）。
 */

export interface ChangelogEntry {
  version: string
  date: string
  /** 条目文案的 i18n key（顺序即展示顺序） */
  items: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: 'v0.1.0',
    date: '2026-10-01',
    items: [
      'changelog.item.openSourceBaseline',
      'changelog.item.multiTenant',
      'changelog.item.ssoProvider',
      'changelog.item.workflowEngine',
      'changelog.item.auditInsight',
      'changelog.item.securityBaseline',
      'changelog.item.i18nAndMobile'
    ]
  }
]
