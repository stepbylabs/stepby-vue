/**
 * 测试数据态审计（b79 新增，常驻门禁）。
 *
 * 它回答两个"跑批全绿但库在烂"的问题：
 *
 * ① **清理盲区**：测试造出来的行，有没有任何一条清理谓词会把它删掉？
 *    `residue-cleanup.mjs` 的谓词表是"什么算测试垃圾"的唯一事实源，而 b78 实测过它的失效
 *    形状：清理写 `'e2e75-%'`、用例产出 `'e2e75b-doc-…'`，两边各自"看着对"，残留每轮 +1，
 *    且**没有任何门禁会报**（清理只是静默少删，套件只断言业务链路）。本判据把"谓词表"和
 *    "库里真实存在的命名族"做双向对账：命中测试信号却没有被任何谓词覆盖 ⇒ 红。
 *    覆盖判定**不重implement LIKE 语义**——直接拿 `RESIDUE_STEPS` 里的谓词原文对该行执行一次
 *    存在性查询（`SELECT EXISTS(... WHERE (<谓词>) AND <pk>=?)`），谓词改了判据自动跟着改。
 *
 * ② **数据终态**：软删残留、跨表孤儿、状态枚举越界、未来时间。这些清理谓词一条都不检查
 *    （它只删，不判），而 `scripts/db_state_audit.py` 查的是"业务数据卫生"（超期未清、
 *    锚点段完整性），两边不重叠。本工具专查**测试自己写出来的**那部分终态。
 *
 * 为什么是 .mjs 而不是继续用一次性 python 探针：探针的谓词清单是**手抄**的（抄一份
 * residue-cleanup 的 LIKE 出来），手抄必然漂移——这正是上面那条纪律反复强调的形状。
 *
 * 运行前置：需要**已初始化的运行库**（默认 `<repo>/stepby-axum/data/stepby.db`，可 `STEPBY_DB` 覆盖），
 * 且必须在浏览器套件停止后跑（否则你正在删的表同时有人在写）。
 *
 * 用法：
 *   node tests/e2e/test-data-audit.mjs            # 审计，非零退出=有发现
 *   node tests/e2e/test-data-audit.mjs --selftest # 合成双向用例（临时库，零外部依赖）
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RESIDUE_STEPS } from './residue-cleanup.mjs'
import { DB_PATH } from './db-path.mjs'

/**
 * 测试数据命名信号。**故意宽于**清理谓词（清理多为 `LIKE 'e2e%'` 前缀，这里匹配任意位置）：
 * 判据的价值就在"用例改了命名族而清理没跟上"，收窄成与谓词同口径就变成自我印证。
 */
export const SIGNAL_RE = /e2e|probe|smoke|测试菜单改|^test[_-]/i

/**
 * 不扫的表：日志/遥测/审计面。
 * 理由不是"这些表干净"，而是**按名字清它们等于毁审计证据**——它们的体积由保留期清理
 * （`cleanup_expired_logs`：oper_log/logininfor 90d、frontend_error 7d、msg_send_log 90d）
 * 负责，不属于"测试垃圾命名族"这套判据的管辖面。
 */
export const EXEMPT_TABLES = new Set([
  'sys_oper_log',
  'sys_logininfor',
  'sys_frontend_error',
  'sys_msg_send_log',
  'sys_web_hook_log',
  'sys_flow_log',
  'sys_audit_change',
  'sys_job_log'
])

/** 候选列名：名字类字段（测试数据靠命名族识别，只有这些字段承载命名） */
export const CANDIDATE_COL_RE = /(name|title|key|code|question|label|type)/i

/** 归一化后的列数下限：发现逻辑坏了（表名改、PRAGMA 失败）必须响亮，不得静默扫 0 列报绿 */
export const MIN_SCANNED_COLUMNS = 20

/** 单列最多取这么多行用于分族；超过则本列结论**不完整**并算一条发现（见 findCleanupBlindSpots） */
const ROW_CAP_PER_COLUMN = 3000

/** 把值归成"命名族"：数字串折成 N，取前 16 字符。e2e75b-doc-1699… → e2eNb-doc-N */
export function familyOf(value) {
  const lower = String(value).toLowerCase().replace(/\s+/g, '')
  return lower.slice(0, 16).replace(/\d+/g, 'N')
}

/** 表的主键列（无主键 ⇒ 无法做行级覆盖判定；调用方把它计入 `noPk` 并在报告里打印，不静默消失） */
export function pkColumnOf(rows) {
  const pks = rows.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk)
  return pks.length ? pks[0].name : null
}

/** 自动发现候选 (表, 列)：排除日志面与无主键表，列名匹配名字类 */
export function discoverCandidates(tables, tableInfo) {
  const out = []
  const skipped = { exempt: 0, noPk: 0 }
  for (const t of tables) {
    if (EXEMPT_TABLES.has(t)) {
      skipped.exempt++
      continue
    }
    const cols = tableInfo(t)
    const pk = pkColumnOf(cols)
    if (!pk) {
      skipped.noPk++
      continue
    }
    for (const c of cols) {
      if (CANDIDATE_COL_RE.test(c.name)) out.push({ table: t, column: c.name, pk })
    }
  }
  out.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`))
  return { candidates: out, skipped }
}

/** 该谓词是否作用于这张表（只取 `DELETE FROM <table> WHERE …` 的本表谓词） */
export function predicateForTable(sql, table) {
  const m = /^DELETE\s+FROM\s+([A-Za-z0-9_]+)\s+WHERE\s+([\s\S]+)$/i.exec(sql.trim())
  if (!m) return null
  return m[1].toLowerCase() === table.toLowerCase() ? m[2] : null
}

/**
 * SQL 预筛（`SIGNAL_RE` 的**超集**）：先把可疑行从全表捞出来，再用 JS 正则终审。
 *
 * 必须是超集——**漏一族就是漏报**（该报的残留永远看不见）。SQLite 的 `LIKE` 只认 `%`/`_`，
 * 既没有默认转义符也没有字符类：`'test\_%'` 里的反斜杠是字面量（永不命中），`'test[_-]%'`
 * 里的方括号同理。b79 变异证伪实测：把这一族改成恒假时，原有的全部用例**照样全绿**
 * ⇒ 预筛少一族是静默的，所以这里按前缀写 `substr(...) IN ('test_','test-')`，
 * 并由自检里"预筛必须是超集"那条用例钉住（每种信号族各造一行，全部必须被捞出）。
 */
export function signalPrefilter(column) {
  const lc = `lower(${column})`
  return [
    `${lc} LIKE '%e2e%'`,
    `${lc} LIKE '%probe%'`,
    `${lc} LIKE '%smoke%'`,
    // 中文家族串不套 lower()：结果相同，但避免读代码的人以为 lower 是判据的一部分
    `(${column}) LIKE '%测试菜单改%'`,
    `substr(${lc},1,5) IN ('test_','test-')`
  ].join(' OR ')
}

/**
 * 判据①：清理盲区。返回 `{ blind: [{table, column, pk, pkValue, value, family}], scanErrors: [...] }`
 *
 * 覆盖判定是**集合式**的：把该表每条清理谓词原样写成 `CASE WHEN (<谓词>) THEN 1 ELSE 0 END`
 * 一起 SELECT 出来，一行"被覆盖" ⇔ 任一列为真。
 * 为什么不做"逐行查一次存在性"（那是第一版，被变异证伪打回）：逐行版必须给每族设取样上限，
 * 而同族内"已覆盖 / 未覆盖"分裂时，**上限截断会把未覆盖的那几行整批看不见**——
 * 同一族先出现 3 行已覆盖，盲区就永久静默（假绿）。集合式对全量行求值，没有"取样"这个概念，
 * 也就没有取样偏差；一次查询替代 N 次，成本反而更低。
 * 单列扫描失败（列不是文本、表达式不合法）**记成发现**，不得 `continue` 静默跳过。
 */
export function findCleanupBlindSpots(db, candidates, steps, rowCap = ROW_CAP_PER_COLUMN) {
  const blind = []
  const scanErrors = []
  for (const { table, column, pk } of candidates) {
    const predicates = []
    for (const [name, sql] of steps) {
      const where = predicateForTable(sql, table)
      if (where) predicates.push([name, where])
    }
    const flags = predicates.map(([, where], i) => `CASE WHEN (${where}) THEN 1 ELSE 0 END AS c${i}`)
    let rows
    try {
      rows = db
        .prepare(
          `SELECT ${pk} AS __pk, ${column} AS __v${flags.length ? ', ' + flags.join(', ') : ''} ` +
            `FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> '' AND (${signalPrefilter(column)}) ` +
            `ORDER BY ${pk} LIMIT ${rowCap + 1}`
        )
        .all()
    } catch (e) {
      scanErrors.push({ table, column, error: String(e).slice(0, 90) })
      continue
    }
    if (rows.length > rowCap) {
      scanErrors.push({ table, column, error: `命中行数 > ${rowCap} ⇒ 判据只看了前 ${rowCap} 行，本列结论不完整` })
      rows.length = rowCap
    }
    const seenFamily = new Set()
    for (const r of rows) {
      const value = String(r.__v)
      if (!SIGNAL_RE.test(value)) continue
      const covered = predicates.length > 0 && predicates.some((_, i) => Number(r[`c${i}`] || 0) === 1)
      if (covered) continue
      const family = familyOf(value)
      if (seenFamily.has(family)) continue // 一个族报一次：修法是按命名族补谓词，不是按行补
      seenFamily.add(family)
      blind.push({ table, column, pk, pkValue: r.__pk, value, family })
    }
  }
  blind.sort((a, b) => `${a.table}.${a.family}`.localeCompare(`${b.table}.${b.family}`))
  scanErrors.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`))
  return { blind, scanErrors }
}

