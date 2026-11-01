/**
 * 前端产物新鲜度闸（批八十二新增；批八十三补上**后端那一腿**）。
 *
 * 立项原因是实测踩到的：`:8080` 内嵌服务的是 `stepby-axum/frontend-dist/`，而该目录是
 * 06:37 的构建；`src/views/monitor/job/index.vue` 与 `src/views/system/user/index.vue`
 * 在 **07:27** 才提交（批八十一的 a11/aria 改动）。也就是说跑批测的是**上一轮的产物**，
 * 而台账记的是"改动后复跑同数"。后端那条同族判据早就存在（`start-backend.mjs` 比对
 * :8080 监听进程的镜像路径属于本仓当前构建，AGENTS《测试门禁全景》①），前端这一侧一直缺——
 * 缺的原因很朴素：**没有任何判据把"src 改了"与"产物重建了"连起来**。
 *
 * 两道闸，都fail-closed：
 * ① **新鲜度**：`src/` 下任何应用源码（排除单测与生成类型）的 mtime 晚于产物 `index.html`
 *    ⇒ 产物是旧的，浏览器加载的必然不含这次改动；
 * ② **服务即产物**：`GET {baseUrl}/` 引用的入口 chunk 必须能在产物目录里找到，且
 *    `content-length` 与磁盘字节数一致 ⇒ 服务端给的就是这份产物（`ServeDir` 直读磁盘，
 *    但"改错目录/拷错模式/服务根不是这里"都会让它服务另一份）。
 * 只比字节数不比哈希：一次 HEAD 就够，不为对账下载 5.8 MB。
 *
 * 三道闸里的第三道是 b83 加的（见 `staleBackendSources` 的注释）：三轮全量实测跑在 10:56 的
 * exe 上，而本批后端源码改到 18:09 ——**路径对上了不等于码是新的**，`start-backend.mjs` 那条
 * 镜像路径判据看不见这件事，两条腿合起来才是完整判据。
 *
 * 第三道闸**红的时候**还带一句归因（b145 收 b144 N-144-H）：查出被测端口上监听进程的 PID 与
 * exe 路径，并和刚被判陈旧的那枚 exe 比同源。立项代价是实测的——b144 批内一句注释落盘后，
 * a11y 被新鲜度闸拦成一条 `__setup__` FAIL、actgate 折算成 UNRUN，而"拦的是刚写的注释还是真没
 * 重建"当时只能靠人回忆批内时序。归因不是判据（取不到也照常红），但它把一次红读成一句话。
 *
 * 用法：
 *   node tests/e2e/build-freshness.mjs                       # 判当前 :8080 的产物
 *   node tests/e2e/build-freshness.mjs --artifact-dir=dist   # 判 vite preview 那份
 *   node tests/e2e/build-freshness.mjs --selftest            # 合成夹具双向，不碰网络
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** stepby-vue 仓根（本文件在 tests/e2e 下两层） */
export const VUE_ROOT = path.resolve(HERE, '..', '..')
/** 根仓根（stepby-vue 的上一层）——内嵌产物放在 stepby-axum 里 */
export const REPO_ROOT = path.resolve(VUE_ROOT, '..')

/** 会被打进产物的源码扩展名（配置/样式/脚本；`.md`、`.json` 不参与构建判据） */
const APP_EXT = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.scss'])
/** 生成类型只参与类型检查，不进包：mtime 新鲜但内容没变，判它只会制造假红 */
const GENERATED_RE = /^src[\\/]types[\\/]api[\\/]generated[\\/]/
/** 单测文件不被 vite 打包（vitest 直接读），改它们不要求重建产物 */
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/
/** 仓根上会影响构建的文件 */
const ROOT_FILES = ['index.html', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js']

/**
 * 本地默认 exe 位置——"判哪一枚二进制陈旧"与"端口上跑的是哪一枚"必须共用这一个路径事实源，
 * 否则两处各写一遍字面量，改了新鲜度那一侧、归因那一侧还指着旧路径（㉘ 的同一条纪律）。
 * 刻意不做 release 档猜测：找不到 exe 时 `staleBackendSources` 响亮失败，不会悄悄去看另一份产物。
 */
export function defaultExeFile(axumRoot = path.join(REPO_ROOT, 'stepby-axum')) {
  return path.join(axumRoot, 'target', 'debug', 'stepby-axum.exe')
}

const log = (...a) => console.log(...a)

function walk(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name.startsWith('.')) continue
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(abs, base, out)
    else if (APP_EXT.has(path.extname(ent.name))) out.push(abs)
  }
  return out
}

/** 应用源码清单（相对路径，便于报错时指到具体文件）。 */
export function appSources(vueRoot = VUE_ROOT, minFiles = 100) {
  const srcDir = path.join(vueRoot, 'src')
  if (!fs.existsSync(srcDir)) throw new Error(`源码目录不存在：${srcDir}（判据无法执行，不得当成"没有改动"）`)
  const rels = walk(srcDir, srcDir, []).map((abs) => path.relative(vueRoot, abs))
  const kept = rels.filter((r) => !GENERATED_RE.test(r) && !TEST_FILE_RE.test(r))
  for (const r of ROOT_FILES) if (fs.existsSync(path.join(vueRoot, r))) kept.push(r)
  if (kept.length < minFiles) {
    // 采集面腐化必须响亮失败：扫出 3 个文件说明遍历坏了，
    // 而"什么都没扫到"会被读成"产物比所有源码都新"——正是本闸要防的那一侧。
    throw new Error(`应用源码只扫到 ${kept.length} 个文件（<${minFiles}）——遍历已坏，拒绝判新鲜度`)
  }
  return kept.sort()
}

/**
 * 比产物旧的源码。返回空数组 = 产物不比任何应用源码旧。
 * `artifactFile` 必须存在：产物缺失时"没有陈旧文件"与"没有产物"必须可区分。
 */
export function staleAppSources({ vueRoot = VUE_ROOT, artifactFile, minFiles = 100 } = {}) {
  if (!fs.existsSync(artifactFile)) {
    throw new Error(`产物入口不存在：${artifactFile}——没有产物就无从判新鲜度（先构建再跑）`)
  }
  const artifactMs = fs.statSync(artifactFile).mtimeMs
  const stale = []
  for (const rel of appSources(vueRoot, minFiles)) {
    const abs = path.join(vueRoot, rel)
    const ms = fs.statSync(abs).mtimeMs
    if (ms > artifactMs) stale.push({ rel, agoMs: ms - artifactMs })
  }
  stale.sort((a, b) => b.agoMs - a.agoMs)
  return { stale, artifactMs }
}

/** 默认产物目录：:8080 用的是 axum 内嵌那份；跑 vite preview（:4173）时传 `dist`。 */
export function resolveArtifactDir({
  baseUrl = process.env.STEPBY_BASE_URL || 'http://localhost:8080',
  artifactDir
} = {}) {
  if (artifactDir) return path.resolve(VUE_ROOT, artifactDir)
  return /:8080\b/.test(baseUrl) ? path.join(REPO_ROOT, 'stepby-axum', 'frontend-dist') : path.join(VUE_ROOT, 'dist')
}

