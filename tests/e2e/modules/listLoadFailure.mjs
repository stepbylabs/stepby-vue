/**
 * 模块 93：列表「加载失败」与「暂无数据」的分形判据（批八十八 项 D 的浏览器那一半）。
 *
 * ## 立的案（全仓取证）
 *
 * 列表请求失败时，`request.ts` 拦截器弹一次 toast（5–6 秒后自动消失），而组合子的 catch
 * 把失败吞成空列表 ⇒ toast 没了之后，屏幕上只剩"暂无数据"。用户与判据都无法分辨
 * **"加载失败"** 与 **"真的没有数据"**——后者是正常业务态，前者需要重试入口。
 * 最严重的两处（`monitor/server` 失败后渲染成"所有值都是 -"的完整仪表盘、
 * `monitor/logtail` 拉日志失败时屏幕说"没有异常日志"）已由前端 `ListEmpty` +
 * `loadError` 收口（静态侧由 `src/utils/listEmptyLoadError.guard.test.ts` 钉住接线）。
 *
 * ## 为什么必须"造状态"而不是"看一眼"
 *
 * 本仓的铁律（门禁表前言 ④/③）：瞬时状态写成"导航后看一眼"的软断言，其结论由网络快慢决定；
 * 而"点了重试"若只判 `click()` 返回成功，遮罩/禁用/定位漂移都能让它假绿。所以四条硬要求：
 * ① 失败态**构造出来**（注入业务失败：HTTP 200 + `body.code=500`），不靠真后端偶尔 500；
 * ② 状态判据**轮询到落定**并写出耗时（不是 sleep 一次）；
 * ③ 重试必须证明**交互确实发生**：请求计数 +≥1（AGENTS 前端归一规范 §3.③），
 *    而不是"按钮点了没报错"；
 * ④ **两向都判**：撤掉注入后重试必须恢复正常数据（"失败态永不消失"的实现同样能过 ①②③）；
 *    另配合法空结果对照组（深链一个不存在的岗位编码 ⇒ 必须显示"暂无数据"且**不得**显示
 *    "加载失败"）——少了这一条，实现可以是"空列表即失败"，那与缺陷同样严重。
 *
 * 刻意用**业务码失败**而不是 HTTP 500：后者会让 Chromium 打一条 `Failed to load resource … 500`
 * 的 console 错误，把"我自己注入的故障"变成模块的 console 判红源（噪声归因错误，
 * 与 b69"遥测刷爆操作日志"同族——采集面要能分清谁制造的）。业务码失败走的是同一条前端
 * reject 通道，且不产生任何 console 噪声。
 */

const FAIL_BODY = JSON.stringify({ code: 500, msg: 'e2e93 注入的业务失败（不是后端故障）' })

/** 空态描述文案的双语形（本仓 zh 词条：加载失败 / 暂无数据；en：Failed to load / No data） */
const FAILED_TEXTS = ['加载失败', 'Failed to load']
const EMPTY_TEXTS = ['暂无数据', 'No data']
const RETRY_SELECTORS = [
  'button:has-text("重试")',
  'button:has-text("Retry")',
  '.el-empty button',
  '[data-testid="list-empty-retry"]'
]

/**
 * @param {object} ctx 由 deep-e2e 注入的共享 helpers（不 import 入口，入口 import 即执行）
 */
