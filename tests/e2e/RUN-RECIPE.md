# e2e 套件运行配方（已验证）

> 本文件记录 `stepby-vue/tests/e2e/main.mjs`（75 个功能，套件已并入 stepby-vue 仓库）在本地跑通所需的**完整环境**，
> 以及 source-check 断言的**防混淆（minify-stable）约定**。先前多次“假失败”均源于环境与混淆问题，
> 按本文配置可稳定复现全绿。

## 0. 前置依赖

- **Redis 必须在线**：`docker compose up -d redis`（或 `stepby-redis` 容器 healthy）。
  stepby-axum 启动硬依赖 redis，否则接口 500。
- **两个仓库源码就绪**：`stepby-vue`（前端）与 `stepby-axum`（Rust 后端）。
- **存量 `data/stepby.db` 可能落后于迁移**：`AppInitializer` 启动**刻意不跑** `Migrator::up`（避免对已有 seed 的存量库重跑导致主键冲突），故新增模块（如 WebHook）的建表/菜单不会自动落到早于该迁移的本地产物库。症状：后端日志每次 `login_success` 刷 `WARN ... no such table: sys_web_hook`、`/system/webHook/*` 页面 404。处置（本地 gitignore 产物，安全）：用 `migration/src/m20260820_000002_web_hook_module.rs` 的 SQLite DDL 幂等补 `CREATE TABLE IF NOT EXISTS` + 菜单/权限 `INSERT OR IGNORE`。全新库经完整 `Migrator::up` 不受影响。

## 1. 后端：embedded 模式（:8080）

F24 直接校验“后端内嵌前端”能力，因此后端必须以 embedded 模式启动：

```bash
cd stepby-axum
# debug 构建在运行时读 EMBEDDED_FRONTEND 环境变量，无需重新编译
# SSO_ENABLED=true：功能 51（OIDC Provider）需要，缺省时 /sso/authorize 直接 400「单点登录（SSO）未启用」
EMBEDDED_FRONTEND=true SSO_ENABLED=true cargo run
```

- 该模式会让后端用 `ServeDir` 提供 `frontend-dist/`（见 `src/embedded_assets.rs`）。
- ⚠️ **漏 `EMBEDDED_FRONTEND=true` 的典型症状**（轮11 实测）：后端退化为"前端分离模式"，`GET /login`
  返回 JSON 404（而非 SPA HTML），e2e 首步即 `locator.fill: Timeout 30000ms`（找 `input[placeholder="账号"]`），
  整套 UI 用例连环假失败——此时先查后端启动命令，而不是改选择器。
- 其余 feature（除 F24 外）走 vite preview 的 `/prod-api` 代理（→ :8080），同样要求后端在跑。
- **必须先把「嵌入式构建产物」同步进 `stepby-axum/frontend-dist/`**：
  ```bash
  # frontend-dist 已被 .gitignore 的 /frontend-dist 忽略，不会进仓库
  # ⚠️ 必须用 EMBEDDED 模式构建再拷贝（见下方两构建顺序），不能用 prod 构建：
  #    嵌入式前端 baseURL=''（同源），prod 前端 baseURL=/prod-api（跨源代理）。
  cp -r stepby-vue/dist/. stepby-axum/frontend-dist/
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
cd stepby-vue
# 第 1 步：embedded 构建 → 拷入 frontend-dist（供 :8080 内嵌后端）
NODE_OPTIONS="" sh node_modules/.bin/vite build --mode embedded
cp -r dist/. ../stepby-axum/frontend-dist/
# 第 2 步：prod 构建 → 留 dist（供 :4173 preview）
NODE_OPTIONS="" sh node_modules/.bin/vite build --mode production
NODE_OPTIONS="" sh node_modules/.bin/vite preview --port 4173
```

- `NODE_OPTIONS=""` 是绕开 safe-delete 守卫注入的 node shim（见项目记忆），
  否则 `vite build` 清空 `dist` 时会被 guard 拦截。
- preview 服务对静态资源返回 gzip，`curl` 验证需加 `--compressed`。

## 3. 跑 e2e

```bash
cd stepby-vue/tests/e2e && npm install
# 权威环境 = embedded :8080（真后端+真数据+SW；见 memory 与 docs 轮2 定案）
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" \
node main.mjs --headless
```

- 不带 `--feature` = 跑全部 75 个功能（约 20 分钟，分段见下）。
- 选择器：`--feature=54` 单功能；`--feature=1-20,51` 集合（区间+逗号，轮4 新增）——全量超 10 分钟时按
  `1-20 / 21-40 / 41-75` 三段前台直跑直等，各段回合即得完整汇总，不挂后台。
- **功能 1-75** 通过 判据（**最新权威基线，2026-09-28 第二十一批实测**）：按 `1-20 / 21-40 / 41-75` 三段跑，
  实测 `107 + 223 + 445 = **775 通过 / 0 失败**`（三段 EXIT=0，日志无 `❌`；跑前 `/health` = `db UP / redis UP`）。
  第二段告警数由 3 → **0**；第三段 `[-1]` 与第二段的告警归零**同源**，都是第二十一批修掉假入口的直接结果
  （详见下方「计数与告警的变动说明」）。
  （历史基线：第二十批 `107 + 223 + 446 = 776`；第六批 `107 + 223 + 445 = 775`；
  功能 1-68 曾为 `106 + 220 + 326 = 652`，随 W-3/W-8/W-10/W-11/W-17 与失败计数收紧逐批上移。）
- **计数与告警的变动说明（重要，改能力位门控必读）**：第二十一批把个人中心「通行密钥 / Passkeys」页签
  由"恒渲染"改为 `v-if="userStore.showPasskey"`（能力位 `auth.webauthn` 管辖）。故：
  - 功能 54 的 `/user/profile/index 存在可切换页签` 由 `tabs=8` → **`tabs=7`**（少掉 passkey 页签）
    ⇒ 第三段总数 446 → 445。**这是修复的预期结果，不是回归**；
  - 第二十批基线中**唯一非失败告警** `⚠️ [404] GET /system/user/webauthn/credentials`×3 随之**消失**
    （页签不再渲染 ⇒ 其子组件 `onMounted` 不再探测未注册端点）。**"0 告警"是新增的通过判据之一**：
    若该 404 重现，说明门控退化成了"入口在但接口不注册"的假入口。
  - 开启态（`auth.webauthn=on` + `[webauthn]` 配好信任锚）必须**另行**验证入口不误藏：见 §3.22(4)。
- 段 1 的 `⚠️ [403] /register` 与段 3 的 `⚠️ [401] /login`（各 1~4 条）均为**既定断言**而非缺陷：
  前者是功能 15「注册流程拦截验证」断言的后端返回（`当前系统未开放注册，请联系管理员`），
  后者来自功能 51/52/55 等"未授权 / 错误凭据必须被拒"的负路径断言。
- 第 51 功能首跑曾因 `networkidle` 被 web-vitals beacon 卡死而**假失败**，修复后复跑 `24/24`（见 §3.16）；
  最终源码上再验 `--feature=51,66` = `36/36`。
- **功能 69-73** 通过判据（已验证基线，轮13）：`--feature=69-73` 单轮 `失败: 0`，EXIT=0，
  且浏览器无 console error / requestfailed（功能 69=租户 CRUD+三态 PATCH、70=租户配额上限+生命周期（回收站/恢复）+停用即时吊销会话、
  71=域名绑定+DNS TXT 验证、72=config/dict 租户治理列与覆盖层 + 步骤 10.5 读路径租户隔离 4 条、
  **73=多租户 Phase 3 套餐白名单三处生效点（授权∩白名单 403 / getRouters 剪枝 / 套餐变更收敛）+ 到期三态（宽限只读 403 / 超宽限拒登）
  + 文件跨租户隔离 403（`/common/download/resource`、`/uploads/{tid}/...`）**）。
  命令与 §3 相同，仅加 `--feature=69-73`。（轮11 基线为 62/62；轮12 新增 4 条读路径隔离断言 → 66/66；
  轮13 新增功能 73（15 项断言，含 finally 闭环清理）→ 69-73 全绿。）
  （页面级循环轮10（收官）：功能 67 个人中心资料保存链+改密校验拦截 7 项、功能 68 执行一次→调度日志
  生成→详情→删除闭环 11 项，628→646，两功能均首轮全绿；应用零改动。
  运行方式同上：`--feature=N` 等号形式，环境变量同 §3。）
- **功能 74** 通过判据（已验证基线，轮14）：`--feature=74` → `总计 20 通过 20 失败 0`（EXIT=0）；
  `--feature=69-74` → `总计 103 通过 103 失败 0`（EXIT=0，未破坏既有 69-73）。功能 74 = **跨租户越权防护**
  （user 写越权 / post 与 frontendError 跨租户读）：A 前置建租户 A/B，并以平台 admin 给 A 管理员角色补
  `user:query/edit/remove/resetPwd`（可证伪前提：补权后 A 的 `GET /system/user/list` 200，使越权 403 只能归因租户校验）；
  B 跨租户写 user（`changeStatus`/`resetPwd`/`DELETE /system/user/{id}` 各 **403**）+ 同租户对照 **200**；
  C 跨租户读岗位详情（A/B 读平台岗位 **403**，平台 admin 读同一岗位 **200** 对照）；
  D 前端错误跨租户不可见（平台上报 marker → 平台检索 ≥1，A/B 检索 **0**）；
  E finally 闭环清理（前端错误记录 / 平台岗位 / 管理员用户 / 租户 / A 角色菜单残留全回收，复核残留 0）。
  **契约偏差（以实际后端为准）**：上游描述的上报路径为 `/monitor/frontendError`，实际为
  `/monitor/frontendError/report`（`report` 仅需登录）；list 仅按 `name` 模糊检索（不检索 `message`），
  故 marker 同时写入 `name` 与 `message`、以 `name=<marker>` 查询印证。
- **功能 75** 通过判据（已验证基线，第三批）：`--feature=75` → 全绿（EXIT=0）；`--feature=49,75` → 全绿（未破坏 49）。
  功能 75 = **审批工作流增强五件套**（加签 W-3 / 已办 W-8 / 导出 W-11 / 看板待办 W-10 / 移动端 W-17 + nest 前缀归一化回归）：
  A 建加签目标用户 → B 以 `stepby` 提交示例请假单（**前置依赖 N-7**：部门主管必须非空，否则 400 `error.flow.leader_missing`，
  故后端启动必须包含 `initialize` 3.1.2b 的主管回填）→ C 加签（成功且节点升级 `taskType=countersign`、重复加签 **400** 防重、
  **会签未满时单据仍 pending**——可证伪的会签语义）→ D 已办（收录 `approve` 且带单据标题；`submit` 不入选）→
  E 导出（响应为**真 xlsx**，`PK` 魔数 `0x50 0x4B`，非 JSON 错误体）→ F `nest` 前缀等价
  （`/prod-api/system/flow/todo` 与裸路径**行为一致**，fail-closed 下不误伤仅登录路由）→ G UI（已办 tab / 已办行 /
  管理视图导出按钮 / 看板「我的待办」卡片）→ H 移动端（≤768px 取消固定列）→ finally 清理用户与单据。
  **陷阱**：C 步骤必须用**加签人自己的 token** 调 `countersign-add`（用平台 admin token 会 403）；B 步骤必须用
  普通角色提交（管理员自提交触发全链自审拒绝 → 400 `self_approve_chain`）。

