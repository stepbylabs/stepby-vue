/**
 * e2e 残留自清理（共用实现，b78 抽出）。
 *
 * 为什么抽出来：这段清理原本只存在于 `main.mjs` 的 `cleanupE2eResidue()` 里，
 * 而 **deep-e2e.mjs 有 86 个模块同样在造数据，却完全没有收尾**——单独跑一次
 * deep-e2e 就把 dept/post/role/hook/oauth/report/flow 等残留留在库里（b78 实测：
 * 一个遗留的活跃 webhook 在 8 分钟内产出 12 条失败投递，因为 `event_types` 空串
 * = 订阅全部事件，每次登录都触发一次必失败的出站投递）。
 *
 * 抽成模块而不是"在 deep-e2e 里再抄一份"：两份清单必然漂移（同 b78 R-22 的教训），
 * 加一张表只改一处。main.mjs 通过包装函数调用本模块，行为与之前逐条一致。
 *
 * 调用方需传入：dbPath（运行库路径）、log（日志函数）、cleanupRunUploads（上传清理，可选）。
 */

/** 延迟导入 node:sqlite（统一入口，便于 mock/替换） */
async function importSyncDatabase() {
  const mod = await import('node:sqlite')
  return mod
}

/**
 * 清理谓词清单（**模块级导出**，b79）。
 *
 * 为什么不在函数里内联：`test-data-audit.mjs` 要把"某行到底会不会被清掉"判成**事实**，
 * 唯一可靠的办法是拿同一份谓词文本回库里对它执行一次存在性查询。若审计脚本自己手抄
 * 一份 LIKE 模式，就成了第二个事实源——b78 实测过这个形状的后果（清理写 `'e2e75-%'`、
 * 用例产出 `'e2e75b-doc-…'`，两边手抄各自"看着对"，残留每轮 +1 却没人报）。
 * 导出后两侧共用，加一张表只改这里。
 */
