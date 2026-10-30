import { ref, type Ref } from 'vue'
import { createLatestGuard } from '@/composables/latestRequest'
import { SERVER_MAX_PAGE_SIZE } from '@/utils/paging'

export interface OptionPage<T> {
  rows?: T[] | null
  total?: number
}

export interface RemoteOptions<T> {
  options: Ref<T[]>
  loading: Ref<boolean>
  loadError: Ref<boolean>
  /** 服务端声明的总数（取不到时回退为已取行数） */
  total: Ref<number>
  /** 总数大于已取行数：模板必须显示"仅显示前 N 条，请用搜索缩小范围" */
  truncated: Ref<boolean>
  keyword: Ref<string>
  search: (keyword?: string) => Promise<void>
  retry: () => Promise<void>
  reset: () => void
}

/**
 * 远程搜索型下拉的单一实现（b134）。
 *
 * 四条义务一次收齐：① 单次只拉一页且不超过服务端上限（超过会被静默钳制）；
 * ② 截断按 `total` 判、不按请求值判；③ 失败清空候选并置 `loadError`（"没有可选项"
 * 与"取不到"不得同形）；④ 后发先回守卫——旧关键字的结果不得覆盖新关键字的结果。
 */
export function useRemoteOptions<T>(
  fetchPage: (keyword: string, pageNum: number, pageSize: number) => Promise<OptionPage<T>>,
  config: { pageSize?: number } = {}
): RemoteOptions<T> {
  const pageSize = Math.min(Math.max(1, config.pageSize ?? SERVER_MAX_PAGE_SIZE), SERVER_MAX_PAGE_SIZE)
  const options = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const loadError = ref(false)
  const total = ref(0)
  const truncated = ref(false)
  const keyword = ref('')
  const guard = createLatestGuard()

  async function search(next?: string): Promise<void> {
    const kw = (next ?? keyword.value).trim()
    keyword.value = kw
    const ticket = guard.begin()
    loading.value = true
    loadError.value = false
    total.value = 0
    truncated.value = false
    // 旧关键字的候选项不得留在屏幕上冒充本次搜索结果
    options.value = []
    try {
      const res = await fetchPage(kw, 1, pageSize)
      if (!guard.isCurrent(ticket)) return
      const rows = res.rows ?? []
      const declared = res.total
      options.value = rows
      total.value = typeof declared === 'number' && declared >= 0 ? declared : rows.length
      truncated.value = total.value > rows.length
    } catch {
      if (!guard.isCurrent(ticket)) return
      loadError.value = true
    } finally {
      if (guard.isCurrent(ticket)) loading.value = false
    }
  }

  function retry(): Promise<void> {
    return search(keyword.value)
  }

  function reset(): void {
    // 打开/关闭对话框时调用：在飞响应必须立刻失去写权，否则关闭后还会回填候选
    guard.invalidate()
    options.value = []
    loading.value = false
    loadError.value = false
    total.value = 0
    truncated.value = false
    keyword.value = ''
  }

  return { options, loading, loadError, total, truncated, keyword, search, retry, reset }
}
