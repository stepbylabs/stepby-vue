import { SHA256 } from 'crypto-js'
import { getToken } from '@/utils/auth'

const LOCK_KEY = 'screen-lock'
const LOCK_PATH_KEY = 'screen-lock-path'

interface LockState {
  isLock: boolean
  lockPath: string
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
function readSigned(key: string): string | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SignedPayload
    if (typeof parsed.value !== 'string' || typeof parsed.signature !== 'string') {
      // 非签名格式（旧版明文或被篡改），清除脏数据
      localStorage.removeItem(key)
      return null
    }
    const expected = computeSignature(parsed.value)
    if (expected !== parsed.signature) {
      // 签名不匹配，视为未锁屏，清除脏数据
      localStorage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    // JSON 解析失败（旧版明文或脏数据），清除并返回 null
    localStorage.removeItem(key)
    return null
  }
}

function writeSigned(key: string, value: string): void {
  const signature = computeSignature(value)
  const payload: SignedPayload = { value, signature }
  localStorage.setItem(key, JSON.stringify(payload))
}

export const useLockStore = defineStore('lock', {
  state: (): LockState => {
    const lockValue = readSigned(LOCK_KEY)
    const pathValue = readSigned(LOCK_PATH_KEY)
    return {
      isLock: lockValue === 'true',
      lockPath: pathValue || '/index'
    }
  },
  actions: {
    // 锁定屏幕，同时记录当前路径
    lockScreen(currentPath: string) {
      this.lockPath = currentPath || '/index'
      writeSigned(LOCK_PATH_KEY, this.lockPath)
      this.isLock = true
      writeSigned(LOCK_KEY, 'true')
    },
    // 解锁屏幕，清除路径
    unlockScreen() {
      this.isLock = false
      localStorage.removeItem(LOCK_KEY)
      this.lockPath = '/index'
      localStorage.removeItem(LOCK_PATH_KEY)
    }
  }
})

export default useLockStore