/**
 * 判据②a：**测试数据**的软删残留（清理应把它们物理删除，留下＝清理失配或表不在管辖面）。
 *
 * 必须带命名信号，不能只判 `del_flag='2'`——**软删本身可以是设计终态**：
 * 运行库实测 `sys_menu` 有 6 行 `del_flag='2'`（3800-3804 域名按钮组、4115 AI 历史查询），
 * 那是 `m20261007_000011`（批十四菜单卫生）**故意**软删的假入口，`initialize/tenant.rs:165`
 * 还专门写了孪生语句防止兜底把它们复活。不带信号过滤的写法会把这 6 行每轮报成缺陷，
 * 而"每轮必红的判据"最终结局就是被人当噪声忽略——那比没有判据更糟。
 * 命名信号沿用 `signalPrefilter()`（与盲区判据同源，不另起一份家族串）。
 */
export const SOFT_DELETE_CHECKS = [
  ['sys_user', 'user_name'],
  ['sys_dept', 'dept_name'],
  ['sys_role', 'role_name'],
  ['sys_post', 'post_code'],
  ['sys_tenant', 'tenant_name'],
  ['sys_dict_type', 'dict_type'],
  ['sys_menu', 'menu_name']
]

/** 判据②b：跨表孤儿（父行已物理删除、子行还在） */
export const ORPHAN_CHECKS = [
  ['role_menu→role', 'sys_role_menu', 'NOT EXISTS (SELECT 1 FROM sys_role r WHERE r.role_id = sys_role_menu.role_id)'],
  ['user_role→user', 'sys_user_role', 'NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.user_id = sys_user_role.user_id)'],
  ['user_post→user', 'sys_user_post', 'NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.user_id = sys_user_post.user_id)'],
  ['user_post→post', 'sys_user_post', 'NOT EXISTS (SELECT 1 FROM sys_post p WHERE p.post_id = sys_user_post.post_id)'],
  ['tenant_domain→tenant', 'sys_tenant_domain', 'tenant_id NOT IN (SELECT tenant_id FROM sys_tenant)'],
  // 公告删除在产品侧**是**级联的（`sys_notice_service.rs:660` 在同一事务里
  // `read_repo.delete_by_notice_ids_conn(txn, …)`，注释点名 P0-76）⇒ 这条孤儿判据报出来的
  // 不是产品缺陷，而是**绕过产品删除路径的写入方**：`residue-cleanup.mjs` 用直连 SQL
  // `DELETE FROM sys_notice WHERE …` 删公告，不经过那个事务，已读记录就留下孤儿。
  // 所以这条锁真正钉的是清理脚本自己（b79 给它补了同前缀的 notice_read 删除步骤）。
  ['notice_read→notice', 'sys_notice_read', 'notice_id NOT IN (SELECT notice_id FROM sys_notice)']
]

/** 判据②c：状态枚举越界（跑批不该产生域外值） */
export const ENUM_CHECKS = [
  ['sys_pat.status ∉ {0,1}', 'sys_pat', "status NOT IN ('0','1')"],
  ['sys_user.status ∉ {0,1}', 'sys_user', "status NOT IN ('0','1')"],
  ['sys_notice.status ∉ {0,1}', 'sys_notice', "status NOT IN ('0','1')"],
  ['sys_config.config_type ∉ {Y,N}', 'sys_config', "config_type NOT IN ('Y','N')"],
  ['sys_dict_type.status ∉ {0,1}', 'sys_dict_type', "status NOT IN ('0','1')"],
  ['sys_user.del_flag ∉ {0,2}', 'sys_user', "del_flag NOT IN ('0','2')"]
]

/**
 * 判据②d：未来时间的**创建类**时间戳（写入即应≈当下；b74 轮 25 同类：解析失败的行会被
 * 所有时间判据静默跳过，属"少报"而不是"报错"）。
 * 只列创建类字段：`sys_pat.expire_time` 这类**设计上就落在未来**，算进来等于把设计态判成缺陷
 * （自检里有一条"终态不得报 未来时间|sys_pat.expire_time"的反证钉住它）。
 */
export const FUTURE_CHECKS = [
  ['sys_oper_log.oper_time', 'sys_oper_log', 'oper_time'],
  ['sys_logininfor.login_time', 'sys_logininfor', 'login_time'],
  ['sys_notice.create_time', 'sys_notice', 'create_time']
]

/**
 * "现在"必须由 **SQL 侧**给出（`datetime('now','localtime')`），不得在 JS 里格式化后传字符串：
 * 落库文本是服务器本地时间，`toISOString()` 是 UTC，本地 UTC+8 的机器上用 UTC 串做阈值
 * 等于把阈值往前挪 8 小时，"未来时间"会命中大量正常行（假红）。
 * 自检传字面量把"未来/过去"钉成确定值，生产用默认表达式。
 */
export const NOW_EXPR = "datetime('now','localtime','+1 hour')"

/** 非终态在途（信息项，不判红：这些量随库龄与跑批次数变，任何绝对阈值都会变成环境耦合判据） */
export const INFO_CHECKS = [
  ['sys_flow_task 未处理', 'sys_flow_task', "status IN ('0','pending')"],
  ['sys_msg_send_log 待发/失败待重', 'sys_msg_send_log', "status IN ('0','2')"],
  ['sys_msg_send_log send_time IS NULL（设计上永不清理档）', 'sys_msg_send_log', 'send_time IS NULL'],
  ['sys_web_hook_log 待重试', 'sys_web_hook_log', "status <> '1'"],
  ['sys_pat 有效令牌', 'sys_pat', "status='0'"],
  ['sys_notice_read 已读记录总数', 'sys_notice_read', '1=1']
]

export function countWhere(db, table, where) {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n
  } catch (e) {
    return { error: String(e).slice(0, 90) }
  }
}

