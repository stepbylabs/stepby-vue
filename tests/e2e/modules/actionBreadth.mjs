/**
 * 模块 89：页面动作广度（b81，第三阶段迁移的第一个独立模块）。
 *
 * 回答 action-inventory 的第二优先级问题：**源码里提到过、但没有真实点击证据的动作**。
 * 这里只收"可安全真点且需要环境无数据也能跑"的动作用例；每条都必须有结果闭环，
 * 不接受"点到了就算过"：
 *   · 树表展开/收起 → 可见行数变化，再点一次必须回到**点击前实测值**（不是硬编码终态）；
 *   · 树刷新 → 请求 200 且树仍在；
 *   · 看板编辑态 → 「恢复默认」出现 → 「完成」后消失；
 *   · 工作台入口 → 真实路由跳转；
 *   · 缓存统计刷新 → prefixStats 200；
 *   · HTTP 调试器请求头 → 行数 +1、填入值可读、删除后行数复原。
 *
 * 为什么独立成文件：deep-e2e.mjs 已两万行，新模块按"第三阶段迁移"的约定放 modules/，
 * 由 deep-e2e 注入共享 helpers（record/log/safeGoto/...），模块自己不复制判据实现。
 * 这样 action-inventory 的 `loadSuiteSources()` 仍能扫到这些动作文案（它读 deep-e2e 源码，
 * 而 deep-e2e 只 import 本文件——文案不会出现在源码里）；因此本文件同时被
 * `action-inventory.mjs` 的源码集合显式纳入，否则"补测过的动作"仍会被报成未覆盖。
 */

/**
 * @param {object} ctx 共享 helpers（由 deep-e2e 注入，避免两套实现漂移）
 */
