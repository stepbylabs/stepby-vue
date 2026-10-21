/**
 * 模块 90：六个"设计上欠着"的写端点闭环（b82 起，b83 补用户导入）。
 *
 * `endpoint-coverage` 在 b82 把基线断面与数据集对齐后，`kind=todo` 从 18 条缩到 5 条——
 * 那 13 条是**登记断面比库断面旧了 8 小时**造成的记大欠账（M88/main 早已真打过），
 * 剩下这 5 条才是本批要收的：
 *   · `POST /system/flow/demo/{docId}/resubmit`      —— 需要"非超管申请人"会话；
 *   · `POST /system/backup/self-export`              —— 能力位关 + 平台无数据包两分支都可测；
 *   · `POST /system/ipLocation/update`               —— 只测入参闸门（下载链路属外部网络，不做判据）；
 *   · `PUT  /system/tenant/menu` + `DELETE /{l3Id}`  —— 需要"未挂载候选"枚举面（b81 §10 N-19①）；
 *   · `POST /system/user/importData`                 —— b83 收：需要能**写** xlsx（见 `xlsx-fixture.mjs`）。
 *
 * 五条判据纪律（沿用 M88，全部由实测逼出）：
 * ① 夹具自包含：租户/单据/导入用户都用 `e2e90<ts>` 命名并在模块内删除，收尾后库里不得留活跃行；
 * ② **反证必须配对**：每一次"被拒"都要读回事实（轮次没推进 / 没生成备份行 / 库文件事实没变 /
 *    锁没被占用 / 导入没多出一行），否则"拒绝"可以靠"这个入口永远报错"实现，与产品本意相反；
 * ③ 前置拿不到就**记 FAIL 并自曝**，不降级成 SKIP——把 undefined 拼进 URL 冒充一次真实请求，
 *    b81 之前据此误判过缺陷；
 * ④ 不在浏览器里做真外呼、不下载 IP 库、不建备份文件：本模块全部判据都是"闸门与状态"，
 *    跑在任何环境上都应同数（门禁不得与环境耦合）；
 * ⑤ **限流桶也是环境**（b83 实测）：`/system/user/importData` 有独立敏感档
 *    （`SENSITIVE_LIMIT_TIERS` = 容量 5 / 补充 0.1 s⁻¹）。探针一次性打 8 发时第 6 发起就吃 429，
 *    所以本模块把导入调用压到 **4 发**并逐发留间隔；真被限流时记 FAIL 并写明是哪一发，
 *    不得把 429 读成"这一条通过"。
 */
import { buildXlsx } from '../xlsx-fixture.mjs'

/**
 * @param {object} ctx 共享 helpers（由 deep-e2e 注入）
 */
