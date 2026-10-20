/**
 * 出站请求**风暴**棘轮（批七十九收口第三轮新增判据）。
 *
 * 数据源是现成的：`deep-e2e.mjs` 每轮把"每个动作发了哪些请求、各发几次"写进
 * `screenshots/deep-e2e-reqstats.json`（`full: true` 才写主文件，见 RUN-RECIPE §3.63）。
 * 采集自 b74 就在做，但**从来没有判据消费它**——"采了不判"等于没采：
 * 实测这份数据集里就藏着 `M30 load | GET /getInfo ×55`、`GET /getRouters ×55` 这种量级，
 * 一次页面加载把同一个接口打 55 遍，要么是轮询泄漏要么是逐行请求，而这件事此前**只有人眼**能发现。
 *
 * **判据取"每导航均值"，不取"每轮总次数"**（§10 N-13 那条立案的落地）。b74 当时的结论是：
 * 总数同时受两件事驱动——这个模块本轮**访问了几页**，以及**机器快慢**（轮询/心跳类端点的次数
 * 与本轮墙钟时长成正比）。所以无论写死上限还是判"总数相对增幅"，都会把 AGENTS《门禁全景》
 * 那条"门禁不得与环境耦合"再违反一次——这正是当初它只落盘不判的原因。
 * 分母换成 hub 自己采的**文档级导航数**（`capture-kit.mjs` 的 `navCount`，只算 main frame 的
 * http(s) 导航）之后，"页数"这一半被除掉；剩下的轮询那一半由"容差 + 新键密度下限 + 先比后写"
 * 三道一起兜。纯 API 动作（一次都不导航，如 M88）`navs=0`，分母取 `max(1, navs)` ⇒ 按"一次
 * 工作单元"计，不会算出 `Infinity`。
 *
 * 四条口径纪律（都是本批已付过学费的形状）：
 * ① `--gate` 与 `--update-baseline` 共用同一份纯比较函数 `stormRegressions`，退步时基线**不改动**
 *    （§7.14：退出码不撤回已经写出去的文件）；
 * ② 数据集必须 `full === true`、带窗口、且**每行都带 `navs`**，否则响亮失败
 *    （§7.19 / §3.63：分段轮是子集、旧采集格式没有分母，拿它们判风暴会把"没跑 / 判不了"
 *    读成"没变差"；缺分母尤其不能当 0——那会把密度放大成 total，全线误报）；
 * ③ 非数值/缺字段一律按"判不了"处理而不是"没退步"（`NaN > tol` 恒 false 那个漏洞）；
 * ④ 基线必须记**口径名**（`metric`）：`perKey` 里数字的含义换了（总次数 → 每导航均值）而不换标记时，
 *    拿新阈值比旧数字会**静默失真**——与 §7.19 的 `sources` 源集合对账是同一条纪律。
 *
 * 用法：
 *   node tests/e2e/request-storm.mjs                 # 打印 Top 与逐键密度
 *   node tests/e2e/request-storm.mjs --gate          # 与基线比对，退步即红
 *   node tests/e2e/request-storm.mjs --update-baseline
 *   node tests/e2e/request-storm.mjs --selftest
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertFullRun, readWindow } from './dataset-window.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATASET = path.join(HERE, 'screenshots', 'deep-e2e-reqstats.json')
const BASELINE = path.join(HERE, 'request-storm-baseline.json')

/**
 * 已声明轮询清单（§10 N-21）。
 *
 * 事实源必须**可核对**：端点键 + 间隔（毫秒）+ 代码位置 + 为什么它就该周期性出网。
 * 只在人脑里记着"这个是合法轮询"，第一次跑就会被新键密度下限判成风暴；反过来为了
 * 消红而放宽全局阈值，会把真正的逐行请求一起放走。声明只对**点名的端点**生效，
 * 且要求 `source` 指向真实代码位置——这与 `endpoint-coverage-reasons.json` 同一条纪律：
 * 理由写在文档里不是判据，登记表本身要过闸。
 */
const DECLARATIONS = path.join(HERE, 'polling-declarations.json')

