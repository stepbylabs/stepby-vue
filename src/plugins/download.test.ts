/**
 * plugins/download 单元测试（b71 补测：下载文件名解析 + loading 配对 + 非 blob 错误链）
 *
 * 锁定的真实缺陷面（b71 引入 resolveFilename 之前的回归风险）：
 * 1. 响应头缺 download-filename 时，`decodeURIComponent(undefined)` 会得到字符串
 *    "undefined" —— 用户拿到一个叫 undefined 的文件；
 * 2. 百分号编码非法（后端截断的 `%E4%BF`）时 decodeURIComponent 抛 URIError，异常被
 *    .catch 吞掉 → 已成功取回的 blob 被丢弃（下载静默失败）；
 * 3. 后端返回 JSON 错误体（非 blob）时必须走 errorHub 提示，而不是落盘一个坏文件；
 * 4. loading 实例必须是每次下载的局部变量——曾用模块级单例，并发下载时后者覆盖前者
 *    引用，前者的遮罩永远关不掉（卡死在"下载中"）。
 *
 * b138：三条通道收编到 `utils/blobRequest`，同时把**被写成期望的缺陷**改回来——
 * 上面四处 `timeout: 60000` 是旧实现的字面量，而统一口径是 `FILE_DOWNLOAD_TIMEOUT`
 * （600_000，差 10 倍）：大型 `/common/download` 此前必然在第 60 秒被 abort。
 *
 * download.ts 是裸用 axios（不走 @/utils/request），故 mock 'axios' 的 default 导出；
 * errorHub 用真实实例断言 level/source/message，每个用例 resetModules 取新单例。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'

// ---------------------------------------------------------------------------
// 协作者 mock：不加载真实 axios / file-saver / element-plus / i18n / auth
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const axiosRequest = vi.fn<(config: Record<string, unknown>) => Promise<unknown>>()
  const saveAs = vi.fn<(data: Blob, filename?: string, opts?: unknown) => void>()
  const closeFns: Mock[] = []
  const elLoadingService = vi.fn(() => {
    const close = vi.fn()
    closeFns.push(close)
    return { close }
  })
  // i18n 回显 key，便于断言文案接线（T:xxx 形式）
  const t = vi.fn((key: string) => `T:${key}`)
  const getToken = vi.fn(() => 'test-token')
  const elMessage = vi.fn()
  const notifySessionExpired = vi.fn(() => Promise.resolve())
  return { axiosRequest, saveAs, closeFns, elLoadingService, t, getToken, elMessage, notifySessionExpired }
})

vi.mock('axios', () => ({ default: h.axiosRequest }))
vi.mock('file-saver', () => ({ saveAs: h.saveAs }))
vi.mock('element-plus', () => ({ ElLoading: { service: h.elLoadingService }, ElMessage: h.elMessage }))
vi.mock('@/i18n', () => ({ default: { global: { t: h.t } } }))
vi.mock('@/utils/auth', () => ({ getToken: h.getToken }))
// b138：直连原语在 401 时动态 import 主通道的会话失效入口；这里接管它，
// 避免测试真的加载整套 request.ts（顶层会建 axios 实例与拦截器）。
vi.mock('@/utils/request', () => ({ notifySessionExpired: h.notifySessionExpired }))

/** 冲刷宏任务（连带 flush 下载链路上的所有微任务，含 printErrMsg 的 await data.text()） */
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const blobOf = (body: string, type: string): Blob => new Blob([body], { type })

