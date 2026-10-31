/**
 * 模块 97：公告详情抽屉的「失败 / 空 / 成功」三分（批一百四十二 项 F3 的浏览器那一半）。
 *
 * ## 立的案
 *
 * `HeaderNotice/DetailView.vue` 原先把任何失败都收成 `detail = null`，而模板把 `null`
 * 渲染成「暂无数据」——一次网络故障被读成"这条公告没有正文"，且没有任何重试入口。
 * 单元判据（`src/layout/components/HeaderNotice/detailView.test.ts`）钉住了三条分支，
 * 但"抽屉在真实布局里能不能打开、失败时屏幕上到底是什么"只有浏览器能证明。
 *
 * ## 五条硬要求（缺任一条实现都能另一半全绿）
 *
 * ① 成功路径必须是对照（失败分支插在 `v-if` 链最前面，把 `v-else-if` 链写坏时最先坏的就是它）；
 * ② 失败态**构造出来**：注入 HTTP 200 + `body.code=500`（业务码失败走同一条前端 reject 通道，
 *    且不产生 Chromium 的 `Failed to load resource … 500` console 噪声——那是判据自己制造的
 *    噪声源，与 b69"遥测刷爆操作日志"同族）；
 * ③ 失败必须显示「公告详情加载失败」且**不得**显示「暂无数据」（文案按双语态取）；
 * ④ 点重试必须**真的重发请求**（请求计数增量 ≥1）——"按钮点了没报错"不是证据；
 * ⑤ 撤掉注入后再重试必须恢复正文且失败条消失（"失败态永不消失"的实现过不了这一条）；
 * ⑥ （b143）把响应换成一整张 **HTML 200**（同源兜底/反代配置错误的形态）时，
 *    抽屉必须落失败态 + 用户可见提示，且页面不得被整页卸载 —— 改造前拦截器把
 *    字符串 data 的 `data.code || 200` 读成 200，失败会被静默读成"空正文"。
 *
 * 夹具自包含：公告按 `e2e97<ts>` 命名并在模块内删除。
 */

/** 空态与失败态文案的双语形（zh-CN / en-US） */
const FAILED_TEXTS = ['公告详情加载失败', 'Failed to load the notice detail']
const EMPTY_TEXTS = ['暂无数据', 'No data']
/** b143：HTML 200 被拦下后的用户可见提示（zh-CN / en-US 双语形） */
const HTML_FAILED_TEXTS = ['服务返回了网页而不是数据', 'returned a web page instead of data']