/** 四类终态判据共用一个驱动：任何一条查询报错都算"发现"，不得静默当 0 */
const GROUP_CHECKS = [
  [
    '软删残留',
    () =>
      SOFT_DELETE_CHECKS.map(([t, col]) => [
        `${t}.${col}`,
        t,
        `del_flag = '2' AND ${col} IS NOT NULL AND ${col} <> '' AND (${signalPrefilter(col)})`
      ])
  ],
  ['跨表孤儿', () => ORPHAN_CHECKS],
  ['状态枚举越界', () => ENUM_CHECKS],
  ['未来时间', (nowExpr) => FUTURE_CHECKS.map(([label, table, col]) => [label, table, `${col} > ${nowExpr}`])]
]

/**
 * 公告清理的**成对 + 顺序**不变式（§10 N-17 的结构化了结）。
 *
 * 产品侧删除公告会在同一事务里级联删已读记录（`sys_notice_service.rs:660`），
 * 而清理脚本用直连 SQL 删公告**绕过那个事务** ⇒ 已读行成为永久孤儿，每轮 +1。
 * 本判据不靠注释纪律：凡 `DELETE FROM sys_notice …` 都必须有一条**排在它之前**的
 * `DELETE FROM sys_notice_read …`，且那条已读步骤要么不限标题（全量兜底），
 * 要么标题前缀集合 ⊇ 本条（否则新前缀又漏）。
 *
 * 顺序为什么进判据：已读步骤通常靠 `notice_id IN (SELECT … FROM sys_notice WHERE 标题 …)`
 * 定位——公告先删掉，子查询就找不到任何东西，级联等于没发生（形状同
 * `governance_runs_after_all_menu_granting_fallbacks`：只判集合不判顺序，生产序与测试序可以静默相反）。
 */
export function findUnpairedNoticeCleanup(steps) {
  const likes = (sql) => [...sql.matchAll(/LIKE\s+'([^']+)'/gi)].map((m) => m[1].toLowerCase())
  const out = []
  const readSeen = []
  for (const [name, sql] of steps) {
    const s = sql.trim()
    if (/^DELETE\s+FROM\s+sys_notice_read\b/i.test(s)) {
      readSeen.push(s)
      continue
    }
    if (!/^DELETE\s+FROM\s+sys_notice\b/i.test(s)) continue
    const need = likes(s)
    const covered = readSeen.some((r) => {
      const have = likes(r)
      return have.length === 0 || need.every((n) => have.includes(n))
    })
    if (!covered) out.push({ step: name, prefixes: need.join(',') || '(本条无标题约束)' })
  }
  return out
}

/**
 * 时序自证（§10 N-14）：本工具的结论**只在套件停止后**成立，此前这条前置条件只是纪律。
 * 现在把"库内最近一次 oper_log 写入距今多久"打进报告——不是判据（跑完套件的下一分钟
 * 它也确实是刚写过），而是让"我把快照当成了终态"这类误读在凭证里自己现形。
 *
 * 口径：`sys_oper_log.oper_time` 落库是 **UTC 文本**（§10 N-16 实测），所以阈值取
 * `julianday('now')`（UTC），**不能**带 `localtime`——那会把差值整体偏 8 小时。
 */
export function operLogFreshness(db) {
  try {
    const r = db
      .prepare(
        "SELECT max(oper_time) AS maxTime, CAST((julianday('now') - julianday(max(oper_time))) * 1440 AS INTEGER) AS minsAgo FROM sys_oper_log"
      )
      .get()
    return { maxTime: r?.maxTime ?? null, minsAgo: r?.minsAgo ?? null }
  } catch (e) {
    return { maxTime: null, minsAgo: null, error: String(e).slice(0, 60) }
  }
}

/**
 * 审计的**时序前置**（§10 N-14 的收口）：判据本体只查"数据终态对不对"，但同一份快照
 * 在跑批中与停库后含义不同——本批实测：跑在 round C 中途会得到 `软删残留：sys_post=1`
 * 与两族"盲区"，停库复测全部归零。所以"没人正在写库"不能只是文档里的约定，
 * 必须由工具自己证明；**证明不了就拒绝出结论**（fail-closed）。
 *
 * 阈值 2 分钟的形状依据：round E 实测 88 模块 / 2722.3s ⇒ 平均 31s 一个模块，
 * 2 分钟跨约 4 个模块的写入窗口；停库后最后发生的写入是收尾清理，之后就是空闲。
 * 这条闸**只影响能不能出结论**（退出码 2），不改动任何判据的松紧。
 */
export const ACTIVE_WRITE_MINUTES = 2

/**
 * @param {{maxTime?: string|null, minsAgo?: number|null, error?: string}} timing `operLogFreshness` 的返回
 * @returns {{refuse: boolean, reason: string, minsAgo: number|null}}
 */
export function activeWriteVerdict(timing, thresholdMin = ACTIVE_WRITE_MINUTES) {
  // **`Number(null) === 0`**：直接 `Number(timing.minsAgo)` 会把"取不到差值"读成"0 分钟前"，
  // 于是**空库被判成跑批中**（拒绝出结论）而"有行但解析失败"那一支永远走不到——
  // 这两条都被本文件自检的 ⑫ 组实测逼出来了。null/undefined/空串一律先归成 NaN（=判不了）。
  const raw = timing?.minsAgo
  const mins = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw)
  if (timing?.error) {
    return {
      refuse: true,
      minsAgo: null,
      reason:
        `读不到 \`sys_oper_log.oper_time\`（${timing.error}）⇒ 无法证明没人正在写库，` +
        `按 fail-closed 拒绝出结论（"证明不了"不得读成"没问题"）`
    }
  }
  if (!Number.isFinite(mins)) {
    if (typeof timing?.maxTime === 'string' && timing.maxTime) {
      // 有行、但 `max(oper_time)` 解析不出差值 ⇒ 无法判断是否刚写过。
      // 这一支必须拒：b74 轮 25 的教训就是"时间解析失败 → 该行被所有时间判据跳过 → 少报且不报错"。
      return {
        refuse: true,
        minsAgo: null,
        reason: `最近写入时间不可解析（maxTime="${timing.maxTime.slice(0, 32)}"）⇒ 无法证明没人正在写库，拒绝出结论`
      }
    }
    // 空表（新初始化的运行库）没有写入痕迹可判，也不存在"刚被写过"的证据。
    // 放行而不是拒绝，是为了让空库仍能跑结构面判据（发现面下限那条照样会拦）；
    // 有数据的运行库不可能走到这一支。
    return { refuse: false, minsAgo: null, reason: 'oper_log 无行（新库）⇒ 时序未知，放行结构面判据' }
  }
  if (mins < thresholdMin) {
    return {
      refuse: true,
      minsAgo: mins,
      reason:
        `最近一条操作日志距 ${mins} 分钟前（阈值 ${thresholdMin} 分钟）⇒ 浏览器套件仍在写库，` +
        `这份快照的"盲区 / 残留 / 终态"与停库后的不是一件事`
    }
  }
  return { refuse: false, minsAgo: mins, reason: '' }
}

/**
 * 一次审计的全部判据。`steps` / `minColumns` / `nowExpr` 可由自检注入（合成库只有几个候选列，
 * 且"现在"必须钉成字面量），**生产入口一律用默认值**——把默认值改掉就是放松判据。
 */
