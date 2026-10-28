import { nextTick, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import modal from '@/plugins/modal'
import { download } from '@/utils/request'
import { toPositiveInt } from '@/utils/validate'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute, type RouteLocationNormalizedLoaded, type Router } from 'vue-router'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import type { FormInstance } from 'element-plus'

/**
 * 表单校验失败后定位到第一个错误字段（UX：长表单不必手动找红字）。
 * 滚动到可视区并聚焦其输入框；弹窗内表单同样生效（按文档顺序取首个 is-error）。
 */
export function focusFirstError(): void {
  nextTick(() => {
    const item = document.querySelector<HTMLElement>('.el-form-item.is-error')
    if (!item) return
    item.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const field = item.querySelector<HTMLElement>('input, textarea, select')
    field?.focus()
  })
}

/**
 * 空页回退：删掉末页最后一条后页码越界，列表会显示"暂无数据"而前面还有数据。
 * 返回应当请求的页码（只在"有数据但当前页为空"时回退一页，避免筛选无结果时白跑）。
 */
export function pageAfterEmptyResult(pageNum: number, rowCount: number, total: number): number {
  return rowCount === 0 && total > 0 && pageNum > 1 ? pageNum - 1 : pageNum
}

/**
 * 前端切片分页的页码收敛：本地页码超过"仍存在的页数"时回到最后一页。
 *
 * 全量拉取后在前端 slice 分页的页面（如在线用户）删掉末页最后一条时，
 * 服务端分页的空页回退（pageAfterEmptyResult）看不见这种越界——行数仍非 0，
 * 只是不足以填满当前页；不收敛就会停在空页而前面还有数据。
 */
export function clampPageToRowCount(pageNum: number, rowCount: number, pageSize: number): number {
  const size = pageSize > 0 ? pageSize : 1
  const maxPage = Math.max(1, Math.ceil(rowCount / size))
  return pageNum > maxPage ? maxPage : pageNum
}

/**
 * 通用 CRUD 表格 composable
 * 抽取岗位/角色/字典/通知/参数/定时任务/备份等页面的共性逻辑
 *
 * 调用方自行定义 form / queryParams / rules（页面特有结构），
 * 通过本 composable 注入 API 和状态管理，返回可直接在模板使用的方法。
 *
 * 未保存守卫（UX-5）：handleAdd/handleUpdate 打开时快照表单；cancel 与
 * beforeDialogClose（页面 el-dialog 绑定 :before-close）在脏表单关闭前确认；
 * submitForm 成功后自动刷新基准。
 */
