import { SHA256 } from 'crypto-js'
import { getToken } from '@/utils/auth'
import { getItem, removeItem, setItem, storageAvailable } from '@/utils/webStorage'

const LOCK_KEY = 'screen-lock'
const LOCK_PATH_KEY = 'screen-lock-path'

interface LockState {
  isLock: boolean
  lockPath: string
  /**
   * 锁屏状态**是否真的被持久化**。`false` 时只覆盖当前页面，刷新即解屏
   * （存储不可用/配额满）——锁屏页必须把这一半说出来，不能只显示"已锁定"。
   */
  storageOk: boolean
}

interface SignedPayload {
  value: string
  signature: string
}

// 基于用户 token 的 SHA256 签名：防止用户在浏览器控制台篡改 localStorage 绕过锁屏
// signature = SHA256(screen-lock-value + user-token)
function computeSignature(value: string): string {
  const token = getToken() || ''
  return SHA256(value + token).toString()
}

// 读取并验证签名；签名不一致或解析失败时清除脏数据并返回 null（视为未锁屏）
//
// 存储一律走 `@/utils/webStorage`（b89 项 8）：本文件原先**七处**裸调
// `localStorage.getItem/setItem/removeItem`、一处 try/catch 都没有。配额满或
// 隐私模式下，`setItem` 抛穿的直接后果是"锁屏点了没反应"（写不进 = 状态还在，
// 但路径/签名那次交互当场崩在 store action 里），而 `getItem` 抛穿会让
// **store 初始化**崩掉 = 整个应用白屏。
function readSigned(key: string): string | null {
  const raw = getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SignedPayload
    if (typeof parsed.value !== 'string' || typeof parsed.signature !== 'string') {
      // 非签名格式（旧版明文或被篡改），清除脏数据
      removeItem(key)
      return null
    }
    const expected = computeSignature(parsed.value)
    if (expected !== parsed.signature) {
      // 签名不匹配，视为未锁屏，清除脏数据
      removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    // JSON 解析失败（旧版明文或脏数据），清除并返回 null
    removeItem(key)
    return null
  }
}

function writeSigned(key: string, value: string): boolean {
  const signature = computeSignature(value)
  const payload: SignedPayload = { value, signature }
  return setItem(key, JSON.stringify(payload))
}

export const useLockStore = defineStore('lock', {
  state: (): LockState => {
    const lockValue = readSigned(LOCK_KEY)
    const pathValue = readSigned(LOCK_PATH_KEY)
    return {
      isLock: lockValue === 'true',
      lockPath: pathValue || '/index',
      // 存储可用性（`webStorage` 探测；不可用时锁屏只在当前页面内存里生效）
      storageOk: storageAvailable('local')
    }
  },
  actions: {
    /**
     * 锁定屏幕，同时记录当前路径。
     *
     * 返回值 = "**这次锁屏能不能被记住**"。存储写不进时（配额满 / 隐私模式）屏幕照样锁上
     * （内存态挡住当前视图，这是对旁观者的第一道防线），但**刷新页面即失效**——
     * 所以调用方必须把这一半诚实说给用户，不得让"锁屏成功"的提示掩盖它。
     */
    lockScreen(currentPath: string): boolean {
      this.lockPath = currentPath || '/index'
      const pathOk = writeSigned(LOCK_PATH_KEY, this.lockPath)
      this.isLock = true
      const lockOk = writeSigned(LOCK_KEY, 'true')
      this.storageOk = pathOk && lockOk
      return this.storageOk
    },
    // 解锁屏幕，清除路径
    unlockScreen() {
      this.isLock = false
      removeItem(LOCK_KEY)
      this.lockPath = '/index'
      removeItem(LOCK_PATH_KEY)
    }
  }
})

export default useLockStore