export function runAudit(
  db,
  { nowExpr = NOW_EXPR, steps = RESIDUE_STEPS, minColumns = MIN_SCANNED_COLUMNS, rowCap = ROW_CAP_PER_COLUMN } = {}
) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name)
  const tableInfo = (t) => db.prepare(`PRAGMA table_info(${t})`).all()
  const { candidates, skipped } = discoverCandidates(tables, tableInfo)
  const report = {
    tables: tables.length,
    scannedColumns: candidates.length,
    skipped,
    blind: [],
    scanErrors: [],
    groups: [],
    infos: []
  }
  // 时序 ℹ 必须在**任何提前返回之前**取：`fatal` 那条路径同样要让入口知道"这份快照能不能信"。
  report.timing = operLogFreshness(db)

  if (candidates.length < minColumns) {
    report.fatal = `候选列发现数 ${candidates.length} < 下限 ${minColumns} ⇒ 发现逻辑或库结构已失效，本次审计不作数`
    return report
  }
  const spots = findCleanupBlindSpots(db, candidates, steps, rowCap)
  report.blind = spots.blind
  report.scanErrors = spots.scanErrors
  // 扫描失败/扫描截断都算发现：静默 `continue` 会把"这一列根本没判"洗成"这一列干净"
  for (const e of spots.scanErrors) {
    report.groups.push({ kind: '扫描失败', label: `${e.table}.${e.column}`, n: 1, error: e.error })
  }

  for (const [kind, build] of GROUP_CHECKS) {
    for (const [label, table, where] of build(nowExpr)) {
      const n = countWhere(db, table, where)
      if (typeof n !== 'number') report.groups.push({ kind: '查询失败', label, n: 1, error: n.error })
      else if (n > 0) report.groups.push({ kind, label, n })
    }
  }
  for (const [label, table, where] of INFO_CHECKS) {
    const n = countWhere(db, table, where)
    report.infos.push({ label, n: typeof n === 'number' ? n : `ERR ${n.error}` })
  }
  // 公告清理成对性判的是**谓词表本身**，不是库内容：无论何时跑都必须成立
  for (const u of findUnpairedNoticeCleanup(steps)) {
    report.groups.push({
      kind: '公告清理未成对',
      label: `${u.step}（缺排在它之前、且标题前缀覆盖本条的 sys_notice_read 步骤；本条前缀=${u.prefixes}）`,
      n: 1
    })
  }
  return report
}

function printReport(report, log) {
  log('')
  log('==== 测试数据态审计 ====')
  log(
    `发现面：${report.tables} 张表 / ${report.scannedColumns} 个候选列（豁免日志面 ${report.skipped.exempt} 张、无主键 ${report.skipped.noPk} 张）`
  )
  if (report.fatal) {
    log(`✘ ${report.fatal}`)
    return
  }
  if (report.blind.length === 0) log('✅ 清理盲区：命中的命名族全部被 RESIDUE_STEPS 覆盖')
  else {
    log(`✘ 清理盲区 ${report.blind.length} 个命名族（有测试信号、无任何清理谓词覆盖 ⇒ 每轮累积）:`)
    for (const b of report.blind) {
      log(`     ${b.table}.${b.column} 族="${b.family}" 样本 pk=${b.pk}=${b.pkValue} 值="${b.value.slice(0, 60)}"`)
    }
  }
  const hard = report.groups.filter((g) => g.kind !== '查询失败')
  const errs = report.groups.filter((g) => g.kind === '查询失败')
  if (hard.length === 0) log('✅ 数据终态：软删残留 / 跨表孤儿 / 状态枚举 / 未来时间 全为 0')
  else {
    for (const g of hard) log(`✘ ${g.kind}：${g.label} = ${g.n}`)
  }
  for (const g of errs) log(`✘ 查询失败：${g.label} — ${g.error}`)
  log('---- 非终态在途（信息项，不判红：判据随库龄变，属量级观测不是缺陷）----')
  for (const i of report.infos) log(`     ${i.label}: ${i.n}`)
  const t = report.timing || {}
  if (t.error) log(`ℹ 时序提示：读不到 oper_time（${t.error}）⇒ 本结论的时序无从判断`)
  else if (t.maxTime) {
    const live = Number(t.minsAgo) >= 0 && Number(t.minsAgo) < 2
    log(
      `ℹ 时序提示：库内最近 oper_log 写入 = ${t.maxTime}（UTC，距今 ${t.minsAgo} 分钟）` +
        (live ? ' ⇒ 可能仍在写入，这是**该时刻快照**而非收尾终态' : '')
    )
  } else log('ℹ 时序提示：sys_oper_log 无行（空库/新库），无法判断写入时序')
}

// ==================== 自检（临时库，双向合成用例）====================

/**
 * 自检夹具：**只建判据真正引用到的列**（列名与运行库一致），因此它同时钉住一件事——
 * 判据里写的表名/列名拼错时 `countWhere` 会返回错误对象而不是 0，本文件里那条
 * "查询失败必须算发现"的用例就是它的对账器。
 */
const SYNTH_DDL = `
  CREATE TABLE sys_role (role_id INTEGER PRIMARY KEY, role_name TEXT, del_flag TEXT);
  CREATE TABLE sys_role_menu (role_id INTEGER, menu_id INTEGER);
  CREATE TABLE sys_menu (menu_id INTEGER PRIMARY KEY, menu_name TEXT, perms TEXT, del_flag TEXT);
  CREATE TABLE sys_user (user_id INTEGER PRIMARY KEY, user_name TEXT, status TEXT, del_flag TEXT);
  CREATE TABLE sys_user_role (user_id INTEGER, role_id INTEGER);
  CREATE TABLE sys_dept (dept_id INTEGER PRIMARY KEY, dept_name TEXT, del_flag TEXT);
  CREATE TABLE sys_post (post_id INTEGER PRIMARY KEY, post_code TEXT, post_name TEXT, del_flag TEXT);
  CREATE TABLE sys_user_post (user_id INTEGER, post_id INTEGER);
  CREATE TABLE sys_tenant (tenant_id INTEGER PRIMARY KEY, tenant_name TEXT, del_flag TEXT);
  CREATE TABLE sys_tenant_domain (id INTEGER PRIMARY KEY, tenant_id INTEGER, domain TEXT);
  CREATE TABLE sys_dict_type (dict_id INTEGER PRIMARY KEY, dict_name TEXT, dict_type TEXT, status TEXT, del_flag TEXT);
  CREATE TABLE sys_config (config_id INTEGER PRIMARY KEY, config_name TEXT, config_key TEXT, config_value TEXT, config_type TEXT);
  CREATE TABLE sys_pat (pat_id INTEGER PRIMARY KEY, name TEXT, status TEXT, expire_time TEXT);
  CREATE TABLE sys_notice (notice_id INTEGER PRIMARY KEY, notice_title TEXT, status TEXT, create_time TEXT);
  CREATE TABLE sys_notice_read (id INTEGER PRIMARY KEY, notice_id INTEGER, user_id INTEGER);
  CREATE TABLE sys_oper_log (oper_id INTEGER PRIMARY KEY, oper_name TEXT, dept_name TEXT, oper_time TEXT);
  CREATE TABLE sys_logininfor (info_id INTEGER PRIMARY KEY, user_name TEXT, login_time TEXT);
  CREATE TABLE flow_demo_doc (doc_id INTEGER PRIMARY KEY, title TEXT);
  CREATE TABLE sys_flow_task (task_id INTEGER PRIMARY KEY, status TEXT);
  CREATE TABLE sys_msg_send_log (id INTEGER PRIMARY KEY, status TEXT, send_time TEXT);
  CREATE TABLE sys_web_hook_log (id INTEGER PRIMARY KEY, status TEXT);
  CREATE TABLE sys_user_credential (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE no_pk_table (name TEXT);
  CREATE TABLE ai_chat_history (id INTEGER PRIMARY KEY, question TEXT);
  CREATE TABLE sys_dict_data (dict_code INTEGER PRIMARY KEY, dict_label TEXT, dict_value TEXT, dict_type TEXT);
`

/**
 * 自检用的迷你清理表：形状与真实 `RESIDUE_STEPS` 同构（"只删软删行""只删某状态""按命名前缀删"），
 * 用来证明覆盖判定**既不是恒真也不是恒假**——只测一半的判据等于没测。
 */
