/**
 * 模块 95（b103）：接口失败 / 取消对话框**不得卸载整页**（ErrorBoundary 分类的浏览器那一半）。
 *
 * ## 立的案
 *
 * `AppMain` 用 `ErrorBoundary` 包住整棵页面树，任何未被页面捕获的异步拒绝都会把页面
 * 卸载成「页面加载失败」。接口失败（4xx/5xx）与"用户在确认框里点取消"都不是渲染错误：
 * 前者拦截器已经提示过，后者是正常分支；两者都不该丢掉用户已填的表单。
 *
 * b102 在五个页面逐一补了 try/catch——那是"修一处"，新页面少写一个 catch 就复发。
 * b103 把判定收进边界自身（`utils/requestError.ts` 打标记 + `ErrorBoundary` 分类），
 * 单测已覆盖两条谓词与挂载行为；**浏览器里这条链从未被执行过**：真实 axios 拦截器 →
 * 真实 Vue 事件处理器 → 真实 ErrorBoundary。本模块补上这一段。
 *
 * ## 为什么选「报表看板」
 *
 * 它的建看板处理器（`views/tool/reportBoard/index.vue::createBoard`）刻意**不写 catch**：
 * 它是"页面级 try/catch"覆盖不到的典型形态（`ElMessageBox.prompt` + 直接 await 业务 API）。
 * 于是这一页天然是错误边界的**活体探针**：修好前它会被卸载，修好后页面留着。
 *
 * ## 四条判据（各配反向对照）
 *
 * ① 取消对话框 ⇒ 页面不被卸载、且**不得**出现错误提示（取消不是错误）；
 * ② 取消之后页面仍可交互（再次点「新建看板」仍能弹出对话框）——只判"没卸载"会放过
 *    "组件已死、只剩静态 DOM"的实现；
 * ③ 业务失败（HTTP 200 + `body.code=500`）⇒ 请求**确已出网**（注入计数 ≥1，证明点击落地）、
 *    错误提示可见、页面仍未被卸载；
 * ④ 前后 `.error-boundary` 计数恒为 0（页面级判定），并把它作为每条用例的一部分。
 *
 * 刻意用**业务码失败**而不是 HTTP 500：后者会让 Chromium 打一条
 * `Failed to load resource … 500` 的 console 错误，把"我自己注入的故障"变成模块的
 * console 判红源（同 M93 的取舍）。
 */

/** 取消提示的双语按钮/输入框选择器（EP 的 MessageBox 结构稳定，按 role 兜底） */
const MSG_BOX = '.el-message-box'
const CREATE_BTN_TEXTS = ['新建看板', 'New Board']
const CONFIRM_BTN = '.el-message-box__btns .el-button--primary'