export function makeListLoadFailureTest(ctx) {
  const { record, log, CONFIG, checkConsoleErrors, sleep, dismissTour, clickButton } = ctx

  /** 轮询到条件成立；返回 `{ok, ms, last}`，耗时进凭证（判据不许只报结论） */
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
   * 读空态描述文案，**不等待**。
   *
   * 第一版写的是 `locator('.el-table .el-empty__description').first().innerText()`——
   * Playwright 的 locator 读法自带 actionability 等待：数据回来以后这个元素**不存在**了，
   * 于是每次读都干等满 30 秒再走 `.catch(()=>'')`（实测本轮 `落定 30007ms`）。
   * 这条等待本身就把"轮询到落定"变成了"轮询到超时"，是判据自己的时序缺陷，不是产品的。
   * 改为一次 `evaluate` 取文本：没有元素就是空串，零等待、零 30 秒 stall。
   */
  async function emptyText(page) {
    return page
      .evaluate(() => {
        const el = document.querySelector('.el-table .el-empty__description')
        return el ? String(el.innerText || '').trim() : ''
      })
      .catch(() => '')
  }

  /** 数据行条数（同样不等待：DOM 事实一次读清） */
  async function rowCount(page) {
    return page
      .evaluate(() => document.querySelectorAll('.el-table__body tbody tr.el-table__row').length)
      .catch(() => -1)
  }

  /**
   * 按下重试，最多 `maxPresses` 次，直到看见**新的列表请求**。
   *
   * 为什么允许重按而不判红：本模块首版在这里红了两次，真因**不是产品**而是点击通道的
   * "派发后重按"——`clickButton` 在 Playwright 已经打出 `click action done`（指针事件已派发）
   * 之后仍会再按第二次，对触发/切换型控件等于把结果翻回原样。该根因见台账 §4.1，
   * 修在 `clickButton` 与 `realClick` 共用的 `clickAlreadyDispatched` 上（一份规则，两处消费）。
   * 修完之后重按通道仍然留着，因为它**不放宽判据**：
   * 仍然只认"请求计数增量 > 0"这一条运行时事实（AGENTS 前端归一规范 §3.③），
   * 每次按下的落地方式、当时的遮罩、按钮中心压着什么都逐次进凭证；
   * 重按用尽仍无请求 ⇒ 照常判红，且文案能说出卡在哪一步。
   */
  async function pressUntilRequest(page, getCount, { maxPresses = 3, settleMs = 2500 } = {}) {
    const log2 = []
    let before = getCount()
    for (let i = 0; i < maxPresses; i++) {
      const probe = await retryProbe(page)
      const mask = await clearMasks(page)
      const landed = await clickButton(page, RETRY_SELECTORS.join(', '))
      const grown = await pollUntil(async () => ({ ok: getCount() > before }), { timeout: settleMs, every: 100 })
      log2.push(
        `#${i + 1} 落地=${landed ? 'click' : '未落地'} 按钮 ${probe.n} 个` +
          `${probe.first ? `（禁用=${probe.first.disabled}/压着 ${probe.first.topAtCenter}）` : ''}` +
          ` 收遮罩 ${mask.rounds} 轮（见过 ${mask.seen || '无'}） 增量 ${getCount() - before} 耗时 ${grown.ms}ms`
      )
      if (grown.ok) return { ok: true, presses: log2, delta: getCount() - before }
      before = getCount()
    }
    return { ok: false, presses: log2, delta: getCount() - before }
  }

  const hasAny = (text, list) => list.some((k) => String(text).includes(k))

  /**
   * 按下前把遮罩收干净，并把"确实见过哪个遮罩"留作凭证。
   *
   * 为什么不直接沿用一次 `dismissTour`：引导遮罩是**数据加载之后**才挂出来的（b83 §3.60.1），
   * 而 `dismissTour` 只在"300ms 内可见"时按一次 Esc ⇒ 进页面那一次必然扑空（本轮实测：
   * 重试按钮 `visible=true / disabled=false`，Playwright 的 actionability 仍等到超时，
   * `document.elementFromPoint(按钮中心)` 返回的是 `stepby-tour-mask`）。
   * 另有一条只有读源码才知道的原因：`src/components/Tour/index.vue:270` 在**输入元素聚焦时
   * 忽略 Escape**，所以按 Esc 之前必须先 `blur()`，否则这一支永远收不掉。
   * 这里不退化成 `force: true`：force 跳过 actionability 按坐标点，事件打在遮罩自己身上，
   * "点了没反应"会被记成一次成功点击（假绿，b81 N-8）。
   */
  async function clearMasks(page, rounds = 6) {
    let lastSeen = ''
    for (let i = 0; i < rounds; i++) {
      const hits = await page
        .evaluate(() =>
          Array.from(document.querySelectorAll('.el-loading-mask, .stepby-tour-mask, .el-image-viewer__wrapper'))
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => String(el.className).split(' ')[0])
        )
        .catch(() => [])
      if (!hits.length) return { cleared: i > 0, rounds: i, seen: lastSeen }
      lastSeen = Array.from(new Set(hits)).join('|')
      await page
        .evaluate(() => {
          const a = document.activeElement
          if (a && typeof a.blur === 'function') a.blur()
        })
        .catch(() => {})
      await dismissTour(page)
      await sleep(200)
    }
    return { cleared: false, rounds, seen: lastSeen }
  }

  /** 重试按钮当时的事实：个数、是否可见禁用、中心点上压着谁（红的时候要说得出被什么挡） */
  async function retryProbe(page) {
    return page
      .evaluate(() => {
        // 浏览器 DOM 的 querySelectorAll 不认 Playwright 的 `:has-text`（会直接 SyntaxError），
        // 所以这里按原生选择器取候选、再用文本过滤——与判据文案同一份词表。
        const cands = Array.from(document.querySelectorAll('.el-empty button, button'))
        const btns = cands.filter((b) => {
          if (b.offsetParent === null) return false
          const t = (b.innerText || '').trim()
          return t.includes('重试') || t === 'Retry'
        })
        const b = btns[0]
        if (!b) return { n: 0, first: null }
        const r = b.getBoundingClientRect()
        const top = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2))
        return {
          n: btns.length,
          first: {
            text: (b.innerText || '').trim().slice(0, 20),
            disabled: !!b.disabled,
            topAtCenter: top ? `${top.tagName}.${String(top.className).split(' ').slice(0, 2).join('.')}` : null
          }
        }
      })
      .catch(() => ({ n: -1, first: null }))
  }

  return async function testModule93(page, consoleErrors, pageErrors) {
    const M = 93
    log(`\n=== 模块 ${M}: 列表加载失败态与空态分形（注入业务失败 → 重试落地 → 撤故障恢复 → 合法空结果对照）===`)

    if (!page || !dismissTour || !clickButton) {
      record(
        M,
        '93.0 前置: 页面与点击/遮罩 helper 可用',
        false,
        'runner 未提供 page/dismissTour/clickButton ⇒ 无法判分形（工具自曝，不是产品缺陷）'
      )
      return
    }

    const base = CONFIG.frontendUrl
    const listPath = '/system/post/list'
    // `page.unroute` 必须传**同一个谓词引用**：换一个等价的新箭头函数删不掉原处理器，
    // 于是注入会一路跟着这个页面（本模块内后续步骤与截图复核都会被它影响）。
    const urlPredicate = (u) => String(u).includes(listPath)
    let routed = false
    let injectFail = true
    let reqCount = 0
    const onRequest = (req) => {
      try {
        if (new URL(req.url()).pathname.endsWith(listPath)) reqCount += 1
      } catch {
        /* 非 URL 形态的请求不参与计数 */
      }
    }

    try {
      page.on('request', onRequest)
      // ① 构造失败：业务码 500（HTTP 仍 200 ⇒ 不产生 console 资源错误；`clickButton` 始终
      //    带 DOM evaluate 兜底，所以每一次点击都另有一条独立的状态断言撑着，不靠返回值）
      await page.route(urlPredicate, async (route) => {
        routed = true
        if (injectFail) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: FAIL_BODY })
          return
        }
        await route.continue()
      })

      await dismissTour(page)
      await page.goto(`${base}/system/post`, { waitUntil: 'domcontentloaded' }).catch(() => {})

      // 93.0 必须在**导航之后**判：`page.route()` 装载成功不等于注入成立——处理器只在请求
      // 真的经过它时才进。第一版把这条记在 `route()` 之后、`goto()` 之前，于是 `routed` 恒为
      // false，模块 7.2 秒空跑退出（本轮实测）。装载与生效是两件事，判据判后者。
      const mounted = await pollUntil(async () => ({ ok: routed && reqCount > 0 }), { timeout: 12000 })
      record(
        M,
        '93.0 前置: 故障注入通道已挂载且真的吃到请求（route + 请求计数监听）',
        mounted.ok,
        mounted.ok
          ? `注入 HTTP 200 + body.code=500 已生效：首个请求经处理器耗时 ${mounted.ms}ms，累计计数 ${reqCount}`
          : `导航后 ${mounted.ms}ms 内 route 处理器一次都没进过（routed=${routed} / 请求计数=${reqCount}）` +
              ' ⇒ 注入不成立，本模块不作数（先查 /system/post 的列表请求路径是否仍为 ' +
              listPath +
              '）'
      )
      if (!mounted.ok) return

      // ② 失败态必须出现，且**不得**是"暂无数据"
      const failState = await pollUntil(async () => {
        const text = await emptyText(page)
        return { ok: hasAny(text, FAILED_TEXTS), text }
      })
      record(
        M,
        '93.1 加载失败时空态显示「加载失败」（轮询到落定）',
        failState.ok,
        `落定耗时 ${failState.ms}ms / 空态文案=«${String(failState.text || '').slice(0, 60)}» / 期望含 ${FAILED_TEXTS.join('|')}`
      )
      const stillEmpty = hasAny(failState.text || '', EMPTY_TEXTS)
      record(
        M,
        '93.2 反证: 失败态不得显示「暂无数据」（那正是被吞成空态的缺陷形状）',
        !stillEmpty,
        `空态文案=«${String(failState.text || '').slice(0, 60)}» / 同时含"加载失败"与"暂无数据"=失败被读成空`
      )

      // ③ 重试必须真的发出第二次请求（"交互确实发生"，不是 click 返回成功）
      const press1 = await pressUntilRequest(page, () => reqCount)
      record(
        M,
        '93.3 重试按钮可点且确实重新发出列表请求（请求计数增量 > 0）',
        press1.ok,
        `按下 ${press1.presses.length} 次 / 增量 ${press1.delta} ｜ ${press1.presses.join(' ｜ ')}`
      )
      const stillFailedText = await emptyText(page)
      record(
        M,
        '93.4 故障未撤时重试后仍是失败态（不得把重试读成成功）',
        hasAny(stillFailedText, FAILED_TEXTS),
        `重试后空态文案=«${String(stillFailedText).slice(0, 60)}»`
      )

      // ④ 撤掉故障后再重试 ⇒ 必须回到真实数据（"失败态永不消失"的实现过不了这一条）
      //    **先按、后轮询**：撤故障本身不产生请求，页面停在失败态，
      //    第一版把轮询排在点击之前 ⇒ 白等满 10s（实测数据行=0、落定 10143ms）后红在自己的时序上。
      injectFail = false
      const press2 = await pressUntilRequest(page, () => reqCount)
      const rowsBack = await pollUntil(
        async () => {
          const n = await rowCount(page)
          const text = await emptyText(page)
          return { ok: n > 0 && !hasAny(text, FAILED_TEXTS), n, text }
        },
        { timeout: 8000 }
      )
      record(
        M,
        '93.5 撤故障后点重试即恢复真实数据（失败态由事实驱动）',
        press2.ok && rowsBack.ok,
        `按下 ${press2.presses.length} 次 / 增量 ${press2.delta} ｜ ${press2.presses.join(' ｜ ')}` +
          ` / 数据行=${rowsBack.n} / 空态文案=«${String(rowsBack.text || '').slice(0, 60)}» / 落定 ${rowsBack.ms}ms`
      )
      // ⑤ 合法空结果对照组：深链一个不存在的岗位编码 ⇒ 必须是"暂无数据"而不是"加载失败"
      //    （注入已在 ④ 关掉，这里走真实后端；不再挂第二个 route——同一谓词挂两次会叠处理器）
      await page
        .goto(`${base}/system/post?postCode=e2e93-no-such-code`, {
          waitUntil: 'domcontentloaded'
        })
        .catch(() => {})
      await dismissTour(page)
      const emptyState = await pollUntil(
        async () => {
          const text = await emptyText(page)
          return { ok: hasAny(text, EMPTY_TEXTS) && !hasAny(text, FAILED_TEXTS), text }
        },
        { timeout: 8000 }
      )
      record(
        M,
        '93.6 对照组: 合法但为空的结果集显示「暂无数据」且不得显示「加载失败」',
        emptyState.ok,
        `空态文案=«${String(emptyState.text || '').slice(0, 60)}» / 落定 ${emptyState.ms}ms（少了这条，"空列表即失败"的实现同样全绿）`
      )
    } finally {
      // 注入通道必须摘干净：路由留在页面上会污染后续模块（runner 每模块新建页面，
      // 但同一模块内的后续步骤与截图复核都还可能用到真请求）
      try {
        await page.unroute(urlPredicate)
      } catch {
        /* unroute 失败不改变判据结论，但必须留一行痕 */
        log('  ⚠ 93 收尾: page.unroute 未生效（runner 会为本模块新建页面，不外溢）')
      }
      page.off('request', onRequest)
    }

    checkConsoleErrors(consoleErrors, pageErrors, M)
  }
}
