/**
 * 模块 98（b144）：**编辑**对话框的详情读失败 ⇒ 不得打开空表单，且不得卸载整页。
 *
 * ## 立的案
 *
 * `views/report/dataset/index.vue::openEdit` 原先是 `await getDataset(id)` 之后**无条件**
 * `editOpen.value = true`，而这条 await 没有任何 catch：
 * - 一次 5xx 让拒绝逸出到 ErrorBoundary ⇒ 用户看到「页面加载失败」（r44 同型，M95 已在
 *   建看板链上立过案，但**表单类**入口是另一个断面：这里丢掉的是"正在编辑哪一条"的身份）；
 * - 更坏的是"异常被吞掉但对话框照常打开"这一支：表单是空模板，用户看不见"SQL 没取到"，
 *   按下保存就等于把一条真实数据集的名称/SQL 覆盖成空 —— **读失败必须落在"不进入编辑态"**，
 *   而不只是落在"有提示"。
 * 同一形状在 `views/flow/designer/index.vue::openEdit` 是第二副样子（读失败后 `mode` 仍切到
 * 'edit'，画布空着而用户以为自己在改原流程）。
 *
 * ## 为什么这条必须由浏览器判
 *
 * 两条静态锁已经把"接线"钉住（`asyncApiRejection.guard` 的第二腿：模板绑定的处理器体内
 * await 请求层不得逸出；`latestRequest.guard`：票据 begin/isCurrent/invalidate 三处齐备），
 * 且都对这两个文件做了差异法活性。但**静态锁判的是"有没有 catch"，不是"失败之后屏幕上
 * 是什么"**——把 `editOpen.value = true` 挪进 catch 里，两条锁照常全绿，而用户拿到的是
 * 一个空表单。"不打开对话框"这件事只能构造一次失败、点一次按钮、看屏幕上有没有对话框。
 *
 * ## 七条判据（各配反向对照）
 *
 * ① 夹具自建自清：数据集按 `e2e-98-` 命名（`residue-cleanup` 的 `dataset_name LIKE 'e2e%'`
 *    是第二道兜底），删除前先在列表查回 ⇒ **不存在就不再删**（b130 教训：无条件 DELETE 会
 *    造出一条 404 失败写，被 operlog 判据抓成"未登记"）；
 * ② 注入 HTTP 200 + `body.code=500`（业务码失败走同一条前端 reject 通道，且不产生
 *    Chromium 的 `Failed to load resource … 500` console 噪声——那会让判据自己成为噪声源）；
 * ③ **请求确实出网**（详情请求计数增量 ≥1）——"点了没弹框"和"按钮坏了"在 DOM 上同形，
 *    只有出网计数能区分（AGENTS 前端归一 §3③）；
 * ④ 失败后**对话框不得打开**（`.el-dialog:visible` 计数 = 0）；
 * ⑤ 失败后页面**不得被卸载**（`.error-boundary` = 0）且**必须有可见提示**（拦截器统一通道，
 *    条数 ≥1；文本只进凭证不写死——`errorCode[500]` 有它自己的通用文案）；
 * ⑥ **对照组**：撤掉注入后点同一个按钮 ⇒ 对话框打开、且编码/名称输入框的值就是夹具的真值
 *    （读 `input.value` 而不是 `innerText`——输入框的值不在文本里；回显对账是 AGENTS ⑭ 的
 *    "表单类点击必须判到值落到 model 上"）；这一条同时证伪"④ 是因为按钮永远失灵"；
 * ⑦ 失败态不得污染成功态：④ 之后再点一次必须正常（不留"永久禁用"的假修复）。
 *
 * ## 已登记的边界
 *
 * 流程设计器那一处在**本模块里不判**：它的失败结局是"留在列表视图"，与这里"不打开对话框"
 * 是同一条契约的第二个视图，但它的编辑面是整块画布切换（`mode`），浏览器判它需要再造一枚
 * 流程夹具并处理未保存守卫；本批由 `asyncApiRejection.guard` + `latestRequest.guard` 的
 * 逐站点接线与差异法活性覆盖（台账 b144 记为 N-144-E）。
 *
 * ## 盘上变异定性（三条腿不是等价物，逐条实测过）
 *
 * - **B｜删掉 catch 里的 `return`**（失败照常进入编辑态，即本批修的缺陷形状）⇒ `98.4` 红，
 *   凭证是 `可见对话框=1«新增»`——标题"新增"就是最直白的证据：用户以为自己在改第 517 号数据集，
 *   屏幕上开的是一张**空的新建表单**，按下保存就把真实数据集的名称/SQL 覆盖掉。
 *   `98.6 / 98.7` 连带红（模态框挡住了下一次按下），这是同一事故的下游，不是第三条独立腿。
 * - **C｜把 `return` 换成 `throw e`**（回到 b144 之前的"拒绝逸出"）⇒ **三条都不红**。
 *   这不是判据失效，而是同一契约现在有**两层**实现：页面级 catch 之外，`ErrorBoundary` 自 b103
 *   起按 `utils/requestError` 的标记把"请求层失败"排除在卸载之外，所以拒绝逸出后页面仍活着、
 *   拦截器的提示仍在。**判红的是"用户看得见的结局"，不是"某一句 catch 在不在"**——所以这一条
 *   按实登记为 98.5 的边界（它防的是"未来有人把非请求层异常也抛进这条链"那一型），而"拒绝逸出
 *   卸载整页"那一型由 M95 在建看板链上判（那里的处理器刻意不写 catch，是活体探针）。
 * - **首跑的两个洞都在判据自己身上**（都由真跑暴露，不是想出来的）：① 行内按钮的 zh 标签是
 *   「修改」而不是「编辑」，选择器永远命不中 ⇒ `98.4` 反而**照常绿**（没点＝没打开），
 *   这就是把"点击落地"做成独立判据 98.3 的理由；② `page.route()` 的 RegExp 匹配的是
 *   **绝对 URL**，与计数通道用的 `pathname` 不是一个形状，共用一份 `^\/…$` 会让注入结构性失效，
 *   三条结论同时指向"产品坏了"而真相是"故障从没被注入过"。
 */

