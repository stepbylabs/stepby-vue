/**
 * 前端错误/警告监控中心
 *
 * 解决的问题：
 * - 原先 request.ts 对每一次失败请求都直接 ElMessage/ElNotification 弹一条提示，
 *   当页面并发多个接口同时失败（后端故障 / 权限探测 / 联接断开）时会连续弹出"一大串"提示，严重影响体验。
 * - 全局错误（Vue errorHandler / window error / unhandledrejection / 资源加载失败）此前只写 console，
 *   没有任何可查询、可清空的会话内监控入口。
 *
 * 本模块提供统一出口：
 * 1. report(level, source, message) —— 记录一条问题 + 聚合弹窗：
 *    - 相同 源(level+message) 在去重窗口内自动合并计数，避免重复刷屏
 *    - 同一批次（flush 窗口内）的多条提示聚合为"一条"汇总提示，彻底消除一串弹窗
 *    - 可按严重度分级：error / warning / info
 * 2. record(level, source, message) —— 仅写入监控记录（不弹窗，供已有独立提示的场景复用）
 * 3. subscribe(cb) —— 供导航栏告警角标订阅会话内问题列表
 * 4. clear() —— 清空会话记录
 *
 * 弹窗实现默认使用 ElMessage 并走 i18n 文案，可经 setToastHandler 注入替换（用于单测捕获）。
 */

import { ElMessage } from 'element-plus'
import i18n from '@/i18n'

export type ErrorLevel = 'info' | 'warning' | 'error'
export type ErrorSource = 'api' | 'download' | 'vue' | 'global' | 'unhandledrejection' | 'resource' | 'other'

/** 一条被监控的问题记录（同一源在去重窗口内合并为一条，count 记录重复次数） */
export interface MonitorIssue {
  id: string
  level: ErrorLevel
  source: ErrorSource
  message: string
  time: number
  count: number
}

interface BufferedToast {
  level: ErrorLevel
  source: ErrorSource
  message: string
}

export type ToastHandler = (level: ErrorLevel, source: ErrorSource, count: number, message: string) => void

/** 相同(level+message+source) 合并为一条的窗口 */
const DEDUPE_MS = 2000
/** 界面弹窗聚合窗口：窗口内出现的多条提示合并为一条 */
const FLUSH_MS = 600
/** 会话最多保留的问题数（防止长时间运行内存膨胀） */
const MAX_ISSUES = 200

const levelRank: Record<ErrorLevel, number> = { error: 2, warning: 1, info: 0 }
const levelTypeMap = { error: 'error', warning: 'warning', info: 'info' } as const

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

class ErrorHub {
  private items: MonitorIssue[] = []
  private listeners = new Set<(items: MonitorIssue[]) => void>()
  private buffered: BufferedToast[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private toastHandler: ToastHandler | null = null

  /** 注入自定义弹窗实现（测试时替换以捕获；传 null 恢复默认 ElMessage 实现） */
  setToastHandler(handler: ToastHandler | null): void {
    this.toastHandler = handler
  }

  /** 只读访问当前会话内的问题列表（最新在前） */
  get issues(): MonitorIssue[] {
    return this.items
  }

  /**
   * 订阅问题列表变更。
   * @returns 退订函数
   */
  subscribe(cb: (items: MonitorIssue[]) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /**
   * 仅记录监控，不触发界面弹窗（供已有独立提示的场景复用，如可点击"重试"的网络错误 toast）。
   */
  record(level: ErrorLevel, source: ErrorSource, message: string): MonitorIssue {
    return this.push(level, source, message)
  }

  /**
   * 记录监控并触发聚合弹窗（推荐入口，绝大多数错误/警告走这里）。
   */
  report(level: ErrorLevel, source: ErrorSource, message: string): MonitorIssue {
    const issue = this.push(level, source, message)
    this.buffered.push({ level, source, message })
    this.scheduleFlush()
    return issue
  }

  /** 清空会话记录与待弹窗缓冲 */
  clear(): void {
    this.items = []
    this.buffered = []
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.emit()
  }

  private push(level: ErrorLevel, source: ErrorSource, message: string): MonitorIssue {
    const time = Date.now()
    const top = this.items[0]
    // 与最新一条同 源+级别+文案 且在去重窗口内 → 合并计数（避免列表被同一错误刷屏）
    if (top && top.level === level && top.source === source && top.message === message && time - top.time < DEDUPE_MS) {
      top.count += 1
      top.time = time
      this.emit()
      return top
    }
    const issue: MonitorIssue = {
      id: genId(),
      level,
      source,
      message,
      time,
      count: 1
    }
    this.items.unshift(issue)
    if (this.items.length > MAX_ISSUES) {
      this.items.length = MAX_ISSUES
    }
    this.emit()
    return issue
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS)
  }

  private flush(): void {
    this.flushTimer = null
    // flush 仅在 report() 推入 buffered 后由 scheduleFlush 调度触发；
    // clear() 会先取消定时器，因此此处 buffered 必非空，无需空判断。
    const buffered = this.buffered
    this.buffered = []

    // 去重：同 (level+message) 的合并计数，避免同一文案重复弹出
    const byKey = new Map<string, { level: ErrorLevel; message: string; count: number }>()
    for (const it of buffered) {
      const key = `${it.level}\u0000${it.message}`
      const ex = byKey.get(key)
      if (ex) ex.count += 1
      else byKey.set(key, { level: it.level, message: it.message, count: 1 })
    }
    const entries = [...byKey.values()]

    const t = i18n.global.t
    if (entries.length === 1) {
      const e = entries[0]
      const suffix = e.count > 1 ? t('error.monitor.multi', { count: e.count }) : ''
      this.render(e.level, 'api', e.count, `${e.message}${suffix}`)
      return
    }

    // 多条 → 聚合为一条，按最高严重度展示
    const topLevel = [...entries].sort((a, b) => levelRank[b.level] - levelRank[a.level])[0].level
    const errors = entries.filter((e) => e.level === 'error').reduce((s, e) => s + e.count, 0)
    const warnings = entries.filter((e) => e.level === 'warning').reduce((s, e) => s + e.count, 0)
    const total = entries.reduce((s, e) => s + e.count, 0)
    const message = t('error.monitor.aggregated', { errors, warnings, total })
    this.render(topLevel, 'api', total, message)
  }

  private render(level: ErrorLevel, source: ErrorSource, count: number, message: string): void {
    if (this.toastHandler) {
      this.toastHandler(level, source, count, message)
      return
    }
    ElMessage({
      message,
      type: levelTypeMap[level],
      duration: level === 'error' ? 6000 : 5000
    })
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb(this.items))
  }
}

export const errorHub = new ErrorHub()