const SYNTH_STEPS = [
  ['users', "DELETE FROM sys_user WHERE del_flag='2'"],
  ['roles', "DELETE FROM sys_role WHERE del_flag='2'"],
  ['user_softdel_e2e', "DELETE FROM sys_user WHERE lower(user_name) LIKE 'e2e%' AND del_flag = '2'"],
  ['menu_softdel_e2e', "DELETE FROM sys_menu WHERE menu_name LIKE '测试菜单改%'"],
  ['pat', "DELETE FROM sys_pat WHERE name LIKE 'e2e%' AND status='1'"],
  [
    'notice_read',
    "DELETE FROM sys_notice_read WHERE notice_id IN (SELECT notice_id FROM sys_notice WHERE notice_title LIKE 'E2E87%')"
  ],
  ['notice', "DELETE FROM sys_notice WHERE notice_title LIKE 'E2E87%'"],
  // 同一张表两条谓词：smoke-cfg 行**只被第二条**覆盖 ⇒ 只看第一条的实现会把它误判成盲区
  ['config_other', "DELETE FROM sys_config WHERE config_type='N'"],
  ['config_named', "DELETE FROM sys_config WHERE config_key LIKE 'smoke-cfg%'"]
]

function synthDb() {
  const dir = mkdtempSync(join(tmpdir(), 'testdata-audit-'))
  const db = new DatabaseSync(join(dir, 'audit.db'))
  db.exec(SYNTH_DDL)
  const ins = (sql, ...p) => db.prepare(sql).run(...p)
  ins("INSERT INTO sys_role VALUES (9001,'e2e-role-gate','2')")
  // ② 盲区：del_flag='0' 且命名含 e2e ⇒ 该表谓词（若有）永不命中
  ins("INSERT INTO sys_menu VALUES (9101,'e2e75b-doc-orphan','x','0')")
  // ③ 被覆盖：menu_name LIKE '测试菜单改%'
  ins("INSERT INTO sys_menu VALUES (9102,'测试菜单改_e2e','x','0')")
  ins("INSERT INTO sys_menu VALUES (9100,'普通菜单','x','0')")
  // 软删正例：e2e 命名族的软删行（清理漏物理删 ⇒ 必须报）
  ins("INSERT INTO sys_menu VALUES (9103,'e2e75b-menu-del','x','2')")
  // 软删反例：**在册业务命名**的软删行是设计终态（对应运行库里 m20261007_000011 故意软删的
  // 3800-3804/4115），不得报成测试残留
  ins("INSERT INTO sys_dept VALUES (9801,'销售部','2')")
  ins("INSERT INTO sys_dept VALUES (9802,'e2e_dept_tmp','2')")
  // 独立反证表：**只有**在册命名的软删行、没有任何 e2e 族软删行 ⇒ 收窄判据（带信号过滤）
  // 时这里必须全绿；把信号过滤摘掉的实现会在这里翻红（b79 变异证伪用得上）
  ins("INSERT INTO sys_tenant VALUES (9901,'上海租户','2')")
  // ④ 同族分裂，且**未覆盖那行排在最后**：前三条已吊销（被 pat 谓词覆盖）、第四条活跃（没覆盖）。
  //    ⇒ 任何"每族只看前 N 行"的取样实现（N<4）在这里必然漏报；集合式实现看全量行，不会漏。
  //      这是 b79 变异证伪逼出来的形状：上一版按族取样 + 上限 3，把这条用例改成就抓不到了。
  ins("INSERT INTO sys_pat VALUES (9301,'e2e-pat-tok','1','2030-01-01 00:00:00')")
  ins("INSERT INTO sys_pat VALUES (9302,'e2e-pat-tok','1','2030-01-01 00:00:00')")
  ins("INSERT INTO sys_pat VALUES (9303,'e2e-pat-tok','1','2030-01-01 00:00:00')")
  ins("INSERT INTO sys_pat VALUES (9304,'e2e-pat-tok','0','2099-01-01 00:00:00')")
  ins("INSERT INTO sys_user VALUES (9201,'e2e_ui_active','0','0')")
  ins("INSERT INTO sys_user VALUES (9202,'e2e_ui_deleted','0','2')")
  ins("INSERT INTO sys_user VALUES (9203,'admin','9','0')") // status 越界
  ins('INSERT INTO sys_role_menu VALUES (9999, 9100)') // 孤儿：role 不存在
  ins('INSERT INTO sys_user_role VALUES (9203, 9999)') // 合法：user 在
  ins("INSERT INTO flow_demo_doc VALUES (7001,'e2e75b-doc-1700000000')")
  ins("INSERT INTO sys_notice VALUES (8001,'E2E87-batch','0','2026-01-01 00:00:00')")
  ins('INSERT INTO sys_notice_read VALUES (1, 8001, 1)')
  ins('INSERT INTO sys_notice_read VALUES (2, 8888, 1)') // 孤儿：notice 不存在
  ins("INSERT INTO sys_notice VALUES (8002,'未来时间公告','0','2099-06-01 00:00:00')")
  ins("INSERT INTO sys_oper_log VALUES (1,'e2e-bot','销售部','2026-01-01 00:00:00')") // oper_time 在过去 ⇒ 不得报
  ins("INSERT INTO sys_logininfor VALUES (1,'e2e_user','2099-12-31 00:00:00')") // login_time 在未来 ⇒ 必报
  ins("INSERT INTO sys_user_credential VALUES (1,'probe-key-1')") // 盲区：无 e2e 凭据谓词
  ins("INSERT INTO sys_user_credential VALUES (2,'probe-key-2')") // 同族不同后缀 ⇒ 只许报一次
  // ^test[_-] 家族：清理面里没有它，必须被报出来；同时它是"预筛超集"用例的实弹
  ins("INSERT INTO sys_dict_type VALUES (9501,'test_dict_e2e','td_x','0','0')")
  // 9502：命名**只出现在 `*_type` 列**里（dict_type 正是清理谓词 'e2e%' 用的那一列）
  // ⇒ 候选列正则少了 `type` 这一族就看不见它（b79 变异证伪：把 type 摘掉时 66 条用例全绿）
  ins("INSERT INTO sys_dict_type VALUES (9502,'普通字典名','e2e_by_type','0','0')")
  ins("INSERT INTO sys_config VALUES (9401,'冒烟配置','smoke-cfg-x','1','Y')") // 只被第二条 sys_config 谓词覆盖
  // ⑤ 候选面里每一个 token 都必须有实弹行（b79 变异证伪：摘掉 `label`/`code`/`question`
  //    任一 token 时全部用例照样绿 ⇒ 那三个 token 属"写了没接线的判据面"。处置：`label` 删掉
  //    （没有以 label 承载命名的表），其余每个 token 各补一行实弹）
  ins("INSERT INTO sys_post VALUES (9601,'e2e-post-code','普通岗位名','0')") // *_code
  ins("INSERT INTO ai_chat_history VALUES (9701,'e2e-question-xyz')") // *_question
  ins("INSERT INTO sys_config VALUES (9402,'盲区配置','e2e-blind-key','1','Y')") // *_key
  // *_label 承载命名的实弹：运行库实测 `sys_dict_data.dict_label` 有 48 行（e2e 命中 0），
  // 字典族的命名根在 dict_type、但 label 同样可能被用例拿来承载命名 ⇒ 该 token 必须有证人
  ins("INSERT INTO sys_dict_data VALUES (9851,'e2e_label_only','v1','在册字典类型')")
  ins("INSERT INTO no_pk_table VALUES ('e2e-no-pk')")
  return { db, dir }
}

/**
 * 夹具实弹核对：每条"不得报"用例所依赖的触发行**必须真的在库里**。
 * 没有这一段，"不得报 X"会在 X 根本没插入时空跑通过（本文件实测踩过一次：
 * 期望值加了、`INSERT` 忘了加 ⇒ 用例恒绿）。判据的否定面必须先证明"条件成立"。
 */
