import request from '@/utils/request'
import type { SysRegister, LoginInfoResult, UserInfoResult, CaptchaInfoResult, AjaxResult } from '@/types'

// 登录方法
export function login(username: string, password: string, code: string, uuid: string): Promise<LoginInfoResult> {
  const data = {
    username,
    password,
    code,
    uuid
  }
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
