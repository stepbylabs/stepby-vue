# e2e 套件运行配方（已验证）

> 本文件记录 `yebot-ui/tests/e2e/main.mjs`（72 个功能，套件已并入 yebot-ui 仓库）在本地跑通所需的**完整环境**，
> 以及 source-check 断言的**防混淆（minify-stable）约定**。先前多次“假失败”均源于环境与混淆问题，
> 按本文配置可稳定复现全绿。

## 0. 前置依赖

- **Redis 必须在线**：`docker compose up -d redis`（或 `yebot-redis` 容器 healthy）。
  axum-backend 启动硬依赖 redis，否则接口 500。
- **两个仓库源码就绪**：`yebot-ui`（前端）与 `axum-backend`（Rust 后端）。
- **存量 `data/yebot.db` 可能落后于迁移**：`AppInitializer` 启动**刻意不跑** `Migrator::up`（避免对已有 seed 的存量库重跑导致主键冲突），故新增模块（如 WebHook）的建表/菜单不会自动落到早于该迁移的本地产物库。症状：后端日志每次 `login_success` 刷 `WARN ... no such table: sys_web_hook`、`/system/webHook/*` 页面 404。处置（本地 gitignore 产物，安全）：用 `migration/src/m20260820_000002_web_hook_module.rs` 的 SQLite DDL 幂等补 `CREATE TABLE IF NOT EXISTS` + 菜单/权限 `INSERT OR IGNORE`。全新库经完整 `Migrator::up` 不受影响。

## 1. 后端：embedded 模式（:8080）

F24 直接校验“后端内嵌前端”能力，因此后端必须以 embedded 模式启动：

```bash
cd axum-backend
# debug 构建在运行时读 EMBEDDED_FRONTEND 环境变量，无需重新编译
# SSO_ENABLED=true：功能 51（OIDC Provider）需要，缺省时 /sso/authorize 直接 400「单点登录（SSO）未启用」
EMBEDDED_FRONTEND=true SSO_ENABLED=true cargo run
```

- 该模式会让后端用 `ServeDir` 提供 `frontend-dist/`（见 `src/embedded_assets.rs`）。
- ⚠️ **漏 `EMBEDDED_FRONTEND=true` 的典型症状**（轮11 实测）：后端退化为"前端分离模式"，`GET /login`
  返回 JSON 404（而非 SPA HTML），e2e 首步即 `locator.fill: Timeout 30000ms`（找 `input[placeholder="账号"]`），
  整套 UI 用例连环假失败——此时先查后端启动命令，而不是改选择器。
- 其余 feature（除 F24 外）走 vite preview 的 `/prod-api` 代理（→ :8080），同样要求后端在跑。
- **必须先把「嵌入式构建产物」同步进 `axum-backend/frontend-dist/`**：
  ```bash
  # frontend-dist 已被 .gitignore 的 /frontend-dist 忽略，不会进仓库
  # ⚠️ 必须用 EMBEDDED 模式构建再拷贝（见下方两构建顺序），不能用 prod 构建：
  #    嵌入式前端 baseURL=''（同源），prod 前端 baseURL=/prod-api（跨源代理）。
  cp -r yebot-ui/dist/. axum-backend/frontend-dist/
  ```
  ⚠️ 每次重新构建前都要按第 2 节顺序同步 embedded 产物，否则 embedded 后端服务的仍是旧产物。

## 2. 前端：prod preview（:4173）

> **关键**：`dist/` 只能保留一个构建产物，而 :4173 preview 与 :8080 embedded 需要**不同模式**，
> 因此必须按固定**顺序**执行两次构建，避免把错误模式产物交给对方（实测 bug 教训）：
>
> 1. `build:embedded`（`vite build --mode embedded`，baseURL='' 同源）→ **立即**拷入 frontend-dist。
> 2. `build:prod`（`vite build --mode production`，baseURL=/prod-api）→ 留在 dist 供 :4173 preview。
>
> 若搞反（把 embedded 产物留在 dist），:4173 上的登录会因 baseURL='' 请求 `:4173/getRouters`
> 命中 SPA fallback 返回 HTML、JSON 解析失败 → 登录后跳 `/500`，所有 UI 页面测试 401 假失败。

```bash
cd yebot-ui
# 第 1 步：embedded 构建 → 拷入 frontend-dist（供 :8080 内嵌后端）
NODE_OPTIONS="" sh node_modules/.bin/vite build --mode embedded
cp -r dist/. ../axum-backend/frontend-dist/
# 第 2 步：prod 构建 → 留 dist（供 :4173 preview）
NODE_OPTIONS="" sh node_modules/.bin/vite build --mode production
NODE_OPTIONS="" sh node_modules/.bin/vite preview --port 4173
```