/** 从 index.html 里取入口 chunk（`/static/js/index-xxxx.js` 或 `assets/index-xxxx.js`）。 */
export function entryChunkFromHtml(html) {
  const m = String(html).match(/(?:src|href)="([^"]*?index-[A-Za-z0-9_-]+\.(?:js|css))"/)
  if (!m) throw new Error('产物 index.html 里找不到入口 chunk（index-*.js/css）——构建产物形状已变，请更新本判据')
  return m[1]
}

/**
 * 嵌入产物的目录卫生（b100）：
 * - **不得含 `.map`**：嵌入档由 rust-embed 直接对外服务，`.map` 与 `.js` 同目录
 *   ⇒ 访客把入口 chunk 名加 `.map` 即可下载完整源码（实测 200 / 20,805,274 字节）；
 * - **不得积多份入口 chunk**：`cp -r dist/. frontend-dist/` 是合并语义，hash 换名后
 *   旧 chunk 永不消失（实测积了 3 份、目录 83MB），且全部被嵌进二进制。
 */
export function artifactHygiene(dir, { minFiles = 3 } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`产物目录不存在：${dir}——没有产物就无从判卫生`)
  const files = []
  const rec = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, ent.name)
      if (ent.isDirectory()) rec(abs)
      else files.push(path.relative(dir, abs).split(path.sep).join('/'))
    }
  }
  rec(dir)
  if (files.length < minFiles) {
    throw new Error(`产物目录只扫到 ${files.length} 个文件（<${minFiles}）——遍历已坏，拒绝判卫生`)
  }
  const maps = files.filter((f) => f.toLowerCase().endsWith('.map'))
  if (maps.length > 0) {
    return {
      ok: false,
      reason: `嵌入产物含 ${maps.length} 个 .map（会随二进制原样对外下发，源码可被匿名下载）：${maps.slice(0, 3).join('、')}`
    }
  }
  const entries = files.filter((f) => /^static\/js\/index-[^/]+\.js$/.test(f))
  if (entries.length > 1) {
    return {
      ok: false,
      reason: `嵌入产物积了 ${entries.length} 份入口 chunk（目录未清空，旧 hash 文件永久残留）：${entries.join('、')}`
    }
  }
  return { ok: true, files: files.length, entries: entries.length }
}

/**
 * 只进测试二进制、不进 exe 的模块面（由**声明本身**派生，不按文件名猜）。
 *
 * 为什么不能按名字排除（b84 实测）：上一版只跳过 `src/integration_tests/` 这一个目录名，
 * 而本仓还有 `src/initialize/tests.rs`（挂在 `#[cfg(test)] mod tests;` 上）——
 * 于是 `cargo fmt` 收口时把 tests.rs 的空白改了 1 秒，闸就报"后端产物陈旧、必须重构建重启"，
 * 而那棵树里**没有一行生产码**变化。名字规则永远落后于事实一种写法。
 *
 * 口径：`#[cfg(test)] [pub…] mod NAME;` ⇒ 同目录的 `NAME.rs` 与整个 `NAME/` 目录都不进 exe。
 * 只认属性行**逐字符等于** `#[cfg(test)]` 的声明：`#[cfg(not(test))]`、`#[cfg(all(test, unix))]`
 * 一律不排除（宁可多要求一次重构建，也不能把真生产文件静默剔出采集面——那是假绿方向）。
 */
export function testOnlyModulePaths(rsFiles) {
  const excludedFiles = new Set()
  const excludedDirs = new Set()
  const DECL_RE = /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?mod[ \t]+([A-Za-z0-9_]+)[ \t]*;/
  for (const abs of rsFiles) {
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
    for (let i = 1; i < lines.length; i++) {
      if (lines[i - 1].trim() !== '#[cfg(test)]') continue
      const m = DECL_RE.exec(lines[i])
      if (!m) continue
      const dir = path.dirname(abs)
      const asFile = path.join(dir, `${m[1]}.rs`)
      if (fs.existsSync(asFile)) excludedFiles.add(path.resolve(asFile))
      const asMod = path.join(dir, m[1], 'mod.rs')
      const asDir = path.join(dir, m[1])
      if (fs.existsSync(asMod) || (fs.existsSync(asDir) && fs.statSync(asDir).isDirectory())) {
        excludedDirs.add(path.resolve(asDir))
      }
    }
  }
  return { excludedFiles, excludedDirs }
}

/** 是否落在排除面里（文件或其某个祖先目录被排除）。 */
function isExcluded(abs, { excludedFiles, excludedDirs }) {
  const full = path.resolve(abs)
  if (excludedFiles.has(full)) return true
  for (const d of excludedDirs) {
    if (full.startsWith(d + path.sep)) return true
  }
  return false
}

/**
 * 后端侧新鲜度（b83 新增的第二腿）：**Rust 源码是否比在跑的 exe 新**。
 *
 * 立项原因是实测的：`:8080` 上 `target/debug/stepby-axum.exe` 编译于 10:56，而
 * `common/error.rs`(17:49)、`handler/totp_handler.rs`(17:55)、`shared_store/mod.rs`(17:55)、
 * `service/auth_service.rs`(18:09) 都是本批契约族 A 之后改的——**三轮全量 1320 条断言
 * 跑的是一棵不含本批后端改动的树**，而且当时没有任何判据能发现。
 * `start-backend.mjs` 早就比对"监听进程的镜像路径属于本仓"，但它比的是**路径**：
 * 同一路径上的旧 exe 一样放行。前端那一腿有 mtime 对账，后端这一腿缺的正是这一条。
 *
 * 判据形状与前端对称：① exe 必须存在（取不到 = 证不了，不得读成"没有陈旧"）；
 * ② 采集面下限（扫不到 `.rs` 就是遍历坏了）；③ 任何生产源码文件晚于 exe ⇒ 点名并拒绝。
 *
 * ⚠️ **采集面是"链进同一个 exe 的全部 crate 源码"，不是 `stepby-axum/src`**（批八十六补）：
 * `governance` 与 `migration` 是两个独立 crate，但都被主 crate 依赖并**编进同一个二进制**——
 * `governance::CONFIGS` 的登记、`RETIRED_CONFIG_KEYS`、`side_theme_normalize_sql()` 这类
 * 产出种子 SQL 的纯函数，改变的是 `:8080` 上的真实行为。本批收 N-1 时实测踩到：
 * `governance/src/lib.rs` 比 exe 新，而闸只扫 `src/` ⇒ 一声不响放行。此前这句"三轮全量跑在
 * 旧 exe 上"（b83 §10 缺陷 G）修的是 `src/` 内部的盲区，crate 边界这一层从来没进视野。
 * 缺任一 crate 目录 ⇒ 拒绝判据（采集面缺一块就是遍历坏了，不得静默缩面后照常报新鲜）。
 *
 * 与 `#[cfg(test)]` 那条口径的关系：这两个 crate 的测试是**文件内** `mod tests`（不是
 * 独立的 cfg(test) 模块声明），所以改它们里的测试同样会要求重构建。取向与 b84 一致——
 * **宁可多要求一次重构建，绝不能把真生产文件静默剔出采集面**（后者是假绿方向）。
 *
 * @param {{axumRoot?:string, exeFile?:string, minFiles?:number, crateSrcDirs?:string[]}} [opts]
 * @returns {{stale:Array<{rel:string,agoMs:number}>, exeMs:number, scanned:number, excluded:number}}
 */