const SYNTH_PRESENCE = [
  ['sys_role 已覆盖行', "SELECT COUNT(*) AS n FROM sys_role WHERE role_id=9001 AND del_flag='2'", 1],
  ['sys_menu 盲区行', 'SELECT COUNT(*) AS n FROM sys_menu WHERE menu_id=9101', 1],
  ['sys_menu 已覆盖行', "SELECT COUNT(*) AS n FROM sys_menu WHERE menu_name LIKE '测试菜单改%'", 1],
  ['sys_pat 同族 4 行', "SELECT COUNT(*) AS n FROM sys_pat WHERE name='e2e-pat-tok'", 4],
  [
    'sys_pat 未覆盖那行排在最后',
    "SELECT COUNT(*) AS n FROM sys_pat WHERE name='e2e-pat-tok' AND status='0' AND pat_id=9304",
    1
  ],
  ['sys_pat 前三行确已被覆盖', "SELECT COUNT(*) AS n FROM sys_pat WHERE name='e2e-pat-tok' AND status='1'", 3],
  ['sys_user 软删已覆盖行', "SELECT COUNT(*) AS n FROM sys_user WHERE user_name='e2e_ui_deleted' AND del_flag='2'", 1],
  ['sys_notice 已覆盖行', "SELECT COUNT(*) AS n FROM sys_notice WHERE notice_title LIKE 'E2E87%'", 1],
  [
    'sys_config 仅第二条覆盖',
    "SELECT COUNT(*) AS n FROM sys_config WHERE config_key='smoke-cfg-x' AND config_type='Y'",
    1
  ],
  ['sys_config 盲区 key 行', "SELECT COUNT(*) AS n FROM sys_config WHERE config_key='e2e-blind-key'", 1],
  ['sys_post 的 code 承载行', "SELECT COUNT(*) AS n FROM sys_post WHERE post_code='e2e-post-code'", 1],
  [
    'sys_dict_data 的 label 承载行',
    "SELECT COUNT(*) AS n FROM sys_dict_data WHERE dict_label='e2e_label_only' AND dict_type NOT LIKE '%e2e%'",
    1
  ],
  [
    'ai_chat_history 的 question 承载行',
    "SELECT COUNT(*) AS n FROM ai_chat_history WHERE question='e2e-question-xyz'",
    1
  ],
  [
    'sys_tenant 仅在册软删行（反证表）',
    "SELECT COUNT(*) AS n FROM sys_tenant WHERE del_flag='2' AND tenant_name='上海租户'",
    1
  ],
  ['sys_dict_type 的 test_ 前缀行', "SELECT COUNT(*) AS n FROM sys_dict_type WHERE dict_name='test_dict_e2e'", 1],
  [
    'sys_dict_type 只在 type 列带信号的行',
    "SELECT COUNT(*) AS n FROM sys_dict_type WHERE dict_type='e2e_by_type' AND dict_name NOT LIKE '%e2e%'",
    1
  ],
  ['豁免日志面确有信号行', "SELECT COUNT(*) AS n FROM sys_oper_log WHERE oper_name='e2e-bot'", 1],
  ['无主键表确有信号行', "SELECT COUNT(*) AS n FROM no_pk_table WHERE name='e2e-no-pk'", 1]
]

/**
 * 盲区期望写成 **(表, 值子串)** 而不是 (表, 归一化族名)：族名是 `familyOf` 的实现细节
 * （数字折成 N、截 16 字符），把它抄进期望值=用实现写测试，改归一化时两边同时改、
 * 谁也发现不了谁错了。值子串是行为，族名不是。
 */
const SYNTH_EXPECT_BLIND = [
  ['sys_menu', 'e2e75b-doc-orphan'], // 无 sys_menu 的 e2e 谓词
  ['sys_pat', 'e2e-pat-tok'], // 同族分裂：已吊销那条被覆盖，活跃那条没有
  ['flow_demo_doc', 'e2e75b-doc'], // 表根本不在清理面里
  ['sys_user', 'e2e_ui_active'], // 活跃 e2e 账号：清理只删软删行 ⇒ 留档就是残留
  ['sys_user_credential', 'probe-key'], // probe 前缀族，凭据表无清理谓词
  ['sys_dict_type', 'test_dict_e2e'], // ^test[_-] 前缀族：预筛若少这一族就抓不到
  ['sys_dict_type', 'e2e_by_type'], // 命名只在 *_type 列里：候选面少 type 这一档就漏
  ['sys_post', 'e2e-post-code'], // 命名只在 *_code 列里
  ['ai_chat_history', 'e2e-question'], // 命名只在 *_question 列里
  ['sys_dict_data', 'e2e_label_only'], // 命名只在 *_label 列里
  ['sys_config', 'e2e-blind-key'] // 命名只在 *_key 列里
]
/** 不得报：已被覆盖 / 无信号 / 被豁免的日志面 */
const SYNTH_FORBIDDEN_BLIND = [
  ['sys_role', 'e2e-role-gate'], // del_flag='2' 被 roles 谓词覆盖
  ['sys_menu', '测试菜单改_e2e'],
  ['sys_notice', 'E2E87-batch'],
  ['sys_config', 'smoke-cfg-x'], // 第二条谓词才覆盖 ⇒ 只看首条的实现会在这里翻红
  ['sys_user', 'e2e_ui_deleted'],
  ['sys_oper_log', 'e2e-bot'], // 日志面：按名字清等于毁审计证据
  ['sys_logininfor', 'e2e_user'],
  ['no_pk_table', 'e2e-no-pk'] // 无主键 ⇒ 无法做行级覆盖判定，不进候选面
]
const SYNTH_EXPECT_GROUPS = [
  '软删残留|sys_role.role_name',
  '软删残留|sys_menu.menu_name',
  '软删残留|sys_user.user_name',
  '软删残留|sys_dept.dept_name',
  '跨表孤儿|role_menu→role',
  '跨表孤儿|notice_read→notice',
  '状态枚举越界|sys_user.status ∉ {0,1}',
  '未来时间|sys_notice.create_time',
  '未来时间|sys_logininfor.login_time'
]
const SYNTH_FORBIDDEN_GROUPS = [
  '软删残留|sys_tenant.tenant_name', // 设计态软删（对应运行库 m20261007_000011 的 3800-3804/4115）
  '跨表孤儿|user_role→user',
  '跨表孤儿|tenant_domain→tenant',
  '跨表孤儿|user_post→user',
  '跨表孤儿|user_post→post',
  '状态枚举越界|sys_notice.status ∉ {0,1}',
  '状态枚举越界|sys_pat.status ∉ {0,1}',
  '未来时间|sys_oper_log.oper_time',
  '未来时间|sys_pat.expire_time', // 令牌过期时间**设计上**就在未来，不得判成缺陷
  '查询失败|'
]