describe('plugins/download', () => {
  let download: (typeof import('./download'))['default']
  let hub: (typeof import('@/utils/errorHub'))['errorHub']
  let consoleError: Mock<(...args: unknown[]) => void>

  beforeEach(async () => {
    // download.ts 在模块加载期读 VITE_APP_BASE_API，必须先 stub 再动态 import
    vi.resetModules()
    vi.stubEnv('VITE_APP_BASE_API', '/mock-base')
    h.axiosRequest.mockReset()
    h.saveAs.mockClear()
    h.elLoadingService.mockClear()
    h.elMessage.mockClear()
    h.t.mockClear()
    h.closeFns.length = 0
    h.getToken.mockReturnValue('test-token')
    h.notifySessionExpired.mockClear()
    // DEV 分支的 console.error 属预期输出，静音以免干扰测试报告
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    download = (await import('./download')).default
    hub = (await import('@/utils/errorHub')).errorHub
    hub.clear()
    // 注入空 toast 捕获器：即使 600ms 聚合窗口被触发也不会走真实 ElMessage
    hub.setToastHandler(() => {})
  })

  afterEach(() => {
    hub.clear()
    hub.setToastHandler(null)
    consoleError.mockRestore()
    vi.unstubAllEnvs()
  })

  // -------------------------------------------------------------------------
  // resolveFilename：经公共方法驱动（name/resource），不复制私有实现
  // -------------------------------------------------------------------------
  it('blob + 合法 download-filename → 以解码后的文件名保存，且 blob 内容原样透传', async () => {
    const payload = blobOf('file-bytes', 'application/octet-stream')
    h.axiosRequest.mockResolvedValue({
      data: payload,
      headers: { 'download-filename': encodeURIComponent('月度报表.xlsx') }
    })

    download.name('fallback.xlsx')
    await flush()

    expect(h.saveAs).toHaveBeenCalledTimes(1)
    const [savedBlob, savedName] = h.saveAs.mock.calls[0]
    expect(savedName).toBe('月度报表.xlsx')
    expect(savedBlob).toBeInstanceOf(Blob)
    expect(savedBlob.size).toBe(payload.size)
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
    expect(hub.issues).toHaveLength(0)
  })

  it('缺失 download-filename 头 → 回退请求名（绝不落盘为字符串 "undefined"）', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('x', 'application/octet-stream'), headers: {} })

    download.name('report.xlsx')
    await flush()

    expect(h.saveAs).toHaveBeenCalledTimes(1)
    const savedName = h.saveAs.mock.calls[0][1]
    expect(savedName).toBe('report.xlsx')
    expect(savedName).not.toBe('undefined')
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('download-filename 为空串 → 同样回退请求名', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf('x', 'application/octet-stream'),
      headers: { 'download-filename': '' }
    })

    download.name('empty-header.xlsx')
    await flush()

    expect(h.saveAs.mock.calls[0][1]).toBe('empty-header.xlsx')
    expect(hub.issues).toHaveLength(0)
  })

  it('非法百分号编码（截断的 %E4%BF）→ 原样使用且不中断下载', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf('x', 'application/octet-stream'),
      headers: { 'download-filename': '%E4%BF' }
    })

    download.name('safe.xlsx')
    await flush()

    // URIError 若逃出 .then 就会落到 .catch：那时不会保存文件、且会上报下载失败
    expect(h.saveAs).toHaveBeenCalledTimes(1)
    expect(h.saveAs.mock.calls[0][1]).toBe('%E4%BF')
    expect(hub.issues).toHaveLength(0)
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('resource() 缺失头时回退资源路径最后一段，存在头时优先解码头', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('png', 'image/png'), headers: {} })
    download.resource('/profile/upload/2026/文件.png')
    await flush()
    expect(h.saveAs).toHaveBeenCalledTimes(1)
    expect(h.saveAs.mock.calls[0][1]).toBe('文件.png')
    expect(h.axiosRequest).toHaveBeenCalledWith({
      method: 'get',
      url: '/mock-base/common/download/resource',
      params: { resource: '/profile/upload/2026/文件.png' },
      responseType: 'blob',
      timeout: 600_000,
      headers: { Authorization: 'Bearer test-token' }
    })

    h.saveAs.mockClear()
    h.axiosRequest.mockResolvedValue({
      data: blobOf('png', 'image/png'),
      headers: { 'download-filename': encodeURIComponent('重命名.png') }
    })
    download.resource('/profile/upload/2026/文件.png')
    await flush()
    expect(h.saveAs.mock.calls[0][1]).toBe('重命名.png')
  })

  it('zip() 用调用方给定名保存（不解析响应头），且 blob 标记为 application/zip', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf('zip', 'application/octet-stream'),
      headers: { 'download-filename': 'ignored-by-zip.pdf' }
    })

    download.zip('/monitor/job/export', '任务日志.zip')
    await flush()

    expect(h.saveAs).toHaveBeenCalledTimes(1)
    const [savedBlob, savedName] = h.saveAs.mock.calls[0]
    expect(savedName).toBe('任务日志.zip')
    expect(savedBlob.type).toBe('application/zip')
    expect(h.axiosRequest).toHaveBeenCalledWith({
      method: 'get',
      url: '/mock-base/monitor/job/export',
      responseType: 'blob',
      timeout: 600_000,
      headers: { Authorization: 'Bearer test-token' }
    })
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('name() 请求契约：GET + responseType blob + timeout 常量 + Bearer 头 + fileName/delete 参数', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('x', 'application/octet-stream'), headers: {} })

    download.name('my report.xlsx', false)
    await flush()

    expect(h.axiosRequest).toHaveBeenCalledWith({
      method: 'get',
      url: '/mock-base/common/download',
      params: { fileName: 'my report.xlsx', delete: 'false' },
      responseType: 'blob',
      timeout: 600_000,
      headers: { Authorization: 'Bearer test-token' }
    })
    expect(h.elLoadingService).toHaveBeenCalledWith({
      text: 'T:common.downloading',
      background: 'rgba(0, 0, 0, 0.7)'
    })
  })

  it('name() 缺省 isDelete=true（delete=true 落到查询串）', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('x', 'application/octet-stream'), headers: {} })

    download.name('a.xlsx')
    await flush()

    // b138：URL 与查询串的构造从「手拼 + encodeURIComponent」改为 axios params，
    // 断言口径随之落到参数对象上（值仍是字符串 'true'，后端收到的查询串不变）
    expect(h.axiosRequest.mock.calls[0][0].params).toMatchObject({ delete: 'true' })
  })

  // -------------------------------------------------------------------------
  // 非 blob 响应：走 printErrMsg，不落盘
  //
  // b125：这里曾有两把锁把**缺陷**写成了期望——「errorCode 是 Proxy：任意 code 都命中
  // 映射（未命中回落 default），故 rspObj.msg 实际不透出」。后果是后端给的具体理由
  // （"文件已被清理"/"导出任务繁忙（export:excel）"）永远到不了用户眼前。
  // 新契约：后端 msg 优先，映射码与 default 是兜底（与 `utils/request` 主通道同口径）。
  // -------------------------------------------------------------------------
  it('JSON 错误体：后端 msg 优先，不被按码写的通用文案顶掉', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf(JSON.stringify({ code: 500, msg: '服务器开小差' }), 'application/json'),
      headers: {}
    })

    download.name('boom.xlsx')
    await flush()

    expect(h.saveAs).not.toHaveBeenCalled()
    expect(hub.issues).toHaveLength(1)
    expect(hub.issues[0]).toMatchObject({ level: 'error', source: 'download', message: '服务器开小差' })
    // 映射文案不得抢先：这正是旧 Proxy 恒返回 default 造成的缺陷形状
    expect(h.t).not.toHaveBeenCalledWith('errorCode.500')
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('未登记业务码：用后端 msg 而不是 errorCode.default', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf(JSON.stringify({ code: 1234, msg: '自定义业务错误' }), 'application/json'),
      headers: {}
    })

    download.name('weird.xlsx')
    await flush()

    expect(h.saveAs).not.toHaveBeenCalled()
    expect(hub.issues[0].message).toBe('自定义业务错误')
    expect(h.t).not.toHaveBeenCalledWith('errorCode.default')
  })

  it('只有错误码没有 msg：已登记码用映射文案，未登记码回落 default', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf(JSON.stringify({ code: 403 }), 'application/json'),
      headers: {}
    })
    download.name('no-msg.xlsx')
    await flush()
    expect(hub.issues[0].message).toBe('T:errorCode.403')

    hub.clear()
    h.axiosRequest.mockResolvedValue({
      data: blobOf(JSON.stringify({ code: 1234 }), 'application/json'),
      headers: {}
    })
    download.name('no-msg-unknown.xlsx')
    await flush()
    expect(hub.issues[0].message).toBe('T:errorCode.default')
  })

  it('错误体带 trace_id：作为独立字段上报，消息里不重复拼后缀', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf(
        JSON.stringify({ code: 429, msg: '导出任务繁忙（export:excel）', trace_id: 'tid-print-1' }),
        'application/json'
      ),
      headers: {}
    })

    download.name('trace.xlsx')
    await flush()

    expect(hub.issues[0].message).toBe('导出任务繁忙（export:excel）')
    expect(hub.issues[0].traceId).toBe('tid-print-1')
  })

  it('错误体本身不是合法 JSON → 上报 common.downloadError', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('<html>502</html>', 'application/json'), headers: {} })

    download.name('html.xlsx')
    await flush()

    expect(h.saveAs).not.toHaveBeenCalled()
    expect(hub.issues).toHaveLength(1)
    expect(hub.issues[0]).toMatchObject({ level: 'error', source: 'download', message: 'T:common.downloadError' })
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // 失败链 + loading 配对
  // -------------------------------------------------------------------------
  it('axios 拒绝（无响应）→ 上报 common.downloadError、关闭 loading 且不保存', async () => {
    h.axiosRequest.mockRejectedValue(new Error('network down'))

    download.name('net.xlsx')
    await flush()

    expect(h.saveAs).not.toHaveBeenCalled()
    expect(hub.issues).toHaveLength(1)
    expect(hub.issues[0]).toMatchObject({ level: 'error', source: 'download', message: 'T:common.downloadError' })
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('HTTP 403 + 网关 HTML 体：用状态码映射文案，并带响应头追踪号', async () => {
    h.axiosRequest.mockRejectedValue({
      response: {
        status: 403,
        data: blobOf('<html>Forbidden</html>', 'text/html'),
        headers: { 'x-request-id': 'req-403' }
      }
    })

    download.name('forbidden.xlsx')
    await flush()

    expect(h.saveAs).not.toHaveBeenCalled()
    // 旧实现这一支只有"下载失败"，用户不知道是没有权限
    expect(hub.issues[0]).toMatchObject({ source: 'download', message: 'T:errorCode.403', traceId: 'req-403' })
  })

  it('HTTP 429 + JSON 体：后端 msg 优先、trace_id 透出（b98 导出闸口径）', async () => {
    h.axiosRequest.mockRejectedValue({
      response: {
        status: 429,
        data: blobOf(
          JSON.stringify({ code: 429, msg: '导出任务繁忙（export:excel），请 30 秒后重试', trace_id: 'tid-429' }),
          'application/json'
        ),
        headers: {}
      }
    })

    download.name('busy.xlsx')
    await flush()

    expect(h.saveAs).not.toHaveBeenCalled()
    expect(hub.issues[0].message).toBe('导出任务繁忙（export:excel），请 30 秒后重试')
    expect(hub.issues[0].traceId).toBe('tid-429')
  })

  it('HTTP 400 + 未登记业务码且无 msg：回落 errorCode.default（可翻译、不空白）', async () => {
    h.axiosRequest.mockRejectedValue({
      response: { status: 400, data: blobOf(JSON.stringify({ code: 1234 }), 'application/json'), headers: {} }
    })

    download.name('unknown-code.xlsx')
    await flush()

    expect(hub.issues[0].message).toBe('T:errorCode.default')
  })

  it('两个并发下载各持自己的 loading 实例（模块级单例覆盖回归锁）', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('x', 'application/octet-stream'), headers: {} })

    download.name('one.xlsx')
    download.name('two.xlsx')
    await flush()

    expect(h.elLoadingService).toHaveBeenCalledTimes(2)
    expect(h.saveAs).toHaveBeenCalledTimes(2)
    // 后者不得覆盖前者引用：两个实例必须各自关闭一次
    expect(h.closeFns).toHaveLength(2)
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
    expect(h.closeFns[1]).toHaveBeenCalledTimes(1)
  })

  it('resource() 失败链与 zip() 失败链均关闭 loading 并上报', async () => {
    h.axiosRequest.mockRejectedValue(new Error('boom'))

    download.resource('/profile/upload/x.png')
    download.zip('/system/user/export', 'u.zip')
    await flush()

    expect(h.saveAs).not.toHaveBeenCalled()
    // 同 级别+源+文案 在去重窗口内合并为一条（count 记重复次数）
    expect(hub.issues).toHaveLength(1)
    expect(hub.issues[0]).toMatchObject({
      level: 'error',
      source: 'download',
      message: 'T:common.downloadError',
      count: 2
    })
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
    expect(h.closeFns[1]).toHaveBeenCalledTimes(1)
  })

  it('printErrMsg 公共方法可直接驱动：data.text() 解析失败也只上报不抛出', async () => {
    await expect(download.printErrMsg(blobOf('not-json', 'application/json'))).resolves.toBeUndefined()
    expect(hub.issues).toHaveLength(1)
    expect(hub.issues[0].message).toBe('T:common.downloadError')
  })

  it('401：走统一会话失效（对话框 + 并发合并），而不是只报一句下载失败（b138）', async () => {
    h.axiosRequest.mockRejectedValue({
      response: {
        status: 401,
        data: blobOf(JSON.stringify({ code: 401, msg: '登录状态已过期' }), 'application/json'),
        headers: {}
      }
    })

    download.name('expired.xlsx')
    await flush()

    // 失败结局仍要给出（用户看得见"登录状态已过期"），同时触发会话失效链路
    expect(hub.issues[0]).toMatchObject({ source: 'download', message: '登录状态已过期' })
    expect(h.notifySessionExpired).toHaveBeenCalledTimes(1)
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // b139：下载入口必须返回**结局**——调用方原先拿不到结局，只能"await 结束就弹成功"，
  // 于是请求失败与保存失败都被报成成功（代码生成页的原缺陷）。
  // 这里的四条与上面的失败链刻意重复断言"上报"，因为**返回值**才是新增的那条腿：
  // 只判 hub 有记录不能证明调用方判断得到结局（`runDownload` 完全可以只上报不返回）。
  // -------------------------------------------------------------------------
  it('成功：返回 true（已交给保存通道）', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('bytes', 'application/octet-stream'), headers: {} })

    await expect(download.name('ok.xlsx')).resolves.toBe(true)
    expect(h.saveAs).toHaveBeenCalledTimes(1)
  })

  it('网络失败：返回 false 且已上报一次', async () => {
    h.axiosRequest.mockRejectedValue(new Error('network down'))

    await expect(download.zip('/tool/gen/genCode/t', 't.zip')).resolves.toBe(false)
    expect(hub.issues).toHaveLength(1)
  })

  it('HTTP 200 但非 blob 错误体：返回 false（不得落盘坏文件）', async () => {
    h.axiosRequest.mockResolvedValue({
      data: blobOf(JSON.stringify({ code: 500, msg: '生成失败' }), 'application/json'),
      headers: {}
    })

    await expect(download.zip('/tool/gen/genCode/t', 't.zip')).resolves.toBe(false)
    expect(h.saveAs).not.toHaveBeenCalled()
    expect(hub.issues[0]).toMatchObject({ message: '生成失败' })
  })

  it('空载荷：返回 false 且上报（saveBlob 拒绝交出 0 字节文件）', async () => {
    h.axiosRequest.mockResolvedValue({ data: new Blob([], { type: 'application/zip' }), headers: {} })

    await expect(download.zip('/tool/gen/genCode/t', 't.zip')).resolves.toBe(false)
    expect(h.saveAs).not.toHaveBeenCalled()
    expect(hub.issues).toHaveLength(1)
  })

  it('保存通道抛错：返回 false 且上报（不得静默当成功）', async () => {
    h.axiosRequest.mockResolvedValue({ data: blobOf('bytes', 'application/zip'), headers: {} })
    h.saveAs.mockImplementationOnce(() => {
      throw new Error('save blocked')
    })

    await expect(download.zip('/tool/gen/genCode/t', 't.zip')).resolves.toBe(false)
    expect(hub.issues).toHaveLength(1)
  })
})