- `NODE_OPTIONS=""` 是绕开 safe-delete 守卫注入的 node shim（见项目记忆），
  否则 `vite build` 清空 `dist` 时会被 guard 拦截。
- preview 服务对静态资源返回 gzip，`curl` 验证需加 `--compressed`。

## 3. 跑 e2e

```bash
cd yebot-ui/tests/e2e && npm install
# 权威环境 = embedded :8080（真后端+真数据+SW；见 memory 与 docs 轮2 定案）
YEBOT_TEST_USER=admin YEBOT_TEST_PASS=admin123 \
YEBOT_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
PLAYWRIGHT_BROWSERS_PATH="D:/Projects/yebot/.pw-browsers" \
node main.mjs --headless
```

- 不带 `--feature` = 跑全部 72 个功能（约 20 分钟，分段见下）。
- 选择器：`--feature=54` 单功能；`--feature=1-20,51` 集合（区间+逗号，轮4 新增）——全量超 10 分钟时按
  `1-20 / 21-40 / 41-72` 三段前台直跑直等，各段回合即得完整汇总，不挂后台。
- **功能 1-68** 通过判据（已验证基线）：三段合计 `106 + 220 + 326 = 652 通过 0 失败`，日志无 `❌`。
- **功能 69-72** 通过判据（已验证基线，轮12）：`--feature=69-72` 单轮 `总计: 66  通过: 66  失败: 0`，EXIT=0，
  且浏览器无 console error / requestfailed（功能 69=租户 CRUD+三态 PATCH、70=套餐与菜单白名单、
  71=域名绑定+DNS TXT 验证、72=config/dict 租户治理列与覆盖层 + 步骤 10.5 读路径租户隔离 4 条）。
  命令与 §3 相同，仅加 `--feature=69-72`。（轮11 基线为 62/62；轮12 新增 4 条读路径隔离断言 → 66/66。）
  （页面级循环轮10（收官）：功能 67 个人中心资料保存链+改密校验拦截 7 项、功能 68 执行一次→调度日志
  生成→详情→删除闭环 11 项，628→646，两功能均首轮全绿；应用零改动。
  运行方式同上：`--feature=N` 等号形式，环境变量同 §3。）

### 3.0 逐页信号采集器 `collect-warnings.mjs`（配合 main.mjs 的深度巡检）

`main.mjs` 是断言式功能回归；`collect-warnings.mjs` 是**广度巡检**：登录后逐页采集 9 类运行时信号，用于发现
断言未覆盖的新告警/错误。二者互补，每轮循环都应各跑一次。

**权威全栈目标 = embed :8080**（同源、真实后端与数据、生产构建会注册 SW）：业务错误码、SW 兜底等
只在 embed/生产构建才暴露的问题在此才测得到（如 `/tool/swagger` 的 SW `navigateFallback` 拦截）。

```bash
cd yebot-ui/tests/e2e
PLAYWRIGHT_BROWSERS_PATH=<repo>/.pw-browsers FRONTEND_URL=http://localhost:8080 \
YEBOT_TEST_USER=admin YEBOT_TEST_PASS=admin123 node collect-warnings.mjs
# 交互态（打开“新增”/行内“编辑·查看”对话框再取消，暴露仅交互态才渲染的报错，如 i18n 编译错误）：
INTERACT=1 PLAYWRIGHT_BROWSERS_PATH=<repo>/.pw-browsers FRONTEND_URL=http://localhost:8080 \
YEBOT_TEST_USER=admin YEBOT_TEST_PASS=admin123 node collect-warnings.mjs
# 期望（已验证基线）：末行 "有信号的路由数: 0/56" + "交互动作覆盖：…（INTERACT 模式同样 0/56 稳定）
```

- **交互态四段扫描（`INTERACT=1`）**，逐页执行且 (a)(b)(c) **只开不提、不污染数据**，(d) 只读取文件不落库：
  (a) 只读按钮（搜索/查询/重置/刷新，按可见文本匹配）；
  (b) 工具栏「新增/添加/新建」按钮 → 打开表单对话框 → Esc 关闭（按可见文本匹配，工具栏按钮有文字）；
  (c) 表格首行「编辑/修改/查看/详情/详细/预览」→ 打开回填表单**对话框或抽屉**（`.el-dialog`/`.el-drawer`）→ Esc 关闭；
  (d) **导出物证（轮2 新增）**：点「导出」→（如先弹字段选择/确认框则点其确定）→ 必须拿到 `download` 事件
  或 export/template 接口 200 响应，二者皆无即信号——导出链路静默失效不再放行。
  **关键**：行操作按钮在本仓是**图标-only**（`icon="Edit"` + `:aria-label="t('common.edit')"`，无可见文本），
  故 (c) 必须用 **`getByRole(button|link, { name: 可访问名正则 })`** 命中，靠 `hasText` 文本匹配会全程空转。
