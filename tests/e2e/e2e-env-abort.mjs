/**
 * `e2e-env-abort.mjs` —— **环境性网络中断**的分类器与本轮计账（批八十九 项 15）。
 *
 * ## 立的案
 *
 * b89 全量权威轮（93 模块 / 3112.9s）跑到 M85 时唯一一条 ❌ 是
 * `无控制台错误 - 15720 个错误: Failed to load resource: net::ERR_NETWORK_IO_SUSPENDED`，
 * 而 M85 隔离复跑 **13✅ / ❌0 / EXIT=0**。`ERR_NETWORK_IO_SUSPENDED` 是 Windows
 * 把网络适配器 I/O 挂起（睡眠/电源策略/网卡重置）时 Chromium 给出的错误——
 * **期间所有请求一起失败**，不是任何一个页面的缺陷。
 *
 * 这一族的三种出路里只有"本轮不作数"诚实（AGENTS 前言 ⑳ 在同一条纪律的后端日志面上定的形）：
 * - 登记成豁免 = 给"整站请求全失败"配一个永久豁免，下一次真断网就静默通过；
 * - 判 ❌ 且不解释 = 把人支使去"修 M85"，而 M85 没有可修的东西（b89 实测照此redo了一遍 52 分钟）；
 * - **判"本轮不作数" + 点名成因** = 结论是"重跑"，动作与事实一致。
 *
 * 因此本模块只做两件事：**分类**（窄到只有实测照出的三族）与**计账**（谁被记进中断桶）。
 * 它**不**替产品判据减一条 ❌——摘掉 ❌ 等于把"浏览器完全断网"读成"这轮干净"，
 * 两种相反状态同时判绿是前言 ⑭ 明令禁止的形状。退出码这一腿由 `runner.mjs` 负责。
 *
 * ## 为什么只有三族
 *
 * `ERR_CONNECTION_REFUSED` / 连不上 `:8080` 属**另一条通道**（`runner.mjs` 的
 * "连续 2 个模块登录失败 ⇒ 提前终止"），两条通道不得互相顶班：一处放宽另一处就静默失效。
 * 新增成员必须带一条实测照出的形状与一条"产品类不得抓"的反证，见 `--selftest`。
 *
 * 用法：`node tests/e2e/e2e-env-abort.mjs --selftest`（免凭据、不启浏览器）。
 */

/** 实测照出的三族（b85 的 `ERR_NETWORK_CHANGED` 与 b89 的 `ERR_NETWORK_IO_SUSPENDED` 同一形状：适配器级中断） */
const ENV_ABORT_KINDS = ['net::ERR_NETWORK_IO_SUSPENDED', 'net::ERR_NETWORK_CHANGED', 'net::ERR_INTERNET_DISCONNECTED']

/** 命中的是哪一族（不含 ⇒ `null`）。按**整串**取，避免把族名拆开后误配。 */
export function classifyEnvironmentAbort(msg) {
  const text = typeof msg === 'string' ? msg : String(msg?.text ?? '')
  return ENV_ABORT_KINDS.find((kind) => text.includes(kind)) ?? null
}

/** 一批消息 ⇒ `{count, kinds: Map<族名, 次数>, samples: 首个样本}`（kinds 为空 ⇒ count 必为 0） */
export function scanEnvironmentAbort(list) {
  const kinds = new Map()
  const samples = []
  let count = 0
  for (const item of Array.isArray(list) ? list : []) {
    const kind = classifyEnvironmentAbort(item)
    if (!kind) continue
    count += 1
    kinds.set(kind, (kinds.get(kind) || 0) + 1)
    if (samples.length < 3) samples.push(String(typeof item === 'string' ? item : (item?.text ?? '')).slice(0, 200))
  }
  return { count, kinds, samples }
}

// ==================== 本轮计账（同一进程内的单例）====================

let noted = []

/** 由套件在每次"无控制台错误"判定处调用；只累加，不做任何判定 */
export function noteEnvironmentAbort(list) {
  const scan = scanEnvironmentAbort(list)
  if (scan.count > 0) noted.push(scan)
  return scan.count
}

/** 轮末读一次：没有中断 ⇒ `{count: 0}`（**不得**把"没记到"读成"网络一定好"，见下面的复位说明） */
export function environmentAbortReport() {
  const kinds = new Map()
  let count = 0
  const samples = []
  for (const s of noted) {
    count += s.count
    for (const [k, n] of s.kinds) kinds.set(k, (kinds.get(k) || 0) + n)
    if (samples.length < 3 && s.samples.length) samples.push(s.samples[0])
  }
  return { count, kinds, samples }
}