### 3.0 逐页信号采集器 `collect-warnings.mjs`（配合 main.mjs 的深度巡检）

`main.mjs` 是断言式功能回归；`collect-warnings.mjs` 是**广度巡检**：登录后逐页采集 9 类运行时信号，用于发现
断言未覆盖的新告警/错误。二者互补，每轮循环都应各跑一次。

**权威全栈目标 = embed :8080**（同源、真实后端与数据、生产构建会注册 SW）：业务错误码、SW 兜底等
只在 embed/生产构建才暴露的问题在此才测得到（如 `/tool/swagger` 的 SW `navigateFallback` 拦截）。

```bash
cd stepby-vue/tests/e2e
PLAYWRIGHT_BROWSERS_PATH=D:/Projects/.pw-browsers FRONTEND_URL=http://localhost:8080 \
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node collect-warnings.mjs
# 交互态（打开“新增”/行内“编辑·查看”对话框再取消，暴露仅交互态才渲染的报错，如 i18n 编译错误）：
INTERACT=1 PLAYWRIGHT_BROWSERS_PATH=D:/Projects/.pw-browsers FRONTEND_URL=http://localhost:8080 \
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node collect-warnings.mjs
# 期望（已验证基线）：末行 "有信号的路由数: 0/57" + "交互动作覆盖：…（INTERACT 模式同样 0/57 稳定）
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
  ——`0/57` 只有在 exp/view>0 时才真正代表“导出/编辑态打开也没报错”，而非“根本没点到”。当前基线（embed :8080，
  2026-09-26 第三批实测：路由面由 56 增至 57（新增 `/system/flow/todo`），非交互态 `0/57` 全 0 信号）：
  只读 68 次、新增 21 页开 19（工具页内联表单无模态属良性）、行内编辑/查看 16 页开 16、导出 12 页物证 12，全 0 信号。

- **11 类信号**：console(warn/err)、`pageerror`（未捕获异常）、`requestfailed`（网络失败）、
  `response` status≥400（剔除 favicon/预期 401 良性项）、同源 JSON 的**业务错误码**（`code!=200/0`，
  捕获被页面静默吞掉的保存/查询失败）、`el-message`/`el-notification` Toast（仅 error/warning 计数，
  成功/信息类不算异常）、`el-message-box`/`el-dialog` 弹窗、真实 404（`.wscn-http404-container` 类名，
  避免正文含 "404" 误报）、后端 `/tmp/stepby-backend.log` 的 ERROR/WARN/panic（人工关联），以及本轮新增的
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
  $env:PLAYWRIGHT_BROWSERS_PATH = "D:\Projects\.pw-browsers"
  npx playwright install chromium
  # 运行时同样带上该环境变量（与上述命令一致），否则仍会去默认目录找 1234 版本而失败
  $env:PLAYWRIGHT_BROWSERS_PATH = "D:\Projects\.pw-browsers"
  node main.mjs --headless
  ```
- `.pw-browsers` 已被根 `.gitignore` 忽略，不入仓库。

### 3.2 WebSocket（/ws）连接说明（P4 修复 + 功能 46 回归）

- 前端 `wsService` 连接 `ws://<host>/ws`，token 通过 `Sec-WebSocket-Protocol: bearer.<jwt>` 传递。
- **已知问题（已修复）**：后端 Redis 中 `ws_conn:{user_id}` 连接计数可能残留陈旧值
  （服务重启 / 进程异常退出 / 网络闪断时 DECR 未及时执行），导致该用户后续 WS 握手全部 429，
  浏览器控制台出现大量 `WebSocket connection to '.../ws' failed ... 429`，实时通知静默失效。
- **修复方案**：
  1. 服务启动时重置 `ws_conn:*` 计数（见 `stepby-axum/src/main.rs` → `reset_ws_conn_counts`）；
  2. 每用户最大并发连接上限 5 → 20（`stepby-axum/src/handler/ws_handler.rs`）。
- **回归防线**：功能 46 分别验证「页面内 WS 连接全链路」与「Node 直连后端 WS」均能成功建立
  （无 429）。若再次出现上述控制台错误，先检查 `docker exec stepby-redis redis-cli --scan --pattern "ws_conn:*"` 是否残留计数。

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

### 3.11 轮13 新增教训（套餐白名单三处生效点 / 到期三态 / 跨租户文件）

- **套餐白名单无 CRUD API**：仓库只有只读 `/system/tenant/package/options`，迁移仅种入唯一 `标准版`（`menu_ids=NULL`=不限制）。
  构造"受限白名单套餐"的合法途经是 e2e 用 `node:sqlite`（Node 内置，`DatabaseSync`；不用未安装的 better-sqlite3）
  直连同一 `stepby-axum/data/stepby.db` 注入夹具套餐（后端为 WAL + `busy_timeout=5s`，外部进程写安全），
  **幂等（按 package_name 先删后插）+ finally 删净**，断言仍全走 HTTP（保真后端契约）。
- **可证伪前提**：`converge_tenant_role_menus` 在套餐变更时总会把角色菜单收敛到 ⊆ 白名单，故正常路径下 getRouters 剪枝是 no-op。
  证明剪枝必须**绕过收敛**：直接 DB `INSERT OR IGNORE sys_role_menu` 注入一条越界菜单，再用 API 证明"角色确有该菜单"但 getRouters 已剔除。
  选**父节点也在角色内**的菜单（105 字典管理，父 1 系统管理）→ 其缺席必为白名单剪枝，排除"孤儿节点"误因。
- **套餐①门禁的演员**：租户管理员默认角色 = 平台 role2 菜单 ∩ 白名单（`sys_tenant_service.rs` `add`），**不含** `system:role:add/edit`。
  故须先用平台 admin 给该角色补 1008/1009（须 ⊆ 白名单），再以"对照 200 / 越界 403 且回读无部分写入"两条双向断言。
- **到期三态语义**（`resolve_login_state`，`TENANT_EXPIRE_GRACE_DAYS=7`）：`now ≥ exp+7d`=Disabled（登录 403）；
  `exp ≤ now < exp+7d`=Grace（登录放行，写 403 `error.tenant.expired_readonly`，读放行）；否则 Active。
  时间戳须按 **UTC** 字符串提交（`datetime::parse_flexible` 按 UTC 解析，`now_naive()=Utc::now().naive_local()`）。
  到期重登**不可复用 apiLogin（有 token 缓存）**，须原生 `fetch('/login')`。
- **跨租户文件语义修正（台账口径更正）**：台账 P2-1 标注"跨租户下载 → 403"，但 `GET /common/download` 实为 **404**
  （`common_handler.rs` download L573）；真正返回 **403** 的是 `/common/download/resource`（越权 `error.common.forbidden`，L632）
  与直链 `/uploads/{tid}/{kind}/{key}`（L688）。功能 73 断言以后两者为准。
- **清理口径**：租户 `remove` 为**软删且不清 `sys_role_menu`**，故角色-菜单残留须 finally 用 DB 显式删除；
  上传文件用 `GET /common/download?delete=true` 收尾；`GET /system/tenant/list` 结果在 **`data`**（非分页 `rows`），
  复核残留时用 `data` 才是有效断言。
- **`page.goto: Timeout 30000ms exceeded` = 环境抖动，非断言回归**（本轮实测）：全量分段跑时长会话下，后端/Redis
  若瞬时抖动，页面导航会 30s 超时并使该功能**提前中止**（后续断言不计入总计 ⇒ 该段 total 会低于基线，如 317 < 326），
  同批还会收集到瞬时 `401/503` 告警。**判据**：① 失败文案是 `page.goto` 超时（非业务断言不符）；② 单独
  `--feature=<该功能>` 复跑全绿（本轮功能 60：13/13）。二者同时成立即可判定为环境抖动，**必须重跑该段取净结果**，
  不可直接采信首跑的 `失败: 1`。
- **`下载功能端到端验证 - blob 响应 0 字节`（功能 3）= 环境抖动，非断言回归**（第九批实测，**第二类抖动签名**）：
  功能 3 点第一行下载按钮后，判据是"观察到 `download` 事件 **或** `/system/backup/download/` 的 200 响应体非空"。
  后端备份文件为**数十 MB 级**（当前 DB 约 40 MB ⇒ 备份 ~36 MB），大响应下浏览器可能**未在 15 s 内发出 `download` 事件**，
  于是走 `else if (resp)` 分支：此时响应被 abort（同批 console 可见 `net::ERR_FAILED`）⇒ `resp.body()` 读空 ⇒ 记 0 字节。
  **判据**：① 失败文案是 `blob 响应 0 字节`（非"未找到下载按钮"）；② 同批后端 `backups/` 目录中该 `file_name` 对应文件**存在且非空**
  （如 `Get-ChildItem backups | Sort LastWriteTime -Desc | Select -First 1`）；③ 单独 `--feature=3` 复跑全绿。
  三者同时成立即判环境抖动，**必须重跑该段取净结果**（第九批复跑：`--feature=3` = 6/6，`--feature=1-20` = 107/107）。

### 3.12 新库迁移路径验证（Migrator 全链 + 平台专属菜单治理查证）

embedded 环境**不跑 Migrator**（架构约定：启动只跑 `initialize` 兜底）⇒ "新库走迁移"这条路径
**e2e 测不到**。凡改动涉及迁移（尤其菜单/角色授权治理）时必须单独验证：

```bash
# 1) 全新库跑全链迁移（60+ 迁移）。显式 DATABASE_URL 覆盖 .env（dotenvy 不覆盖已存在的环境变量）
cd stepby-axum
DATABASE_URL="sqlite://./data/mig-verify.db?mode=rwc" cargo run -p migration   # 期望「迁移完成」+ exit 0
```

```js
// 2) 查证治理结果（落一个临时 .mjs 跑完即删，避免 shell 引号地狱；Node 内置 sqlite 无需额外依赖）
//    文件名：stepby-axum/.mig-verify.mjs
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('data/mig-verify.db')
const P = ['system:tenant:domain:', 'tool:gen:', 'tool:httpDebug:', 'monitor:cache:',
  'monitor:log:', 'monitor:slowSql:', 'monitor:health:', 'system:backup:']
const like = P.map((p) => `perms LIKE '${p}%'`).join(' OR ')
const rows = db.prepare(
  `SELECT COUNT(*) AS c FROM sys_role_menu rm JOIN sys_menu m ON m.menu_id = rm.menu_id
   WHERE rm.role_id = 2 AND (${like.replaceAll('m.', '')})`
).all()
console.log('[verify] role2 持平台专属菜单数（期望 0）:', JSON.stringify(rows))
const domain = db.prepare("SELECT menu_id FROM sys_menu WHERE perms LIKE 'system:tenant:domain:%'").all()
console.log('[verify] domain 菜单应存在:', JSON.stringify(domain))
db.close()
```