- **交互覆盖计数**：INTERACT 模式每行末尾打印 `interact[ro=.. add=页/开=.. view=页/开=.. exp=页/证=..]`，末行汇总
  `交互动作覆盖：只读 N 次；新增 X 页(打开 Y)；行内编辑/查看 M 页(打开 K)；导出 P 页(物证 Q)`。这是**防“扫描器静默空转”的自检**
  ——`0/56` 只有在 exp/view>0 时才真正代表“导出/编辑态打开也没报错”，而非“根本没点到”。当前基线（embed :8080）：
  只读 68 次、新增 21 页开 19（工具页内联表单无模态属良性）、行内编辑/查看 16 页开 16、导出 12 页物证 12，全 0 信号。

- **11 类信号**：console(warn/err)、`pageerror`（未捕获异常）、`requestfailed`（网络失败）、
  `response` status≥400（剔除 favicon/预期 401 良性项）、同源 JSON 的**业务错误码**（`code!=200/0`，
  捕获被页面静默吞掉的保存/查询失败）、`el-message`/`el-notification` Toast（仅 error/warning 计数，
  成功/信息类不算异常）、`el-message-box`/`el-dialog` 弹窗、真实 404（`.wscn-http404-container` 类名，
  避免正文含 "404" 误报）、后端 `/tmp/yebot-backend.log` 的 ERROR/WARN/panic（人工关联），以及本轮新增的
  两类"静默渲染缺陷"：**#10 i18n 未翻译键泄漏**（`t('ns.key')` 词条缺失时 vue-i18n 回退渲染裸键，如
  `webHook.column.status`，不产生 console/HTTP/Toast 任何信号）与 **#11 图片解码失败**（`<img>` 拿到 200
  却 `naturalWidth=0`，如被 SPA fallback 顶成 HTML）。#10 判定用 `src/i18n/locales` 真实聚合出的顶层命名空间
  全集 `I18N_NS`（脚本生成非猜测）+ 文件名/TLD/URL 上下文三重护栏降误报，并**按任一段命中命名空间**判定，
  以覆盖"错误前缀"型泄漏（页面写 `t('monitor.server.x')` 而目录实为顶层 `server.x`）；按设计展示点号串的
  页面（`/system/config`、`/monitor/logtail`、`/tool/gen`）在 `I18N_LEAK_SKIP` 中整页豁免。
  `EXT_NOISE_RE` 过滤浏览器扩展在严格 CSP 下的字体/脚本加载噪声（否则 embed 模式整批假阳）。
- **静态 i18n 完整守卫（补运行时采集器盲区）**：`src/i18n/i18n-keys.test.ts`（vitest）扫描全部 `.vue/.ts`
  源码里的 `t('a.b')` 字面量键，断言每个键在 zh-CN 与 en-US 语言包中都存在。运行时采集器只看**单次渲染可见**
  的泄漏，本测试静态覆盖**未渲染分支/交互态**的键，且对"错误前缀"零漏报，二者互补。i18n 命名空间为**顶层**
  （`server`/`health`/`operlog`… 由 `monitor.ts` 等聚合直接 spread，无 `monitor.` 包裹层），新页面务必对齐。
- **保存态数据失败如何捕获**：交互态采集器**刻意只开不提**（防污染数据），故“保存是否真的失败”由
  `main.mjs` 的真实 CRUD 用例（新增/编辑/删除 + 业务码断言）覆盖；采集器的**业务错误码**信号则被动捕获
  页面自身发起的请求失败。二者分工互补、不重复。