export function staleBackendSources({
  axumRoot = path.join(REPO_ROOT, 'stepby-axum'),
  exeFile = defaultExeFile(axumRoot),
  minFiles = 200,
  crateSrcDirs = ['src', path.join('governance', 'src'), path.join('migration', 'src')]
} = {}) {
  if (!fs.existsSync(axumRoot)) throw new Error(`后端仓不存在：${axumRoot}——无从判断产物新鲜度`)
  if (!fs.existsSync(exeFile)) {
    throw new Error(`后端 exe 不存在：${exeFile}——没有 exe 就判不了新鲜度（先 cargo build 再跑）`)
  }
  const all = []
  const walkRs = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'target' || ent.name.startsWith('.')) continue
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) walkRs(abs)
      else if (ent.name.endsWith('.rs')) all.push(abs)
    }
  }
  for (const rel of crateSrcDirs) {
    const dir = path.join(axumRoot, rel)
    if (!fs.existsSync(dir)) throw new Error(`后端源码目录不存在：${dir}——采集面缺一块，拒绝判新鲜度`)
    walkRs(dir)
  }
  // 排除面由声明派生（见 testOnlyModulePaths 的立项原因）
  const excl = testOnlyModulePaths(all)
  const prodRs = all.filter((f) => !isExcluded(f, excl))
  const files = [...prodRs]
  for (const f of [
    'Cargo.toml',
    'build.rs',
    'config.toml',
    'config.toml.example',
    path.join('governance', 'Cargo.toml'),
    path.join('migration', 'Cargo.toml')
  ]) {
    const abs = path.join(axumRoot, f)
    if (fs.existsSync(abs)) files.push(abs)
  }
  if (files.length < minFiles) {
    throw new Error(
      `后端源码只扫到 ${files.length} 个文件（<${minFiles}）——遍历已坏，拒绝判新鲜度（"扫不到"不得读成"没有改动"）`
    )
  }
  const exeMs = fs.statSync(exeFile).mtimeMs
  const stale = []
  for (const abs of files) {
    const ms = fs.statSync(abs).mtimeMs
    if (ms > exeMs) stale.push({ rel: path.relative(axumRoot, abs), agoMs: ms - exeMs })
  }
  stale.sort((a, b) => b.agoMs - a.agoMs)
  // `excluded` 只能由 `.rs` 采集面自己减出来：根文件（Cargo.toml 等）是**加进面**的，
  // 用 `all.length - files.length` 会把它们当成"被排除的测试文件"（b84 实测把 ⑭ 的自检打红）。
  return { stale, exeMs, scanned: files.length, excluded: all.length - prodRs.length }
}

/**
 * 纯函数：从 `netstat -ano` 的正文里取出**在该端口 LISTENING** 的 PID（去重、保序）。
 *
 * 抽成纯函数是为了自检能双向驱动它（不碰网络、不依赖本机有没有跑服务）——这条判据的输出
 * 是"归因信息"，它自己坏了必须和判据坏了一样可测。
 *
 * 三条形状约束，各挡一种误读：
 * ① 状态必须逐字符 `LISTENING`——`TIME_WAIT` 行的本地地址同样带 `:8080`，按"出现过端口"
 *    取会把已关闭的连接算成监听者；
 * ② 端口匹配用 `:port` 结尾，不是"包含"——`:18080` 含 `8080`，包含式会拦到隔壁实例；
 * ③ PID 必须全是数字——表头行 `  Proto  Local Address …` 的第四列是 `PID` 本身。
 *
 * @param {string} text netstat 正文
 * @param {string|number} port 端口
 * @returns {string[]} PID 列表（可能为空——空数组只说明"这张表里没有该端口的监听行"）
 */
export function parseNetstatPids(text, port) {
  const portRe = new RegExp(':' + String(port) + '$')
  const out = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 5) continue
    if (cols[3].toUpperCase() !== 'LISTENING') continue
    if (!portRe.test(cols[1])) continue
    if (!/^\d+$/.test(cols[4])) continue
    if (!out.includes(cols[4])) out.push(cols[4])
  }
  return out
}

/** 路径同源判定：Windows 大小写不敏感、分隔符两种写法等价，所以比归一后的串。 */
function samePath(a, b) {
  if (!a || !b) return null
  const n = (s) => String(s).trim().replace(/[\\/]/g, '\\').toLowerCase()
  return n(a) === n(b)
}

/**
 * 从被测 URL 取端口——归因必须问"**本轮要访问的那个端口**"，而不是硬编码 8080：
 * 第二实例（`SERVER_PORT=8094`、seed_diff 那一类）被检查时，问错端口会得到"没有监听行"，
 * 于是把真在跑的实例说成没跑（前言 ⑯(c)：前置条件不成立的归因是负资产）。
 * 解析不出来时回落 8080（本仓默认档），不猜别的。
 */
export function portOf(baseUrl) {
  try {
    const u = new URL(String(baseUrl))
    if (u.port) return u.port
    return u.protocol === 'https:' ? '443' : '80'
  } catch {
    return '8080'
  }
}

/**
 * "此刻谁在听这个端口"——PID + 它的可执行文件路径。
 *
 * 立项原因（b144 N-144-H）：新鲜度闸拦下"源码比 exe 新"时，人分不清拦的是**刚写的一句注释**
 * 还是**真没重建**，因为判据只说"exe 是旧的"，不说端口上跑的是哪一枚。补上这两项之后
 * 一眼可判：监听者就是那枚被判陈旧的 exe ⇒ 重构建 + 重启；路径不是 ⇒ 先确认测的是哪棵树。
 *
 * 全程只读系统命令（`netstat` / `Get-CimInstance`），不联网、不写盘；任何一步失败都
 * **返回原因而不是抛错**——这是归因信息，不是判据本体，它取不到时主判据照常红。
 * "取不到 PID"绝不能读成"没有进程在听"，所以结局一律带 `note` 写明卡在哪一步。
 *
 * @param {{port?:string|number, exeHint?:string, runImpl?:(cmd:string,args:string[])=>{ok:boolean,out?:string,note?:string}}} [opts]
 */