```bash
node .mig-verify.mjs          # 期望：role2 持有数 = 0，且 domain 菜单（3800-3804）确实存在
rm -f .mig-verify.mjs data/mig-verify.db*
```

- **判据**：`role_id=2` 持有平台专属前缀菜单数 = **0**（2026-09-26 实测：库中平台专属菜单 26 个、
  role2 持有 **0**）。常跑兜底已固化为 Rust 单测 `platform_only_prefixes_match_migration_lists`
  （`common/tenant.rs`：`include_str!` 编译期比对常量与迁移清单），故日常 `cargo test --lib` 即可。
- **为何必须单独验**：2026-09-26 实测发现 `m20260926_000002`（7 个硬编码菜单 ID）与
  `m20260926_000005`（5 项前缀）覆盖集合不同，**两者都不含 `system:tenant:domain:`** ⇒ 新库中
  role2 仍持域名管理菜单 3800/3802（"菜单可见但请求 403"的假入口）。修复 = 新增 `m000006`
  （按完整 8 前缀全量剔除）。**教训：新增/改动迁移清单后，务必用本节的"全新库 + 查证"两步验一次，
  不要只依赖 embedded 环境（它走 initialize，会掩盖迁移路径的缺口）。**

### 3.13 权限 fail-closed 与 nest 前缀归一化（2026-09-26；跑 e2e 前必读）

本轮把安全前提从「文档声称 fail-closed」纠正为「**代码确实 fail-closed**」，并修复了一个**会改变 e2e 结果**的
结构性缺陷。两者都直接决定 e2e 是否假失败/假通过：

- **`permission_deny_by_default` 现为默认 `true`**（`config/settings.rs` 的 serde 缺省 + 三份配置模板顶层显式 `true`）。
  含义：受保护路由中「未登记权限映射且不在仅登录白名单」的路径**返回 403**。
  ⚠️ 配置坑：该键是**顶层键**，写在任何 `[table]`（如 `[log]`）之后会被解析进该表而被**静默忽略**——
  历史 `config/config.toml` 正是这样失效的。已加两条单测锁死（`test_deny_by_default_defaults_to_true` /
  `test_shipped_config_template_is_fail_closed`）。**新增受保护路由必须三处同步**
  （`PERM_ROUTE_TABLE` + `is_login_only_path` 白名单 + `PROTECTED_ROUTES` 测试清单），否则运行时 403。
- **nest 前缀必须归一化**：同源部署下 `/prod-api`、`/dev-api`、`/stage-api` 由 `Router::nest` 挂载，
  axum 会把前缀并入 `MatchedPath`（如 `/prod-api/getInfo`）。归一化前，带前缀请求与
  权限表/仅登录白名单/操作日志模块推断/指标标签**全部失配**——fail-open 时整体绕过 RBAC，
  fail-closed 时**整体 403**（这正是本轮 `integration_tests::auth::test_prod_api_prefix` 首跑 403 的根因，
  修复后转绿；该用例即本缺陷的**反向验证**）。
  修复 = `middleware::normalize_api_prefix`，已接入 `permission` / `oper_log` / `observability` 三处。
  **e2e 判别法**（fail-closed 下唯一能区分"归一化是否生效"的探针）：取一条**仅登录白名单**路由
  （如 `/system/flow/todo`），分别裸路径与三前缀请求，带普通用户 token 应**全部 200**；
  若前缀形态 403 而裸路径 200 ⇒ 归一化失效。
- **PWA/Service Worker**：`/prod-api` 前缀形态在 `pwa.ts` 的 denylist 之外，前端业务请求走 SW 缓存策略，
  `pending-count` 等新鲜度敏感接口已在响应侧加 `Cache-Control: no-store`（V7-E4），勿再依赖客户端绕缓存。

### 3.14 Playwright 选择器写法约束（2026-09-26 第三批；写断言前必读）

第三批排查「看板卡片不可见」时发现：**断言恒失败的真因是选择器语法，而非功能缺陷**。实测四种写法：

| 写法 | 实测结果 | 结论 |
| --- | --- | --- |
| `text=我的待办` | `count=1` | ✅ 单条可用 |
| `text=我的待办, text=My Pending Approvals` | `count=0` | ❌ text 引擎把逗号后整串当**字面文本** |
| `.el-message--error, text=注册失败` | **抛异常** `Unexpected token "=" while parsing css selector` | ❌ 列表首项是 CSS 时整串按 CSS 解析，`text=` 非法 |
| `.widget-card__label:has-text("我的待办"), .widget-card__label:has-text("My Pending Approvals")` | `count=1` | ✅ 多语言并列的**推荐**写法 |

- **铁律**：多语言并列一律用 **CSS 选择器列表 + `:has-text()`**；不要混用 `text=` 引擎，也不要写 `text=A, text=B`。
- 历史影响面：`main.mjs` 曾有 2 处违反（功能 15 的注册拦截、功能 75 的 G4 看板卡片）。前者因
  `.catch(() => false)` + `record(..., true, ...)` **恒绿但零信息**（属"假断言"），已改为「以 `/register` POST
  的业务码为唯一判据」的可证伪断言；后者改用 CSS 列表后转绿。
- 复现探针：起一个临时 Playwright 脚本，对同一元素分别 `locator(四种写法).count()` 即可判定。

### 3.15 生成代码「真编译」校验配方（2026-09-26 第六轮；改模板后必跑）

**为什么需要**：`gen_table` 的外置模板（`stepby-axum/templates/*.tera`）此前只用**字符串断言**验证
（如 `assert!(service.contains("engine_open_round("))`）。字符串断言**无法发现**语义级缺陷——
第六轮首次把 flow 分类的渲染结果落到 crate 内真实路径并编译，一次暴露 **6 处真实缺陷**
（`Option<Option<NaiveDateTime>>` 二次包裹、从 `sys_flow_service` 顶层导入 `RoundChain`/`BizTypeRegistration`、
camelCase AppState 字段名、2 处未使用 import、`collapsible_if`）。**改任何 `.tera` 后必须跑一次本配方。**

```bash
cd stepby-axum
# 1) 临时把渲染结果写盘：在 service/gen_table_service.rs 的
#    `mod gen_table_template_tests` 内加一个 `#[test] fn zz_dump()`：
#      - mk_table() 改 table_name="zz_flow_verify_doc" / class_name="ZzFlowVerifyDoc"
#        / tpl_category=Some("flow")；
#      - columns 用 `column_type_to_rust_type()` **真实映射**构造（勿手写 rust_type，
#        否则会掩盖映射缺陷）；非主键列置 is_insert/is_edit/is_list="1"
#        （对齐 gen_table_service.rs:794 的 `("1","1","1","0")`，否则 DTO 为空、看不出真实产物）；
#      - 把 `files` 里以 `.rs` 结尾的项按 key 相对路径写入 `stepby-axum/zz-verify/`。
cargo test --lib <dump 测试名>

# 2) 拷进 crate 真实路径并临时接线（**校验后必须全部还原**）：
#    zz-verify/src/{entity,repository,service,handler,router}/<name>*.rs
#      → stepby-axum/src/{entity,repository,service,handler,router}/
#    各 mod.rs 追加 `pub mod <name>;`
#    state.rs 的 AppState 增加字段 `pub zz_flow_verify_doc_service: …Service`
#      并在 `AppState::new` 初始化（字段名=snake_case 表名+`_service`）

# 3) 编译（这是唯一能发现语义缺陷的判据）
cargo clippy --lib -- -D warnings     # 期望：Finished，且**生成代码零告警**