export function makeActionBreadthTest(ctx) {
  const { record, log, safeGoto, assertPageLoaded, checkConsoleErrors, CONFIG, sleep } = ctx

  return async function testModule89(page, consoleErrors, pageErrors) {
    const M = 89
    log(`\n=== 模块 ${M}: 页面动作广度（真实点击 + 结果闭环）===`)

    /** 树表折叠是"只隐藏不卸载"：必须数 :visible，不能数 DOM 行（否则变化恒为 0） */
    const visibleRows = () =>
      page
        .locator('.el-table__body .el-table__row:visible')
        .count()
        .catch(() => -1)
    const waitVisibleRows = async (want, timeout = 6000) => {
      const start = Date.now()
      let last = -1
      while (Date.now() - start < timeout) {
        last = await visibleRows()
        if (want(last)) return last
        await sleep(120)
      }
      return last
    }
    const click = async (locator) => {
      await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
      return locator
        .click({ timeout: 3000 })
        .then(() => true)
        .catch(() => false)
    }

    // 1. 部门树：展开/收起往返。基线取点击前实测值，复原必须是同一个数。
    if (await safeGoto(page, `${CONFIG.frontendUrl}/system/dept`, { moduleName: M, waitMs: 1800 })) {
      await assertPageLoaded(page, M, '部门管理页面加载（动作广度）')
      const before = await visibleRows()
      const toggle = page.locator('button:has-text("展开/收起")').first()
      const okClick = await click(toggle)
      const collapsed = okClick ? await waitVisibleRows((n) => n > 0 && n !== before) : before
      const okBack = await click(toggle)
      const restored = okBack ? await waitVisibleRows((n) => n === before) : -1
      record(
        M,
        '部门管理: 展开/收起往返（可见行变化后复原）',
        before > 0 && okClick && collapsed !== before && okBack && restored === before,
        `before=${before} collapsed=${collapsed} restored=${restored}`
      )
    }

    // 2. 菜单树：同上（244 行；折叠/展开的重建耗时比部门长，给 10s）
    if (await safeGoto(page, `${CONFIG.frontendUrl}/system/menu`, { moduleName: M, waitMs: 2000 })) {
      await assertPageLoaded(page, M, '菜单管理页面加载（动作广度）')
      const before = await visibleRows()
      const toggle = page.locator('button:has-text("展开/收起")').first()
      const okClick = await click(toggle)
      const collapsed = okClick ? await waitVisibleRows((n) => n > 0 && n !== before, 10000) : before
      const okBack = await click(toggle)
      const restored = okBack ? await waitVisibleRows((n) => n === before, 10000) : -1
      record(
        M,
        '菜单管理: 展开/收起往返（可见行变化后复原）',
        before > 0 && okClick && collapsed !== before && okBack && restored === before,
        `before=${before} collapsed=${collapsed} restored=${restored}`
      )
    }

    // 3. 用户页树刷新：请求 200 + 树仍可见（不是"点了就算"）
    if (await safeGoto(page, `${CONFIG.frontendUrl}/system/user`, { moduleName: M, waitMs: 1800 })) {
      await assertPageLoaded(page, M, '用户管理页面加载（动作广度）')
      const tree = page.locator('.el-tree').first()
      const treeBefore = await tree.isVisible().catch(() => false)
      const respP = page
        .waitForResponse((r) => r.url().includes('/system/user/deptTree') && r.status() === 200, {
          timeout: 8000
        })
        .catch(() => null)
      const clicked = await click(page.locator('button[aria-label="刷新树列表"]').first())
      const resp = await respP
      record(
        M,
        '用户管理: 刷新树列表发出 200 请求且树仍在',
        clicked && !!resp && treeBefore && (await tree.isVisible().catch(() => false)),
        `clicked=${clicked} http=${resp ? resp.status() : 'n/a'} treeBefore=${treeBefore}`
      )
    }

    // 4. 数据看板：编辑态往返（恢复默认出现 → 完成 → 消失）
    if (await safeGoto(page, `${CONFIG.frontendUrl}/dashboard`, { moduleName: M, waitMs: 1800 })) {
      await assertPageLoaded(page, M, '数据看板页面加载（动作广度）')
      const edit = page.locator('.dashboard-toolbar button:has-text("自定义布局")').first()
      const reset = page.locator('.dashboard-toolbar button:has-text("恢复默认")').first()
      const done = page.locator('.dashboard-toolbar button:has-text("完成")').first()
      const entered =
        (await click(edit)) &&
        (await reset
          .waitFor({ state: 'visible', timeout: 3000 })
          .then(() => true)
          .catch(() => false)) &&
        (await done.isVisible().catch(() => false))
      const exited =
        (await click(done)) &&
        (await reset
          .waitFor({ state: 'hidden', timeout: 3000 })
          .then(() => true)
          .catch(() => false)) &&
        (await edit.isVisible().catch(() => false))
      record(M, '数据看板: 自定义布局进入/退出编辑态', entered && exited, `entered=${entered} exited=${exited}`)
    }

    // 5. 工作台「我的通知」→ 通知中心（真实路由跳转）
    if (await safeGoto(page, `${CONFIG.frontendUrl}/workbench/index`, { moduleName: M, waitMs: 1800 })) {
      await assertPageLoaded(page, M, '工作台页面加载（动作广度）')
      const noticeBtn = page.locator('button:has-text("我的通知")').first()
      const clicked = await click(noticeBtn)
      const navigated = clicked
        ? await page
            .waitForURL((u) => u.toString().includes('/system/notice-center'), { timeout: 6000 })
            .then(() => true)
            .catch(() => false)
        : false
      record(M, '工作台: 我的通知跳转通知中心', clicked && navigated, `clicked=${clicked} url=${page.url()}`)
    }

    // 6. 缓存统计：第三页签的「刷新统计」必须发出 prefixStats 且 200
    if (await safeGoto(page, `${CONFIG.frontendUrl}/monitor/cache`, { moduleName: M, waitMs: 1500 })) {
      await assertPageLoaded(page, M, '缓存管理页面加载（动作广度）')
      const statTab = page.locator('.el-tabs__item').nth(2)
      const tabOk = await statTab.isVisible().catch(() => false)
      if (tabOk) {
        await click(statTab)
        const active = await statTab.evaluate((el) => el.classList.contains('is-active')).catch(() => false)
        const respP = page
          .waitForResponse((r) => r.url().includes('/monitor/cache/prefixStats') && r.status() === 200, {
            timeout: 8000
          })
          .catch(() => null)
        const clicked = await click(page.locator('button[aria-label="刷新统计"]').first())
        const resp = await respP
        record(
          M,
          '缓存管理: 统计页签「刷新统计」发出 200 请求',
          active && clicked && !!resp,
          `tabActive=${active} clicked=${clicked} http=${resp ? resp.status() : 'n/a'}`
        )
      } else {
        record(M, '缓存管理: 统计页签「刷新统计」发出 200 请求', false, '统计页签不可见')
      }
    }

    // 7. HTTP 调试器：添加请求头 → 填写 → 删除，行数往返
    if (await safeGoto(page, `${CONFIG.frontendUrl}/tool/http-debugger`, { moduleName: M, waitMs: 1500 })) {
      await assertPageLoaded(page, M, 'HTTP 调试器页面加载（动作广度）')
      const rows = () =>
        page
          .locator('.el-table__body .el-table__row')
          .count()
          .catch(() => -1)
      const waitRows = async (want, timeout = 4000) => {
        const start = Date.now()
        let last = -1
        while (Date.now() - start < timeout) {
          last = await rows()
          if (want(last)) return true
          await sleep(120)
        }
        return false
      }
      const before = await rows()
      const added =
        (await click(page.locator('button:has-text("添加请求头")').first())) &&
        (await waitRows((n) => n === before + 1))
      let filled = false
      let removed = false
      if (added) {
        const row = page.locator('.el-table__body .el-table__row').last()
        await row.locator('input').nth(0).fill('X-E2E')
        await row.locator('input').nth(1).fill('1')
        filled =
          (await row
            .locator('input')
            .nth(0)
            .inputValue()
            .catch(() => '')) === 'X-E2E' &&
          (await row
            .locator('input')
            .nth(1)
            .inputValue()
            .catch(() => '')) === '1'
        removed =
          (await click(row.locator('button[aria-label="删除"]').first())) && (await waitRows((n) => n === before))
      }
      record(
        M,
        'HTTP 调试器: 添加请求头→填写→删除（行数往返）',
        before >= 1 && added && filled && removed,
        `before=${before} added=${added} filled=${filled} removed=${removed}`
      )
    }

    checkConsoleErrors(consoleErrors, pageErrors, M)
  }
}