export function describeListener({ port = 8080, exeHint = '', runImpl } = {}) {
  const run =
    runImpl ||
    ((cmd, args) => {
      try {
        const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000, windowsHide: true })
        if (r.error) return { ok: false, note: `命令未能启动（${r.error.message}）` }
        if (r.status !== 0) return { ok: false, note: `${cmd} 退出码 ${r.status}` }
        return { ok: true, out: String(r.stdout ?? '') }
      } catch (e) {
        return { ok: false, note: `${cmd} 调用异常（${e && e.message ? e.message : String(e)}）` }
      }
    })
  if (!/^\d+$/.test(String(port))) {
    return { pid: null, exe: null, sameAsExpected: null, note: `端口形如 ${JSON.stringify(port)} 不可解析` }
  }
  const net = run('netstat', ['-ano'])
  if (!net.ok) return { pid: null, exe: null, sameAsExpected: null, note: `netstat 不可用：${net.note}` }
  const pids = parseNetstatPids(net.out, port)
  if (pids.length === 0) {
    return { pid: null, exe: null, sameAsExpected: null, note: `端口 ${port} 上没有 LISTENING 行` }
  }
  const pid = pids[0]
  const note = pids.length > 1 ? `该端口有 ${pids.length} 个监听 PID，取首个 ${pid}` : ''
  // 只用数字 PID 拼进 CIM 过滤器；非数字一律不查（注入面为零）
  const proc = run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`
  ])
  const exe = proc.ok
    ? String(proc.out || '')
        .trim()
        .split(/\r?\n/)[0]
    : ''
  return {
    pid,
    exe: exe || null,
    sameAsExpected: exeHint ? samePath(exe, exeHint) : null,
    note: !proc.ok ? `取 exe 路径失败：${proc.note}` : note || (exe ? '' : '进程已退出或路径不可读')
  }
}

/** 归因行的文案：四种结局（未探测 / 取不到 / 同一枚 / 另一枚）必须各说各话，不得都写成"请重构建"。 */
export function listenerAttributionLine(info, exeFile, port = '8080') {
  if (!info) return `端口 ${port} 的监听者未探测。`
  if (!info.pid) return `端口 ${port} 的监听者取不到（${info.note || '原因未给出'}）⇒ 不作为"服务已就绪"的证据。`
  const where = info.exe ? `exe=${info.exe}` : 'exe 路径不可读'
  const tail =
    info.sameAsExpected === true
      ? '监听的就是上面那枚被判陈旧的 exe ⇒ 重构建后必须重启进程，端口上才会换上新的'
      : info.sameAsExpected === false
        ? `⚠ 监听者不是被判陈旧的那枚（${exeFile}）⇒ 先确认端口 ${port} 服务的是哪一棵树（见 AGENTS 门禁全景 ①）`
        : ''
  return `当前端口 ${port} 监听 PID=${info.pid}，${where}${tail ? '：' + tail : ''}。`
}

/**
 * 完整闸：新鲜度 + 服务即产物。`fetchImpl` / `headImpl` 供自检注入，真跑用 node fetch。
 * 返回 `{ artifactDir, chunk, bytes }`；任何一条不过一律抛错（调用方 EXIT=2）。
 */
export async function assertFreshServedApp({
  vueRoot = VUE_ROOT,
  baseUrl = process.env.STEPBY_BASE_URL || 'http://localhost:8080',
  artifactDir,
  minFiles = 100,
  fetchImpl = fetch,
  headImpl,
  checkBackend = true,
  axumRoot,
  exeFile,
  // 归因探针可注入：自检**必须**注入假探针——真探针起 netstat/powershell 子进程，
  // 把"判据跑得动"变成"本机有没有这些命令"（前言 ④：判据不得与环境耦合）。
  listenerProbe = describeListener
} = {}) {
  // 后端那一腿排在前面：它不需要网络，而且"exe 是旧的"意味着后面所有 UI 判据测的
  // 都是上一轮的二进制——先拦住才不必再解释"为什么服务起来了却测的是旧码"。
  if (checkBackend) {
    const resolvedExe = exeFile || defaultExeFile(axumRoot)
    const b = staleBackendSources({ axumRoot, exeFile: resolvedExe })
    if (b.stale.length > 0) {
      const list = b.stale
        .slice(0, 6)
        .map((s) => `${s.rel}（比 exe 新 ${(s.agoMs / 60000).toFixed(1)} 分钟）`)
        .join('、')
      // 归因（b144 N-144-H）：只说"exe 是旧的"分不开"拦的是刚写的一句注释"与"真没重建"，
      // 所以顺带问一句"端口上跑的是哪一枚"。探测失败不影响本条红——它是解释，不是判据。
      const port = portOf(baseUrl)
      let listener = null
      try {
        listener = listenerProbe({ port, exeHint: resolvedExe })
      } catch (e) {
        listener = {
          pid: null,
          exe: null,
          sameAsExpected: null,
          note: `探针自身异常（${e && e.message ? e.message : String(e)}）`
        }
      }
      throw new Error(
        `后端产物陈旧：exe（${resolvedExe}）编译于 ${new Date(b.exeMs).toISOString()}，` +
          `而 ${b.stale.length} 个后端文件比它新——首推 ${list}。` +
          listenerAttributionLine(listener, resolvedExe, port) +
          ` 端口 ${port} 上跑的必然不含这些改动，跑批却会把它们记成"本批后端改动已验证"。` +
          `先 cargo build（本机 -j 4）再用 stepby-axum/start-backend.mjs 重启，再跑本判据。`
      )
    }
  }

  const dir = artifactDir ? path.resolve(VUE_ROOT, artifactDir) : resolveArtifactDir({ baseUrl })
  // 安全面先于内容面：嵌入产物里的 .map 会被原样对外服务，多份入口 chunk 说明目录没清空
  if (path.basename(dir) === 'frontend-dist') {
    const hygiene = artifactHygiene(dir)
    if (!hygiene.ok) {
      throw new Error(
        `嵌入产物不安全：${hygiene.reason}。` +
          `修复：pnpm run build:embedded && pnpm run sync:embedded（镜像语义：清空 + 排除 .map），` +
          `然后重启 :8080（build.rs 会重嵌）。`
      )
    }
  }
  const indexFile = path.join(dir, 'index.html')
  const { stale, artifactMs } = staleAppSources({ vueRoot, artifactFile: indexFile, minFiles })
  if (stale.length > 0) {
    const list = stale
      .slice(0, 6)
      .map((s) => `${s.rel}（比产物新 ${(s.agoMs / 60000).toFixed(1)} 分钟）`)
      .join('、')
    throw new Error(
      `产物陈旧：${indexFile} 的构建时间早于 ${stale.length} 个应用源码文件——首推 ${list}。` +
        `浏览器加载的必然不含这些改动，而跑批会把它当"本批改动已验证"。` +
        `重建顺序见 RUN-RECIPE §1/§2：build:embedded → 拷入 stepby-axum/frontend-dist/ → build:prod。` +
        `（产物构建于 ${new Date(artifactMs).toISOString()}）`
    )
  }
  const html = fs.readFileSync(indexFile, 'utf8')
  const chunk = entryChunkFromHtml(html)
  const diskFile = path.join(dir, chunk.replace(/^\//, ''))
  if (!fs.existsSync(diskFile)) throw new Error(`index.html 引用的入口 chunk 在产物目录里不存在：${diskFile}`)
  const diskBytes = fs.statSync(diskFile).size
  const served = await servedEntry({ baseUrl, chunk, html, fetchImpl, headImpl })
  if (served.bytes !== diskBytes) {
    throw new Error(
      `${baseUrl} 服务的是另一份产物：入口 chunk ${chunk} 服务端 ${served.bytes} 字节，` +
        `磁盘 ${diskBytes} 字节（${diskFile}）。` +
        `先核对服务根目录与本仓（同 AGENTS《测试门禁全景》① 对后端镜像路径的那条判据）。`
    )
  }
  return { artifactDir: dir, chunk, bytes: diskBytes, staleCount: 0 }
}

/** 取服务端入口 chunk 的字节数：先 HEAD，拿不到再 GET 一次数长度（不比对内容，只比大小）。 */
async function servedEntry({ baseUrl, chunk, html, fetchImpl, headImpl }) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/${chunk.replace(/^\//, '')}`
  if (headImpl) return headImpl(url)
  const head = await fetchImpl(url, { method: 'HEAD' })
  if (head.ok) {
    const len = Number(head.headers?.get?.('content-length'))
    if (Number.isFinite(len) && len > 0) return { bytes: len }
  }
  const get = await fetchImpl(url)
  if (!get.ok) throw new Error(`取不到服务端入口 chunk：${url} ⇒ HTTP ${get.status}（服务没起来？`)
  const body = await get.text()
  return { bytes: Buffer.byteLength(body) }
}

