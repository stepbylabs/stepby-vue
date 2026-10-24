/**
 * 布局/搜索条件等业务缓存的**兼容外壳**（RuoYi 既有 API：`cache.local` / `cache.session`）。
 *
 * 批八十九 项 8 之前这里是两份**复制粘贴的实现**（sessionCache 与 localCache 各写一遍
 * `if (!localStorage) return` + try/catch + 清理脏数据）。两份实现必然漂移（AGENTS 的
 * 同一条纪律），而漂移的方向是：`sessionStorage` 那一侧漏掉某个守卫。
 * 更根本的问题是那句守卫本身挡不住真实的故障——见 `utils/webStorage.ts` 模块头的三种
 * 失败模式（读属性就抛 / 写入配额满 / 删除无守卫）。
 *
 * 现在本文件只做两件事：
 * 1. 保留既有调用点的契约（`set/get/setJSON/getJSON/remove`，`key`/`value` 为 null 时短路）；
 * 2. 把真正的存储访问**单点**交给 `webStorage`，全仓不再有第二处裸 `localStorage.`。
 */
import { getItem, getJSON, removeItem, setItem, setJSON, type StorageKind } from '@/utils/webStorage'

interface CacheInterface {
  set(key: string, value: string): void
  get(key: string): string | null
  setJSON(key: string, jsonValue: unknown): void
  getJSON(key: string): unknown
  remove(key: string): void
}

function makeCache(kind: StorageKind): CacheInterface {
  return {
    set(key: string, value: string) {
      // 空字符串 key/value 是**合法**写入（既有契约，cache.test.ts 钉着），只跳 null/undefined
      if (key == null || value == null) {
        return
      }
      setItem(key, value, kind)
    },
    get(key: string): string | null {
      if (key == null) {
        return null
      }
      return getItem(key, kind)
    },
    setJSON(key: string, jsonValue: unknown) {
      if (key == null || jsonValue == null) {
        return
      }
      setJSON(key, jsonValue, kind)
    },
    getJSON(key: string): unknown {
      if (key == null) {
        return null
      }
      // 脏数据（JSON.parse 抛）由 webStorage 统一返回 null 并清掉那一行
      return getJSON(key, kind)
    },
    remove(key: string) {
      if (key == null) {
        return
      }
      removeItem(key, kind)
    }
  }
}

export default {
  /**
   * 会话级缓存
   */
  session: makeCache('session'),
  /**
   * 本地缓存
   */
  local: makeCache('local')
}