export interface UseCrudTableOptions<T extends object, Q extends object> {
  /** 列表查询 API */
  listApi: (params: Q) => Promise<unknown>
  /** 详情查询 API（可选：只读列表页不传 ⇒ 不暴露 handleUpdate，误调用时报错而非静默） */
  getApi?: (id: number | string) => Promise<unknown>
  /** 新增 API（可选：只读列表页不传 ⇒ 不暴露 handleAdd/handleUpdate/submitForm） */
  addApi?: (data: T) => Promise<unknown>
  /** 修改 API（可选：只读列表页不传 ⇒ 不暴露 handleAdd/handleUpdate/submitForm） */
  updateApi?: (data: T) => Promise<unknown>
  /** 删除 API（可选：只读页无删除能力时不传 ⇒ handleDelete 报错而非静默无动作） */
  deleteApi?: (ids: number | string | Array<number | string>) => Promise<unknown>
  /** 主键字段名（如 'postId'） */
  idField: keyof T
  /** 导出 URL（如 '/system/post/export'） */
  exportUrl?: string
  /** 表单默认值工厂函数 */
  defaultForm: () => T
  /** 标题 i18n key（如 'post.title'） */
  titleKey: string
  /** 删除提示 i18n key（如 'post.tip.confirmDelete'；与 deleteApi 同时省略 = 该页无删除能力） */
  deleteTipKey?: string
  /**
   * 删除确认文案插值参数（可选）：缺省 = 既有契约 `{ ids: targetIds }`；
   * 提供时以返回值作为插值契约，支持 {name}/{count} 等非 ids 插值。
   * 入参统一为「待删除 id 数组」（单行删除时为单元素数组），便于按 count/names 派生。
   */
  deleteTipParams?: (ids: Array<number | string>) => Record<string, unknown>
  /** 查询参数 ref */
  queryParams: Ref<Q>
  /** 表单数据 ref */
  form: Ref<T>
  /** 表单组件 ref（用于 resetFields / validate） */
  formRef: Ref<FormInstance | null>
  /** 查询表单组件 ref（用于 resetFields） */
  queryRef: Ref<FormInstance | null>
  /**
   * 重置前置回调（可选）：resetQuery 最先执行，用于清空 composable 感知不到的
   * 页面级查询状态（如 dateRange 日期区间 ref）。批六十四新增。
   */
  onReset?: () => void
  /** 提交前的载荷改写（可选）：用于携带后端「显式清空」声明 `clearFields`
   * （见 `stepby-axum/src/common/clear_fields.rs`——缺省 = 保持现值，清空必须显式声明） */
  beforeSubmit?: (payload: T) => T
  /** 提交成功后的回调（可选，如刷新缓存） */
  onAfterSubmit?: () => void
  /** 删除成功后的回调（可选） */
  onAfterDelete?: () => void
  /**
   * 查询条件同步到 URL query（UX-6，默认 true）：刷新/分享链接后筛选条件不丢失。
   * 仅同步非空业务字段与分页参数；无路由上下文（单测环境）时自动降级为不同步。
   */
  syncQueryToUrl?: boolean
  /**
   * 是否启用可选排序（默认 false，存量页面行为零变化）。开启后导出
   * handleSortChange（el-table @sort-change 直接绑定），排序参数直接写入
   * queryParams（orderByColumn/isAsc 随请求自然透传后端 sort.rs 列白名单，
   * camel_to_snake 归一）。排序进入 queryParams 后自动获得：
   * URL 同步（syncQueryToUrl，刷新不丢排序）与 resetQuery 联动清排序。
   */
  supportsSort?: boolean
}

/**
 * useCrudTable 返回值公共部分：列表/查询/删除/导出/选中态等，
 * 只读接入页（未注入 getApi/addApi/updateApi）也可完整使用。
 */
export interface UseCrudTableReturn<T extends object> {
  dataList: ShallowRef<T[]>
  open: Ref<boolean>
  loading: Ref<boolean>
  submitLoading: Ref<boolean>
  exportLoading: Ref<boolean>
  beforeDialogClose: (done: () => void) => Promise<void>
  snapshotForm: ReturnType<typeof useUnsavedGuard>['snapshotForm']
  showSearch: Ref<boolean>
  ids: Ref<Array<string | number>>
  single: Ref<boolean>
  multiple: Ref<boolean>
  total: Ref<number>
  title: Ref<string>
  /**
   * 列表请求失败标记（UX：区分「加载失败」与「暂无数据」）：
   * getList 失败置 true、成功置 false；空态组件据此渲染「加载失败 + 重试」而非"暂无数据"。
   * 此前失败被 catch 静默吞成空列表，toast 消失后页面落回空态，两种状态在屏幕上同形。
   */
  loadError: Ref<boolean>
  getList: () => void
  /** 空态「重试」入口：复用 getList（不复制请求逻辑），成功后 loadError 自动清除 */
  retryLoad: () => void
  cancel: () => Promise<void>
  reset: () => void
  handleQuery: () => void
  resetQuery: () => void
  handleSelectionChange: (selection: T[]) => void
  handleSortChange: (p: { prop?: string | null; order?: string | null }) => void
  handleDelete: (row?: T) => void
  handleExport: (filename?: string) => void
}

/** 完整返回值：注入 getApi/addApi/updateApi 后额外暴露新增/修改/提交流程 */
export interface UseCrudTableFormReturn<T extends object> extends UseCrudTableReturn<T> {
  handleAdd: () => void
  handleUpdate: (row?: T) => void
  submitForm: () => void
}