/**
 * 详情请求的 URL 形状：只认 `GET /report/dataset/{id}`，不含 `/list` 与 `/{id}/sql`。
 *
 * ⚠ **同一个"是哪条请求"要写两份正则，而且两份的形状刻意不同**：
 * `page.route()` 的 RegExp 拿去匹配的是 `request.url()`（**绝对 URL**，`http://host/report/dataset/514`），
 * 而计数通道拿的是 `new URL(req.url()).pathname`（**路径**）。第一版只写了一份、两头共用，
 * 于是 `^\/report...` 在绝对 URL 上**结构上永远打不中** ⇒ 注入从不生效，详情请求照常成功，
 * 屏幕上对话框打开了，判据红在"对话框不得打开"这一条上（首跑实测 98.4 `可见对话框=1`、
 * 98.5 `提示条数=0`、98.6 `请求增量=0` 而输入框已回填真值——三条一起看才定性得出"注入没生效"，
 * 单看任何一条都像产品缺陷）。这与前言 ㉓"夹具的形状必须等于生产码真实产出的形状"同族：
 * **判据喂给第三方 API 的正则，形状由那个 API 的匹配输入决定，不由我们的直觉决定**。
 * 与前言 ㉕ 那条 workbox `RegExpRoute` 拿 `request.url` 匹配是同一个洞的第二个断面。
 */
const DETAIL_PATH_RE = /^\/report\/dataset\/\d+$/
/** 给 `page.route()` 用：锚在结尾即可（`/sql` 与 `/list` 都以非数字收尾），**不得**锚在开头 */
const DETAIL_URL_RE = /\/report\/dataset\/\d+(?:\?[^/]*)?$/

