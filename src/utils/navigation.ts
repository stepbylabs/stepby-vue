// G11：集中管理"SPA 内跳转"，替代 location.href / window.location.reload 的整页刷新，
// 消除多导航/登出链路混用整页刷新与 SPA 的不一致（见审计报告 9.8 / 9.9）。
//
// 说明：本模块导入 router 单例（router/index.ts 默认导出）与 useUserStore，
// 可在非 setup 上下文（如请求拦截器 request.ts）安全调用；
// router/index.ts 仅依赖 @/utils/auth（token 读写），不依赖本模块，无循环依赖。
import router from '@/router'
import useUserStore from '@/store/modules/user'

/** SPA 方式跳转（替代 window.location.href = path 的整页刷新） */
export function navigate(path: string, query?: Record<string, string>): void {
  router.push({ path, query })
}

/** 跳转登录页（SPA，替代 location.href = '/login' 的整页刷新） */
export function goLogin(query?: Record<string, string>): void {
  router.replace({ path: '/login', query })
}

/** 登出并 SPA 跳转登录页（替代 location.href = '/login' 的整页刷新） */
export async function logoutAndGoLogin(query?: Record<string, string>): Promise<void> {
  await useUserStore().logOut()
  router.replace({ path: '/login', query })
}
