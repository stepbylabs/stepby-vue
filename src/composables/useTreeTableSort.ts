/**
 * 树形表格通用排序/展开 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：抽取 menu/dept 等树形表格的共性逻辑
 *   - isExpandAll / refreshTable：控制展开/折叠 + 强制重渲染
 *   - toggleExpandAll()：切换展开状态
 *   - recordOriginalOrders()：递归记录初始 orderNum，用于变更检测
 *   - handleSaveSort()：递归收集变更项并批量保存
 *
 * 用法：
 *   import { useTreeTableSort } from '@/composables/useTreeTableSort'
 *   const {
 *     isExpandAll, refreshTable, originalOrders,
 *     toggleExpandAll, recordOriginalOrders, handleSaveSort
 *   } = useTreeTableSort<SysMenu>({
 *     listRef,                       // 响应式树列表的 ref
 *     idField: 'menuId',             // 主键字段名
 *     sortApi: updateMenuSort,       // 批量排序保存 API
 *     noSortChangeKey: 'menuModule.tip.noSortChange',
 *     sortSavedKey: 'menuModule.tip.sortSaved',
 *     defaultExpand: false           // 默认是否展开（menu=false, dept=true）
 *   })
 */
import { ref, nextTick, type Ref } from 'vue'
import modal from '@/plugins/modal'
import { useI18n } from 'vue-i18n'

export interface TreeTableItem {
  [key: string]: unknown
  children?: TreeTableItem[]
}

export interface UseTreeTableSortOptions<T extends { children?: T[] }> {
  /** 树形列表数据的 ref */
  listRef: Ref<T[]>
  /** 主键字段名，如 'menuId' / 'deptId' */
  idField: keyof T
  /** orderNum 字段名（默认 'orderNum'） */
  orderField?: keyof T
  /** 批量排序保存 API：接收 { ids: string, orderNums: string } */
  sortApi: (params: { ids: string; orderNums: string }) => Promise<unknown>
  /** "无变更"提示的 i18n key */
  noSortChangeKey: string
  /** "保存成功"提示的 i18n key */
  sortSavedKey: string
  /** 默认是否展开（默认 false） */
  defaultExpand?: boolean
}

export function useTreeTableSort<T extends { children?: T[] }>(options: UseTreeTableSortOptions<T>) {
  const {
    listRef,
    idField,
    orderField = 'orderNum' as keyof T,
    sortApi,
    noSortChangeKey,
    sortSavedKey,
    defaultExpand = false
  } = options

  const { t } = useI18n()

  const isExpandAll = ref<boolean>(defaultExpand)
  const refreshTable = ref<boolean>(true)
  const originalOrders = ref<Record<string, number | string>>({})

  /** 展开/折叠切换：通过销毁+重建表格强制重渲染 */
  function toggleExpandAll(): void {
    refreshTable.value = false
    isExpandAll.value = !isExpandAll.value
    nextTick(() => {
      refreshTable.value = true
    })
  }

  /** 递归记录原始排序值（用于变更检测） */
  function recordOriginalOrders(list: T[]): void {
    list.forEach((item) => {
      const id = item[idField] as unknown as string | number
      const order = item[orderField] as unknown as number | string
      originalOrders.value[String(id)] = order
      if (item.children && item.children.length) {
        recordOriginalOrders(item.children)
      }
    })
  }

  const sortLoading = ref(false)

  /** 保存排序：递归收集变更项，批量调用 sortApi */
  function handleSaveSort(): void {
    const changedIds: (string | number)[] = []
    const changedOrderNums: (string | number)[] = []

    const collectChanged = (list: T[]) => {
      list.forEach((item) => {
        const id = item[idField] as unknown as string | number
        const order = item[orderField] as unknown as number | string
        if (String(originalOrders.value[String(id)]) !== String(order)) {
          changedIds.push(id)
          changedOrderNums.push(order)
        }
        if (item.children && item.children.length) {
          collectChanged(item.children)
        }
      })
    }
    collectChanged(listRef.value)

    if (changedIds.length === 0) {
      modal.msgWarning(t(noSortChangeKey))
      return
    }

    sortLoading.value = true
    sortApi({
      ids: changedIds.join(','),
      orderNums: changedOrderNums.join(',')
    })
      .then(() => {
        modal.msgSuccess(t(sortSavedKey))
        recordOriginalOrders(listRef.value)
      })
      .catch(() => {})
      .finally(() => {
        sortLoading.value = false
      })
  }

  return {
    isExpandAll,
    refreshTable,
    originalOrders,
    sortLoading,
    toggleExpandAll,
    recordOriginalOrders,
    handleSaveSort
  }
}
