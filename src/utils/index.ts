import { parseTime } from './stepby'
import i18n from '@/i18n'
import DOMPurify from 'dompurify'

/**
 * 表格时间格式化
 */
export function formatDate(cellValue: string | number | Date | null | undefined): string {
  if (cellValue == null || cellValue == '') return ''
  let raw = cellValue
  // 后端 UTC 时间戳（ISO 8601 含 T 且无时区标记）→ 追加 Z 按 UTC 解析为本地展示；
  // 空格分隔本地串（如 2024-01-01 12:30:45）及数字/Date 保持原样按本地解释。
  if (typeof raw === 'string' && raw.includes('T') && !raw.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(raw)) {
    raw = raw + 'Z'
  }
  const date = new Date(raw)
  const year = date.getFullYear()
  const month = date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1
  const day = date.getDate() < 10 ? '0' + date.getDate() : date.getDate()
  const hours = date.getHours() < 10 ? '0' + date.getHours() : date.getHours()
  const minutes = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()
  const seconds = date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds()
  return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds
}

/**
 * @param time
 * @param option
 * @returns {string}
 */
export function formatTime(time: number | string, option?: string): string {
  // 统一转换为毫秒数字：
  // - 后端 UTC 时间戳（ISO T 串）按 UTC 解析；
  // - 10 位秒级时间戳 → 毫秒；其余数字直接作为毫秒。
  let ms: number
  if (typeof time === 'string' && time.includes('T')) {
    const s = time.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(time) ? time : time + 'Z'
    ms = new Date(s).getTime()
  } else {
    const num = typeof time === 'string' ? +time : time
    ms = ('' + num).length === 10 ? num * 1000 : num
  }
  const d = new Date(ms)
  const now = Date.now()

  const diff = (now - d.getTime()) / 1000

  if (diff < 30) {
    return i18n.global.t('time.justNow')
  } else if (diff < 3600) {
    // less 1 hour
    return i18n.global.t('time.minutesAgo', { n: Math.ceil(diff / 60) })
  } else if (diff < 3600 * 24) {
    return i18n.global.t('time.hoursAgo', { n: Math.ceil(diff / 3600) })
  } else if (diff < 3600 * 24 * 2) {
    return i18n.global.t('time.dayAgo')
  }
  if (option) {
    return parseTime(time, option) || ''
  } else {
    return i18n.global.t('time.dateTimeFormat', {
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes()
    })
  }
}

/**
 * Check if an element has a class
 * @param elm
 * @param cls
 * @returns {boolean}
 */
export function hasClass(ele: HTMLElement, cls: string): boolean {
  return !!ele.className.match(new RegExp('(\\s|^)' + cls + '(\\s|$)'))
}

/**
 * Add class to element
 * @param ele
 * @param cls
 */
export function addClass(ele: HTMLElement, cls: string): void {
  if (!hasClass(ele, cls)) ele.className += ' ' + cls
}

/**
 * Remove class from element
 * @param ele
 * @param cls
 */
export function removeClass(ele: HTMLElement, cls: string): void {
  if (hasClass(ele, cls)) {
    const reg = new RegExp('(\\s|^)' + cls + '(\\s|$)')
    ele.className = ele.className.replace(reg, ' ')
  }
}

export function makeMap(str: string, expectsLowerCase?: boolean): (val: string) => boolean {
  const map = Object.create(null)
  const list = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return expectsLowerCase ? (val: string) => map[val.toLowerCase()] : (val: string) => map[val]
}

export const beautifierConf = {
  html: {
    indent_size: '2',
    indent_char: ' ',
    max_preserve_newlines: '-1',
    preserve_newlines: false,
    keep_array_indentation: false,
    break_chained_methods: false,
    indent_scripts: 'separate',
    brace_style: 'end-expand',
    space_before_conditional: true,
    unescape_strings: false,
    jslint_happy: false,
    end_with_newline: true,
    wrap_line_length: '110',
    indent_inner_html: true,
    comma_first: false,
    e4x: true,
    indent_empty_lines: true
  },
  js: {
    indent_size: '2',
    indent_char: ' ',
    max_preserve_newlines: '-1',
    preserve_newlines: false,
    keep_array_indentation: false,
    break_chained_methods: false,
    indent_scripts: 'normal',
    brace_style: 'end-expand',
    space_before_conditional: true,
    unescape_strings: false,
    jslint_happy: true,
    end_with_newline: true,
    wrap_line_length: '110',
    indent_inner_html: true,
    comma_first: false,
    e4x: true,
    indent_empty_lines: true
  }
}

// 首字母大小
export function titleCase(str: string): string {
  return str.replace(/( |^)[a-z]/g, (L) => L.toUpperCase())
}

export function isNumberStr(str: string): boolean {
  return /^[+-]?(0|([1-9]\d*))(\.\d+)?$/g.test(str)
}

/**
 * 过滤 HTML，使用 DOMPurify 移除危险标签和属性，阻止 javascript:/data: 等 XSS 攻击
 * 用于 v-html 渲染服务端返回的富文本内容
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'blockquote',
      'pre',
      'code',
      'span',
      'div',
      'hr'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false
  })
}

/**
 * P3-1：统一转义 HTML 特殊字符，避免注入到 innerHTML 时破坏布局或触发 XSS
 * 转义字符：& < > " '
 * 入参接受 unknown，null/undefined 返回空字符串（兼容审计大屏与 changelog 两种调用约定）
 */
export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * P1-4：格式化文件大小（字节 → 人类可读）
 * @param bytes 字节数
 * @returns 形如 "1.5 MB" / "800 KB" 的字符串
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