/**
 * 页面定义的「干净查询默认值」快照（按 queryParams.value 对象身份 WeakMap 存储）。
 *
 * 批六十四真实缺陷修复（F137⑤ 全链实证）：AppMain 以 `route.fullPath` 为组件 key（P1 设计），
 * syncUrlQuery 把筛选值写入 URL 后页面**重挂载**，重挂载实例的 EP form-item `initialValue`
 * 即被 restoreQueryFromUrl 的回填值污染 ⇒ `resetFields()` 只会把筛选"重置回搜索值"，
 * 重置按钮在所有 URL 同步页面上是无效操作（35 个 useTemplateRef 页面同模式）。
 * 故快照必须在 URL 恢复**之前**捕获，重置语义 = 回到页面定义默认值，而非"回到挂载时的 URL 筛选"。
 */
const QUERY_DEFAULTS = new WeakMap<object, Record<string, unknown>>()

/**
 * 捕获干净默认值快照（对 params 容器键做独立浅拷贝）。
 *
 * params 容器（RuoYi 惯例的 `params[beginTime]` 日期范围载荷）是 addDateRange 的
 * **就地写入目标**（`search.params['beginTime'] = ...`，utils/stepby.ts）——快照若与
 * queryParams.value 共享该引用，运行期写入会同步污染快照，重置恢复即携带残留日期键。
 * 虽然当前调用图下 addDateRange 每次全量覆盖同键（range 空写 undefined，axios 序列化剔除）
 * 可自愈，但快照隔离是零成本的正确性前提，杜绝未来"只写不清"的新键踩坑。
 */
function snapshotQueryDefaults<Q extends object>(queryParams: Ref<Q>): Record<string, unknown> {
  const src = queryParams.value as unknown as Record<string, unknown>
  const snap: Record<string, unknown> = { ...src }
  if (src.params && typeof src.params === 'object' && !Array.isArray(src.params)) {
    snap.params = { ...(src.params as Record<string, unknown>) }
  }
  return snap
}

/**
 * 将 queryParams 恢复为页面定义的干净默认值（快照缺失时为保守 no-op）。
 * 导出供本地 shadow resetQuery 的页面（RuoYi 式 `dateRange=[]; resetFields(); handleQuery()` 模式）
 * 在 `resetFields()` 之后调用——EP initialValue 已被污染，单靠它无法真正清空筛选。
 */
export function resetQueryDefaults<Q extends object>(queryParams: Ref<Q>): void {
  const target = queryParams.value as unknown as Record<string, unknown>
  const defaults = QUERY_DEFAULTS.get(target)
  if (!defaults) return
  // params 容器总是恢复快照时点态（独立拷贝）：运行期 addDateRange 就地写入的日期键、
  // 以及"运行期才出现的容器"都不得带入重置后的请求（防旧过滤残留）
  target.params = { ...((defaults.params as Record<string, unknown> | undefined) ?? {}) }
  // 清掉快照中不存在、但运行期被动态加入的键
  for (const k of Object.keys(target)) {
    if (!(k in defaults) && k !== 'params') target[k] = undefined
  }
  Object.assign(target, defaults)
}

/**
 * 默认导出文件名前缀：取 URL 的**倒数第二段**（实体名）而非末段。
 * `/system/post/export` → `post`（旧写法取末段得到 `export`，7 个页面导出物同名，
 * 下载目录里全是 `export_<ts>.xlsx`，用户无法分辨哪份是岗位哪份是角色）。
 */
function exportNamePrefix(url: string): string {
  const segs = url.split('/').filter(Boolean)
  if (segs.length === 0) return 'export'
  return segs.length >= 2 ? segs[segs.length - 2] : segs[0]
}

