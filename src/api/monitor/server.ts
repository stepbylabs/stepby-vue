import request from '@/utils/request'
import type { AjaxResult } from '@/types'

// ====== 服务器监控（GET /monitor/server，权限 monitor:health:list）======

export interface ServerCpu {
  /** 核心数 */
  cpuNum: number
  /** 用户使用率 */
  used: number
  /** 系统使用率 */
  sys: number
  /** 空闲率 */
  free: number
}

export interface ServerMem {
  /** 总内存（G） */
  total: number
  /** 已用内存（G） */
  used: number
  /** 空闲内存（G） */
  free: number
  /** 使用率 */
  usage: number
}

export interface ServerJvm {
  /** 总内存（M） */
  total: number
  /** 已用内存（M） */
  used: number
  /** 空闲内存（M） */
  free: number
  /** 使用率 */
  usage: number
  /** 运行时名称 */
  name: string
  /** 运行时版本 */
  version: string
  /** 启动时间 */
  startTime: string
  /** 运行时长 */
  runTime: string
  /** 安装路径 */
  home: string
  /** 运行参数 */
  inputArgs: string
}

export interface ServerSys {
  /** 服务器名称 */
  computerName: string
  /** 操作系统 */
  osName: string
  /** 服务器 IP */
  computerIp: string
  /** 系统架构 */
  osArch: string
  /** 项目路径 */
  userDir: string
}

export interface ServerSysFile {
  /** 盘符路径 */
  dirName: string
  /** 文件系统 */
  sysTypeName: string
  /** 盘符类型 */
  typeName: string
  /** 总大小（G） */
  total: number
  /** 可用大小（G） */
  free: number
  /** 已用大小（G） */
  used: number
  /** 使用率 */
  usage: number
}

export interface ServerInfo {
  cpu: ServerCpu
  mem: ServerMem
  jvm: ServerJvm
  sys: ServerSys
  sysFiles: ServerSysFile[]
}

// 获取服务器信息（CPU/内存/JVM/系统/磁盘）
export function getServer(): Promise<AjaxResult<ServerInfo>> {
  return request({
    url: '/monitor/server',
    method: 'get'
  })
}

// ====== 数据库连接池监控（GET /monitor/db-pool）======

export interface DbPoolInfo {
  /** 数据库类型（如 postgres / mysql） */
  dbKind: string
  /** 连接池总大小 */
  poolSize: number
  /** 空闲连接数 */
  numIdle: number
  /** 忙碌连接数 */
  busy: number
  /** 数据库最大允许连接数 */
  maxConn: number
}

// 获取数据库连接池状态
export function getDbPool(): Promise<AjaxResult<DbPoolInfo>> {
  return request({
    url: '/monitor/db-pool',
    method: 'get'
  })
}

// ====== 管理端指标摘要（GET /monitor/metrics-summary，b138）======

/**
 * 进程级运行时指标（与 `/metrics` 同源，但走管理端鉴权链）。
 *
 * 健康页此前直接 `fetch('/metrics')` 并在前端解析 Prometheus 文本；而 `/metrics`
 * 在配置 `[monitor].metrics_token` 后只认运维令牌（不是用户 JWT）⇒ 浏览器永远 401，
 * 指标区在这些部署上永久空白。本接口把同一组指标以 JSON 返回，鉴权/权限/平台专属守卫
 * 与 `/monitor/server` 完全一致（`monitor:health:list`）。
 */
export interface MetricsSummary {
  /** 数据库后端（sqlite / mysql / postgres） */
  dbBackend: string
  /** 数据库连通性 */
  dbConnected: boolean
  /** 进程运行时长（秒） */
  uptimeSeconds: number
  /** 进程常驻内存（字节） */
  rssBytes: number
  /** 进程虚拟内存（字节） */
  vmsBytes: number
}

export function getMetricsSummary(): Promise<AjaxResult<MetricsSummary>> {
  return request({
    url: '/monitor/metrics-summary',
    method: 'get'
  })
}
