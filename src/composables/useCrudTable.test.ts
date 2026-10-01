import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

// ---------------------------------------------------------------------------
// 重依赖 mock：避免真实加载 element-plus / i18n / request（fork worker 超时）
// ---------------------------------------------------------------------------
const { download, modal, t } = vi.hoisted(() => ({
  download: vi.fn<(u: string, p: Record<string, unknown>, f: string) => Promise<unknown>>(),
  modal: {
    msgSuccess: vi.fn(),
    msgError: vi.fn(),
    confirm: vi.fn<(m: string) => Promise<unknown>>()
  },
  // i18n 直接回显 key，便于断言标题/提示拼装
  t: vi.fn((key: string) => key)
}))
vi.mock('@/utils/request', () => ({ download }))
vi.mock('@/plugins/modal', () => ({ default: modal }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t }) }))
// UX-5 未保存守卫：useUnsavedGuard 依赖 element-plus 的 ElMessageBox
// （该文件整体禁真实加载 element-plus，confirm 行为由用例内 spy 控制）
const { elMessageBoxConfirm } = vi.hoisted(() => ({ elMessageBoxConfirm: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: elMessageBoxConfirm } }))

import { useCrudTable } from './useCrudTable'

// 冲刷宏任务（连带 flush 所有挂起的微任务链）
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function deferred<T = unknown>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface Row {
  postId?: number | string
  postName?: string
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  const form = ref<Row>({ postId: undefined, postName: '' })
  const queryParams = ref<{ pageNum: number; name?: string }>({ pageNum: 2, name: 'a' })
  const formRef = ref<{ validate: ReturnType<typeof vi.fn>; resetFields: ReturnType<typeof vi.fn> } | null>(null)
  const queryRef = ref<{ resetFields: ReturnType<typeof vi.fn> } | null>(null)

  formRef.value = {
    // 默认校验通过；单个测试可覆盖为 cb(false) 验证无效分支
    validate: vi.fn((cb: (valid: boolean) => void) => cb(true)),
    resetFields: vi.fn()
  }
  queryRef.value = { resetFields: vi.fn() }

  const listApi = vi.fn(async (): Promise<{ rows: Row[]; total: number }> => ({ rows: [], total: 0 }))
  const getApi = vi.fn(async (id: number | string): Promise<{ data: Row }> => ({
    data: { postId: id, postName: 'fetched' }
  }))
  const addApi = vi.fn(async () => ({}))
  const updateApi = vi.fn(async () => ({}))
  const deleteApi = vi.fn(async () => ({}))
  const onAfterSubmit = vi.fn()
  const onAfterDelete = vi.fn()
  const defaultForm = vi.fn<() => Row>(() => ({ postId: undefined, postName: '' }))

  const options = {
    listApi,
    getApi,
    addApi,
    updateApi,
    deleteApi,
    idField: 'postId',
    exportUrl: '/system/post/export',
    defaultForm,
    titleKey: 'post.title',
    deleteTipKey: 'post.confirmDelete',
    queryParams,
    form,
    formRef,
    queryRef,
    onAfterSubmit,
    onAfterDelete,
    ...overrides
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = useCrudTable<any, any>(options as any)
  return {
    ctx,
    form,
    queryParams,
    formRef,
    queryRef,
    listApi,
    getApi,
    addApi,
    updateApi,
    deleteApi,
    onAfterSubmit,
    onAfterDelete,
    defaultForm
  }
}

let consoleError: ReturnType<typeof vi.spyOn>

describe('composables/useCrudTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleError.mockRestore()
  })

  // ===== getList =====
  describe('getList', () => {
    it('成功写入 rows/total 并复位 loading', async () => {
      const { ctx, listApi, queryParams } = makeCtx()
      listApi.mockResolvedValueOnce({ rows: [{ postId: 1, postName: 'x' }], total: 42 })
      expect(ctx.loading.value).toBe(true) // 初始值
      ctx.getList()
      expect(ctx.loading.value).toBe(true) // 请求进行中
      await flush()
      expect(listApi).toHaveBeenCalledWith(queryParams.value)
      expect(ctx.dataList.value).toEqual([{ postId: 1, postName: 'x' }])
      expect(ctx.total.value).toBe(42)
      expect(ctx.loading.value).toBe(false)
    })

    it('失败时清空列表与总数并复位 loading', async () => {
      const { ctx, listApi } = makeCtx()
      listApi.mockResolvedValueOnce({ rows: [{ postId: 1 }], total: 1 })
      ctx.getList()
      await flush()
      expect(ctx.dataList.value).toHaveLength(1)

      listApi.mockRejectedValueOnce(new Error('boom'))
      ctx.getList()
      await flush()
      expect(ctx.dataList.value).toEqual([])
      expect(ctx.total.value).toBe(0)
      expect(ctx.loading.value).toBe(false)
    })

    it('并发请求丢弃旧响应（版本号守卫）', async () => {
      const { ctx, listApi } = makeCtx()
      const d1 = deferred<{ rows: Row[]; total: number }>()
      const d2 = deferred<{ rows: Row[]; total: number }>()
      listApi.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

      ctx.getList() // requestId=1
      ctx.getList() // requestId=2（最新）
      d2.resolve({ rows: [{ postId: 2, postName: 'new' }], total: 1 })
      await flush()
      expect(ctx.dataList.value).toEqual([{ postId: 2, postName: 'new' }])

      d1.resolve({ rows: [{ postId: 1, postName: 'old' }], total: 1 })
      await flush()
      // 旧响应被丢弃，数据保持最新
      expect(ctx.dataList.value).toEqual([{ postId: 2, postName: 'new' }])
    })
  })

  // ===== cancel / reset =====
  describe('cancel', () => {
    it('干净表单直接关闭并重置（快照比对非脏，不弹确认）', async () => {
      const { ctx, form, formRef, defaultForm } = makeCtx()
      ctx.handleAdd() // 打开时快照默认表单（未修改 ⇒ 非脏）
      ctx.open.value = true
      await ctx.cancel()
      expect(elMessageBoxConfirm).not.toHaveBeenCalled()
      expect(ctx.open.value).toBe(false)
      expect(form.value).toEqual({ postId: undefined, postName: '' })
      expect(formRef.value!.resetFields).toHaveBeenCalled()
      expect(defaultForm).toHaveBeenCalled()
    })

    it('脏表单取消 → 用户确认放弃后关闭（UX-5）', async () => {
      const { ctx, form } = makeCtx()
      ctx.handleAdd() // 打开时快照默认表单
      ctx.open.value = true
      form.value.postName = 'dirty' // 用户修改（与快照不一致）
      elMessageBoxConfirm.mockResolvedValueOnce('confirm')
      await ctx.cancel()
      expect(elMessageBoxConfirm).toHaveBeenCalled()
      expect(ctx.open.value).toBe(false)
    })

    it('脏表单取消 → 用户取消确认后保持打开（UX-5）', async () => {
      const { ctx, form } = makeCtx()
      ctx.handleAdd()
      ctx.open.value = true
      form.value.postName = 'dirty'
      elMessageBoxConfirm.mockRejectedValueOnce('cancel')
      await ctx.cancel()
      expect(ctx.open.value).toBe(true)
    })
  })

  describe('reset', () => {
    it('表单回填默认值并调用 resetFields', () => {
      const { ctx, form, formRef } = makeCtx()
      form.value.postId = 99
      ctx.reset()
      expect(form.value).toEqual({ postId: undefined, postName: '' })
      expect(formRef.value!.resetFields).toHaveBeenCalled()
    })

    it('formRef 为 null 时不抛错（可选链分支）', () => {
      const { ctx, formRef } = makeCtx()
      formRef.value = null
      expect(() => ctx.reset()).not.toThrow()
    })
  })

  // ===== 查询 =====
  describe('handleQuery', () => {
    it('重置 pageNum=1 并触发列表查询', () => {
      const { ctx, queryParams, listApi } = makeCtx()
      expect(queryParams.value.pageNum).toBe(2)
      ctx.handleQuery()
      expect(queryParams.value.pageNum).toBe(1)
      expect(listApi).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetQuery', () => {
    it('重置查询表单后触发查询', () => {
      const { ctx, queryRef, listApi } = makeCtx()
      ctx.resetQuery()
      expect(queryRef.value!.resetFields).toHaveBeenCalled()
      expect(listApi).toHaveBeenCalledTimes(1)
    })
  })

  // ===== 多选 =====
  describe('handleSelectionChange', () => {
    it('多项：single=true, multiple=false', () => {
      const { ctx } = makeCtx()
      ctx.handleSelectionChange([{ postId: 5 }, { postId: 6 }])
      expect(ctx.ids.value).toEqual([5, 6])
      expect(ctx.single.value).toBe(true)
      expect(ctx.multiple.value).toBe(false)
    })

    it('单项：single=false, multiple=false', () => {
      const { ctx } = makeCtx()
      ctx.handleSelectionChange([{ postId: 7 }])
      expect(ctx.ids.value).toEqual([7])
      expect(ctx.single.value).toBe(false)
      expect(ctx.multiple.value).toBe(false)
    })

    it('空选：single=true, multiple=true', () => {
      const { ctx } = makeCtx()
      ctx.handleSelectionChange([])
      expect(ctx.ids.value).toEqual([])
      expect(ctx.single.value).toBe(true)
      expect(ctx.multiple.value).toBe(true)
    })
  })

  // ===== 新增 =====
  describe('handleAdd', () => {
    it('重置并打开新增弹窗，标题拼接 common.add + titleKey', () => {
      const { ctx, form, formRef } = makeCtx()
      form.value.postName = 'dirty'
      ctx.handleAdd()
      expect(ctx.open.value).toBe(true)
      expect(ctx.title.value).toBe('common.addpost.title')
      expect(formRef.value!.resetFields).toHaveBeenCalled()
    })
  })

  // ===== 修改 =====
  describe('handleUpdate', () => {
    it('携带 row 时按 row[idField] 拉详情并回填', async () => {
      const { ctx, getApi, form } = makeCtx()
      ctx.handleUpdate({ postId: 12, postName: 'x' })
      expect(getApi).toHaveBeenCalledWith(12)
      await flush()
      expect(form.value).toEqual({ postId: 12, postName: 'fetched' })
      expect(ctx.open.value).toBe(true)
      expect(ctx.title.value).toBe('common.editpost.title')
    })

    it('无 row 时回退到已选 ids[0]', async () => {
      const { ctx, getApi } = makeCtx()
      ctx.handleSelectionChange([{ postId: 4 }])
      ctx.handleUpdate()
      expect(getApi).toHaveBeenCalledWith(4)
      await flush()
      expect(ctx.open.value).toBe(true)
    })

    it('详情请求失败时不打开弹窗，保持重置后的默认表单', async () => {
      const { ctx, getApi, form } = makeCtx()
      getApi.mockRejectedValueOnce(new Error('nope'))
      ctx.handleUpdate({ postId: 3 })
      await flush()
      expect(ctx.open.value).toBe(false)
      expect(form.value).toEqual({ postId: undefined, postName: '' })
    })

    it('并发详情请求丢弃旧响应', async () => {
      const { ctx, getApi, form } = makeCtx()
      const d1 = deferred<{ data: Row }>()
      const d2 = deferred<{ data: Row }>()
      getApi.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)
      ctx.handleUpdate({ postId: 1 })
      ctx.handleUpdate({ postId: 2 })
      d2.resolve({ data: { postId: 2, postName: 'new' } })
      await flush()
      expect(form.value).toEqual({ postId: 2, postName: 'new' })
      d1.resolve({ data: { postId: 1, postName: 'old' } })
      await flush()
      expect(form.value).toEqual({ postId: 2, postName: 'new' })
    })
  })

  // ===== 提交 =====
  describe('submitForm', () => {
    it('校验通过且无主键走新增分支', async () => {
      const { ctx, addApi, updateApi, form, onAfterSubmit, listApi } = makeCtx()
      form.value = { postId: undefined, postName: 'new' }
      ctx.submitForm()
      await flush()
      expect(addApi).toHaveBeenCalled()
      expect(updateApi).not.toHaveBeenCalled()
      expect(modal.msgSuccess).toHaveBeenCalledWith('common.addSuccess')
      expect(ctx.open.value).toBe(false)
      expect(onAfterSubmit).toHaveBeenCalled()
      expect(listApi).toHaveBeenCalled() // 提交成功后刷新列表
      expect(ctx.submitLoading.value).toBe(false)
    })

    it('校验通过且含主键走修改分支', async () => {
      const { ctx, addApi, updateApi, form } = makeCtx()
      form.value = { postId: 5, postName: 'x' }
      ctx.submitForm()
      await flush()
      expect(updateApi).toHaveBeenCalled()
      expect(addApi).not.toHaveBeenCalled()
      expect(modal.msgSuccess).toHaveBeenCalledWith('common.editSuccess')
    })

    it('校验不通过时直接返回，不调用任何 API', async () => {
      const { ctx, formRef, addApi, updateApi } = makeCtx()
      formRef.value!.validate = vi.fn((cb: (v: boolean) => void) => cb(false))
      ctx.submitForm()
      await flush()
      expect(addApi).not.toHaveBeenCalled()
      expect(updateApi).not.toHaveBeenCalled()
      expect(modal.msgSuccess).not.toHaveBeenCalled()
    })

    it('提交失败时保持弹窗打开并复位 loading', async () => {
      const { ctx, addApi, form } = makeCtx()
      form.value = { postId: undefined, postName: 'new' }
      ctx.open.value = true
      addApi.mockRejectedValueOnce(new Error('save fail'))
      ctx.submitForm()
      await flush()
      expect(ctx.open.value).toBe(true)
      expect(modal.msgSuccess).not.toHaveBeenCalled()
      expect(ctx.submitLoading.value).toBe(false)
    })

    it('formRef 为 null 时不执行提交（可选链分支）', async () => {
      const { ctx, formRef, addApi } = makeCtx()
      formRef.value = null
      ctx.submitForm()
      await flush()
      expect(addApi).not.toHaveBeenCalled()
    })
  })

  // ===== 删除 =====
  describe('handleDelete', () => {
    it('确认后按 row 删除并刷新、清理选中态', async () => {
      const { ctx, deleteApi, listApi, onAfterDelete } = makeCtx()
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleDelete({ postId: 7 })
      expect(modal.confirm).toHaveBeenCalledWith('post.confirmDelete')
      await flush()
      expect(deleteApi).toHaveBeenCalledWith(7)
      expect(listApi).toHaveBeenCalled()
      expect(ctx.ids.value).toEqual([])
      expect(ctx.single.value).toBe(true)
      expect(ctx.multiple.value).toBe(true)
      expect(modal.msgSuccess).toHaveBeenCalledWith('common.deleteSuccess')
      expect(onAfterDelete).toHaveBeenCalled()
    })

    it('无 row 时按已选 ids 删除', async () => {
      const { ctx, deleteApi } = makeCtx()
      ctx.handleSelectionChange([{ postId: 1 }, { postId: 2 }])
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleDelete()
      await flush()
      expect(deleteApi).toHaveBeenCalledWith([1, 2])
    })

    it('用户取消确认时不调用删除接口', async () => {
      const { ctx, deleteApi } = makeCtx()
      modal.confirm.mockRejectedValueOnce('cancel')
      ctx.handleDelete({ postId: 7 })
      await flush()
      expect(deleteApi).not.toHaveBeenCalled()
      expect(modal.msgSuccess).not.toHaveBeenCalled()
    })

    it('删除接口失败时不提示删除成功、不触发回调', async () => {
      const { ctx, deleteApi, onAfterDelete } = makeCtx()
      modal.confirm.mockResolvedValueOnce({})
      deleteApi.mockRejectedValueOnce(new Error('x'))
      ctx.handleDelete({ postId: 7 })
      await flush()
      expect(onAfterDelete).not.toHaveBeenCalled()
      expect(modal.msgSuccess).not.toHaveBeenCalledWith('common.deleteSuccess')
    })
  })

  // ===== 导出 =====
  describe('handleExport', () => {
    it('未配置 exportUrl 时直接返回，不触发下载', () => {
      const { ctx } = makeCtx({ exportUrl: undefined })
      ctx.handleExport('x.xlsx')
      expect(download).not.toHaveBeenCalled()
    })

    it('传入文件名时按拷贝的 queryParams 调用 download 并管理 loading', async () => {
      const { ctx } = makeCtx()
      download.mockResolvedValueOnce({})
      ctx.handleExport('myfile.xlsx')
      expect(ctx.exportLoading.value).toBe(true)
      expect(download).toHaveBeenCalledWith('/system/post/export', { pageNum: 2, name: 'a' }, 'myfile.xlsx')
      await flush()
      expect(ctx.exportLoading.value).toBe(false)
    })

    it('未传文件名时生成 `${url末段}_${时间戳}.xlsx`', () => {
      const { ctx } = makeCtx()
      download.mockResolvedValueOnce({})
      ctx.handleExport()
      expect(download).toHaveBeenCalledWith(
        '/system/post/export',
        { pageNum: 2, name: 'a' },
        expect.stringMatching(/^export_\d+\.xlsx$/)
      )
    })

    it('导出进行中忽略重复触发（exportLoading 守卫）', async () => {
      const { ctx } = makeCtx()
      const d = deferred()
      download.mockReturnValueOnce(d.promise)
      ctx.handleExport('a.xlsx')
      ctx.handleExport('b.xlsx') // 因 exportLoading=true 被忽略
      expect(download).toHaveBeenCalledTimes(1)
      d.resolve({})
      await flush()
      expect(ctx.exportLoading.value).toBe(false)
    })
  })
})