/**
 * 复位通道：同一进程里跑**多轮**（分段复跑、自检）时，第二轮的计数必须只属于第二轮。
 * 不接这个通道，"上一轮的中断"会累加到本轮头上——与前言 ⑲"把上一批的零失败当本批的证据"同族。
 */
export function resetEnvironmentAbortNotes() {
  noted = []
}

// ==================== --selftest（条数由脚本自打）====================

function selftest() {
  let total = 0
  let failed = 0
  const expect = (label, got, want) => {
    total += 1
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) failed += 1
    console.log(`${ok ? '  ✅' : '  ❌'} ${label} —— 实得 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`)
  }

  // ① 两条实测照出的形状必须被抓（b89 的 M85 原文 + b85 的导航原文）
  expect(
    '① b89 实测形状必须判为环境中断',
    classifyEnvironmentAbort('Failed to load resource: net::ERR_NETWORK_IO_SUSPENDED'),
    'net::ERR_NETWORK_IO_SUSPENDED'
  )
  expect(
    '② b85 实测形状必须判为环境中断',
    classifyEnvironmentAbort('net::ERR_NETWORK_CHANGED while loading http://127.0.0.1:8080/getInfo'),
    'net::ERR_NETWORK_CHANGED'
  )
  // ③④⑤ 产品/后端类**不得**抓：这三条是"把真缺陷洗成环境"的三条最省钱路径
  expect(
    '③ 503 不得算环境中断（它是限流/闸门的真实结局）',
    classifyEnvironmentAbort(
      'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
    ),
    null
  )
  expect(
    '④ 429 不得算环境中断',
    classifyEnvironmentAbort('Failed to load resource: the server responded with a status of 429'),
    null
  )
  expect(
    '⑤ ERR_CONNECTION_REFUSED 走的是"连续登录失败⇒提前终止"那条通道，不得在此顶班',
    classifyEnvironmentAbort('Failed to load resource: net::ERR_CONNECTION_REFUSED'),
    null
  )
  // ⑥ 空输入 ⇒ 零计数（"没采到"不得读成"有中断"，也不得读成崩溃）
  expect('⑥ 空数组必须数出 0', scanEnvironmentAbort([]).count, 0)
  expect('⑦ 非数组入参不得抛（判据自己崩 = 红在哪条丢了）', scanEnvironmentAbort(null).count, 0)
  // ⑧ 族聚合：同一族 ×2 与两族各 1 的区分（退出码文案要用 kinds）
  const two = scanEnvironmentAbort([
    'x net::ERR_NETWORK_IO_SUSPENDED',
    'y net::ERR_NETWORK_IO_SUSPENDED',
    'z net::ERR_INTERNET_DISCONNECTED'
  ])
  expect('⑧ 计数按条不按族', two.count, 3)
  expect('⑨ 族数按族不按条', two.kinds.size, 2)
  // ⑩ 计账与复位：第二轮不得继承第一轮
  noted = []
  noteEnvironmentAbort(['a net::ERR_NETWORK_CHANGED'])
  expect('⑩ 记到一条就必须在轮末读得到', environmentAbortReport().count, 1)
  noteEnvironmentAbort(['b 普通错误'])
  expect('⑪ 普通错误不得进中断桶', environmentAbortReport().count, 1)
  resetEnvironmentAbortNotes()
  expect('⑫ 复位后必须归零（否则分段复跑会把上一轮记到本轮）', environmentAbortReport().count, 0)
  // ⑬ 采集面自证：三族必须逐族都有正控用例（新增一族而不加正控 ⇒ 这一支红）
  const covered = ENV_ABORT_KINDS.filter((kind) =>
    [
      'Failed to load resource: net::ERR_NETWORK_IO_SUSPENDED',
      'net::ERR_NETWORK_CHANGED while loading http://127.0.0.1:8080/getInfo',
      'net::ERR_INTERNET_DISCONNECTED'
    ].some((sample) => classifyEnvironmentAbort(sample) === kind)
  ).length
  expect('⑬ 登记的每一族都必须被正控验过', covered, ENV_ABORT_KINDS.length)

  console.log(
    failed > 0
      ? `SYNTH_FAIL 环境性网络中断分类器 ${total} 条里有 ${failed} 条不符（判据自己坏了，不得据此判产品）`
      : `SYNTH_OK 环境性网络中断分类器 ${total} 条双向（两族实测必抓 + 三类产品形状不得抓 + 计数/族数/复位 + 采集面自证）`
  )
  process.exit(failed > 0 ? 1 : 0)
}

if (process.argv.includes('--selftest')) selftest()