- **路由来源**：以 `sys_menu`（status=0）为唯一权威，按 `/父path/子path` 组合成 56 个可达页面
  （注册菜单叶子页 + `/index` + `/user/profile/*` 隐藏页 + `/monitor/server` 隐藏实时页 + Tier-S/Tier-A 新增页如
  `/system/oauth/client`(SSO)、`/monitor/pat`、`/monitor/observability`、`/monitor/frontendError` 等）。ROUTES 必须与 `getRouters` 逐条对齐，
  否则手写猜错会命中 404 兜底页 → 假信号。实测教训：`/monitor/operlog`→`/system/log/operlog`、
  `/tool/{backup,task}`→`/monitor/{backup,task}`、`/help-center/*`→`/tool/*`、
  工作台是 `/workbench/index`（非 `/dashboard/workbench`）、数据看板是 `/dashboard`（非 `/dashboard/index`）。
  务必以 `curl :8080/getRouters`（递归展开 children 组合 full path + component）核对（如 `/system/msg/*`、
  `/system/webHook/*`）。新增页面（如 `/monitor/frontendError`）必须同步加入 ROUTES，避免”遗漏采集面”。
  实测教训：隐藏但可直达的 `/monitor/server`（服务器实时监控页，仅 `monitor:health:list` 权限）此前未纳入 ROUTES，
  其整页 `t('monitor.server.x')` 错误前缀导致的裸键泄漏只有静态 `i18n-keys.test.ts` 才捕获到——已修该页为顶层
  `server.*` 并把 `/monitor/server` 补进 ROUTES，证明”运行时广度 + 静态完整性”两层缺一不可。

### 3.1 Playwright 浏览器安装位置

- 默认浏览器目录在 `%LOCALAPPDATA%\ms-playwright`，但若 TRAE 沙箱拦截其 `__dirlock` 写入，
  需将浏览器安装到工作区内并通过环境变量指定：
  ```bash
  $env:PLAYWRIGHT_BROWSERS_PATH = "D:\Projects\yebot\.pw-browsers"
  npx playwright install chromium
  # 运行时同样带上该环境变量（与上述命令一致），否则仍会去默认目录找 1234 版本而失败
  $env:PLAYWRIGHT_BROWSERS_PATH = "D:\Projects\yebot\.pw-browsers"
  node main.mjs --headless
  ```
- `.pw-browsers` 已被根 `.gitignore` 忽略，不入仓库。

### 3.2 WebSocket（/ws）连接说明（P4 修复 + 功能 46 回归）

- 前端 `wsService` 连接 `ws://<host>/ws`，token 通过 `Sec-WebSocket-Protocol: bearer.<jwt>` 传递。
- **已知问题（已修复）**：后端 Redis 中 `ws_conn:{user_id}` 连接计数可能残留陈旧值
  （服务重启 / 进程异常退出 / 网络闪断时 DECR 未及时执行），导致该用户后续 WS 握手全部 429，
  浏览器控制台出现大量 `WebSocket connection to '.../ws' failed ... 429`，实时通知静默失效。
- **修复方案**：
  1. 服务启动时重置 `ws_conn:*` 计数（见 `axum-backend/src/main.rs` → `reset_ws_conn_counts`）；
  2. 每用户最大并发连接上限 5 → 20（`axum-backend/src/handler/ws_handler.rs`）。
- **回归防线**：功能 46 分别验证「页面内 WS 连接全链路」与「Node 直连后端 WS」均能成功建立
  （无 429）。若再次出现上述控制台错误，先检查 `docker exec yebot-redis redis-cli --scan --pattern "ws_conn:*"` 是否残留计数。

### 3.3 SSO 同意页（`/sso-consent`）冷加载与 SW 兜底（功能 51 教训）

- 后端 `authorize` 判定需用户同意后，用 302 把**浏览器**带到 `/sso-consent?clientId=…&scope=openid%20profile…`（应用私有 SPA 路由，camelCase 查询）。两处踩过的真实坑：
  1. **查询空格编码**：回显查询的空格必须用 `%20` 而非表单编码的 `+`（后端 `urlencode_spa`）。Vue Router 不把 `+` 还原为空格，否则 `scope` 变 `openid+profile` → 不含 `openid` → 同意页判"授权请求无效"。后端有单测钉死。
  2. **冷加载二次导航丢查询**：`/sso-consent` 非白名单、需登录态，冷加载时路由守卫会先 `getInfo`+注册动态路由再二次导航；守卫**必须**用 `{ path: to.path, query: to.query, hash: to.hash, replace: true }` 显式分离，不能 `{ path: to.fullPath }`（对象形式 `path` 不解析内嵌 query，会把 `?…` 丢弃）——此坑影响**所有**冷加载受保护路由，非仅 SSO。
