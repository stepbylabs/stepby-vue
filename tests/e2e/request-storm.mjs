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
 * ② 数据集必须 `full === true`、**每个模块都产出判定行**、带窗口、且**每行都带 `navs`**，否则响亮失败
 *    （§7.19 / §3.63：分段轮是子集、旧采集格式没有分母，拿它们判风暴会把"没跑 / 判不了"
 *    读成"没变差"；b82 追加第三类——浏览器崩溃的全量轮照样写 `full: true`，采样面只有前若干个模块，
 *    拿它重生成基线会把后面 52 个模块的出网面整体抹掉；缺分母尤其不能当 0——那会把密度放大成 total，全线误报）；
 * ③ 非数值/缺字段一律按"判不了"处理而不是"没退步"（`NaN > tol` 恒 false 那个漏洞）；
 * ④ 基线必须记**口径名**（`metric`）：`perKey` 里数字的含义换了（总次数 → 每导航均值）而不换标记时，
 *    拿新阈值比旧数字会**静默失真**——与 §7.19 的 `sources` 源集合对账是同一条纪律。
 *
 * 用法：
 *   node tests/e2e/request-storm.mjs                 # 打印 Top 与逐键密度
 *   node tests/e2e/request-storm.mjs --gate          # 与基线比对，退步即红
 *   node tests/e2e/request-storm.mjs --update-baseline
 *   node tests/e2e/request-storm.mjs --gate --retire-stale   # 撤销本轮没再打过的轮询声明（真删，需全量单轮数据集）
 *   node tests/e2e/request-storm.mjs --selftest
 *
 * 轮询声明也是**逐轮对账**（批八十五 项 F）：一条声明等于"这个端点不设阈"，本轮数据集里
 * 没有它的出网记录 ⇒ 判红并必须撤销；只打 ℹ 就是让豁免沉淀成常白名单。
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
 * 退役的**纯决策**部分（拆出来是为了可测：`process.exit` 那条路径在自检里没法跑）。
 *
 * - 逐条按 `key` 精确比对（清单里的身份就是 key），不做前缀/通配匹配——通配会让一次退役
 *   顺手删掉隔壁还有效的条目（同 endpoint-coverage 的"逐条自足"纪律）。
 * - `wouldEmpty`：全清会把判据自己打坏（下一轮 `loadDeclarations` 因"必须是非空数组"
 *   直接 FATAL），所以这里把它单独报出来，由调用方拒绝落盘。
 */
export function planRetire(declarations, missedKeys) {
  const keys = [...new Set(missedKeys || [])]
  const keep = declarations.filter((d) => !keys.includes(d.key))
  return {
    keep,
    removed: keys.filter((k) => declarations.some((d) => d.key === k)),
    wouldEmpty: keep.length === 0 && declarations.length > 0
  }
}

/** 把本轮未命中的轮询声明从清单里删掉（动作通道；空集不碰文件、删空一律拒绝）。 */
export function retireDeclarations(missedKeys, file = DECLARATIONS) {
  const body = JSON.parse(fs.readFileSync(file, 'utf8'))
  const { keep, removed, wouldEmpty } = planRetire(body.declarations, missedKeys)
  if (!removed.length) return []
  if (wouldEmpty) {
    console.log(
      `[FATAL] 退役会清空轮询声明清单（${removed.length} 条全未命中）——一条不剩等于把判据自己打坏，` +
        `请逐条确认后手工处理，本次不改文件`
    )
    process.exit(2)
  }
  fs.writeFileSync(file, JSON.stringify({ ...body, declarations: keep }, null, 2) + '\n', 'utf8')
  return removed
}

/**
 * 基线口径名。换分母/换判据含义必须同时换掉它并重生成基线（见 `assertBaselineShape`）。
 *
 * b81 从 `density-per-nav` 升为 `density-per-nav-endpoint`：采集键原本是
 * `"<动作> | GET /path"`，同一端点在不同动作里各成一条，既无法回答"这个端点每页打几次"，
 * 也让 N-21 的"按端点声明轮询"永远匹配不上。现在聚合时剥掉动作前缀，按端点求和；
 * 这是**换判据**，必须与重生成基线同批，不能拿旧数字继续比。
 *
 * b85 升为 `-v2`：退步判定加了第二条腿（`MIN_STORM_REQUESTS` 绝对下限，见该常量注释）。
 * 只增参数不改名会让"旧基线 + 新判据"看起来只是数字变好——而旧基线里根本没有
 * `minStormRequests` 这一项，`assertBaselineShape` 会直接拒比。改名 + `--reset-baseline --update-baseline`
 * 才是这条口径变更的合法路径（`--reset-baseline` 在口径未变时一律拒绝，就是为了防止有人用
 * "重建基线"这把手柄去抹掉既有棘轮）。
 */
