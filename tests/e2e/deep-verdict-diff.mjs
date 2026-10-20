/**
 * deep-e2e 判据确定性对账（批七十九新增）
 *
 * 用途：把**同一产物、同一服务**的两轮全量日志做逐条 verdict 差集。
 * 差出来的那几条就是"与环境/竞态耦合的判据"——同一份代码跑出两种结论，
 * 说明该判据测的是机器当时多快，不是产品对不对（AGENTS「门禁不得与环境耦合」）。
 *
 * 本批实证：A 轮 1175✅/35 SKIP、B 轮 1176✅/34 SKIP，两轮各 1210 条，差集只有 1 条
 * （`SkeletonTable: 骨架屏（瞬时）`）。该条已改成 route 按住响应构造加载态，见 RUN-RECIPE §3.60.7。
 *
 * 用法：
 *   node tests/e2e/deep-verdict-diff.mjs <roundA.log> <roundB.log>
 *   node tests/e2e/deep-verdict-diff.mjs --selftest
 *
 * 退出码：
 *   0 = 两轮逐条同 verdict（套件在当前产物上确定性成立）
 *   1 = 存在抖动判据 / 总数不等 / 同模块内断言名重复（重名会让差集失真）
 *   2 = 用法或输入错误（文件不存在、非全量日志）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LINE_RE = new RegExp('^(✅ PASS|⏭ SKIP|❌ FAIL) \\[M(\\d+)\\] (.*)$')
// 日志形态由 `deep-e2e.mjs` 的 `log()` 写死：`${tag} [M${module}] ${name} - ${detail}`。
// 两条解析前提是实测逼出来的，改这里之前先拿一份真实全量日志对账：
// ① detail **可以整体缺失**（`record(..., detail='')` 走这一支）。真实 1210 条里只有 783 条带
//    " - 凭证"，按"必须有 ` - `"解析会静默丢掉 427 条判据，被丢的部分不参与对账却仍报"两轮一致"
//    ⇒ 少报比报错更坏。
// ② 竖线只可能出现在 detail 里。实测有 5 条 PASS 的凭证含 `|`（`全部名称=online:|dict:|login_ip:`、
//    `版本列=v2|v1`），用 `[^|]*` 匹配名字会把这 5 条整行漏掉 ⇒ 键分隔符改用 `\0`。
// 名字 = 第一个 " - " 之前的文本（writer 的逆运算）。名字本身含 " - " 时会被截短，那种情况必然
// 造成同模块重名，由 dups 检测当场抓住，不会静默失真。

/** 把一份日志解析成 `M<模块>\0<判据名> -> verdict` 的表，同时收集重名。 */
function parseVerdicts(file) {
  const text = fs.readFileSync(file, 'utf8')
  const map = new Map()
  const dups = new Set()
  let total = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\[[0-9:.]+\]\s*/, '')
    const m = LINE_RE.exec(line)
    if (!m) continue
    const rest = m[3]
    const sep = rest.indexOf(' - ')
    const name = (sep === -1 ? rest : rest.slice(0, sep)).trim()
    if (!name) continue
    const key = `M${m[2]}\0${name}`
    total++
    if (map.has(key)) dups.add(key)
    map.set(key, m[1])
  }
  return { map, dups, total, file }
}

function verdictCounts(map) {
  const c = { pass: 0, skip: 0, fail: 0 }
  for (const v of map.values()) {
    if (v === '✅ PASS') c.pass++
    else if (v === '⏭ SKIP') c.skip++
    else c.fail++
  }
  return c
}

/** 主判据：返回差集与结论；不打印（便于 selftest 复用）。 */
export function compare(a, b) {
  // 内部键用 `\0` 分隔（判据名里合法含 `|`），输出时才换成可读的 `M25|名字`
  const disp = (k) => k.replace('\0', '|')
  const keys = new Set([...a.map.keys(), ...b.map.keys()])
  const flipped = []
  const onlyA = []
  const onlyB = []
  for (const k of keys) {
    const va = a.map.get(k)
    const vb = b.map.get(k)
    if (va === undefined) onlyB.push(`${disp(k)} -> ${vb}`)
    else if (vb === undefined) onlyA.push(`${disp(k)} -> ${va}`)
    else if (va !== vb) flipped.push(`${disp(k)} -> ${va} / ${vb}`)
  }
  // 重名取**两轮并集**：同一个名字在两轮都重，报两遍是噪声，会让人以为有两处缺陷
  const dups = [...new Set([...a.dups, ...b.dups])].map(disp)
  const ok = flipped.length === 0 && onlyA.length === 0 && onlyB.length === 0 && dups.length === 0
  return { flipped, onlyA, onlyB, dups, totalA: a.total, totalB: b.total, ok }
}