# 4) 还原：删掉拷入的 5 个文件 + `git checkout -- src/{entity,repository,service,handler,router}/mod.rs src/state.rs`
#    + 删掉 zz-verify/ 与临时测试
```

- **判据**：`cargo clippy --lib -- -D warnings` 通过，且**生成代码不产生任何告警**（unused import /
  `non_snake_case` / `collapsible_if` 都算失败——用户拿去就是 warning 源码）。
- **回归防线**：已固化为单测 `test_generated_code_is_clippy_clean_by_construction`
  （`gen_table_service.rs`，断言上述 6 点），日常 `cargo test --lib` 即覆盖字符串层；
  **编译层仍需按本节手工执行**（单测无法编译产物）。
- **AppState/路由接线是用户步骤**：生成代码的 `state.<表名>_service` 字段与 `<表名>_routes()`
  需用户自行登记（**字段/函数名一律 snake_case 表名**，与 `router/mod.rs` 既有 `xxx_routes()` 惯例一致）。

#### 3.15.1 生成**前端**产物同样要落真实路径跑类型检查（2026-09-26 第七轮；改 `api.tera`/`index.tera` 后必跑）

`.tera` 里的 `.ts` / `.vue` 只做字符串断言同样不可信。把渲染出的
`src/api/<module>/<table>.ts` 与 `src/views/<module>/<table>/index.vue` 落到 **stepby-vue 真实路径**后跑：

```bash
cd stepby-vue
NODE_OPTIONS="" node node_modules/vue-tsc/bin/vue-tsc.js --noEmit   # 期望 0 错误
NODE_OPTIONS="" npm run lint                                        # 期望 0 errors
# 校验后删除落盘文件（勿提交生成物）
```

第七轮实测暴露并修复 3 处真实缺陷（**crud 与 flow 都中招**）：
① `api.tera` 导出裸 `list` 与页面 `const list = ref([])` **重名冲突**（TS2440，生成页面直接编译失败）
→ API 函数改带实体前缀（`list<实体类名>`，与仓库既有 `listNotice` 惯例一致）；
② `:row-key="(row) => row.xxx"` 隐式 any（TS7006）→ 改用字符串 `row-key="xxxId"`；
③ api 函数未标注返回类型 ⇒ 推断 `AxiosResponse`，而 `request` 拦截器已解包为 `res.data` ⇒ `res.rows` 报 TS2339
→ 全部标注 `Promise<any>`（脚手架宽松型）。
回归锁：单测 `test_generated_frontend_is_typecheck_clean_by_construction`。

### 3.16 `networkidle` 会被 web-vitals 上报「卡死」（2026-09-26 第六轮；写 goto 必读）

**症状**：`--feature=51` 的步骤 13「SSO 客户端管理页正常渲染」恒 `page.goto: Timeout 30000ms exceeded`，
但**页面其实已经渲染成功**（`.el-table` 存在、非 404、后续步骤全绿）。属**假失败**。

**根因（探针实证）**：该页会由前端 web-vitals 上报 `POST /monitor/frontendError/report`
（`level:"info", source:"vital", name:"TTFB"…`，类 beacon 发送）。实测：
- 后端**已返回 200**（`response` 事件可见）；
- 但 Chromium/Playwright 对该请求**永不触发 `requestfinished`** ⇒ 它被永久计为 in-flight
  ⇒ `networkidle`（= 500ms 内无网络连接）**永远不成立**，必然吃满 30s 超时。
  探针输出：`still-inflight: 1 → POST /monitor/frontendError/report pending 27859 ms`。

**判据**：`goto` 超时 + 页面元素断言本可成立 + 悬空请求是 `/monitor/frontendError/report`
（或同类 beacon）三者同时出现 ⇒ **改等具体数据响应，不要用 networkidle**：

```js
// ❌ 会被 vitals beacon 卡死
await page.goto(url, { waitUntil: 'networkidle' })
// ✅ 等"数据驱动渲染"的那条响应（比全局空闲启发式更确定）
const listResp = page.waitForResponse(r => r.url().includes('/system/oauth/client/list') && r.status() === 200, { timeout: 15000 }).catch(() => null)
await page.goto(url, { waitUntil: 'domcontentloaded' })
await listResp
```

- 本仓既有容忍写法：`goto(...networkidle).catch(() => {})`（`main.mjs:257-259`）与
  `waitForLoadState('networkidle', {timeout:15000}).catch(()=>{})`（`:1280/:1317`）——**仅适用于
  "后续断言不依赖页面就绪"**的场景；依赖数据渲染的场景**必须**改为等具体响应（本轮功能 51 即此类）。
- **不要去"修" web-vitals 上报**：那是刻意的功能（前端指标回流 + 错误中心数据源），
  服务端行为正确（10ms 返回 200）。

### 3.17 能力位（Feature Flag）开启态活体联调配方（2026-09-26 批次 3；能力位改动必跑）

**为什么不能只靠 e2e**：`main.mjs` 是"一套环境跑全部功能"的断言式回归，而**能力位默认全关**
（关闭态即现状）。要把某个能力位开到 `full`，必须改平台层 `config.toml` 并**重启后端**——
e2e 无法在单次运行内完成"改配置 + 重启 + 断言"。故能力位类改动（批次 0/1a/1b/1c/2/3）
除单测外，**必须**做一轮下面的手工活体联调，并把它写回落地台账。

**步骤（以 `nav.l3` = 批次 3 为例，其它能力位同构）**

1. **打开平台层开关**（键**含点号必须加引号**，否则 TOML 解析成嵌套表、启动直接失败）：
   ```toml
   # stepby-axum/config/config.toml（本地文件，已 gitignore）
   [features]
   "nav.l3" = "full"
   ```
   重启后端，启动日志必须出现两行证据：
   - `WARN ... 能力位：平台层已放开以下能力 ... enabled=nav.l3=full`
   - `Phase 3.5h 已按能力位回填平台普通角色的已解锁菜单授权（perms 粒度） granted=N perms=...`
     （perms 粒度 + 档位阈值：`view_only` 只回填 `list`，`full` 才回填 `add/edit/remove`）

2. **（可选）看租户侧关闭态**：先不建租户做对照 —— 建一个临时租户后立刻用其管理员调该能力的
   接口，**应在权限中间件处 403**（`没有权限访问该资源`）。若这里返回 200，说明"关闭态出现了
   假入口"，是本批最严重的问题。

3. **开启态正/负路径**（平台 `admin` token 调管理面；租户 token 调业务面）：
   - 正路径：`POST` 建 1 行 → 用**租户管理员** `GET /getRouters` 验证**真实生效**
     （如 L3 换父 ⇒ 该节点出现在新父级下、`component` 必须**逐字未变**）；
   - 回退：改 `visible='1'` ⇒ 该节点落到 `hidden=true`；再删除该行 ⇒ 路由树**回到初始态**
     （`top` 数与父节点 `children` 数都要对得上）；
   - 负路径：不存在 ID / 平台专属 perms / 父级非法 / 重复挂载 ⇒ 应回 **400 业务码**
     （**出现 500 = 未处理的可空字段或约束冲突，属真缺陷**，见下）。

4. **必做回收**（否则污染后续 e2e 基线与平台姿态）：
   删 L3 行 → 删租户管理员用户（有用户时租户删不掉）→ 删租户 → `config.toml` 还原
   （删掉整个 `[features]` 段）→ 重启后端 → 确认启动日志回到
   `能力位：平台层全部关闭（默认安全姿态）`。

**本轮收益（真实缺陷样例）**：`POST /system/tenant/menu` 不带 `orderNum` 时返回 **500
`NOT NULL constraint failed: sys_tenant_menu.order_num`** —— DTO 把 `orderNum` 标为可选
（`#[serde(default)] Option<i32>`），但 sea-orm 的 `Set(None)` 会在 INSERT 里**显式写 NULL**、
**不触发列的 `DEFAULT 0`**。**通用教训**：任何"DTO 可空 → 直接 `Set(dto.field)`"的写入点，
都要先确认目标列是否 `NOT NULL`；是则必须补缺省（本仓既有口径 `Set(x.or(Some(0)))`）。
此类缺陷**只有活体联调能发现**：单测覆盖不到 SQL 约束，e2e 因为默认关而跑不到这个分支。

### 3.18 能力位「档位化」与可选集成点的开启态配方（2026-09-26 批次 A/C/D；改这批必跑）

§3.17 是**通用配方**（改配置 → 重启 → 正/负路径 → 回收）。本节的三个开关**各有专门的"档位边界"或"外部副作用"**，只跑单测不足以证明"关闭态即安全态"：

**(1) `backup.visibility` 档位边界（批次 A，⚠️ 旧键已改名）**

```toml
[features]
"backup.visibility" = "view_only"   # 先只读档
```
重启后端后（租户管理员 token）：

| 断言 | 期望 |
|---|---|
| `GET /system/backup/list` | **200**（仅本租户 `backup_type='tenant_export'` 行） |
| `GET /system/backup/{backupId}`（纯数字，本租户） | **200** |
| `GET /system/backup/download/{backupId}` | **403**（`view_only` **不含**下载） |
| `POST /system/backup` / `PUT /system/backup`（创建/恢复）/ `DELETE /system/backup/{id}` | **403 恒**（写面属平台专属，**不属任何档位**） |

再把 `"backup.visibility" = "full"` 重启 ⇒ `download` 变 **200**（其余写面仍 403）。
**反向验证**：改回 `off` 重启 ⇒ 上表四行**全部 403**，且启动日志回到「能力位：平台层全部关闭」。
> ⚠️ 旧键 `backup.readonly_visible` 已**失效**（未知 key 静默忽略 ⇒ 回落 `off`）。若改配置后行为"没变"，先确认没有写成旧键名。

**(2) `[sso]` 三个可选开关（批次 D，默认 `false`；需先 `sso.enabled = true`）**

| 开关 | OFF 断言（关闭态即现状） | ON 断言 |
|---|---|---|
| `introspection_enabled` | `POST /sso/introspect` ⇒ **404** | **200** + `{ "active": true, "client_id": ... }`；用**他客户端**签发的 AT 调 ⇒ `{"active": false}`；`discovery` 文档含 `introspection_endpoint` |
| `audit_authorize_get` | 走一次 `authorize` 后**操作日志无新增** | 操作日志新增 1 条（含 `client_id` / `redirect_uri` / `scope`），`oper_name=anonymous`、`tenant_id=0`（预认证端点无租户上下文，**属预期**） |
| `proxy_logo_uri` | consent 页 logo 直接指向 RP 的 `logoUri` | consent 页 logo 指向 `/sso/client-logo/{clientId}`；该端点仅 `image/*`、超 256KB 或 5s 超时 ⇒ 失败（**不跟随重定向**） |

**(3) `[acme] mode = "webhook"` 输出契约（批次 C，默认 `off` 无副作用）**

1. 起一个本地接收器（看请求头 + 验签），例如 `node -e` 起 8081 打印 `req.headers['x-stepby-event']` 与 body；
2. `config.toml` 置：
   ```toml
   [acme]
   mode = "webhook"
   webhook_url = "http://127.0.0.1:8081"
   secret = "test-secret"
   ```
3. 触发**状态迁移**（不是重复验证）：给某租户域名做一次**首次验证成功**（`verify_status` 0/2 → 1）⇒ 接收器应收 `cert.issue`；删除一个**已验证**域名 ⇒ 收 `cert.remove`。**重复验证同一域名不重复推送**（幂等由状态迁移保证）；
4. 用 `secret` 对原始 body 做 HMAC-SHA256 并 hex 比对 `X-Stepby-Signature`；
5. **负路径**：`mode = "webhook"` 但 `webhook_url` 留空/非法 ⇒ 启动日志必须打 **WARN**（拒绝静默失效）；
6. 回收：`mode = "off"` 重启 ⇒ 再触发迁移**无任何请求发出**。

**(4) `[scheduler].replicas` 误配自检（批次 E）**

```toml
[scheduler]
replicas = 2
cluster_mode = "auto"   # 默认值
```
重启 ⇒ 启动日志**必须**出现 WARN（提示"多副本 + auto 可能重复扫描"）；改 `cluster_mode = "leader"` 重启 ⇒ WARN 消失。**该开关不改变任何调度行为**（仅日志与自检）。

### 3.19 本轮（第十三批）新增开关的开启态配方（改这批代码必跑）

**(1) JWT 多密钥轮换（零停机，`[jwt].previous_secrets`）**

```toml
[jwt]
secret = "<新密钥 ≥32 字符>"
previous_secrets = ["<原密钥 ≥32 字符>"]   # 过渡期：仅验签回退
```

- 轮换前用**原密钥**启动并登录，保存返回的 `token`；
- 改成上表配置重启 ⇒ 用 `token` 访问 `/getInfo` 仍 **200**（存量会话**未被登出**）；
- 启动日志出现 INFO「JWT 密钥轮换过渡期」；
- 把 `previous_secrets` 清空重启 ⇒ 同一 `token` 变 **401**（轮换真正生效）；
- 反例：把 `previous_secrets` 里写 <32 字符或含 `change_me` ⇒ **拒绝启动**（fail-closed）。

**(2) 出站领域事件（`[events]`，默认 off）**

先起一个接收端：`python -m http.server 9000`（或 webhook.site），然后：

```toml
[events]
outbound = "webhook"
webhook_url = "http://127.0.0.1:9000/hook"
# secret = "<可选，配置后带 X-Stepby-Signature>"
```

- `off`（默认）时新建租户 ⇒ 接收端**零请求**（关闭态即现状）；
- `webhook` 时新建租户 ⇒ 收到 `tenant.created`，请求头含 `X-Stepby-Event: tenant.created`，
  信封含 `source/event/occurredAt/data`（`data.tenantId` 与新建结果一致）；
