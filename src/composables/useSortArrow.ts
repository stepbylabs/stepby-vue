import { computed, toValue, type Ref } from 'vue'
import { normalizeSortOrder, type SortDirection, type SortQueryTarget } from '@/utils/sortDirection'

export interface SortArrow {
  prop?: string
  order?: SortDirection
}

/**
 * 表头箭头应当显示的方向：**由页面真正下发的排序参数派生**，而不是由页面常量猜。
 *
 * 为什么必须派生（b140，真机取证）：列表页统一是 `<SkeletonTable v-if="loading">` +
 * `<el-table v-else>`，每次取数表格都重新挂载，而 Element Plus 把排序状态存在表格实例里 ——
 * 重挂载即退回 `default-sort`。于是绑一个静态常量当箭头来源会造成两件事：
 * ① 同一列再点时轮转起点被洗回常量 ⇒ 点不出反方向；
 * ② 数据已经按 A 方向排，箭头还显示常量里的 B 方向 ⇒ 界面在说谎。
 * 派生值同时修掉两条，并顺带覆盖 URL 恢复、翻页保留与重置清空这三种来源
 * （`monitor/logininfor` 与 `monitor/operlog` 此前是为 URL 恢复单独回灌一次常量）。
 *
 * `fallback` 取**函数**而不是值：页面的"默认按时间倒序"这类常量会被 `resetQuery` 改写，
 * 传值就把一次性快照当成了事实（与"字段存在不等于字段被消费"同族）。
 */
export function useSortArrow<T extends SortQueryTarget>(
  query: Ref<T> | T,
  fallback?: () => SortArrow | undefined
): Ref<SortArrow> {
  return computed<SortArrow>(() => {
    const current = toValue(query)
    const prop = typeof current.orderByColumn === 'string' ? current.orderByColumn : ''
    const order = normalizeSortOrder(current.isAsc)
    if (prop && order) return { prop, order }
    return fallback?.() ?? {}
  })
}
