/**
 * 前端产物新鲜度闸（批八十二新增）。
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
 * 完整闸：新鲜度 + 服务即产物。`fetchImpl` / `headImpl` 供自检注入，真跑用 node fetch。
 * 返回 `{ artifactDir, chunk, bytes }`；任何一条不过一律抛错（调用方 EXIT=2）。
 */
export async function assertFreshServedApp({
  vueRoot = VUE_ROOT,
  baseUrl = process.env.STEPBY_BASE_URL || 'http://localhost:8080',
  artifactDir,
  minFiles = 100,
  fetchImpl = fetch,
  headImpl
} = {}) {
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
      'SYNTH_OK 前端产物新鲜度 8 组双向（干净树正控 / 陈旧点名 / 单测与生成类型不计入 / 产物缺失 / 采集面下限 / 入口解析 / 服务即产物字节对账 / 总闸拦陈旧）'
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
