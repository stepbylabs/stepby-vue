/**
 * 模块 92：登录期「安全提示」MessageBox 的**真夹具闭环**（批八十六，收 b83 N-29）。
 *
 * ## 为什么单独成一个模块
 *
 * `store/modules/user.ts` 在 `getInfo` 之后按口令事实位弹三种框（强改密 alert /
 * 初始口令 confirm / 口令过期 confirm）。M91 已在 **API 层**证明这些位是"算出来的"
 * 而不是写死的；但**浏览器里那三条分支从未被执行过**（b83 N-29 登记）：主套件与
 * 深测都以 admin 登录，而 admin 的 `must_change_pwd='0'` ⇒ 分支结构上不可达。
 *
 * "若出现则判三条"的写法在这里是不够的：一支永不执行的分支判什么都可以是绿的。
 * 本模块的做法是**造出让它必然执行的事实**——新建一个账号（`add_user` 会把
 * `must_change_pwd` 置 '1'），用它做三次真实登录，把三条分支各自判到位：
 *
 * ① 弹框确实出现（文案回读，证明是"初始密码"那一支而不是别的框）；
 * ② 点「确 定」的**落地证据**：框关闭 AND 路由落到个人资料-修改密码页签
 *    （AGENTS 前端归一规范 §3.③：`click()` 返回成功只证明事件派发了）；
 * ③ 对照组：点「取 消」→ 框关闭 AND **没有**被踢回登录页 AND 没有跳改密页
 *    （少了这一支，实现可以是"取消也照样跳改密"而 ① ② 全绿）；
 * ④ 闭环：改掉初始口令后第三次登录**不再弹**——这一支证明提示位由事实驱动；
 *    只判前三条的话，"每次登录都弹一次、改没改过都一样"这种实现同样全绿。
 *
 * 夹具自包含：账号命名 `e2e92<ts>-*`，模块末尾按 userId 物理删除；三个浏览器上下文
 * 全部关闭。判据一律"构造状态 + 轮询到落定"，不写"导航后看一眼"（本表前言 ④）。
 */

/** 合法档位标签的选择器三形（本仓 zh-CN 双字按钮字面带空格，Playwright 不会替你去空格） */
const CONFIRM_BTN =
  '.el-message-box__btns button:has-text("确 定"), .el-message-box__btns button:has-text("确定"), .el-message-box__btns button:has-text("OK")'
const CANCEL_BTN =
  '.el-message-box__btns button:has-text("取 消"), .el-message-box__btns button:has-text("取消"), .el-message-box__btns button:has-text("Cancel")'
const BOX = '.el-overlay-message-box, .el-message-box'

/**
 * @param {object} ctx 由 deep-e2e 注入的共享 helpers（不 import 入口，入口 import 即执行）
 */