// ==================== 自检（合成夹具双向，不碰网络也不碰浏览器）====================

async function selftest() {
  const fail = []
  const dir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'freshness-'))
  const minFiles = 3 // 合成树只有几个文件；真跑用默认下限 100（⑤ 专测默认下限）
  // 合成一棵最小仓：src 若干 + 单测 + 生成类型 + 产物目录
  const mk = (rel, days, content = 'x') => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
    const t = new Date(Date.now() + days * 86400000)
    fs.utimesSync(abs, t, t)
    return abs
  }
  mk('src/views/a.vue', -10)
  mk('src/api/b.ts', -10)
  mk('src/style/c.scss', -10)
  mk(`src/i18n/d.test.ts`, -1) // 单测：比产物新也不该计入
  mk('src/types/api/generated/Type.ts', -1) // 生成类型：同上
  mk('index.html', -10, '<html></html>')
  const artifact = mk('stepby-axum/frontend-dist/index.html', -5, '<script src="/static/js/index-OLD123.js"></script>')
  const vueRoot = dir
  const opts = { vueRoot, artifactFile: artifact, minFiles }
  // ① 正控：全部源码早于产物 ⇒ 陈旧清单为空（不是"一律报"）
  const r1 = staleAppSources(opts)
  if (r1.stale.length !== 0) fail.push(`① 干净树上报了陈旧文件：${JSON.stringify(r1.stale)}`)
  // ② 应用源码晚于产物 ⇒ 必须点名，且理由里带上它
  mk('src/views/late.vue', 1)
  const r2 = staleAppSources(opts)
  if (r2.stale.length !== 1 || r2.stale[0].rel !== path.join('src', 'views', 'late.vue'))
    fail.push(`② 陈旧文件没被点名：${JSON.stringify(r2.stale)}`)
  // ③ 单测/生成类型晚于产物 ⇒ **不得**计入（否则每次跑 vitest 都要重构建，判据会被当噪声）
  mk('src/i18n/d.test.ts', 1)
  mk('src/types/api/generated/Type.ts', 1)
  const r3 = staleAppSources(opts)
  if (r3.stale.length !== 1) fail.push(`③ 单测/生成类型被误计入陈旧：${JSON.stringify(r3.stale)}`)
  // ④ 产物缺失必须响亮失败（"没有陈旧文件"不得读成"产物是新的"）
  try {
    staleAppSources({ vueRoot, artifactFile: path.join(dir, 'nope', 'index.html') })
    fail.push('④ 产物缺失被当成了新鲜')
  } catch {
    /* 期望 */
  }
  // ⑤ 采集面下限：src 下只放 2 个文件 ⇒ 遍历坏了要拒绝判据，而不是返回空集合
  const thin = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'fresh-thin-'))
  fs.mkdirSync(path.join(thin, 'src'), { recursive: true })
  fs.writeFileSync(path.join(thin, 'src', 'only.vue'), 'x')
  try {
    staleAppSources({ vueRoot: thin, artifactFile: artifact })
    fail.push('⑤ 应用源码只扫到 1 个文件却照常判新鲜（采集面坏了）')
  } catch (e) {
    if (!/遍历已坏/.test(e.message)) fail.push(`⑤ 拒绝理由没指向采集面：${e.message}`)
  }
  // ⑥ 入口 chunk 解析：找不到必须抛，找到要返回原路径
  try {
    entryChunkFromHtml('<html><body></body></html>')
    fail.push('⑥ 没有入口 chunk 的 index.html 被放行了')
  } catch {
    /* 期望 */
  }
  if (entryChunkFromHtml('<script src="/static/js/index-Ab12cd.js">') !== '/static/js/index-Ab12cd.js')
    fail.push('⑥ 入口 chunk 解析不对')
  // ⑦ 服务即产物：字节数一致放行、不一致拒绝（fetch 由桩给，自检不碰网络）
  mk('stepby-axum/frontend-dist/static/js/index-OLD123.js', -5, 'abc')
  // 产物卫生判据要求目录有最小体量（防"遍历坏了被读成干净"），夹具按真产物形状给到 3 个文件
  mk('stepby-axum/frontend-dist/static/css/index-OLD123.css', -5, 'body{}')
  fs.rmSync(path.join(dir, 'src', 'views', 'late.vue'))
  const okFetch = async () => ({ ok: true, status: 200, headers: { get: () => '3' }, text: async () => 'abc' })
  const badFetch = async () => ({ ok: true, status: 200, headers: { get: () => '4' }, text: async () => 'abcd' })
  const gate = (fetchImpl) =>
    assertFreshServedApp({
      vueRoot,
      baseUrl: 'http://127.0.0.1:1/',
      artifactDir: path.join(dir, 'stepby-axum', 'frontend-dist'),
      minFiles,
      // 合成 vueRoot 旁边没有真 axum 树；后端那一腿由 ⑨–⑫ 用**另一棵合成树**单独判，
      // 这里必须显式关掉——不得靠"目录不存在就跳过"那种默认放行。
      checkBackend: false,
      fetchImpl
    })
  try {
    const x = await gate(okFetch)
    if (x.bytes !== 3 || x.chunk !== '/static/js/index-OLD123.js')
      fail.push(`⑦ 一致产物的返回不对：${JSON.stringify(x)}`)
  } catch (e) {
    fail.push(`⑦ 一致产物被拒了：${e.message}`)
  }
  try {
    await gate(badFetch)
    fail.push('⑦ 服务端与磁盘字节不一致却没拒')
  } catch (e) {
    if (!/另一份产物/.test(String(e.message))) fail.push(`⑦ 拒绝理由没指向产物漂移：${e.message}`)
  }
  // ⑧ 陈旧产物在总闸这一支也必须拦住（不只被 staleAppSources 内部判，而是走到 assert 才抛）
  mk('src/views/late2.vue', 5)
  try {
    await gate(okFetch)
    fail.push('⑧ 总闸放行了陈旧产物')
  } catch (e) {
    if (!/产物陈旧/.test(String(e.message))) fail.push(`⑧ 总闸拒绝理由不对：${e.message}`)
  }
  // ⑨–⑯ 后端那一腿（b83 新增，b84 把"排除面"从目录名改为由声明派生）：
  // 同一棵合成树旁边造一个假 axum 目录
  const axum = path.join(dir, 'axum-fixture')
  const mkAxum = (rel, days, content = 'fn a() {}\n') => {
    const abs = path.join(axum, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
    const t = new Date(Date.now() + days * 86400000)
    fs.utimesSync(abs, t, t)
    return abs
  }
  const exe = mkAxum('target/debug/stepby-axum.exe', 0)
  /** 同 mkAxum，但可指定另一棵树（⑲ 的第二夹具） */
  const mkAt = (root, rel, days, content = 'fn a() {}\n') => {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
    const t = new Date(Date.now() + days * 86400000)
    fs.utimesSync(abs, t, t)
    return abs
  }
  for (let i = 0; i < 200; i++) mkAxum(`src/gen/m${i}.rs`, -8)
  mkAxum('Cargo.toml', -8)
  // **声明面**：排除面只能从这些声明派生（没有声明就没有排除 ⇒ ⑭–⑯ 判的是派生，不是文件名）
  mkAxum('src/lib.rs', -8, '#[cfg(test)]\nmod integration_tests;\n\npub mod gen;\n')
  mkAxum('src/gen/mod.rs', -8, 'pub mod a;\n')
  mkAxum('src/initialize/mod.rs', -8, '#[cfg(test)]\nmod tests;\n\npub mod schema;\n')
  mkAxum('src/initialize/tests.rs', -6, '#[cfg(test)]\nfn t() {}\n')
  mkAxum('src/initialize/schema.rs', -8)
  // ⑯a 的夹具：属性**不是**逐字符 `#[cfg(test)]` 的声明不得排除任何东西
  mkAxum('src/probe/mod.rs', -8, '#[cfg(all(test, feature = "gate"))]\nmod gated;\n\nmod tests;\n')
  mkAxum('src/probe/gated.rs', -8)
  mkAxum('src/probe/tests.rs', -8)
  // ⑰⑱ 的夹具：两个被主 crate 依赖、**编进同一个 exe** 的独立 crate（批八十六补的采集面）
  mkAxum('governance/src/lib.rs', -8, 'pub const CONFIGS: &[(&str)] = &[];\n')
  mkAxum('migration/src/lib.rs', -8, 'pub struct Migration;\n')
  const b0 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  if (b0.stale.length !== 0) fail.push(`⑨ 干净后端树上报了陈旧：${JSON.stringify(b0.stale.slice(0, 3))}`)
  if (b0.scanned < 200) fail.push(`⑨ 采集面数不对：${b0.scanned}`)
  // ⑩ 生产源码晚于 exe ⇒ 必须点名（本批踩到的正是这一形状）
  mkAxum('src/handler/totp_handler.rs', 2)
  const b1 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  if (b1.stale.length !== 1 || !/totp_handler\.rs$/.test(b1.stale[0].rel))
    fail.push(`⑩ 陈旧的后端源文件没被点名：${JSON.stringify(b1.stale)}`)
  // ⑪ exe 缺失 ⇒ 响亮失败（"没有陈旧文件"不得读成"产物是新的"）
  try {
    staleBackendSources({ axumRoot: axum, exeFile: path.join(axum, 'nope.exe'), minFiles: 100 })
    fail.push('⑪ exe 缺失被当成了新鲜')
  } catch (e) {
    if (!/exe 不存在/.test(String(e.message))) fail.push(`⑪ 拒绝理由没指向 exe：${e.message}`)
  }
  // ⑫ 采集面下限：只放 1 个 .rs ⇒ 遍历坏了必须拒绝判据
  const thinAxum = path.join(dir, 'axum-thin')
  fs.mkdirSync(path.join(thinAxum, 'src'), { recursive: true })
  fs.writeFileSync(path.join(thinAxum, 'src', 'only.rs'), 'x')
  // 两个 sibling crate 目录**给齐**：否则这一夹具测的是"缺目录"（⑲），不是"文件数不足"
  fs.mkdirSync(path.join(thinAxum, 'governance', 'src'), { recursive: true })
  fs.mkdirSync(path.join(thinAxum, 'migration', 'src'), { recursive: true })
  fs.copyFileSync(exe, path.join(thinAxum, 'exe.bin'))
  try {
    staleBackendSources({ axumRoot: thinAxum, exeFile: path.join(thinAxum, 'exe.bin') })
    fail.push('⑫ 后端只扫到 3 个文件却照常判新鲜（采集面坏了）')
  } catch (e) {
    if (!/遍历已坏/.test(String(e.message))) fail.push(`⑫ 拒绝理由没指向采集面：${e.message}`)
  }
  // ⑬ 接线自证：总闸必须真的走到后端这一腿（写了没接线=没写）
  //    ⚠ 探针在这里也必须注入假实现——自检一旦落到真 `describeListener` 就起 netstat/powershell
  //    子进程，"自检跑得动"就变成"本机有没有那两个命令"（前言 ④：判据不得与环境耦合）。
  try {
    await assertFreshServedApp({
      vueRoot,
      baseUrl: 'http://127.0.0.1:1/',
      artifactDir: path.join(dir, 'stepby-axum', 'frontend-dist'),
      minFiles,
      axumRoot: axum,
      exeFile: exe,
      fetchImpl: okFetch,
      listenerProbe: () => ({ pid: null, exe: null, sameAsExpected: null, note: '自检注入的假探针' })
    })
    fail.push('⑬ 总闸放行了陈旧的后端 exe（后端判据没接线）')
  } catch (e) {
    if (!/后端产物陈旧/.test(String(e.message))) fail.push(`⑬ 总闸拒绝理由没指向后端：${e.message}`)
  }
  // ⑭ `#[cfg(test)] mod integration_tests;` 不进 exe ⇒ 改它不得要求重构建（与前端不计入单测同口径）。
  //   排除面为空时这条**必须红**：它测的是"派生出来了"，不是"目录名被跳过"。
  mkAxum('src/integration_tests/late.rs', 3)
  const b2 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  if (b2.excluded < 2)
    fail.push(
      `⑭ 排除面只有 ${b2.excluded} 条（应 ≥2：tests.rs 文件 + integration_tests 目录）——派生没跑起来，这条等于没测`
    )
  if (b2.stale.some((s) => /integration_tests/.test(s.rel)))
    fail.push(`⑭ 只进测试二进制的目录被计入陈旧：${JSON.stringify(b2.stale)}`)
  // ⑮ 文件形模块（`src/initialize/tests.rs`，b84 实测被旧"按目录名跳过"漏掉的那一个）同样不得计入
  mkAxum('src/initialize/tests.rs', 4)
  const b3 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  if (b3.stale.some((s) => /[\\/]initialize[\\/]/.test(s.rel)))
    fail.push(`⑮ 挂在 #[cfg(test)] 上的 tests.rs 被计入陈旧：${JSON.stringify(b3.stale)}`)
  if (!b3.stale.some((s) => /totp_handler\.rs$/.test(s.rel)))
    fail.push(`⑮b 反证：生产文件 totp_handler.rs 必须**仍然**在陈旧清单里（⑮不得顺手把判据关掉）`)
  // ⑯ 对照组真受约束：属性不是逐字符 `#[cfg(test)]` 的声明**不得**排除；
  //    同名 `tests.rs` 只要没挂在 #[cfg(test)] mod tests; 上就必须照常进采集面。
  //    （这一条挡住"按文件名排除"那条捷径——那正是 b84 之前的实现所能蒙过的形状）
  mkAxum('src/probe/tests.rs', 7)
  mkAxum('src/probe/gated.rs', 7)
  const b4 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  for (const re of [/probe[\\/]tests\.rs$/, /probe[\\/]gated\.rs$/]) {
    if (!b4.stale.some((s) => re.test(s.rel))) fail.push(`⑯ 未被 #[cfg(test)] 声明排除的文件没进陈旧清单：${re}`)
  }
  // ⑰ governance crate 晚于 exe ⇒ 必须点名（批八十六实测踩到的盲区：闸只扫 stepby-axum/src）
  mkAxum(path.join('governance', 'src', 'lib.rs'), 5)
  const b5 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  if (!b5.stale.some((s) => /governance[\\/]src[\\/]lib\.rs$/.test(s.rel)))
    fail.push(`⑰ governance crate 的陈旧改动没被点名：${JSON.stringify(b5.stale.map((s) => s.rel))}`)
  // ⑱ migration crate 同理（新迁移 = 改变全新库的种子，跑批测的必须是含它的二进制）
  mkAxum(path.join('migration', 'src', 'lib.rs'), 6)
  const b6 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  if (!b6.stale.some((s) => /migration[\\/]src[\\/]lib\.rs$/.test(s.rel)))
    fail.push(`⑱ migration crate 的陈旧改动没被点名：${JSON.stringify(b6.stale.map((s) => s.rel))}`)
  // ⑲ 反证：sibling crate 目录缺失 ⇒ 拒绝判据，不得"少一块面"照常报新鲜
  const noGov = path.join(dir, 'axum-no-governance')
  fs.mkdirSync(path.join(noGov, 'src'), { recursive: true })
  for (let i = 0; i < 120; i++) mkAt(noGov, `src/gen/m${i}.rs`, -8)
  fs.mkdirSync(path.join(noGov, 'migration', 'src'), { recursive: true })
  fs.copyFileSync(exe, path.join(noGov, 'exe.bin'))
  try {
    staleBackendSources({ axumRoot: noGov, exeFile: path.join(noGov, 'exe.bin'), minFiles: 100 })
    fail.push('⑲ 缺 governance crate 的树照常判了新鲜（采集面静默缩块）')
  } catch (e) {
    if (!/采集面缺一块/.test(String(e.message))) fail.push(`⑲ 拒绝理由没指向采集面缺块：${e.message}`)
  }
  // ⑳ 嵌入产物卫生（b100）：.map 必须拒、多入口 chunk 必须拒、干净目录放行，
  //    且总闸**真的调用**了它（纯函数写了不接线 = 没写，同 AGENTS ⑮）。
  const hyg = path.join(dir, 'hyg', 'frontend-dist')
  mk('hyg/frontend-dist/index.html', -5, '<script src="/static/js/index-H1.js"></script>')
  mk('hyg/frontend-dist/static/js/index-H1.js', -5, 'abc')
  mk('hyg/frontend-dist/static/css/a.css', -5, 'x')
  try {
    const h = artifactHygiene(hyg)
    if (!h.ok || h.entries !== 1) fail.push(`⑳ 干净嵌入产物被拒：${JSON.stringify(h)}`)
  } catch (e) {
    fail.push(`⑳ 干净嵌入产物抛错：${e.message}`)
  }
  mk('hyg/frontend-dist/static/js/index-H1.js.map', -5, '{}')
  try {
    const h = artifactHygiene(hyg)
    if (h.ok || !/\.map/.test(h.reason)) fail.push(`⑳b 含 .map 没有被点名：${JSON.stringify(h)}`)
  } catch (e) {
    fail.push(`⑳b 含 .map 抛错：${e.message}`)
  }
  try {
    await assertFreshServedApp({
      vueRoot,
      baseUrl: 'http://127.0.0.1:1/',
      artifactDir: hyg,
      minFiles,
      checkBackend: false,
      fetchImpl: okFetch
    })
    fail.push('⑳c 总闸对含 .map 的嵌入产物照常放行（判据没接线）')
  } catch (e) {
    if (!/\.map/.test(String(e.message))) fail.push(`⑳c 拒绝理由没指向 .map：${e.message}`)
  }
  fs.rmSync(path.join(hyg, 'static', 'js', 'index-H1.js.map'))
  mk('hyg/frontend-dist/static/js/index-H2.js', -5, 'abc')
  try {
    const h = artifactHygiene(hyg)
    if (h.ok || !/入口 chunk/.test(h.reason)) fail.push(`⑳d 多入口 chunk 没有被点名：${JSON.stringify(h)}`)
  } catch (e) {
    fail.push(`⑳d 多入口 chunk 抛错：${e.message}`)
  }
  // ㉑ 归因探针的解析腿（纯函数，不碰网络）：三种"看着像监听"的形状都必须不误取
  const NET = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       30360',
    '  TCP    [::]:8080              [::]:0                 LISTENING       30360',
    '  TCP    127.0.0.1:8080         127.0.0.1:52233        TIME_WAIT       0',
    '  TCP    0.0.0.0:18080          0.0.0.0:0              LISTENING       41001',
    '  UDP    0.0.0.0:8080           *:*                                    41999'
  ].join('\r\n')
  const pids = parseNetstatPids(NET, '8080')
  if (pids.length !== 1 || pids[0] !== '30360')
    fail.push(`㉑ 监听 PID 取错（期望 [30360]）：${JSON.stringify(pids)}——TIME_WAIT/邻近端口/UDP 不得算监听者`)
  if (parseNetstatPids(NET, '18080').join() !== '41001')
    fail.push('㉑b 反证：18080 的监听者必须独立取到（端口匹配不得只比"含 8080"）')
  if (parseNetstatPids('', '8080').length !== 0 || parseNetstatPids(null, '8080').length !== 0)
    fail.push('㉑c 空正文必须得空集合（"没数据"不得读成"有监听者"）')
  // ㉒ describeListener 四态：全成功 / netstat 坏了 / 没有监听行 / 路径取不到
  const mkRun = (table) => (cmd) => {
    const hit = table[cmd]
    return hit ? hit : { ok: false, note: `未预期的命令 ${cmd}` }
  }
  const d1 = describeListener({
    port: '8080',
    exeHint: 'D:\\Projects\\stepby\\stepby-axum\\target\\debug\\stepby-axum.exe',
    runImpl: mkRun({
      netstat: { ok: true, out: NET },
      'powershell.exe': { ok: true, out: 'D:\\projects\\stepby\\stepby-axum\\target\\debug\\STEPBY-AXUM.EXE\r\n' }
    })
  })
  if (d1.pid !== '30360' || d1.sameAsExpected !== true)
    fail.push(`㉒ 同一枚 exe 必须判成同源（大小写/分隔符差异不得影响）：${JSON.stringify(d1)}`)
  const d2 = describeListener({
    port: '8080',
    exeHint: 'C:\\other\\stepby.exe',
    runImpl: mkRun({
      netstat: { ok: true, out: NET },
      'powershell.exe': { ok: true, out: 'D:\\Projects\\elsewhere\\stepby-axum.exe\r\n' }
    })
  })
  if (d2.sameAsExpected !== false) fail.push(`㉒b 另一棵树的 exe 必须判成不同源：${JSON.stringify(d2)}`)
  const d3 = describeListener({ port: '8080', runImpl: mkRun({ netstat: { ok: false, note: '命令未能启动（x）' } }) })
  if (d3.pid !== null || !/netstat/.test(d3.note)) fail.push(`㉒c netstat 不可用要写清卡在哪步：${JSON.stringify(d3)}`)
  const d4 = describeListener({ port: '9999', runImpl: mkRun({ netstat: { ok: true, out: NET } }) })
  if (d4.pid !== null || !/9999/.test(d4.note)) fail.push(`㉒d 无监听行要带端口号：${JSON.stringify(d4)}`)
  const d5 = describeListener({
    port: '8080',
    exeHint: 'D:\\a\\b.exe',
    runImpl: mkRun({ netstat: { ok: true, out: NET }, 'powershell.exe': { ok: false, note: '退出码 1' } })
  })
  if (d5.pid !== '30360' || d5.exe !== null || d5.sameAsExpected !== null)
    fail.push(`㉒e 路径取不到时 PID 仍要给出、同源判定必须收口为"未知"：${JSON.stringify(d5)}`)
  // ㉓ 四种结局的文案各说各话（都写成"请重构建"就等于没归因）
  const L_SAME = listenerAttributionLine(d1, 'D:\\x.exe', '8080')
  const L_OTHER = listenerAttributionLine(d2, 'D:\\x.exe', '8080')
  const L_NONE = listenerAttributionLine(d3, 'D:\\x.exe', '8080')
  if (!/监听的就是上面那枚/.test(L_SAME)) fail.push(`㉓ 同源结局文案不对：${L_SAME}`)
  if (!/哪一棵树/.test(L_OTHER)) fail.push(`㉓b 异源结局必须提示"测的是哪棵树"：${L_OTHER}`)
  if (!/不作为"服务已就绪"的证据/.test(L_NONE)) fail.push(`㉓c 取不到不得被读成"服务在跑"：${L_NONE}`)
  // ㉓d "根本没探测"是第四种结局，不是"取不到"的同义词：前者说明这道闸没接线，后者说明端口上确实没人。
  // 立项成因是盘上变异（把 `!info` 分支改成返回空串）在本组前两版下**照常绿**——
  // 三个变量都有 pid，第四支从来没有输入（AGENTS ⑥"反脆弱用例必须配一条真能转红的正控"）。
  const L_UNPROBED = listenerAttributionLine(null, 'D:\\x.exe', '8080')
  if (!/未探测/.test(L_UNPROBED))
    fail.push(`㉓d 未探测必须有专属文案（不得与"取不到"合流或返回空串）：${JSON.stringify(L_UNPROBED)}`)
  if (!/8080/.test(L_UNPROBED)) fail.push(`㉓e 未探测文案仍要写明问的是哪个端口：${JSON.stringify(L_UNPROBED)}`)
  // ㉔ portOf：归因问的必须是本轮真正要访问的那个端口
  if (portOf('http://127.0.0.1:8094/') !== '8094') fail.push('㉔ 显式端口没取到')
  if (portOf('https://example.test') !== '443') fail.push('㉔b https 默认端口没折算')
  if (portOf('不是个 URL') !== '8080') fail.push('㉔c 解析失败要回落本仓默认档')
  // ㉤ 接线自证：总闸那条红**必须把归因带进文案**，且问的是 baseUrl 的端口而不是硬编码 8080
  let askedPort = ''
  try {
    await assertFreshServedApp({
      vueRoot,
      baseUrl: 'http://127.0.0.1:8094/',
      artifactDir: path.join(dir, 'stepby-axum', 'frontend-dist'),
      minFiles,
      axumRoot: axum,
      exeFile: exe,
      fetchImpl: okFetch,
      listenerProbe: ({ port, exeHint }) => {
        askedPort = String(port)
        return { pid: '30360', exe: exeHint, sameAsExpected: true, note: '' }
      }
    })
    fail.push('㉤ 总闸放行了陈旧的后端 exe（归因这一腿没接线）')
  } catch (e) {
    const msg = String(e.message)
    if (!/后端产物陈旧/.test(msg)) fail.push(`㉤ 拒绝理由没指向后端：${msg}`)
    if (!/PID=30360/.test(msg)) fail.push(`㉤b 陈旧文案没带监听 PID ⇒ 归因写了没接线：${msg}`)
    if (!/监听的就是上面那枚/.test(msg)) fail.push(`㉤c 同源结局没进文案：${msg}`)
    if (askedPort !== '8094') fail.push(`㉤d 探针问的端口不是 baseUrl 的端口（取到 ${askedPort || '空'}）`)
  }
  // ㉥ 探针自己坏了 ⇒ 主判据照常红，且文案点名"探针自身异常"（不得把归因的失败洗成"没有监听者"）
  try {
    await assertFreshServedApp({
      vueRoot,
      baseUrl: 'http://127.0.0.1:1/',
      artifactDir: path.join(dir, 'stepby-axum', 'frontend-dist'),
      minFiles,
      axumRoot: axum,
      exeFile: exe,
      fetchImpl: okFetch,
      listenerProbe: () => {
        throw new Error('boom')
      }
    })
    fail.push('㉥ 探针抛错时总闸放行了陈旧 exe')
  } catch (e) {
    const msg = String(e.message)
    if (!/后端产物陈旧/.test(msg)) fail.push(`㉥ 主判据被探针的异常顶掉了：${msg}`)
    if (!/探针自身异常/.test(msg)) fail.push(`㉥b 归因失败必须可归因，不得静默：${msg}`)
  }
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(thin, { recursive: true, force: true })
  return fail
}
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
async function entry() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    const fail = await selftest()
    if (fail.length) {
      console.log('SYNTH_FAIL:')
      fail.forEach((f) => console.log(`  · ${f}`))
      process.exit(1)
    }
    // 条数由枚举本身派生（b84）：原先那句写死"14 组双向"，加用例时数字不动 ⇒ 标签与实际用例脱钩。
    const FRONTEND_CASES = [
      '干净树正控',
      '陈旧点名',
      '单测与生成类型不计入',
      '产物缺失',
      '采集面下限',
      '入口解析',
      '服务即产物字节对账（正反）',
      '总闸拦陈旧',
      '嵌入产物干净放行',
      '嵌入产物含 .map 点名',
      '总闸真走到产物卫生这一腿',
      '嵌入产物多入口 chunk 点名'
    ]
    const BACKEND_CASES = [
      '干净 exe 正控',
      '陈旧源文件点名',
      'exe 缺失',
      '采集面下限',
      '总闸真走到后端这一腿',
      'cfg(test) 目录形模块不计入',
      'cfg(test) 文件形模块不计入（含"生产文件仍要点名"反证）',
      '对照组：非 #[cfg(test)] 声明的同名文件照常计入',
      'governance crate 陈旧必须点名（同一 exe）',
      'migration crate 陈旧必须点名（同一 exe）',
      'sibling crate 目录缺失 ⇒ 拒绝判据（不得静默缩面）',
      '监听 PID 解析（TIME_WAIT / 邻近端口 / UDP / 表头都不得算监听者，含空正文反证）',
      'describeListener 五态（同源 / 异源 / netstat 坏 / 无监听行 / 路径取不到）',
      '归因四种结局各说各话',
      'portOf 三形（显式端口 / https 默认 / 解析失败回落）',
      '总闸文案真带监听 PID 且问的是 baseUrl 的端口（接线自证）',
      '探针自身抛错 ⇒ 主判据照常红且点名探针'
    ]
    log(
      `SYNTH_OK 产物新鲜度 ${FRONTEND_CASES.length + BACKEND_CASES.length} 组双向（前端：` +
        `${FRONTEND_CASES.join(' / ')}；后端：${BACKEND_CASES.join(' / ')}）`
    )
    process.exit(0)
  }
  const artifactArg = args.find((a) => a.startsWith('--artifact-dir='))
  const baseUrl = (args.find((a) => a.startsWith('--base-url=')) || '').slice('--base-url='.length) || undefined
  try {
    const r = await assertFreshServedApp({ artifactDir: artifactArg?.slice('--artifact-dir='.length), baseUrl })
    log(`✅ 产物新鲜且服务即产物：${r.artifactDir}（入口 ${r.chunk} / ${r.bytes} 字节）`)
    process.exit(0)
  } catch (e) {
    console.log(`[FATAL] ${e.message}`)
    process.exit(2)
  }
}

if (invokedDirectly) entry()