export function loadDeclarations(file = DECLARATIONS) {
  if (!fs.existsSync(file)) {
    throw new Error(`轮询声明清单不存在：${file}（缺失即"未声明"，不得静默当成空集）`)
  }
  let body
  try {
    body = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`轮询声明清单 JSON 解析失败：${e.message}`)
  }
  if (!body || body.version !== 1)
    throw new Error(`轮询声明清单 version 必须为 1（实际 ${JSON.stringify(body?.version)}）`)
  if (!Array.isArray(body.declarations) || body.declarations.length === 0) {
    throw new Error('轮询声明清单 declarations 必须是非空数组')
  }
  const seen = new Set()
  const out = new Map()
  for (const [i, d] of body.declarations.entries()) {
    const at = `declarations[${i}]`
    if (!d || typeof d !== 'object') throw new Error(`${at} 不是对象`)
    const key = typeof d.key === 'string' ? d.key.trim() : ''
    if (!/^(GET|POST|PUT|DELETE|PATCH) \/\S+/.test(key)) {
      throw new Error(`${at}.key 必须是 "METHOD /path" 形态（实际 ${JSON.stringify(d.key)}）`)
    }
    if (seen.has(key)) throw new Error(`${at}.key 重复登记：${key}`)
    const interval = Number(d.intervalMs)
    if (!Number.isFinite(interval) || interval <= 0 || interval > 24 * 3600 * 1000) {
      throw new Error(`${at}.intervalMs 必须是 (0, 24h] 的数值（实际 ${JSON.stringify(d.intervalMs)}）`)
    }
    const source = typeof d.source === 'string' ? d.source.trim() : ''
    // 代码位置必须带行号锚点：只写文件名等于"某处"，改完代码仍会假装成立
    if (!/^[A-Za-z0-9_./-]+:\d+$/.test(source)) {
      throw new Error(`${at}.source 必须是 "相对路径:行号"（实际 ${JSON.stringify(d.source)}）`)
    }
    // 行号锚点必须指得到真实文件：只校验格式的话，`a.ts:1` 也能登记，
    // 声明就退化成"随手写的一句话"。按仓库根解析（脚本在 stepby-vue/tests/e2e 下三层）。
    const [rel, lineRaw] = source.split(':')
    const repoRoot = path.resolve(HERE, '../../..')
    const abs = path.resolve(repoRoot, rel)
    if (!abs.startsWith(repoRoot + path.sep) || !fs.existsSync(abs)) {
      throw new Error(`${at}.source 指向的文件不存在：${source}（仓库根 ${repoRoot}）`)
    }
    const lineCount = fs.readFileSync(abs, 'utf8').split('\n').length
    if (Number(lineRaw) < 1 || Number(lineRaw) > lineCount) {
      throw new Error(`${at}.source 行号越界：${source}（文件仅 ${lineCount} 行）`)
    }
    const why = typeof d.why === 'string' ? d.why.trim() : ''
    if (why.length < 10) throw new Error(`${at}.why 至少 10 个字符，写清为什么它必须周期性出网`)
    seen.add(key)
    out.set(key, { key, intervalMs: interval, source, why })
  }
  return out
}

/**
 * 基线口径名。换分母/换判据含义必须同时换掉它并重生成基线（见 `assertBaselineShape`）。
 *
 * b81 从 `density-per-nav` 升为 `density-per-nav-endpoint`：采集键原本是
 * `"<动作> | GET /path"`，同一端点在不同动作里各成一条，既无法回答"这个端点每页打几次"，
 * 也让 N-21 的"按端点声明轮询"永远匹配不上。现在聚合时剥掉动作前缀，按端点求和；
 * 这是**换判据**，必须与重生成基线同批，不能拿旧数字继续比。
 */
export const METRIC = 'density-per-nav-endpoint'

/** 单键允许的最大增幅（相对基线密度）。小于它的波动视为噪声，不参与判红。 */
export const STORM_TOLERANCE = 0.25

/**
 * 基线里没有的新键，**每导航**超过这个次数才单独报。
 * 形状依据：一次正常页面加载对同一端点的合法用量是个位数下限（列表 + 字典 + 一次计数），
 * 而"逐行请求""每次渲染重拉"这类回归一上来就是几十次/页。该参数写进基线（`newDensityFloor`），
 * 调它必须与重生成基线同批——否则是拿更松的阈值比一份按旧阈值写的基线。
 */
export const NEW_DENSITY_FLOOR = 5

const log = (...a) => console.log(...a)

/**
 * 把数据集的 rows 聚成
 * `端点键 → { total, navs, density, maxPerAction, maxTag, maxDensity, maxDensityTag }`。
 * rows 的形状是 `{ tag: 'M30 load', key: 'GET /system/notice/listTop', count: 12, navs: 4 }`。
 *
 * `density = total / max(1, 触达该端点的那些动作的导航数之和)`；
 * `maxDensity` 取**单个动作内最密**的那个（"这一页每次都打 20 遍"比全站均值更能定位问题）。
 */
export function aggregate(rows) {
  const out = new Map()
  for (const r of rows) {
    const rawKey = String(r.key || '').trim()
    if (!rawKey) continue
    // 采集键形如 `"load | GET /system/notice/listTop"`（动作由 capture-kit 的 beginAction 写入）。
    // 动作前缀只影响"哪次点击发的"，不是端点身份；不剥掉会让同一端点按动作裂成多条，
    // 并使 N-21 的按端点声明永远匹配不上。没有前缀的合成数据（自检）原样使用。
    const sep = rawKey.lastIndexOf(' | ')
    const key = sep > 0 ? rawKey.slice(sep + 3).trim() : rawKey
    if (!key) continue
    const c = Number(r.count)
    if (!Number.isFinite(c) || c <= 0) continue
    const navsRaw = Number(r.navs)
    const navs = Number.isFinite(navsRaw) && navsRaw > 0 ? navsRaw : 0
    const tag = String(r.tag || '')
    const cur = out.get(key) || {
      total: 0,
      navByTag: new Map(),
      maxPerAction: 0,
      maxTag: '',
      maxDensity: 0,
      maxDensityTag: ''
    }
    cur.total += c
    // 同一动作的导航数只进分母一次（它对该端点发几条都发生在同样的这几页里）
    if (!cur.navByTag.has(tag)) cur.navByTag.set(tag, navs)
    if (c > cur.maxPerAction) {
      cur.maxPerAction = c
      cur.maxTag = tag
    }
    const d = c / Math.max(1, navs)
    if (d > cur.maxDensity) {
      cur.maxDensity = d
      cur.maxDensityTag = tag
    }
    out.set(key, cur)
  }
  for (const cur of out.values()) {
    cur.navs = [...cur.navByTag.values()].reduce((s, v) => s + v, 0)
    cur.density = cur.total / Math.max(1, cur.navs)
  }
  return out
}