- 启停 / 删除 / 恢复分别对应 `tenant.status_changed` / `tenant.deleted` / `tenant.restored`；
- 接收端故意返回 500 ⇒ 后端只打 WARN，**租户业务仍成功**（fire-and-forget）；
- `outbound = "webhook"` 但地址填 `file:///tmp/x` ⇒ 启动打 **WARN** 且不发请求。

**(3) `[sso].userinfo_cache_ttl_secs`（默认 0 = 不缓存）**

- `0`（默认）：每次 `/sso/userinfo` 都回查令牌绑定 ⇒ 吊销 AT 后立即 401；
- 置 `60`：连续两次 `/sso/userinfo` 第二次命中服务端缓存（响应仍带 `Cache-Control: no-store`）；
  吊销 AT 后**最多 60 秒内仍可能返回 200**——这正是该开关需要自行权衡的代价；
- 置 `86400` ⇒ 生效值被夹到 **300**（`USERINFO_CACHE_MAX_SECS`）。

**(4) 表 × 过滤接入矩阵（替代人肉重读蓝本 §二/§三）**

```bash
node scripts/tenant-audit.mjs --matrix
# → docs/optimization/tenant-filter-matrix.generated.md
```

以源码为唯一真值（实体 `tenant_id` 列 × `TENANT_FILTER_MATRIX` 档位）。**该模式不参与 `--gate`**，
故不会扰动门禁基线键集；改实体或矩阵后重跑即可对齐。

### 3.20 治理注册表与「按租户筛选」开启态配方（第十四批；改这批必跑）

**(1) 治理项注册表抽出为零依赖共享 crate（`stepby-axum/governance`）**

```bash
cargo test -p governance --lib     # 注册表自洽 9 例（排序/唯一/默认 off/档位单调/收敛只收窄/值域）
cargo test --workspace --lib       # stepby-axum 960 例：既有单测一行未改即全绿 ⇒ 派生与原常量等价
```

- 新增能力位或参数项**只改 `governance/src/lib.rs` 一处**：启动兜底 `ensure_tenant_saas_governance`
  与迁移 `m20260925_000004` 会按 `Coverage` 四态（`Locked` / `Free` / `Ceiling` / `Private`）自动跟随，
  不再需要"同值本地副本 + 修改时人工两处同步"。
- **反向验证（可证伪）**：在 `CONFIGS` 里故意插入一个**乱序** key ⇒ `test_registry_ordering_and_uniqueness`
  立即变红；把 `Coverage::Ceiling` 误改成"取请求值" ⇒ `test_converge_ceiling_only_narrows` 立即变红。

**(2) `[ui].tenant_filter`（默认 `off` = 不提供入口 ⇒ 历史行为）**

```toml
[ui]
tenant_filter = "platform"   # off | platform | always
```

重启后端后：

| 断言（**平台**操作者） | 期望 |
|---|---|
| `getInfo` 返回体 | `showTenantFilter: true` |
| 操作日志 / 登录日志 / 前端错误 / 用户管理 搜索栏 | 出现「租户号」输入框（组件 `TenantFilter`） |
| 输入某租户号后查询 | 结果**仅**该租户行（显式 `tenantId` 与行级 `tenant_scope` **相与**） |

| 断言（**租户**操作者） | 期望 |
|---|---|
| `getInfo` 返回体（`platform` 档） | `showTenantFilter: false` |
| 手工构造 `GET /monitor/operlog/list?tenantId=<他租户>` | **200 但空集**（只收窄、不放宽 ⇒ 该筛选**不构成安全边界**） |

- 置 `always` 重启 ⇒ 租户操作者也出现输入框（传自己 = 结果不变，传他人 = 空集）；
- 置 `off` 重启 ⇒ 输入框消失且 `getInfo` 返回 `showTenantFilter: false`（**关闭态即现状**）；
- 负路径：写非法值（如 `"on"`）⇒ 启动 **WARN** 并回落 `off` 且不提供入口。

### 3.21 本轮（第十五批）专项方案落地配方（改这批代码必跑）

本批把台账 §8.17-C 登记的三项"单独专题"从登记转为**落地**（另两项经重分析判定"更优方案已存在/不宜实现"，见台账）。默认全部**关闭/现状**，故关闭态必须先跑一遍确认零回归。

#### (1) SSO D9：`client_secret` 零停机轮换（双密钥读取期）

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 客户端列表任选一行 → 点「轮换密钥」 | 弹确认 → 弹"一次性密钥"框，含**新密钥明文**（关闭后不可再查看） |
| 2 | 用**旧** `client_secret` 走 `POST /sso/token` | **仍可鉴权**（读到"旧密钥"WARN 即读取期生效）：密钥错 ⇒ `invalid_grant`；密钥对但码错 ⇒ 也是 `invalid_grant` |
| 3 | 用**新** `client_secret` 同上 | 立即可用 |
| 4 | 点「结束读取期」 | 再用**旧**密钥 ⇒ `401 invalid_client`（立即失效）；新密钥不受影响 |
| 5 | 再次点「结束读取期」 | 幂等成功 |

- 判定技巧：客户端鉴权**先于**授权码校验 ⇒ 用任意无效 `code` 即可把两段解耦 —— 密钥被接受 = `invalid_grant`；被拒 = `401 invalid_client`。
- 连续轮换两次 ⇒ 只有"最近一把"在读取期内，更早的密钥**不得复活**。
- 关闭态（未轮换过任何客户端）：`previous_client_secret_hash` 为 NULL ⇒ 行为与改造前逐字节一致。

#### (2) P2-33：`[server].http_status_convention`

| 档位 | 自定义业务码（如 TOTP `1003`） | 已知码（400/401/403/404/409/422/429/500/503） |
|---|---|---|
| `legacy`（**默认 = 现状**） | HTTP **200** + `body.code=1003` | 映射为同名真实 HTTP 状态 |
| `restful` | HTTP **400** + `body.code=1003` | **完全相同**（两档只在未归类码上分叉） |

- `restful` 装配后：网关/监控可直接按 HTTP 状态码告警；前端 `request.ts` 的成功/失败**两个**分支都识别 `body.code`，故 TOTP（1003）登录流程不受影响（错误分支已显式保留 `err.code = 1003` 供 `login.vue` 进入验证码步骤）。
- 负路径：写非法值（如 `"strict"`）⇒ 启动 **WARN** 并回落 `legacy`，**不**拒绝启动。

#### (3) `cargo-fuzz`（夜间独立 job）

- 本地：`cd stepby-axum; cargo +nightly fuzz build`；短跑 `cargo +nightly fuzz run <target> -- -runs=3000 -max_total_time=30`。
- **Windows 运行期注意**：nightly 的 fuzz 二进制**动态链接 ASan 运行时** `clang_rt.asan_dynamic-x86_64.dll`（不在 rustup 工具链里）。直接运行会以 `0xC0000135`（DLL 找不到）退出 ⇒ 需把其所在目录加入 `PATH`：
  - 优先用**与链接期同源**的那份（版本不符会变成 `0xC0000139` ENT_ENTRYPOINT_NOT_FOUND）；
  - 实测可用：`C:\Program Files\Microsoft Visual Studio\<ver>\Community\VC\Tools\MSVC\<ver>\bin\Hostx64\x64`；
  - Linux（CI 所用）无此问题。
- 与 `src/common/fuzz_invariants.rs`（stable 确定性不变式，随 `cargo test` 跑）**分工**：前者做覆盖率导向探索，后者做可回归的属性断言。
- CI：仅 `schedule`（夜间）+ `workflow_dispatch`，失败不阻断日间流水线；崩溃时 artifacts 保留最小复现输入。

### 3.22 Passkey / WebAuthn 开启态配方与验证策略（第十六批；改这批必跑）

能力位 `auth.webauthn`（`[features]` 段，默认 `off`）；配置面 `[webauthn]`（`rp_id` / `rp_name` / `origin` / `state_ttl_secs`）。

#### (1) 装配（**必须显式配信任锚**）

```toml
[features]
"auth.webauthn" = "on"

[webauthn]
rp_id = "localhost"                 # 域名后缀，不含 scheme/端口；留空则由 cors_origins 首个来源推导
rp_name = "Stepby"
origin = "http://localhost:8080"    # 含 scheme；留空同上
```

- ⚠️ 推导兜底是"末两段标签"的**保守启发式**（多级公共后缀不精确）⇒ 生产必须显式配置。
- ⚠️ 非 HTTPS 时浏览器不提供 `navigator.credentials`（`http://localhost` 例外）。
- ⚠️ 关闭态（默认）⇒ 6 条端点全 **404**；前端两处入口**同时**由能力位隐藏
  （第二十一批起：登录页 `webauthnSupported && webauthnEnabled`、个人中心页签 `v-if="userStore.showPasskey"`）。
  判据与端点守卫**同源** ⇒ **可见即可用、不可见即 404**，既不造假入口、也不藏真入口。

#### (2) 手工验证（浏览器）

| 步骤 | 期望 |
|---|---|
| 个人中心 → 「通行密钥」→ 添加 | 浏览器弹出 passkey 创建（Windows Hello / 安全密钥 / 手机）；成功后列表出现 1 条 |
| 退出登录 → 登录页「使用通行密钥登录」+ 填用户名 | 弹出凭据选择 → 通过后**直接进入系统**（无需密码/TOTP） |
| 删除该凭据后再用 passkey 登录 | 失败（无凭据）；用户名不存在 与 无凭据用户 的**提示必须同形**（防枚举） |
| **关闭能力位重启** | 登录页分隔线与按钮**都不出现**、个人中心**无**「通行密钥」页签，且控制台**无** `/system/user/webauthn/*` 404（第二十一批前的旧行为：入口在但请求 404 —— 假入口） |
| **开启能力位重启** | 上述两处入口**都要出现**（验证门控不会"误藏真入口"） |

#### (3) 自动化验证（本批已落地，改这批必跑）

- **Rust 集成测试**（主证据）：`cd stepby-axum; cargo test --lib webauthn::`
  - 能力位 off ⇒ 6 端点全 404；on ⇒ options 契约（43 字符 challenge / rp.id / ES256）；
  - 垃圾 finish ⇒ 400；未知用户与无凭据用户 ⇒ 与密码登录失败**全等**（防枚举）；凭据列表与**越权删除 404**；
  - **完整快乐路径（注册 + 无密码登录 + 令牌可用）**：由测试内的**纯 Rust 软件认证器**（ES256/COSE/CBOR）驱动，
    不依赖浏览器，也不需要 Redis 之外的额外服务；同时覆盖**重放/篡改/origin 不符**的负路径。
- **前端单测/类型**：`cd stepby-vue; npx vue-tsc --noEmit && npx vitest run`（含 `utils/webauthn.ts` 的 base64url 往返用例）。
- **e2e（浏览器真实凭据）**：如需浏览器级联调，可用 Chromium 的 CDP 虚拟认证器
  （`WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator`）驱动真实 `navigator.credentials`；
  本批未纳入 `main.mjs`（15k 行套件），故以 Rust 软认证器用例作为快乐路径主证据。
