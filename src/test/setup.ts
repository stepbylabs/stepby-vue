/**
 * Vitest 全局测试环境初始化
 *
 * 修复 jsdom 在某些 Node.js 版本下 localStorage/sessionStorage 不可用的问题
 * （Node.js 传递 --localstorage-file 参数导致 jsdom 初始化异常）
 */

function createStorageMock(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear(): void {
      store.clear()
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys())
      return keys[index] ?? null
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value))
    }
  }
}

// 仅在 localStorage/sessionStorage 不可用或异常时替换（不覆盖正常 jsdom 实现）
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createStorageMock(),
    writable: true,
    configurable: true
  })
}

if (typeof sessionStorage === 'undefined' || typeof sessionStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createStorageMock(),
    writable: true,
    configurable: true
  })
}
