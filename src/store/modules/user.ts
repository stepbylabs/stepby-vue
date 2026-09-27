import router from '@/router'
import cache from '@/plugins/cache'
import { ElMessageBox } from 'element-plus'
import { login, logout, getInfo } from '@/api/login'
import { getToken, setToken, removeToken } from '@/utils/auth'
import { isHttp, isEmpty } from '@/utils/validate'
import { clearAllApiCache } from '@/utils/apiCache'
import useLockStore from '@/store/modules/lock'
import usePermissionStore from '@/store/modules/permission'
import useDictStore from '@/store/modules/dict'
import useTagsViewStore from '@/store/modules/tagsView'
import useNotificationStore from '@/store/modules/notification'
import useNoticeStore from '@/store/modules/notice'
import defAva from '@/assets/images/profile.jpg'
import i18n from '@/i18n'
import { setPwdChrType } from '@/utils/passwordRule'

interface UserState {
  token: string | undefined
  id: string | number
  name: string
  nickName: string
  avatar: string
  roles: string[]
  permissions: string[]
  /** 多租户 Phase 3：当前登录用户所属租户 ID（0 = 平台租户；用于平台/租户分层视图判定） */
  tenantId: number
  /**
   * 业务列表页是否显示「所属租户」归属列
   *
   * 后端按 `[ui].show_tenant_column` 结合操作者租户上下文算好后随 `getInfo` 下发：
   * `auto`（默认）= 仅平台操作者可见 = 历史行为；`always` = 均可见；`never` = 均隐藏。
   * 默认 `false`（fail-safe：未取到用户信息时宁可不显示）。
   */
  showTenantColumn: boolean
  /**
   * 业务列表页是否显示「按租户筛选」入口
   *
   * 后端按 `[ui].tenant_filter` 结合操作者租户上下文算好后随 `getInfo` 下发：
   * `off`（默认）= 不提供入口 = 历史行为；`platform` = 仅平台操作者；`always` = 均可见。
   * 默认 `false`（fail-safe：未取到用户信息时宁可不显示）。
   */
  showTenantFilter: boolean
}