/**
 * 读取并校验数据集。四类输入问题一律硬失败，不做"静默当 0"：
 * 非全量 / 无窗口 / rows 空 / **行里没有 navs 分母**（旧采集格式）。
 */
export function loadDataset(file = DATASET) {
  if (!fs.existsSync(file)) throw new Error(`数据集不存在：${file}（需先跑一轮 deep-e2e 全量）`)
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  // 两条闸与 endpoint-coverage 共用同一份纯函数模块（dataset-window.mjs），
  // 不是各写一份——各写一遍必漂，且历史上 import 入口脚本会让被依赖方吞掉 argv 直接退出。
  assertFullRun(d, file)
  const w = readWindow(d, file)
  if (!Array.isArray(d.rows) || d.rows.length === 0) throw new Error('数据集 rows 为空，判据不作数')
  const noNavs = d.rows.filter((r) => !Number.isFinite(Number(r.navs))).length
  if (noNavs > 0) {
    throw new Error(
      `数据集有 ${noNavs}/${d.rows.length} 行不带 navs（文档级导航数）——那是 ` +
        `capture-kit 的 navCount 落地之前的旧采集产物。请重跑一轮全量；` +
        `不得把缺分母当"导航数 0"（那会把密度放大成 total，全线误报）`
    )
  }
  const agg = aggregate(d.rows)
  if (agg.size === 0) throw new Error('聚合后没有任何端点键——采集面已坏')
  return { agg, window: w, totalRequests: [...agg.values()].reduce((s, v) => s + v.total, 0) }
}

/**
 * 唯一比较式（`--gate` 与 `--update-baseline` 共用）。返回退步项，空数组=不退步。
 * 基线形状：`{ perKey: { "GET /x": 2.5 } }`，值 = **每导航均值**。
 *
 * `declared` 里的端点**只记密度、不设阈**（§10 N-21）：它们的周期性出网是设计行为，
 * 但声明必须逐条带间隔与代码位置（`loadDeclarations` 已校验），不是一句通配。
 * 未声明端点照旧走容差 + 新键下限；两者不共享任何"豁免"状态。
 */
export function stormRegressions(
  basePerKey,
  agg,
  tol = STORM_TOLERANCE,
  newFloor = NEW_DENSITY_FLOOR,
  declared = new Set()
) {
  const bad = []
  for (const [key, cur] of agg) {
    if (declared.has(key)) continue
    const base = basePerKey ? basePerKey[key] : undefined
    if (base === undefined) {
      if (cur.density >= newFloor) {
        bad.push({ key, base: null, now: cur.density, why: `新出网面且每导航 ${cur.density.toFixed(2)} ≥ ${newFloor}` })
      }
      continue
    }
    const b = Number(base)
    if (!Number.isFinite(b) || b < 0) {
      bad.push({
        key,
        base: base ?? null,
        now: cur.density,
        why: '基线值不是非负数值 ⇒ 判不了，按退步处理（fail-closed）'
      })
      continue
    }
    // 基线记 0（那一轮该端点一条没发）而现在有：等价于"新出网面"，按同一下限判
    if (b === 0) {
      if (cur.density >= newFloor) {
        bad.push({ key, base: 0, now: cur.density, why: `从 0 涨到每导航 ${cur.density.toFixed(2)} ≥ ${newFloor}` })
      }
      continue
    }
    const grew = cur.density - b
    if (grew > b * tol) {
      bad.push({ key, base: b, now: cur.density, why: `密度增幅 ${grew.toFixed(2)} > 基线 ${b.toFixed(2)} × ${tol}` })
    }
  }
  return bad
}

/**
 * 登记通道（b79 收口第三轮补的设计缺陷）：`--update-baseline` 遇到"新出网面密度超下限"时，
 * 如果一律拒绝，那么**任何合法新增用例**（新模块多发几个请求）都会把棘轮锁死——
 * 基线永远吸收不了新现实，结局是有人直接把门禁关掉。所以留一条显式、可审计的登记旗标：
 * 只有命令行上点名的键才允许作为"本轮新增"落进基线，其余退步照旧拒绝落盘。
 * 纯函数，自检 ⑬ 双向钉它（含"拼错键名不得生效"这一条反证）。
 */
export function filterAccepted(bad, acceptedKeys = []) {
  const accepted = new Set(acceptedKeys.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim()))
  if (!accepted.size) return bad
  return bad.filter((x) => !accepted.has(x.key))
}