- **独立脚本 `webauthn.mjs`（浏览器级真实凭据三场景，不并入 main.mjs）**：
  密码登录→个人中心添加通行密钥（真实 attestation）→退出→passkey 免密登录（真实 assertion）→
  删除凭据后 passkey 登录失败（反枚举同形提示）。运行（后端 embed :8080 + 前端 preview :4173 需在跑，
  且平台能力位 `auth.webauthn=on`、`[webauthn] rp_id=localhost / origin=http://localhost:8080`）：
  ```bash
  cd stepby-vue/tests/e2e
  PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" \
  STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
  STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
  node webauthn.mjs   # 期望「总计 25 通过，0 失败」且 EXIT=0
  ```

#### (4) 双档验收流程（第二十一批起**强制**；改能力位门控必跑）

能力位门控是"两态"代码 ⇒ **只跑关闭态等于只验了一半**（关闭态全绿也可能把真入口一并藏掉）。
务必按序跑完两侧，并各自留存日志：

```bash
# ① 关闭态（默认，main.mjs 全量）：期望 107 + 223 + 445 = 775 通过 / 0 失败，且第二段告警数 = 0
# ② 开启态（临时改 config/config.toml，该文件 .gitignore ⇒ 不入库）
#    [features] "auth.webauthn" = "on"
#    [webauthn] rp_id = "localhost" / rp_name = "Stepby" / origin = "http://localhost:8080"
#    重启后端（无需重新构建前端：入口开关是 /getInfo 与 /captchaImage 的运行时下发值）
node webauthn.mjs           # 期望「总计 25 通过，0 失败」且 EXIT=0
# ③ 逐字还原 config/config.toml（复核 `[features]` 命中数 = 0）
```

- 第二十一批实测：① `107 + 223 + 445 = 775 / 0`（三段 EXIT=0，第二段 0 告警）；② `25 / 0`（EXIT=0）。
- ②的 25 条断言中「S2 登录页『使用通行密钥登录』入口可见」与「S1 初始凭据列表为 0 条」
  正是"入口不误藏 + 端点真的可用"的**可证伪**证据（若门控写反，第一步即 FAIL）。
- ①中出现 `⚠️ [404] GET /system/user/webauthn/credentials` ⇒ 门控退化（假入口回归），**必须**排查
  是否有人把 `v-if` 改回 `v-show`/去掉判断（Element Plus 会渲染 `v-show` 隐藏页签的内容，
  其子组件 `onMounted` 仍会探测未注册端点 ⇒ 必然 404）。
- ⚠️ **类名复用陷阱（2026-09-27 全量复跑抓出，改登录页/新增同视觉区块必读）**：新增区块**不得复用既有的
  "语义锚点"类名**。本批 passkey 分隔线最初为复用视觉样式而写成 `class="oauth-divider"`，而 `main.mjs`
  功能 55 正是用 `.oauth-divider` **计数**断言"分隔线出现与否与 `/oauth2/providers` 启用数一致"
  （`n>0 ⇒ divider>0`、`n==0 ⇒ divider==0`）；Chromium 下 `webauthnSupported` 恒真 ⇒ 无 OAuth 供应商时
  得到 `divider=1` ⇒ **功能 55 失败**（首跑 seg3 = 445/446，`api=0, btn=0, divider=1`）。
  **修法**：改用独立类名（`passkey-divider` / `passkey-divider-text`），视觉样式由两条选择器并列共用；
  **不要**改断言去迁就 —— 那会丢掉"渲染缺失 vs 策略隐藏"的区分能力。**通用判据**：凡被 e2e 以类选择器
  计数/断言的元素，其类名即**契约**；新增同视觉区块请另起类名 + CSS 并列选择器。

### 3.23 本轮（第十八批）新增开关的开启态配方（改这批代码必跑）

本批落地两项"原登记 / 待补"的能力，**默认值一律 = 现状**（关闭态逐字节等价），故先跑默认档确认零回归，再按下表各跑一遍开启态。

#### (1) `[resilience].outbound_breaker`（#10 出站 webhook 熔断）

```toml
[resilience]
outbound_breaker = "on"    # off（默认，= 现状）| on
failure_threshold = 3      # 连续失败达该次数 ⇒ 打开（夹取 1..=1000）
cooldown_secs = 10         # 打开后的冷却秒数（夹取 1..=86400）
```

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | `[events] outbound="webhook"` 指向一个**必然失败**的地址（如 `http://127.0.0.1:9/hook`），触发 3 次租户状态变更 | 每次事件打 1 条 WARN；第 3 次出现「连续失败达阈值，熔断打开」WARN |
| 2 | 再触发 1 次事件 | **不再发请求**（只打 1 条 DEBUG「已被出站熔断跳过」），业务结果不受影响 |
| 3 | 等过 `cooldown_secs` 再触发 | 放行**一次**探测（半开）：失败 ⇒ WARN「熔断保持打开」并重新计时 |
| 4 | 把目标地址改回可用端点再触发 | 探测成功 ⇒ WARN「熔断恢复」，之后每次照常发送 |
| 5 | 关掉熔断（`off`）复跑第 1 步 | 每次都尝试发送（**关闭态零行为变更**），且 `sso`/`events` 的行为与改造前逐字一致 |

- 单测证据（不需要网络）：`cd stepby-axum; cargo test --lib common::breaker`（11 例：关闭态不记账、阈值打开、冷却到期单探测、探测成功恢复、探测失败重计时、成功清零、多 URL 隔离、解析与夹取、未 init 恒放行、host 脱敏）。
- ⚠️ 熔断是**进程内**状态；多副本部署各实例独立判定（本能力不引入跨实例共享态）。
- ⚠️ 日志里 URL **只记 host**（脱敏，避免 query/secret 落日志）。

#### (2) `[sso].consent_ticket = "required"`（SSO-3 / D9 最后一项）

```toml
[sso]
enabled = true
# 其余 SSO 必填（issuer / CONFIG_ENC_KEY）见 §3.18
consent_ticket = "required"
consent_ticket_ttl_secs = 300   # 夹取 60..=1800
```

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 建一个 `consentRequired=1` 的客户端，浏览器走 `/sso/authorize?...` | 302 到 `/sso-consent?...&ticket=<32 位随机 id>`（**query 里必须出现 ticket**） |
| 2 | 同意页点「批准」 | 正常签发 code 并回跳 RP（前端已自动回传 ticket） |
| 3 | 用 curl 直发 `POST /sso/consent`（**不带** ticket） | `400`，文案「同意票据无效或已过期，请重新发起授权」 |
| 4 | 同请求带上任意伪造 ticket | 同上 400（不区分"票不存在"与"参数不符"，防探测） |
| 5 | 带**合法** ticket 但改 `scope` / `state` | 同上 400，且该票**未被消费**（用原参数再发一次仍成功） |
| 6 | 用合法 ticket 且参数一致再发一次 | 成功；**同票重放** ⇒ 400（一次性） |
| 7 | 把 `consent_ticket` 改回 `off` 复跑 | 不带 ticket 也能成功（**关闭态零行为变更**，与历史行为逐字节一致） |

- 集成测试（主证据，无需手动）：`cd stepby-axum; cargo test --lib test_sso_consent_ticket_required`（覆盖 ①无票 ②伪造票 ③改参不消费票 ④一致成功 ⑤同票重放拒绝）；默认档对照见 `test_sso_consent_flow`（不带票也成功）。
- 前端守卫：`cd stepby-vue; npx vitest run src/views/sso/consent.ticket.test.ts`（断言同意页读取并回传 `ticket`，且不把它渲染到页面上）。

#### (3) P2-33 双档 e2e 回归脚本 `http-status-convention.mjs`

`main.mjs`（15k 行套件）整体跑在**默认 `legacy` 档**，无法证明 `restful` 档下的前端链路；
`http-status-convention.mjs` 用**真实后端 + 真实浏览器**把"未归类业务码"（TOTP `1003`）这条路跑穿，
**不 mock、不替换浏览器 API**。

```bash
cd stepby-vue/tests/e2e
# ① 默认档（后端按 config.toml 启动，http_status_convention 缺省 = legacy）
PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" \
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
EXPECT_CONVENTION=legacy node http-status-convention.mjs      # 期望「总计 22 通过，0 失败」EXIT=0

# ② restful 档：见下方"临时 CWD 装配"后把端口/`EXPECT_CONVENTION` 换成 restful 再跑一遍
```

- **装配 `restful` 档（临时 CWD，绝不改仓库 `config/config.toml`）**：
  1. 建临时目录（如 `$env:TEMP\stepby-hsc\`），复制 `config/config.toml` 进去，把
     `[server].http_status_convention` 改为 `"restful"`、`[server].port` 改为**另一个空闲端口**
     （示例用 **8082**；⚠️ 本机 8081 可能被无关项目占用，**先确认端口空闲**再选）；
  2. **必须同时复制 `stepby-axum/.env` 到临时目录**（⚠️ 本轮实测踩坑）：`main.rs` 用
     `dotenvy::dotenv()` 从**当前工作目录**加载 `.env`，而 `JWT_SECRET` / `CONFIG_ENC_KEY` /
     `SSO_ENABLED` / `SSO_ISSUER` 都在 `.env` 里 ⇒ 漏拷会依次表现为：SSO 启动校验直接失败退出、
     `CONFIG_ENC_KEY` 未配置导致 `POST /system/user/totp/setup` 返回 **500**（fail-closed）；
  3. 在该目录下建 `frontend-dist` 目录（**junction** 指向仓库的 `stepby-axum/frontend-dist`）
     与 `data` 目录（**复制** `data/stepby.db`：`[database].url` 是 `./data/stepby.db` 相对路径，
     直接跑会创建一个空库 ⇒ 无表无种子数据），`frontend-dist` 与 `data` 都是相对 CWD 解析的；
  4. 用该 CWD 启动 `stepby-axum.exe`（`EMBEDDED_FRONTEND=true`），确认启动日志里
     `HTTP 状态码约定 = restful`；
  5. 跑 `FRONTEND_URL=http://localhost:8082 BACKEND_URL=http://localhost:8082 EXPECT_CONVENTION=restful node http-status-convention.mjs`；
  6. 收尾：停进程、删临时目录（**不要**在仓库内留 `config.toml` 副本或 `.env` 副本）。
- 脚本断言要点：`body.code === 1003` 两档一致；HTTP 状态 legacy=`200` / restful=`400`；
  两档都必须**进入验证码步骤**并在补码后**真正进入系统**；错误凭据两档都弹同一条 Toast 且停留 `/login`。
