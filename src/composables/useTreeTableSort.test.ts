import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick, type Ref } from 'vue'
import { flushPromises } from '@vue/test-utils'

const modalMock = vi.hoisted(() => ({
  msgWarning: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn()
}))

// mock modal to avoid pulling element-plus / i18n / errorHub at import time
vi.mock('@/plugins/modal', () => ({ default: modalMock }))
// vue-i18n's useI18n() needs an installed plugin/injection -> stub it
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => `T:${key}` })
}))

import { useTreeTableSort, type TreeTableItem, type UseTreeTableSortOptions } from './useTreeTableSort'

interface Node extends TreeTableItem {
  id: number
  orderNum: number
  children?: Node[]
}

const sortApi = vi.fn()

function makeOptions(list: Node[], extra: Partial<UseTreeTableSortOptions<Node>> = {}): UseTreeTableSortOptions<Node> {
  const listRef: Ref<Node[]> = ref(list)
  return {
    listRef,
    idField: 'id',
    sortApi,
    noSortChangeKey: 'mod.noSort',
    sortSavedKey: 'mod.saved',
    ...extra
  }
}

describe('composables/useTreeTableSort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sortApi.mockResolvedValue({})
  })

  describe('toggleExpandAll', () => {
    it('flips expand state and forces a re-render via nextTick', async () => {
      const { isExpandAll, refreshTable, toggleExpandAll } = useTreeTableSort(makeOptions([]))
      expect(isExpandAll.value).toBe(false) // defaultExpand defaults to false
      expect(refreshTable.value).toBe(true)

      toggleExpandAll()
      expect(refreshTable.value).toBe(false)
      expect(isExpandAll.value).toBe(true)
      await nextTick()
      expect(refreshTable.value).toBe(true)
    })

    it('honours defaultExpand: true', () => {
      const { isExpandAll } = useTreeTableSort(makeOptions([], { defaultExpand: true }))
      expect(isExpandAll.value).toBe(true)
    })
  })

  describe('recordOriginalOrders', () => {
    it('records orders recursively for nested children', () => {
      const tree: Node[] = [
        {
          id: 1,
          orderNum: 10,
          children: [
            { id: 2, orderNum: 20 },
            { id: 3, orderNum: 5, children: [{ id: 4, orderNum: 1 }] }
          ]
        },
        { id: 9, orderNum: 0 }
      ]
      const { originalOrders, recordOriginalOrders } = useTreeTableSort(makeOptions(tree))
      recordOriginalOrders(tree)
      expect(originalOrders.value).toEqual({ '1': 10, '2': 20, '3': 5, '4': 1, '9': 0 })
    })

    it('ignores empty children arrays', () => {
      const { originalOrders, recordOriginalOrders } = useTreeTableSort(makeOptions([]))
      recordOriginalOrders([{ id: 7, orderNum: 3, children: [] }])
      expect(originalOrders.value).toEqual({ '7': 3 })
    })
  })

  describe('handleSaveSort', () => {
    it('warns and does not call the API when nothing changed', () => {
      const tree: Node[] = [{ id: 1, orderNum: 10 }]
      const { handleSaveSort, recordOriginalOrders } = useTreeTableSort(makeOptions(tree))
      recordOriginalOrders(tree)
      handleSaveSort()
      expect(modalMock.msgWarning).toHaveBeenCalledWith('T:mod.noSort')
      expect(sortApi).not.toHaveBeenCalled()
    })

    it('sends only the changed top-level items and updates baseline on success', async () => {
      const tree: Node[] = [
        { id: 1, orderNum: 10 },
        { id: 2, orderNum: 20 }
      ]
      const { handleSaveSort, recordOriginalOrders, originalOrders, sortLoading } = useTreeTableSort(makeOptions(tree))
      recordOriginalOrders(tree)

      tree[1].orderNum = 99 // change only node 2
      handleSaveSort()
      expect(sortLoading.value).toBe(true)
      expect(sortApi).toHaveBeenCalledWith({ ids: '2', orderNums: '99' })

      await flushPromises()
      expect(modalMock.msgSuccess).toHaveBeenCalledWith('T:mod.saved')
      expect(sortLoading.value).toBe(false)
      // baseline refreshed with the new value
      expect(originalOrders.value['2']).toBe(99)
    })

    it('detects changes in nested children and joins comma-separated payloads', async () => {
      const tree: Node[] = [
        {
          id: 1,
          orderNum: 1,
          children: [
            { id: 2, orderNum: 2 },
            { id: 3, orderNum: 3 }
          ]
        }
      ]
      const { handleSaveSort, recordOriginalOrders } = useTreeTableSort(makeOptions(tree))
      recordOriginalOrders(tree)

      tree[0].orderNum = 11
      tree[0].children![1].orderNum = 33
      handleSaveSort()
      expect(sortApi).toHaveBeenCalledWith({ ids: '1,3', orderNums: '11,33' })
      await flushPromises()
      expect(modalMock.msgSuccess).toHaveBeenCalled()
    })

    it('treats numeric/string order that stringify-equal as unchanged', () => {
      const tree: Node[] = [{ id: 1, orderNum: 5 }]
      const { handleSaveSort, recordOriginalOrders } = useTreeTableSort(makeOptions(tree))
      recordOriginalOrders(tree)
      // original stored number 5; compare via String() -> setting to string "5" is not a change
      tree[0].orderNum = '5' as unknown as number
      handleSaveSort()
      expect(sortApi).not.toHaveBeenCalled()
      expect(modalMock.msgWarning).toHaveBeenCalled()
    })

    it('keeps sortLoading false and skips success toast when the API rejects', async () => {
      sortApi.mockRejectedValueOnce(new Error('fail'))
      const tree: Node[] = [{ id: 1, orderNum: 1 }]
      const { handleSaveSort, recordOriginalOrders, sortLoading } = useTreeTableSort(makeOptions(tree))
      recordOriginalOrders(tree)
      tree[0].orderNum = 2
      handleSaveSort()
      expect(sortLoading.value).toBe(true)
      await flushPromises()
      expect(modalMock.msgSuccess).not.toHaveBeenCalled()
      expect(sortLoading.value).toBe(false)
    })

    it('supports a custom orderField', async () => {
      const tree = [{ id: 1, weight: 4 }] as unknown as Node[]
      const { handleSaveSort, recordOriginalOrders } = useTreeTableSort(makeOptions(tree, { orderField: 'weight' }))
      recordOriginalOrders(tree)
      ;(tree[0] as unknown as { weight: number }).weight = 8
      handleSaveSort()
      expect(sortApi).toHaveBeenCalledWith({ ids: '1', orderNums: '8' })
      await flushPromises()
    })
  })
})
