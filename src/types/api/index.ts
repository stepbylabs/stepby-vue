/**
 * API 类型统一导出
 */
export * from './common'

// 登录模块
export * from './login'
export * from './menu'

// OAuth 模块
export * from './oauth'

// WebAuthn / Passkey 模块
export * from './webauthn'

// System 模块
export * from './system/user'
export * from './system/role'
export * from './system/menu'
export * from './system/dept'
export * from './system/post'
export * from './system/dict'
export * from './system/config'
export * from './system/notice'
export * from './system/rateLimit'
export * from './system/backup'
export * from './system/task'
export * from './system/msg'
export * from './system/report'
export * from './system/webHook'
export * from './system/scimGroup'
export * from './system/pref'

// monitor 模块
export * from './monitor/cache'
export * from './monitor/job'
export * from './monitor/jobLog'
export * from './monitor/logininfor'
export * from './monitor/operlog'
export * from './monitor/online'
export * from './monitor/frontendError'
export * from './monitor/pat'

// 代码生成模块
export * from './tool/gen'
