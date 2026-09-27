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

// 探测注册功能是否开启（已废弃，保留向后兼容）
//
// 历史背景：早期后端 /captchaImage 不返回 registerUser 字段，前端通过探测 /register 接口判断。
// 现状：后端 /captchaImage 已新增 registerEnabled 字段（P0 优化），前端应直接使用该字段，
// 避免探测 /register 触发 403 控制台错误。
//
// 兼容说明：保留此函数仅为兼容旧调用方，新代码应使用 CaptchaInfoResult.registerEnabled 字段。
export function checkRegisterEnabled(): Promise<boolean> {
  // 优先使用 captcha 接口返回的 registerEnabled 字段
  return getCodeImg()
    .then((res) => res.registerEnabled === true)
    .catch(() => false)
}
