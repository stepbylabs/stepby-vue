import { nextTick, ref, shallowRef, type Ref } from 'vue'
import modal from '@/plugins/modal'
import { download } from '@/utils/request'
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
  /** 详情查询 API */
  getApi: (id: number | string) => Promise<unknown>
  /** 新增 API */
  addApi: (data: T) => Promise<unknown>
  /** 修改 API */
  updateApi: (data: T) => Promise<unknown>
  /** 删除 API */
  deleteApi: (ids: number | string | Array<number | string>) => Promise<unknown>
  /** 主键字段名（如 'postId'） */
  idField: keyof T
  /** 导出 URL（如 '/system/post/export'） */
  exportUrl?: string
  /** 表单默认值工厂函数 */
  defaultForm: () => T
  /** 标题 i18n key（如 'post.title'） */
  titleKey: string
  /** 删除提示 i18n key（如 'post.tip.confirmDelete'） */
  deleteTipKey: string
  /** 查询参数 ref */
  queryParams: Ref<Q>
  /** 表单数据 ref */
  form: Ref<T>
  /** 表单组件 ref（用于 resetFields / validate） */
  formRef: Ref<FormInstance | null>
  /** 查询表单组件 ref（用于 resetFields） */
  queryRef: Ref<FormInstance | null>
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
}

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
    syncQueryToUrl = true
  } = options

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

  // 请求版本计数器：防止并发请求时旧响应覆盖新数据
  let listRequestId = 0
  let updateRequestId = 0

  // 未保存守卫（UX-5）：编辑弹窗脏表单关闭前确认
  const { snapshotForm, markSaved, confirmLeave } = useUnsavedGuard()

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
      if (k === 'pageNum' || k === 'pageSize') {
        const n = Number(v)
        if (!Number.isNaN(n) && n > 0) target[k] = n
        continue
      }
      target[k] = typeof target[k] === 'number' && !Number.isNaN(Number(v)) ? Number(v) : v
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
    listApi(queryParams.value)
      .then((response) => {
        if (currentRequestId !== listRequestId) return // discard stale response
        const resp = response as { rows: T[]; total: number }
        dataList.value = resp.rows
        total.value = resp.total
      })
      .catch((e) => {
        // 全局拦截器已弹 ElMessage.error；此处清空列表避免显示陈旧数据，
        // 并在 DEV 模式记录详细错误便于排查。
        if (currentRequestId === listRequestId) {
          dataList.value = []
          total.value = 0
        }
        if (import.meta.env.DEV) console.error('[useCrudTable] getList:', e)
      })
      .finally(() => {
        loading.value = false
      })
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

  /** 重置按钮操作 */
  function resetQuery(): void {
    queryRef.value?.resetFields()
    handleQuery()
  }

  /** 多选框选中数据 */
  function handleSelectionChange(selection: T[]): void {
    ids.value = selection.map((item) => item[idField] as string | number)
    single.value = selection.length !== 1
    multiple.value = !selection.length
  }

  /** 新增按钮操作 */
  function handleAdd(): void {
    reset()
    snapshotForm(form.value)
    open.value = true
    title.value = t('common.add') + t(titleKey)
  }

  /** 修改按钮操作 */
  function handleUpdate(row?: T): void {
    reset()
    const targetId = row?.[idField] ?? ids.value[0]
    const currentRequestId = ++updateRequestId
    getApi(targetId)
      .then((response) => {
        if (currentRequestId !== updateRequestId) return // discard stale response
        const resp = response as { data?: T }
        form.value = resp.data as T
        snapshotForm(form.value)
        open.value = true
        title.value = t('common.edit') + t(titleKey)
      })
      .catch((e) => {
        // 全局拦截器已弹 ElMessage.error；DEV 模式记录详细错误便于排查
        if (import.meta.env.DEV) console.error('[useCrudTable] handleUpdate:', e)
      })
  }

  /** 提交按钮 */
  function submitForm(): void {
    formRef.value?.validate((valid: boolean) => {
      // UX：校验失败时滚动并聚焦第一个错误字段（长表单不必手动找红字）
      if (!valid) {
        focusFirstError()
        return
      }
      submitLoading.value = true
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
        })
    })
  }

  /** 删除按钮操作 */
  function handleDelete(row?: T): void {
    const targetIds = row?.[idField] ?? ids.value
    modal
      .confirm(t(deleteTipKey, { ids: targetIds }))
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
  }

  /** 导出按钮操作（UX-8：导出前提示"导出中"，完成后给成功反馈） */
  function handleExport(filename?: string): void {
    if (!exportUrl || exportLoading.value) return
    exportLoading.value = true
    const name = filename || `${exportUrl.split('/').pop()}_${Date.now()}.xlsx`
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

  // UX-6：进入页面时先从 URL 恢复筛选条件（此后 getList 会持续回写 URL）
  restoreQueryFromUrl()

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
    // 方法
    getList,
    cancel,
    reset,
    handleQuery,
    resetQuery,
    handleSelectionChange,
    handleAdd,
    handleUpdate,
    submitForm,
    handleDelete,
    handleExport
  }
}
