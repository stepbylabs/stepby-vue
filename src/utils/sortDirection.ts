/**
 * 表头点击的方向裁定（唯一实现，b140 立）。
 *
 * 缺陷形状（真机取证，台账 `docs/optimization/quality-batch-140-2026-10-30.md`）：
 * 列表页统一是 `<SkeletonTable v-if="loading">` + `<el-table v-else>`，**每次取数表格都重新挂载**
 * （探针实测三连点后 `.el-table` 的 DOM 实例每次都换）。Element Plus 的排序状态存在表格实例里
 * （`states.sort` / 列的 `order`），重挂载即退回 `default-sort`（没绑就退回"无方向"），
 * 于是 `handleSortClick` 的 `toggleOrder()` 每次都从同一个起点轮转 ⇒ **同一个表头点 N 次，
 * 下发给后端的 `isAsc` 一次都不变**（实测三连点全为 `ascending`，`aria-sort` 还停在 `descending`
 * ——箭头与数据同时说谎）。用户由此**点不出反方向**，而排序是这些页面的既有能力。
 *
 * 裁定权因此交回页面：页面自己记着"上一次真正下发了什么"（`queryParams.orderByColumn/isAsc`），
 * 那才是事实。规则（只做必要的事，不改任何既有语义）：
 * 1. `order` 为空（EP 的"取消排序"第三态）或没有 `prop` ⇒ 清空两个参数，后端回退默认排序；
 * 2. 换了列 ⇒ 照 EP 给的方向走（新列没有"上一次"可言）；
 * 3. **同一列且 EP 给的方向与当前参数相同** ⇒ 这正是重挂载把状态洗回去的那一次，取反方向；
 * 4. 其余 ⇒ 照 EP 给的方向走。
 *
 * 两种 `isAsc` 风格都在仓内存在（`ascending|descending` 直传，与 `asc|desc` 映射），
 * 所以归一化两侧都要认——否则"URL 恢复出的当前方向"会被判成"没有方向"，规则 3 失效。
 */

/** 后端参数里方向的写法：`ep` = 直传 Element Plus 的原值，`short` = 三字母风格 */
export type SortStyle = 'ep' | 'short'

export type SortDirection = 'ascending' | 'descending'

/** 裁定后的结局：`null` 表示"取消排序"（两个参数都该置空） */
export interface SortEffect {
  prop: string
  order: SortDirection
}

/** 把任意来源的方向值（EP 原值 / `asc|desc` / URL 里的字符串）归一成 EP 风格；认不出返回 `undefined` */
export function normalizeSortOrder(value: unknown): SortDirection | undefined {
  const text = String(value ?? '')
  if (!text) return undefined
  if (/^asc/i.test(text)) return 'ascending'
  if (/^desc/i.test(text)) return 'descending'
  return undefined
}

const flip = (order: SortDirection): SortDirection => (order === 'ascending' ? 'descending' : 'ascending')

/**
 * 按上面四条规则裁定这一次点击应该下发的方向。
 *
 * `currentProp` / `currentOrder` 取页面**当前**的 `orderByColumn` / `isAsc`（任意风格）。
 */
export function resolveSortChange(
  column: { prop?: string | null; order?: string | null },
  current: { prop?: unknown; order?: unknown }
): SortEffect | null {
  const prop = typeof column.prop === 'string' ? column.prop : ''
  const order = normalizeSortOrder(column.order)
  if (!prop || !order) return null

  const sameColumn = String(current.prop ?? '') === prop
  const currentOrder = normalizeSortOrder(current.order)
  // 规则 3：重挂载洗掉了 EP 的状态，它报回来的方向与页面已在用的相同 ⇒ 用户这一次就是要反过来
  if (sameColumn && currentOrder === order) return { prop, order: flip(order) }
  return { prop, order }
}

/**
 * 把一次表头点击落成查询参数（写进调用方已有的 `target`，不新建对象，保持既有响应式引用）。
 *
 * 返回值是裁定后的方向，调用方绑了 `:default-sort` 的页面应当把它回灌给那个 ref ——
 * 否则重挂载后的箭头会继续显示旧方向，而数据显示的是另一个方向。
 */
export interface SortQueryTarget {
  orderByColumn?: string | null
  isAsc?: string | null
}

export function applySortChange(
  target: SortQueryTarget,
  column: { prop?: string | null; order?: string | null },
  style: SortStyle = 'ep'
): SortEffect | null {
  const effect = resolveSortChange(column, { prop: target.orderByColumn, order: target.isAsc })
  if (!effect) {
    target.orderByColumn = undefined
    target.isAsc = undefined
    return null
  }
  target.orderByColumn = effect.prop
  target.isAsc = style === 'short' ? (effect.order === 'ascending' ? 'asc' : 'desc') : effect.order
  return effect
}
