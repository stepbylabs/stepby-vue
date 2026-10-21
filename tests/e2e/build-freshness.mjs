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
 * 用法：
 *   node tests/e2e/build-freshness.mjs                       # 判当前 :8080 的产物
 *   node tests/e2e/build-freshness.mjs --artifact-dir=dist   # 判 vite preview 那份
 *   node tests/e2e/build-freshness.mjs --selftest            # 合成夹具双向，不碰网络
 */
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
 * @param {{axumRoot?:string, exeFile?:string, minFiles?:number}} [opts]
 * @returns {{stale:Array<{rel:string,agoMs:number}>, exeMs:number, scanned:number}}
 */
export function staleBackendSources({
  axumRoot = path.join(REPO_ROOT, 'stepby-axum'),
  exeFile = path.join(axumRoot, 'target', 'debug', 'stepby-axum.exe'),
  minFiles = 200
} = {}) {
  if (!fs.existsSync(axumRoot)) throw new Error(`后端仓不存在：${axumRoot}——无从判断产物新鲜度`)
  if (!fs.existsSync(exeFile)) {
    throw new Error(`后端 exe 不存在：${exeFile}——没有 exe 就判不了新鲜度（先 cargo build 再跑）`)
  }
  const files = []
  const srcDir = path.join(axumRoot, 'src')
  if (!fs.existsSync(srcDir)) throw new Error(`后端源码目录不存在：${srcDir}`)
  const walkRs = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'target' || ent.name.startsWith('.')) continue
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        // `src/integration_tests/` 挂在 `#[cfg(test)] mod`（src/lib.rs:77）——只进测试二进制，
        // 不进 exe。把它计入只会让"改了个集成测试"也强制重构建并重启服务，那是噪声；
        // 口径与前端排除 `*.test.ts` 完全一致（见 appSources 的 TEST_FILE_RE）。
        if (path.basename(dir) === 'src' && ent.name === 'integration_tests') continue
        walkRs(abs)
      } else if (ent.name.endsWith('.rs')) files.push(abs)
    }
  }
  walkRs(srcDir)
  for (const f of ['Cargo.toml', 'build.rs', 'config.toml', 'config.toml.example']) {
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
  return { stale, exeMs, scanned: files.length }
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
  exeFile
} = {}) {
  // 后端那一腿排在前面：它不需要网络，而且"exe 是旧的"意味着后面所有 UI 判据测的
  // 都是上一轮的二进制——先拦住才不必再解释"为什么服务起来了却测的是旧码"。
  if (checkBackend) {
    const b = staleBackendSources({ axumRoot, exeFile })
    if (b.stale.length > 0) {
      const list = b.stale
        .slice(0, 6)
        .map((s) => `${s.rel}（比 exe 新 ${(s.agoMs / 60000).toFixed(1)} 分钟）`)
        .join('、')
      throw new Error(
        `后端产物陈旧：exe 编译于 ${new Date(b.exeMs).toISOString()}，而 ${b.stale.length} 个后端文件比它新——首推 ${list}。` +
          `:8080 上跑的必然不含这些改动，跑批却会把它们记成"本批后端改动已验证"。` +
          `先 cargo build（本机 -j 4）再用 stepby-axum/start-backend.mjs 重启，再跑本判据。`
      )
    }
  }

  const dir = artifactDir ? path.resolve(VUE_ROOT, artifactDir) : resolveArtifactDir({ baseUrl })
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
  // ⑨–⑬ 后端那一腿（b83 新增）：同一棵合成树旁边造一个假 axum 目录
  const axum = path.join(dir, 'axum-fixture')
  const mkAxum = (rel, days) => {
    const abs = path.join(axum, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'fn a() {}\n')
    const t = new Date(Date.now() + days * 86400000)
    fs.utimesSync(abs, t, t)
    return abs
  }
  const exe = mkAxum('target/debug/stepby-axum.exe', 0)
  for (let i = 0; i < 200; i++) mkAxum(`src/gen/m${i}.rs`, -8)
  mkAxum('Cargo.toml', -8)
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
  fs.copyFileSync(exe, path.join(thinAxum, 'exe.bin'))
  try {
    staleBackendSources({ axumRoot: thinAxum, exeFile: path.join(thinAxum, 'exe.bin') })
    fail.push('⑫ 后端只扫到 3 个文件却照常判新鲜（采集面坏了）')
  } catch (e) {
    if (!/遍历已坏/.test(String(e.message))) fail.push(`⑫ 拒绝理由没指向采集面：${e.message}`)
  }
  // ⑬ 接线自证：总闸必须真的走到后端这一腿（写了没接线=没写）
  try {
    await assertFreshServedApp({
      vueRoot,
      baseUrl: 'http://127.0.0.1:1/',
      artifactDir: path.join(dir, 'stepby-axum', 'frontend-dist'),
      minFiles,
      axumRoot: axum,
      exeFile: exe,
      fetchImpl: okFetch
    })
    fail.push('⑬ 总闸放行了陈旧的后端 exe（后端判据没接线）')
  } catch (e) {
    if (!/后端产物陈旧/.test(String(e.message))) fail.push(`⑬ 总闸拒绝理由没指向后端：${e.message}`)
  }
  // ⑭ `#[cfg(test)] mod integration_tests` 不进 exe ⇒ 改它不得要求重构建（与前端不计入单测同口径）
  mkAxum('src/integration_tests/late.rs', 3)
  const b2 = staleBackendSources({ axumRoot: axum, exeFile: exe, minFiles: 100 })
  if (b2.stale.some((s) => /integration_tests/.test(s.rel)))
    fail.push(`⑭ 只进测试二进制的目录被计入陈旧：${JSON.stringify(b2.stale)}`)
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
    log(
      'SYNTH_OK 产物新鲜度 14 组双向（前端：干净树正控 / 陈旧点名 / 单测与生成类型不计入 / 产物缺失 / 采集面下限 / 入口解析 / 服务即产物字节对账 / 总闸拦陈旧；' +
        '后端：干净 exe 正控 / 陈旧源文件点名 / exe 缺失 / 采集面下限 / 总闸真走到后端这一腿 / cfg(test) 目录不计入）'
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