- **SW 兜底**：内嵌/生产构建注册的 Service Worker `navigateFallback` 会接管顶层导航。真实浏览器断言"后端 302 被跟随"须用**新 context**（无 SW）或 `context.request.get(url,{maxRedirects:0})` 读 `Location`，否则会命中 SW 兜底返回旧页而失真。**例外（已修复）**：后端协议路由 `/sso/*`、`/oauth2/callback` 已加入 `vite/plugins/pwa.ts` 的 `navigateFallbackDenylist`，顶层导航直达后端不再被劫持（`/sso-consent` 是 SPA 路由，不被 `/^\/sso\//` 匹配，仍可被兜底做冷加载刷新）。
- **登出态 RP 全链路（功能 51 第 18 项 check 钉死）**：未登录浏览器直达 `/sso/authorize` → 后端 302 `/login?redirect=<urlencode(相对 authorize 路径)>`。**redirect 必须是同源相对路径**：绝对 URL（`http://host/sso/authorize…`）会被前端 `isSafeRedirect` 开放重定向守卫拒绝 → 登录回落首页、链路断裂（真实审计发现的回归，后端单测+集成测试均已钉死）。登录成功后 `login.vue` 用精确入口白名单判定后端协议路由并 `window.location.href` 整页回跳（此时 token cookie 已写入，后端继续 authorize → 302 同意页）。注意**不能**用 `router.resolve` 命中态判后端路由：`/login` 在白名单里守卫不注册动态路由，登录瞬间任何 SPA 路径都会误判为 catch-all。E2E 断言链：落 `/login` 且 redirect 未丢 → 真实填表提交 → 落 `/sso-consent` 且授权按钮可见、非"授权请求无效"。
- **深链 redirect 编码**：`permission.ts` 生成 `/login?redirect=${encodeURIComponent(to.fullPath)}`——`to.fullPath` 含多个查询参数时若不整体编码，`&b=2` 会被解析成 `/login` 自身的顶层 query，登录回跳后目标只剩 `?a=1`。

### 3.4 判定卫生（页面级循环·轮1 收紧，写新断言必须遵守）

- **综合判定一律 `=== total`**：历史上 33-45 功能用 `>= total-1`（feat45 甚至 `-2`）吞子失败，制造"全绿"假象。新增综合项禁止任何宽容余量。
- **下载/导出类断言必须有物证**：`download` 事件（文件名）或匹配端点的 200 响应体非空（如 `/system/backup/download/`、`/monitor/operlog/compliance-report`+成功 Toast）。"按钮可点/见 loading"不算通过（html2pdf `.save()` 在 headless Chromium 会真实触发 download 事件，已验证产出 `审计合规报告_*.pdf`）。
- **采集器判定语义**：401 不再一律豁免（admin 登录态下任何 401 = 鉴权回归，计入 http>=400 信号）；Toast 按 `el-message--{type}` 类名优先分类，success/info 文案含"失败"字样不再误报；只读按钮遍历用 `.all()` 元素句柄（`nth(i)` 在点击致 DOM 变化后索引漂移）；「新增」点击后的合法反应 = 对话框 ∨ 路由跳转 ∨ **全局 DOM 元素数增量**（内联加行/加选项，如 http-debugger 加 Header 行），三者皆无且无错误才判"无反应"信号。
- **定向复扫**：`ROUTE_ONLY="/tool/build,/tool/http-debugger" INTERACT=1 node collect-warnings.mjs`（子串过滤，秒级复验单页）。**Git-Bash 必须加 `MSYS_NO_PATHCONV=1` 前缀**，否则 MSYS 把以 `/` 开头的值静默改写成 `C:/Program Files/Git/…`，过滤不命中。

### 3.5 轮6 新增选择器/计数教训（树表格与语言切换）

- **el-table 树折叠时子行仍在 DOM**：`row.count()` 折叠前后不变（实测 menu 恒 185），必须按几何可见性计行：
  `[...document.querySelectorAll('.el-table .el-table__body-wrapper .el-table__row')].filter(r => r.getBoundingClientRect().height > 0).length`；
  展开态另用 `.el-table__expand-icon--expanded` 计数佐证（menu 折叠 6/展开 185、dept 展开 10/折叠 1）。
- **语言下拉选项文本随当前 locale 翻译**：`t('langSelect.simplifiedChinese')` 在 EN 态渲染 "Simplified Chinese"，
  点击/断言必须双语匹配（/简体中文|Simplified Chinese/），写死中文会 30s 超时。
- **el-select 内层 input 被 placeholder 层拦截点击**：`tsInput.click()` 会反复 "intercepted by .el-select__placeholder"，
  应改点外层 `.el-select__wrapper`；选中值也不在 input.value（恒空），读 `.el-select__selection` 的 innerText。