function printReport(a, b, r) {
  const out = []
  const push = (s) => out.push(s)
  push('='.repeat(74))
  push('deep-e2e 判据确定性对账（两轮同产物逐条 verdict 差集）')
  push('='.repeat(74))
  const ca = verdictCounts(a.map)
  const cb = verdictCounts(b.map)
  push(`A: ${path.basename(a.file)}  逐条 ${a.total}（PASS ${ca.pass} / SKIP ${ca.skip} / FAIL ${ca.fail}）`)
  push(`B: ${path.basename(b.file)}  逐条 ${b.total}（PASS ${cb.pass} / SKIP ${cb.skip} / FAIL ${cb.fail}）`)
  if (a.total !== b.total) {
    push(`⚠ 两轮逐条总数不等（${a.total} vs ${b.total}）：判据集合发生过增删，差集口径仅适用于同产物同判据集`)
  }
  if (r.dups.length) {
    push(`❌ 同模块内断言名重复 ${r.dups.length} 处（重名会让差集失真，先改名再对账）：`)
    r.dups.slice(0, 20).forEach((k) => push(`    · ${k}`))
  }
  if (r.flipped.length) {
    push(`❌ 结论翻转 ${r.flipped.length} 条 ⇒ 与竞态/环境耦合的判据，必须改成"构造该状态"再判：`)
    r.flipped.forEach((l) => push(`    · ${l}`))
  }
  if (r.onlyA.length || r.onlyB.length) {
    push(`❌ 只在单轮出现 ${r.onlyA.length + r.onlyB.length} 条（该轮根本没执行到这条判据）：`)
    r.onlyA.forEach((l) => push(`    · 仅 A: ${l}`))
    r.onlyB.forEach((l) => push(`    · 仅 B: ${l}`))
  }
  if (r.ok) push('✅ 两轮逐条 verdict 完全一致 ⇒ 本轮套件的判据不依赖时序')
  else push('判据：`❌ 0` 只是必要条件；判据自身还必须先"两轮同结论"才有意义（RUN-RECIPE §3.60.7）')
  return out.join('\n')
}

// ==================== selftest ====================

function writeLog(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-diff-'))
  const file = path.join(dir, 'x.log')
  fs.writeFileSync(file, lines.join('\n'), 'utf8')
  return file
}