export function selftest() {
  const out = []
  const push = (name, ok, detail = '') => out.push({ name, ok, detail })
  const { db, dir } = synthDb()
  try {
    // ---- 纯函数层 ----
    push('族归一：窗口外后缀合一', familyOf('e2e75b-doc-1700000001') === familyOf('e2e75b-doc-1700000099'), '')
    // 窗口（截到 16 字符）是**取值上限**，不是装饰：`ai_chat_history.question` 这类长文本列
    // 若不截断，每行都会自成一族 ⇒ 盲区清单按行数膨胀、"同族只报一次"直接失效。
    push(
      '族归一：窗口把 16 字符后的差异并入同族',
      familyOf('probe-abcdefghij-1-AA') === familyOf('probe-abcdefghij-1-BB'),
      familyOf('probe-abcdefghij-1-AA')
    )
    // 两条只差 16 字符窗口内的数字 ⇒ 不折数字的实现会把同一命名族拆成两族（盲区会重复报、
    // 且"每族取样"的逻辑被打散）。只测窗口外那条抓不到这个变异（b79 变异证伪实测）。
    push(
      '族归一：窗口内数字后缀合一',
      familyOf('smoke-board-1') === familyOf('smoke-board-2'),
      familyOf('smoke-board-1')
    )
    push('族归一：不同族不并', familyOf('e2e75-doc-1') !== familyOf('e2e75b-doc-1'), '')
    push('谓词取本表', predicateForTable("DELETE FROM sys_user WHERE del_flag='2'", 'sys_user') === "del_flag='2'", '')
    push('谓词拒他表', predicateForTable("DELETE FROM sys_user WHERE del_flag='2'", 'sys_role') === null, '')
    push(
      '信号命中 e2e/probe/smoke',
      SIGNAL_RE.test('e2e-hook-x') && SIGNAL_RE.test('my-E2E-1') && SIGNAL_RE.test('probe-diag-7'),
      ''
    )
    push('信号不命中业务名', !SIGNAL_RE.test('销售一部') && !SIGNAL_RE.test('admin') && !SIGNAL_RE.test('普通菜单'), '')
    push(
      '无主键表不得进候选面',
      !discoverCandidates(['no_pk_table'], (t) => db.prepare(`PRAGMA table_info(${t})`).all()).candidates.length,
      ''
    )
    push(
      '日志面表被豁免',
      discoverCandidates(['sys_oper_log'], (t) => db.prepare(`PRAGMA table_info(${t})`).all()).candidates.length === 0,
      ''
    )
    // 覆盖判定双向：命中 ⇒ 步骤名；不命中 ⇒ null（只测一边的话，恒 true 的实现也能全绿）

    // ---- 整链层：跑真实 runAudit（注入夹具 steps 与低的候选列下限）----
    // 夹具实弹核对：先证明每条"不得报"用例的触发行真的存在，否则否定面是空跑
    for (const [label, sql, minN] of SYNTH_PRESENCE) {
      const n = Number(db.prepare(sql).get().n)
      push(`夹具核对 ${label}`, n >= minN, `实测 ${n}，期望 ≥${minN}`)
    }
    // 预筛必须是 SIGNAL_RE 的超集：每族各造一行，全部必须被 SQL 捞出（少一族 ⇒ 漏报）
    const pf = new DatabaseSync(':memory:')
    pf.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
    const P_FAMILIES = ['x-e2e-x', 'x-probe-x', 'x-smoke-x', '测试菜单改一下', 'test_dict_e2e', 'test-dash-1']
    P_FAMILIES.forEach((v, i) => pf.prepare('INSERT INTO t VALUES (?,?)').run(i + 1, v))
    pf.prepare('INSERT INTO t VALUES (90,?)').run('admin') // 非信号，必须不被捞出
    const got = pf
      .prepare(`SELECT name FROM t WHERE (${signalPrefilter('name')}) ORDER BY id`)
      .all()
      .map((r) => r.name)
    push(
      '预筛捞出全部六个信号族',
      P_FAMILIES.every((v) => got.includes(v)),
      got.join(',')
    )
    push('预筛不捞非信号行', !got.includes('admin'), got.join(','))
    const missedByRe = P_FAMILIES.filter((v) => !SIGNAL_RE.test(v))
    push('预筛与终审正则同源（无"捞出但判据不认"的多余族）', missedByRe.length === 0, missedByRe.join(','))
    pf.close()

    const rep = runAudit(db, { nowExpr: "'2098-01-01 00:00:00'", steps: SYNTH_STEPS, minColumns: 3 })
    push('发现面响亮失败未误触发', !rep.fatal, String(rep.fatal || ''))
    push('候选列发现数≥12', rep.scannedColumns >= 12, String(rep.scannedColumns))
    const hitBlind = (t, sub) => rep.blind.some((b) => b.table === t && b.value.includes(sub))
    for (const [t, sub] of SYNTH_EXPECT_BLIND)
      push(`盲区必报 ${t}.${sub}`, hitBlind(t, sub), rep.blind.map((b) => `${b.table}=${b.value}`).join(','))
    for (const [t, sub] of SYNTH_FORBIDDEN_BLIND) push(`盲区不得报 ${t}.${sub}`, !hitBlind(t, sub), '')
    const groupKeys = rep.groups.map((g) => `${g.kind}|${g.label}`)
    for (const want of SYNTH_EXPECT_GROUPS) push(`终态必报 ${want}`, groupKeys.includes(want), '')
    for (const ban of SYNTH_FORBIDDEN_GROUPS)
      push(`终态不得报 ${ban}`, !groupKeys.some((k) => k.startsWith(ban)), groupKeys.join(','))
    push(
      '同一族只报一次（去重）',
      new Set(rep.blind.map((b) => `${b.table}|${b.family}`)).size === rep.blind.length,
      rep.blind.map((b) => `${b.table}|${b.family}`).join(',')
    )
    push(
      '信息项全部采到（无 ERR）',
      rep.infos.every((i) => typeof i.n === 'number'),
      JSON.stringify(rep.infos)
    )
    push(
      '同族内已覆盖行不得被当成盲区（只看首行的实现会整族判覆盖）',
      rep.blind.filter((b) => b.table === 'sys_pat').length === 1,
      JSON.stringify(rep.blind.filter((b) => b.table === 'sys_pat'))
    )

    // ---- 扫描面本身腐化必须算发现（"这一列没判成"不得等于"这一列干净"）----
    const badSteps = SYNTH_STEPS.concat([['broken', "DELETE FROM sys_menu WHERE nosuchcolumn_xyz = 'x'"]])
    const rBad = runAudit(db, { nowExpr: "'2098-01-01 00:00:00'", steps: badSteps, minColumns: 3 })
    push(
      '谓词引用不存在的列 ⇒ 扫描失败必须上报',
      rBad.groups.some((g) => g.kind === '扫描失败' && g.label === 'sys_menu.menu_name'),
      rBad.groups.map((g) => g.kind + '|' + g.label).join(',')
    )
    const rCap = runAudit(db, { nowExpr: "'2098-01-01 00:00:00'", steps: SYNTH_STEPS, minColumns: 3, rowCap: 2 })
    push(
      '命中行数超过取样上限 ⇒ 必须声明"结论不完整"',
      rCap.groups.some((g) => g.kind === '扫描失败' && /行/.test(String(g.error))),
      String(
        rCap.groups
          .filter((g) => g.kind === '扫描失败')
          .map((g) => g.label)
          .join(',')
      )
    )
    const rCapBlind = rCap.blind.map((b) => `${b.table}|${b.family}`)
    push('截断后仍不得虚报盲区', !rCapBlind.some((k) => k.startsWith('sys_notice|')), rCapBlind.join(','))

    // ---- 反脆弱：判据面腐化必须响亮，不得静默报绿 ----
    const broken = new DatabaseSync(':memory:')
    broken.exec('CREATE TABLE t_only (id INTEGER PRIMARY KEY, name TEXT)')
    const rFat = runAudit(broken, { nowExpr: "'2098-01-01 00:00:00'", steps: SYNTH_STEPS })
    push('候选列低于下限时必须 fatal', !!rFat.fatal, String(rFat.fatal || '未报错'))
    broken.close()
    const missDb = new DatabaseSync(':memory:')
    missDb.exec(
      SYNTH_DDL +
        `INSERT INTO sys_role VALUES (1,'r','0');INSERT INTO sys_user VALUES (1,'u','0','0');
      INSERT INTO sys_menu VALUES (1,'m','p','0');INSERT INTO sys_config VALUES (1,'n','k','v','Y');
      INSERT INTO sys_dict_type VALUES (1,'d','dt','0','0');INSERT INTO sys_pat VALUES (1,'p','0','2030-01-01');
      INSERT INTO sys_notice VALUES (1,'t','0','2026-01-01');INSERT INTO sys_dept VALUES (1,'d','0');
      INSERT INTO sys_post VALUES (1,'c','n','0');INSERT INTO sys_tenant VALUES (1,'t','0');
      INSERT INTO flow_demo_doc VALUES (1,'t');INSERT INTO sys_notice_read VALUES (1,1,1);`
    )
    missDb.exec(`DROP TABLE sys_user`) // 判据引用的表消失 ⇒ 必须报"查询失败"而不是"0 条"
    const rMiss = runAudit(missDb, { nowExpr: "'2098-01-01 00:00:00'", steps: SYNTH_STEPS, minColumns: 3 })
    const mk = rMiss.groups.map((g) => `${g.kind}|${g.label}`)
    push(
      '缺表必须报查询失败（不得静默 0）',
      mk.some((k) => k.startsWith('查询失败|')),
      mk.join(',')
    )
    missDb.close()
    // ---- 公告清理成对性（§10 N-17）：五支形状 + 一支对**生产谓词表**的锁 ----
    const READ = (extra) =>
      `DELETE FROM sys_notice_read WHERE notice_id IN (SELECT notice_id FROM sys_notice WHERE notice_title LIKE 'E2E87%'${extra || ''})`
    const NOTICE = (prefix) => `DELETE FROM sys_notice WHERE notice_title LIKE '${prefix}'`
    push(
      '成对且已读在前 ⇒ 不得报',
      findUnpairedNoticeCleanup([
        ['notice_read', READ('')],
        ['notice', NOTICE('E2E87%')]
      ]).length === 0
    )
    push(
      '成对且已读在前（多前缀 ⊇ 单前缀）⇒ 不得报',
      findUnpairedNoticeCleanup([
        ['notice_read', READ(" OR notice_title LIKE 'E2EM1%'")],
        ['notice', NOTICE('E2E87%')]
      ]).length === 0
    )
    push('缺已读步骤 ⇒ 必须报', findUnpairedNoticeCleanup([['notice', NOTICE('E2E88%')]]).length === 1)
    push(
      '顺序颠倒（公告先删 ⇒ 已读子查询空转）⇒ 必须报',
      findUnpairedNoticeCleanup([
        ['notice', NOTICE('E2E88%')],
        [
          'notice_read',
          "DELETE FROM sys_notice_read WHERE notice_id IN (SELECT notice_id FROM sys_notice WHERE notice_title LIKE 'E2E88%')"
        ]
      ]).length === 1
    )
    push(
      '前缀不覆盖（新命名族漏配对偶）⇒ 必须报',
      findUnpairedNoticeCleanup([
        ['notice_read', READ('')],
        ['notice', NOTICE('E2E88%')]
      ]).length === 1
    )
    push(
      '全量兜底型已读步骤（不限标题）覆盖任意前缀 ⇒ 不得报',
      findUnpairedNoticeCleanup([
        ['notice_read', 'DELETE FROM sys_notice_read WHERE 1=1'],
        ['notice', NOTICE('whatever%')]
      ]).length === 0
    )
    // 这条才是本节的目的：随包发布的清理表必须自己满足不变式（夹具全绿而生产漏一对 = 虚锁）
    push(
      '生产 RESIDUE_STEPS 的公告清理成对（含顺序）',
      findUnpairedNoticeCleanup(RESIDUE_STEPS).length === 0,
      JSON.stringify(findUnpairedNoticeCleanup(RESIDUE_STEPS))
    )

    // ---- 时序自证（§10 N-14）：读得到就报数，读不到必须响亮 ----
    const timing = operLogFreshness(db)
    push(
      '时序探针读到最近写入时间',
      !!timing.maxTime && Number.isFinite(Number(timing.minsAgo)),
      JSON.stringify(timing)
    )
    const emptyDb = new DatabaseSync(':memory:')
    emptyDb.exec('CREATE TABLE other (id INTEGER PRIMARY KEY)')
    const timing2 = operLogFreshness(emptyDb)
    push('缺 sys_oper_log 时必须落到 error 字段（不得把"读不到"读成"很旧"）', !!timing2.error, JSON.stringify(timing2))
    emptyDb.close()
    // ---- 时序前置闸（§10 N-14 收口）：五支双向，"必须拒"与"必须放行"都实测 ----
    const gateCases = [
      ['跑批中（0 分钟前）必须拒', { minsAgo: 0 }, true],
      ['阈值内（1 分钟前）必须拒', { minsAgo: 1 }, true],
      ['未来的时间戳也必须拒（负差值同属"刚写过"）', { minsAgo: -3 }, true],
      ['刚好等于阈值不拒（边界不放大也不收紧）', { minsAgo: ACTIVE_WRITE_MINUTES }, false],
      ['停库后（5 分钟前）必须放行', { minsAgo: 5 }, false],
      [
        '读表失败必须拒（证明不了没人写＝不能出结论，fail-closed）',
        { maxTime: null, minsAgo: null, error: 'no such table' },
        true
      ],
      ['空库（新初始化）必须放行（没有写入痕迹，也不该因此跑不了结构面判据）', { maxTime: null, minsAgo: null }, false]
    ]
    for (const [name, timingIn, wantRefuse] of gateCases) {
      const v = activeWriteVerdict(timingIn)
      push(name, v.refuse === wantRefuse, `refuse=${v.refuse} reason="${v.reason}"`)
    }
    // 有行但时间解析不出来：这一支绝不能落到"空库放行"（b74 轮 25 的少报形状）
    const badTime = activeWriteVerdict({ maxTime: 'not-a-timestamp', minsAgo: null })
    push('maxTime 有值但不可解析时必须拒，而不是当成空库放行', badTime.refuse === true, JSON.stringify(badTime))
    const nanGate = activeWriteVerdict({ maxTime: '', minsAgo: 'abc' })
    push(
      'maxTime 为空串按空库处理（放行），非数值 minsAgo 不得被读成"很旧"',
      nanGate.refuse === false && nanGate.minsAgo === null,
      JSON.stringify(nanGate)
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return out
}

// ==================== 入口 ====================
const log = (...a) => console.log(...a)

if (process.argv.slice(2).includes('--selftest')) {
  const results = selftest()
  let bad = 0
  for (const r of results) {
    if (!r.ok) bad++
    log(`${r.ok ? '✅' : '✘'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  log(
    bad === 0
      ? `SYNTH_OK 测试数据态审计 ${results.length} 条双向（盲区/覆盖/终态/缺表与发现面响亮失败）`
      : `SYNTH_FAIL 测试数据态审计 ${bad}/${results.length} 条不通过`
  )
  process.exit(bad === 0 ? 0 : 1)
} else {
  const db = new DatabaseSync(DB_PATH, { readOnly: true })
  // 未来时间判据的基准：当下 +1h（与时区无关的字符串比较，留 1 小时余量给跨时区写入）
  let report
  try {
    report = runAudit(db, {})
  } finally {
    db.close()
  }
  printReport(report, log)
  const gate = activeWriteVerdict(report.timing)
  if (gate.refuse) {
    // 报告照常打出来（证据不能藏），但**退出码拒绝**：跑批中得到的"盲区/残留"与停库后
    // 不是同一件事，把它当成结论就是自我欺骗（§10 N-14）。
    log('')
    log(`[FATAL] 时序前置不成立：${gate.reason}`)
    log('        ⇒ 以上发现**不作数**。请在浏览器套件（main.mjs / deep-e2e.mjs）停止后重跑本审计。')
    process.exit(2)
  }
  const fails = (report.fatal ? 1 : 0) + report.blind.length + report.groups.length
  log('')
  log(
    fails === 0
      ? '✅ 测试数据态审计：全部判据为 0'
      : `✘ 测试数据态审计：${fails} 条发现，需逐条回库定性（不得放宽判据消化）`
  )
  process.exit(fails === 0 ? 0 : 1)
}
