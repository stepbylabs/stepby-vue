import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  type AxiosRequestConfig
} from 'axios'
import { ElMessageBox, ElMessage, ElLoading } from 'element-plus'
import i18n, { getLanguage } from '@/i18n'
import { getToken } from '@/utils/auth'
import errorCode from '@/utils/errorCode'
import { transParams, blobValidate } from '@/utils/stepby'
import cache from '@/plugins/cache'
import { saveAs } from 'file-saver'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'
import { startProgress, doneProgress } from '@/utils/progress'
import { errorHub } from '@/utils/errorHub'

const t = i18n.global.t

// 是否显示重新登录
export const isRelogin = { show: false }

// U19 优化：401 并发请求 Promise 队列
// 当首个 401 触发"重新登录"对话框时，后续并发 401 请求不再立即 reject，
// 而是挂起等待对话框决策，避免并发请求错误处理不一致。
// 对话框确认/取消后，统一 resolve/reject 队列中的所有请求。
let pending401Queue: Array<{ resolve: (v: void) => void; reject: (e: unknown) => void }> = []
let reloginPromise: Promise<void> | null = null

function triggerReloginDialog(): Promise<void> {
  // 若已有进行中的对话框 Promise，直接复用（队列合并）
  if (reloginPromise) return reloginPromise
  isRelogin.show = true
  reloginPromise = ElMessageBox.confirm(t('common.reloginConfirm'), t('common.tip'), {
    confirmButtonText: t('common.relogin'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  })
    .then(() => {
      return useUserStore()
        .logOut()
        .then(() => {
          // P1 修复: logOut 后应跳 /login 而非 /index，避免二次重定向
          goLogin()
        })
        .catch(() => {
          goLogin()
        })
    })
    .catch(() => {
      // 用户取消，保持当前页面
    })
    .finally(() => {
      isRelogin.show = false
      reloginPromise = null
    }) as Promise<void>
  return reloginPromise
}

/** U19 优化：将一个 401 请求加入等待队列，返回挂起 Promise */
function enqueue401Request(): Promise<void> {
  return new Promise((resolve, reject) => {
    const item = { resolve, reject }
    pending401Queue.push(item)
    // P1 修复：队列挂起超时兜底（60s）。若"重新登录"对话框弹出后用户既不确认也不取消
    // （或切换标签页导致对话框未处理），排队的请求将永久 pending，页面 loading 卡死。
    // 超时后自动将本请求移出队列并 reject，释放调用方。
    setTimeout(() => {
      const idx = pending401Queue.indexOf(item)
      if (idx >= 0) {
        pending401Queue.splice(idx, 1)
        reject(new Error(t('common.sessionExpired')))
      }
    }, 60 * 1000)
  })
}

/** U19 优化：清空 401 等待队列，按结果统一 resolve/reject */
function flush401Queue(rejectAll: boolean, error: Error): void {
  const queue = pending401Queue
  pending401Queue = []
  queue.forEach((item) => {
    if (rejectAll) {
      item.reject(error)
    } else {
      item.resolve()
    }
  })
}

// 生成请求唯一 ID，用于前后端日志追踪（P0-66）
function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // ignore
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

// 创建axios实例
const service = axios.create({
  // axios中请求配置有baseURL选项，表示请求URL公共部分
  baseURL: import.meta.env.VITE_APP_BASE_API,
  // 超时（U3 优化：从 10s 提升到 30s，避免复杂查询/文件上传超时失败）
  timeout: 30000
})
// L4: 设置 Content-Type 在 service 实例上，而非全局 axios.defaults，避免污染其他 axios 实例
service.defaults.headers['Content-Type'] = 'application/json;charset=utf-8'

// request拦截器
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // TierA-1: 顶部进度条 - 仅对非 GET 请求显示，避免大量 GET 查询导致进度条频繁闪动
    // 路由切换已通过 permission.ts 的 startProgress 覆盖页面加载场景
    if (config.method && config.method.toLowerCase() !== 'get') {
      startProgress()
    }
    // 是否需要设置 token
    const isToken = (config.headers || {}).isToken === false
    // 是否需要防止数据重复提交
    const isRepeatSubmit = (config.headers || {}).repeatSubmit === false
    // 间隔时间(ms)，小于此时间视为重复提交
    const interval = (config.headers || {}).interval || 1000
    if (getToken() && !isToken) {
      config.headers['Authorization'] = 'Bearer ' + getToken() // 让每个请求携带自定义token 请根据实际情况自行修改
    }
    // 注入 X-Request-Id 用于前后端日志关联（P0-66）
    if (!config.headers['X-Request-Id']) {
      config.headers['X-Request-Id'] = generateRequestId()
    }
    // 注入 Accept-Language 用于后端按用户语言返回消息（T-06）
    // 与 i18n 的 localStorage('language') 保持一致；未设置时回退浏览器默认值
    if (!config.headers['Accept-Language']) {
      config.headers['Accept-Language'] = getLanguage()
    }
    // get请求映射params参数
    if (config.method === 'get' && config.params) {
      let url = config.url + '?' + transParams(config.params as Record<string, unknown>)
      url = url.slice(0, -1)
      config.params = {}
      config.url = url
    }
    if (!isRepeatSubmit && (config.method === 'post' || config.method === 'put')) {
      const requestObj = {
        url: config.url,
        data: typeof config.data === 'object' ? JSON.stringify(config.data) : config.data,
        time: new Date().getTime()
      }
      const requestSize = new TextEncoder().encode(JSON.stringify(requestObj)).length // 请求数据大小
      const limitSize = 5 * 1024 * 1024 // 限制存放数据5M
      if (requestSize >= limitSize) {
        if (import.meta.env.DEV) console.warn(`[${config.url}]: ` + t('common.requestSizeExceeded'))
        return config
      }
      const sessionObj = cache.session.getJSON('sessionObj') as
        { url?: string; data?: unknown; time?: number } | string | null
      if (!sessionObj || typeof sessionObj === 'string') {
        cache.session.setJSON('sessionObj', requestObj)
      } else {
        const s_url = sessionObj.url // 请求地址
        const s_data = sessionObj.data // 请求数据
        const s_time = sessionObj.time ?? 0 // 请求时间
        if (s_data === requestObj.data && requestObj.time - s_time < interval && s_url === requestObj.url) {
          const message = t('common.repeatSubmitWarning')
          if (import.meta.env.DEV) console.warn('[request]: ' + message)
          return Promise.reject(new Error(message))
        } else {
          cache.session.setJSON('sessionObj', requestObj)
        }
      }
    }
    return config
  },
  (error: AxiosError) => {
    console.warn('[request error]', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      code: error.code,
      message: error.message
    })
    // TierA-1: request 拦截器抛错（如重复提交 reject）也要完成进度条
    doneProgress()
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  (res: AxiosResponse) => {
    // TierA-1: 完成进度条（与 request 拦截器配对，仅非 GET 请求会 start）
    doneProgress()
    // 未设置状态码则默认成功状态
    const data = res.data as { code?: number; msg?: string }
    const code = data.code || 200
    // 获取错误信息
    const msg = errorCode[code] || data.msg || errorCode['default']
    // 二进制数据则直接返回
    if (res.request.responseType === 'blob' || res.request.responseType === 'arraybuffer') {
      // P2/N5：导出截断标记侧道传递（拦截器丢弃了 headers，挂到 Blob 上供 download() 消费）
      const truncated = res.headers['x-export-truncated'] === 'true'
      if (truncated) {
        ;(res.data as Blob & { _truncated?: boolean })._truncated = true
      }
      return res.data
    }
    if (code === 401) {
      // U19 优化：首个 401 触发对话框，后续并发 401 进入队列等待统一处理
      if (!isRelogin.show && !reloginPromise) {
        triggerReloginDialog()
          .then(() => {
            // 用户确认重新登录（SPA 不整页跳转：清理队列并 reject 后续请求）
            flush401Queue(true, new Error(t('common.sessionExpired')))
          })
          .catch(() => {
            // 用户取消，统一 reject 队列中的请求
            flush401Queue(true, new Error(t('common.reloginCanceled')))
          })
      }
      if (reloginPromise) {
        // 队列等待：挂起当前请求，等对话框决策后统一 reject
        // H5: 使用 then 第二参数处理 reject，避免冗余的链式 .catch(e => Promise.reject(e))
        return enqueue401Request().then(
          () => Promise.reject(new Error(t('common.reloginCanceled'))),
          (e) => Promise.reject(e)
        )
      }
      // P1 修复: Promise.reject 用 Error 而非字符串，与同文件其他分支一致
      return Promise.reject(new Error(t('common.sessionExpired')))
    } else if (code === 400) {
      // API-005：请求参数错误，使用 warning 提示用户检查输入
      errorHub.report('warning', 'api', msg)
      return Promise.reject(new Error(msg))
    } else if (code === 403) {
      // API-006：权限不足，使用 warning 提示
      errorHub.report('warning', 'api', msg)
      return Promise.reject(new Error(msg))
    } else if (code === 500) {
      errorHub.report('error', 'api', msg)
      return Promise.reject(new Error(msg))
    } else if (code === 503) {
      // API-007：服务不可用（如 Redis 故障 fail-closed），使用 error 提示稍后重试
      errorHub.report('error', 'api', msg)
      return Promise.reject(new Error(msg))
    } else if (code === 601) {
      errorHub.report('warning', 'api', msg)
      return Promise.reject(new Error(msg))
    } else if (code === 1003) {
      // P0-4：TOTP 多因子登录（需要验证码 / 验证码错误 / 尝试过多）
      // 不弹通用错误提示，reject 携带业务码的 Error 供 login.vue 进入/停留在 TOTP 输入步骤
      const err = new Error(msg) as Error & { code?: number }
      err.code = 1003
      return Promise.reject(err)
    } else if (code !== 200) {
      errorHub.report('error', 'api', msg)
      // P1 修复: Promise.reject 用 Error 而非字符串
      return Promise.reject(new Error(msg))
    } else {
      return Promise.resolve(res.data)
    }
  },
  (error: AxiosError) => {
    if (import.meta.env.DEV) console.warn('[response error]', error)
    // TierA-1: 错误响应也要完成进度条，避免进度条卡死
    doneProgress()
    // 处理 HTTP 状态码 401（与响应体 code=401 区分，P0-42）
    const httpStatus = error?.response?.status
    // 提取后端返回的具体错误信息（body.msg）
    const responseError = error as AxiosError<{ msg?: string; code?: number }>
    const backendMsg = responseError?.response?.data?.msg
    // P2-33：同时取出 body.code —— `restful` 档（HTTP 状态码约定）下业务失败会走真实状态码，
    // 此时 body.code 仍是权威业务码，不能被 HTTP 状态吞掉。
    const backendCode = responseError?.response?.data?.code
    if (httpStatus === 401) {
      // 登录页/锁屏页的 401 是认证失败（用户名/密码错误），显示具体错误信息而非"重新登录"对话框
      const path = window.location.pathname
      if (path === '/login') {
        ElMessage({ message: backendMsg || t('common.usernameOrPasswordError'), type: 'error', duration: 5 * 1000 })
        // P0 修复：reject 带 backendMsg 的 Error，而非原始 axios error
        // 否则 lock.vue 的 err.message 会取到 "Request failed with status code 401"
        return Promise.reject(new Error(backendMsg || t('common.usernameOrPasswordError')))
      }
      // 锁屏页 401：区分"密码错误"和"token 过期"
      // token 过期时解锁接口返回 401 但 backendMsg 不是"密码错误"，需引导用户重新登录
      if (path === '/lock') {
        if (!getToken()) {
          // token 已失效，解锁接口无法鉴权，引导重新登录
          ElMessage({ message: t('common.loginExpired'), type: 'warning', duration: 5 * 1000 })
          return Promise.reject(new Error(t('common.loginExpired')))
        }
        ElMessage({ message: backendMsg || t('common.passwordError'), type: 'error', duration: 5 * 1000 })
        return Promise.reject(new Error(backendMsg || t('common.passwordError')))
      }
      // 其他页面的 401 是 token 过期，弹出"重新登录"对话框
      // U19 优化：首个 401 触发对话框，后续并发 401 进入队列等待统一处理
      if (!isRelogin.show && !reloginPromise) {
        triggerReloginDialog()
          .then(() => {
            flush401Queue(true, new Error(t('common.sessionExpired')))
          })
          .catch(() => {
            flush401Queue(true, new Error(t('common.reloginCanceled')))
          })
      }
      if (reloginPromise) {
        // 队列等待：挂起当前请求，等对话框决策后统一 reject
        // H5: 使用 then 第二参数处理 reject，避免冗余的链式 .catch(e => Promise.reject(e))
        return enqueue401Request().then(
          () => Promise.reject(new Error(t('common.reloginCanceled'))),
          (e) => Promise.reject(e)
        )
      }
      // P1 修复: Promise.reject 用 Error 而非字符串
      return Promise.reject(new Error(t('common.sessionExpired')))
    }
    // P2-33：`restful` 档下业务失败走真实 HTTP 状态码 ⇒ 错误拦截器也必须识别 body.code。
    // 尤其是 1003（TOTP 多因子：需验证码 / 验证码错误 / 尝试过多）——login.vue 依赖该业务码
    // 进入/停留在验证码步骤；若被当作普通 400 处理会丢失业务码，造成"后端改契约、前端不认"的断链。
    if (backendCode === 1003) {
      const err = new Error(backendMsg || t('common.systemTip')) as Error & { code?: number }
      err.code = 1003
      return Promise.reject(err)
    }
    // API-005~007：HTTP 层错误码差异化提示
    if (httpStatus === 400) {
      // 显示后端返回的具体错误信息（如"验证码错误"），而非固定的"请求参数错误"
      errorHub.report('warning', 'api', backendMsg || t('common.requestParamError'))
      return Promise.reject(error)
    }
    if (httpStatus === 403) {
      errorHub.report('warning', 'api', backendMsg || t('common.noPermission'))
      return Promise.reject(error)
    }
    if (httpStatus === 404) {
      // 端点不存在 / 能力位关闭（如 WebAuthn 关闭态端点表现"不存在"）：
      // 优先展示后端 msg（后端已做不泄漏存在性的统一文案），缺失时回落通用提示
      errorHub.report('warning', 'api', backendMsg || t('common.requestError', { code: '404' }))
      return Promise.reject(error)
    }
    if (httpStatus === 429) {
      // 登录频率限制（IP/用户失败次数超限），显示具体提示
      errorHub.report('warning', 'api', backendMsg || t('common.tooManyRequests'))
      return Promise.reject(error)
    }
    if (httpStatus === 503) {
      errorHub.report('error', 'api', backendMsg || t('common.serviceUnavailable'))
      return Promise.reject(error)
    }
    let { message } = error
    if (message == 'Network Error') {
      message = t('common.backendConnectionError')
    } else if (message && message.includes('timeout')) {
      message = t('common.requestTimeout')
    } else if (message && message.includes('Request failed with status code')) {
      message = t('common.requestError', { code: message.slice(-3) })
    }
    // U4 优化：网络错误/超时提供重试按钮，避免用户只能刷新页面
    // 仅对 GET 请求提供重试，避免非幂等请求（POST/PUT/DELETE）重复提交导致数据重复
    const method = (error.config?.method || '').toLowerCase()
    const canRetry =
      (message === t('common.backendConnectionError') || message === t('common.requestTimeout')) && method === 'get'
    if (canRetry && error.config) {
      // 可重试的网络错误保留单条交互提示（含重试按钮），其余并入聚合弹窗
      ElMessage({
        message: t('common.retryHint', { message }),
        type: 'error',
        duration: 8000,
        onClick: () => {
          // 重新发起原请求
          service(error.config as AxiosRequestConfig).catch(() => {})
        }
      })
    } else {
      // 统一走聚合弹窗，避免同页面并发失败时弹出"一大串"提示
      errorHub.report('error', 'api', message)
    }
    return Promise.reject(error)
  }
)