/** 完整表单模式：三个表单 API 齐备时暴露 handleAdd/handleUpdate/submitForm */
export function useCrudTable<T extends object, Q extends object = Record<string, unknown>>(
  options: UseCrudTableOptions<T, Q> & {
    getApi: (id: number | string) => Promise<unknown>
    addApi: (data: T) => Promise<unknown>
    updateApi: (data: T) => Promise<unknown>
  }
): UseCrudTableFormReturn<T>
/** 只读模式：未注入 getApi/addApi/updateApi 时按原样运行时不暴露新增/修改/提交流程 */
export function useCrudTable<T extends object, Q extends object = Record<string, unknown>>(
  options: UseCrudTableOptions<T, Q>
): UseCrudTableReturn<T>
export function useCrudTable<T extends object, Q extends object = Record<string, unknown>>(
  options: UseCrudTableOptions<T, Q>
) {
  const { t } = useI18n()
  const {
    listApi,
    getApi,
    addApi,
    updateApi,
    deleteApi,
    idField,
    exportUrl,
    defaultForm,
    titleKey,
    deleteTipKey,
    queryParams,
    form,
    formRef,
    queryRef,
    beforeSubmit,
    onAfterSubmit,
    onAfterDelete,
    deleteTipParams,
    onReset,
    syncQueryToUrl = true,
    supportsSort = false
  } = options

  // 只读模式判定：getApi/addApi/updateApi 任一缺失即视为只读接入，
  // 新增/修改/提交流程不暴露（返回对象条件展开）且运行时给出可读错误
  const hasFormApis = !!(getApi && addApi && updateApi)

  /**
   * 缺能力统一反馈：四个流程入口都可能被"页面有按钮但没注入对应 API"击中。
   * 静默 return 时用户看到的是"点了没反应"，与按钮失灵同形（不得据此判通过），
   * 所以一律给出可读错误。
   */
  function reportMissingCapability(): void {
    modal.msgError(t('common.crudCapabilityMissing'))
  }

  // 路由上下文（单测/无路由环境下降级为空，不影响 CRUD 主流程）
  const router: Router | null = (() => {
    try {
      return useRouter()
    } catch {
      return null
    }
  })()
  const route: RouteLocationNormalizedLoaded | null = (() => {
    try {
      return useRoute()
    } catch {
      return null
    }
  })()

  // ====== 响应式状态 ======
  const dataList = shallowRef<T[]>([])
  const open = ref(false)
  const loading = ref(true)
  const submitLoading = ref(false)
  const exportLoading = ref(false)
  const showSearch = ref(true)
  const ids = ref<Array<string | number>>([])
  const single = ref(true)
  const multiple = ref(true)
  const total = ref(0)
  const title = ref('')
  // 列表请求失败标记：失败置真 / 成功置假（供空态区分「加载失败」与「暂无数据」）
  const loadError = ref(false)

  // 请求版本计数器：防止并发请求时旧响应覆盖新数据（列表专用；详情请求由 updateBusy 保证单飞）
  let listRequestId = 0

  // 同步可重入闸（b105）：`validate()` 与 `modal.confirm()` 都是**异步**的，
  // 而 `submitLoading` 要到校验通过之后才置位 ⇒ 两者之间的窗口里第二次点击
  // 会各自再走一遍：提交发两次请求（新增两条记录），删除叠两个确认框（确认两次发两次 DELETE）。
  // 闸必须在函数入口**同步**置位（不能用响应式 ref —— DOM 更新要等下一个 tick），
  // 并在「校验失败 / 取消确认 / 请求失败」三条出口都释放。
  let submitBusy = false
  let deleteBusy = false

  // 未保存守卫（UX-5）：编辑弹窗脏表单关闭前确认
  const { snapshotForm, markSaved, confirmLeave } = useUnsavedGuard()

  // UX-5 补强（b73 轮 13 实证缺陷）：页面**自己覆写 handleAdd/handleUpdate** 时极易漏调
  // snapshotForm——快照停留在上一轮表单上，"打开新增、一个字没改、点关闭"就弹"尚未保存"
  // （角色管理/部门管理 真机复现）。守卫的正确基准应由挂载点统一维护，不该靠每个页面记得调用，
  // 因此这里在弹窗打开的下一帧自动补一次快照：
  //   · handleAdd 系（reset → open）：捕到的是重置后的干净表单；
  //   · 打开后再同步改默认值的页面（如部门新增把 parentId 设为父节点）：nextTick 在其后，捕到最终值；
  //   · handleUpdate 系（getApi 回填后才 open）：与显式 snapshotForm 同值，重复调用无害。
  watch(
    open,
    (visible: boolean) => {
      if (visible) nextTick(() => snapshotForm(form.value))
    },
    { flush: 'post' }
  )

  // ====== 方法 ======

  /**
   * 从 URL query 恢复查询条件（UX-6）：仅覆盖「当前查询对象已存在该键」且 URL 显式携带的值，
   * 避免把任意 URL 参数注入查询对象。
   */
  function restoreQueryFromUrl(): void {
    if (!syncQueryToUrl || !route) return
    const q = route.query as Record<string, unknown>
    if (!q || Object.keys(q).length === 0) return
    const target = queryParams.value as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(q)) {
      if (!(k in target) || v === undefined || v === null || v === '') continue
      // 批六十四：对象容器键（params 等）不接受字符串注入，防 `[object Object]` 腐化
      if (typeof target[k] === 'object' && target[k] !== null) continue
      if (k === 'pageNum' || k === 'pageSize') {
        const n = toPositiveInt(v)
        if (n) target[k] = n
        continue
      }
      if (typeof target[k] === 'number') {
        // 数值键只在「String(Number(v)) === v」即**往返无损**时接受注入：IEEE754 会把
        // 100 位数字串折成 1.11e+99，那已不是用户输入的值，注入后既被 syncUrlQuery 回写
        // 污染 URL，又把畸形请求打到后端（b73 轮 16，取证 RUN-RECIPE §3.59）。
        // 页面自己写出的查询值必然往返无损，故正常深链不受该判据影响。
        const n = Number(v)
        if (Number.isFinite(n) && String(n) === String(v).trim()) target[k] = n
        continue
      }
      target[k] = v
    }
  }

  /** 当前查询条件写入 URL（UX-6，replace 不污染历史栈） */
  function syncUrlQuery(): void {
    if (!syncQueryToUrl || !router || !route) return
    const src = queryParams.value as unknown as Record<string, unknown>
    const query: Record<string, string> = {}
    // KB-51：保留 URL 中「非查询条件」的既有参数（如页签 tab 等页面状态），
    // 避免深链回跳后被 queryParams 序列化整体覆盖而丢失；查询键仍以当前值为准。
    const existing = route.query as Record<string, unknown>
    for (const [k, v] of Object.entries(existing)) {
      if (!(k in src) && v !== undefined && v !== null && v !== '') {
        query[k] = String(v)
      }
    }
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined || v === null || v === '') continue
      // 批六十四：仅同步原始类型——嵌套对象（如 RuoYi 惯例的 params 容器）会被
      // String(v) 序列化成 `params=[object Object]` 垃圾参数污染 URL（F137 取证实录）
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue
      query[k] = String(v)
    }
    if (JSON.stringify(query) === JSON.stringify(route.query as Record<string, string>)) return
    router.replace({ query }).catch(() => {})
  }

  /** 查询列表 */
  function getList(): void {
    const currentRequestId = ++listRequestId
    syncUrlQuery()
    loading.value = true
    // 排序参数（supportsSort 开启时）已直接写入 queryParams，随请求自然透传
    listApi(queryParams.value)
      .then((response) => {
        if (currentRequestId !== listRequestId) return // discard stale response
        const resp = response as { rows: T[]; total: number }
        loadError.value = false
        const pageNum = Number((queryParams.value as { pageNum?: number }).pageNum ?? 1)
        const nextPage = pageAfterEmptyResult(pageNum, resp.rows.length, resp.total)
        if (nextPage !== pageNum) {
          ;(queryParams.value as unknown as { pageNum: number }).pageNum = nextPage
          getList()
          return
        }
        dataList.value = resp.rows
        total.value = resp.total
      })
      .catch((e) => {
        // 全局拦截器已弹 ElMessage.error；此处清空列表避免显示陈旧数据，
        // 并置失败标记让空态显示「加载失败 + 重试」（区别于"暂无数据"），
        // 同时在 DEV 模式记录详细错误便于排查。
        if (currentRequestId === listRequestId) {
          loadError.value = true
          dataList.value = []
          total.value = 0
        }
        if (import.meta.env.DEV) console.error('[useCrudTable] getList:', e)
      })
      .finally(() => {
        // 空页回退会立刻发起新请求：旧请求的 finally 不得把新请求的 loading 关掉
        if (currentRequestId === listRequestId) loading.value = false
      })
  }

  /** 空态「重试」入口：复用 getList，请求成功后 loadError 由 then 分支自动清除 */
  function retryLoad(): void {
    getList()
  }

  /** 取消按钮（UX-5：脏表单关闭前确认） */
  async function cancel(): Promise<void> {
    if (await confirmLeave(form.value)) {
      open.value = false
      reset()
    }
  }

  /** 弹窗 × / ESC / 遮罩关闭钩子：页面 el-dialog 绑定 :before-close="beforeDialogClose" */
  async function beforeDialogClose(done: () => void): Promise<void> {
    if (await confirmLeave(form.value)) {
      open.value = false
      reset()
      done()
    }
  }

  /** 表单重置 */
  function reset(): void {
    Object.assign(form.value, defaultForm())
    formRef.value?.resetFields()
  }

  /** 搜索按钮操作 */
  function handleQuery(): void {
    queryParams.value.pageNum = 1
    getList()
  }

  /** 重置按钮操作（supportsSort 开启时连带清空排序，回退后端默认排序） */
  function resetQuery(): void {
    onReset?.()
    if (supportsSort) {
      const target = queryParams.value as unknown as Record<string, unknown>
      target['orderByColumn'] = undefined
      target['isAsc'] = undefined
    }
    queryRef.value?.resetFields()
    // 批六十四：EP initialValue 已被「URL 同步 + fullPath 重挂载」污染（见 QUERY_DEFAULTS），
    // resetFields 只会恢复到挂载时的 URL 筛选值——必须显式恢复干净默认快照
    resetQueryDefaults(queryParams)
    handleQuery()
  }

  /** 多选框选中数据 */
  function handleSelectionChange(selection: T[]): void {
    ids.value = selection.map((item) => item[idField] as string | number)
    single.value = selection.length !== 1
    multiple.value = !selection.length
  }

  /**
   * 排序触发事件（可选能力，需 supportsSort 开启；el-table @sort-change 直接绑定）：
   * ascending → asc，descending → desc，取消排序/非法输入 → 置 undefined（后端回退默认排序）。
   * 排序直接写入 queryParams（与存量手写页语义对齐），自动获得 URL 同步与 reset 联动。
   * 排序变化统一重置回第一页（表格排序行业惯例）。
   */
  function handleSortChange({ prop, order }: { prop?: string | null; order?: string | null }): void {
    if (!supportsSort) return
    const target = queryParams.value as unknown as Record<string, unknown>
    if (prop && (order === 'ascending' || order === 'descending')) {
      target['orderByColumn'] = prop
      target['isAsc'] = order === 'ascending' ? 'asc' : 'desc'
    } else {
      target['orderByColumn'] = undefined
      target['isAsc'] = undefined
    }
    queryParams.value.pageNum = 1
    getList()
  }

  /** 新增按钮操作（只读模式未注入表单 API 时给出可读错误，不静默） */
  function handleAdd(): void {
    if (!hasFormApis) {
      reportMissingCapability()
      return
    }
    reset()
    snapshotForm(form.value)
    open.value = true
    title.value = t('common.add') + t(titleKey)
  }

  /**
   * 修改按钮操作（只读模式未注入 getApi 时给出可读错误，不静默）
   *
   * 两道 b106 收口的护栏：
   * - **在途互斥**：详情 GET 期间重复点击直接忽略（旧实现每点一次就 reset 一次表单并再发一次
   *   GET；行内与工具栏两个入口都可达时最容易触发）；
   * - **缺数据不得开弹窗**：`data` 缺失 / 非对象（记录被并发删除、后端返回 `data: null`）时
   *   原实现把 `form.value` 置成 `undefined` 并打开弹窗，模板一读 `form.xxx` 整页崩——
   *   改为提示"详情加载失败"且不打开。
   */
  let updateBusy = false

  function handleUpdate(row?: T): void {
    if (!getApi) {
      reportMissingCapability()
      return
    }
    if (updateBusy) return
    reset()
    const targetId = row?.[idField] ?? ids.value[0]
    updateBusy = true
    getApi(targetId)
      .then((response) => {
        const resp = response as { data?: T } | null | undefined
        const data = resp?.data
        if (!data || typeof data !== 'object') {
          modal.msgError(t('common.loadDetailFailed'))
          return
        }
        form.value = data
        snapshotForm(form.value)
        open.value = true
        title.value = t('common.edit') + t(titleKey)
      })
      .catch((e) => {
        // 全局拦截器已弹 ElMessage.error；DEV 模式记录详细错误便于排查
        if (import.meta.env.DEV) console.error('[useCrudTable] handleUpdate:', e)
      })
      .finally(() => {
        updateBusy = false
      })
  }

  /** 提交按钮（只读模式未注入新增/修改 API 时给出可读错误，不静默） */
  function submitForm(): void {
    if (!addApi || !updateApi) {
      reportMissingCapability()
      return
    }
    if (submitBusy) return
    const target = formRef.value
    if (!target) return
    submitBusy = true
    target.validate((valid: boolean) => {
      // UX：校验失败时滚动并聚焦第一个错误字段（长表单不必手动找红字）
      if (!valid) {
        submitBusy = false
        focusFirstError()
        return
      }
      submitLoading.value = true
      try {
        const isUpdate = form.value[idField] != null
        const payload = beforeSubmit ? beforeSubmit(form.value) : form.value
        const api = isUpdate ? updateApi(payload) : addApi(payload)
        api
          .then(() => {
            modal.msgSuccess(isUpdate ? t('common.editSuccess') : t('common.addSuccess'))
            markSaved(form.value)
            open.value = false
            getList()
            onAfterSubmit?.()
          })
          .catch((e) => {
            // 全局拦截器已弹 ElMessage.error；保持弹窗打开让用户修改后重试，
            // DEV 模式记录详细错误便于排查
            if (import.meta.env.DEV) console.error('[useCrudTable] submitForm:', e)
          })
          .finally(() => {
            submitLoading.value = false
            submitBusy = false
          })
      } catch (e) {
        // beforeSubmit 等同步段抛错：闸与 loading 必须释放，否则表单永久不可提交
        submitLoading.value = false
        submitBusy = false
        throw e
      }
    })
  }

  /** 删除按钮操作（未注入删除能力时给出可读错误：静默无动作与"按钮失灵"同形） */
  function handleDelete(row?: T): void {
    if (!deleteApi || !deleteTipKey) {
      reportMissingCapability()
      return
    }
    // 同步闸：确认框渲染出来之前连点两下会叠两个确认框，各自确认后发两次 DELETE
    // （第二次对已删除行返回"不存在"——用户看到"删除成功"紧接着一条报错）
    if (deleteBusy) return
    deleteBusy = true
    const targetIds = row?.[idField] ?? ids.value
    // 删除确认文案插值契约：缺省 = 既有 `{ ids: targetIds }`；
    // 提供 deleteTipParams 时由调用方决定插值参数（支持 {name}/{count} 等契约），
    // 入参统一为待删除 id 数组（单行删除为单元素数组）
    const tipValues = deleteTipParams
      ? deleteTipParams(Array.isArray(targetIds) ? targetIds : [targetIds])
      : { ids: targetIds }
    modal
      .confirm(t(deleteTipKey, tipValues))
      .then(() => deleteApi(targetIds))
      .then(() => {
        getList()
        // 清除选中状态：避免删除后按钮 disabled 状态与已删除数据不一致
        ids.value = []
        single.value = true
        multiple.value = true
        modal.msgSuccess(t('common.deleteSuccess'))
        onAfterDelete?.()
      })
      .catch((e: unknown) => {
        // modal.confirm 取消会进入 catch（'cancel' 字符串），API 错误也会进入 catch。
        // 区分两者：cancel 时 e 为字符串 'cancel' / 'close'，API 错误为 Error 对象。
        // 仅 API 错误时在 DEV 模式记录日志（全局拦截器已弹提示）
        if (import.meta.env.DEV && e instanceof Error) {
          console.error('[useCrudTable] handleDelete:', e)
        }
      })
      .finally(() => {
        deleteBusy = false
      })
  }

  /** 导出按钮操作（UX-8：导出前提示"导出中"，完成后给成功反馈） */
  function exportRaw(filename?: unknown): void {
    if (!exportUrl || exportLoading.value) return
    exportLoading.value = true
    // 形参刻意取 unknown：模板里裸写 `@click="handleExport"` 时 Vue 会把 PointerEvent 送进第一个实参，
    // 而 el-button 的 click 载荷在类型上是宽松的，vue-tsc 拦不住。b73 实证：7 个页面
    // （post/role/config/dict/job/alert/webHook）因此把导出文件存成 `[object PointerEvent].txt`。
    // 只接受非空字符串覆写，其余一律走自动命名。
    const name =
      typeof filename === 'string' && filename ? filename : `${exportNamePrefix(exportUrl)}_${Date.now()}.xlsx`
    // 数据量较大时后端流式生成可能耗时数秒，先给"导出中"提示避免用户以为点了没反应
    const startedAt = Date.now()
    const notifyStart = setTimeout(() => {
      if (exportLoading.value) modal.msgInfo(t('common.exporting'))
    }, 300)
    download(exportUrl, { ...queryParams.value }, name)
      .then(() => {
        // 仅在耗时较长（>800ms）时补成功反馈，短耗时直接下载即可，避免提示噪音
        if (Date.now() - startedAt > 800) modal.msgSuccess(t('common.exportSuccess'))
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.error('[useCrudTable] handleExport:', e)
      })
      .finally(() => {
        clearTimeout(notifyStart)
        exportLoading.value = false
      })
  }

  /**
   * 对外只暴露 `(filename?: string) => void` 契约（保持页面调用点的类型不变），
   * 实现按 unknown 收，模板裸绑送进来的事件在 exportRaw 内被拒收。
   */
  const handleExport: UseCrudTableReturn<T>['handleExport'] = exportRaw

  // UX-6：进入页面时先从 URL 恢复筛选条件（此后 getList 会持续回写 URL）。
  // supportsSort 开启时先保证排序键存在（页面可省略手写初始化），
  // 使 URL 恢复的「键存在」校验命中，刷新后排序不丢失。
  if (supportsSort) {
    const target = queryParams.value as unknown as Record<string, unknown>
    if (!('orderByColumn' in target)) target['orderByColumn'] = undefined
    if (!('isAsc' in target)) target['isAsc'] = undefined
  }
  // 批六十四：URL 恢复**前**捕获干净默认值（restoreQueryFromUrl 会把 URL 筛选值回填进
  // queryParams，此后 EP form-item 的 initialValue 即被污染——见 QUERY_DEFAULTS 注释）
  QUERY_DEFAULTS.set(queryParams.value, snapshotQueryDefaults(queryParams))
  restoreQueryFromUrl()

  // 只读模式（未注入 getApi/addApi/updateApi）不暴露新增/修改/提交流程
  return {
    // 状态
    dataList,
    open,
    loading,
    submitLoading,
    exportLoading,
    // 未保存守卫（UX-5）：页面 el-dialog 绑定 :before-close="beforeDialogClose"；
    // snapshotForm 供测试与自定义流程刷新脏检查基准
    beforeDialogClose,
    snapshotForm,
    showSearch,
    ids,
    single,
    multiple,
    total,
    title,
    loadError,
    // 方法
    getList,
    retryLoad,
    cancel,
    reset,
    handleQuery,
    resetQuery,
    handleSelectionChange,
    handleSortChange,
    ...(hasFormApis ? { handleAdd, handleUpdate, submitForm } : {}),
    handleDelete,
    handleExport
  }
}