export const METRIC = 'density-per-nav-endpoint-v2'

/** 单键允许的最大增幅（相对基线密度）。小于它的波动视为噪声，不参与判红。 */
export const STORM_TOLERANCE = 0.25

/**
 * 基线里没有的新键，**每导航**超过这个次数才单独报。
 * 形状依据：一次正常页面加载对同一端点的合法用量是个位数下限（列表 + 字典 + 一次计数），
 * 而"逐行请求""每次渲染重拉"这类回归一上来就是几十次/页。该参数写进基线（`newDensityFloor`），
 * 调它必须与重生成基线同批——否则是拿更松的阈值比一份按旧阈值写的基线。
 */
export const NEW_DENSITY_FLOOR = 5

/**
 * 退步判定的**绝对下限**，单位是"整轮多发的请求次数"（批八十五 项 H）。
 *
 * 立案证据：b85 的 `--gate` 报了 13 项退步，逐条都是
 * `基线 0.01 → 本轮 0.02：密度增幅 0.00 > 基线 0.01 × 0.25`——
 * 打印出来的增幅是 0.00，比较用的是未截断的 0.0062。分母是本轮 1624 次导航，
 * 所以这条说的是"某页多访问了一次"。近零密度由**整数访问次数**主导，
 * 相对容差在 0.01 这种量级上就是噪声放大器：这些键（`/tool/help`、`/tool/shortcuts`、
 * swagger 静态资源…）的次数只由"这一轮访问了几次那个页面"决定，与请求风暴无关。
 *
 * 所以退步必须**同时**满足两条：相对超容差、且绝对增量够得着一次真风暴。
 * 次数取 25 的理由与 `NEW_DENSITY_FLOOR` 同源：合法波动是个位数，
 * "逐行请求/每次渲染重拉"一上来就是几百次（本轮总量 6524，单键 25 次≈0.4%）。
 * 该参数写进基线（`minStormRequests`），调它必须与重生成基线同批。
 */
export const MIN_STORM_REQUESTS = 25

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
 * 读取并校验数据集。五类输入问题一律硬失败，不做"静默当 0"：
 * 非全量 / 有模块零判定（崩轮）/ 无窗口 / rows 空 / **行里没有 navs 分母**（旧采集格式）。
 * 前两类由 `dataset-window.mjs::assertFullRun` 统一判（与 endpoint-coverage 共用同一份纯函数）。
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
  declared = new Set(),
  minRequests = MIN_STORM_REQUESTS
) {
  const bad = []
  for (const hit of stormScan(basePerKey, agg, tol, newFloor, declared, minRequests)) {
    if (hit.kind === 'regression') bad.push(hit.item)
  }
  return bad
}

/**
 * 逐键扫一遍，把结论分三类（`kind`）：`regression` / `below-floor`（相对翻倍但绝对增量
 * 够不着一次真风暴）/ 其余不产出。`stormRegressions` 只取第一类，打印层取第二类做 ℹ 留痕——
 * **只打提示、没有动作通道=没判**，但"没有需要动作的结论"本来就该只是提示。
 * 两类共用同一次扫描，比较式因此不可能在两处漂移（AGENTS ⑯"标签与计数同源"）。
 */