const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: getToken(),
    id: '',
    name: '',
    nickName: '',
    avatar: '',
    roles: [],
    permissions: [],
    tenantId: 0,
    showTenantColumn: false,
    showTenantFilter: false
  }),
  actions: {
    // 登录
    async login(userInfo: { username: string; password: string; code: string; uuid: string }) {
      const username = userInfo.username.trim()
      const { password, code, uuid } = userInfo
      const res = await login(username, password, code, uuid)
      setToken(res.token)
      this.token = res.token
      useLockStore().unlockScreen()
      // P2 修复: 登录成功后立即初始化 WebSocket 通知连接。main.ts 挂载时的 init() 因无 token 早退，
      // 必须在此 token 已写入后再触发，否则不刷新页面则实时通知/铃铛角标不生效。
      useNotificationStore().init()
      // P2 修复: 不再 try/catch 吞错。request.ts 拦截器已统一弹错误提示，
      // 此处让错误向上抛出，使 login.vue 的 .catch() 能正确触发（重置 loading、刷新验证码）
    },
    // 获取用户信息
    async getInfo() {
      const res = await getInfo()
      const user = res.user
      let avatar = user.avatar || ''
      if (!isHttp(avatar)) {
        if (isEmpty(avatar)) {
          // 头像为空 → 使用本地默认头像
          avatar = defAva
        } else {
          // 防御历史脏数据：DB 中 avatar 已带 baseURL 前缀时不再重复拼接（避免 /dev-api/dev-api/...）
          const baseApi = import.meta.env.VITE_APP_BASE_API as string
          if (baseApi && avatar.startsWith(baseApi)) {
            // 已带前缀，保持原值
          } else {
            avatar = baseApi + avatar
          }
        }
      }
      if (res.roles && res.roles.length > 0) {
        // 验证返回的roles是否是一个非空数组
        this.roles = res.roles
        this.permissions = res.permissions
      } else {
        this.roles = ['ROLE_DEFAULT']
      }
      this.id = user.userId || ''
      this.name = user.userName || ''
      this.nickName = user.nickName || ''
      this.avatar = avatar
      // 多租户 Phase 3：租户归属随 getInfo 一次带回（0 = 平台租户）
      this.tenantId = Number(user.tenantId ?? 0)
      // 归属列展示开关：后端已按 [ui].show_tenant_column + 操作者租户算好，
      // 此处只做落库（缺字段视为 false，fail-safe）
      this.showTenantColumn = res.showTenantColumn === true
      // 「按租户筛选」入口开关：同样由后端算好，前端只落库（缺字段视为 false，fail-safe）
      this.showTenantFilter = res.showTenantFilter === true
      cache.session.set('pwdChrtype', res.pwdChrtype || '0')
      // P1 修复: 同步更新 passwordRule 模块级 ref，确保登录后规则实时生效
      setPwdChrType(res.pwdChrtype || '0')
      /* 初始密码提示 */
      if (res.isDefaultModifyPwd) {
        ElMessageBox.confirm(i18n.global.t('user.initialPasswordWarning'), i18n.global.t('user.securityTip'), {
          confirmButtonText: i18n.global.t('common.confirm'),
          cancelButtonText: i18n.global.t('common.cancel'),
          type: 'warning'
        })
          .then(() => {
            router.push({ name: 'Profile', params: { activeTab: 'resetPwd' } })
          })
          .catch(() => {})
      }
      /* 过期密码提示 */
      if (!res.isDefaultModifyPwd && res.isPasswordExpired) {
        ElMessageBox.confirm(i18n.global.t('user.passwordExpiredWarning'), i18n.global.t('user.securityTip'), {
          confirmButtonText: i18n.global.t('common.confirm'),
          cancelButtonText: i18n.global.t('common.cancel'),
          type: 'warning'
        })
          .then(() => {
            router.push({ name: 'Profile', params: { activeTab: 'resetPwd' } })
          })
          .catch(() => {})
      }
      return res
      // P2 修复: 不再 try/catch 吞错。request.ts 拦截器已统一弹错误提示，
      // 此处让错误向上抛出，使 permission.ts 的 catch 能正确触发（跳转登录页）
    },
    // 退出系统
    // 使用 finally 块确保无论登出请求成功失败都清理本地 token 和状态，
    // 避免 logOut 失败导致 token 未清理的死锁问题（P0-61）
    async logOut() {
      try {
        await logout()
      } catch {
        // 忽略登出请求错误，继续清理本地状态
      } finally {
        // P0 修复: 登出时主动断开 WebSocket 连接并清理通知状态
        // 否则 WS 会继续用旧 token 重连（失败循环），且通知列表/未读数会残留到下次登录
        const notifStore = useNotificationStore()
        notifStore.disconnect()
        notifStore.clearAll()
        // P0 修复: 清理通知公告共享状态（顶部列表 + 未读数 + 已读 ID）
        useNoticeStore().clearAll()
        // 清理动态路由，防止权限泄漏（P0-60）
        usePermissionStore().resetRoutes()
        this.token = ''
        this.roles = []
        this.permissions = []
        // 清理用户信息
        this.id = ''
        this.name = ''
        this.nickName = ''
        this.avatar = ''
        // 多租户 Phase 3：清理租户归属，避免切换账号后残留（P0-60 同类权限泄漏问题）
        this.tenantId = 0
        this.showTenantColumn = false
        this.showTenantFilter = false
        // 清理字典缓存
        useDictStore().cleanDict()
        // 清理全局共享数据 API 缓存（部门树 / 菜单树 / 配置参数等）
        // 防止切换账号后看到上一个账号权限范围内的数据
        clearAllApiCache()
        // 清理 tagsView
        useTagsViewStore().delAllViews()
        removeToken()
      }
    }
  }
})

export default useUserStore
