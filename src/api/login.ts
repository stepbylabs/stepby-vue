import request from '@/utils/request'
import type { SysRegister, LoginInfoResult, UserInfoResult, CaptchaInfoResult, AjaxResult } from '@/types'

// 登录方法
//
// ⚠️ P0-4 修复（第十八批，e2e `http-status-convention.mjs` 抓出）：`totpCode` 必须随请求发出。
// 已启用 TOTP 的用户第一步只传密码 ⇒ 后端返回业务码 1003（HTTP 200/400 取决于
// `[server].http_status_convention`）⇒ 登录页进入"动态验证码"步骤；若第二步仍旧不传
// `totpCode`，后端会**再次**返回 1003 —— 而 1003 按设计**不弹 Toast**（它表示"继续输入"而非错误），
// 因此用户表现为"点了登录没反应、永远进不去"。此前该参数被前端整条链路漏掉，链路是断的。
export function login(
  username: string,
  password: string,
  code: string,
  uuid: string,
  totpCode?: string
): Promise<LoginInfoResult> {
  const data: {
    username: string
    password: string
    code: string
    uuid: string
    totpCode?: string
  } = {
    username,
    password,
    code,
    uuid
  }
  // 空值不发送（保证"未进入 TOTP 步骤"时的请求体与改造前逐字节一致）
  if (totpCode) data.totpCode = totpCode
  return request({
    url: '/login',
    headers: {
      isToken: false,
      repeatSubmit: false
    },
    method: 'post',
    data: data
  })
}

// 注册方法
export function register(data: SysRegister): Promise<AjaxResult> {
  return request({
    url: '/register',
    headers: {
      isToken: false
    },
    method: 'post',
    data: data
  })
}

// 获取用户详细信息
export function getInfo(): Promise<UserInfoResult> {
  return request({
    url: '/getInfo',
    method: 'get'
  })
}

// 解锁屏幕
export function unlockScreen(password: string) {
  return request({
    url: '/unlockscreen',
    method: 'post',
    data: { password }
  })
}

// 退出方法
export function logout() {
  return request({
    url: '/logout',
    method: 'post'
  })
}

// 获取验证码
//
// 响应同时下发 `registerEnabled`（注册是否开放）：这是注册开关的唯一来路。
// 早期另有一个"探测 /register 是否 403"的壳函数，关闭态必然在控制台留一条 403，
// 且与这个字段构成同一件事的两份实现（㉘），现已删除——新增消费点一律读字段，不要再走探测。
export function getCodeImg(): Promise<CaptchaInfoResult> {
  return request({
    url: '/captchaImage',
    headers: {
      isToken: false
    },
    method: 'get',
    timeout: 20000
  })
}