export function makeErrorBoundarySurvivalTest(ctx) {
  const { record, log, CONFIG, checkConsoleErrors, sleep, getApiToken, createPage } = ctx

  return async function testModule95(browser, consoleErrors, pageErrors) {
    const M = 95
    log('\n=== 模块 95: 接口失败/取消对话框不得卸载整页（ErrorBoundary 分类）===')

    if (!browser || !createPage) {
      record(M, '95.0 前置: 浏览器与 createPage 可用', false, 'runner 未提供 browser/createPage ⇒ 工具自曝')
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }
    const created = await createPage(browser).catch(() => null)
    if (!created) {
      record(M, '95.0 前置: 独立上下文创建成功', false, 'createPage 返回 null（工具自曝）')
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }
    const { page, context, consoleErrors: ce, pageErrors: pe } = created

    // 首访引导遮罩会拦截点击（b90 的 noopener 教训同族：遮罩在数据加载后才挂）
    await page.addInitScript(() => {
      try {
        localStorage.setItem('stepby-layout-tour', 'completed')
        localStorage.setItem('workbench-tour', 'completed')
        localStorage.setItem('home-tour', 'completed')
      } catch {
        /* localStorage 不可用保持原行为 */
      }
    })

    /** 轮询到条件成立；`{ok, ms, ...}` 的耗时进凭证（禁止"导航后看一眼"） */
    async function pollUntil(fn, { timeout = 12000, every = 150 } = {}) {
      const t0 = Date.now()
      let last = null
      while (Date.now() - t0 < timeout) {
        last = await fn()
        if (last && last.ok) return { ok: true, ms: Date.now() - t0, ...last }
        await sleep(every)
      }
      return { ok: false, ms: Date.now() - t0, ...(last || {}) }
    }

    /**
     * 一次 evaluate 读全：边界计数 / 页面路径 / 「新建看板」按钮数 / 错误提示 / 对话框是否开着。
     *
     * 挂载信号取**按钮存在**而不是标题文本：报表看板页没有 h1/h2 级的标题节点，
     * 硬匹配标题会把"页面已挂载"判成"没挂载"（首跑实测 20s 超时、标题读到的是 document.title）。
     */
    async function snapshot() {
      return page
        .evaluate(() => {
          const boundary = document.querySelectorAll('.error-boundary').length
          const createButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
            /新建看板|New Board/.test(String(b.innerText || ''))
          ).length
          const messages = Array.from(document.querySelectorAll('.el-message')).map((e) => String(e.innerText || ''))
          const boxOpen = !!document.querySelector('.el-message-box')
          return { boundary, createButtons, messages, boxOpen, path: location.pathname }
        })
        .catch(() => ({ boundary: -1, createButtons: 0, messages: [], boxOpen: false, path: '' }))
    }

    /** 点「新建看板」并等对话框出现；返回是否成功打开 */
    async function openCreateDialog() {
      const target = page.getByRole('button', { name: new RegExp(CREATE_BTN_TEXTS.join('|')) }).first()
      await target.click({ timeout: 8000 }).catch(() => {})
      return pollUntil(async () => ({ ok: (await snapshot()).boxOpen }), { timeout: 8000 })
    }

    try {
      // ---------- 95.1 真实登录 + 页面挂载 ----------
      const token = await getApiToken().catch(() => null)
      record(M, '95.1 前置: 取得真实管理员令牌（API 登录）', !!token, token ? 'token 获取成功' : 'API 登录失败')
      if (!token) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }
      await page.goto(`${CONFIG.frontendUrl}/login`, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
      await page.evaluate((t) => {
        document.cookie = `Admin-Token=${t}; path=/; SameSite=Lax`
      }, token)
      await page.goto(`${CONFIG.frontendUrl}/tool/reportBoard`, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
      const mounted = await pollUntil(
        async () => {
          const s = await snapshot()
          return { ok: s.boundary === 0 && s.createButtons > 0, ...s }
        },
        { timeout: 20000 }
      )
      record(
        M,
        '95.1 报表看板页已挂载（边界计数=0 且「新建看板」按钮可见）',
        mounted.ok,
        `耗时 ${mounted.ms}ms, path=${mounted.path || '（无）'}, 按钮=${mounted.createButtons ?? 0}`
      )
      if (!mounted.ok) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }

      // ---------- 95.2 取消对话框：页面必须留着、且不产生错误提示 ----------
      const opened = await openCreateDialog()
      record(M, '95.2 前置: 点击「新建看板」后输入框弹出（交互确实发生）', opened.ok, `耗时 ${opened.ms}ms`)
      const opened2 = opened.ok ? opened : await openCreateDialog()
      await page.keyboard.press('Escape').catch(() => {})
      const closed = await pollUntil(async () => ({ ok: !(await snapshot()).boxOpen }), { timeout: 8000 })
      // 聚合提示的 flush 窗口是 600ms（errorHub），等窗口过去再读，避免"还没来得及弹"被当成没弹
      await sleep(700)
      const afterCancel = await snapshot()
      const cancelMessages = afterCancel.messages.join(' | ')
      const cancelMsgCount = afterCancel.messages.length
      record(
        M,
        '95.2 取消对话框后页面未被卸载（边界计数=0 且页面仍可交互）',
        closed.ok && opened2.ok && afterCancel.boundary === 0 && afterCancel.createButtons > 0,
        `对话框已关闭=${closed.ok}, 边界计数=${afterCancel.boundary}, 按钮=${afterCancel.createButtons}`
      )
      record(
        M,
        '95.2b 取消不是错误：不得弹出任何提示',
        cancelMsgCount === 0,
        `提示条数=${cancelMsgCount}, 文本=${cancelMessages.slice(0, 120) || '（无）'}`
      )

      // ---------- 95.3 取消之后仍可交互（组件没死，而不是只剩静态 DOM） ----------
      const reopen = await openCreateDialog()
      record(M, '95.3 取消后再次点击仍能弹出对话框（组件仍活着）', reopen.ok, `耗时 ${reopen.ms}ms`)
      if (reopen.ok) await page.keyboard.press('Escape').catch(() => {})
      await pollUntil(async () => ({ ok: !(await snapshot()).boxOpen }), { timeout: 5000 })

      // ---------- 95.4 业务失败：请求出网 + 提示可见 + 页面不卸载 ----------
      let injected = 0
      const boardApi = (url) => url.pathname.endsWith('/tool/report-board')
      await page.route(boardApi, async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        injected += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 500, msg: 'e2e95 注入的业务失败（不是后端故障）' })
        })
      })
      const opened3 = await openCreateDialog()
      if (opened3.ok) {
        await page
          .locator('.el-message-box__input input')
          .first()
          .fill(`e2e95-${Date.now()}`)
          .catch(() => {})
        await page
          .locator(CONFIRM_BTN)
          .first()
          .click({ timeout: 8000 })
          .catch(() => {})
      }
      // 提示文本不写死为注入的 msg：`errorCode[500]` 有自己的通用文案，拦截器优先用它。
      // 这里判的语义是"用户得到了提示"（条数 ≥1），具体文本只进凭证。
      const failed = await pollUntil(
        async () => {
          const s = await snapshot()
          return {
            ok: injected >= 1 && s.messages.length >= 1,
            boundary: s.boundary,
            messages: s.messages.join(' | ')
          }
        },
        { timeout: 12000 }
      )
      await page.unroute(boardApi).catch(() => {})
      const afterFailure = await snapshot()
      record(M, '95.4a 业务失败请求确已出网（注入计数 ≥1，证明点击落地）', injected >= 1, `注入计数=${injected}`)
      record(
        M,
        '95.4b 业务失败提示可见（拦截器统一通道，条数 ≥1）',
        failed.ok,
        `耗时 ${failed.ms}ms, 提示=${(failed.messages || '').slice(0, 120) || '（无）'}`
      )
      record(
        M,
        '95.4c 业务失败后页面未被卸载（边界计数=0）',
        afterFailure.boundary === 0 && afterFailure.createButtons > 0,
        `边界计数=${afterFailure.boundary}, 按钮=${afterFailure.createButtons}, path=${afterFailure.path}`
      )
      // 95.5 失败之后仍可交互：这是"页面没死"的第二向证据
      const reopenAfterFailure = await openCreateDialog()
      record(
        M,
        '95.5 失败后仍能再次打开对话框（页面未被冻结）',
        reopenAfterFailure.ok,
        `耗时 ${reopenAfterFailure.ms}ms`
      )
      if (reopenAfterFailure.ok) await page.keyboard.press('Escape').catch(() => {})
    } catch (err) {
      record(M, '95.9 异常收口', false, `异常: ${String(err && err.message).slice(0, 160)}`)
    } finally {
      await context.close().catch(() => {})
      consoleErrors.push(...ce)
      pageErrors.push(...pe)
      checkConsoleErrors(consoleErrors, pageErrors, M)
    }
  }
}