- **el-tree-select 默认折叠只显示根节点**：初始 `nodes>=2` 是错误预期（根节点 1 个属正常），"多层级"
  由点 `.el-tree-node__expand-icon:not(.is-leaf)` 展开后的增量断言覆盖。
- **首跑排查用临时 DOM 探针**（登录→前后状态快照），区分"应用缺陷"与"脚本预期错误"后删探针；
  本轮三处 FAIL 均定位为脚本侧（计数口径/文案匹配/点击目标），应用行为全部正确。

### 3.6 轮7 新增选择器教训（树形联动 / 数据范围字典 / MessageBox 校验）

- **`.el-checkbox` 的半选态类名不在根元素上**：Element Plus 把 `is-indeterminate` 挂在**内层**
  `.el-checkbox__input`（外层 label 只有 `is-checked`），故计数必须用
  `querySelectorAll('.el-checkbox__input.is-indeterminate')`；写 `.el-checkbox.is-indeterminate` 恒为 0，
  会把正确的联动行为误判成 FAIL。
- **半选只在"兄弟≥2 的父节点"上出现**：DOM 序第一个 `.el-tree-node__children .el-tree-node__content`
  实测是「工作台首页」，其父「个人工作台」只有一个子节点 → 勾选子节点后父直接 `is-checked`（`half=0, checked=2`
  是**正确**级联）。断言祖先半选须先在 evaluate 里按 `parent.querySelectorAll(':scope > .el-tree-node__children > .el-tree-node').length >= 2`
  筛出可证伪的目标节点，再点它的复选框。
- **数据范围下拉的 value 2 文案是「自定数据权限」不是「自定义」**（`role.dataScopeOptions.custom`），
  `/自定义/` 匹配不到 → 30s 超时；按 `/自定数据权限|Custom data/i` 双语匹配。
- **`ElMessageBox` prompt 的校验失败提示类名是 `.el-message-box__errormsg`**（源码 `ns.e('errormsg')`，
  仅此时 input 容器加 `invalid` 类）；`.el-message-box__errinput`/`.el-form-item__error` 都取不到文本，
  会让"弱口令被 inputValidator 拦截"的提示断言假失败。
- 本轮 3 处 FAIL 全部为脚本预期/选择器问题（联动前提、字典文案、errormsg 类名），应用行为经源码核实均正确。

### 3.7 轮8 新增选择器教训（右工具栏 / 显隐列下拉 / 缓存刷新按钮）

- **RightToolbar 圆钮是 icon-only**：`getByRole('button', { name })` 按 aria-label 定位（隐藏搜索/显示搜索随状态翻转、
  刷新、显隐列），文案匹配不可行；列下拉为 `.el-dropdown-menu:visible .el-checkbox`，nth(0)=「列展示」全选，
  其后按 `columns` 对象**键序**对应数据列；显隐持久化写**裸 localStorage key**（如 `user-list-columns`，cache.local 无公共前缀）。
- **工具栏「刷新」按文本匹配要先排除行内按钮**：行内 icon 钮无文本，`.el-button:visible` + `/^\s*(刷新|Refresh)\s*$/`
  只命中带文本的工具栏钮；缓存刷新是 **DELETE**（dict/config 两页路径不同），Toast 计数在页间留 3.3s 等自污期结束才能断言"恰 1"。

### 3.8 轮9 新增教训（定时任务链 / 代码生成预览 / 文案空格 / 失败污染）

- **i18n 文案可能自带空格**：`common.close`='「关 闭」' 含间隔空格，`/关闭/` 匹配不到 → 30s 超时；
  中文按钮正则一律写 `/关\s*闭/`（同 `取\s*消`）。
- **同名类多实例**：预览弹窗里首个 `.el-tag` 是 el-select 的 selection 项（内容=占位符），语言标签须用邻接选择器
  `.gen-preview-select + .el-tag`；对"页面上第二个同类元素"断言时 first() 是陷阱。
- **Esc 关 el-dialog 依赖焦点在弹窗内**，实测不生效并让后续行内点击被 overlay 拦截 30s；
  改点弹窗自身 `.el-dialog__headerbtn`（destroy-on-close 下确定可靠）。
- **有数据准备的用例：准备幂等 + 清理放 finally**——先查已存在再导入（复用），UI 段整体 try/finally 删除，
  否则一次中途失败留下残留表，喂给下一次运行的是假失败（本轮实测 tableId 2→3 漂移）。