export function makeNoticeDetailFailureTest(ctx) {
  const { record, log, CONFIG, checkConsoleErrors, sleep, dismissTour, clickButton } = ctx

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

  const hasAny = (text, list) => list.some((k) => String(text).includes(k))

  /** 抽屉状态一次读清：EP 关闭后节点仍在 DOM（innerText 为空串），所以"可见"按文本与 rect 判 */
  async function drawerState(page) {
    return page
      .evaluate(() => {
        const el = document.querySelector('.notice-detail-drawer')
        if (!el) return { exists: false, visible: false, text: '' }
        const visible = el.getClientRects().length > 0
        return { exists: true, visible, text: visible ? String(el.innerText || '') : '' }
      })
      .catch(() => ({ exists: false, visible: false, text: '' }))
  }

  return async function testModule97(page, consoleErrors, pageErrors) {
    const M = 97
    log(`\n=== 模块 ${M}: 公告详情抽屉 失败/空/成功三分 ===`)
    const B = CONFIG.backendUrl
    const ts = Date.now().toString(36)
    const title = `E2E97公告${ts}`
    const contentMarker = `e2e97-content-${ts}`

    const token = await ctx.getApiToken()
    if (!token) {
      record(M, '前置: API 取 token', false, 'getApiToken() 返回空 ⇒ 本模块无从执行（工具/环境自曝，不是产品缺陷）')
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }
    const call = async (method, path, body) => {
      try {
        const r = await fetch(`${B}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body)
        })
        const text = await r.text()
        let json = null
        try {
          json = JSON.parse(text)
        } catch {
          /* 非 JSON 由调用方按 raw 判 */
        }
        return { status: r.status, json, raw: text.slice(0, 200) }
      } catch (e) {
        return { status: 0, json: null, raw: `fetch 异常 ${e.message}` }
      }
    }

    let noticeId = null
    const urlPredicate = /\/system\/notice\/\d+(\?.*)?$/
    // 注入档：'off' 真请求 / 'biz' 业务码失败 / 'html' 一张 HTML 200（b143）
    let injectMode = 'off'
    let reqCount = 0
    const onRequest = (req) => {
      if (urlPredicate.test(new URL(req.url()).pathname)) reqCount += 1
    }
    const onRoute = async (route) => {
      if (injectMode === 'biz') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 500, msg: 'e2e97 注入的业务失败（不是后端故障）' })
        })
        return
      }
      if (injectMode === 'html') {
        // b143：一整张 HTML + 200。改造前前端把它当字符串 data，`data.code || 200` 恒 200。
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!DOCTYPE html><html><body><div id="app">SPA index</div></body></html>'
        })
        return
      }
      return route.continue()
    }

    try {
      // ===== 前置：建一条真实公告（类型 2 = 公告，与横幅同一 type） =====
      const add = await call('POST', '/system/notice', {
        noticeTitle: title,
        noticeType: '2',
        noticeContent: `<p>${contentMarker}</p>`,
        status: '0'
      })
      const listed = await call(
        'GET',
        `/system/notice/list?pageSize=20&status=0&noticeType=2&noticeTitle=${encodeURIComponent(title)}`
      )
      const hit = (listed.json?.rows || []).find((x) => String(x.noticeTitle) === title)
      noticeId = hit?.noticeId ?? null
      record(
        M,
        '97.0 前置: 公告夹具创建并可查回',
        add.status === 200 && noticeId != null,
        `add=${add.status} / id=${noticeId} / list=${listed.status}`
      )
      if (noticeId == null) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }

      // 请求计数只认"抽屉自己的详情请求"：`/system/notice/list`、`/listTop`、`/read` 都不匹配
      page.on('request', onRequest)
      await page.route(urlPredicate, onRoute)

      const openBell = async () => {
        const itemVisible = await page
          .locator('.notice-item')
          .first()
          .isVisible()
          .catch(() => false)
        if (itemVisible) return true
        // 铃铛是 hover 打开、click 反而切回关闭（`onNoticeEnter` 置 true、`toggleNotice` 取反），
        // 而 Playwright 的 click 先移入鼠标再按下 ⇒ 用 click 打开必然自己把自己关掉（本模块首跑实测）。
        await page
          .locator('.notice-trigger')
          .hover()
          .catch(() => {})
        return (
          await pollUntil(
            async () => ({
              ok: await page
                .locator('.notice-item')
                .first()
                .isVisible()
                .catch(() => false)
            }),
            { timeout: 8000 }
          )
        ).ok
      }

      /**
       * 点开公告并把抽屉等到可见，最多按 3 次。
       *
       * 为什么允许重按：`previewNotice` 先 `await markRead`（未读时发一次 POST），
       * 列表项随之从"未读"重渲染——Playwright 的按下可能落在这个重渲染的缝里，
       * 事件派发了却没有处理器接收。重按不放松判据：仍只认"抽屉真的可见"（DOM 事实）。
       */
      const openDrawer = async ({ maxPresses = 3 } = {}) => {
        const presses = []
        for (let i = 0; i < maxPresses; i++) {
          await openBell()
          const landed = await clickButton(page, `.notice-item:has-text("${title}")`)
          const st = await pollUntil(
            async () => {
              const s = await drawerState(page)
              return { ok: s.visible, ...s }
            },
            { timeout: 6000 }
          )
          presses.push(`#${i + 1} 落地=${landed} 抽屉=${st.ok} 落定 ${st.ms}ms`)
          if (st.ok) return { ok: true, presses }
        }
        return { ok: false, presses }
      }

      await page.goto(`${CONFIG.frontendUrl}/index`, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await dismissTour(page)
      const bellOk = await openBell()
      const itemOk = await page
        .locator('.notice-item')
        .filter({ hasText: title })
        .first()
        .isVisible()
        .catch(() => false)
      record(M, '97.1 铃铛弹出层里出现夹具公告', bellOk && itemOk, `铃铛=${bellOk} / 命中夹具=${itemOk}`)
      if (!itemOk) {
        checkConsoleErrors(consoleErrors, pageErrors, M)
        return
      }

      // ===== ① 成功路径（对照）：点公告 ⇒ 抽屉打开且标题/正文都在 =====
      const opened = await openDrawer()
      const okState = opened.ok
        ? await pollUntil(
            async () => {
              const s = await drawerState(page)
              return { ok: s.visible && s.text.includes(title) && s.text.includes(contentMarker), ...s }
            },
            { timeout: 8000 }
          )
        : { ok: false, text: '', ms: 0 }
      record(
        M,
        '97.2 成功路径: 点公告 ⇒ 抽屉打开且标题/正文渲染（对照组）',
        okState.ok,
        `${opened.presses.join(' ｜ ')} / 正文片段=${String(okState.text || '').slice(0, 60)}`
      )

      // 关掉抽屉（EP 的关闭按钮），并等它真的不可见
      await clickButton(page, '.notice-detail-drawer .el-drawer__close-btn')
      const closed = await pollUntil(async () => {
        const s = await drawerState(page)
        return { ok: !s.visible, ...s }
      })
      record(M, '97.3 关闭后抽屉不可见（重开前的前置）', closed.ok, `落定 ${closed.ms}ms`)

      // ===== ② 注入业务失败 ⇒ 失败文案可见、且不得显示「暂无数据」 =====
      injectMode = 'biz'
      const before = reqCount
      const failedOpened = await openDrawer()
      const failState = failedOpened.ok
        ? await pollUntil(
            async () => {
              const s = await drawerState(page)
              return { ok: s.visible && hasAny(s.text, FAILED_TEXTS), ...s }
            },
            { timeout: 8000 }
          )
        : { ok: false, visible: false, text: '', ms: 0 }
      const sentAfterFail = reqCount - before
      const noEmpty = !hasAny(failState.text, EMPTY_TEXTS)
      record(
        M,
        '97.4 详情请求失败 ⇒ 抽屉显示「加载失败」且不得显示「暂无数据」',
        failState.ok && noEmpty && sentAfterFail >= 1,
        `可见=${failState.visible} / 失败文案=${failState.ok} / 无空态=${noEmpty} / 请求增量=${sentAfterFail}` +
          ` / 文案=«${String(failState.text || '').slice(0, 80)}»`
      )

      // ===== ③ 失败态下点重试 ⇒ 必须真的重发请求（仍注入失败） =====
      const beforeRetry = reqCount
      const pressed = await clickButton(page, '.notice-detail-drawer button:has-text("重试")')
      const resent = await pollUntil(async () => ({ ok: reqCount > beforeRetry }), { timeout: 5000 })
      record(
        M,
        '97.5 失败态点重试 ⇒ 真的重发详情请求',
        pressed && resent.ok,
        `按下=${pressed} / 增量=${reqCount - beforeRetry} / 落定 ${resent.ms}ms`
      )

      // ===== ③b（b143）：HTML 200 ⇒ 必须被拦成失败，不得当成功读空数据 =====
      injectMode = 'html'
      const beforeHtml = reqCount
      const htmlToasts = []
      const toastPoll = (async () => {
        for (let i = 0; i < 16; i++) {
          const got = await page
            .evaluate(() => [...document.querySelectorAll('.el-message')].map((e) => String(e.innerText || '')))
            .catch(() => [])
          for (const t of got) if (!htmlToasts.includes(t)) htmlToasts.push(t)
          await sleep(250)
        }
      })()
      await clickButton(page, '.notice-detail-drawer button:has-text("重试")')
      await pollUntil(async () => ({ ok: reqCount > beforeHtml }), { timeout: 5000 })
      await toastPoll
      const htmlState = await drawerState(page)
      const htmlFailed = htmlState.visible && hasAny(htmlState.text, FAILED_TEXTS)
      const htmlNoEmpty = !hasAny(htmlState.text, EMPTY_TEXTS)
      const toastHit = htmlToasts.some((t) => hasAny(t, HTML_FAILED_TEXTS))
      const alive = await page
        .evaluate(() => !!(document.querySelector('#app') && document.querySelector('#app').children.length))
        .catch(() => false)
      record(
        M,
        '97.6 HTML 200 冒充成功的响应 ⇒ 落失败态 + 用户可见提示 + 页面不卸载（b143）',
        reqCount > beforeHtml && htmlFailed && htmlNoEmpty && toastHit && alive,
        `增量=${reqCount - beforeHtml} / 失败态=${htmlFailed} / 无空态=${htmlNoEmpty} / 提示命中=${toastHit} / 页面存活=${alive}` +
          ` / 提示=«${htmlToasts.join(' | ').slice(0, 120)}»`
      )
      // 回到业务失败档，让下一条（撤故障恢复）从确定状态出发
      injectMode = 'biz'

      // ===== ④ 撤掉注入后再重试 ⇒ 正文出现、失败条消失（两向） =====
      injectMode = 'off'
      const beforeOk = reqCount
      await clickButton(page, '.notice-detail-drawer button:has-text("重试")')
      const recovered = await pollUntil(
        async () => {
          const s = await drawerState(page)
          return {
            ok: s.visible && s.text.includes(contentMarker) && !hasAny(s.text, FAILED_TEXTS),
            ...s
          }
        },
        { timeout: 10000 }
      )
      record(
        M,
        '97.7 撤故障后重试 ⇒ 正文恢复且失败态消失（失败态由事实驱动）',
        recovered.ok && reqCount > beforeOk,
        `可见=${recovered.visible} / 增量=${reqCount - beforeOk} / 落定 ${recovered.ms}ms` +
          ` / 正文片段=${String(recovered.text || '').slice(0, 60)}`
      )
    } finally {
      try {
        await page.unroute(urlPredicate)
      } catch {
        log('  ⚠ 97 收尾: page.unroute 未生效（runner 会为本模块新建页面，不外溢）')
      }
      page.off('request', onRequest)
      if (noticeId != null) {
        const del = await call('DELETE', `/system/notice/${noticeId}`)
        record(M, '97.8 夹具清理: 公告已删除', del.status === 200, `status=${del.status}`)
      }
    }

    checkConsoleErrors(consoleErrors, pageErrors, M)
  }
}