// 通用下载方法
export function download(url: string, params: Record<string, unknown>, filename: string, config?: AxiosRequestConfig) {
  // 使用局部 loading 实例，避免并发下载时模块级变量互相覆盖导致 loading 卡死
  const loadingInstance = ElLoading.service({ text: t('common.downloading'), background: 'rgba(0, 0, 0, 0.7)' })
  // responseType:'blob' 时，响应拦截器返回 res.data（Blob），故断言为 Promise<Blob>
  return (
    service.post(url, params, {
      transformRequest: [
        (params: unknown) => {
          return transParams(params as Record<string, unknown>)
        }
      ],
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'blob',
      ...config
    }) as Promise<Blob>
  )
    .then(async (data: Blob) => {
      const isBlob = blobValidate(data)
      if (isBlob) {
        const blob = new Blob([data])
        saveAs(blob, filename)
        // P2/N5：消费导出截断标记（行数触及 EXPORT_MAX_ROWS 上限）
        if ((data as Blob & { _truncated?: boolean })._truncated) {
          ElMessage.warning(t('common.exportTruncated'))
        }
      } else {
        // P1 修复: JSON.parse 失败时不应抛错中断下载流程，与 cache.getJSON 同类问题
        try {
          const resText = await data.text()
          const rspObj = JSON.parse(resText)
          const errMsg = errorCode[rspObj.code] || rspObj.msg || errorCode['default']
          errorHub.report('error', 'download', errMsg)
        } catch (e) {
          console.error('[download] Failed to parse error response:', e)
          errorHub.report('error', 'download', t('common.downloadError'))
        }
      }
      loadingInstance.close()
    })
    .catch((r: unknown) => {
      if (import.meta.env.DEV) console.error('[download]', (r as { message?: string })?.message || r)
      errorHub.report('error', 'download', t('common.downloadError'))
      loadingInstance.close()
    })
}

export default service

// M3: HMR 热更新时清理 401 等待队列，避免模块级 pending401Queue 跨实例残留导致挂起请求泄漏
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    flush401Queue(true, new Error('HMR'))
  })
}
