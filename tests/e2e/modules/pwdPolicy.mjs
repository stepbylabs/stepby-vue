/**
 * 模块 91：口令有效期 / 强改密闸门的**默认态契约与可发现性**（批八十四 项 A）。
 *
 * ## 为什么本模块不翻档（这是设计，不是偷懒）
 *
 * 闸门的**行为**判据在 Rust 集成测试里（`integration_tests/pwd_expiry.rs` 7 条，含
 * "被拦 → 白名单改密 → 重新登录 → 放行"的完整闭环）。本模块刻意**不**翻这三个热键，因为：
 * 迁移会把 admin 标成"初始口令未改"，而存量库 admin 的口令年龄按 `create_time` 回填 ⇒
 * 一旦把 `pwdChangeGate` 翻成 `deny_*`，**跑批自己也会被自己的闸门拦下，连恢复配置的
 * 那条写请求都发不出去**。在共享运行库上留下"恢复通道不保证可达"的用例，等于把
 * 一次异常变成整轮套件红、还得人工改库救——那正是本仓禁止的"把判据建在环境上"。
 * 所以这一族的可执行判据放在隔离库（集成层），e2e 层只判**默认态必须零行为变化**
 * 与**能力必须可发现**，这两条跑在任何环境上都同数。
 *
 * ## 五条判据
 *
 * ① `/getInfo` 三个口令位必须是 bool（存在 ≠ 可用；类型判住"字段被写死"这一族）；
 * ② 默认关闭态下 `isPasswordExpired` / `mustChangePassword` 必须 false（= 现状等价）；
 * ③ 但 `isDefaultModifyPwd` 对**新建账号**必须为 true——这一条是"恒假占位"缺陷的直接反证：
 *    字段如果是写死的，任何翻档都救不回来，而它在真实现下必然随账号状态变化；
 * ④ 两个新热键必须在参数管理面可发现且种的是关闭态（`0` / `off`）——开源项目里
 *    "能力存在但无处开启"等于没做（AGENTS 项目定位①）；
 * ⑤ 白名单出口面（`/getInfo`、`/getRouters`、`/system/user/profile`）与一次真实业务写
 *    在默认态下必须照常可用（闸门 off 不得有任何副作用）。
 *
 * 夹具自包含：账号与岗位都用 `e2e91<ts>` 命名并在模块内删除。
 */

/**
 * @param {object} ctx 共享 helpers（由 deep-e2e 注入）
 */
