// src/views/sso/consent.ticket.test.ts
// v5-D9 同意票据（`[sso].consent_ticket = required`）：同意页必须把跳转 query 中的 `ticket`
// 原样回传到 POST /sso/consent —— 服务端据此判定"同意参数未被中间人篡改"。
// 静态源码守卫（风格对齐 views/system/file/index.guard.test.ts）：一旦该字段被删除或
// 提交时不再透传，required 档下所有同意请求都会 400（用户永远无法完成授权），因此回归必须变红。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = fs.readFileSync(path.join(HERE, 'consent.vue'), 'utf8')

describe('SSO 同意页透传同意票据（v5-D9）', () => {
  it('从跳转 query 读取 ticket 并写入表单（未下发时为 undefined = 关闭态零变更）', () => {
    expect(SRC).toMatch(/ticket:\s*q\('ticket'\)\s*\|\|\s*undefined/)
  })

  it('提交体由表单展开而来 ⇒ ticket 随之回传', () => {
    expect(SRC).toMatch(/const payload:\s*SsoConsentForm\s*=\s*\{\s*\.\.\.form\.value,\s*approved\s*\}/)
  })

  it('票据只作为入参回传，不得被拼进任何展示文案（防泄漏到页面/日志）', () => {
    // ticket 在模板区（<template>…</template>）不得出现
    const template = SRC.slice(SRC.indexOf('<template>'), SRC.indexOf('</template>'))
    expect(template).not.toMatch(/ticket/i)
  })
})
