import { ref, shallowRef, type Ref } from 'vue'
import modal from '@/plugins/modal'
import { download } from '@/utils/request'
import { useI18n } from 'vue-i18n'
import type { FormInstance } from 'element-plus'

/**
 * 通用 CRUD 表格 composable
 * 抽取岗位/角色/字典/通知/参数/定时任务/备份等页面的共性逻辑
 *
 * 调用方自行定义 form / queryParams / rules（页面特有结构），
 * 通过本 composable 注入 API 和状态管理，返回可直接在模板使用的方法。
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
  /** 提交成功后的回调（可选，如刷新缓存） */
  onAfterSubmit?: () => void
  /** 删除成功后的回调（可选） */
  onAfterDelete?: () => void
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
    onAfterSubmit,
    onAfterDelete
  } = options

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

  // ====== 方法 ======

  /** 查询列表 */
  function getList(): void {
    const currentRequestId = ++listRequestId
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

  /** 取消按钮 */
  function cancel(): void {
    open.value = false
    reset()
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
      if (!valid) return
      submitLoading.value = true
      const isUpdate = form.value[idField] != null
      const api = isUpdate ? updateApi(form.value) : addApi(form.value)
      api
        .then(() => {
          modal.msgSuccess(isUpdate ? t('common.editSuccess') : t('common.addSuccess'))
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

  /** 导出按钮操作 */
  function handleExport(filename?: string): void {
    if (!exportUrl || exportLoading.value) return
    exportLoading.value = true
    download(
      exportUrl,
      { ...queryParams.value },
      filename || `${exportUrl.split('/').pop()}_${Date.now()}.xlsx`
    ).finally(() => {
      exportLoading.value = false
    })
  }

  return {
    // 状态
    dataList,
    open,
    loading,
    submitLoading,
    exportLoading,
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