export function makePwdPolicyTest(ctx) {
  const { record, log, getApiToken, CONFIG, checkConsoleErrors } = ctx

  return async function testModule91(page, consoleErrors, pageErrors) {
    const M = 91
    log(`\n=== 模块 ${M}: 口令有效期/强改密闸门 默认态契约与可发现性 ===`)
    const B = CONFIG.backendUrl
    const ts = Date.now().toString(36)
    const N = (s) => `e2e91${ts}-${s}`

    const adminToken = await getApiToken()
    if (!adminToken) {
      record(M, '前置: API 取 token', false, 'getApiToken() 返回空 ⇒ 本模块无从执行（工具/环境自曝，不是产品缺陷）')
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }

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

    // ===== ① + ② 默认关闭态：三个口令位必须都是 bool，且两位"强制/过期"为 false =====
    const gi = await call(adminToken, 'GET', '/getInfo')
    const g = gi.json || {}
    const flagsShape =
      typeof g.isDefaultModifyPwd === 'boolean' &&
      typeof g.isPasswordExpired === 'boolean' &&
      typeof g.mustChangePassword === 'boolean'
    record(
      M,
      '91.1 /getInfo 三个口令位齐全且均为布尔',
      gi.status === 200 && flagsShape,
      `status=${gi.status} isDefaultModifyPwd=${JSON.stringify(g.isDefaultModifyPwd)} ` +
        `isPasswordExpired=${JSON.stringify(g.isPasswordExpired)} mustChangePassword=${JSON.stringify(g.mustChangePassword)}`
    )
    record(
      M,
      '91.2 默认关闭态 isPasswordExpired / mustChangePassword 必须 false（= 改造前现状）',
      g.isPasswordExpired === false && g.mustChangePassword === false,
      `实际 expired=${JSON.stringify(g.isPasswordExpired)} mustChange=${JSON.stringify(g.mustChangePassword)}（days 默认 0、force 默认 false ⇒ 任何翻真都意味着默认值被改坏）`
    )

    // ===== ③ 新建账号的真实标志（"恒假占位"缺陷的直接反证） =====
    const pwd = 'E2eGate#2026'
    const userName = N('usr')
    const created = await call(adminToken, 'POST', '/system/user', {
      deptId: 103,
      userName,
      nickName: userName,
      email: `${userName}@stepby.test`,
      phonenumber: '13900009191',
      password: pwd,
      status: '0',
      roleIds: [2]
    })
    record(
      M,
      '91.3a 前置: API 新建用户',
      created.json?.code === 200,
      `code=${created.json?.code} msg=${created.json?.msg || created.raw}`
    )

    const userToken = created.json?.code === 200 ? await getApiToken(userName, pwd) : null
    if (userToken) {
      const ugi = (await call(userToken, 'GET', '/getInfo')).json || {}
      record(
        M,
        '91.3b 新建账号 isDefaultModifyPwd 必须为 true（标志是算出来的，不是写死的 false）',
        ugi.isDefaultModifyPwd === true,
        `实际 ${JSON.stringify(ugi.isDefaultModifyPwd)}（add_user 置 must_change_pwd='1' ⇒ 该位必须翻真）`
      )
      record(
        M,
        '91.3c 总闸未开时不得驱动强制位（mustChangePassword=false，但事实位照发）',
        ugi.mustChangePassword === false && ugi.isDefaultModifyPwd === true,
        `mustChange=${JSON.stringify(ugi.mustChangePassword)} isDefault=${JSON.stringify(ugi.isDefaultModifyPwd)}`
      )
    } else {
      record(
        M,
        '91.3b 新建账号 isDefaultModifyPwd 必须为 true',
        false,
        '以新建账号 API 登录未拿到 token ⇒ 判据无从执行（自曝，不降级为 SKIP）'
      )
      record(M, '91.3c 总闸未开时不得驱动强制位', false, '同上：没有会话就没有 getInfo')
    }

    // ===== ④ 两个热键在参数面可发现，且种的是关闭态 =====
    const readKey = async (key) => {
      const list =
        (await call(adminToken, 'GET', `/system/config/list?configKey=${encodeURIComponent(key)}`)).json || {}
      const row = (list.rows || [])[0] || {}
      const eff = (await call(adminToken, 'GET', `/system/config/configKey/${encodeURIComponent(key)}`)).json || {}
      return { row, eff: eff.data, total: list.total ?? 0 }
    }
    for (const [key, expect] of [
      ['sys.user.pwdExpireDays', '0'],
      ['sys.user.pwdChangeGate', 'off']
    ]) {
      const { row, eff, total } = await readKey(key)
      record(
        M,
        `91.4 ${key} 在参数管理可发现且默认关闭态`,
        total >= 1 && row.configValue === expect && String(eff) === expect,
        `total=${total} 列表值=${JSON.stringify(row.configValue)} 有效值=${JSON.stringify(eff)}（期望 ${JSON.stringify(expect)}；"能力存在但无处开启"= 没做）`
      )
    }

    // ===== ⑤ 默认态下出口面与一次真实业务写照常 =====
    for (const path of ['/getInfo', '/getRouters', '/system/user/profile']) {
      const r = await call(adminToken, 'GET', path)
      record(
        M,
        `91.5 白名单出口 ${path} 默认态必须 200`,
        r.status === 200 && r.json?.code === 200,
        `status=${r.status} code=${r.json?.code}`
      )
    }

    const postCode = N('post')
    const wp = await call(adminToken, 'POST', '/system/post', {
      postName: '口令闸门默认态探针',
      postCode,
      postSort: 9,
      status: '0',
      remark: 'e2e91 默认态业务写探针'
    })
    const postId = wp.json?.code === 200 ? await findPostId(adminToken, postCode, call) : null
    record(
      M,
      '91.6 默认态（gate=off）业务写不受任何影响',
      wp.json?.code === 200,
      `code=${wp.json?.code} msg=${wp.json?.msg || wp.raw}`
    )

    // ===== 清理（失败必须报，不得静默留残留） =====
    if (postId) {
      const del = await call(adminToken, 'DELETE', `/system/post/${postId}`)
      record(M, '91.7a 删除探针岗位', del.json?.code === 200, `code=${del.json?.code}`)
    } else {
      record(M, '91.7a 删除探针岗位', false, '没拿到 postId ⇒ 岗位可能残留（记 FAIL 不记 SKIP）')
    }
    const userId = created.json?.code === 200 ? await findUserId(adminToken, userName, call) : null
    if (userId) {
      const du = await call(adminToken, 'DELETE', `/system/user/${userId}`)
      record(M, '91.7b 删除探针用户', du.json?.code === 200, `code=${du.json?.code}`)
    } else {
      record(
        M,
        '91.7b 删除探针用户',
        created.json?.code !== 200,
        created.json?.code === 200 ? '建号成功却没查到 userId ⇒ 可能残留' : '未建号，无需删除'
      )
    }

    checkConsoleErrors(consoleErrors, pageErrors, M)
  }

  async function findPostId(token, code, call) {
    const v = (await call(token, 'GET', `/system/post/list?postCode=${encodeURIComponent(code)}`)).json || {}
    return (v.rows || [])[0]?.postId ?? null
  }

  async function findUserId(token, userName, call) {
    const v = (await call(token, 'GET', `/system/user/list?userName=${encodeURIComponent(userName)}`)).json || {}
    return (v.rows || [])[0]?.userId ?? null
  }
}