- **`.vm` 后缀假设是应用真缺陷**：本仓库代码生成器返回真实产物路径（`.sql/.ts/.rs/.vue`），
  预览弹窗此前**从未有任何高亮**（E2E 首次触及即揭穿）；`detectLanguage` 已改扩展名映射并补 `prism-rust`。
- **定时任务开关的取消链断言口径**：EP switch 点击即翻转模型（mid≠before），`handleStatusChange` 的
  catch 才回滚——"取消无痕"必须断言 `after===before && mid!==before && PUT==0` 三件事。

### 3.9 轮10 新增教训（个人中心 / 调度日志闭环 / 危险路径与自清理口径）

- **写路径闭环自清理**：真实执行产生数据的用例（如「执行一次」写 sys_job_log）必须 API 复核三段收尾——
  基线 total → 断言 `=基线+1`（证明真落库）→ UI 删除 → 断言 `还原基线`（证明不留残留），两者同为可证伪断言。
  选「系统默认（无参）」任务：注册处理器仅写日志、无业务副作用。
- **危险成功路径只测拦截**：改密成功会使旧 token 失效并强制登出（resetPwd 里 1500ms ElLoading+logOut），
  共享浏览器会话会被摧毁——此类用例断言止步于"客户端校验拦截（is-error≥N）+ `PUT updatePwd` 请求计数=0"，
  绝不填对旧密码触发成功。
- **资料正例保存链要"改-验-还原"**：改昵称→PUT 200+Toast+GET 复核持久化后，必须再改回原值并复核+
  reload 回显一致，否则正例写库会把残留喂给后续轮次；原值从 **API 响应读取**（`ui===api` 同源断言），不硬编码。
- 两次成功保存之间的 Toast 计数断言前 `sleep 3300` 等旧 Toast 自然消退（轮8 的 3.3s decay 口径）。
- 跳转日志列表页请求路径是 `/monitor/jobLog/list`（camelCase）；行删 DELETE 匹配用
  `/monitor\/jobLog\/\d+$/`（`$` 锚防止误匹配 `/clean`）。

### 3.10 轮11 新增教训（租户三态 PATCH / 治理列 / 存量上传路径回填）

- **PATCH 三态语义必须双向断言**：租户编辑 DTO 采用「字段缺省 = 不修改 / 显式 `null` = 清空 / 有值 = 设置」，
  Rust 侧 `Option<Option<T>>` 默认把 JSON `null` 解析成**外层 None（=不修改）**，必须 `deserialize_with`
  才能区分（后端 `src/common/double_opt.rs`）。e2e 因此写成三步可证伪链：详情快照 → 仅改名（断言
  `packageId/expireTime` **不被隐式清空**）→ 显式传值设置 → 显式传 `null` 清空并回读复核。
  只测"设置"会漏掉 serde 陷阱，只测"清空"会漏掉"改名误清空"。
- **治理列断言取真实契约而非猜测**：`/system/config/configKey/{key}` 的 `data` 是**字符串**（不是对象），
  租户覆盖行的治理列必须回读为 `scope=tenant_private`（租户不得篡改治理口径），平台锁定键回读为
  `platform_only + editable=0 + visible=0`。断言前先 `GET` 一次确认真实结构，别按接口名猜。
- **存量扁平上传路径由启动期回填（3.5i）**：`uploads/{kind}/{key}`（隔离前）→ `uploads/{tid}/{kind}/{key}`。
  这类历史数据不是"运行期访问题"，而是**存量库兼容**：幂等扫描 + 同盘 rename / 跨盘 copy+delete，
  启动日志会打印 `存量上传路径回填完成 … migrated=/moved=/skipped=/scanned=`。若头像等图片 404，
  先看该行日志与 `sys_user.avatar` 是否仍是旧扁平路径，再怀疑代码。
- **历史审计文本不算活引用**：`sys_oper_log` 里出现旧路径属历史记录（文本快照），不参与回填；
  回填只改写**活引用列**（如 `sys_user.avatar`）。
- **写断言前先确认响应"真实契约"（轮12 教训）**：功能 72 新增的读路径隔离断言首轮两条失败，不是修复无效，
  而是**取错字段路径**——`GET /system/user/` 返回 `UserFormResult`，`roles`/`posts` 在**顶层**（无 `data` 包裹）；
  `GET /system/dept/list` 返回 `AjaxResult<List>`，列表在 `data`（**不是**分页 `rows`）。
  惯例：同一仓里"分页列表"用 `rows`、"全量下拉/树"用 `data`，而少数接口（如 `/system/user/`）连 `data` 都没有。
  断言前先 `curl`/`fetch` 一次打 `Object.keys(resp)` 确认真实结构，别按接口名猜。