- 一次性用户（`e2e_hsc_*`）由脚本创建、绑 TOTP、跑完**硬删**（含异常路径兜底清理），不留残留。
- ⚠️ 脚本以 `body.code` 为权威业务码，**不**假定 HTTP 状态 ⇒ 同一份脚本可在两档复用（档位靠 `EXPECT_CONVENTION` 断言）。
- **本脚本已抓出并修复的真实缺陷（P0-4 链路断裂）**：`api/login.ts` 与 `store/modules/user.ts` 此前**未透传 `totpCode`**
  ⇒ 已启用 TOTP 的用户进入"动态验证码"步骤后，第二步请求体与第一步完全相同 ⇒ 后端**再次**返回 1003
  （该码按设计**不弹 Toast**，表示"继续输入"）⇒ 用户表现为"点了登录没反应、永远进不去"。修复后守卫见
  `stepby-vue/src/api/login.totp.test.ts`。**教训**：凡"多步登录/多步提交"链路，断言必须覆盖**最后一步真的带上了新参数**，
  只断言"进入了第二步"会漏掉这类断链。

### 3.24 富文本编辑器键盘可达性（U4）配方与验证策略（改 `components/Editor` / `MarkdownEditor` 必跑）

**背景（U4 是长期登记的唯一实质缺口）**：`ANALYSIS_FULL-2026-08-20.md §5.2 U4` 登记"富文本编辑器键盘可达性"未做。
2026-09-28 回代码 + 回真实 DOM 取证后确认并修复，**不是**"加个 tabindex"就完事 —— 实测缺的是**可访问名称**与**焦点可见**。

#### (1) 修复前的真实 DOM 现状（Chromium，公告管理「新增」弹窗内）

| 元素 | 修复前 | 影响 |
|---|---|---|
| `.ql-editor`（contenteditable 编辑区） | 无 `role` / 无 `aria-label` / 无 `aria-multiline`，`tabIndex = -1` | 读屏只读到"无名可编辑区域"；键盘无法 Tab 进入 |
| `.ql-picker-label`（字号/标题/颜色/背景/对齐 5 个下拉） | 有 `role="button"` + `tabindex="0"`，但**无可访问名称** | 读屏只念"按钮" |
| `.ql-toolbar` | 有 `role="toolbar"`，无名称 | 区域不可定位 |
| 工具栏 `button` | 有 `aria-label`，但是 **Quill 硬编码英文**（`list: ordered` / `indent: -1`） | 中文界面下读屏念英文 |
| `.ql-picker-item`（尤其色板项） | 免文本项**无可访问名称** | 读屏念不出颜色/对齐 |

#### (2) 修复要点（`components/Editor/index.vue`）

- 新增 `applyEditorA11y()`：编辑区补 `role=textbox` + `aria-multiline=true` + `aria-placeholder` +
  **`tabindex=0`** + 本地化 `aria-label`；工具栏区域补名称；按钮把 Quill 的英文 `aria-label`
  **按映射表换成本地化文案**并同步写 `title`；5 个下拉的 label 与全部 item（含纯色块项）补名称。
- 名称来源是 i18n 新增的 `editor.a11y.*`（zh-CN / en-US 双语），`watch(getLanguage())` **切换语言后重放**
  （属性是命令式写入的，不会随 i18n 自动更新）。
- `focus-visible` 可见焦点：工具栏按钮 / 下拉 label / 下拉项 / 编辑区统一 `outline: 2px solid var(--el-color-primary)`
  （**仅 `:focus-visible`**，不干扰鼠标点击）。
- `components/MarkdownEditor/index.vue`：上游 `md-editor-v3` **已**为工具栏按钮写好本地化 `aria-label`+`title`
  （无需改），但其输入区（CodeMirror 的 `.cm-content`，`role="textbox"`）与根容器**没有可访问名称** ⇒
  组件在 `onMounted` 后补 `aria-label`（根容器同时补 `role="group"`），同样随 locale 重放。

#### (3) 自动化验证（改这批必跑）

- **浏览器级（主证据）**：`node editor-a11y.mjs`（后端 embedded :8080 在跑）
  ```bash
  cd stepby-vue/tests/e2e
  PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" \
  STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
  STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
  node editor-a11y.mjs      # 期望「总计 22 通过，0 失败」EXIT=0
  ```
  断言分四组：**S1** 编辑区语义（role / aria-multiline / 非空名称 / aria-placeholder / tabindex）；
  **S2** 工具栏区域名称 + 14 个按钮全部"有名 + 有 title + **名称已本地化**"（"仍是 Quill 英文原值即 FAIL"是可证伪断言）；
  **S3** 5 个下拉的 label 与**全部 item**（含色板）均有非空名称；
  **S4** 键盘链路：编辑区可键盘输入 → `Shift+Tab` 可达工具栏 → 聚焦按钮**真的有可见 outline**
  （`:focus-visible` 生效）→ 全选后 `Enter` **真的触发加粗**（产出 `<strong>`）⇒ 证明"可键盘操作"而非仅"有名"。
  ⚠️ 该脚本用 `addInitScript` 预置 `localStorage['stepby-layout-tour']='skipped'`：否则新手引导遮罩
  （`.stepby-tour-mask`）会拦截点击（实测首版即因此 30s 超时）。
  ⚠️ **不要**在编辑器弹窗内按 `Escape`（会关闭 Element Plus 弹窗 ⇒ 元素 detached）。
- **组件级（MarkdownEditor 无消费页，用 jsdom 挂载真实组件）**：`npx vitest run src/components/MarkdownEditor/index.a11y.test.ts`
  （3 例：输入区 role/名称、根容器 group 名称、工具栏按钮全部具名）。
- **i18n 键平价**：新增的 `editor.a11y.*` 必须 zh-CN / en-US 同步（`src/i18n/i18n-keys.test.ts` 会兜底）。

#### (4) 关闭态 / 兼容性说明

- 本项是**无障碍增强**，不新增配置开关（项目准则里的"默认关"适用于**高危能力**；无障碍属性属纯增益，
  对所有部署一律生效），也不改变任何布局与交互行为（仅新增属性与 `:focus-visible` 样式）。
- 属于**深色/浅色**与**语言切换**下均生效的实现（名称随 locale 重放；焦点色用主题变量 `--el-color-primary`）。

### 3.25 本轮（第二十批）新增/修改项的开启态配方（改这批代码必跑）

**本批有「运行时语义」的改动**（OpenAPI 注解 / 日志级别 / 前端死全局清理不改变运行语义，跑 §3 全量 e2e 即覆盖）：

#### (1) `[rate_limit].mode = redis`（M-8 收口，**默认 `local` = 现状**）

```bash
RATE_LIMIT_MODE=local <启动后端>   # 关闭档：进程内令牌桶，Redis 中**不得**出现 rate_limit:{tid}:{ip} 桶键
RATE_LIMIT_MODE=redis <启动后端>   # 开启档：Lua 原子分布式令牌桶，**真写** HASH 桶键，多实例共享配额
```

- **可证伪判据（真 Redis，非 mock）**：`cargo test --lib integration_tests::sys_rate_limit::test_rate_limit_mode_switch_local_vs_redis`
  —— ①`local` 档不写桶键；②`redis` 档真写桶键且带 `tokens` 字段；③收紧配额后第 3 次请求**真返回 429**。
  另一例 `test_redis_token_bucket_atomic_and_ttl` 断言原子计数 / `PTTL>0` / 补充恢复 / 键间隔离。
- **fail-closed**：Redis 不可用时，开启档必须返回 **503**（限流器不可用却放行 = 攻击者获准），不得静默降级。
- TTL 由 `max(key_ttl_secs, 桶自然补满秒数×2)` 决定（否则桶未补满即过期并按满桶重建 ⇒ 限流被悄悄放宽）。

#### (2) Redis 命令超时护栏（`utils::redis::cmd_timeout`，161 处包裹）

- 语义：超时（`REDIS_CMD_TIMEOUT_SECS = 3`）统一转 `RedisError`，调用方走**原有**错误分支，无需改代码。
- ⚠️ **跑门禁时不要与前端 `vitest` 并发**：3s 是**墙钟**超时；重度 CPU 争抢（vitest 单次 `environment` 可达 170s+）
  下"其实已完成"的命令可能来不及被 poll 而**假超时** ⇒ SSO 用例假红。本轮实测踩到：并发时
  `integration_tests::sso::{full_flow_and_replay, d3_refresh_rotation_and_revoke}` 断言 `userinfo 应 200` 得 **401**；
  **单独串行重跑即 1020/0 全绿**。⇒ 门禁按 §5 **串行**执行；出现此类红先串行复跑取净结果，不要改代码。

#### (3) WebHook 签名密钥脱敏（安全）+ `edit` 不再清空密钥

- 判据（可证伪）：`cargo test --lib integration_tests::sys_web_hook::test_web_hook_secret_masked_and_preserved_on_edit`
  —— `list` / `{id}` 的 JSON **不含** `secret` / `tenantId` / `delFlag` 且 `hasSecret` 正确；
  且「编辑不传 secret」「传空串」后 `hasSecret` **仍为 true**（旧代码必红）。
- 手工核对：`GET /prod-api/monitor/webHook/list`，响应中搜不到密钥明文。

#### (4) nginx 缓存规则（`stepby-vue/nginx.conf` 与 `deploy/helm/stepby/templates/configmap-nginx.yaml` **必须同改**）

真实 nginx 实测手法（本轮据此验收，可复现）：

```bash
docker run -d --name stepby-nginx-test --add-host backend:127.0.0.1 -p 18080:80 \
  -v "<repo>/stepby-vue/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "<repo>/stepby-vue/dist:/usr/share/nginx/html:ro" nginx:1.27-alpine
curl.exe -sI http://localhost:18080/index.html              # no-cache, must-revalidate（单条）
curl.exe -sI http://localhost:18080/static/js/index-*.js    # public, max-age=31536000, immutable（单条）
curl.exe -sI http://localhost:18080/sw.js                   # no-cache, no-store, must-revalidate + Expires: 0
curl.exe -sI http://localhost:18080/system/user             # SPA fallback 亦 no-cache（try_files 内部重定向生效）
```

- Helm 变体校验：把 configmap 的 `default.conf` 块按 4 空格反缩进渲染
  （`{{ include "stepby.backendName" . }}`→`backend`、`{{ .Values.service.port }}`→`8080`），
  再 `docker run --rm --add-host backend:127.0.0.1 -v <rendered>:/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine nginx -t`
  （本轮实测：`nginx -t` 通过，且 4 条 `curl -I` 结果与 `nginx.conf` **逐条一致**）。
- ⚠️ 教训：本轮 `nginx.conf` 已去重（单条 Cache-Control）而 Helm 变体仍为 `expires 1y` + `add_header`
  （两条头），且 Helm 变体**整块缺失** SW 禁缓存块 ⇒ 改 nginx 缓存必须**两处同改**并各自实测。

#### (5) 用户 `sex` / `status` 枚举校验（非法值 400）

- 判据：`cargo test --lib test_normalize_sex_accepts_registered_enum_only` / `test_normalize_user_status_accepts_registered_enum_only`
  （已登记值放行、空值归一为未设置、`trim` 生效、非法值一律拒绝）。
