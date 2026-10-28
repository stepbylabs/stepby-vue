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
// UX-6 URL 同步：可控 route/router，supportsSort 排序进 URL 的断言基建
const { routerReplace, routeState } = vi.hoisted(() => ({
  routerReplace: vi.fn(() => Promise.resolve()),
  routeState: { query: {} as Record<string, unknown> }
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useRoute: () => ({ query: routeState.query })
}))

import { useCrudTable, clampPageToRowCount } from './useCrudTable'

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
    routeState.query = {}
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

    it('末页删空后自动回退一页（不再显示"暂无数据"）', async () => {
      const { ctx, listApi, queryParams } = makeCtx()
      expect(queryParams.value.pageNum).toBe(2)
      listApi.mockResolvedValueOnce({ rows: [], total: 9 }).mockResolvedValueOnce({ rows: [{ postId: 1 }], total: 9 })
      ctx.getList()
      await flush()
      await flush()
      expect(queryParams.value.pageNum).toBe(1)
      expect(listApi).toHaveBeenCalledTimes(2)
      expect(ctx.dataList.value).toHaveLength(1)
    })

    it('第一页本来就为空时不重复请求（筛选无结果不得白跑）', async () => {
      const { ctx, listApi, queryParams } = makeCtx()
      queryParams.value.pageNum = 1
      listApi.mockResolvedValueOnce({ rows: [], total: 0 })
      ctx.getList()
      await flush()
      expect(listApi).toHaveBeenCalledTimes(1)
      expect(queryParams.value.pageNum).toBe(1)
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

    // 批六十四回归锁（F137⑤ 真实缺陷）：URL 同步 + fullPath 重挂载下，重挂载实例的
    // EP form-item initialValue 被 restoreQueryFromUrl 回填值污染——resetQuery 必须
    // 恢复「页面定义默认值」而非「挂载时的 URL 筛选值」。
    it('重置恢复干净默认值，而非 URL 回填的污染初值（UX-6 × P1 重挂载交互缺陷）', () => {
      // 模拟：搜索 → syncUrlQuery 写 URL → fullPath 变化 → 页面重挂载，
      // 重挂载实例从 URL 恢复筛选值（EP initialValue 从此被污染）
      routeState.query = { pageNum: '1', name: 'zzz' }
      const { ctx, queryParams, listApi } = makeCtx()
      expect(queryParams.value.name).toBe('zzz') // 挂载即被 URL 回填（污染实证）
      ctx.resetQuery()
      expect(queryParams.value.name).toBe('a') // 回到页面定义默认值，而非 'zzz'
      expect(queryParams.value.pageNum).toBe(1) // handleQuery 归位第一页（重置业务语义）
      expect(listApi).toHaveBeenCalledTimes(1)
    })

    it('快照按 queryParams 对象身份隔离（多实例互不串扰）', () => {
      routeState.query = {}
      const a = makeCtx()
      routeState.query = { name: 'b' }
      const b = makeCtx()
      expect(b.queryParams.value.name).toBe('b')
      a.ctx.resetQuery()
      expect(a.queryParams.value.name).toBe('a')
      expect(b.queryParams.value.name).toBe('b') // a 的重置不影响 b
      b.ctx.resetQuery()
      expect(b.queryParams.value.name).toBe('a') // b 恢复自己的快照默认
      routeState.query = {}
    })

    it('onReset 前置回调在 resetQuery 最先执行（清页面级查询状态如 dateRange）', () => {
      const order: string[] = []
      const onReset = vi.fn(() => order.push('onReset'))
      const { ctx, queryRef } = makeCtx({ onReset })
      queryRef.value!.resetFields.mockImplementation(() => order.push('resetFields'))
      ctx.resetQuery()
      expect(order).toEqual(['onReset', 'resetFields'])
    })

    // 批六十四加固回归锁：params 容器（addDateRange 的就地写入目标）与快照共享引用时，
    // 运行期就地写键会污染快照——重置恢复必须回到快照时点的 params 态（无残留日期键）。
    it('params 容器快照隔离：运行期就地写键不污染快照，重置后无残留日期键', () => {
      const { ctx, queryParams } = makeCtx()
      // 模拟运行期：addDateRange 式**就地写键**（utils/stepby.ts:106-110 同款，非替换对象）
      const target = queryParams.value as unknown as Record<string, unknown>
      const paramsBag = (target.params || (target.params = {})) as Record<string, unknown>
      paramsBag['beginTime'] = '2026-10-01 00:00:00'
      paramsBag['endTime'] = '2026-10-13 23:59:59'
      ctx.resetQuery()
      // 重置后 params 恢复快照态（空容器），无日期键残留——
      // 否则下一次请求会携带旧 params[beginTime]（即使 dateRange 已清空）
      const restored = (queryParams.value as unknown as Record<string, unknown>).params as
        Record<string, unknown> | undefined
      expect(restored?.beginTime).toBeUndefined()
      expect(restored?.endTime).toBeUndefined()
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

  // ===== UX-5 未保存守卫的基准快照（b73 轮 13 真机复现缺陷的回归锁） =====
  // 缺陷形态：页面覆写 handleAdd/handleUpdate 时漏调 snapshotForm → 快照仍是上一轮表单，
  // 用户"打开新增、一个字没改、点关闭"却弹「当前表单内容尚未保存」（角色管理/部门管理实测复现）。
  describe('unsaved guard baseline snapshot', () => {
    it('标准 handleAdd 后未改动 → cancel 不弹确认且直接关闭', async () => {
      const { ctx } = makeCtx()
      elMessageBoxConfirm.mockResolvedValue(undefined)
      ctx.handleAdd()
      await flush()
      await ctx.cancel()
      expect(elMessageBoxConfirm).not.toHaveBeenCalled()
      expect(ctx.open.value).toBe(false)
    })

    it('对照组：改动内容后 cancel 必须弹确认（证明上一条不是虚锁）', async () => {
      const { ctx, form } = makeCtx()
      elMessageBoxConfirm.mockResolvedValue(undefined)
      ctx.handleAdd()
      await flush()
      form.value.postName = 'typed by user'
      await ctx.cancel()
      expect(elMessageBoxConfirm).toHaveBeenCalledTimes(1)
    })

    it('页面自行置 open（不调 snapshotForm）时，挂载点必须自动补快照', async () => {
      const { ctx, form } = makeCtx()
      // 复刻 role/dept 本地 handleAdd：只改表单 + 置 open，完全不碰 snapshotForm
      form.value = { postId: 7, postName: '' }
      ctx.open.value = true
      await flush()
      elMessageBoxConfirm.mockResolvedValue(undefined)
      await ctx.cancel()
      expect(elMessageBoxConfirm).not.toHaveBeenCalled()
      expect(ctx.open.value).toBe(false)
    })

    it('打开之后再设默认值（部门新增挂父节点形态）也不算脏', async () => {
      const { ctx, form } = makeCtx()
      ctx.handleAdd()
      // 同一轮同步块内在 open 之后继续改表单：快照必须取"最终值"而不是 open 那一刻的中间值
      form.value.postId = 42
      await flush()
      elMessageBoxConfirm.mockResolvedValue(undefined)
      await ctx.cancel()
      expect(elMessageBoxConfirm).not.toHaveBeenCalled()
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

    it('详情在途时重复点击只发一次请求（b106 同步闸；行内与工具栏两个入口都可达）', async () => {
      const { ctx, getApi, form } = makeCtx()
      const d = deferred<{ data: Row }>()
      getApi.mockReturnValueOnce(d.promise)
      ctx.handleUpdate({ postId: 1 })
      ctx.handleUpdate({ postId: 2 })
      expect(getApi).toHaveBeenCalledTimes(1)
      expect(getApi).toHaveBeenCalledWith(1)
      d.resolve({ data: { postId: 1, postName: 'fetched' } })
      await flush()
      expect(form.value).toEqual({ postId: 1, postName: 'fetched' })
      // 闸必须复位：一次详情加载后再点另一行照常能加载
      ctx.handleUpdate({ postId: 2 })
      await flush()
      expect(getApi).toHaveBeenCalledTimes(2)
      expect(form.value).toEqual({ postId: 2, postName: 'fetched' })
    })

    it('详情缺 data 时不打开弹窗、不把 form 置空（否则模板读 form.xxx 整页崩）', async () => {
      const { ctx, getApi, form } = makeCtx()
      getApi.mockResolvedValueOnce({ data: undefined } as unknown as { data: Row })
      ctx.handleUpdate({ postId: 9 })
      await flush()
      expect(ctx.open.value).toBe(false)
      expect(form.value).toEqual({ postId: undefined, postName: '' })
      expect(modal.msgError).toHaveBeenCalledWith('common.loadDetailFailed')
      // 同一条链路不得把闸卡死：下一次正常详情必须能打开
      ctx.handleUpdate({ postId: 10 })
      await flush()
      expect(ctx.open.value).toBe(true)
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

    it('同步连点两次只提交一次（校验窗口内的第二次必须被同步闸挡掉）', async () => {
      const { ctx, formRef, addApi, form } = makeCtx()
      form.value = { postId: undefined, postName: 'new' }
      // 把校验回调挂起：模拟 async-validator 的真实异步窗口（默认桩是同步 cb(true)）
      let releaseValidate!: (v: boolean) => void
      formRef.value!.validate = vi.fn((cb: (v: boolean) => void) => {
        releaseValidate = cb
      })
      ctx.submitForm()
      ctx.submitForm()
      expect(formRef.value!.validate).toHaveBeenCalledTimes(1)
      releaseValidate(true)
      await flush()
      expect(addApi).toHaveBeenCalledTimes(1)
      // 一次提交结束后闸必须复位：下一次点击照常能提交（闸不是一次性的）
      ctx.submitForm()
      releaseValidate(true)
      await flush()
      expect(addApi).toHaveBeenCalledTimes(2)
    })

    it('校验失败会释放闸（否则表单会永久不可提交）', async () => {
      const { ctx, formRef, addApi } = makeCtx()
      formRef.value!.validate = vi.fn((cb: (v: boolean) => void) => cb(false))
      ctx.submitForm()
      await flush()
      expect(addApi).not.toHaveBeenCalled()
      // 修好表单后再次提交必须能走到请求
      formRef.value!.validate = vi.fn((cb: (v: boolean) => void) => cb(true))
      ctx.submitForm()
      await flush()
      expect(addApi).toHaveBeenCalledTimes(1)
    })

    it('请求失败会释放闸：可立即重试且不会重复提交', async () => {
      const { ctx, addApi, form } = makeCtx()
      form.value = { postId: undefined, postName: 'new' }
      addApi.mockRejectedValueOnce(new Error('save fail'))
      ctx.submitForm()
      await flush()
      expect(addApi).toHaveBeenCalledTimes(1)
      ctx.submitForm()
      await flush()
      expect(addApi).toHaveBeenCalledTimes(2)
      expect(ctx.submitLoading.value).toBe(false)
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

    it('连点两次只弹一个确认框（确认框渲染前的第二次必须被同步闸挡掉）', async () => {
      const { ctx, deleteApi } = makeCtx()
      const d = deferred()
      modal.confirm.mockReturnValueOnce(d.promise)
      ctx.handleDelete({ postId: 7 })
      ctx.handleDelete({ postId: 7 })
      expect(modal.confirm).toHaveBeenCalledTimes(1)
      d.resolve({})
      await flush()
      expect(deleteApi).toHaveBeenCalledTimes(1)
      // 结束后闸复位：下一次删除照常弹框
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleDelete({ postId: 7 })
      await flush()
      expect(modal.confirm).toHaveBeenCalledTimes(2)
    })

    it('取消确认后闸必须释放（否则删除按钮永久失灵）', async () => {
      const { ctx, deleteApi } = makeCtx()
      modal.confirm.mockRejectedValueOnce('cancel')
      ctx.handleDelete({ postId: 7 })
      await flush()
      expect(deleteApi).not.toHaveBeenCalled()
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleDelete({ postId: 7 })
      await flush()
      expect(deleteApi).toHaveBeenCalledWith(7)
    })
  })

  // ===== 只读模式（仅 listApi + deleteApi）与 deleteTipParams 插值契约 =====
  describe('readonly mode', () => {
    it('未传 getApi/addApi/updateApi 时不暴露 handleAdd/handleUpdate/submitForm', () => {
      const { ctx } = makeCtx({ getApi: undefined, addApi: undefined, updateApi: undefined })
      const exposed = ctx as unknown as Record<string, unknown>
      expect(exposed.handleAdd).toBeUndefined()
      expect(exposed.handleUpdate).toBeUndefined()
      expect(exposed.submitForm).toBeUndefined()
    })

    it('只读模式：getList/handleDelete 仍正常工作', async () => {
      const { ctx, listApi, deleteApi } = makeCtx({ getApi: undefined, addApi: undefined, updateApi: undefined })
      listApi.mockResolvedValueOnce({ rows: [{ postId: 1 }], total: 1 })
      ctx.getList()
      await flush()
      expect(ctx.dataList.value).toEqual([{ postId: 1 }])
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleSelectionChange([{ postId: 9 }])
      ctx.handleDelete()
      await flush()
      expect(deleteApi).toHaveBeenCalledWith([9])
      expect(modal.msgSuccess).toHaveBeenCalledWith('common.deleteSuccess')
    })

    it('deleteTipParams 提供时优先作为插值契约（{count} 按 ids 派生）', async () => {
      const { ctx, deleteApi } = makeCtx({
        deleteTipParams: (ids: Array<number | string>) => ({ count: ids.length })
      })
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleSelectionChange([{ postId: 1 }, { postId: 2 }])
      ctx.handleDelete()
      expect(t).toHaveBeenCalledWith('post.confirmDelete', { count: 2 })
      await flush()
      expect(deleteApi).toHaveBeenCalledWith([1, 2])
    })

    it('deleteTipParams 提供时单行删除收到单元素数组', async () => {
      const { ctx, deleteApi } = makeCtx({
        deleteTipParams: (ids: Array<number | string>) => ({ count: ids.length })
      })
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleDelete({ postId: 7 })
      expect(t).toHaveBeenCalledWith('post.confirmDelete', { count: 1 })
      await flush()
      expect(deleteApi).toHaveBeenCalledWith(7)
    })

    it('未提供 deleteTipParams 时默认插值契约保持 {ids}（存量行为零变化）', async () => {
      const { ctx } = makeCtx()
      modal.confirm.mockResolvedValueOnce({})
      ctx.handleDelete({ postId: 7 })
      expect(t).toHaveBeenCalledWith('post.confirmDelete', { ids: 7 })
      await flush()
    })
  })

  // ===== 可选排序（supportsSort）：直接写入 queryParams =====
  describe('supportsSort', () => {
    it('开启时 ascending → queryParams.orderByColumn/isAsc 写入并随请求透传、重置第一页', async () => {
      const { ctx, listApi, queryParams } = makeCtx({ supportsSort: true })
      ctx.handleSortChange({ prop: 'postName', order: 'ascending' })
      await flush()
      expect(queryParams.value.pageNum).toBe(1)
      expect(queryParams.value).toMatchObject({ orderByColumn: 'postName', isAsc: 'asc' })
      expect(listApi).toHaveBeenLastCalledWith(queryParams.value)
    })

    it('开启时 descending → isAsc=desc 写入 queryParams', async () => {
      const { ctx, listApi, queryParams } = makeCtx({ supportsSort: true })
      ctx.handleSortChange({ prop: 'postId', order: 'descending' })
      await flush()
      expect(queryParams.value).toMatchObject({ orderByColumn: 'postId', isAsc: 'desc', pageNum: 1 })
      expect(listApi).toHaveBeenLastCalledWith(queryParams.value)
    })

    it('开启时取消排序（order=null）→ 排序参数置 undefined 并重置第一页', async () => {
      const { ctx, listApi, queryParams } = makeCtx({ supportsSort: true })
      ctx.handleSortChange({ prop: 'postId', order: 'descending' })
      await flush()
      ctx.handleSortChange({ prop: 'postId', order: null })
      await flush()
      expect(queryParams.value).toMatchObject({ pageNum: 1 })
      expect((queryParams.value as Record<string, unknown>).orderByColumn).toBeUndefined()
      expect((queryParams.value as Record<string, unknown>).isAsc).toBeUndefined()
      expect(listApi).toHaveBeenLastCalledWith(queryParams.value)
    })

    it('开启时 prop 缺失视同取消排序（不产生空排序参数）', async () => {
      const { ctx, queryParams } = makeCtx({ supportsSort: true })
      ctx.handleSortChange({ prop: undefined, order: 'ascending' })
      await flush()
      expect((queryParams.value as Record<string, unknown>).orderByColumn).toBeUndefined()
      expect((queryParams.value as Record<string, unknown>).isAsc).toBeUndefined()
    })

    it('开启时排序同步进 URL（UX-6，刷新不丢排序）', async () => {
      routeState.query = {}
      const { ctx } = makeCtx({ supportsSort: true })
      ctx.handleSortChange({ prop: 'postName', order: 'descending' })
      await flush()
      expect(routerReplace).toHaveBeenLastCalledWith({
        query: expect.objectContaining({ orderByColumn: 'postName', isAsc: 'desc' })
      })
    })

    it('开启时进入页面从 URL 恢复排序参数（刷新不丢）', () => {
      routeState.query = { orderByColumn: 'postName', isAsc: 'desc' }
      const { queryParams } = makeCtx({ supportsSort: true })
      expect(queryParams.value).toMatchObject({ orderByColumn: 'postName', isAsc: 'desc' })
    })

    it('开启时 resetQuery 连带清空排序参数', async () => {
      const { ctx, queryParams } = makeCtx({ supportsSort: true })
      ctx.handleSortChange({ prop: 'postId', order: 'descending' })
      await flush()
      expect((queryParams.value as Record<string, unknown>).orderByColumn).toBe('postId')
      ctx.resetQuery()
      await flush()
      expect((queryParams.value as Record<string, unknown>).orderByColumn).toBeUndefined()
      expect((queryParams.value as Record<string, unknown>).isAsc).toBeUndefined()
      expect(queryParams.value.pageNum).toBe(1)
    })

    it('未开启（默认）时 handleSortChange 不触发请求、不影响查询参数', async () => {
      const { ctx, listApi, queryParams } = makeCtx()
      ctx.handleSortChange({ prop: 'postName', order: 'descending' })
      await flush()
      expect(listApi).not.toHaveBeenCalled()
      expect(queryParams.value).not.toHaveProperty('orderByColumn')
      expect(queryParams.value).not.toHaveProperty('isAsc')
      expect(queryParams.value.pageNum).toBe(2) // 未被重置
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

    it('未传文件名时按「实体名_时间戳」自动命名（取 URL 倒数第二段，不是末段 export）', () => {
      const { ctx } = makeCtx()
      download.mockResolvedValueOnce({})
      ctx.handleExport()
      expect(download).toHaveBeenCalledWith(
        '/system/post/export',
        { pageNum: 2, name: 'a' },
        expect.stringMatching(/^post_\d+\.xlsx$/)
      )
    })

    it('模板裸绑 `@click="handleExport"` 传入事件对象时不得污染文件名（b73 真缺陷回归锁）', () => {
      // 缺陷现场：7 个页面把导出物存成 `[object PointerEvent].txt`——el-button 的 click 载荷
      // 在类型上是宽松的，vue-tsc 拦不住，只能由 composable 自己拒收非字符串覆写
      const { ctx } = makeCtx()
      download.mockResolvedValueOnce({})
      ;(ctx.handleExport as (filename?: unknown) => void)(new Event('click'))
      const name = download.mock.calls[0][2]
      expect(name).toMatch(/^post_\d+\.xlsx$/)
      expect(name).not.toContain('[object')
    })

    it('空字符串文件名按未传处理（不得下载成无后缀空名）', () => {
      const { ctx } = makeCtx()
      download.mockResolvedValueOnce({})
      ctx.handleExport('')
      expect(download.mock.calls[0][2]).toMatch(/^post_\d+\.xlsx$/)
    })

    it('对照组：旧写法 `filename || 默认` 会把事件对象洗成 [object Event]', () => {
      // 证明上一把锁真的受约束：实现若改回 `filename || default`，事件分支得到的就是这个名字
      const ev = new Event('click') as unknown as string
      expect(`${ev || 'post.xlsx'}`).toBe('[object Event]')
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

// ---------------------------------------------------------------------------
// 批七十三 轮 16：URL 数值注入闸门。
// 缺陷形态：restoreQueryFromUrl 用裸 Number() 解析 URL 值，IEEE754 把 100 位数字串折成
// 1.11e+99 并注入查询对象，随后 syncUrlQuery 又把折出来的值写回 URL——畸形深链由此
// 从"一次本地就能拒绝的坏参数"变成"注定 400 的出网请求 + 被污染的地址栏"。
// ---------------------------------------------------------------------------
describe('useCrudTable restoreQueryFromUrl 数值注入闸门（b73 轮 16）', () => {
  const huge = '1'.repeat(100)

  function mountWith(query: Record<string, unknown>, initial: Record<string, unknown>) {
    routeState.query = query
    const queryParams = ref<Record<string, unknown>>({ ...initial })
    makeCtx({ queryParams })
    routeState.query = {}
    return queryParams
  }

  it('pageNum：合法字符串正常回填', () => {
    expect(mountWith({ pageNum: '7' }, { pageNum: 2, name: 'a' }).value.pageNum).toBe(7)
  })

  it('pageNum：畸形（100 位 / 小数 / 0 / 脏字符）保持页面默认，不注入', () => {
    for (const bad of [huge, '1.5', '0', '12abc']) {
      expect(mountWith({ pageNum: bad }, { pageNum: 2, name: 'a' }).value.pageNum, bad).toBe(2)
    }
  })

  it('其它数值键：往返无损才注入（0 与负数按字面保留，畸形串保持默认）', () => {
    expect(mountWith({ deptId: '12' }, { pageNum: 1, deptId: 5 }).value.deptId).toBe(12)
    expect(mountWith({ deptId: '0' }, { pageNum: 1, deptId: 5 }).value.deptId).toBe(0)
    for (const bad of ['007', '1e99', huge, '12abc']) {
      expect(mountWith({ deptId: bad }, { pageNum: 1, deptId: 5 }).value.deptId, bad).toBe(5)
    }
  })

  it('字符串键不受影响（原样回填）', () => {
    expect(mountWith({ name: 'zzz' }, { pageNum: 1, name: 'a' }).value.name).toBe('zzz')
  })

  it('控制组：旧判据（裸 Number + NaN 检查）确实会放行 100 位串（证明本锁真在约束）', () => {
    const oldAccepts = (v: string) => !Number.isNaN(Number(v)) && Number(v) > 0
    expect(oldAccepts(huge)).toBe(true) // 旧写法：注入 1.11e+99
    expect(oldAccepts('1e99')).toBe(true)
    expect(mountWith({ deptId: huge }, { pageNum: 1, deptId: 5 }).value.deptId).toBe(5) // 新判据：拒绝
  })
})

// ---------------------------------------------------------------------------
// 批八十八：空态分形 loadError 状态机。
// 立的案：列表请求失败被 catch 静默吞成空列表，toast 消失后页面落回"暂无数据"——
// "加载失败"与"真的没有数据"在屏幕上同形（全仓 41 处空态一律绑 common.empty）。
// 组合子新增 loadError/retryLoad；以下判据必须**点名是哪个状态**，
// 并要求"失败但不置真"的实现被当场抓红（反证），成功路径恒假（正控）。
// ---------------------------------------------------------------------------
describe('useCrudTable loadError 状态机（空态分形：失败 ≠ 暂无数据）', () => {
  it('初值为 false（从未请求过的页面不得被读成"失败"）', () => {
    const { ctx } = makeCtx()
    expect(ctx.loadError.value, 'loadError 初始值').toBe(false)
  })

  it('列表请求失败 → loadError 置真（反证：不置真的实现被本条当场抓红）', async () => {
    const { ctx, listApi } = makeCtx()
    listApi.mockRejectedValueOnce(new Error('boom'))
    ctx.getList()
    await flush()
    expect(ctx.loadError.value, 'getList 失败后 loadError 应为 true').toBe(true)
    // 既有失败行为零变化：清空列表、复位 loading
    expect(ctx.dataList.value, 'dataList 仍应被清空').toEqual([])
    expect(ctx.loading.value, 'loading 应复位').toBe(false)
  })

  it('正控：请求成功 → loadError 为 false，且此前的失败被成功清除', async () => {
    const { ctx, listApi } = makeCtx()
    listApi.mockRejectedValueOnce(new Error('boom'))
    ctx.getList()
    await flush()
    expect(ctx.loadError.value, '中间态：失败后应为 true').toBe(true)
    // makeCtx 默认 listApi 成功：第二次 getList 走成功分支
    ctx.getList()
    await flush()
    expect(ctx.loadError.value, '请求成功后 loadError 应回落为 false').toBe(false)
  })

  it('retryLoad 复用 getList：真实重发请求且成功后清除失败态', async () => {
    const { ctx, listApi } = makeCtx()
    listApi.mockRejectedValueOnce(new Error('offline'))
    ctx.getList()
    await flush()
    expect(ctx.loadError.value, '重试前应为 true').toBe(true)
    const callsBefore = listApi.mock.calls.length
    ctx.retryLoad()
    await flush()
    expect(listApi.mock.calls.length, 'retryLoad 必须真实再发一次列表请求').toBe(callsBefore + 1)
    expect(ctx.loadError.value, '重试成功后 loadError 应清除').toBe(false)
  })

  it('重试再次失败 → loadError 保持真（retry 不得被读成成功）', async () => {
    const { ctx, listApi } = makeCtx()
    listApi.mockRejectedValueOnce(new Error('a'))
    ctx.getList()
    await flush()
    listApi.mockRejectedValueOnce(new Error('b'))
    ctx.retryLoad()
    await flush()
    expect(ctx.loadError.value, '重试再次失败后 loadError 应仍为 true').toBe(true)
  })

  it('最新请求失败 + 旧请求迟到成功 ⇒ 失败态保持（版本号守卫同时罩住 loadError）', async () => {
    const { ctx, listApi } = makeCtx()
    const d1 = deferred<{ rows: Row[]; total: number }>()
    const d2 = deferred<{ rows: Row[]; total: number }>()
    listApi.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)
    ctx.getList() // requestId=1
    ctx.getList() // requestId=2（最新）
    d2.reject(new Error('latest failed'))
    await flush()
    expect(ctx.loadError.value, '最新请求失败 → true').toBe(true)
    d1.resolve({ rows: [{ postId: 1 }], total: 1 }) // 旧响应迟到且"成功"
    await flush()
    expect(ctx.loadError.value, '旧请求成功不得清除最新失败态').toBe(true)
    expect(ctx.dataList.value, '旧响应不得覆盖列表').toEqual([])
  })

  it('最新请求成功 + 旧请求迟到失败 ⇒ 成功态不被污染（对照组）', async () => {
    const { ctx, listApi } = makeCtx()
    const d1 = deferred<{ rows: Row[]; total: number }>()
    const d2 = deferred<{ rows: Row[]; total: number }>()
    listApi.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)
    ctx.getList()
    ctx.getList()
    d2.resolve({ rows: [{ postId: 9 }], total: 1 })
    await flush()
    expect(ctx.loadError.value, '最新请求成功 → false').toBe(false)
    d1.reject(new Error('stale failed')) // 旧请求迟到失败
    await flush()
    expect(ctx.loadError.value, '旧请求失败不得污染最新成功态').toBe(false)
    expect(ctx.dataList.value, '旧失败不得清空已到达的新数据').toEqual([{ postId: 9 }])
  })

  it('只读模式同样暴露 loadError/retryLoad（返回值公共面，两侧重载都可用）', async () => {
    const { ctx, listApi } = makeCtx({ getApi: undefined, addApi: undefined, updateApi: undefined })
    expect(typeof ctx.retryLoad, '只读模式必须暴露 retryLoad').toBe('function')
    listApi.mockRejectedValueOnce(new Error('x'))
    ctx.retryLoad()
    await flush()
    expect(ctx.loadError.value, '只读模式失败后 loadError 同样置真').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// clampPageToRowCount（b102）：全量拉取 + 前端 slice 分页的页面（在线用户）
// 删掉末页最后一条后，行数仍非 0（pageAfterEmptyResult 看不见越界），
// 必须由本地页码收敛到仍存在的最大页，否则停在空页而前面还有数据。
// ---------------------------------------------------------------------------
describe('clampPageToRowCount（前端切片分页的页码收敛）', () => {
  it('末页最后一条被删：页码回到新的最后一页', () => {
    // 21 条 → 删掉第 21 条后 20 条，每页 10 ⇒ 第 3 页不存在，收敛到 2
    expect(clampPageToRowCount(3, 20, 10)).toBe(2)
  })

  it('末页还有数据：页码不动（不得把合法页误收敛）', () => {
    expect(clampPageToRowCount(2, 20, 10)).toBe(2)
    expect(clampPageToRowCount(2, 11, 10)).toBe(2)
  })

  it('整表被清空：回到第 1 页', () => {
    expect(clampPageToRowCount(3, 0, 10)).toBe(1)
  })

  it('页大小为 0/负数：按 1 计，不得算出 Infinity 或负数页', () => {
    expect(clampPageToRowCount(5, 3, 0)).toBe(3)
    expect(clampPageToRowCount(5, 3, -10)).toBe(3)
  })

  it('对照：本地行数超过最后一页容量时页码保持（边界恰整除）', () => {
    expect(clampPageToRowCount(2, 20, 10)).toBe(2)
    expect(clampPageToRowCount(1, 0, 10)).toBe(1)
  })
})
