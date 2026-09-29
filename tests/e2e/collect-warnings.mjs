/**
 * 逐页采集运行时信号（11 类）：console(warning/error)、未捕获异常(pageerror)、
 * 请求失败(requestfailed)、HTTP 4xx/5xx 响应(response)、JSON 业务错误码、
 * element-plus toast、弹窗(MessageBox/Dialog)、真实 404 页面、后端日志（人工关联），
 * 以及本轮新增的两类"静默渲染缺陷"：
 *   #10 i18n 未翻译键泄漏（t() 词条缺失时回退渲染裸键，如 "monitor.fooBar"）、
 *   #11 图片解码失败（<img> 拿到 200 却 naturalWidth=0，被 SPA fallback 顶成 HTML 等）。
 *
 * 用于分析"界面警告/错误"的根因，覆盖每一轮 E2E 循环中"可能有用的信息"。
 *
 * 运行：
 *   PLAYWRIGHT_BROWSERS_PATH=D:/Projects/.pw-browsers \
 *   node collect-warnings.mjs
 * 环境变量覆盖：FRONTEND_URL / STEPBY_TEST_USER / STEPBY_TEST_PASS / INTERACT=1。
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
import { capturePageCaptcha, fillCaptchaOnPage } from './e2e/run/auth.mjs'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4173'
const USER = process.env.STEPBY_TEST_USER || 'admin'
const PASS = process.env.STEPBY_TEST_PASS || 'admin123'

// 覆盖 sys_menu 中已注册（status=0）的全部可达功能页面。
// 路径权威来源是后端 getRouters 组合结果（/父目录path/子path），不是手写猜测。
// 静态猜测会命中 404 兜底页造成误报：例如 operlog 实为 /system/log/operlog，
// backup/task 在 /monitor 下，about/help/changelog/shortcuts 在 /tool 下，
// workbench 实为 /workbench/index。/index 与 /user/profile/* 为"隐藏但可直达"页，保留。
const ROUTES = [
  // 首页（隐藏但可直达）
  '/index',
  // 仪表盘 / 工作台
  '/dashboard',
  '/workbench/index',
  // 系统管理
  '/system/user',
  '/system/role',
  '/system/dept',
  '/system/menu',
  '/system/post',
  '/system/dict',
  // 字典数据页：静态隐藏路由 /system/dict-data/index/:dictId（带参可直达，轮2补捕）
  '/system/dict-data/index/1',
  '/system/config',
  '/system/notice',
  '/system/notice-center',
  '/system/file',
  '/system/dashboard',
  '/system/log/operlog',
  '/system/msg/channel',
  '/system/msg/template',
  '/system/msg/log',
  '/system/oauth/provider',
  '/system/oauth/client',
  '/system/report/index',
  '/system/report/sub',
  '/system/webHook/index',
  '/system/webHook/log',
  // 系统监控
  '/monitor/online',
  '/monitor/job',
  '/monitor/cache',
  '/monitor/audit-dashboard',
  '/monitor/ip-location',
  '/monitor/health',
  '/monitor/logininfor',
  '/monitor/logtail',
  '/monitor/observability',
  '/monitor/rateLimit',
  '/monitor/backup',
  '/monitor/task',
  '/monitor/frontendError',
  '/monitor/pat',
  '/monitor/server',
  // 审批中心（2026-09-26 补捕：W-8 已办 / W-11 导出 / W-17 移动端 都落在此页，此前未纳入采集面）
  '/system/flow/todo',
  // 系统工具
  '/tool/build',
  '/tool/gen',
  '/tool/swagger',
  '/tool/http-debugger',
  '/tool/shortcuts',
  '/tool/help',
  '/tool/changelog',
  '/tool/about',
  // 个人中心（隐藏但可直达）
  '/user/profile/index',
  '/user/profile/msgPref',
  '/user/profile/oauth',
  '/user/profile/pat',
  '/user/profile/resetPwd',
  '/user/profile/totp',
  '/user/profile/userAvatar',
  '/user/profile/userInfo'
]

// —— 采集面 #10/#11（本轮新增，覆盖既有 9 类信号抓不到的"静默渲染缺陷"）——
//
// #10 i18n 未翻译键泄漏：当 t('ns.key') 因词条缺失而失败时，vue-i18n 会把原始键
//     字符串（如 "monitor.frontendError"）当作文本回退渲染出来。这类缺陷不产生 console
//     error / HTTP 错误 / Toast，是被现有信号完全遗漏的一类"看得见的坏"。判定依据是
//     可见文本里出现"顶层命名空间.子键"形式的裸键 token。I18N_NS 取自 src/i18n/locales
//     真实聚合出的顶层键全集（脚本生成，非猜测）。
// #11 图片解码失败：<img> 拿到 200 但内容坏/被 SPA fallback 顶成 HTML 时 naturalWidth=0，
//     这类"资源加载成功但渲染失败"HTTP 状态信号也抓不到。仅统计可见且已 complete 者。
const I18N_NS = new Set(
  (
    'about,announcementBanner,auditDashboard,backup,batchActions,breadcrumb,build,' +
    'changelog,commandPalette,common,config,cookieConsent,crontab,dashboard,dept,' +
    'desensitize,dict,editableCell,editor,error,errorBoundary,errorCode,excelImport,' +
    'exportDialog,file,fileUpload,frontendError,gen,hamburger,headerSearch,health,help,' +
    'httpDebug,iconSelect,imageUpload,ipLocation,job,jobLog,langSelect,layout,legal,lock,' +
    'logTail,login,logininfor,menu,menuModule,msg,myLogin,mySession,notice,noticeCenter,' +
    'notification,oauth,observability,online,operlog,passwordRule,passwordStrength,pdf,post,' +
    'printTable,profile,rateLimit,register,report,rightToolbar,role,route,server,session,' +
    'shortcuts,sizeSelect,task,taskProgress,theme,themeEditor,time,tour,treePanel,user,' +
    'userAuthRole,userPrefs,userView,webHook,workbench,stepby,pat'
  ).split(',')
)
// 点号串里若任一段是常见文件扩展名，视为真实内容（如 report.pdf / dashboard.xlsx）而非泄漏键。
const DOTTED_EXTS = new Set([
  'pdf',
  'js',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'json',
  'xml',
  'yml',
  'yaml',
  'sql',
  'csv',
  'xlsx',
  'xls',
  'txt',
  'log',
  'html',
  'htm',
  'css',
  'scss',
  'md',
  'zip',
  'tar',
  'gz',
  'rar',
  'db',
  'sqlite',
  'mp4',
  'webm',
  'wav',
  'mp3',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'bak'
])
// 末段是常见 TLD 时视为域名（如官网 "stepby.tzkj.net"），非 i18n 键。
const DOTTED_TLDS = new Set([
  'com',
  'cn',
  'net',
  'org',
  'io',
  'dev',
  'gov',
  'edu',
  'co',
  'me',
  'tv',
  'app',
  'top',
  'xyz',
  'info',
  'biz',
  'vip',
  'club',
  'site',
  'online',
  'store',
  'tech',
  'space',
  'fun',
  'icu',
  'cc',
  'life',
  'link',
  'live',
  'news',
  'shop',
  'cloud',
  'pro',
  'academy'
])
// 少数页面按设计展示点号标识串（非 i18n 键，any-segment 启发式会误判），整页跳过 #10 扫描：
//  - /system/config：参数管理列表把 configKey（如 stepby.captcha.enabled）当数据列展示；
//  - /monitor/logtail：日志行含 Java/类路径等点号串；
//  - /tool/gen：代码生成展示包名/字段（com.xxx.domain）。
const I18N_LEAK_SKIP = new Set(['/system/config', '/monitor/logtail', '/tool/gen'])

// 已知良性、无需告警的响应（轮1收窄）：采集器以 admin 登录态浏览受保护页面，
// 任何 401 都意味着鉴权/权限回归，不再一律豁免——否则权限类缺陷被整体吞掉。
function benignResponse(url, status) {
  if (/favicon\.(ico|png)/i.test(url)) return true
  return false
}

// RuoYi 约定：业务失败以 HTTP 200 + body.code!=200 返回（前端 request 拦截器据此弹错误 Toast）。
// 采集器需读取 JSON 响应体的 code 字段，捕获"被页面静默吞掉"的业务错误——这是被动加载
// 信号（console/dialog）之外易遗漏的一类信息。200/0 视为成功；其余记为业务错误待人工研判。
function isBizSuccess(body) {
  if (!body || typeof body !== 'object') return true
  if (typeof body.code === 'undefined') return true // 非统一封套接口（如 ts 类型/静态资源）不判定
  return body.code === 200 || body.code === 0
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// node 事件循环层硬超时竞速：Playwright 驱动偶发挂死（协议丢消息）时，其调用自带的
// timeout 亦失效——timeout 由同一驱动层实现。唯有不依赖驱动的 setTimeout 必然触发
// （node 事件循环仍在），用于把挂起的调用解除并继续/兜底。
function withHardTimeout(promise, ms, label) {
  let timer
  const timeoutP = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[watchdog] ${label} 超过 ${ms}ms 未完成（疑似驱动挂死）`)), ms)
  })
  return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timer))
}

// 稳健关闭交互扫描中打开的对话框/抽屉：反复 Esc + 点关闭按钮，直到无可见浮层或达到上限。
// 单一 Esc 在部分页面会被内部组件（聚焦输入/选择器）吞掉，导致扫描器自开的对话框残留成假阳性信号。
async function dismissOverlays(page) {
  const sel = '.el-dialog:visible, .el-drawer:visible'
  for (let i = 0; i < 4; i++) {
    const visible = await page
      .locator(sel)
      .count()
      .catch(() => 0)
    if (!visible) return
    // 先 Esc（多数对话框即时响应），再给关闭过渡留足时间；仍残留才点关闭按钮。
    await page.keyboard.press('Escape').catch(() => {})
    await sleep(600)
    if (
      !(await page
        .locator(sel)
        .count()
        .catch(() => 0))
    )
      continue
    await page
      .locator('.el-dialog__headerbtn:visible, .el-drawer__close-btn:visible')
      .first()
      .click({ timeout: 800 })
      .catch(() => {})
    await sleep(400)
  }
}

// 首访引导遮罩（.stepby-tour-mask，pointer-events:auto）会拦截交互扫描对「新增/编辑」按钮的点击，
// 导致对话框根本没打开——交互覆盖计数会静默退化为 0（正是"扫描器空转"陷阱）。每页加载后先移除引导，
// 让点击落到页面自身控件上（引导本身由 main.mjs 的功能用例单独验证，非广度巡检职责）。
async function dismissTour(page) {
  const skipBtn = page
    .locator(
      'button:has-text("跳过"), button:has-text("跳过引导"), [class*="tour"] button:has-text("跳"), button:has-text("完成"), button:has-text("开始使用")'
    )
    .first()
  if (await skipBtn.isVisible({ timeout: 600 }).catch(() => false)) {
    await skipBtn.click({ timeout: 1000 }).catch(() => {})
    await sleep(300)
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page
    .evaluate(() => {
      document
        .querySelectorAll('.stepby-tour-mask, .tour-wrapper, [class*="driver-overlay"], [class*="tour-step"]')
        .forEach((e) => e.remove())
    })
    .catch(() => {})
  await sleep(200)
}
const results = []

async function login(page) {
  // 验证码捕获须在 goto 前注册（与页面显示图同源；后端未启用时跳过填码）
  const captchaPromise = capturePageCaptcha(page)
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' }).catch(() => {})
  await sleep(1500)
  const cb = page.locator('button:has-text("同意")').first()
  if (await cb.isVisible({ timeout: 500 }).catch(() => false)) {
    await cb.click({ timeout: 2000 }).catch(() => {})
    await sleep(300)
  }
  const u = page.locator('input[placeholder="账号"], input[placeholder="Username"], input[name="username"]').first()
  await u.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  await u.fill(USER)
  const p = page.locator('input[placeholder="密码"], input[placeholder="Password"], input[type="password"]').first()
  await p.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  await p.fill(PASS)
  await fillCaptchaOnPage(page, await captchaPromise)
  const btn = page
    .locator('button:has-text("登 录"), button:has-text("登录"), button:has-text("Login"), button[type="submit"]')
    .first()
  await btn.click().catch(() => {})
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }).catch(() => {})
  await sleep(3000)
  return !page.url().includes('login')
}

const INTERACT = process.env.INTERACT === '1'
// 交互扫描中"打开表单对话框再取消"的按钮文案（新增/添加/新建），只打开不提交，Esc 关闭。
const ADD_BTN_RE = /(新增|添加|新建|New|Add)/i
// 行内"编辑/查看/详情/预览"操作：打开回填表单对话框/抽屉（数据水合路径，编辑态才暴露的
// 水合/渲染错误）。行操作按钮多为图标-only（accessible name 来自 aria-label），故按
// 可访问名匹配，不靠可见文本。只读打开再取消，不提交、不改数据。
const ROW_VIEW_BTN_RE = /(编辑|修改|查看|详情|详细|预览|Edit|View|Detail|Preview)/i
// 交互扫描中可安全点击的只读按钮（查询/重置/刷新），不改数据。
const READONLY_BTN_RE = /^\s*(搜索|查询|重置|刷新)\s*$/

// 浏览器扩展注入的资源（chrome-extension:// 等）并非被测应用的一部分：内嵌模式 :8080 的
// CSP（default-src 'self'）会拦截扩展字体/脚本并打印 console error + requestfailed，这是测试
// Chromium 环境噪声而非应用缺陷。此处过滤扩展来源，保留对应用自身源的真实 CSP/加载错误。
const EXT_NOISE_RE =
  /chrome-extension:\/\/|moz-extension:\/\/|ms-browser-extension:\/\/|extensions\.[a-z]+\.chromium\.org|Loading the font '[^']*(chrome-extension|moz-extension)|Content Security Policy directive:[^\n]*(chrome-extension|moz-extension)/i

async function scanPage(page, route) {
  const msgs = []
  const pageErrors = []
  const reqFail = []
  const badResp = []
  const bizErr = []
  let jsonResp = []
  const onConsole = (msg) => {
    const t = msg.type()
    if (t !== 'warning' && t !== 'error') return
    const text = msg.text()
    if (EXT_NOISE_RE.test(text)) return
    msgs.push(`[${t}] ${text}`)
  }
  const onPageError = (err) => {
    const s = String(err && err.message ? err.message : err)
    if (!EXT_NOISE_RE.test(s)) pageErrors.push(s)
  }
  const onFail = (req) => {
    const url = req.url()
    if (EXT_NOISE_RE.test(url)) return
    reqFail.push(`${req.method()} ${url} :: ${req.failure()?.errorText || 'failed'}`)
  }
  const onResponse = (resp) => {
    const st = resp.status()
    const url = resp.url()
    if (st >= 400 && !benignResponse(url, st)) badResp.push(`${resp.request().method()} ${url} -> ${st}`)
    const ct = resp.headers()['content-type'] || ''
    if (url.startsWith(FRONTEND_URL) && ct.includes('application/json')) jsonResp.push(resp)
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onFail)
  page.on('response', onResponse)
  await page.goto(`${FRONTEND_URL}${route}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
  await sleep(1800)
  await dismissTour(page)

  // 交互扫描：点击只读按钮 + 打开"新增"/行内"编辑/查看"对话框再取消，捕获仅交互态才暴露的信号。
  const act = { ro: 0, add: 0, addOpen: 0, view: 0, viewOpen: 0, exp: 0, expOk: 0 } // 记录交互动作，证明扫描确有覆盖（非空转）
  if (INTERACT) {
    jsonResp = [] // 被动加载阶段的业务响应已在下方判定，交互阶段单独收敛避免重复
    // (a) 只读按钮。用 .all() 固化为元素句柄再遍历（轮1修正）：
    //     locator.nth(i) 每次都对当前 DOM 重新解析，点击引发列表重渲染时索引会漂移（漏点/重点）。
    const roHandles = await page
      .locator('.el-button:visible')
      .all()
      .catch(() => [])
    for (const btn of roHandles.slice(0, 40)) {
      const label = ((await btn.innerText().catch(() => '')) || '').trim()
      if (READONLY_BTN_RE.test(label)) {
        act.ro++
        await btn.click({ timeout: 1500 }).catch(() => {})
        await sleep(500)
      }
    }
    // (b) 打开新增表单对话框（仅渲染验证，不提交），随后 Esc 关闭。
    //     轮1收紧：点击后对话框未渲染且无新错误时也判定——若 URL 也未变化则是"点击无反应"
    //     （处理器缺失/被禁用遮蔽），不再一律良性放行。
    const addBtn = page.locator('.el-button:visible').filter({ hasText: ADD_BTN_RE }).first()
    if (await addBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      const addDisabled = await addBtn.isDisabled().catch(() => false)
      if (addDisabled) {
        msgs.push('[interact] 「新增」按钮呈禁用态（权限隐藏与禁用无法区分，需人工研判）')
      } else {
        const errBefore = msgs.length + pageErrors.length
        const urlBeforeAdd = page.url()
        // 内联新增（加表格行/加选项/加表单项）是合法反应：以全局元素数量变化为证据，
        // 只有"无弹窗、无跳转、无错误、DOM 无增量"才算真·点击无反应。
        const elemCount = () => page.evaluate(() => document.getElementsByTagName('*').length).catch(() => -1)
        const countBefore = await elemCount()
        await addBtn.click({ timeout: 1500 }).catch(() => {})
        await sleep(1200)
        let dlgVisible = await page
          .locator('.el-dialog:visible')
          .first()
          .isVisible({ timeout: 800 })
          .catch(() => false)
        if (!dlgVisible) {
          await sleep(1000) // 大型表单懒加载二次确认
          dlgVisible = await page
            .locator('.el-dialog:visible')
            .first()
            .isVisible({ timeout: 800 })
            .catch(() => false)
        }
        const navigated = page.url() !== urlBeforeAdd // 非模态新增：路由跳转到表单页
        act.add = 1
        if (dlgVisible) act.addOpen = 1
        if (!dlgVisible && !navigated) {
          const reacted = (await elemCount()) > countBefore
          if (msgs.length + pageErrors.length > errBefore) {
            msgs.push('[interact] 点击「新增」后对话框未渲染（伴随运行时错误）')
          } else if (!reacted) {
            msgs.push('[interact] 点击「新增」无反应：无对话框、无路由跳转、无 DOM 增量、无错误（疑似处理器缺失）')
          }
        }
        await dismissOverlays(page)
      }
    }
    // (c) 打开首行「编辑/查看/详情/预览」回填对话框/抽屉（数据水合路径，编辑态才暴露的水合/
    //     渲染错误），只读打开再取消不提交；仅当"未渲染"伴随交互期新增运行时错误时才算异常。
    //     行操作按钮是图标-only（accessible name 取 aria-label），用 role+name 定位。
    const tbl = page.locator('.el-table').first()
    const viewBtn = tbl
      .getByRole('button', { name: ROW_VIEW_BTN_RE })
      .or(tbl.getByRole('link', { name: ROW_VIEW_BTN_RE }))
      .first()
    const overlaySel = '.el-dialog:visible, .el-drawer:visible'
    if (await viewBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      const urlBefore = page.url()
      const errBefore2 = msgs.length + pageErrors.length
      await viewBtn.click({ timeout: 1500 }).catch(() => {})
      await sleep(1200)
      let dlg2 = await page
        .locator(overlaySel)
        .first()
        .isVisible({ timeout: 800 })
        .catch(() => false)
      if (!dlg2) {
        await sleep(1000)
        dlg2 = await page
          .locator(overlaySel)
          .first()
          .isVisible({ timeout: 800 })
          .catch(() => false)
      }
      if (!dlg2 && page.url() === urlBefore && msgs.length + pageErrors.length > errBefore2) {
        msgs.push('[interact] 点击行「编辑/查看」后对话框/抽屉未渲染（伴随运行时错误）')
      }
      act.view = 1
      if (dlg2) act.viewOpen = 1
      await dismissOverlays(page)
    }
    // (d) 导出物证（轮2新增）：点击「导出」必须拿到真实下载证据——download 事件（saveAs 产物）
    //     或 export/template 接口 200 响应，二者皆无即信号（处理器缺失/静默失败不再放行）。
    //     operlog 等页导出前先弹字段选择对话框，点其确定后才会真正下载。
    const expBtn = page
      .locator('.el-button:visible')
      .filter({ hasText: /^\s*导\s*出\s*$/ })
      .first()
    if (await expBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      act.exp = 1
      const errBeforeExp = msgs.length + pageErrors.length
      const dlP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
      const respP = page
        .waitForResponse((r) => /export|template/i.test(r.url()) && r.status() === 200, { timeout: 15000 })
        .catch(() => null)
      await expBtn.click({ timeout: 1500 }).catch(() => {})
      await sleep(800)
      const dlgOk = page
        .locator('.el-dialog:visible .el-dialog__footer button, .el-message-box:visible button')
        .filter({ hasText: /确\s*定|导\s*出|下\s*载/ })
        .last()
      if (await dlgOk.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dlgOk.click().catch(() => {})
      }
      const dl = await dlP
      const rs = await respP
      if (dl || rs) {
        act.expOk = 1
      } else {
        const withErr = msgs.length + pageErrors.length > errBeforeExp ? '，伴随交互期错误' : ''
        msgs.push(`[interact] 「导出」点击后无 download 事件、无 export 200 响应（导出链路静默失效${withErr}）`)
      }
      await dismissOverlays(page)
    }
    await sleep(800)
  }

  // 业务错误检测：读取本阶段捕获的 JSON 响应体，筛出 HTTP 200 但 code!=200 的失败封套。
  // resp.json() 在响应体永不完成时会永久 pending（catch 只捕 reject 不防挂起）→ 5s 硬超时竞速。
  const jsonToCheck = jsonResp
  jsonResp = []
  for (const resp of jsonToCheck) {
    const body = await withHardTimeout(resp.json().catch(() => null), 5000, `读取响应体 ${resp.url()}`).catch(
      () => null
    )
    if (body && !isBizSuccess(body)) {
      bizErr.push(
        `${resp.request().method()} ${resp.url()} -> code=${body.code} msg=${String(body.msg || '').slice(0, 80)}`
      )
    }
  }

  const overlay = await page
    .evaluate(
      ({ ns, exts, tlds, skipI18n }) => {
        const out = { toasts: [], dialogs: [], i18nLeaks: [], brokenImages: [] }
        const nsSet = new Set(ns)
        const extSet = new Set(exts)
        const tldSet = new Set(tlds)
        document.querySelectorAll('.el-message, .el-notification').forEach((el) => {
          const t = el.textContent.trim()
          if (!t) return
          // 类型类名优先（轮1修正）：Element Plus 按 type 挂 el-message--{success|info|warning|error}。
          // 有明确类型类时以类名为准——success/info 即使文案含「失败」字样（如"0 项失败"）也是良性，
          // 不再被文本正则误判为异常；仅"无类型类"的裸 toast 退化为文本启发式判定。
          const typeClass = ['success', 'info', 'warning', 'error'].find((ty) =>
            [...el.classList].some((c) => c === `el-message--${ty}` || c === `el-notification--${ty}`)
          )
          const isError =
            typeClass === 'error' || typeClass === 'warning' || (!typeClass && /错误|失败|异常|error|fail/i.test(t))
          const isBenign = typeClass === 'success' || typeClass === 'info'
          if (isError && !isBenign) out.toasts.push(t)
        })
        // MessageBox / 可见 Dialog 标题与正文（不改状态，仅读取已弹出的内容）
        document.querySelectorAll('.el-message-box__message, .el-message-box__title').forEach((el) => {
          const t = el.textContent.trim()
          if (t) out.dialogs.push(`[msgbox] ${t}`)
        })
        document.querySelectorAll('.el-dialog').forEach((el) => {
          // 关闭后的 el-dialog 会以 .el-overlay{display:none} 残留在 DOM（Element Plus 非
          // destroy-on-close 的常态，尤其 append-to-body）。只看 .el-dialog__wrapper 会漏判、
          // 把已关闭的对话框误报成信号。以"是否有布局盒 + 最近浮层容器是否 display:none"为准。
          const box = el.closest('.el-dialog__wrapper, .el-overlay')
          if (box && getComputedStyle(box).display === 'none') return
          if (el.getClientRects().length === 0) return
          const title = el.querySelector('.el-dialog__title')
          const t = (title ? title.textContent : el.textContent).trim()
          if (t) out.dialogs.push(`[dialog] ${t.slice(0, 120)}`)
        })
        // #10 i18n 泄漏：扫可见文本里"命名空间.子键"裸键（词条缺失时 vue-i18n 回退渲染键本身）。
        if (!skipI18n) {
          const text = document.body.innerText || ''
          const re = /[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+/g
          const seen = new Set()
          let mm
          while ((mm = re.exec(text))) {
            const tok = mm[0]
            // URL/路径上下文（前一个字符是 : / . 或紧跟在 www. 后）不计——它们是真实链接不是键。
            const prev = text[mm.index - 1]
            if (prev === ':' || prev === '/' || prev === '.') continue
            const parts = tok.split('.')
            // 任一段命中真实命名空间即视为疑似 i18n 键——这样能抓到"错误前缀"型泄漏
            // （如页面写成 t('monitor.server.x') 而目录实为顶层 server.x），比只看首段更鲁棒。
            if (!parts.some((p) => nsSet.has(p))) continue
            if (parts.some((p) => extSet.has(p.toLowerCase()))) continue
            if (tldSet.has(parts[parts.length - 1].toLowerCase())) continue
            if (seen.has(tok)) continue
            seen.add(tok)
            out.i18nLeaks.push(tok)
            if (out.i18nLeaks.length >= 30) break
          }
        }
        // #11 图片解码失败：可见 <img> 已 complete 但 naturalWidth=0（200 却内容坏/被 fallback 顶成 HTML）。
        document.querySelectorAll('img').forEach((img) => {
          const src = img.currentSrc || img.src
          if (!src || src.startsWith('data:')) return
          const visible = img.offsetWidth > 0 || img.offsetHeight > 0 || img.getClientRects().length > 0
          if (visible && img.complete && img.naturalWidth === 0) {
            if (out.brokenImages.length < 15) out.brokenImages.push(src.slice(0, 120))
          }
        })
        return out
      },
      { ns: [...I18N_NS], exts: [...DOTTED_EXTS], tlds: [...DOTTED_TLDS], skipI18n: I18N_LEAK_SKIP.has(route) }
    )
    .catch(() => ({ toasts: [], dialogs: [], i18nLeaks: [], brokenImages: [] }))
  // 用真实 404 页根元素类名判定，避免 changelog 等页面正文含 "404问题" 字样造成的误报
  const p404 = await page.evaluate(() => !!document.querySelector('.wscn-http404-container')).catch(() => false)
  page.removeListener('console', onConsole)
  page.removeListener('pageerror', onPageError)
  page.removeListener('requestfailed', onFail)
  page.removeListener('response', onResponse)
  results.push({
    route,
    p404,
    console: [...msgs],
    pageErrors: [...pageErrors],
    requestsFailed: [...reqFail],
    badResponses: [...badResp],
    bizErrors: [...bizErr],
    toasts: overlay.toasts,
    dialogs: overlay.dialogs,
    i18nLeaks: overlay.i18nLeaks,
    brokenImages: overlay.brokenImages,
    act
  })
  const flagCount =
    msgs.length +
    pageErrors.length +
    reqFail.length +
    badResp.length +
    bizErr.length +
    overlay.toasts.length +
    overlay.dialogs.length +
    overlay.i18nLeaks.length +
    overlay.brokenImages.length +
    (p404 ? 1 : 0)
  const actStr = INTERACT
    ? ` interact[ro=${act.ro} add=${act.add}/${act.addOpen} view=${act.view}/${act.viewOpen} exp=${act.exp}/${act.expOk}]`
    : ''
  console.log(
    `[${route}] sig=${flagCount} console=${msgs.length} pageErr=${pageErrors.length} reqFail=${reqFail.length} http>=400=${badResp.length} biz=${bizErr.length} toast=${overlay.toasts.length} dialog=${overlay.dialogs.length} i18nLeak=${overlay.i18nLeaks.length} brokenImg=${overlay.brokenImages.length} 404=${p404}${actStr}`
  )
}

// 汇总输出（抽成函数供正常收尾 / watchdog / 浏览器断连三处复用——任何异常退出都必须
// 把已采集内容落日志，避免"跑了几十分钟、一无所获且无任何输出"）
function printSummary() {
  console.log('\n===== 采集汇总 =====')
  let total = 0
  for (const r of results) {
    const sig =
      r.console.length +
      r.pageErrors.length +
      r.requestsFailed.length +
      r.badResponses.length +
      (r.bizErrors ? r.bizErrors.length : 0) +
      r.toasts.length +
      r.dialogs.length +
      (r.i18nLeaks ? r.i18nLeaks.length : 0) +
      (r.brokenImages ? r.brokenImages.length : 0) +
      (r.p404 ? 1 : 0)
    if (sig) {
      total++
      console.log(`\n### ${r.route}  (404=${r.p404})`)
      r.console.forEach((m) => console.log(`  CONSOLE ${m}`))
      r.pageErrors.forEach((m) => console.log(`  PAGEERROR ${m}`))
      r.requestsFailed.forEach((m) => console.log(`  REQFAIL ${m}`))
      r.badResponses.forEach((m) => console.log(`  HTTP ${m}`))
      ;(r.bizErrors || []).forEach((m) => console.log(`  BIZERR ${m}`))
      r.toasts.forEach((m) => console.log(`  TOAST ${m}`))
      r.dialogs.forEach((m) => console.log(`  DIALOG ${m}`))
      ;(r.i18nLeaks || []).forEach((m) => console.log(`  I18NLEAK ${m}`))
      ;(r.brokenImages || []).forEach((m) => console.log(`  BROKENIMG ${m}`))
    }
  }
  console.log(`\n有信号的路由数: ${total}/${results.length}`)
  if (INTERACT) {
    const sum = results.reduce(
      (a, r) => {
        a.ro += r.act.ro
        a.add += r.act.add
        a.addOpen += r.act.addOpen
        a.view += r.act.view
        a.viewOpen += r.act.viewOpen
        a.exp += r.act.exp
        a.expOk += r.act.expOk
        return a
      },
      { ro: 0, add: 0, addOpen: 0, view: 0, viewOpen: 0, exp: 0, expOk: 0 }
    )
    console.log(
      `交互动作覆盖：只读点击 ${sum.ro} 次；新增按钮 ${sum.add} 页(打开对话框 ${sum.addOpen})；行内编辑/查看 ${sum.view} 页(打开对话框/抽屉 ${sum.viewOpen})；导出 ${sum.exp} 页(物证 ${sum.expOk})`
    )
  }
}

async function main() {
  // ROUTE_ONLY="/tool/build,/tool/http-debugger" 可只跑指定路由（子串匹配），用于定向复验
  const routeOnly = (process.env.ROUTE_ONLY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const routesToScan = routeOnly.length ? ROUTES.filter((r) => routeOnly.some((f) => r.includes(f))) : ROUTES

  // 全局 watchdog：无论任何挂起，到时强制输出汇总退出（不依赖 Playwright 驱动层）
  const GLOBAL_MS = 45 * 60 * 1000
  const globalTimer = setTimeout(() => {
    console.error(`\n[watchdog] 全局 ${GLOBAL_MS / 60000} 分钟上限到达，强制收尾`)
    printSummary()
    process.exit(2)
  }, GLOBAL_MS)

  const MAX_RESTARTS = 3
  let browser = null
  let page = null
  let restarts = 0
  let consecutiveTimeouts = 0

  // 会话（浏览器 + 登录态）构建：浏览器被环境偶发清除/驱动挂死后重建续扫，
  // 而不是半途中止（2026-09-24 实测两次 chrome-headless-shell 中途消失事故）
  const bootstrap = async () => {
    if (browser) await browser.close().catch(() => {})
    browser = await chromium.launch({ headless: true })
    // 断连只记日志：由循环顶部的 isClosed 检测/超时 catch 走重建路径，不再直接退出
    browser.on('disconnected', () => console.error('[watchdog] 浏览器连接断开（将按需重建会话续扫）'))
    const context = await browser.newContext()
    page = await context.newPage()
    const ok = await login(page)
    console.log(`\n登录: ${ok ? '成功' : '失败'}\n`)
    if (!ok) throw new Error('登录失败，无法继续采集')
  }

  try {
    await bootstrap()
    for (const route of routesToScan) {
      // 会话失效检测：断连/页面关闭 → 重建（次数有界，防无限循环）
      if (browser.isClosed?.() || page.isClosed()) {
        if (++restarts > MAX_RESTARTS) {
          console.error(`[watchdog] 会话重建次数耗尽（${MAX_RESTARTS}），终止采集`)
          break
        }
        console.error(`[watchdog] 浏览器会话失效，重建并重新登录（第 ${restarts}/${MAX_RESTARTS} 次）`)
        await bootstrap()
      }
      try {
        await withHardTimeout(scanPage(page, route), 75000, `扫描 ${route}`)
        consecutiveTimeouts = 0
      } catch (err) {
        console.error(`  ${err.message} → 跳过 ${route}`)
        results.push({
          route,
          p404: false,
          console: [`[watchdog] ${err.message}`],
          pageErrors: [],
          requestsFailed: [],
          badResponses: [],
          bizErrors: [],
          toasts: [],
          dialogs: [],
          i18nLeaks: [],
          brokenImages: [],
          act: { ro: 0, add: 0, addOpen: 0, view: 0, viewOpen: 0, exp: 0, expOk: 0 }
        })
        // 驱动挂死/断连 → 重建会话续扫；连续 2 页超时也强制重建（单页偶发不重建）
        if (browser.isClosed?.() || ++consecutiveTimeouts >= 2) {
          consecutiveTimeouts = 0
          if (++restarts > MAX_RESTARTS) {
            console.error(`[watchdog] 会话重建次数耗尽（${MAX_RESTARTS}），终止采集`)
            break
          }
          console.error(`[watchdog] 扫描超时/断连后重建会话（第 ${restarts}/${MAX_RESTARTS} 次）`)
          await bootstrap()
        }
      }
    }
  } finally {
    clearTimeout(globalTimer)
    printSummary()
  }
  await browser?.close().catch(() => {})
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
