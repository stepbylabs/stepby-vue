/**
 * v-desensitize 敏感数据脱敏指令
 * Copyright (c) 2026 Stepby
 *
 * 用途：在前端展示敏感信息时自动脱敏，原始数据仅保留在内存中（不上写 DOM）
 *
 * 用法：
 *   <span v-desensitize="'phone'">{{ user.phoneNumber }}</span>
 *   <span v-desensitize="{ type: 'idCard', keepEdge: 2 }">{{ user.idCard }}</span>
 *   <span v-desensitize="'email'">{{ user.email }}</span>
 *   <span v-desensitize="'name'">{{ user.name }}</span>
 *   <span v-desensitize="'bankCard'">{{ user.bankCard }}</span>
 *
 * 类型：phone / idCard / email / name / bankCard / address / custom
 */

import i18n from '@/i18n'

type DesensitizeType = 'phone' | 'idCard' | 'email' | 'name' | 'bankCard' | 'address' | 'custom'

interface DesensitizeOptions {
  type: DesensitizeType
  keepEdge?: number // 自定义类型保留首尾字符数
  customRegex?: RegExp // 自定义正则
  customReplace?: string // 自定义替换字符
}

const DESSENSITIZE_RULES: Record<DesensitizeType, (text: string, opts?: DesensitizeOptions) => string> = {
  // 手机号：138****8888
  phone: (text) => {
    const s = String(text || '').trim()
    if (s.length < 7) return s.replace(/.(?=.)/g, '*')
    return s.replace(/(\d{3})\d*(\d{4})/, '$1****$2')
  },
  // 身份证：110101********1234
  idCard: (text) => {
    const s = String(text || '').trim()
    if (s.length < 6) return '*'.repeat(s.length)
    return s.substring(0, 6) + '*'.repeat(Math.max(0, s.length - 10)) + s.substring(s.length - 4)
  },
  // 邮箱：a***@example.com
  email: (text) => {
    const s = String(text || '').trim()
    const atIdx = s.indexOf('@')
    if (atIdx < 1) return s
    const name = s.substring(0, atIdx)
    const domain = s.substring(atIdx)
    const masked = name.length <= 1 ? '*' : name[0] + '*'.repeat(Math.max(1, name.length - 1))
    return masked + domain
  },
  // 姓名：张** / 欧阳**
  name: (text) => {
    const s = String(text || '').trim()
    if (s.length <= 1) return s
    if (s.length === 2) return s[0] + '*'
    return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]
  },
  // 银行卡：6222 **** **** 1234
  bankCard: (text) => {
    const s = String(text || '').replace(/\s/g, '')
    if (s.length < 8) return '*'.repeat(s.length)
    return s.substring(0, 4) + ' **** **** ' + s.substring(s.length - 4)
  },
  // 地址：北京市朝阳区建国路***
  address: (text) => {
    const s = String(text || '').trim()
    if (s.length <= 6) return '*'.repeat(s.length)
    return s.substring(0, 6) + '*'.repeat(Math.min(s.length - 6, 10))
  },
  // 自定义
  custom: (text, opts) => {
    const s = String(text || '')
    if (!opts?.customRegex) return s
    const replaceChar = opts.customReplace || '*'
    return s.replace(opts.customRegex, (match) => replaceChar.repeat(match.length))
  }
}

function desensitize(value: unknown, opts: DesensitizeOptions): string {
  const text = value == null ? '' : String(value)
  const rule = DESSENSITIZE_RULES[opts.type] || DESSENSITIZE_RULES.name
  return rule(text, opts)
}

interface DesensitizeHTMLElement extends HTMLElement {
  _rawContent?: string
  _desensitized?: string
}

export default {
  beforeMount(el: HTMLElement, { value }: DirectiveBinding) {
    const opts: DesensitizeOptions = typeof value === 'string' ? { type: value } : value
    const dEl = el as DesensitizeHTMLElement
    // 保存原始内容（仅内存，不写入 DOM 避免泄漏）
    const raw = el.textContent || ''
    dEl._rawContent = raw
    el.textContent = desensitize(raw, opts)
    // 提示：hover 显示脱敏提示文案（i18n）
    el.setAttribute('title', i18n.global.t('desensitize.maskedData'))
  },
  updated(el: HTMLElement, { value }: DirectiveBinding) {
    const opts: DesensitizeOptions = typeof value === 'string' ? { type: value } : value
    const dEl = el as DesensitizeHTMLElement
    const raw = el.textContent || ''
    // 若文本被 Vue 响应式更新为新值（且非已脱敏结果），重新脱敏
    if (raw !== dEl._desensitized) {
      dEl._rawContent = raw
      const masked = desensitize(raw, opts)
      dEl._desensitized = masked
      el.textContent = masked
    }
  }
}

export { desensitize, DESSENSITIZE_RULES }
export type { DesensitizeType, DesensitizeOptions }