export const RESIDUE_STEPS = [
  ['role_menu', "DELETE FROM sys_role_menu WHERE role_id IN (SELECT role_id FROM sys_role WHERE del_flag='2')"],
  ['user_role', "DELETE FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_user WHERE del_flag='2')"],
  [
    'user_post',
    "DELETE FROM sys_user_post WHERE user_id IN (SELECT user_id FROM sys_user WHERE del_flag='2') OR post_id IN (SELECT post_id FROM sys_post WHERE del_flag='2')"
  ],
  ['users', "DELETE FROM sys_user WHERE del_flag='2'"],
  ['depts', "DELETE FROM sys_dept WHERE del_flag='2'"],
  ['roles', "DELETE FROM sys_role WHERE del_flag='2'"],
  ['posts', "DELETE FROM sys_post WHERE del_flag='2' OR post_code LIKE 'test%'"],
  ['tenants', "DELETE FROM sys_tenant WHERE del_flag='2'"],
  // 租户行被**物理**清掉后，其子表必须一并收口（b81 实测：dev 库 tenant 表为空但
  // sys_tenant_menu 还留着一条活跃行）。顺序同样是判据：这两步必须排在 `tenants` 之后，
  // 否则同一轮刚被删掉的租户，其域名/导航行在删除前还"看得到租户"，孤儿清理会漏掉它们
  // （同 `findUnpairedNoticeCleanup` 对"先删公告再删已读"的顺序不变式）。
  ['tenant_domain_orphan', 'DELETE FROM sys_tenant_domain WHERE tenant_id NOT IN (SELECT tenant_id FROM sys_tenant)'],
  ['tenant_menu_orphan', 'DELETE FROM sys_tenant_menu WHERE tenant_id NOT IN (SELECT tenant_id FROM sys_tenant)'],
  // 批三十六：dict/pat/config 残留治理（r43 巡检实证：dict 软删 127 行、PAT 261 行、config 2 行
  // 不在清理范围 → 每轮全量无限增长）。仅删 e2e 前缀 + 已软删/已吊销行，在册数据不受影响。
  [
    'dict_data',
    "DELETE FROM sys_dict_data WHERE dict_type IN (SELECT dict_type FROM sys_dict_type WHERE dict_type LIKE 'e2e%' AND del_flag='2')"
  ],
  ['dict_type', "DELETE FROM sys_dict_type WHERE dict_type LIKE 'e2e%' AND del_flag='2'"],
  // 批八十八：`status='1'` 只删**已吊销**的 e2e 令牌（`sys_pat.status`：'0' 有效 / '1' 已吊销，
  // 见 `stepby-axum/src/entity/sys_pat.rs` 头部注释）。主套件 F140 那一路是"建 → 断 → API 删"，
  // 删完落成 '1' 因而被上面那条收走；但**中途崩掉的轮次**留下的活跃 e2e PAT 谁都不清
  // （`pat_expired` 只按 `expires_at` 清，而夹具多带 `expireDays`，未到期的活跃行就长期堆着）。
  // 前缀 `e2e%` 已经是命名族判据（不是业务数据），所以按前缀全清，不再附加状态条件。
  // 注：`test-data-audit.mjs` 的 `SYNTH_STEPS` 里那条同名 `pat` 谓词是**自检夹具**，
  // 形状与真表刻意不同（它要靠"三条已吊销 + 一条活跃"来验"族内分裂不得取样漏报"），
  // 改本条不需要、也不应该改它。
  ['pat', "DELETE FROM sys_pat WHERE name LIKE 'e2e%'"],
  ['config', "DELETE FROM sys_config WHERE config_key LIKE 'e2e%'"],
  // 批七十九 M87：「批量已读落库证明」会给当前账号写 sys_notice_read 行。
  // 公告本体用例自己经 API 删（软删/物理删两态都可能留行），但**已读记录没有对外的删除接口**
  // （属用户态）⇒ 不清就成了指向已删公告的孤儿行，且每轮 +1。按标题前缀连带收口。
  // 批七十九 M1：「批量已读选中态」改为**自建未读夹具**（P3 之后已读态是服务端事实，
  // 靠库里恰好有未读行＝把判据耦合到运行库历史）。夹具用例内已 DELETE，这里兜底同前缀。
  // 批八十 M25：「横幅按最新公告可见」也建一条真实公告（noticeType='2'，前缀 E2E25）。
  // 两个前缀**合并在同一条语句**里：同表同名的两条条目会让任何按 name 建索引的下游
  // （报告、对账）静默吞掉一条——清理顺序必须保持「先子表已读、后公告本体」，否则子查询按标题
  // 找不到刚被删掉的公告。
  [
    'notice_read',
    "DELETE FROM sys_notice_read WHERE notice_id IN (SELECT notice_id FROM sys_notice WHERE notice_title LIKE 'E2E87%' OR notice_title LIKE 'E2EM1%' OR notice_title LIKE 'E2E25%')"
  ],
  [
    'notice',
    "DELETE FROM sys_notice WHERE notice_title LIKE 'E2E87%' OR notice_title LIKE 'E2EM1%' OR notice_title LIKE 'E2E25%'"
  ],
  // 批三十九：F75 请假单链路残留（doc/task/log 三表，每轮 +1 链）——r49 巡检实证 136 链
  // b78 修正：判据原为 'e2e75-%'，而 deep-e2e M75 实际生成的是 **'e2e75b-doc-…'**，
  // 前缀不匹配 ⇒ 每轮残留 1 单 + 3 任务从未被清（回库实测 5 单 / 15 任务）。
  // 改为 'e2e75%' 同时覆盖 e2e75- 与 e2e75b- 两种命名。
  // b82 再放宽到 'e2e%'：同一失效形状第三次出现——M90 的重提交夹具命名 'e2e90-flow-*'，
  // 按批次号写死前缀的谓词每加一批就得跟一次，漏一次就是"每轮 +1 且无人报"。
  // 与 flow_graph_doc 的 'e2e%' 同口径（该表从 b74 起就按族清，没再出过问题）。
  ['f75_log', "DELETE FROM sys_flow_log WHERE biz_id IN (SELECT doc_id FROM flow_demo_doc WHERE title LIKE 'e2e%')"],
  ['f75_task', "DELETE FROM sys_flow_task WHERE biz_id IN (SELECT doc_id FROM flow_demo_doc WHERE title LIKE 'e2e%')"],
  ['f75_doc', "DELETE FROM flow_demo_doc WHERE title LIKE 'e2e%'"],
  // 批三十九：flow_definition 软删行物理清除（F89 it_graph_* / F133 designer 自动码 flow_<ts>
  // ——API 删除为软删 del_flag=1，list 已过滤但 DB 持续累积；r50 巡检 6 行）
  [
    'flow_def',
    "DELETE FROM flow_definition WHERE del_flag=1 AND (flow_code GLOB 'it_*' OR flow_code GLOB 'flow_[0-9]*' OR flow_code GLOB 'e2e-*')"
  ],
  ['flow_graphdoc', "DELETE FROM flow_graph_doc WHERE del_flag=1 AND flow_code GLOB 'it_*'"],
  // 批五十四：r59 巡检实证新增残留类别（历史中断轮遗留）——webhook 413 行全 e2e
  // （9 个活跃 E2E79_* 直接产生 7.1 万条失败投递日志）、oauth client 201 行全 e2e
  // （4 个活跃 E2E-SSO-* 残留）、PAT 过期 11 枚、报表族全 e2e 命名（report 38 /
  // dashboard 16 / dataset 131 / sub 7）。仅删 e2e/probe 命名与孤儿行，种子数据零命中。
  [
    'webhook_log_e2e',
    "DELETE FROM sys_web_hook_log WHERE hook_id IN (SELECT id FROM sys_web_hook WHERE lower(hook_name) LIKE 'e2e%' OR hook_name LIKE 'probe-diag-%')"
  ],
  ['webhook_e2e', "DELETE FROM sys_web_hook WHERE lower(hook_name) LIKE 'e2e%' OR hook_name LIKE 'probe-diag-%'"],
  ['oauth_client_e2e', "DELETE FROM sys_oauth_client WHERE lower(client_name) LIKE 'e2e-%' OR remark LIKE 'e2e%'"],
  ['pat_expired', 'DELETE FROM sys_pat WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP'],
  ['report_sub_orphan', 'DELETE FROM sys_report_sub WHERE report_id NOT IN (SELECT report_id FROM sys_report)'],
  ['report_e2e', "DELETE FROM sys_report WHERE lower(report_name) LIKE 'e2e%'"],
  ['dashboard_e2e', "DELETE FROM report_dashboard WHERE lower(dashboard_name) LIKE 'e2e-%'"],
  ['dataset_e2e', "DELETE FROM report_dataset WHERE lower(dataset_name) LIKE 'e2e%' OR dataset_name LIKE 'probe %'"],
  // 批六十四：report_board 残留治理（回库取证：reportboard-smoke.mjs 遗留 smoke-board-*
  // 2 行自 2026-10-03 起未清；F140 新增 e2e140-board-* 自清理）
  [
    'report_board_e2e',
    "DELETE FROM sys_report_board WHERE name LIKE 'smoke-board-%' OR name LIKE 'e2e140-%' OR name LIKE 'e2e-%'"
  ],
  // 批六十四循环：sys_post 软删残留物理清扫（数据审计实证：负路径"删除后行消失"
  // 用例的已删行 del_flag='2' 长期留存——如 E2E610185_deleted_617 自 2026-10-13 起）
  [
    'sys_post_e2e',
    "DELETE FROM sys_post WHERE (post_code LIKE 'e2e%' OR post_code LIKE 'E2E%' OR post_name LIKE '%【e2e%') AND del_flag = '2'"
  ],
  // local 档共享态过期键物理清扫（对齐后端 cleanup_expired_logs 批五十四新增步骤）
  [
    'shared_kv_expired',
    "DELETE FROM sys_shared_kv WHERE expire_at IS NOT NULL AND expire_at < CAST(strftime('%s','now') AS INTEGER) * 1000"
  ],
  // F15 i18n 字典测试链：改名 *_deleted_N 后软删（r59 巡检 306 行）
  ['dict_data_i18n', "DELETE FROM sys_dict_data WHERE dict_type LIKE 'i18n_test_%'"],
  ['dict_type_i18n', "DELETE FROM sys_dict_type WHERE dict_type LIKE 'i18n_test_%'"],
  // b120：F145（b119 立）的夹具是 `e2e<批号>_<随机>` 的字典类型 + 11 条数据。正常路径在
  // 用例 finally 里 API 自清，但**中断轮**（被 kill / 清理请求失败）留下的类型行不带
  // `del_flag='2'`，既不在 `e2e%` 软删那一步、也不在 i18n_test_ 族 ⇒ b120 全量轮 testdata
  // 实测 14 个命名族长期累积。命名族判据按 `e2e<数字>_` / `e2e<数字>-` 收口，
  // 种子字典类型（sys_user_sex 等）不命中。
  ['dict_data_e2e', "DELETE FROM sys_dict_data WHERE dict_type GLOB 'e2e[0-9]*'"],
  ['dict_type_e2e', "DELETE FROM sys_dict_type WHERE dict_type GLOB 'e2e[0-9]*'"],
  // F14 字典 CRUD 链：改名 testdict<ts>_deleted 后软删（r59 巡检 161 行）
  ['dict_data_testdict', "DELETE FROM sys_dict_data WHERE dict_type LIKE 'testdict%'"],
  ['dict_type_testdict', "DELETE FROM sys_dict_type WHERE dict_type LIKE 'testdict%'"],
  // 批五十五：r60 巡检实证——graph doc 链（M85/F133 每轮 +2 单据；doc 被既有清理删除后
  // task/log 成孤儿：任务 70/log 全族 biz_type=flow_graph_doc）、AI 会话（F86 探针累积
  // 113 行零清理）、OAuth provider（E2E81 活跃残留 1）
  [
    'graphdoc_log_e2e',
    "DELETE FROM sys_flow_log WHERE biz_id IN (SELECT doc_id FROM flow_graph_doc WHERE title LIKE 'e2e%')"
  ],
  [
    'graphdoc_task_e2e',
    "DELETE FROM sys_flow_task WHERE biz_id IN (SELECT doc_id FROM flow_graph_doc WHERE title LIKE 'e2e%')"
  ],
  ['graphdoc_e2e', "DELETE FROM flow_graph_doc WHERE title LIKE 'e2e%'"],
  [
    'flow_task_orphan',
    "DELETE FROM sys_flow_task WHERE biz_type='flow_graph_doc' AND biz_id NOT IN (SELECT doc_id FROM flow_graph_doc)"
  ],
  [
    'flow_log_orphan',
    "DELETE FROM sys_flow_log WHERE biz_type='flow_graph_doc' AND biz_id NOT IN (SELECT doc_id FROM flow_graph_doc)"
  ],
  ['ai_chat_e2e', "DELETE FROM ai_chat_history WHERE question LIKE 'e2e%'"],
  ['oauth_provider_e2e', "DELETE FROM sys_oauth_provider WHERE lower(provider_name) LIKE 'e2e%'"],
  // 批五十六：r61 巡检实证——F23 菜单 CRUD 链软删 107 行物理残留（API 删除=软删，
  // 既有兜底清理仅断言不遗留活跃行）+ role2 授权漂移 4 行（权限树用例中断轮遗留）
  [
    'menu_rolemenu_e2e',
    "DELETE FROM sys_role_menu WHERE menu_id IN (SELECT menu_id FROM sys_menu WHERE menu_name LIKE '测试菜单改%')"
  ],
  ['menu_softdel_e2e', "DELETE FROM sys_menu WHERE menu_name LIKE '测试菜单改%'"],
  ['rolemenu_role2_residue', 'DELETE FROM sys_role_menu WHERE role_id=2 AND menu_id IN (4103,4111,4116,4117)'],
  // 批六十五：passkeys（WebAuthn）e2e 残留治理——F106① 现走**真实注册成功链**
  // （CDP 虚拟认证器 → registerFinish 200），每轮会落 sys_user_credential 一行；
  // 注册名统一 e2e 前缀（e2e-pk-*），物理清除（凭据行无软删语义，直接 DELETE）。
  ['user_credential_e2e', "DELETE FROM sys_user_credential WHERE name LIKE 'e2e%' OR name LIKE 'probe%'"],
  // 批七十三轮 15：软删 e2e 账号残留物理清扫（`scripts/db_state_audit.py` 回库实证：
  // del_flag='2' 的 `e2e_ui_*_deleted_*` 长期留存，且 sys_logininfor / sys_user_role /
  // sys_audit_change 对其引用均为 0 ⇒ 属可安全物理清除的测试垃圾，而非审计引用保留）。
  // 顺序：先清关联表（否则会留下指向已删用户的孤儿行），再清用户本体；PAT 一并清（
  // 令牌属主已删即失效，留着只是噪声）。只碰 del_flag='2' 行，活跃账号零风险。
  [
    'user_softdel_assoc_e2e',
    `DELETE FROM sys_user_role WHERE user_id IN (
           SELECT user_id FROM sys_user WHERE lower(user_name) LIKE 'e2e%' AND del_flag = '2')`
  ],
  [
    'user_softdel_post_e2e',
    `DELETE FROM sys_user_post WHERE user_id IN (
           SELECT user_id FROM sys_user WHERE lower(user_name) LIKE 'e2e%' AND del_flag = '2')`
  ],
  [
    'user_softdel_dept_e2e',
    `DELETE FROM sys_user_dept WHERE user_id IN (
           SELECT user_id FROM sys_user WHERE lower(user_name) LIKE 'e2e%' AND del_flag = '2')`
  ],
  [
    'user_softdel_pat_e2e',
    `DELETE FROM sys_pat WHERE user_id IN (
           SELECT user_id FROM sys_user WHERE lower(user_name) LIKE 'e2e%' AND del_flag = '2')`
  ],
  ['user_softdel_e2e', "DELETE FROM sys_user WHERE lower(user_name) LIKE 'e2e%' AND del_flag = '2'"],
  // 批七十四 B1：sys_data_rule 残留（回库实测 158 行 = 1 行在册业务数据 + 157 行 e2e 残留，
  // 命名族 e2e-rolereflect-* 91 行 / e2e-132-dr-* 66 行）。既有 12 张表的清理**不含本表**
  // ⇒ 单条用例的 `DELETE /system/dataRule/{id}` 一旦失败即成永久孤儿，每轮全量继续累积。
  // 判据取 lower(rule_name) LIKE 'e2e-%'（与 webhook/oauth 族同口径），
  // 中文名在册行（rule_id=1）零命中；**不改写历史行的 create_time**——
  // 无法证明每行的真实来源时区，批量 ±8h 属臆测性数据修复（台账 §3.2-4）。
  ['data_rule_e2e', "DELETE FROM sys_data_rule WHERE lower(rule_name) LIKE 'e2e-%'"],
  // 批七十九（测试数据态审计首跑抓到的两族，见台账 §7.18）：
  // ① SCIM 组。回库实测 15 行 `e2e_scim_grp_*` / `e2e_scim_probe_*` **全部 del_flag='2'**
  //    ⇒ F118 的 ③ 清理（`scimDeleteGroupByName` → `DELETE /scim/v2/Groups`）本身是成功的，
  //    产品侧 SCIM 删除是**软删**；缺的是"软删行的物理清扫"，与 sys_post / sys_menu / sys_user
  //    三族同形。判据只碰 e2e 命名族 **且** 已软删的行 ⇒ 正在被用例使用的活跃组零风险，
  //    活跃残留若出现仍会被审计报成盲区（那是"用例中断"的真实信号，不该静默清掉）。
  //    子表（成员/绑定）先清，否则留下指向已删组的孤儿行——那正是本审计"跨表孤儿"会报的形状。
  [
    'scim_member_e2e',
    "DELETE FROM sys_scim_group_member WHERE group_id IN (SELECT group_id FROM sys_scim_group WHERE lower(display_name) LIKE 'e2e%' AND del_flag = '2')"
  ],
  [
    'scim_binding_e2e',
    "DELETE FROM sys_scim_group_binding WHERE group_id IN (SELECT group_id FROM sys_scim_group WHERE lower(display_name) LIKE 'e2e%' AND del_flag = '2')"
  ],
  ['scim_group_softdel_e2e', "DELETE FROM sys_scim_group WHERE lower(display_name) LIKE 'e2e%' AND del_flag = '2'"],
  // ② 报表订阅：已有 `report_e2e`（报表本体）与 `report_sub_orphan`（父报表已删的订阅）两把，
  //    但**父报表在册、订阅名却是 e2e 族**的那一行两把都不碰 ⇒ 实测残留 1 行（del_flag='2'）。
  ['report_sub_e2e', "DELETE FROM sys_report_sub WHERE lower(sub_name) LIKE 'e2e%'"],
  // 批七十九 M88：定时任务全链（新建→修改→删除）走的是产品自己的**软删**
  // （`sys_job_service.rs` 的 `delete_jobs` 置 `del_flag='2'`），列表回查看不见但库里每轮 +1。
  // 判据与 sys_user / sys_role / sys_dept 三族同形：只碰 e2e 命名族 **且** 已软删的行。
  // 在册业务任务（`retention` 那条每日 03:00 的清理任务等）零命中。
  ['job_softdel_e2e', "DELETE FROM sys_job WHERE lower(job_name) LIKE 'e2e%' AND del_flag = '2'"],
  // 批八十一 M88：代码生成全链（结构化建表→导入→同步→改→删配置→DROP 物理表）。
  // 正常路径自清，但**中断轮**会留下 gen_table 行与 e2egen<ts> 物理表；删除配置不级联列定义
  // ⇒ 必须先清 gen_table_column，否则留下指向已删配置的孤儿行（test-data-audit 会报跨表孤儿）。
  [
    'gen_table_column_e2e',
    "DELETE FROM gen_table_column WHERE table_id IN (SELECT table_id FROM gen_table WHERE lower(table_name) LIKE 'e2egen%')"
  ],
  ['gen_table_e2e', "DELETE FROM gen_table WHERE lower(table_name) LIKE 'e2egen%'"],
  // 批八十一 M88：消息记录夹具（产品没有"造失败终态"的接口，只能直接落库）。
  // remark 是夹具唯一标记；正常路径在 finally 物理删除，进程被杀时由这条兜底，
  // 否则 status='1' 的失败记录会永久留在发送日志里，下一轮数据审计把它当真实业务失败报。
  ['msg_send_log_fixture', "DELETE FROM sys_msg_send_log WHERE remark = 'b81 e2e fixture'"]
]