function selftest() {
  const base = [
    '[00:00:01] ✅ PASS [M1] 登录 - 成功',
    '[00:00:02] ⏭ SKIP [M1] 无数据则跳过 - 列表为空（软断言）',
    '[00:00:03] ✅ PASS [M2] 骨架屏 - 按住期间可见'
  ]
  const cases = [
    // ① 两轮逐条一致 ⇒ 必须判 OK
    { name: '相同两轮必须 OK', a: base, b: base, wantOk: true, wantDups: 0 },
    // ② 同一条判据翻 verdict（本批骨架屏的真实形态）⇒ 必须抓到
    {
      name: 'verdict 翻转必须抓到',
      a: base,
      b: [...base.slice(0, 2), '[00:00:03] ❌ FAIL [M2] 骨架屏 - 没抓到'],
      wantOk: false,
      wantDups: 0
    },
    // ③ 判据整体缺失（该轮根本没跑到）⇒ 必须抓到，不得当成"少一条无所谓"
    { name: '单轮缺失判据必须抓到', a: base, b: base.slice(0, 2), wantOk: false, wantDups: 0 },
    // ④ 同模块内重名 ⇒ 必须抓到（重名会让 Map 覆盖，差集失真）
    {
      name: '重名必须抓到',
      a: [
        '[00:00:01] ✅ PASS [M9] 同名判据 - 一处',
        '[00:00:02] ❌ FAIL [M9] 同名判据 - 另一处',
        '[00:00:03] ✅ PASS [M10] 别的 - ok'
      ],
      b: [
        '[00:00:01] ✅ PASS [M9] 同名判据 - 一处',
        '[00:00:02] ❌ FAIL [M9] 同名判据 - 另一处',
        '[00:00:03] ✅ PASS [M10] 别的 - ok'
      ],
      wantOk: false,
      wantDups: 1
    },
    // ⑤ 凭证里含 " - " 不得污染判据名（日志真实形态：`导出 - 文件名 = a - b.xlsx`）
    {
      name: '凭证含 " - " 不得污染判据名',
      a: ['[00:00:01] ✅ PASS [M30] 导出 - 文件名 = a - b.xlsx'],
      b: ['[00:00:01] ✅ PASS [M30] 导出 - 文件名 = a - b.xlsx'],
      wantOk: true,
      wantDups: 0
    }
  ]

  const failures = []
  for (const c of cases) {
    const a = parseVerdicts(writeLog(c.a))
    const b = parseVerdicts(writeLog(c.b))
    const r = compare(a, b)
    if (r.ok !== c.wantOk) {
      failures.push(
        `${c.name}: 期望 ok=${c.wantOk}，实际 ok=${r.ok}（flipped=${r.flipped.length} only=${r.onlyA.length + r.onlyB.length} dups=${r.dups.length}）`
      )
    }
    if (r.dups.length !== c.wantDups) {
      failures.push(`${c.name}: 期望重名 ${c.wantDups} 处，实际 ${r.dups.length} 处`)
    }
  }
  // 反证 A：解析器不能把非判据行（表头/分隔线/汇总）算进来
  const noise = parseVerdicts(
    writeLog([
      '[00:29:36] ==========================================',
      '[00:29:36] 深度端到端测试汇总',
      '[00:29:36] 耗时: 2742.1s | 模块: 87 | 检查: ✅ 1176 / ❌ 0',
      '[00:29:36] SKIP 最多的模块 TOP5: M43(3), M45(3)'
    ])
  )
  if (noise.total !== 0) failures.push(`噪声行被当成判据：total=${noise.total}`)
  // 反证 B：判据名含 `|` **必须**正常解析（内部键用 `\0` 分隔，竖线是名字里的合法字符）。
  // 早期版本用 `[^|]*` 匹配名字，把"凭证里含竖线"的 5 条真实 PASS 整行漏掉。
  const pipeName = parseVerdicts(
    writeLog([
      '[00:00:01] ✅ PASS [M7] 上行 | 下行 都在判据名里 - 无妨',
      '[00:00:02] ✅ PASS [M82] 缓存监控: 选中白名单内缓存名称 - 全部名称=online:|dict:|login_ip:'
    ])
  )
  if (pipeName.total !== 2) failures.push(`竖线行被漏计：total=${pipeName.total}（应为 2）`)
  if (!pipeName.map.has('M7\0上行 | 下行 都在判据名里')) {
    failures.push('判据名本身含竖线时键构造错位（内部键必须用 \\0 分隔）')
  }
  // 反证 C：**凭证整体缺失**的判据行必须计入（真实日志 1210 条里只有 783 条带凭证）。
  const mixed = parseVerdicts(
    writeLog([
      '[00:00:01] ✅ PASS [M29] stepby 用户登录',
      '[00:00:02] ✅ PASS [M29] 导出 - 文件名 = a.xlsx',
      '[00:00:03] ⏭ SKIP [M30] 无数据',
      '[00:00:04] ────── 模块 30 结束：✅ 13 / ❌ 0 ──────'
    ])
  )
  if (mixed.total !== 3) failures.push(`无凭证判据行漏计：total=${mixed.total}（应为 3）`)
  if (mixed.map.get('M29\0stepby 用户登录') !== '✅ PASS') {
    failures.push('无凭证行的名字/verdict 解析错位')
  }
  if (mixed.map.has('M29\0导出 - 文件名 = a.xlsx')) {
    failures.push('凭证未被切掉：判据名里仍含 " - "，两轮凭证一变就假报抖动')
  }

  if (failures.length) {
    console.log('SYNTH_FAIL:')
    failures.forEach((f) => console.log(`  · ${f}`))
    return 1
  }
  console.log('SYNTH_OK  5 类合成用例双向 + 3 条反证（噪声行不计入 / 竖线名必须计入 / 无凭证行必须计入）')
  return 0
}

// ==================== CLI ====================

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) process.exit(selftest())
  const [fa, fb] = args
  if (!fa || !fb) {
    console.log('用法: node deep-verdict-diff.mjs <roundA.log> <roundB.log> | --selftest')
    process.exit(2)
  }
  for (const f of [fa, fb]) {
    if (!fs.existsSync(f)) {
      console.log(`[FATAL] 日志不存在：${f}`)
      process.exit(2)
    }
  }
  const a = parseVerdicts(fa)
  const b = parseVerdicts(fb)
  if (a.total === 0 || b.total === 0) {
    // 空集合不得当成"两轮一致"——那正是"没跑"冒充"跑了且干净"（§门禁必须响亮失败）
    console.log(`[FATAL] 判据行数为 0（A=${a.total} B=${b.total}），该日志不是 deep-e2e 全量输出`)
    process.exit(2)
  }
  console.log(printReport(a, b, compare(a, b)))
  process.exit(compare(a, b).ok && a.total === b.total ? 0 : 1)
}

main()