export function makeEditDetailFailureTest(ctx) {
  const { record, log, CONFIG, checkConsoleErrors, sleep, dismissTour, clickButton, getApiToken } = ctx

  return async function testModule98(page, consoleErrors, pageErrors) {
    const M = 98
    log(`\n=== 模块 ${M}: 编辑对话框的详情读失败（不得开空表单 / 不得卸载整页）===`)

    const token = await getApiToken().catch(() => null)
    if (!token) {
      record(M, '98.0 前置: API 取 token', false, 'getApiToken() 返回空 ⇒ 本模块无从执行（工具自曝，不是产品缺陷）')
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    /** 只走 API 的取数/写数通道：返回 {status, json}，非 JSON 时 json=null（由调用方按 status 判） */
    const call = async (method, path, body) => {
      try {
        const r = await fetch(`${CONFIG.backendUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body)
        })
        const text = await r.text()
        let json = null
        try {
          json = JSON.parse(text)
        } catch {
          /* 非 JSON 由调用方按 status/raw 判 */
        }
        return { status: r.status, json, raw: text.slice(0, 200) }
      } catch (e) {
        return { status: 0, json: null, raw: `fetch 异常 ${e.message}` }
      }
    }

    async function pollUntil(fn, { timeout = 8000, every = 200 } = {}) {
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
     * 一次 evaluate 读全：边界 / 可见对话框数与其标题 / 提示文本 / 当前路径。
     *
     * 标题必须一起读：`可见对话框=1` 这一句不足以定性——是编辑框开了，还是别的框（试跑预览、
     * 确认框）开着，动作完全不同（前言 ⑨「凡是缺失类报错都要带上当前口径」在同一判据上的落地）。
     */
    async function snapshot() {
      return page
        .evaluate(() => {
          const boundary = document.querySelectorAll('.error-boundary').length
          const visible = [...document.querySelectorAll('.el-dialog')].filter((el) => el.getClientRects().length > 0)
          const dialogTitles = visible
            .map((el) => {
              const head = el.querySelector('.el-dialog__title') || el.querySelector('.el-dialog__header')
              return (
                String((head && head.innerText) || '')
                  .trim()
                  .slice(0, 24) || '（无标题）'
              )
            })
            .join(' | ')
          const messages = [...document.querySelectorAll('.el-message')].map((e) => String(e.innerText || ''))
          return { boundary, dialogs: visible.length, dialogTitles, messages, path: location.pathname }
        })
        .catch(() => ({ boundary: -1, dialogs: -1, dialogTitles: '', messages: [], path: '' }))
    }

    /** EP 的 message 3 秒自消：读取时刻写死会把"弹过"读成"没弹"，所以采样期内并集去重 */
    async function sampleMessages(ms = 3600) {
      const seen = []
      const until = Date.now() + ms
      while (Date.now() < until) {
        const s = await snapshot()
        for (const t of s.messages) if (t && !seen.includes(t)) seen.push(t)
        await sleep(200)
      }
      return seen
    }

    const uniq = Date.now().toString(36)
    const code = `e2e-98-ds-${uniq}`
    const name = `e2e-98 数据集 ${uniq}`
    let datasetId = null
    let deleted = false

    // 详情请求计数：只认这一条链，`/list`、`/{id}/sql` 都不计
    let reqCount = 0
    const onRequest = (req) => {
      if (DETAIL_PATH_RE.test(new URL(req.url()).pathname)) reqCount += 1
    }
    let injectFailed = false
    const onRoute = async (route) => {
      const req = route.request()
      // 拦截面必须与计数面**同一谓词**：`DETAIL_URL_RE` 按绝对 URL 匹配，
      // `DELETE /report/dataset/{id}`（夹具回收）同样落在它里面——异常路径上 `injectFailed`
      // 可能还没复位，那时把删除请求换成 200 JSON 会让夹具留在库里（判据自己造残留）。
      if (!injectFailed || req.method() !== 'GET' || !DETAIL_PATH_RE.test(new URL(req.url()).pathname)) {
        return route.continue()
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 500, msg: 'e2e98 注入的详情读取失败（不是后端故障）' })
      })
    }
    /**
     * 行内「修改」按下（双语标签 + 固定列的 elementFromPoint 遮挡，走共用的落地重试通道）。
     *
     * ⚠ 标签取 **`修改`**：本仓 `common.edit` 的 zh 值是「修改」而不是「编辑」（en 才是 Edit），
     * 首跑按字面写「编辑」⇒ 选择器结构上永远命不中，`按下=false / 增量=0`，
     * 而 98.4「对话框没打开」照常判绿——正是 AGENTS 前言 ⑭「请求数=0 必须 AND 点击真的落地」
     * 立的那一族。所以这里把"点击落地"做成 98.3 的独立判据，而不是把 98.4 单独当结论。
     */
    const EDIT_LABELS = ['修改', 'Edit']
    const pressEditOnRow = async () =>
      clickButton(
        page,
        EDIT_LABELS.map((label) => `.el-table__row:has-text("${code}") button:has-text("${label}")`).join(', ')
      )

    try {
      // ---------- 98.1 夹具：建数据集并查回主键 ----------
      const add = await call('POST', '/report/dataset', {
        datasetCode: code,
        datasetName: name,
        sqlTemplate: 'SELECT 1 AS v',
        status: '0'
      })
      const listed = await call(
        'GET',
        `/report/dataset/list?pageNum=1&pageSize=50&datasetName=${encodeURIComponent(name)}`
      )
      const hit = (listed.json?.rows || []).find((r) => String(r.datasetCode) === code)
      datasetId = hit?.datasetId ?? null
      record(
        M,
        '98.1 前置: 数据集夹具创建并可查回（列表按 dataset_id 降序，首屏可见）',
        add.status === 200 && add.json?.code === 200 && datasetId != null,
        `add=${add.status}/${add.json?.code} / list=${listed.status} / id=${datasetId}`
      )
      if (datasetId == null) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }

      // ---------- 98.2 页面挂载 + 夹具行可见 ----------
      await page
        .goto(`${CONFIG.frontendUrl}/system/reportDataset`, { waitUntil: 'load', timeout: 30000 })
        .catch(() => {})
      await dismissTour(page)
      page.on('request', onRequest)
      await page.route(DETAIL_URL_RE, onRoute)
      const rowSeen = await pollUntil(
        async () => {
          const ok = await page
            .locator(`.el-table__row:has-text("${code}")`)
            .first()
            .isVisible()
            .catch(() => false)
          return { ok }
        },
        { timeout: 15000 }
      )
      const mounted = await snapshot()
      record(
        M,
        '98.2 数据集页已挂载且夹具行可见（编辑入口可定位）',
        rowSeen.ok && mounted.boundary === 0,
        `行可见=${rowSeen.ok}（落定 ${rowSeen.ms}ms）/ 边界计数=${mounted.boundary} / path=${mounted.path}`
      )
      if (!rowSeen.ok || mounted.boundary !== 0) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }

      // ---------- 98.3–98.5 注入失败 ⇒ 出网 / 不开框 / 不卸载 + 有提示 ----------
      injectFailed = true
      const before = reqCount
      const pressed = await pressEditOnRow()
      const sent = await pollUntil(async () => ({ ok: reqCount > before }), { timeout: 6000 })
      const toasts = await sampleMessages()
      const afterFail = await snapshot()
      injectFailed = false
      record(
        M,
        '98.3 点「修改」后详情请求确已出网（计数增量 ≥1，证明点击落地而不是按钮失灵）',
        pressed && sent.ok,
        `按下=${pressed} / 增量=${reqCount - before} / 落定 ${sent.ms}ms`
      )
      record(
        M,
        '98.4 详情读失败 ⇒ 编辑对话框不得打开（空表单不可被保存＝不覆盖真实数据集）',
        // ⚠ **必须同时判"页面还活着"**（变异 D 实测抓出的洞）：整页被 ErrorBoundary 接管时
        // `对话框数` 同样是 0 —— 一条否定式断言会被"被测对象已不存在"满足（前言 ⑭ 的同一族，
        // 那里是"请求数=0 与按钮失灵同形"，这里是"没有对话框与没有页面同形"）。
        // 所以这一条的语义是"在活页上没进入编辑态"，不是"屏幕上数不出框"。
        afterFail.dialogs === 0 && afterFail.boundary === 0,
        `可见对话框=${afterFail.dialogs}«${afterFail.dialogTitles}» / 边界计数=${afterFail.boundary} / path=${afterFail.path}`
      )
      record(
        M,
        '98.5 详情读失败 ⇒ 页面未被卸载（.error-boundary=0）且有可见提示',
        afterFail.boundary === 0 && toasts.length >= 1,
        `边界计数=${afterFail.boundary}, 提示条数=${toasts.length}, 文本=«${toasts.join(' | ').slice(0, 120)}»`
      )

      // ---------- 98.6 对照组：撤掉注入后同一按钮必须真的打开并回填真值 ----------
      const beforeOk = reqCount
      const pressed2 = await pressEditOnRow()
      const opened = await pollUntil(
        async () => {
          const s = await snapshot()
          // 同一拍里既要"这次真的重发了详情请求"，又要"对话框可见"——分开两次读会让
          // 上一条遗留的开框满足后者（首跑就是这样把 98.6 读成"打开=true / 增量=0"的）。
          return { ok: s.dialogs > 0 && reqCount > beforeOk, ...s }
        },
        { timeout: 8000 }
      )
      let codeVal = ''
      let nameVal = ''
      if (opened.ok) {
        const dlg = page.locator('.el-dialog:visible').last()
        codeVal = String(
          await dlg
            .locator('input')
            .nth(0)
            .inputValue()
            .catch(() => '')
        )
        nameVal = String(
          await dlg
            .locator('input')
            .nth(1)
            .inputValue()
            .catch(() => '')
        )
      }
      record(
        M,
        '98.6 对照组: 撤故障后点「修改」⇒ 详情请求重发、对话框打开且编码/名称回显为夹具真值',
        // `reqCount - beforeOk >= 1` 是**承重的一条**：只判"对话框打开了"会被上一条留下的
        // 开框满足（首跑实测 `打开=true / 请求增量=0`——注入没生效时对话框早在 98.4 前就开了）。
        // 对照组必须证明"这一次点击自己走完了整条链"，否则 ⑥ 只是复读 ④ 的状态。
        pressed2 && reqCount - beforeOk >= 1 && opened.ok && codeVal === code && nameVal === name,
        `按下=${pressed2} / 打开=${opened.ok} / 请求增量=${reqCount - beforeOk} / ` +
          `编码=«${codeVal}» / 名称=«${nameVal}» / 落定 ${opened.ms}ms`
      )

      // ---------- 98.7 失败态不污染成功态：关掉对话框后列表仍可用 ----------
      if (opened.ok) {
        const closeBtn = page.locator('.el-dialog:visible .el-dialog__headerbtn').last()
        if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {})
        else await page.keyboard.press('Escape').catch(() => {})
      }
      const settled = await pollUntil(
        async () => {
          const s = await snapshot()
          return { ok: s.dialogs === 0 && s.boundary === 0, ...s }
        },
        { timeout: 6000 }
      )
      const listStillVisible = await page
        .locator(`.el-table__row:has-text("${code}")`)
        .first()
        .isVisible()
        .catch(() => false)
      record(
        M,
        '98.7 关闭后回到列表确定态（对话框已关、页面未卸载、行仍可定位）',
        settled.ok && listStillVisible,
        `对话框=${settled.dialogs} / 边界=${settled.boundary} / 行可见=${listStillVisible} / 落定 ${settled.ms}ms`
      )

      // ---------- 98.8 夹具回收：先查在不在，再删（不做无条件 DELETE） ----------
      if (datasetId != null) {
        const still = await call(
          'GET',
          `/report/dataset/list?pageNum=1&pageSize=50&datasetName=${encodeURIComponent(name)}`
        )
        const exists = (still.json?.rows || []).some((r) => String(r.datasetCode) === code)
        if (exists) {
          const del = await call('DELETE', `/report/dataset/${datasetId}`)
          deleted = del.status === 200 && del.json?.code === 200
        } else {
          deleted = true
        }
        const recheck = await call(
          'GET',
          `/report/dataset/list?pageNum=1&pageSize=50&datasetName=${encodeURIComponent(name)}`
        )
        const left = (recheck.json?.rows || []).filter((r) => String(r.datasetCode) === code).length
        record(
          M,
          '98.8 夹具清理: 数据集已删除且列表复核无残留',
          deleted && left === 0,
          `原本存在=${exists} / 删除=${deleted} / 残留行数=${left}`
        )
      }
    } catch (err) {
      record(M, '98.9 模块自身异常（不得洗成通过）', false, `异常: ${String(err && err.message).slice(0, 160)}`)
    } finally {
      page.off('request', onRequest)
      await page.unroute(DETAIL_URL_RE).catch(() => {
        log('  ⚠ 98 收尾: page.unroute 未生效（runner 为本模块新建页面，不外溢）')
      })
      if (datasetId != null && !deleted) {
        // 兜底：异常路径上没走到 98.8 时仍然回收（residue-cleanup 的 `dataset_name LIKE 'e2e%'` 是第二道）
        const del = await call('DELETE', `/report/dataset/${datasetId}`).catch(() => null)
        log(`  ℹ 98 兜底回收: datasetId=${datasetId} status=${del?.status ?? 'fetch 失败'}`)
      }
      checkConsoleErrors(consoleErrors, pageErrors, M)
    }
  }
}
