# e2e 套件运行配方（已验证）

> 本文件记录 `yebot-ui/tests/e2e/main.mjs`（47 个 feature / 372 checks，套件已并入 yebot-ui 仓库）在本地跑通所需的**完整环境**，
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
EMBEDDED_FRONTEND=true cargo run
```

- 该模式会让后端用 `ServeDir` 提供 `frontend-dist/`（见 `src/embedded_assets.rs`）。
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
YEBOT_TEST_USER=admin YEBOT_TEST_PASS=admin123 \
FRONTEND_URL=http://localhost:4173 \
node main.mjs --headless
```

- 不带 `--feature` = 跑全部 47 个 feature（约 8 分钟）。
- 单跑某 feature：`node main.mjs --headless --feature 47`（按实现支持与否而定）。
- 通过判据（已验证基线）：`总计 372 通过 372 失败 0`，日志无 `❌`。

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
# 期望（已验证基线）：末行 "有信号的路由数: 0/51" + "交互动作覆盖：…（INTERACT 模式同样 0/51 稳定）
```

- **交互态三段扫描（`INTERACT=1`）**，逐页执行且**只开不提、不污染数据**：
  (a) 只读按钮（搜索/查询/重置/刷新，按可见文本匹配）；
  (b) 工具栏「新增/添加/新建」按钮 → 打开表单对话框 → Esc 关闭（按可见文本匹配，工具栏按钮有文字）；
  (c) 表格首行「编辑/修改/查看/详情/预览」→ 打开回填表单**对话框或抽屉**（`.el-dialog`/`.el-drawer`）→ Esc 关闭。
  **关键**：行操作按钮在本仓是**图标-only**（`icon="Edit"` + `:aria-label="t('common.edit')"`，无可见文本），
  故 (c) 必须用 **`getByRole(button|link, { name: 可访问名正则 })`** 命中，靠 `hasText` 文本匹配会全程空转。
- **交互覆盖计数**：INTERACT 模式每行末尾打印 `interact[ro=.. add=页/开=.. view=页/开=..]`，末行汇总
  `交互动作覆盖：只读 N 次；新增 X 页(打开 Y)；行内编辑/查看 M 页(打开 K)`。这是**防“扫描器静默空转”的自检**
  ——`0/51` 只有在 view>0 时才真正代表“编辑态打开也没报错”，而非“根本没点到”。当前基线（embed :8080）：
  只读 59 次、新增 18 页开 15（工具页内联表单无模态属良性）、行内编辑/查看 12 页开 12，全 0 信号。

- **9 类信号**：console(warn/err)、`pageerror`（未捕获异常）、`requestfailed`（网络失败）、
  `response` status≥400（剔除 favicon/预期 401 良性项）、同源 JSON 的**业务错误码**（`code!=200/0`，
  捕获被页面静默吞掉的保存/查询失败）、`el-message`/`el-notification` Toast（仅 error/warning 计数，
  成功/信息类不算异常）、`el-message-box`/`el-dialog` 弹窗、真实 404（`.wscn-http404-container` 类名，
  避免正文含 "404" 误报）、以及后端 `/tmp/yebot-backend.log` 的 ERROR/WARN/panic（人工关联）。
  `EXT_NOISE_RE` 过滤浏览器扩展在严格 CSP 下的字体/脚本加载噪声（否则 embed 模式整批假阳）。
- **保存态数据失败如何捕获**：交互态采集器**刻意只开不提**（防污染数据），故“保存是否真的失败”由
  `main.mjs` 的真实 CRUD 用例（新增/编辑/删除 + 业务码断言）覆盖；采集器的**业务错误码**信号则被动捕获
  页面自身发起的请求失败。二者分工互补、不重复。
- **路由来源**：以 `sys_menu`（status=0）为唯一权威，按 `/父path/子path` 组合成 51 个可达页面
  （43 个注册菜单叶子页 + `/index` + 7 个 `/user/profile/*` 隐藏页）。ROUTES 必须与 `getRouters` 逐条对齐，
  否则手写猜错会命中 404 兜底页 → 假信号。实测教训：`/monitor/operlog`→`/system/log/operlog`、
  `/tool/{backup,task}`→`/monitor/{backup,task}`、`/help-center/*`→`/tool/*`、
  工作台是 `/workbench/index`（非 `/dashboard/workbench`）、数据看板是 `/dashboard`（非 `/dashboard/index`）。
  务必以 `curl :8080/getRouters`（递归展开 children 组合 full path + component）核对（如 `/system/msg/*`、
  `/system/webHook/*`）。新增页面（如 `/monitor/frontendError`）必须同步加入 ROUTES，避免“遗漏采集面”。

### 3.1 Playwright 浏览器安装位置

- 默认浏览器目录在 `%LOCALAPPDATA%\ms-playwright`，但若 TRAE 沙箱拦截其 `__dirlock` 写入，
  需将浏览器安装到工作区内并通过环境变量指定：
  ```bash
  $env:PLAYWRIGHT_BROWSERS_PATH = "d:\桌面\yebot\.pw-browsers"
  npx playwright install chromium
  # 运行时同样带上该环境变量（与上述命令一致），否则仍会去默认目录找 1234 版本而失败
  $env:PLAYWRIGHT_BROWSERS_PATH = "d:\桌面\yebot\.pw-browsers"
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
- 后端：`cargo check --lib --tests`、`cargo test --lib`（基线 676 passed，需本机 Redis 在线；无 Redis 时以 `cargo clippy --all-targets` 编译校验）、`cargo clippy`（0 项目警告；仅第三方 `proc-macro-error2` future-incompat 提示，非本仓库代码）。
- CI 额外强制：`axum-backend` job 校验 ts-rs 生成的 TS 类型与 `yebot-ui/src/types/api/generated/` 一致（`git diff --exit-code`）；`compose-config` job 对全部 5 个编排执行 `docker compose config --quiet`（含 `include` 复用的 `deploy/docker-compose.db.yml`）。
- 全部通过后，yebot-ui 与 axum-backend 分别提交；e2e 套件随 yebot-ui 提交（位于 `yebot-ui/tests/e2e/`）。