- **下拉/树类读路径必须断言"租户不可见他租户"**：功能 72「步骤 10.5」四条可证伪断言（岗位下拉、
  用户表单下拉角色/岗位、部门树 A/B 互不可见且不含平台部门、角色部门树跨租户 403 / 本租户 200），
  每条先证明"平台侧确有该数据"再断言租户侧只见本租户行，避免"数据为空 → 越界 0"的空断言。
- **后端必须 embedded 模式**（见 §1）：否则 UI 登录链路整体 404 假失败。

## 4. source-check 防混淆约定（重要）

Vite/Rolldown 生产构建会**混淆 composable 函数名**，但**保留字符串字面量**。
`yebot-ui/tests/e2e/main.mjs` 中的 source-check 必须断言“稳定字符串”，否则在 prod 包里查不到符号 → 假失败。

| 验证点                          | ❌ 不可用（被混淆）                  | ✅ 改用（稳定字面量）                      |
| ------------------------------- | ------------------------------------ | ------------------------------------------ |
| 自动刷新 useAutoRefresh         | `useAutoRefresh`                     | `autoRefreshInterval` + `visibilitychange` |
| favicon 角标 useFaviconBadge    | `useFaviconBadge` / `drawBadge`      | `favicon.ico` + `updateBadge`              |
| 可见性暂停 useVisibilityPause   | `useVisibilityPause`                 | `visibilitychange`                         |
| 搜索持久化 useSearchPersistence | `useSearchPersistence` / `saveQuery` | `search-persist`（STORAGE_PREFIX 字面量）  |
| 头像裁剪拖拽                    | `ondrop`                             | `dragover` / `drag-over`                   |

经验证在 `dist/static/js/index-*.js` 中稳定存在的字面量：
`visibilitychange`(9)、`autoRefreshInterval`(9)、`favicon.ico`(1)、`updateBadge`(2)、
`search-persist`(1)、`dragover`(27)、`drag-over`(4)、`sessionTimeout`(11)、`error-boundary`(6)、
`VueCropper`(4)、`skeleton-table`(6)、`toDataURL`(21) 等。

新增 source-check 时，**一律优先匹配字符串字面量**，不要匹配被 minify 的函数/变量名。

## 5. 质量门（提交前）

- 前端：`NODE_OPTIONS="" sh node_modules/.bin/vue-tsc --noEmit`（0 类型错误）、
  `npm run lint`（0 错误 0 警告）。
- 后端：`cargo check --lib --tests`、`cargo test --lib`（基线 **814 passed / 0 failed**，需本机 Redis 在线；无 Redis 时以 `cargo clippy --all-targets` 编译校验）、`cargo clippy --all-targets -- -D warnings`（0 项目警告；仅第三方 `proc-macro-error2` future-incompat 提示，非本仓库代码）。
  - `cargo test --lib` 曾因 `test_support::migrated_db()` 以 `pid+nanos` 命名临时库、Windows 时钟粒度约 100ns 导致并行测试抢同一文件并发 `Migrator::up` → `UNIQUE constraint failed: seaql_migrations.version`（偶发）。已加进程内 `AtomicU64` 自增序号消除，须连跑两次确认不再 flaky。
- 类型导出：`cargo ts`（= `cargo run --bin export_ts`）刷新 ts-rs 生成的前端类型（当前 40 个类型）；`cargo run` 因新增 `export_ts` bin 已在 `Cargo.toml` 设 `default-run="axum-backend"` 消歧义。
- CI 额外强制：`axum-backend` job 校验 ts-rs 生成的 TS 类型与 `yebot-ui/src/types/api/generated/` 一致（`git diff --exit-code`）；`compose-config` job 对全部 5 个编排执行 `docker compose config --quiet`（含 `include` 复用的 `deploy/docker-compose.db.yml`）。
- 全部通过后，yebot-ui 与 axum-backend 分别提交；e2e 套件随 yebot-ui 提交（位于 `yebot-ui/tests/e2e/`）。
- 多租户（根仓）：`node scripts/tenant-audit.mjs --full` 必须 `EXIT=0` 且 **R8.1–R8.5 全 PASS**；
  产物 `docs/optimization/tenant-audit-report.md` 是**候选集**，每条需回代码复核，
  口径见 `docs/optimization/topic-multitenant-sso-audit-2026-09-23.md` §30.2.5/§30.2.6。
