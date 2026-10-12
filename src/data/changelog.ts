/**
 * 更新日志数据（首页"版本动态"卡片与 /tool/changelog 页面共用）
 * Copyright (c) 2026 Stepby
 */

export interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: 'v0.1.0',
    date: '2026-10-01',
    items: [
      '开源基线首发：SharedStore 双档共享态（local 纯 SQL / redis），单文件零依赖部署',
      '多租户全套：租户管理、套餐能力位、租户运行时键与权限隔离',
      '单点登录（OIDC Provider）：授权码 / 刷新令牌 / RS256 / 会话管理',
      '审批工作流引擎：两级审批、超时扫描、待办提醒防打扰（首提 + 超期升级主管）',
      '审计与可视化：操作日志差异、审计大屏、合规报告导出',
      '安全基线：权限 fail-closed、黑名单与密码版本权威层、敏感操作独立限流',
      '国际化（中/英）、响应式移动端适配、主题切换'
    ]
  }
]