export function makeWriteEndpointBreadthTest(ctx) {
  const { record, log, getApiToken, CONFIG, sleep, checkConsoleErrors } = ctx

  return async function testModule90(page, consoleErrors, pageErrors) {
    const M = 90
    log(`\n=== 模块 ${M}: 六个欠账写端点闭环（夹具自包含 + 反证配对）===`)
    const B = CONFIG.backendUrl
    const ts = Date.now().toString(36)

    const adminToken = await getApiToken()
    if (!adminToken) {
      record(
        M,
        '前置: 管理员 API token',
        false,
        'getApiToken() 返回空 ⇒ 本模块全部判据无从执行（工具/环境自曝，不是产品缺陷）'
      )
      checkConsoleErrors(consoleErrors, pageErrors, M)
      return
    }

    /** 统一的 HTTP 信封：legacy 档下 HTTP 状态与 body.code 同值，两个都要判才不是"只看一边" */
    const call = async (token, method, path, body) => {
      try {
        const r = await fetch(`${B}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
          },
          body: body === undefined ? undefined : JSON.stringify(body)
        })
        let j = null
        try {
          j = await r.json()
        } catch {
          j = null
        }
        return {
          http: r.status,
          code: j?.code ?? null,
          msg: j?.msg ?? '',
          data: j?.data ?? null,
          // TableDataInfo 把集合放在 `rows` 而不是 `data`（`/system/flow/mine`、`/system/user/list`
          // 都是这一形）——信封里少这一个字段，上一版就把"查不到刚建的行"读成了产品缺陷
          rows: Array.isArray(j?.rows) ? j.rows : null,
          total: j?.total ?? null
        }
      } catch (e) {
        return { http: 0, code: null, msg: `请求本身失败: ${e.message}`, data: null, rows: null, total: null }
      }
    }
    /** 负路径统一形状：HTTP 与业务码同值 + 文案已解析（`t!` 缺键时返回键名本身，必须挡住） */
    const expectReject = (r, label, wantHttp, hint) => {
      const codeOk = r.http === wantHttp && r.code === wantHttp
      const msg = String(r.msg || '')
      const msgOk = !!msg && !msg.startsWith('error.') && !msg.startsWith('系统内部错误')
      record(
        M,
        label,
        codeOk && msgOk && (!hint || msg.includes(hint)),
        `HTTP=${r.http} code=${r.code} msg=${msg.slice(0, 70)}` +
          (hint ? `（须含「${hint}」=${msg.includes(hint)}）` : '')
      )
      return codeOk && msgOk
    }

    // ================= 一、流程演示重提交（需非超管申请人会话）=================
    // admin(user_id=1) 提交会撞 `self_approve_chain`（自己是自己的审批链），这不是本模块要判的
    // 缺陷；换成种子普通账号 stepby（dept 负责人=admin）才能把"撤回→重提交"这条链跑起来。
    const applicant = await getApiToken('stepby', CONFIG.password)
    if (!applicant) {
      record(
        M,
        '前置: 非超管申请人会话',
        false,
        'stepby 登录失败 ⇒ 重提交链没有可用的申请人，本族结论不作数（工具/环境自曝，不是产品缺陷）'
      )
    } else {
      /**
       * 单据事实**只从列表读**：`GET /system/flow/demo/{docId}` 这个详情路由不存在，
       * 而 `POST .../withdraw` 返回的是**任务**模型（`SysFlowTaskModel`，其 `status` 是那条
       * 任务自己的状态，不是单据的）。上一版拿响应体当单据读，两条判据一起红——
       * 读侧口径错了，写侧再对也证不了闭环。发起人视图 `/system/flow/mine` 才是 doc 的权威面。
       */
      const readDoc = async (token, id) => {
        const r = await call(token, 'GET', '/system/flow/mine?pageNum=1&pageSize=50')
        const rows = Array.isArray(r.rows) ? r.rows : []
        return rows.find((x) => Number(x.docId) === Number(id)) || null
      }
      const title = `e2e90-flow-${ts}`
      const sub = await call(applicant, 'POST', '/system/flow/demo/submit', {
        title,
        leaveType: 'annual',
        days: 1,
        reason: 'e2e90 重提交闭环',
        flowMode: 'single'
      })
      const docId = Number(sub.data?.docId)
      record(
        M,
        '流程演示: 提交夹具单据（docId 有效）',
        sub.code === 200 && Number.isFinite(docId) && docId > 0,
        `POST code=${sub.code} msg=${String(sub.msg).slice(0, 40)} docId=${sub.data?.docId} status=${sub.data?.status}`
      )

      if (Number.isFinite(docId) && docId > 0) {
        const round0 = Number(sub.data?.currentRound ?? 0)
        const d0 = await readDoc(applicant, docId)
        record(
          M,
          '流程演示: 发起人视图可读回该单（读侧口径自证）',
          !!d0 && d0.status === 'pending' && Number(d0.currentRound) === round0,
          `mine 读回 ${JSON.stringify(d0 || {}).slice(0, 80)}`
        )
        // 反证①：pending 态重提交必须被拒（否则"重复提交"就是绕过审批链的第二个入口）
        const rejPending = await call(applicant, 'POST', `/system/flow/demo/${docId}/resubmit`)
        expectReject(rejPending, '流程演示: pending 态重提交被拒（不得绕过在途审批）', 400)
        // 反证配对：被拒的那一次**不得推进轮次**——只看 400 无法区分"拒绝且无副作用"与
        // "先推进了再报错"，后者同样给 400 文案。
        const dRej = await readDoc(applicant, docId)
        record(
          M,
          '流程演示: 被拒的重提交未推进轮次（无副作用）',
          !!dRej && Number(dRej.currentRound) === round0 && dRej.status === 'pending',
          `round ${round0} → ${dRej?.currentRound}，status=${dRej?.status}`
        )

        const wd = await call(applicant, 'POST', `/system/flow/demo/${docId}/withdraw`)
        const dWd = await readDoc(applicant, docId)
        record(
          M,
          '流程演示: 撤回后单据进入 withdrawn 终态（重提交的前置）',
          wd.code === 200 && dWd?.status === 'withdrawn',
          `withdraw code=${wd.code}（响应体是任务模型，判据看读回的 doc）doc.status=${dWd?.status}`
        )

        const re = await call(applicant, 'POST', `/system/flow/demo/${docId}/resubmit`)
        const round1 = Number(re.data?.currentRound ?? -1)
        const dRe = await readDoc(applicant, docId)
        record(
          M,
          '流程演示: 撤回后重提交成功且轮次 +1（不是把旧单洗回 pending）',
          re.code === 200 &&
            re.data?.status === 'pending' &&
            round1 === round0 + 1 &&
            dRe?.status === 'pending' &&
            Number(dRe?.currentRound) === round1,
          `响应 round ${round0} → ${round1}（期望 ${round0 + 1}），读回 status=${dRe?.status} round=${dRe?.currentRound}`
        )

        // 反证②：他人单据不得代提交（申请人校验；PAT 分支需要真令牌，本模块只用真 JWT 会话）
        const foreign = await call(adminToken, 'POST', `/system/flow/demo/${docId}/resubmit`)
        expectReject(foreign, '流程演示: 非申请人重提交被拒 403（属主校验）', 403)
        // 反证③：不存在的单据必须 404，不得静默 200（那等于"提交给了空气"）
        const ghost = await call(applicant, 'POST', '/system/flow/demo/99999999/resubmit')
        expectReject(ghost, '流程演示: 不存在的单据重提交 404', 404)

        // 收尾：回到 withdrawn 终态。flow_demo_doc / sys_flow_task / sys_flow_log 的物理清扫
        // 由 residue-cleanup 的 `f75_*` 三步负责（本批把谓词从 'e2e75%' 放宽到 'e2e%'，
        // 命名族覆盖是判据而不是运气）。
        const wd2 = await call(applicant, 'POST', `/system/flow/demo/${docId}/withdraw`)
        const dEnd = await readDoc(applicant, docId)
        record(
          M,
          '流程演示: 收尾撤回（不留活跃在途单）',
          wd2.code === 200 && dEnd?.status === 'withdrawn',
          `code=${wd2.code} doc.status=${dEnd?.status}（终态须 withdrawn，不得是 pending）`
        )
      }
    }

    // ================= 二、租户自助导出备份包（能力位关 + 平台无数据包）=================
    // 两条分支都是"拒绝且不产生文件"，可确定判定；真导出会落盘 + 60s 频率锁，属环境耦合，
    // 按纪律不进判据（正因为它重，闸门必须能被证明生效）。
    const backupUser = await getApiToken('stepby', CONFIG.password)
    // 取不到数一律 `null`（不是 -1）：`afterCount === baseCount` 在两边都是 -1 时也成立，
    // 那等于"列表读失败 = 判据通过"——断言扫描器的 ge-zero 规则正是为这一族写的。
    const listBackup = async () => {
      const r = await call(adminToken, 'GET', '/system/backup/list?pageNum=1&pageSize=1')
      const n = Number(r.total ?? (Array.isArray(r.rows) ? r.rows.length : NaN))
      return Number.isInteger(n) ? n : null
    }
    const baseCount = await listBackup()
    if (!backupUser) {
      record(
        M,
        '备份导出: 无 system:backup:export 的操作者被拒',
        false,
        '取不到非超管会话 ⇒ 无法验证"关闭态显式拒绝"（前置自曝）'
      )
    } else {
      const denied = await call(backupUser, 'POST', '/system/backup/self-export')
      expectReject(denied, '备份导出: 无权限操作者被拒 403（能力位关 + 角色授权兜底）', 403)
    }
    // 对照组：平台管理员能穿过权限层，落到业务层的诚实结论"平台租户没有数据包"。
    // 这一条证明上一条不是"端点根本不存在/一律 403"——同一路由、两种结局，才说明分层判定都在工作。
    const platform = await call(adminToken, 'POST', '/system/backup/self-export')
    expectReject(platform, '备份导出: 平台租户无数据包 ⇒ 404 诚实文案（对照组）', 404, '租户')
    const afterCount = await listBackup()
    record(
      M,
      '备份导出: 两次被拒都没有生成备份行（重资源零副作用）',
      baseCount !== null && afterCount !== null && afterCount === baseCount,
      `sys_backup 列表 total ${baseCount} → ${afterCount}（必须相等且都是实数；null = 列表没读到，属工具自曝）`
    )

    // ================= 三、IP 库更新入参闸门（副作用之前）=================
    const stBefore = await call(adminToken, 'GET', '/system/ipLocation/status')
    const bad = await call(adminToken, 'POST', '/system/ipLocation/update?source=e2e90bad')
    // 修前实测：非法 source 一路送进 service 的 anyhow ⇒ HTTP 500「系统内部错误」，
    // 而兄弟端点 PUT /config 对同一个值给 400 + 可读文案。同参数两套契约违反 C.8，b82 已修。
    const shapeOk = expectReject(bad, 'IP 库更新: 非法 source ⇒ 400（修前是 500 契约漂移）', 400)
    const noEcho = !String(bad.msg || '').includes('e2e90bad')
    record(
      M,
      'IP 库更新: 拒绝文案不回显入参',
      shapeOk && noEcho,
      `msg=${String(bad.msg).slice(0, 60)} 含入参=${!noEcho}`
    )
    const stAfter = await call(adminToken, 'GET', '/system/ipLocation/status')
    const factsOf = (r) => `${r?.data?.mmdbLoaded ?? '?'}/${r?.data?.mmdbSize ?? '?'}/${r?.data?.currentSource ?? '?'}`
    record(
      M,
      'IP 库更新: 闸门排在任何文件 IO 之前（库事实逐字段不变）',
      stBefore.http === 200 && stAfter.http === 200 && factsOf(stBefore) === factsOf(stAfter),
      `前 ${factsOf(stBefore)} → 后 ${factsOf(stAfter)}`
    )
    // 第二次同类非法请求必须仍是"源非法"而不是"任务进行中"——证明被拒的请求没占用 10 分钟更新锁
    const bad2 = await call(adminToken, 'POST', '/system/ipLocation/update?source=e2e90bad')
    record(
      M,
      'IP 库更新: 被拒请求未抢占更新锁（第二次仍是源非法）',
      bad2.http === 400 && !String(bad2.msg || '').includes('正在进行中'),
      `HTTP=${bad2.http} msg=${String(bad2.msg).slice(0, 60)}`
    )

    // ================= 四、租户导航 L3 挂载/改/卸（自包含候选枚举）=================
    // b81 §10 N-19① 立案：判据不得耦合库内历史。解法是**自己造一个租户**——
    // 新建租户的导航面天然全空，`options` 里 selected:false 就是可挂载候选，
    // 于是"挂载→改→卸载→复原"四步都不依赖运行库里恰好留着什么。
    const code = `e90${ts}`
    const added = await call(adminToken, 'POST', '/system/tenant', {
      tenantName: `e2e90租户${ts}`,
      tenantCode: code,
      leader: 'e2e90负责人',
      orderNum: 99,
      status: '0'
    })
    const tid = Number(added.data?.tenantId)
    record(
      M,
      '租户导航: 夹具租户创建成功（返回 tenantId 与初始化管理员名）',
      added.code === 200 && Number.isFinite(tid) && tid > 0 && !!added.data?.adminUserName,
      `POST code=${added.code} msg=${String(added.msg).slice(0, 40)} tenantId=${added.data?.tenantId} admin=${added.data?.adminUserName}`
    )

    let mountedL3 = null
    if (Number.isFinite(tid) && tid > 0) {
      const opts = await call(adminToken, 'GET', `/system/tenant/menu/options?tenantId=${tid}`)
      const cand = (Array.isArray(opts.data) ? opts.data : []).filter((o) => o.selected === false)
      record(
        M,
        '租户导航: options 给出未挂载候选（枚举面自证，不读库内历史）',
        opts.code === 200 && cand.length > 0,
        `code=${opts.code} 候选（selected=false）=${cand.length} 条`
      )
      // 挑一条可挂载的业务菜单：优先 C（页面）其次 M（目录），且必须不在平台专属前缀里，
      // 否则撞的是"平台专属未解锁"400，判的就不再是本条链路。
      const pick =
        cand.find((o) => o.menuType === 'C' && !String(o.perms || '').startsWith('monitor:server')) ||
        cand.find((o) => o.menuType === 'M') ||
        cand[0]

      if (!pick) {
        record(M, '租户导航: 挂载候选可选', false, `options 有 ${cand.length} 条但无可用的 M/C 项`)
      } else {
        const mount = await call(adminToken, 'POST', '/system/tenant/menu', {
          tenantId: tid,
          refMenuId: pick.menuId
        })
        mountedL3 = Number(mount.data?.l3Id)
        record(
          M,
          '租户导航: 挂载候选菜单成功（POST 返回 l3Id）',
          mount.code === 200 && Number.isFinite(mountedL3) && mountedL3 > 0,
          `refMenuId=${pick.menuId}(${pick.menuType}) code=${mount.code} msg=${String(mount.msg).slice(0, 40)} l3Id=${mount.data?.l3Id}`
        )

        const dup = await call(adminToken, 'POST', '/system/tenant/menu', {
          tenantId: tid,
          refMenuId: pick.menuId
        })
        expectReject(dup, '租户导航: 重复挂载被拒（不得静默幂等）', 400, '重复')

        const ghost = await call(adminToken, 'POST', '/system/tenant/menu', {
          tenantId: tid,
          refMenuId: 99999999
        })
        expectReject(ghost, '租户导航: 不存在的引用菜单被拒', 400)

        const list1 = await call(adminToken, 'GET', `/system/tenant/menu/list?tenantId=${tid}`)
        const row1 = (Array.isArray(list1.data) ? list1.data : []).find((r) => Number(r.l3Id) === mountedL3)
        record(
          M,
          '租户导航: 挂载后 list 读回该 l3 行',
          list1.code === 200 && !!row1 && String(row1.visible) === '0',
          `list=${(list1.data || []).length} 行，命中 l3Id=${mountedL3}：${JSON.stringify(row1 || {}).slice(0, 90)}`
        )

        if (row1) {
          // ★ PUT /system/tenant/menu：隐藏 + 改排序，读回必须是**写入值**（不是"请求发出去了"）
          const edit = await call(adminToken, 'PUT', '/system/tenant/menu', {
            l3Id: mountedL3,
            visible: '1',
            orderNum: 77
          })
          const list2 = await call(adminToken, 'GET', `/system/tenant/menu/list?tenantId=${tid}`)
          const row2 = (Array.isArray(list2.data) ? list2.data : []).find((r) => Number(r.l3Id) === mountedL3)
          record(
            M,
            '租户导航: PUT 改 visible/orderNum 并读回（写后读闭环）',
            edit.code === 200 && row2?.visible === '1' && Number(row2?.orderNum) === 77,
            `PUT code=${edit.code} 读回 visible=${row2?.visible} orderNum=${row2?.orderNum}（期望 1/77）`
          )

          const badPut = await call(adminToken, 'PUT', '/system/tenant/menu', {
            l3Id: 99999999,
            visible: '1'
          })
          expectReject(badPut, '租户导航: PUT 未知 l3Id 必须 404（不得 0 行也算成功）', 404)

          // ★ DELETE /system/tenant/menu/{l3Id}：卸载 + 读回 + 反证重复卸载
          const del = await call(adminToken, 'DELETE', `/system/tenant/menu/${mountedL3}`)
          const list3 = await call(adminToken, 'GET', `/system/tenant/menu/list?tenantId=${tid}`)
          const still = (Array.isArray(list3.data) ? list3.data : []).some((r) => Number(r.l3Id) === mountedL3)
          record(
            M,
            '租户导航: DELETE 卸载并读回消失（不留活跃导航行）',
            del.code === 200 && !still,
            `DELETE code=${del.code} 列表仍含该 l3=${still}`
          )
          const del2 = await call(adminToken, 'DELETE', `/system/tenant/menu/${mountedL3}`)
          expectReject(del2, '租户导航: 重复卸载 404（已不在册的行不得再算成功）', 404)

          const opts2 = await call(adminToken, 'GET', `/system/tenant/menu/options?tenantId=${tid}`)
          const back = (Array.isArray(opts2.data) ? opts2.data : []).find(
            (o) => Number(o.menuId) === Number(pick.menuId)
          )
          record(
            M,
            '租户导航: 卸载后候选重新可选（闭环复原，可重放）',
            back?.selected === false,
            `menuId=${pick.menuId} selected=${back?.selected}（期望 false）`
          )
        }
      }

      // 收尾：先删租户初始化管理员（后端按"租户下仍有用户"正确拒绝删除租户），再删租户进回收站。
      // sys_tenant / sys_tenant_menu 的物理清扫由 residue-cleanup 的 `tenants` +
      // `tenant_menu_orphan` 两步负责（顺序也是判据，见该文件注释）。
      const adminName = added.data?.adminUserName
      let userCleared = false
      if (adminName) {
        const ul = await call(
          adminToken,
          'GET',
          `/system/user/list?userName=${encodeURIComponent(adminName)}&pageNum=1&pageSize=10`
        )
        const uid = (Array.isArray(ul.rows) ? ul.rows : []).find((u) => u.userName === adminName)?.userId
        if (uid) {
          const ud = await call(adminToken, 'DELETE', `/system/user/${uid}`)
          userCleared = ud.code === 200
        } else {
          record(M, '租户导航: 收尾能查到初始化管理员', false, `userName=${adminName} 在 list 里没命中`)
        }
      }
      const delTenant = await call(adminToken, 'DELETE', `/system/tenant/${tid}`)
      const leftList = await call(adminToken, 'GET', `/system/tenant/list?tenantCode=${code}`)
      const leftRows = Array.isArray(leftList.data) ? leftList.data : []
      record(
        M,
        '租户导航: 夹具租户收尾删除（管理员先删，租户进回收站）',
        userCleared && delTenant.code === 200 && leftRows.length === 0,
        `清理管理员=${userCleared} DELETE tenant code=${delTenant.code} msg=${String(delTenant.msg).slice(0, 40)}，列表仍见 ${leftRows.length} 行（必须 0）`
      )
    }

    // ================= 五、用户导入 xlsx 全闭环（b83：模板 → 自建 → 落库 → 查重 → 改 → 清）==========
    // 为什么自己造 xlsx 而不回传模板：模板示例行是固定的 `zhangsan`，导入成功就会在库里留下
    // **不属于 `e2e%` 命名族**的用户（`residue-cleanup` 覆盖不到 ⇒ 残留每轮 +1 无人报），
    // 而第二次跑它会变成"用户名不能重复" ⇒ 判据结论由上一轮决定（环境耦合）。
    // 夹具生成器与它的 ZIP 结构自证在 `xlsx-fixture.mjs`；后端读侧是 calamine，实测接受。
    const IMP_HEADERS = ['登录名称*', '用户姓名*', '部门名称', '手机号码', '邮箱', '性别', '状态']
    const impUser = `e2e90imp${ts}`
    const impOther = `e2e90imx${ts}`

    // ① 模板下载：判"是 zip + 两个头对 + 体量像真表"，内容正确性由后面真导入证
    let tpl
    try {
      const resp = await fetch(`${B}/system/user/importTemplate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      const buf = new Uint8Array(await resp.arrayBuffer())
      tpl = {
        http: resp.status,
        ct: resp.headers.get('content-type') || '',
        cd: resp.headers.get('content-disposition') || '',
        len: buf.length,
        isZip: buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4
      }
    } catch (e) {
      tpl = { http: 0, ct: '', cd: '', len: 0, isZip: false, err: String(e.message).slice(0, 60) }
    }
    record(
      M,
      '用户导入: 模板下载返回可辨识的 xlsx 字节流',
      tpl.http === 200 &&
        tpl.isZip &&
        tpl.len > 1000 &&
        tpl.ct.includes('spreadsheetml.sheet') &&
        tpl.cd.includes('user_import_template.xlsx'),
      `HTTP=${tpl.http} PK=${tpl.isZip} 字节=${tpl.len} ct=${tpl.ct.slice(0, 60)} cd=${tpl.cd.slice(0, 46)}${tpl.err ? ` err=${tpl.err}` : ''}`
    )

    /**
     * multipart 导入。限流敏感档 = 容量 5 / 0.1 s⁻¹（探针实测第 6 发起 429），
     * 本模块总共只发 **4** 发，且每发之间留间隔；429 一律记 FAIL 并写明第几发，
     * 不得读成"没有失败"。
     */
    const importXlsx = async (rows, updateSupport, label) => {
      const bytes = buildXlsx('用户导入', IMP_HEADERS, rows)
      const fd = new FormData()
      fd.append(
        'file',
        new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `e2e90imp-${label}.xlsx`
      )
      try {
        const r = await fetch(`${B}/system/user/importData?updateSupport=${updateSupport}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: fd
        })
        const j = await r.json().catch(() => null)
        const rawSuccess = j?.data?.success
        return {
          http: r.status,
          code: j?.code ?? null,
          msg: String(j?.msg ?? ''),
          // 取不到数一律 `null`（不是 0/-1）：`success === 0` 在"根本没这个字段"时也可能被
          // 后面的判据读成"确实是 0 条"，那等于把响应形状坏了当成判据通过
          success: rawSuccess == null || !Number.isFinite(Number(rawSuccess)) ? null : Number(rawSuccess),
          errors: Array.isArray(j?.data?.errorList) ? j.data.errorList : null,
          bytes: bytes.length
        }
      } catch (e) {
        return {
          http: 0,
          code: null,
          msg: `请求本身失败: ${String(e.message).slice(0, 60)}`,
          success: null,
          errors: null,
          bytes: bytes.length
        }
      }
    }
    /** 读侧：`sys_user` 的权威面是列表接口，按 userName 精确读回（不靠导入响应的自述） */
    const readImp = async (name) => {
      const r = await call(adminToken, 'GET', `/system/user/list?userName=${name}&pageNum=1&pageSize=10`)
      return (Array.isArray(r.rows) ? r.rows : []).find((u) => u.userName === name) || null
    }

    // ② 新建：success=1 **且库里真读得到那一行**（响应说成功不等于落库）
    const mk = await importXlsx([[impUser, '导入甲', '', '13900000000', '', '男', '正常']], 0, 'create')
    await sleep(300)
    const row1 = await readImp(impUser)
    record(
      M,
      '用户导入: 新建行 success=1 且写后读回（昵称/手机号落库）',
      mk.http === 200 &&
        mk.code === 200 &&
        mk.success === 1 &&
        (mk.errors === null || mk.errors.length === 0) &&
        !!row1 &&
        row1.nickName === '导入甲' &&
        String(row1.phonenumber || '') === '13900000000',
      `HTTP=${mk.http} code=${mk.code} success=${mk.success} errorList=${JSON.stringify(mk.errors || []).slice(0, 60)} 读回=${JSON.stringify(row1 || {}).slice(0, 90)} 发送字节=${mk.bytes}`
    )

    // ③ 重复登录名（updateSupport=0）：**整体 200 + 逐项结果**这一族（b79 ④）——
    // HTTP 与 body.code 都是 200，失败只写在 data.errorList 里，只看状态码必然全绿。
    const dup = await importXlsx([[impUser, '导入甲改名', '', '', '', '男', '正常']], 0, 'dup')
    await sleep(300)
    const dupErr = String(dup.errors?.[0]?.error || '')
    record(
      M,
      '用户导入: 重复登录名 ⇒ 整体 200 但 success=0 且逐项回显（判响应体不判状态码）',
      dup.http === 200 &&
        dup.code === 200 &&
        dup.success === 0 &&
        Array.isArray(dup.errors) &&
        dup.errors.length === 1 &&
        dupErr.includes('不能重复') &&
        Number(dup.errors[0]?.rowNum) === 2,
      `HTTP=${dup.http} code=${dup.code} success=${dup.success} errorList=${JSON.stringify(dup.errors || []).slice(0, 110)}`
    )
    // 反证配对：被拒的那一行**不得改到已有用户**（读回昵称仍是 ②写的值）。
    // 只看"success=0"分不出"拒绝且无副作用"与"先改了再报重复"。
    const row2 = await readImp(impUser)
    record(
      M,
      '用户导入: 被拒的重复行未改动既有用户（无副作用）',
      !!row2 && row2.nickName === '导入甲',
      `读回 nickName=${row2?.nickName}（期望仍是「导入甲」，若是「导入甲改名」说明先写后拒）`
    )

    // ④ updateSupport=1 真更新：写后读回新昵称（这才是"更新"分支的闭环，不是只发了请求）
    const up = await importXlsx([[impUser, '导入乙', '', '', '', '女', '正常']], 1, 'update')
    await sleep(300)
    const row3 = await readImp(impUser)
    record(
      M,
      '用户导入: updateSupport=1 覆盖资料字段并读回（写后读闭环）',
      up.http === 200 && up.success === 1 && !!row3 && row3.nickName === '导入乙',
      `HTTP=${up.http} success=${up.success} 读回 nickName=${row3?.nickName}（期望「导入乙」）`
    )

    // ⑤ 两行都在**结构/引用校验阶段**被拒：缺姓名 + 部门不存在 ⇒ 一次调用两条逐项错误，
    // 且两行都不得落库（读侧与写侧同一谓词；`success=0` 不等于"没写"，必须回查）。
    const badRows = await importXlsx(
      [
        [impOther, ''],
        [`${impOther}b`, '丙', 'e2e90不存在的部门']
      ],
      0,
      'bad'
    )
    const gone1 = await readImp(impOther)
    const gone2 = await readImp(`${impOther}b`)
    const errText = (badRows.errors || []).map((e) => String(e.error || '')).join('|')
    record(
      M,
      '用户导入: 缺必填与部门不存在两类校验错误逐行回显',
      badRows.http === 200 &&
        badRows.success === 0 &&
        Array.isArray(badRows.errors) &&
        badRows.errors.length === 2 &&
        errText.includes('用户姓名不能为空') &&
        errText.includes('不存在'),
      `success=${badRows.success} errorList=${JSON.stringify(badRows.errors || []).slice(0, 130)}`
    )
    record(
      M,
      '用户导入: 被拒的两行都没有落库（反证配对）',
      !gone1 && !gone2,
      `读回 ${impOther}=${JSON.stringify(gone1 || {}).slice(0, 40)} ${impOther}b=${JSON.stringify(gone2 || {}).slice(0, 40)}（都必须是 null）`
    )

    // ⑥ 收尾：删除 ②建的那一行并读回消失。命名族本身也在 `residue-cleanup` 的 `e2e%` 谓词内，
    // 两道都要成立——模块内删除证明"能删干净"，命名族登记证明"漏删也有人收"。
    if (row3?.userId) {
      const del = await call(adminToken, 'DELETE', `/system/user/${row3.userId}`)
      const after = await readImp(impUser)
      record(
        M,
        '用户导入: 夹具用户收尾删除并读回消失（不留活跃行）',
        del.code === 200 && !after,
        `DELETE code=${del.code} msg=${String(del.msg).slice(0, 40)} 列表仍见=${JSON.stringify(after || {}).slice(0, 60)}`
      )
    } else {
      record(
        M,
        '用户导入: 夹具用户收尾删除并读回消失（不留活跃行）',
        false,
        '②④ 都没能读回 userId ⇒ 导入其实没落库，收尾无从执行（前置自曝，不是产品缺陷）'
      )
    }

    checkConsoleErrors(consoleErrors, pageErrors, M)
    await sleep(100)
  }
}