/** 收紧入口用：先比后写，退步时**一个字都不落盘**（§7.14）。 */
export function writeBaseline({ window, agg, totalRequests, acceptedNewKeys = [], resetFrom = null }) {
  const perKey = {}
  const totals = {}
  for (const [k, v] of agg) {
    perKey[k] = Number(v.density.toFixed(4))
    totals[k] = v.total
  }
  const body = {
    generatedAt: new Date().toISOString(),
    full: true,
    metric: METRIC,
    window,
    tolerance: STORM_TOLERANCE,
    newDensityFloor: NEW_DENSITY_FLOOR,
    totalRequests,
    keys: Object.keys(perKey).length,
    perKey,
    totals,
    // 口径变更留痕：谁都能看到这份基线不是与旧数字比出来的，而是换了判据后重建的
    ...(resetFrom ? { resetFrom } : {}),
    // 审计留痕：哪些键是"人点名登记进来的新出网面"，谁都能在这份文件里看到它不是自然长出来的
    ...(acceptedNewKeys.length ? { acceptedNewKeys } : {})
  }
  fs.writeFileSync(BASELINE, JSON.stringify(body, null, 2) + '\n', 'utf8')
  return body
}

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return null
  try {
    return JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  } catch (e) {
    throw new Error(`基线 JSON 解析失败：${e.message}`)
  }
}

/**
 * 基线形状闸：非 full / 口径名不对 / 缺窗口 / 没有 perKey / **判据参数与代码不一致**
 * 一律拒绝比对。
 * 棘轮的比较式写错方向是"每轮必红"（有人立刻来修），基线形状写错是"永不红"——
 * 后者必须 fail-closed，"取不到口径"不得读成"没有退步"（同 §7.14 的另一侧）。
 * 参数与口径同理：把 `STORM_TOLERANCE` 从 0.25 调到 0.6、或把 `perKey` 的含义从总次数换成
 * 每导航均值，再拿旧基线比，数字确实"变好"了，但那是**换判据**不是变好
 * （与 §7.19 的 `sources` 源集合对账同一条纪律）。
 */
export function assertBaselineShape(
  base,
  fileLabel = BASELINE,
  expect = { metric: METRIC, tolerance: STORM_TOLERANCE, newDensityFloor: NEW_DENSITY_FLOOR }
) {
  if (!base) throw new Error(`基线不存在：${fileLabel}（先在一次全量轮之后跑 --update-baseline 生成）`)
  if (base.full !== true) {
    throw new Error(`基线未标记 full（实际 ${JSON.stringify(base.full)}，${fileLabel}）——分段轮基线与全量轮不可比对`)
  }
  if (base.metric !== expect.metric) {
    throw new Error(
      `基线口径是 ${JSON.stringify(base.metric)}，代码现在判的是 ${JSON.stringify(expect.metric)}。` +
        `换口径必须与重生成基线同批完成——拿"每导航均值"的阈值去比一份记录着"每轮总次数"的基线，` +
        `得到的是静默失真而不是报错`
    )
  }
  const w = base.window
  if (!w || typeof w.since !== 'string' || typeof w.until !== 'string' || !w.since || !w.until) {
    throw new Error(`基线没有 window.since/until（${fileLabel}）⇒ 无法核对两次是否同一口径的全量轮，拒绝比对`)
  }
  if (w.since >= w.until) throw new Error(`基线窗口方向可疑：${w.since} .. ${w.until}`)
  if (!base.perKey || typeof base.perKey !== 'object') throw new Error('基线没有 perKey 映射，拒绝比对')
  for (const k of ['tolerance', 'newDensityFloor']) {
    const recorded = Number(base[k])
    if (!Number.isFinite(recorded))
      throw new Error(`基线没有记录判据参数 ${k}（实际 ${JSON.stringify(base[k])}）——无法确认比对口径，拒绝比对`)
    if (recorded !== expect[k]) {
      throw new Error(
        `判据参数与基线不一致：${k} 基线记录 ${recorded}、代码现为 ${expect[k]}。` +
          `换判据必须与重生成基线同批完成，不得拿新参数比旧基线（那只会白赚一个更宽松的结论）`
      )
    }
  }
  return w
}

// ==================== 自检（合成数据集双向，不碰浏览器也不碰运行库）====================

