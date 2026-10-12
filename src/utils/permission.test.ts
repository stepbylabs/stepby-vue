import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useUserStore，避免加载真实的 store 模块（它依赖 router/api/element-plus 等）
vi.mock('@/store/modules/user', () => ({
  default: vi.fn()
}))

import useUserStore from '@/store/modules/user'
import { checkPermi, checkRole } from '@/utils/permission'

// 辅助：构造 mock store 返回值
function mockStore(permissions: string[] = [], roles: string[] = []) {
  vi.mocked(useUserStore).mockReturnValue({
    permissions,
    roles
  } as unknown as ReturnType<typeof useUserStore>)
}

describe('permission', () => {
  beforeEach(() => {
    vi.mocked(useUserStore).mockReset()
    // 静默 console.warn
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  // ==========================================================================
  // checkPermi 权限校验
  // ==========================================================================
  describe('checkPermi', () => {
    it('空数组返回 false', () => {
      mockStore(['system:user:add'])
      expect(checkPermi([])).toBe(false)
    })

    it('null 返回 false', () => {
      mockStore(['system:user:add'])
      expect(checkPermi(null as unknown as string[])).toBe(false)
    })

    it('undefined 返回 false', () => {
      mockStore(['system:user:add'])
      expect(checkPermi(undefined as unknown as string[])).toBe(false)
    })

    it('非数组（字符串）返回 false', () => {
      mockStore(['system:user:add'])
      expect(checkPermi('system:user:add' as unknown as string[])).toBe(false)
    })

    it('用户拥有所需权限返回 true', () => {
      mockStore(['system:user:add', 'system:user:edit'])
      expect(checkPermi(['system:user:add'])).toBe(true)
    })

    it('用户不拥有所需权限返回 false', () => {
      mockStore(['system:role:add'])
      expect(checkPermi(['system:user:add'])).toBe(false)
    })

    it('用户拥有通配权限 *:*:* 返回 true', () => {
      mockStore(['*:*:*'])
      expect(checkPermi(['system:user:add'])).toBe(true)
    })

    it('多个所需权限中任一匹配即返回 true', () => {
      mockStore(['system:user:edit'])
      expect(checkPermi(['system:user:add', 'system:user:edit'])).toBe(true)
    })

    it('用户权限为空数组返回 false', () => {
      mockStore([])
      expect(checkPermi(['system:user:add'])).toBe(false)
    })

    it('空值时调用 console.warn', () => {
      mockStore(['system:user:add'])
      checkPermi([])
      expect(console.warn).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // checkRole 角色校验
  // ==========================================================================
  describe('checkRole', () => {
    it('空数组返回 false', () => {
      mockStore([], ['admin'])
      expect(checkRole([])).toBe(false)
    })

    it('null 返回 false', () => {
      mockStore([], ['admin'])
      expect(checkRole(null as unknown as string[])).toBe(false)
    })

    it('用户拥有所需角色返回 true', () => {
      mockStore([], ['editor'])
      expect(checkRole(['editor'])).toBe(true)
    })

    it('用户不拥有所需角色返回 false', () => {
      mockStore([], ['editor'])
      expect(checkRole(['admin'])).toBe(false)
    })

    it('用户拥有 admin 超级管理员角色返回 true', () => {
      mockStore([], ['admin'])
      expect(checkRole(['editor'])).toBe(true)
    })

    it('多个所需角色中任一匹配即返回 true', () => {
      mockStore([], ['viewer'])
      expect(checkRole(['editor', 'viewer'])).toBe(true)
    })

    it('用户角色为空数组返回 false', () => {
      mockStore([], [])
      expect(checkRole(['editor'])).toBe(false)
    })

    it('空值时调用 console.warn', () => {
      mockStore([], ['admin'])
      checkRole([])
      expect(console.warn).toHaveBeenCalled()
    })
  })
})