export async function cleanupE2eResidue({ dbPath, log = () => {}, cleanupRunUploads = null }) {
  if (process.env.E2E_SKIP_CLEANUP === '1') return
  try {
    const mod = await importSyncDatabase()
    const DatabaseSync = mod.DatabaseSync
    const db = new DatabaseSync(dbPath)
    db.exec('PRAGMA busy_timeout = 5000')
    let total = 0
    // 逐条计数（b79 N-18）：只打总数时"这一轮到底是谁删的"必须靠事后 forensic 才能回答，
    // 而实测代价就是 §7.18 那条归因链多花了 5 次只读查询才闭合。非零条目逐条打，归因即自证。
    const nonZero = []
    for (const [name, sql] of RESIDUE_STEPS) {
      try {
        const c = db.prepare(sql).run().changes
        total += c
        if (c > 0) nonZero.push(`${name}=${c}`)
      } catch (e) {
        log(`  残留清理跳过 ${name}: ${String(e).slice(0, 80)}`)
      }
    }
    // 代码生成的物理表不在 SQL 谓词清单里（RESIDUE_STEPS 只做 DELETE）。M88 正常路径
    // 自建自 DROP，中断轮会留下 e2egen<ts>；名字先过严格正则再插值，避免清理器自己变成
    // "按 LIKE 拼 DDL"的注入面（前缀命中但形态不符一律不碰）。
    const dropped = []
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'e2egen%'").all()
      for (const row of tables) {
        const name = String(row.name)
        if (!/^e2egen\d+$/.test(name)) continue
        db.exec(`DROP TABLE IF EXISTS "${name}"`)
        dropped.push(name)
      }
    } catch (e) {
      log(`  物理表清理跳过: ${String(e).slice(0, 80)}`)
    }
    db.close()
    log(`🧹 e2e 残留自清理完成：${total} 行（软删测试数据物理清除）`)
    log(`  清理逐条非零：${nonZero.join(', ') || '(本轮无行被删)'}`)
    if (dropped.length) log(`  物理表已 DROP：${dropped.join(', ')}`)
  } catch (e) {
    log(`  残留自清理失败（不影响测试结果）: ${String(e).slice(0, 120)}`)
  }
  // 批六十六：清理本次运行产生的**上传文件**残留（本地存储后端真实落盘，历史累积 1.3 GB）
  if (cleanupRunUploads) await cleanupRunUploads()
}
