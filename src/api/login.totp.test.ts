// src/api/login.totp.test.ts
// P0-4（第十八批修复）：TOTP 多因子登录的第二步必须把 `totpCode` 真正发给后端。
//
// 背景（真实缺陷，由 e2e `tests/e2e/http-status-convention.mjs` 抓出）：
// 登录页在收到业务码 1003 后会进入"动态验证码"步骤，但 `api/login.ts` 与
// `store/modules/user.ts` 当时**都没有**透传 `totpCode` ⇒ 第二步请求体与第一步完全一致
// ⇒ 后端再次返回 1003 ⇒ 用户"点了登录没反应、永远进不去"（1003 按设计不弹 Toast）。
//
// 静态源码守卫（风格对齐 `views/system/file/index.guard.test.ts`）：
// 一旦任一环丢掉 `totpCode`，本测试立即变红。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (p: string): string => fs.readFileSync(path.join(HERE, p), 'utf8')

const API_SRC = read('login.ts')
const STORE_SRC = read('../store/modules/user.ts')

describe('TOTP 登录链路透传 totpCode（P0-4）', () => {
  it('api/login.ts 的 login() 接收 totpCode 参数', () => {
    expect(API_SRC).toMatch(/totpCode\?: string/)
  })

  it('api/login.ts 在非空时把 totpCode 放进请求体（空值不发送）', () => {
    expect(API_SRC).toMatch(/if \(totpCode\) data\.totpCode = totpCode/)
  })

  it('store/modules/user.ts 把 totpCode 从 userInfo 透传给 login()', () => {
    expect(STORE_SRC).toMatch(/const \{ password, code, uuid, totpCode \} = userInfo/)
    expect(STORE_SRC).toMatch(/await login\(username, password, code, uuid, totpCode\)/)
  })

  it('登录页的 loginForm 仍以 totpCode 为字段名（与后端 LoginDto.totpCode 对齐）', () => {
    const LOGIN_VUE = read('../views/login.vue')
    expect(LOGIN_VUE).toMatch(/totpCode: ''/)
    expect(LOGIN_VUE).toMatch(/err\?\.code === 1003/)
  })
})
