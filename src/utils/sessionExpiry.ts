/**
 * 会话到期的统一结局（b101）。
 *
 * 服务端在 WS 上发 `system{kind:"sessionExpired"}` 并关闭连接时，令牌已经失效；
 * 旧实现只停止自动重连，页面仍显示"已登录"，用户下一次点按钮才会被 401 拦住。
 * 这里把结局收敛成一条实现：提示 + 清会话 + 回登录页（带回跳地址），
 * 与强制下线 / 401 的最终效果一致；`handling` 保证同一轮到期里的重复推送只执行一次。
 *
 * 闸必须有**生产侧的复位点**：登录成功后的路由守卫（permission.ts）会重建会话，
 * 若闸不复位，同一标签页（登录是 SPA 跳转，不刷新页面）的**第二次**到期会被静默吞掉，
 * 页面又回到"看似登录、实际已失效"——正是本模块要消除的那个症状。
 */
import { ElMessage } from 'element-plus'
import i18n from '@/i18n'
import router from '@/router'
import { goLogin } from '@/utils/navigation'
import { isRelogin } from '@/utils/request'
import useUserStore from '@/store/modules/user'

let handling = false

export async function handleSessionExpired(): Promise<void> {
  if (handling) return
  handling = true
  ElMessage.warning(i18n.global.t('common.sessionExpired'))
  // 登出请求本身可能撞上 401：这里先立旗，避免拦截器再弹一次"重新登录？"对话框
  // 盖住上面这条提示（下一次成功登录时 permission.ts 会把它复位）。
  isRelogin.show = true
  const redirect = router.currentRoute.value.fullPath
  try {
    await useUserStore().logOut()
  } catch {
    // logOut 内部已在 finally 清理本地态；这里不让拒绝逸出到事件总线
  } finally {
    goLogin({ redirect, reason: 'session-expired' })
  }
}

/**
 * 复位幂等闸：调用点 = 新一轮认证会话建立（permission.ts 的登录后守卫，
 * 与 `isRelogin.show = false` 同一处）。除登录流程与单测外不得调用。
 */
export function resetSessionExpiry(): void {
  handling = false
}
