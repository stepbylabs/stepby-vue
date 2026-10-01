interface CacheInterface {
  set(key: string, value: string): void
  get(key: string): string | null
  setJSON(key: string, jsonValue: unknown): void
  getJSON(key: string): unknown
  remove(key: string): void
}

const sessionCache: CacheInterface = {
  set(key: string, value: string) {
    if (!sessionStorage) {
      return
    }
    if (key != null && value != null) {
      sessionStorage.setItem(key, value)
    }
  },
  get(key: string): string | null {
    if (!sessionStorage) {
      return null
    }
    if (key == null) {
      return null
    }
    return sessionStorage.getItem(key)
  },
  setJSON(key: string, jsonValue: unknown) {
    if (jsonValue != null) {
      this.set(key, JSON.stringify(jsonValue))
    }
  },
  getJSON(key: string): unknown {
    const value = this.get(key)
    if (value != null) {
      // P0 修复: JSON.parse 在 localStorage 脏数据时会抛异常导致模块加载崩溃
      // 解析失败时返回 null 并清理脏数据，避免后续每次访问都抛错
      try {
        return JSON.parse(value)
      } catch (e) {
        // v8 ignore next —— DEV=false 分支仅在生产构建可达，Vitest 恒为 DEV 模式
        if (import.meta.env.DEV) console.warn('[cache] getJSON parse failed, cleared dirty data:', key, e)
        this.remove(key)
        return null
      }
    }
    return null
  },
  remove(key: string) {
    sessionStorage.removeItem(key)
  }
}

const localCache: CacheInterface = {
  set(key: string, value: string) {
    if (!localStorage) {
      return
    }
    if (key != null && value != null) {
      localStorage.setItem(key, value)
    }
  },
  get(key: string): string | null {
    if (!localStorage) {
      return null
    }
    if (key == null) {
      return null
    }
    return localStorage.getItem(key)
  },
  setJSON(key: string, jsonValue: unknown) {
    if (jsonValue != null) {
      this.set(key, JSON.stringify(jsonValue))
    }
  },
  getJSON(key: string): unknown {
    const value = this.get(key)
    if (value != null) {
      // P0 修复: JSON.parse 在 localStorage 脏数据时会抛异常导致模块加载崩溃
      // 解析失败时返回 null 并清理脏数据，避免后续每次访问都抛错
      try {
        return JSON.parse(value)
      } catch (e) {
        // v8 ignore next —— DEV=false 分支仅在生产构建可达，Vitest 恒为 DEV 模式
        if (import.meta.env.DEV) console.warn('[cache] getJSON parse failed, cleared dirty data:', key, e)
        this.remove(key)
        return null
      }
    }
    return null
  },
  remove(key: string) {
    localStorage.removeItem(key)
  }
}

export default {
  /**
   * 会话级缓存
   */
  session: sessionCache,
  /**
   * 本地缓存
   */
  local: localCache
}
