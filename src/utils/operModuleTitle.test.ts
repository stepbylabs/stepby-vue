// src/utils/operModuleTitle.test.ts
// T-11 模块标题展示的纯函数单测 + 仪表盘 widget 静态守卫。
// 背景：后端把 oper_log.title 存为 "module.xxx"，前端字典在 operlog.module.xxx，
// 缺翻译时须回退为剥离前缀的短名，绝不能把裸 "module.xxx" 渲染到界面。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { formatModuleTitle } from './operModuleTitle'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// 以真实字典结构近似：仅这些短名有 operlog.module.* 翻译
const DICT: Record<string, string> = {
  user: '用户管理',
  config: '参数设置',
  backup: '备份管理'
}
const PREFIX = 'operlog.module.'
const short = (key: string) => (key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key)
const translate = (key: string) => DICT[short(key)] ?? key
const exists = (key: string) => key.startsWith(PREFIX) && short(key) in DICT

describe('formatModuleTitle（纯函数）', () => {
  it('空/undefined/null → 空串', () => {
    expect(formatModuleTitle(undefined, translate, exists)).toBe('')
    expect(formatModuleTitle('', translate, exists)).toBe('')
    expect(formatModuleTitle(null, translate, exists)).toBe('')
  })
  it('"module.xxx" 命中字典 → 返回翻译', () => {
    expect(formatModuleTitle('module.user', translate, exists)).toBe('用户管理')
    expect(formatModuleTitle('module.config', translate, exists)).toBe('参数设置')
  })
  it('"module.xxx" 缺字典 → 回退剥离前缀短名，绝不露裸键', () => {
    expect(formatModuleTitle('module.other', translate, exists)).toBe('other')
    expect(formatModuleTitle('module.unknown', translate, exists)).not.toContain('module.')
  })
  it('历史中文原文 → 原样透传', () => {
    expect(formatModuleTitle('用户管理', translate, exists)).toBe('用户管理')
    expect(formatModuleTitle('系统备份', translate, exists)).toBe('系统备份')
  })
})

// —— 静态守卫：仪表盘「最近操作日志」widget 必须经 formatModuleTitle 展示 title ——
// 回归根因：widget 曾直接 prop="title" 渲染裸 "module.config"（采集器 #10 i18n 泄漏 1/54）。
describe('RecentOperLogWidget 静态守卫（防裸 module.* 标题回潮）', () => {
  const src = readFileSync(path.join(HERE, '../views/dashboard/widgets/RecentOperLogWidget.vue'), 'utf8')
  it('导入并使用共享 formatModuleTitle', () => {
    expect(src).toMatch(/from '@\/utils\/operModuleTitle'/)
    expect(src).toMatch(/formatModuleTitle\(/)
  })
  it('title 列不再直接 prop="title" 渲染原始值', () => {
    expect(src).not.toMatch(/<el-table-column[^>]*\bprop="title"/)
  })
})