function selftest() {
  const fail = []
  const mk = (rows, extra = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storm-'))
    const f = path.join(dir, 'd.json')
    fs.writeFileSync(
      f,
      JSON.stringify({
        full: true,
        windowStart: '2026-01-01 00:00:00',
        windowEnd: '2026-01-02 00:00:00',
        rows,
        ...extra
      })
    )
    return { f, dir }
  }
  // ① 正常读取 + 聚合/密度正确性（同端点跨动作求和；分母=触达它的动作的导航数之和）
  const a = mk([
    // 一条带动作前缀、一条不带：真实采集键是 `"<动作> | METHOD /path"`，两者必须聚成同一端点
    { tag: 'M1 load', key: 'load | GET /getInfo', count: 3, navs: 3 },
    { tag: 'M2 load', key: 'GET /getInfo', count: 9, navs: 3 },
    { tag: 'M88 api', key: 'POST /system/user', count: 4, navs: 0 }
  ])
  const ds = loadDataset(a.f)
  const getInfo = ds.agg.get('GET /getInfo')
  if (getInfo.total !== 12) fail.push(`① 求和错：${getInfo.total}（期望 12）`)
  if (getInfo.navs !== 6) fail.push(`① 分母错：${getInfo.navs}（期望两个动作导航数之和 6）`)
  if (Math.abs(getInfo.density - 2) > 1e-9) fail.push(`① 密度错：${getInfo.density}（期望 12/6=2）`)
  if (getInfo.maxPerAction !== 9 || getInfo.maxTag !== 'M2 load') {
    fail.push(`① 单动作峰值取错：${getInfo.maxPerAction}@${getInfo.maxTag}`)
  }
  // 最密动作要能定位到"哪一页"：M1 是 3 次/3 导航=1，M2 是 9 次/3 导航=3
  if (Math.abs(getInfo.maxDensity - 3) > 1e-9 || getInfo.maxDensityTag !== 'M2 load') {
    fail.push(`① 最密动作定位错：${getInfo.maxDensity}@${getInfo.maxDensityTag}（期望 3@M2 load）`)
  }
  // 纯 API 动作 navs=0 ⇒ 分母取 max(1,0)=1，密度=4（不得变成 Infinity / NaN）
  const api = ds.agg.get('POST /system/user')
  if (!Number.isFinite(api.density) || api.density !== 4) fail.push(`① navs=0 的密度错：${api.density}（期望 4）`)
  if (ds.totalRequests !== 16) fail.push(`① 总量错：${ds.totalRequests}`)
  if (ds.window.since !== '2026-01-01 00:00:00') fail.push('① 窗口没带出来')
  // ② 非 full 数据集必须拒（分段轮判风暴会把"没跑"读成"没变差"）
  const b = mk([{ tag: 'M1', key: 'GET /x', count: 1, navs: 1 }], { full: false })
  try {
    loadDataset(b.f)
    fail.push('② 非 full 数据集被接受')
  } catch {
    /* 期望：响亮失败 */
  }
  // ③ 无窗口必须拒（与 endpoint-coverage 同一条闸，不是各写一份）
  const c = mk([{ tag: 'M1', key: 'GET /x', count: 1, navs: 1 }])
  const rawC = JSON.parse(fs.readFileSync(c.f, 'utf8'))
  delete rawC.windowStart
  fs.writeFileSync(c.f, JSON.stringify(rawC))
  try {
    loadDataset(c.f)
    fail.push('③ 缺窗口的数据集被接受')
  } catch {
    /* 期望 */
  }
  // ④ rows 空必须拒
  const e0 = mk([])
  try {
    loadDataset(e0.f)
    fail.push('④ 空 rows 被当成合法输入')
  } catch {
    /* 期望 */
  }
  // ⑤ 旧采集格式（行里没有 navs）必须拒，且理由要指向分母
  const e5 = mk([{ tag: 'M1', key: 'GET /x', count: 3 }])
  try {
    loadDataset(e5.f)
    fail.push('⑤ 不带 navs 的旧数据集被接受')
  } catch (err) {
    if (!/navs/.test(err.message)) fail.push(`⑤ 拒绝理由没指向分母：${err.message}`)
  }
  // ⑥ 比较式正向：容差内的密度波动不得报（否则每轮都红）
  const base6 = { 'GET /getInfo': 2.0, 'POST /system/user': 4.0 }
  const ok = stormRegressions(
    base6,
    aggregate([
      { tag: 'M1', key: 'GET /getInfo', count: 5, navs: 3 }, // 5/3=1.67 ≤ 2×1.25
      { tag: 'M2', key: 'POST /system/user', count: 4, navs: 1 }
    ])
  )
  if (ok.length !== 0) fail.push(`⑥ 容差内的波动被报了：${JSON.stringify(ok)}`)
  // ⑦ 比较式反向：每页 1 次 → 每页 4 次这种量级必须报
  const bad = stormRegressions(
    { 'GET /getInfo': 1 },
    aggregate([{ tag: 'M1', key: 'GET /getInfo', count: 40, navs: 10 }])
  )
  if (bad.length !== 1) fail.push(`⑦ 密度翻 4 倍没有报（得到 ${bad.length}）`)
  // ⑧ **页数变多而密度不变 不得报**——这正是把口径从总次数换成每导航均值要买到的东西：
  //    换完之后"这轮多跑了 50 页 / 慢机器多轮询几轮"不再能决定门禁绿红。
  const e8 = stormRegressions(
    { 'GET /getInfo': 2 },
    aggregate([{ tag: 'M1', key: 'GET /getInfo', count: 200, navs: 100 }])
  )
  if (e8.length !== 0) fail.push(`⑧ "多跑了 90 页"被判成风暴：${JSON.stringify(e8)}`)
  // ⑨ 新出网面 / 基线记 0：低于密度下限不报，高于必报（双向）
  const newLow = stormRegressions({}, aggregate([{ tag: 'M1', key: 'GET /brand-new', count: 4, navs: 2 }]))
  const newHigh = stormRegressions({}, aggregate([{ tag: 'M1', key: 'GET /brand-new', count: 40, navs: 2 }]))
  if (newLow.length !== 0) fail.push('⑨ 低密度新键被误报')
  if (newHigh.length !== 1) fail.push(`⑨ 每导航 20 次的新键没有报（得到 ${newHigh.length}）`)
  const zeroBase = stormRegressions({ 'GET /x': 0 }, aggregate([{ tag: 'M1', key: 'GET /x', count: 30, navs: 1 }]))
  if (zeroBase.length !== 1) fail.push('⑨ 基线 0 → 每导航 30 次没有报')
  // ⑩ fail-closed：基线值是字符串/NaN 时必须报，不得读成"没有退步"
  const nan = stormRegressions({ 'GET /x': 'abc' }, aggregate([{ tag: 'M1', key: 'GET /x', count: 10, navs: 1 }]))
  if (nan.length !== 1) fail.push('⑩ 基线非数值被当成了"没退步"')
  // ⑪ 聚合必须无视畸形行（缺 key / 负数 / 非数字），但**不能**把整份数据集判空
  const mixed = aggregate([
    { key: '', count: 5, navs: 1 },
    { key: 'GET /y', count: -3, navs: 1 },
    { key: 'GET /y', count: 'x', navs: 1 },
    { key: 'GET /y', count: 4, navs: 2 }
  ])
  if (mixed.size !== 1 || mixed.get('GET /y').total !== 4) fail.push(`⑪ 畸形行处理不当：${JSON.stringify([...mixed])}`)
  // ⑫ 基线形状闸双向：合法基线必须通过并带出窗口；九类坏基线一律拒绝比对。
  // 这条锁的是"永不红"那一侧——形状判据写错不会让门禁报错，只会让它安静地放行。
  const goodBase = {
    full: true,
    metric: METRIC,
    window: { since: '2026-01-01 00:00:00', until: '2026-01-02 00:00:00' },
    perKey: { 'GET /x': 1 },
    tolerance: STORM_TOLERANCE,
    newDensityFloor: NEW_DENSITY_FLOOR
  }
  try {
    const w = assertBaselineShape(goodBase, '(内存)')
    if (w.since !== goodBase.window.since) fail.push('⑫ 合法基线的窗口没带出来')
  } catch (e) {
    fail.push(`⑫ 合法基线被拒了：${e.message}`)
  }
  const badBases = [
    ['null', null],
    ['未标记 full', { ...goodBase, full: false }],
    ['口径名不对（旧版判的是每轮总次数）', { ...goodBase, metric: 'total-per-round' }],
    ['缺 window', { ...goodBase, window: undefined }],
    ['窗口方向反', { ...goodBase, window: { since: '2026-01-02 00:00:00', until: '2026-01-01 00:00:00' } }],
    ['缺 perKey', { ...goodBase, perKey: null }],
    ['缺 tolerance', { ...goodBase, tolerance: undefined }],
    // 换判据必须与重生成基线同批：拿 0.6 的新容差去比记录着 0.25 的旧基线，数字会"变好"
    ['tolerance 被放宽', { ...goodBase, tolerance: STORM_TOLERANCE + 0.35 }],
    ['newDensityFloor 非数值', { ...goodBase, newDensityFloor: 'lots' }]
  ]
  for (const [label, bs] of badBases) {
    try {
      assertBaselineShape(bs, '(内存)')
      fail.push(`⑫ 坏基线被接受：${label}`)
    } catch {
      /* 期望：拒绝比对 */
    }
  }
  // ⑬ 登记通道双向：点名的键才被放行，没点名的照旧算退步（否则"先比后写"会被一句通配掏空）
  const newBad = stormRegressions({}, aggregate([{ tag: 'M99', key: 'POST /brand/new', count: 9, navs: 1 }]))
  if (newBad.length !== 1) fail.push(`⑬ 新键基线判据本身没报（得到 ${newBad.length}）`)
  if (filterAccepted(newBad, ['POST /brand/new']).length !== 0) fail.push('⑬ 点名登记的键没被放行')
  if (filterAccepted(newBad, ['POST /brand/other']).length !== 1) fail.push('⑬ 没点名的键被误放行')
  if (filterAccepted(newBad, []).length !== 1) fail.push('⑬ 没给登记旗标时退步被吞掉了（等于没有闸）')
  if (filterAccepted(newBad, ['  ', '']).length !== 1) fail.push('⑬ 空白键名当成有效登记')
  if (filterAccepted(newBad, ['POST /brand/new', 'POST /brand/new']).length !== 0)
    fail.push('⑬ 重复登记抛错或计数异常（应幂等）')
  // ⑭ 已声明轮询（§10 N-21）双向：合法声明读得出；声明项高密度不报；未声明同名项照报；
  //    任何形状缺陷（缺间隔 / 无行号 / 空理由 / 重复 / 版本错）都必须响亮拒绝——
  //    "声明清单坏了被当成空集"会让所有合法轮询重新变成风暴，反之写成通配则把真回归一起放走。
  const mkDecl = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storm-decl-'))
    const f = path.join(dir, 'd.json')
    fs.writeFileSync(f, JSON.stringify(body))
    return { f, dir }
  }
  const goodDecl = mkDecl({
    version: 1,
    declarations: [
      {
        key: 'GET /monitor/server',
        intervalMs: 2000,
        source: 'stepby-vue/src/views/monitor/server/index.vue:243',
        why: '服务器监控页面自动刷新'
      }
    ]
  })
  try {
    const decl = loadDeclarations(goodDecl.f)
    if (!decl.has('GET /monitor/server') || decl.get('GET /monitor/server').intervalMs !== 2000) {
      fail.push('⑭ 合法声明没有读出来')
    }
  } catch (e) {
    fail.push(`⑭ 合法声明被拒：${e.message}`)
  }
  const declaredHigh = stormRegressions(
    {},
    aggregate([{ tag: 'M99', key: 'GET /monitor/server', count: 400, navs: 1 }]),
    STORM_TOLERANCE,
    NEW_DENSITY_FLOOR,
    new Set(['GET /monitor/server'])
  )
  if (declaredHigh.length !== 0) fail.push(`⑭ 已声明端点仍被按风暴报：${JSON.stringify(declaredHigh)}`)
  const undeclaredSame = stormRegressions(
    {},
    aggregate([{ tag: 'M99', key: 'GET /monitor/server', count: 400, navs: 1 }])
  )
  if (undeclaredSame.length !== 1) fail.push('⑭ 去掉声明后同一端点没有被报（声明通道成了通配）')
  const declaredGrowth = stormRegressions(
    { 'GET /monitor/server': 1 },
    aggregate([{ tag: 'M99', key: 'GET /monitor/server', count: 400, navs: 1 }]),
    STORM_TOLERANCE,
    NEW_DENSITY_FLOOR,
    new Set(['GET /monitor/server'])
  )
  if (declaredGrowth.length !== 0) fail.push('⑭ 已声明端点的基线增幅仍被报')
  const badDecls = [
    [
      '版本错',
      { version: 2, declarations: [{ key: 'GET /x', intervalMs: 1, source: 'a.ts:1', why: '为什么必须轮询' }] }
    ],
    ['空清单', { version: 1, declarations: [] }],
    ['缺间隔', { version: 1, declarations: [{ key: 'GET /x', source: 'a.ts:1', why: '为什么必须轮询' }] }],
    [
      '间隔为 0',
      { version: 1, declarations: [{ key: 'GET /x', intervalMs: 0, source: 'a.ts:1', why: '为什么必须轮询' }] }
    ],
    [
      '无行号',
      { version: 1, declarations: [{ key: 'GET /x', intervalMs: 1000, source: 'a.ts', why: '为什么必须轮询' }] }
    ],
    ['理由过短', { version: 1, declarations: [{ key: 'GET /x', intervalMs: 1000, source: 'a.ts:1', why: '同上' }] }],
    [
      '键形态错',
      { version: 1, declarations: [{ key: '/x', intervalMs: 1000, source: 'a.ts:1', why: '为什么必须轮询' }] }
    ],
    [
      '重复键',
      {
        version: 1,
        declarations: [
          { key: 'GET /x', intervalMs: 1000, source: 'a.ts:1', why: '为什么必须轮询' },
          { key: 'GET /x', intervalMs: 2000, source: 'b.ts:2', why: '为什么也必须轮询' }
        ]
      }
    ]
  ]
  for (const [label, body] of badDecls) {
    const p = mkDecl(body)
    try {
      loadDeclarations(p.f)
      fail.push(`⑭ 坏声明被接受：${label}`)
    } catch {
      /* 期望 */
    } finally {
      fs.rmSync(p.dir, { recursive: true, force: true })
    }
  }
  try {
    loadDeclarations(path.join(os.tmpdir(), 'definitely-missing-polling-declarations.json'))
    fail.push('⑭ 声明清单缺失被当成空集')
  } catch {
    /* 期望 */
  }
  fs.rmSync(goodDecl.dir, { recursive: true, force: true })
  for (const p of [a, b, c, e0, e5]) fs.rmSync(p.dir, { recursive: true, force: true })
  return fail
}

