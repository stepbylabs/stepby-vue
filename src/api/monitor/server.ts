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