- 手工：`PUT /prod-api/system/user` 带 `"sex":"9"` 应得业务码 **400**（此前会静默入库）。

#### (6) 环境：**必须先重启服务进程，跑在最终产物上**（否则"假绿"）

- 旧的 `:8080` 后端进程是**上一批的二进制**、旧 `:4173` preview 也在跑：不重启就测不到本批改动。
  顺序固定为：`build:embedded` → 拷入 `stepby-axum/frontend-dist/` → `build:prod`（留 `dist/`）→ `cargo build`
  → 以 `EMBEDDED_FRONTEND=true SSO_ENABLED=true` 启动 `:8080` → `vite preview --port 4173`。
- 启动方式：**必须在本工具中以「后台任务」方式常驻**（前台 `Start-Process` 曾出现进程随调用结束而消失，
  导致 e2e 首步登录页超时）。启动后先 `curl http://localhost:8080/health` 确认 `db/redis` 双 UP。

### 3.26 本轮（第二十一批）新增开关的开启态配方（改这批代码必跑）

**本批有「运行时语义」的改动**：能力位前端下发（假入口收敛）+ 登录风控 / 上传扫描集成点（均默认 `off`）
+ `menu_type` 常量化（纯重构，无行为变更）+ cron DTO 上限对齐 `64`。

#### (1) 能力位前端下发（`auth.webauthn`）——**本批最重要的可证伪点**

```bash
# 关闭档（默认，= 现状）：能力位 auth.webauthn 缺省 off
curl.exe -s http://localhost:8080/captchaImage                                  # ⇒ "webauthnEnabled": false
curl.exe -s -H "Authorization: Bearer <AT>" http://localhost:8080/getInfo        # ⇒ "showPasskey": false
curl.exe -s -o NUL -w "%{http_code}" -H "Authorization: Bearer <AT>" \
  http://localhost:8080/system/user/webauthn/credentials                        # ⇒ 404

# 开启档（另需配 [webauthn] rp_id / origin 使端点真的可用）
#   ⇒ captchaImage.webauthnEnabled = true；getInfo.showPasskey = true；上述端点 ⇒ 200
```

- 可证伪回归锁：`cargo test --lib integration_tests::capability_features::test_ui_entry_flags_are_delivered_and_follow_capability`
  —— 除断言四个开关的**下发值**外，**交叉锁定**「入口开关 false ⇒ 端点确实 404」「为 true ⇒ 端点确实 200」，
  防止"入口隐藏了但接口还能调"或反之。
- 手工：登录页不应出现「通行密钥登录」分隔线与按钮；个人中心不应出现「通行密钥」页签；
  浏览器控制台**不应有 `/system/user/webauthn/*` 的 404 报错**（这正是本批修掉的假入口）。
- **本批实测（两档都跑）**：关闭态 `main.mjs` 三段 `107 + 223 + 445 = 775 / 0`，第二段告警 **3 → 0**；
  开启态 `node webauthn.mjs` **25 / 0**。验收流程与判据见 §3.22(4)。
- ⚠️ 本批同时修掉一个**长期存在但从未被发现**的缺陷：`GetInfoResult` 此前**从未包含**
  `showTenantColumn` / `showTenantFilter` ⇒ 前端「所属租户」归属列与「按租户筛选」入口**从未出现过**。
  验证：`getInfo` 响应中这两个字段**存在且为布尔**（修复前是 `undefined`）。

#### (2) `[risk_control]`（登录面风控，**默认 `off` = 现状**）

```bash
# 关闭档（默认）：任何 UA 都能进入正常登录流程
curl.exe -s -X POST http://localhost:8080/login -H "User-Agent: curl/8.0.1" \
  -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
  # ⇒ 走正常流程（失败在验证码/口令，而**不是** 403 风控）

# 开启档
RISK_CONTROL_LOGIN_UA_FILTER=block <启动后端>
#   curl UA   ⇒ 403 + error.auth.ua_blocked
#   浏览器 UA ⇒ 正常流程
```

- `strict` 档额外拒绝空 UA（不带 `User-Agent` 头）。
- 留痕：被拒时 `sys_logininfor` 新增 1 行 `status='1'`、`msg=登录客户端特征被风控策略拒绝`。
- 可证伪单测：`cargo test --lib common::risk_control`（6 例：`off` 恒放行 / 大小写无关子串 /
  空 UA 仅 `strict` 拦 / 空白特征不匹配 / 粗粒度地区键 / 同省不同城不告警）。
- ⚠️ 三条登录链路（密码 / WebAuthn / OAuth）**共用同一判据**；若只改了密码链路，另两条会漏判。

#### (3) `[risk_control].login_geo_alert = alert`（异地告警，**只告警不拦截**）

- 判据：同租户内同用户名最近一次**成功**登录的**国家 + 省份**与本次不同 ⇒ 打 WARN，且本次**成功登录日志的
  `msg`** 变为 `异地登录告警：X 变更为 Y`（普通成功登录为 `登录成功`）。
- 快速构造：先用 A 地区出口登录一次（产生历史行），再用不同省份出口登录（代理 / VPN）。
- 边界（**必须不告警**）：首次登录 / 归属地库未命中 / 只有"中国"这种粒度 / 同省换城市换 ISP。

#### (4) `[upload_scan]`（上传扫描，**默认 `off` = 零出站**）

```bash
# 关闭档：url 指向一个必然无人监听的端口，上传仍必须成功（证明"一个字节都不出站"）
UPLOAD_SCAN_MODE=off UPLOAD_SCAN_URL=http://127.0.0.1:9/scan <启动后端>
curl.exe -F "file=@some.png" http://localhost:8080/common/upload      # ⇒ 200（若真发请求必然连接失败）
```

- 可证伪单测：`cargo test --lib common::upload_scan`（4 例：`off` 档零出站 / 非法与内网地址一律判"不可用" /
  响应契约解析（缺 `clean`、非布尔一律视为不合约）/ `fail_closed` 语义）。
- 生效入口 3 处（均在**落盘之前**）：`/common/upload`、`/system/file/upload`、`/system/user/profile/avatar`。
- ⚠️ **真正的端到端扫描需要真实 AV 端点**——SSRF 守卫会拒绝环回地址，故本地 stub 无法作为端到端证据；
  部署侧验收见 `deploy/README.md` §7.2「上线核对」新增两条（EICAR 样本 ⇒ 400；停掉端点 ⇒ 503）。

#### (5) `menu_type` 常量化（纯重构，无行为变更）

- 三处调用点改为引用 `common::constants::menu_type`（`DIR`/`MENU`/`BUTTON`），**取值不变**
  （`common::constants::tests::test_menu_type_values_are_persisted_contract` 锁死）。
- 回归判据：§3 三段全量 e2e 中菜单/路由相关断言（`getRouters` 与侧边栏）全绿即证明无回归。

#### (6) cron 表达式上限对齐（`64`）

- 手工：`POST /prod-api/monitor/job` 传 **65 字符**的 `cronExpression` ⇒ 应得业务码 **400**
  （此前 garde 上限 255 会放行，随后落库报 500）。

## 4. source-check 防混淆约定（重要）

Vite/Rolldown 生产构建会**混淆 composable 函数名**，但**保留字符串字面量**。
`stepby-vue/tests/e2e/main.mjs` 中的 source-check 必须断言“稳定字符串”，否则在 prod 包里查不到符号 → 假失败。

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
- 后端：`cargo check --workspace --all-targets`、`cargo test --workspace --lib`（基线 **1020 passed / 0 failed + governance 9**，需本机 Redis 在线；无 Redis 时以 `cargo clippy --all-targets` 编译校验）、`cargo clippy --workspace --all-targets -- -D warnings`（0 项目警告；仅第三方 `proc-macro-error2` future-incompat 提示，非本仓库代码）、
  `cargo fmt --all -- --check`（0 差异；2026-09-26 已清理 `rustfmt.toml` 中的 nightly 专属选项，稳定工具链下不再红）。
  - Windows 下 `node_modules/.bin/vite` 是 sh 脚本，PowerShell 直跑会 `SyntaxError: missing ) after argument list`；
    改用 `node node_modules/vite/bin/vite.js build --mode <mode>` 等价且跨 shell 稳定。
  - `cargo test --lib` 曾因 `test_support::migrated_db()` 以 `pid+nanos` 命名临时库、Windows 时钟粒度约 100ns 导致并行测试抢同一文件并发 `Migrator::up` → `UNIQUE constraint failed: seaql_migrations.version`（偶发）。已加进程内 `AtomicU64` 自增序号消除，须连跑两次确认不再 flaky。
- 类型导出：`cargo ts`（= `cargo run --bin export_ts`）刷新 ts-rs 生成的前端类型（当前 **50** 个类型；新增带 `#[ts(export)]` 的类型若非既有类型的依赖，**必须**在 `src/bin/export_ts.rs` 的清单里登记一行，否则 `cargo ts` 会静默漏导——本轮 `FlowDoneVo` 即因此先漏后补）；`cargo run` 因新增 `export_ts` bin 已在 `Cargo.toml` 设 `default-run="stepby-axum"` 消歧义。
- CI 额外强制：`stepby-axum` job 校验 ts-rs 生成的 TS 类型与 `stepby-vue/src/types/api/generated/` 一致（`git diff --exit-code`）；`compose-config` job 对全部 5 个编排执行 `docker compose config --quiet`（含 `include` 复用的 `deploy/docker-compose.db.yml`）。
- 全部通过后，stepby-vue 与 stepby-axum 分别提交；e2e 套件随 stepby-vue 提交（位于 `stepby-vue/tests/e2e/`）。
- 多租户（根仓）：`node scripts/tenant-audit.mjs --full` 必须 `EXIT=0` 且 **R8.1–R8.7 全 PASS**；
  CI 门禁为 `--full --gate`（与已提交基线 `docs/optimization/tenant-audit.json` 做差集，**新增非 info 候选即 FAIL**）。
  **R9（2026-09-26 新增·调用点复核锁）**：R1 白名单按 `file::fn` **函数级**豁免 ⇒ 被登记的仓储方法
  **永久不再产生 R1 候选**（"R1=0"有假绿风险）。R9 对白名单函数的**调用点**做复核：调用方函数体内
  无 tenant 证据 ⇒ 产出 `low` 候选，候选键含调用方 `file::fn` ⇒ **新增调用点 = 新键 = 门禁 FAIL**；
  已复核接受的调用点登记 `scripts/tenant-audit-allow.json` 的 `callSites`（键
  `"<calleeFile>::<calleeFn> => <callerFile>::<callerFn>"`）。局部复核：`--full --rule=R9`。
  产物 `docs/optimization/tenant-audit-report.md` 是**候选集**，每条需回代码复核，
  口径见 `docs/optimization/topic-multitenant-sso-audit-2026-09-23.md` §30.2.5/§30.2.6。