export function makeSecurityMessageBoxTest(ctx) {
  const { record, log, getApiToken, CONFIG, checkConsoleErrors, sleep, login, createPage } = ctx

  /**
   * 自管页面模块（runner 的 `BROWSER_FIRST_MODULES`）：runner 只交来 browser 与两个空的
   * 错误数组，本模块按会话自建页面并把 console/page 错误**汇入**那两个数组——
   * 三条判据各自需要一个干净上下文（登录态、localStorage 都得是新的），
   * 共享页面对本模块无用，但"未分类 console error"的判据决不能因此变成空跑。
   */
  return async function testModule92(browser, consoleErrors, pageErrors) {
    const M = 92
    log(`\n=== 模块 ${M}: 登录期安全提示框真夹具（初始口令 → 确认/取消/改密后不再弹）===`)

    if (!browser || !createPage) {
      record(
        M,
        '92.0 前置: 浏览器与 createPage 可用',
        false,
        'runner 未提供 browser/createPage ⇒ 无法建独立会话（工具自曝，不是产品缺陷）'
      )
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }

    const B = CONFIG.backendUrl
    const ts = Date.now().toString(36)
    const userName = `e2e92${ts}-usr`
    const initPwd = 'E2eGate#2026'
    const newPwd = 'E2eGate#2027'

    const call = async (token, method, path, body) => {
      try {
        const r = await fetch(`${B}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: body === undefined ? undefined : JSON.stringify(body)
        })
        const text = await r.text()
        let json = null
        try {
          json = JSON.parse(text)
        } catch {
          /* 非 JSON 由下面的判据按形状报 */
        }
        return { status: r.status, json, raw: text.slice(0, 200) }
      } catch (e) {
        return { status: 0, json: null, raw: `fetch 异常 ${e.message}` }
      }
    }

    /** 各会话的错误数组引用，模块末尾统一汇入 runner 交来的两个数组 */
    const sessionArrays = []

    /** 建一个"干净"会话：独立 context（含统一 console/page 收集）+ 真实 UI 登录 */
    const openSession = async (pwd) => {
      const created = await createPage(browser).catch(() => null)
      if (!created) return { ctx2: null, page2: null, ok: false }
      const { page: p, context, consoleErrors: ce, pageErrors: pe } = created
      // 只留引用、不在此刻合并：监听器会持续往 ce/pe 里追加（登录后才冒出来的错误
      // 也在里面），合并必须等到模块末尾，否则"未分类 console error"判据看不见后半段。
      sessionArrays.push({ ce, pe })
      // 导航前就把新手引导标成已完成（与 main.mjs 同一条纪律）：`login()` 在登录后
      // 发现 Tour 遮罩会按一次 Escape 收遮罩，而 **Escape 同时会关掉 ElMessageBox**
      // （EP confirm 默认 closeOnPressEscape=true）——本模块判的正是那个框，
      // 不让 harness 的收遮罩动作把被测对象先关掉（实测：不加这一行时三条弹框判据全红，
      // 而 DOM 取证显示框确实出现过）。
      await p.addInitScript(() => {
        try {
          localStorage.setItem('stepby-layout-tour', 'completed')
        } catch {
          /* 隐私模式：没有 Tour 也无妨 */
        }
      })
      let ok = false
      try {
        // 必须显式传密码：`login` 的第三形参缺省会回落成 CONFIG.password（管理员口令），
        // 传 undefined 等于用管理员口令登测试账号 —— 必然失败却被读成"没有弹框"
        ok = await login(p, userName, pwd)
      } catch {
        ok = false
      }
      return { ctx2: context, page2: p, ok }
    }

    /** 等到弹框出现（构造状态，不是"看一眼"）；返回是否出现 */
    const waitForBox = (p, timeout = 12000) =>
      p
        .locator(BOX)
        .first()
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)

    /** 框是否真的消失（复原判据） */
    const boxGone = (p) => p.evaluate((sel) => document.querySelectorAll(sel).length === 0, BOX).catch(() => false)

    // ---- 前置：新建账号（add_user 会置 must_change_pwd='1'，这是提示框唯一的事实来源）----
    const adminToken = await getApiToken()
    if (!adminToken) {
      record(M, '92.0 前置: API 取管理员 token', false, 'getApiToken() 返回空 ⇒ 本模块无从执行（自曝，不降级为 SKIP）')
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }
    const created = await call(adminToken, 'POST', '/system/user', {
      deptId: 103,
      userName,
      nickName: userName,
      email: `${userName}@stepby.test`,
      phonenumber: '13900009292',
      password: initPwd,
      status: '0',
      roleIds: [2]
    })
    const listBack = await call(adminToken, 'GET', `/system/user/list?userName=${encodeURIComponent(userName)}`)
    const userId = (listBack.json?.rows || [])[0]?.userId
    record(
      M,
      '92.1 前置: 新建账号成功且可按用户名回查到 userId',
      created.json?.code === 200 && Number.isFinite(Number(userId)),
      `code=${created.json?.code} msg=${created.json?.msg || created.raw} userId=${userId}`
    )

    let userToken = null
    if (userId) {
      userToken = await getApiToken(userName, initPwd)
    }
    record(
      M,
      '92.2 前置: 新账号能登录且 getInfo 的事实位为"初始口令未改"',
      !!userToken &&
        (await call(userToken || adminToken, 'GET', '/getInfo').then((r) => r.json?.isDefaultModifyPwd === true)),
      `token=${userToken ? '有' : '无'}`
    )

    // ---- ① + ② 第一次登录：弹框出现 → 点「确 定」落地到改密页签 ----
    const s1 = await openSession(initPwd)
    if (!s1.page2) {
      record(M, '92.3 首次登录出现「初始密码」安全提示框', false, '新上下文创建失败')
      record(M, '92.4 点「确 定」落地：框关闭 AND 落到修改密码页签', false, '同上')
    } else {
      // 登录成功与否由"框是否出现"这条链自己暴露：登录失败时永远不会有框 ⇒ ① 红
      const boxShown = await waitForBox(s1.page2)
      const boxText = boxShown
        ? await s1.page2
            .locator(BOX)
            .first()
            .innerText()
            .catch(() => '')
        : ''
      // 凭证必须够归因：光写"visible=false"分不清"没弹框"与"登录没落地"（本模块首跑
      // 就因此差点把 harness 的 Escape 收遮罩当成产品缺陷去改）
      const s1Evidence = `登录落地=${s1.ok} url=${s1.page2.url().slice(-40)} 框数=${await s1.page2
        .evaluate((sel) => document.querySelectorAll(sel).length, BOX)
        .catch(() => -1)}`
      record(
        M,
        '92.3 首次登录出现「初始密码」安全提示框（文案回读，证明是这一支）',
        boxShown && /初始密码|initial password/i.test(boxText),
        `${s1Evidence} text=${boxText.replace(/\s+/g, ' ').slice(0, 70)}`
      )

      if (boxShown) {
        const clicked = await s1.page2
          .locator(CONFIRM_BTN)
          .first()
          .click({ timeout: 3000 })
          .then(() => true)
          .catch(() => false)
        await sleep(800)
        const gone = await boxGone(s1.page2)
        const url = s1.page2.url()
        const onResetTab =
          url.includes('/user/profile') &&
          (url.includes('resetPwd') ||
            (await s1.page2
              .evaluate(() => {
                const el = document.querySelector('.el-tabs__item.is-active')
                return /修改密码|Reset Password|密码/.test(el?.textContent || '')
              })
              .catch(() => false)))
        record(
          M,
          '92.4 点「确 定」落地：框关闭 AND 落到个人资料-修改密码页签',
          clicked && gone && onResetTab,
          `点击落地=${clicked} 框关闭=${gone} url=${url.slice(-60)}`
        )
      } else {
        record(M, '92.4 点「确 定」落地：框关闭 AND 落到个人资料-修改密码页签', false, '前置未成立：没有弹框可点')
      }
    }

    // ---- ③ 对照组：第二次登录点「取 消」——不得被踢回登录页，也不得跳改密页 ----
    const s2 = await openSession(initPwd)
    if (!s2.page2) {
      record(M, '92.5 对照组：点「取 消」→ 框关闭 AND 留在业务页（软提示不强制）', false, '新上下文创建失败')
    } else {
      const boxShown2 = await waitForBox(s2.page2)
      if (boxShown2) {
        const cancelled = await s2.page2
          .locator(CANCEL_BTN)
          .first()
          .click({ timeout: 3000 })
          .then(() => true)
          .catch(() => false)
        await sleep(800)
        const gone2 = await boxGone(s2.page2)
        const url2 = s2.page2.url()
        record(
          M,
          '92.5 对照组：点「取 消」→ 框关闭 AND 留在业务页（软提示不强制）',
          cancelled && gone2 && !url2.includes('/login') && !url2.includes('/user/profile'),
          `取消落地=${cancelled} 框关闭=${gone2} url=${url2.slice(-60)}`
        )
      } else {
        record(
          M,
          '92.5 对照组：点「取 消」→ 框关闭 AND 留在业务页（软提示不强制）',
          false,
          `前置未成立：第二次登录没有弹框（登录落地=${s2.ok} url=${s2.page2.url().slice(-40)}）`
        )
      }
    }

    // ---- ④ 闭环：改掉初始口令后第三次登录不再弹 ----
    const changed = userToken
      ? await call(userToken, 'PUT', '/system/user/profile/updatePwd', {
          oldPassword: initPwd,
          newPassword: newPwd
        })
      : { json: null, raw: '无会话 token' }
    record(
      M,
      '92.6 前置: 自助改密成功（口令事实位的前提是"仍是初始口令"）',
      changed.json?.code === 200,
      `code=${changed.json?.code} msg=${changed.json?.msg || changed.raw}`
    )

    const s3 = await openSession(newPwd)
    if (s3.page2) {
      const boxShown3 = await waitForBox(s3.page2, 6000)
      record(
        M,
        '92.7 改密后再登录不再弹（提示位由事实驱动，不是每次登录都提示）',
        !!s3.ok && !boxShown3,
        `登录=${s3.ok} 仍弹框=${boxShown3}`
      )
    } else {
      record(M, '92.7 改密后再登录不再弹', false, '第三会话建不起来（工具自曝）')
    }

    // ---- 清理：三个上下文 + 测试账号 ----
    for (const c of [s1.ctx2, s2.ctx2, s3.ctx2]) {
      await c?.close().catch(() => {})
    }
    const del = userId
      ? await call(adminToken, 'DELETE', `/system/user/${userId}`)
      : { json: null, raw: '没有 userId，无需删除' }
    const after = userId
      ? await call(adminToken, 'GET', `/system/user/list?userName=${encodeURIComponent(userName)}`)
      : { json: { rows: [] } }
    record(
      M,
      '92.8 清理: 测试账号删除并回查 0 行（不留残留给下一轮）',
      del.json?.code === 200 && (after.json?.rows || []).length === 0,
      `del=${del.json?.code} 回查行数=${(after.json?.rows || []).length}`
    )

    // 三个会话的 console/page 错误统一并入 runner 交来的数组（判据是"未分类 console error 计数"，
    // 只判那对空数组等于本模块自测盲区）
    for (const { ce, pe } of sessionArrays) {
      consoleErrors.push(...ce)
      pageErrors.push(...pe)
    }
    checkConsoleErrors(consoleErrors, pageErrors, M)
  }
}