export function stormScan(
  basePerKey,
  agg,
  tol = STORM_TOLERANCE,
  newFloor = NEW_DENSITY_FLOOR,
  declared = new Set(),
  minRequests = MIN_STORM_REQUESTS
) {
  const set = declared instanceof Set ? declared : new Set(declared || [])
  const out = []
  for (const [key, cur] of agg) {
    if (set.has(key)) continue
    const base = basePerKey ? basePerKey[key] : undefined
    if (base === undefined) {
      if (cur.density >= newFloor) {
        out.push({
          kind: 'regression',
          item: { key, base: null, now: cur.density, why: `新出网面且每导航 ${cur.density.toFixed(2)} ≥ ${newFloor}` }
        })
      }
      continue
    }
    const b = Number(base)
    if (!Number.isFinite(b) || b < 0) {
      out.push({
        kind: 'regression',
        item: {
          key,
          base: base ?? null,
          now: cur.density,
          why: '基线值不是非负数值 ⇒ 判不了，按退步处理（fail-closed）'
        }
      })
      continue
    }
    // 基线记 0（那一轮该端点一条没发）而现在有：等价于"新出网面"，按同一下限判
    if (b === 0) {
      if (cur.density >= newFloor) {
        out.push({
          kind: 'regression',
          item: { key, base: 0, now: cur.density, why: `从 0 涨到每导航 ${cur.density.toFixed(2)} ≥ ${newFloor}` }
        })
      }
      continue
    }
    const grew = cur.density - b
    if (grew <= b * tol) continue
    const denom = Math.max(1, cur.navs || 0)
    const extraReq = grew * denom
    // 判定读的是**未截断**的量，打印也必须打未截断的量：上一轮那句
    // "密度增幅 0.00 > 基线 0.01 × 0.25" 是自相矛盾的话术，照它去理解就会以为判据坏了。
    const item = {
      key,
      base: b,
      now: cur.density,
      extraReq: Math.round(extraReq),
      denom,
      why: `每导航 ${b.toFixed(4)} → ${cur.density.toFixed(4)}（整轮多 ${Math.round(extraReq)} 次 / 分母 ${denom} 导航）`
    }
    if (extraReq >= minRequests) {
      out.push({
        kind: 'regression',
        item: { ...item, why: `${item.why}，超相对容差 ×${tol} 与绝对下限 ${minRequests} 次` }
      })
    } else {
      out.push({
        kind: 'below-floor',
        item: { ...item, why: `${item.why}，相对超 ×${tol} 但绝对增量不足 ${minRequests} 次/轮` }
      })
    }
  }
  return out
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

/**
 * 两个入口共用的判定（b82 接线修复后抽出来，好让"登记通道真的接得上"这件事能被自检钉住）。
 * `gateOnly=true`（单独 `--gate`）时**不认**命令行签字：棘轮比对不许被一句旗标放行；
 * 只有收紧入口走 `filterAccepted`，并把被签字的键交回调用方落进基线 `acceptedNewKeys` 留痕。
 */
export function stormVerdict(basePerKey, agg, declaredKeys, acceptNewKeys = [], opts = {}) {
  const {
    gateOnly = false,
    tol = STORM_TOLERANCE,
    newFloor = NEW_DENSITY_FLOOR,
    minRequests = MIN_STORM_REQUESTS
  } = opts
  const set = declaredKeys instanceof Set ? declaredKeys : new Set(declaredKeys || [])
  const scan = stormScan(basePerKey, agg, tol, newFloor, set, minRequests)
  const allBad = scan.filter((x) => x.kind === 'regression').map((x) => x.item)
  // 相对翻倍但绝对增量够不着一次真风暴的键：不判红，但必须**看得见**。
  // 静默吞掉是另一头的自欺——哪一天它涨成真风暴，前一天的记录就该在这里。
  const notes = scan.filter((x) => x.kind === 'below-floor').map((x) => x.item)
  const bad = gateOnly ? allBad : filterAccepted(allBad, acceptNewKeys)
  const signed = allBad.filter((x) => !bad.includes(x))
  return { allBad, bad, signed, notes }
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
    minStormRequests: MIN_STORM_REQUESTS,
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
  expect = {
    metric: METRIC,
    tolerance: STORM_TOLERANCE,
    newDensityFloor: NEW_DENSITY_FLOOR,
    minStormRequests: MIN_STORM_REQUESTS
  }
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
  for (const k of ['tolerance', 'newDensityFloor', 'minStormRequests']) {
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
        // 执行完整性默认"跑完了"（正控默认值；⑮ 各条用 extra 覆盖成崩轮/旧格式）
        modulesPlanned: 90,
        modulesAttempted: 90,
        modulesWithZeroVerdicts: [],
        // b89 项 15：默认"本轮没有环境性网络中断"，中断的那一轮不得作为密度数据源
        envNetworkAbort: 0,
        totalVerdictRows: rows.length,
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
    newDensityFloor: NEW_DENSITY_FLOOR,
    minStormRequests: MIN_STORM_REQUESTS
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
    ['newDensityFloor 非数值', { ...goodBase, newDensityFloor: 'lots' }],
    // 绝对下限是判据的第三条腿：基线没记它 = 那份基线是"只有相对容差"的旧尺量出来的
    ['缺 minStormRequests（旧断面的基线）', { ...goodBase, minStormRequests: undefined }]
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
  // ⑯ **登记通道的接线**双向（b82 实测缺陷：`--gate` 与 `--update-baseline` 共用那一段无条件 `exit(1)`，
  //    于是 `--accept-new-key=` 永远走不到登记逻辑——旗标留了却接不上，第一条合法新增就把收紧锁死；
  //    而同一条通道写进基线的 `acceptedNewKeys` 也没真的传下去，输出里"已写进基线留痕"是句假话）。
  //    这条判据必须钉"签字只在收紧入口生效"与"gate 不被一句旗标放行"两个相反方向。
  //    夹具在 b85 项 H 之后**放大了量**（原来是"多访问一次 http-debugger"，绝对增量 0.6 次，
  //    新规则下它根本不算退步）——这一组判的是签字通道的接线，不是下限，所以取一条真会退步的形状。
  const growthAgg = aggregate([
    { tag: 'M89', key: 'GET /tool/http-debugger', count: 48, navs: 95 },
    { tag: 'M90', key: 'POST /system/other', count: 40, navs: 2 }
  ])
  const gBase = { 'GET /tool/http-debugger': 0.0149, 'POST /system/other': 0.01 }
  const vSigned = stormVerdict(gBase, growthAgg, [], ['GET /tool/http-debugger'])
  if (vSigned.bad.length !== 1 || vSigned.signed.length !== 1 || vSigned.signed[0].key !== 'GET /tool/http-debugger')
    fail.push(
      `⑯ 收紧入口没吃到登记旗标：bad=${JSON.stringify(vSigned.bad.map((x) => x.key))} signed=${JSON.stringify(vSigned.signed.map((x) => x.key))}`
    )
  const vUnsigned = stormVerdict(gBase, growthAgg, [], [])
  if (vUnsigned.bad.length !== 2 || vUnsigned.signed.length !== 0)
    fail.push(`⑯ 没签字时退步数不对：${vUnsigned.bad.length}`)
  const vGate = stormVerdict(gBase, growthAgg, [], ['GET /tool/http-debugger', 'POST /system/other'], {
    gateOnly: true
  })
  if (vGate.bad.length !== 2) fail.push('⑯ 单独 --gate 竟然认了命令行签字（棘轮可被一句旗标放行）')
  const vTypo = stormVerdict(gBase, growthAgg, [], ['GET /tool/http-debug'])
  if (vTypo.bad.length !== 2 || vTypo.signed.length !== 0) fail.push('⑯ 拼错的键名被当成了有效登记')
  const cleanAgg = aggregate([{ tag: 'M1', key: 'GET /x', count: 1, navs: 1 }])
  const vClean = stormVerdict({ 'GET /x': 1 }, cleanAgg, [], ['GET /nothing'])
  if (vClean.bad.length !== 0 || vClean.signed.length !== 0) fail.push('⑯ 干净轮上多余旗标产生了效果（签字不是通配）')
  fs.rmSync(goodDecl.dir, { recursive: true, force: true })
  // ⑮ 执行完整性闸双向（b82 实测：全量轮跑到 M38 浏览器崩溃，M39–M90 以"✅ 0 / ❌ 0"空跑到底，
  //    汇总照打"模块: 90"、`full` 照写 true、reqstats 照落主文件）。崩轮的采样面只有前 38 个模块，
  //    拿它重生成基线会把后面 52 个模块的出网面**整体抹掉**——密度棘轮从此看不见它们。
  //    与 endpoint-coverage ㉔ 共用 `assertFullRun`，两侧各自钉一条：闸是共享的，消费方必须各自证明它拦得住。
  const crashed = mk([{ tag: 'M37', key: 'GET /getInfo', count: 3, navs: 3 }], {
    modulesWithZeroVerdicts: Array.from({ length: 52 }, (_, i) => i + 39)
  })
  try {
    loadDataset(crashed.f)
    fail.push('⑮ 崩轮（52 个模块零判定）被接受了')
  } catch (err) {
    if (!/0 条判定/.test(err.message) || !/崩溃/.test(err.message)) {
      fail.push(`⑮ 崩轮的拒绝理由没指向崩溃：${err.message}`)
    }
  }
  const legacy = mk([{ tag: 'M1', key: 'GET /x', count: 1, navs: 1 }])
  const rawLegacy = JSON.parse(fs.readFileSync(legacy.f, 'utf8'))
  delete rawLegacy.modulesPlanned
  delete rawLegacy.modulesWithZeroVerdicts
  fs.writeFileSync(legacy.f, JSON.stringify(rawLegacy))
  try {
    loadDataset(legacy.f)
    fail.push('⑮ 缺执行完整性字段的旧格式数据集被接受了')
  } catch (err) {
    if (!/完整性字段/.test(err.message)) fail.push(`⑮ 旧格式拒绝理由没指向完整性字段：${err.message}`)
  }
  const zeroRows = mk([{ tag: 'M1', key: 'GET /x', count: 1, navs: 1 }], { totalVerdictRows: 0 })
  try {
    loadDataset(zeroRows.f)
    fail.push('⑮ 判定行总数为 0 的数据集被接受了')
  } catch {
    /* 期望 */
  }
  // b89 项 15：断网的一轮（`net::ERR_NETWORK_IO_SUSPENDED`）覆盖面与密度都不可用；
  // 缺字段同样拒（旧格式无法证明"没被污染"），0 必须放行（否则每轮必红就变成噪声源）。
  const envRow = { tag: 'M1', key: 'GET /x', count: 1, navs: 1 }
  const envAborted = mk([envRow], { envNetworkAbort: 15720 })
  try {
    loadDataset(envAborted.f)
    fail.push('⑯ 环境性网络中断的那一轮被接受了')
  } catch (err) {
    if (!/环境性网络中断/.test(err.message)) fail.push(`⑯ 中断轮的拒绝理由没指向中断：${err.message}`)
  }
  const noEnvField = mk([envRow])
  const rawNoEnv = JSON.parse(fs.readFileSync(noEnvField.f, 'utf8'))
  delete rawNoEnv.envNetworkAbort
  fs.writeFileSync(noEnvField.f, JSON.stringify(rawNoEnv))
  try {
    loadDataset(noEnvField.f)
    fail.push('⑯ 缺 envNetworkAbort 字段的数据集被接受了')
  } catch (err) {
    if (!/环境性网络中断计数字段/.test(err.message)) fail.push(`⑯ 缺字段拒绝理由没指向该字段：${err.message}`)
  }
  try {
    loadDataset(mk([envRow], { envNetworkAbort: 0 }).f)
  } catch (err) {
    fail.push(`⑯ 干净轮（envNetworkAbort=0）不得被拒：${err.message}`)
  }
  // 计划数 ≠ 入场数：runner 提前 break 时后面的模块连 moduleStats 都没有，
  // 只判"零判定模块"看不见它们（列表是空的），必须靠两个计数相等这一道。
  const earlyBreak = mk([{ tag: 'M1', key: 'GET /x', count: 1, navs: 1 }], { modulesAttempted: 38 })
  try {
    loadDataset(earlyBreak.f)
    fail.push('⑮ 提前终止（计划 90 / 入场 38）的数据集被接受了')
  } catch (err) {
    if (!/提前终止/.test(err.message)) fail.push(`⑮ 提前终止的拒绝理由没指向计数不等：${err.message}`)
  }
  // 正控：默认夹具（planned=attempted=90、零判定模块为空）必须放行——
  // 否则上面四条可以靠"一律拒"蒙过
  const goodRun = mk([{ tag: 'M1', key: 'GET /x', count: 1, navs: 1 }])
  try {
    const g = loadDataset(goodRun.f)
    if (g.agg.get('GET /x').total !== 1) fail.push('⑮ 合法全量轮的数据读出来不对')
  } catch (e) {
    fail.push(`⑮ 合法全量轮被拒了：${e.message}`)
  }
  // ⑰ 声明**未命中**对账与退役通道（b85 项 F）：一条声明="这个键不设阈"，
  // 本轮没打过它就是白拿的豁免；只打提示不判红、也不给删除出口 ⇒ 豁免会沉淀成常白名单。
  {
    const raw = {
      version: 1,
      declarations: [
        {
          key: 'GET /monitor/server',
          intervalMs: 2000,
          source: 'stepby-vue/tests/e2e/request-storm.mjs:60',
          why: '合成：服务器监控页自动刷新'
        },
        {
          key: 'GET /health',
          intervalMs: 30000,
          source: 'stepby-vue/tests/e2e/request-storm.mjs:60',
          why: '合成：健康页按偏好轮询'
        }
      ]
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storm-decl-'))
    const f = path.join(dir, 'd.json')
    fs.writeFileSync(f, JSON.stringify(raw, null, 2))
    const dec = loadDeclarations(f)
    if (dec.size !== 2) fail.push(`⑰ 合成声明读出来 ${dec.size} 条（期望 2）`)
    const hit = new Set(['GET /health'])
    const miss = [...dec.keys()].filter((k) => !hit.has(k))
    if (miss.length !== 1 || miss[0] !== 'GET /monitor/server') {
      fail.push(`⑰ 未命中集合取错：${JSON.stringify(miss)}`)
    }
    const plan = planRetire(raw.declarations, miss)
    if (plan.removed.length !== 1 || plan.keep.length !== 1) {
      fail.push(`⑰ 退役计划必须只剔未命中那条：removed=${plan.removed.length} keep=${plan.keep.length}`)
    }
    if (plan.wouldEmpty) fail.push('⑰ 还剩一条合法声明却被判成"会清空"')
    if (planRetire(raw.declarations, [...dec.keys()]).wouldEmpty !== true) {
      fail.push('⑰ 全清必须被识别（否则退役通道会把判据自己打坏）')
    }
    if (planRetire(raw.declarations, []).removed.length !== 0) fail.push('⑰ 空未命中不得产出删除')
    const removed = retireDeclarations(miss, f)
    const after = JSON.parse(fs.readFileSync(f, 'utf8'))
    if (removed.length !== 1 || after.declarations.length !== 1) {
      fail.push(`⑰ 退役必须真落盘并留痕：removed=${removed.length} 剩=${after.declarations.length}`)
    }
    if (after.declarations[0]?.key !== 'GET /health') fail.push('⑰ 退役后剩下的必须是命中那条')
    const snap = fs.readFileSync(f, 'utf8')
    retireDeclarations([], f)
    if (fs.readFileSync(f, 'utf8') !== snap) fail.push('⑰ 没有未命中时不得改动文件')
    fs.rmSync(dir, { recursive: true, force: true })
  }

  // ⑱ 退步判定必须有**绝对下限**（b85 项 H）：近零密度上的相对容差是噪声放大器。
  //    立案形状就是本轮真报的 `基线 0.01 → 本轮 0.02（分母 1624 导航 ⇒ 整轮多 16 次）`。
  {
    const agg18 = aggregate([
      { tag: 'M70 load', key: 'GET /tool/help', count: 33, navs: 1624 }, // 0.0203
      { tag: 'M70 load', key: 'GET /tool/shortcuts', count: 65, navs: 1624 } // 0.0400
    ])
    const base18 = { 'GET /tool/help': 0.0105, 'GET /tool/shortcuts': 0.0105 }
    const bad18 = stormRegressions(base18, agg18)
    const scan18 = stormScan(base18, agg18)
    if (bad18.length !== 1) fail.push(`⑱ 绝对下限没生效：报了 ${bad18.length} 条（期望只有多 48 次那条）`)
    if (scan18.filter((x) => x.kind === 'below-floor').length !== 1)
      fail.push(`⑱ 相对翻倍但增量不足的键必须留痕为 below-floor：${JSON.stringify(scan18)}`)
    // 反脆弱：摘掉绝对下限 ⇒ 两条都得报（这就是本轮真实红出来的 13 项的形状）
    const noFloor = stormRegressions(base18, agg18, STORM_TOLERANCE, NEW_DENSITY_FLOOR, new Set(), 0)
    if (noFloor.length !== 2) fail.push(`⑱ 对照组没受约束：下限归零后只报 ${noFloor.length} 条（期望 2）`)
  }
  // ⑲ 打印与判定同源：比较用的是未截断密度，凭证行也必须打未截断的（AGENTS ⑯(a)）。
  //    旧文案 `密度增幅 0.00 > 基线 0.01 × 0.25` 是自相矛盾的话术——照着它去理解，
  //    只会以为判据坏了，进而去"放宽阈值"（那是换判据）。
  {
    const agg19 = aggregate([{ tag: 'M1', key: 'GET /x', count: 130, navs: 1000 }])
    const r19 = stormRegressions({ 'GET /x': 0.03 }, agg19)
    const why19 = r19[0]?.why || ''
    if (!/0\.0300 → 0\.1300/.test(why19)) fail.push(`⑲ 凭证行没打未截断密度：${why19}`)
    if (!/多 100 次/.test(why19)) fail.push(`⑲ 凭证行没给"整轮多几次"这个可核对量：${why19}`)
    if (/增幅 0\.00 >/u.test(why19)) fail.push(`⑲ 退化回旧的自相矛盾话术：${why19}`)
  }
  // ⑳ 纯 API 动作（navs=0，分母取 max(1,0)）同样受绝对下限约束，且单位退化成"整轮次数"
  {
    const agg20 = aggregate([
      { tag: 'M88 api', key: 'POST /a', count: 30, navs: 0 }, // 密度 30
      { tag: 'M88 api', key: 'POST /b', count: 20, navs: 0 } // 密度 20
    ])
    const base20 = { 'POST /a': 1, 'POST /b': 1 }
    const bad20 = stormRegressions(base20, agg20)
    if (bad20.length !== 1 || bad20[0].key !== 'POST /a') fail.push(`⑳ 纯 API 键的下限判定错：${JSON.stringify(bad20)}`)
    if (stormScan(base20, agg20).filter((x) => x.kind === 'below-floor').length !== 1)
      fail.push('⑳ 多 19 次那条必须留痕为 below-floor，不得静默吞掉')
  }

  for (const p of [a, b, c, e0, e5, crashed, legacy, zeroRows, earlyBreak, goodRun])
    fs.rmSync(p.dir, { recursive: true, force: true })
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
    // 组数由**本文件的分组注释**自己数出来（b83 纪律："条数由脚本自打"）。
    // 原先这里写死 `16 组双向`：加一组用例时那个数字不会跟着动，于是打印与实际跑掉的
    // 组数悄悄脱钩，文档漂移搬进了工具内部。派生异常（数太少）必须响亮失败，
    // 不得退化成"打个小数字"——小数字看起来也像通过。
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    const groups = new Set((self.match(/^\s*\/\/\s*([①-⑳]+)\s/gm) || []).map((s) => s.match(/[①-⑳]+/)[0]))
    if (groups.size < 12) {
      console.log(
        `SYNTH_FAIL 组数派生异常：只从本文件数到 ${groups.size} 组（地板 12）——` +
          `分组注释形态变了，这条打印不再有意义，先修判据输入`
      )
      process.exit(2)
    }
    console.log(
      `SYNTH_OK 出站请求风暴棘轮 ${groups.size} 组双向（聚合与密度口径 / 六类响亮失败：非 full、缺窗口、空 rows、不带 navs、崩轮与旧格式执行完整性、基线形状 / 容差正反 / 页数增加不报 / 新键与 0 基线双向 / fail-closed / 畸形行 / 基线形状闸 / 登记通道双向 / ` +
        `已声明轮询清单双向 / 登记通道**接线**双向 / 声明未命中对账与退役通道 / 退步的绝对下限双向（近零密度不得判退步但必须留痕）/ 凭证行必须打未截断量 / 纯 API 动作的同一下限），口径 ${METRIC}`
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

  // 声明**未命中**对账（批八十五 项 F）：一条声明等于"这个键不设阈"，
  // 而本轮根本没人打它 ⇒ 白拿的豁免。只打 ℹ 不算判（AGENTS ⑩"只打提示、没有动作通道=没判"），
  // 所以下面既进 `--gate` 的红，也有 `--retire-stale` 的真删通道。
  let declaredMiss = [...declared.keys()].filter((k) => !ds.agg.has(k))
  for (const k of declaredMiss) {
    log(`  ❌ [声明未命中] ${k} —— ${declared.get(k)?.why ?? ''}（本轮数据集没有它的出网记录）`)
  }
  if (args.includes('--retire-stale')) {
    if (ds.full !== true) {
      console.log('[FATAL] 非全量单轮数据集不得退役声明（分段跑批"没打过"只代表那段没跑）')
      process.exit(2)
    }
    const removed = retireDeclarations(declaredMiss)
    log(
      removed.length
        ? `  🧹 已退役轮询声明 ${removed.length} 条：${removed.join('、')}`
        : '  🧹 本轮没有需要退役的声明（每条都还打得住）'
    )
    declared = loadDeclarations()
    declaredMiss = [...declared.keys()].filter((k) => !ds.agg.has(k))
  } else if (declaredMiss.length && (args.includes('--gate') || args.includes('--update-baseline'))) {
    console.log(
      `❌ 轮询声明有 ${declaredMiss.length} 条本轮未命中：删除轮询的用例迁移后必须撤销声明，否则豁免会沉淀成永久白名单`
    )
    console.log('   ⇒ 处置：确认该轮询确实没了就加 --retire-stale；还在就查本轮数据集为何没抓到它')
    process.exit(1)
  }

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
    // **登记通道只在收紧入口生效**（b82 接线修复）：原写法这一支无条件 `exit(1)`，
    // 于是 `--update-baseline --accept-new-key=…` 永远走不到下面的登记逻辑——"留了登记旗标却接不上"，
    // 实测第一条合法新增（M89 多访问一次 http-debugger）就该旗标完全失效，唯一出路变成放宽阈值=换判据。
    // 而 `--gate` 单独用时**不认**命令行签字：否则任何一次比对都能被一句旗标放行，棘轮形同虚设。
    const gateOnly = args.includes('--gate') && !args.includes('--update-baseline')
    const { bad, signed, notes } = stormVerdict(base.perKey, ds.agg, new Set(declared.keys()), acceptNewKeys, {
      gateOnly
    })
    log(`窗口对账：基线 ${bw.since} .. ${bw.until}，本轮 ${ds.window.since} .. ${ds.window.until}`)
    if (gateOnly && acceptNewKeys.length) {
      log(`ℹ --accept-new-key 在单独 --gate 上不生效（签字只作用于 --update-baseline 这一侧，留痕进基线）`)
    }
    if (signed.length) {
      log(
        `ℹ 本轮签名登记 ${signed.length} 项：${signed.map((x) => `${x.key}（${x.why}）`).join('、')} ⇒ 写进基线 acceptedNewKeys`
      )
    }
    if (notes.length) {
      log(
        `ℹ 另有 ${notes.length} 项相对翻倍但整轮增量 < ${MIN_STORM_REQUESTS} 次（近零密度由整数访问次数主导，不判退步）：` +
          notes
            .slice(0, 8)
            .map((x) => `${x.key} 多 ${x.extraReq} 次`)
            .join('、')
      )
    }
    if (bad.length) {
      console.log(
        `❌ 出网密度退步 ${bad.length} 项（相对容差 ${STORM_TOLERANCE} + 绝对下限 ${MIN_STORM_REQUESTS} 次/轮，新键密度下限 ${NEW_DENSITY_FLOOR}）：`
      )
      bad
        .slice(0, 20)
        .forEach((x) =>
          console.log(
            `    · ${x.key} 基线 ${x.base === null ? '(不在基线)' : Number(x.base).toFixed(4)} → 本轮 ` +
              `${Number(x.now).toFixed(4)}：${x.why}`
          )
        )
      if (!gateOnly) console.log('    新增出网面要显式登记：--accept-new-key="METHOD /path"（逐个点名，不给通配）')
      process.exit(1)
    }
    log(`✅ 无出网密度退步（基线 ${base.keys} 键 → 本轮 ${ds.agg.size} 键 / 总 ${ds.totalRequests} 次）`)
  }

  if (args.includes('--update-baseline')) {
    let acceptedNow = []
    if (base && !resetBaseline) {
      // 登记通道：只有命令行上**点名**的键才算"本轮新增并已审阅"，其余退步照旧拒绝落盘。
      // 没有这条通道，任何合法新增用例都会把棘轮锁死，结局是有人直接关掉门禁。
      const { bad, signed } = stormVerdict(base.perKey, ds.agg, new Set(declared.keys()), acceptNewKeys)
      acceptedNow = signed.map((x) => x.key)
      if (bad.length) {
        console.log(`❌ 拒绝放松棘轮：${bad.length} 项出网密度退步，基线**未改动**`)
        bad.slice(0, 10).forEach((x) => console.log(`    · ${x.key}：${x.why}`))
        if (acceptedNow.length)
          console.log(`    （本轮已签名登记 ${acceptedNow.length} 个键：${acceptedNow.join(', ')}）`)
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
      // b82 接线修复：上面那句"已写进基线的 acceptedNewKeys"此前是**假话**——旗标根本没传进来，
      // 签名只在命令行上活了一次，落盘的基线里没有留痕（"谁都能在这份文件里看到它不是自然长出来的"
      // 那句注释描述的判据因此从未成立）。留痕必须真的落盘，登记才审计得动。
      acceptedNewKeys: acceptedNow,
      resetFrom: resetBaseline && base ? base.metric : null
    })
    log(`✅ 基线已写入：${BASELINE}（${body.keys} 个端点键 / 总 ${body.totalRequests} 次 / 口径 ${body.metric}）`)
    process.exit(0)
  }
  process.exit(0)
}

if (invokedDirectly) entry()