// ==================== 入口 ====================

// 入口只在**被当命令执行**时运行（与 endpoint-coverage 同一条纪律）：判据脚本若在被 import 时
// 按 argv 执行并 `process.exit`，调用方的自检会被洗成它的输出（本批实测踩过，§7.22）。
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
function entry() {
  const args = process.argv.slice(2)
  const acceptNewKeys = args
    .filter((a) => a.startsWith('--accept-new-key='))
    .map((a) => a.slice('--accept-new-key='.length))
  if (args.includes('--selftest')) {
    const fail = selftest()
    if (fail.length) {
      console.log('SYNTH_FAIL:')
      fail.forEach((f) => console.log(`  · ${f}`))
      process.exit(1)
    }
    console.log(
      `SYNTH_OK 出站请求风暴棘轮 14 组双向（聚合与密度口径 / 五类响亮失败：非 full、缺窗口、空 rows、` +
        `不带 navs、基线形状 / 容差正反 / 页数增加不报 / 新键与 0 基线双向 / fail-closed / 畸形行 / 基线形状闸 / 登记通道双向 / ` +
        `已声明轮询清单双向），口径 ${METRIC}`
    )
    process.exit(0)
  }

  let ds
  try {
    ds = loadDataset()
  } catch (e) {
    console.log(`[FATAL] ${e.message}`)
    process.exit(2)
  }
  let declared
  try {
    declared = loadDeclarations()
  } catch (e) {
    console.log(`[FATAL] ${e.message}`)
    process.exit(2)
  }
  let base
  try {
    base = readBaseline()
  } catch (e) {
    console.log(`[FATAL] ${e.message}`)
    process.exit(2)
  }
  const top = [...ds.agg.entries()].sort((x, y) => y[1].total - x[1].total).slice(0, 12)
  log(`==== 出站请求风暴（口径 ${METRIC}，窗口 ${ds.window.since} .. ${ds.window.until}）====`)
  log(`端点键 ${ds.agg.size} 类 / 总请求 ${ds.totalRequests} 次；Top12（按总次数）：`)
  for (const [k, v] of top) {
    log(
      `  ${String(v.total).padStart(6)} × ${k}   每导航 ${v.density.toFixed(2)}（分母 ${v.navs} 次导航）` +
        `｜最密动作 ${v.maxDensity.toFixed(2)} @ ${v.maxDensityTag}`
    )
  }

  const declaredHit = [...declared.keys()].filter((k) => ds.agg.has(k))
  log(
    `已声明轮询 ${declared.size} 条（只记密度、不设阈）；本轮数据集命中 ${declaredHit.length} 条` +
      (declaredHit.length
        ? `：${declaredHit.map((k) => `${k}=${ds.agg.get(k).density.toFixed(2)}/nav`).join('、')}`
        : '')
  )

  const resetBaseline = args.includes('--reset-baseline')
  if (resetBaseline && !args.includes('--update-baseline')) {
    console.log('[FATAL] --reset-baseline 只能与 --update-baseline 同用（单独用等于无判据地覆盖）')
    process.exit(2)
  }
  if (resetBaseline && base && base.metric === METRIC) {
    console.log(
      `[FATAL] 口径未变化（仍为 ${METRIC}）时禁止 reset：这会抹掉既有棘轮；` +
        `新增出网面请用 --accept-new-key=；换判据才允许重建基线`
    )
    process.exit(2)
  }
  if (resetBaseline && base) {
    log(`⚠️ 口径变更：${JSON.stringify(base.metric)} → ${JSON.stringify(METRIC)}；旧 perKey 不参与比对，重建基线`)
  }
  if (args.includes('--gate') || (args.includes('--update-baseline') && base && !resetBaseline)) {
    let bw
    try {
      bw = assertBaselineShape(base)
    } catch (e) {
      console.log(`[FATAL] ${e.message}`)
      process.exit(2)
    }
    const bad = stormRegressions(base.perKey, ds.agg, STORM_TOLERANCE, NEW_DENSITY_FLOOR, new Set(declared.keys()))
    log(`窗口对账：基线 ${bw.since} .. ${bw.until}，本轮 ${ds.window.since} .. ${ds.window.until}`)
    if (bad.length) {
      console.log(`❌ 出网密度退步 ${bad.length} 项（容差 ${STORM_TOLERANCE}，新键密度下限 ${NEW_DENSITY_FLOOR}）：`)
      bad
        .slice(0, 20)
        .forEach((x) =>
          console.log(
            `    · ${x.key} 基线 ${x.base === null ? '(不在基线)' : Number(x.base).toFixed(2)} → 本轮 ` +
              `${Number(x.now).toFixed(2)}：${x.why}`
          )
        )
      process.exit(1)
    }
    log(`✅ 无出网密度退步（基线 ${base.keys} 键 → 本轮 ${ds.agg.size} 键 / 总 ${ds.totalRequests} 次）`)
  }

  if (args.includes('--update-baseline')) {
    let acceptedNow = []
    if (base && !resetBaseline) {
      const allBad = stormRegressions(base.perKey, ds.agg, STORM_TOLERANCE, NEW_DENSITY_FLOOR, new Set(declared.keys()))
      // 登记通道：只有命令行上**点名**的键才算"本轮新增并已审阅"，其余退步照旧拒绝落盘。
      // 没有这条通道，任何合法新增用例都会把棘轮锁死，结局是有人直接关掉门禁。
      const bad = filterAccepted(allBad, acceptNewKeys)
      acceptedNow = allBad.filter((x) => !bad.includes(x)).map((x) => x.key)
      if (bad.length) {
        console.log(`❌ 拒绝放松棘轮：${bad.length} 项出网密度退步，基线**未改动**`)
        bad.slice(0, 10).forEach((x) => console.log(`    · ${x.key}：${x.why}`))
        if (acceptedNow.length)
          console.log(`    （本轮已登记 ${acceptedNow.length} 个新键：${acceptedNow.join(', ')}）`)
        console.log('    新增出网面要显式登记：--accept-new-key="METHOD /path"（逐个点名，不给通配）')
        process.exit(1)
      }
      if (acceptedNow.length)
        log(`ℹ 登记新增出网面 ${acceptedNow.length} 个：${acceptedNow.join(', ')}（已写进基线的 acceptedNewKeys）`)
    }
    const body = writeBaseline({
      window: ds.window,
      agg: ds.agg,
      totalRequests: ds.totalRequests,
      resetFrom: resetBaseline && base ? base.metric : null
    })
    log(`✅ 基线已写入：${BASELINE}（${body.keys} 个端点键 / 总 ${body.totalRequests} 次 / 口径 ${body.metric}）`)
    process.exit(0)
  }
  process.exit(0)
}

if (invokedDirectly) entry()
