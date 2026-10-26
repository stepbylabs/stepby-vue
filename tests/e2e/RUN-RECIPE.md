# e2e 套件运行配方（已验证）

> 本文件记录 `stepby-vue/tests/e2e/main.mjs`（功能数以文件内**注册表自检**为唯一事实源：编号 1..N 连续、
> 无重复、`features.length === maxId`；b73 起为 **143**，套件已并入 stepby-vue 仓库；b71 订正：
> 原头部长期写"75 个功能"是批四十前后的历史枚举，功能数已随批次追加，见 main.mjs 头部同一条订正）
> 在本地跑通所需的**完整环境**，
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
- **跑任何浏览器级验证之前，先核对 :8080 上到底是哪个二进制**（2026-10-19 实测踩中）：恢复期在
  `C:\stepby-restore\merged` 里编的 debug 服务从 09:12 起一直占着 8080，之后所有打
  `localhost:8080` 的验证测的都是**另一棵树、上一轮的代码**，而脚本毫无提示。核对命令：
  ```bash
  netstat -ano | grep ":8080.*LISTENING"        # 取 PID
  powershell -NoProfile -Command 'Get-CimInstance Win32_Process -Filter "ProcessId=<PID>" | Select-Object -ExpandProperty ExecutablePath'
  ```
  `stepby-axum/start-backend.mjs` 已把这条判据内置：`ALREADY_UP` 分支会比对监听进程镜像路径与
  `target/debug/stepby-axum.exe`，不一致直接 `[FATAL]` + 退出码 1（确实要连远端/容器服务时加
  `--allow-remote`）。实测三支：异产物（release exe 占 8080）⇒ EXIT=1；同产物 ⇒
  `ALREADY_UP（…与本启动器同产物）`；无服务 ⇒ spawn 后 2s `BACKEND_UP`。
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
node main.mjs --headless
```

- **不要手写 `PLAYWRIGHT_BROWSERS_PATH`**：需要的构建号由 `tests/e2e/node_modules/playwright`
  的版本决定（1.61.1 → `chromium-1228`；1.62.1 → `chromium_headless_shell-1234`）。
  指到不匹配的目录会在起手就 `Executable doesn't exist`，而两处目录都存在时这个错误
  看起来像"环境没装浏览器"。走默认缓存即可；要核对就一行：
  `node -e "console.log(require('playwright').chromium.executablePath())"` 再 `ls` 该路径。
  b77 实测：`D:/Projects/.pw-browsers` 只有 1234，而当时解析到的 1.61.1 要 1228 ⇒ 整套 e2e 起不来；
  b78 已把四处历史启动脚本与三处脚本文档里的写死目录全部删掉（见 §3.x 浏览器引擎段）。

- 不带 `--feature` = 跑**全部已注册功能**。总数不在文档里写死：以运行时"注册表自检"那一行为准
  （b74 起为 `1..144`，且自检钉住"编号连续 + 无重复 + 数量===最大编号"，历史上这里长期写 75、
  脚本打 142、AGENTS 写 143，三方都不对——见 main.mjs 注册表自检上方的注释）。
- 选择器：`--feature=54` 单功能；`--feature=1-20,51` 集合（区间+逗号，轮4 新增）——全量超 10 分钟时
  **按当前注册总数均分三段**前台直跑直等（144 项 ⇒ `1-48 / 49-96 / 97-144`），各段回合即得完整汇总，不挂后台。
- （**历史口径，功能数还是 75 的 2026-09-28 第二十一批**）按 `1-20 / 21-40 / 41-75` 三段跑，
  实测 `107 + 223 + 445 = 775 通过 / 0 失败`（三段 EXIT=0，日志无 `❌`；跑前 `/health` = `db UP / redis UP`）。
  **该 775 不是当前基线**，当时的分段区间也不覆盖 76..144；当前权威总数与分段结果见根仓 `AGENTS.md`
  的"测试门禁全景"表与最近批次台账。
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
  - 文件跨租户隔离 403（`/common/download/resource`、`/uploads/{tid}/...`）**）。
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
FRONTEND_URL=http://localhost:8080 \
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node collect-warnings.mjs
# 交互态（打开“新增”/行内“编辑·查看”对话框再取消，暴露仅交互态才渲染的报错，如 i18n 编译错误）：
INTERACT=1 FRONTEND_URL=http://localhost:8080 \
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node collect-warnings.mjs
# 期望（历史基线，54 条口径）：末行 "有信号的路由数: 0/54" + "交互动作覆盖：…（INTERACT 模式同样 0/54 稳定）
# b78 起路由清单收口到 route-list.mjs（当前 56 条），该基线**尚未在 56 条口径下重跑**——
# 引用时先看末行的分母，不要拿 54 的结论套 56 的清单（b78 台账 §8 R-26）。
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
- **但该环境变量会随 playwright 版本失配而失效（2026-10-19 实测）**：`--headless` 起手就报
  `Executable doesn't exist at D:\Projects\.pw-browsers\chromium_headless_shell-1228\…`——
  `.pw-browsers` 里只有 `chromium-1234 / chromium_headless_shell-1234`，而 `tests/e2e` 实际解析到的
  playwright 要的是 **1228**；默认缓存 `%LOCALAPPDATA%\ms-playwright` 同时存有 1223/1228/1234/1248，
  **去掉这个环境变量即可正常启动**（本轮 e2e 就是这么跑通的）。
  判据口径：**先读报错里的 `chromium_headless_shell-<N>`，再 `ls` 两处目录核对有没有 `<N>`**，
  有则用该目录、没有就回落默认缓存或 `npx playwright install chromium` 补装——
  不要照抄本文任何一处历史路径。上一行的 1234 只是当时的快照。

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

```bash
# 1b) 回滚演练（批七十六 R-10 新增档位；本仓 121 条迁移的 down() 在此之前从未被执行过）
#     三趟口径 = 全新库 up 全量 → down 全量 → 再 up 全量；CLI 逐条走，失败会打印卡住的迁移名。
#     批七十七 R-11 收口后，第三趟在 SQLite/MySQL/PostgreSQL 上全部实测通过
#     （旧执行器"先执行再按错误文案吞掉"在 PG 上会让整笔事务 aborted，现已改为按方言探测）。
#     ⚠ 开跑前先 `df -h /c`：可用低于 ~10 GB 不要开（本批就遇过 C 盘写满，
#        SQLite 报 code 13 SQLITE_FULL、e2e 被洗成假失败，见 quality-batch-76 §10.4）。
cd stepby-axum
cargo build -q -j 4 -p migration --bin migration
D="sqlite://./data/mig-down.db?mode=rwc"
DATABASE_URL="$D" ./target/debug/migration.exe          # 期望：迁移完成（实进 121 条）
DATABASE_URL="$D" ./target/debug/migration.exe --down   # 期望：回滚完成（全量，实退 121 条）
DATABASE_URL="$D" ./target/debug/migration.exe          # 期望：再次实进 121 条（三库均应绿）
rm -f data/mig-down.db*

# 1c) 活库方言 smoke（批七十七新增；MySQL/PG 兜底段 + 回滚重放的真库验证，CI 已进矩阵）
#     它替代了此前散在 _probe 目录里的一次性演练脚本——判据在仓内、跑法只有一条命令。
cargo build -q -j 4 -p migration --bin migration
STEPBY_SMOKE_DATABASE_URL="mysql://root:<pw>@127.0.0.1:3306/stepby_smoke" \
  cargo test -j 4 --lib live_db_smoke -- --ignored --nocapture     # 约 80s
STEPBY_SMOKE_DATABASE_URL="postgres://stepby:<pw>@127.0.0.1:5432/stepby_smoke" \
  cargo test -j 4 --lib live_db_smoke -- --ignored --nocapture     # 约 8s
# scratch 库自建自删（MySQL：CREATE DATABASE stepby_smoke；PG：createdb -U stepby stepby_smoke）
```

```js
// 2) 查证治理结果（落一个临时 .mjs 跑完即删，避免 shell 引号地狱；Node 内置 sqlite 无需额外依赖）
//    文件名：stepby-axum/.mig-verify.mjs
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('data/mig-verify.db')
const P = [
  'system:tenant:domain:',
  'tool:gen:',
  'tool:httpDebug:',
  'monitor:cache:',
  'monitor:log:',
  'monitor:slowSql:',
  'monitor:health:',
  'system:backup:'
]
const like = P.map((p) => `perms LIKE '${p}%'`).join(' OR ')
const rows = db
  .prepare(
    `SELECT COUNT(*) AS c FROM sys_role_menu rm JOIN sys_menu m ON m.menu_id = rm.menu_id
   WHERE rm.role_id = 2 AND (${like.replaceAll('m.', '')})`
  )
  .all()
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

| 写法                                                                                             | 实测结果                                                     | 结论                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| `text=我的待办`                                                                                  | `count=1`                                                    | ✅ 单条可用                                       |
| `text=我的待办, text=My Pending Approvals`                                                       | `count=0`                                                    | ❌ text 引擎把逗号后整串当**字面文本**            |
| `.el-message--error, text=注册失败`                                                              | **抛异常** `Unexpected token "=" while parsing css selector` | ❌ 列表首项是 CSS 时整串按 CSS 解析，`text=` 非法 |
| `.widget-card__label:has-text("我的待办"), .widget-card__label:has-text("My Pending Approvals")` | `count=1`                                                    | ✅ 多语言并列的**推荐**写法                       |

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
const listResp = page
  .waitForResponse((r) => r.url().includes('/system/oauth/client/list') && r.status() === 200, { timeout: 15000 })
  .catch(() => null)
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

| 断言                                                                                    | 期望                                                 |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /system/backup/list`                                                               | **200**（仅本租户 `backup_type='tenant_export'` 行） |
| `GET /system/backup/{backupId}`（纯数字，本租户）                                       | **200**                                              |
| `GET /system/backup/download/{backupId}`                                                | **403**（`view_only` **不含**下载）                  |
| `POST /system/backup` / `PUT /system/backup`（创建/恢复）/ `DELETE /system/backup/{id}` | **403 恒**（写面属平台专属，**不属任何档位**）       |

再把 `"backup.visibility" = "full"` 重启 ⇒ `download` 变 **200**（其余写面仍 403）。
**反向验证**：改回 `off` 重启 ⇒ 上表四行**全部 403**，且启动日志回到「能力位：平台层全部关闭」。

> ⚠️ 旧键 `backup.readonly_visible` 已**失效**（未知 key 静默忽略 ⇒ 回落 `off`）。若改配置后行为"没变"，先确认没有写成旧键名。

**(2) `[sso]` 三个可选开关（批次 D，默认 `false`；需先 `sso.enabled = true`）**

| 开关                    | OFF 断言（关闭态即现状）                 | ON 断言                                                                                                                                         |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `introspection_enabled` | `POST /sso/introspect` ⇒ **404**         | **200** + `{ "active": true, "client_id": ... }`；用**他客户端**签发的 AT 调 ⇒ `{"active": false}`；`discovery` 文档含 `introspection_endpoint` |
| `audit_authorize_get`   | 走一次 `authorize` 后**操作日志无新增**  | 操作日志新增 1 条（含 `client_id` / `redirect_uri` / `scope`），`oper_name=anonymous`、`tenant_id=0`（预认证端点无租户上下文，**属预期**）      |
| `proxy_logo_uri`        | consent 页 logo 直接指向 RP 的 `logoUri` | consent 页 logo 指向 `/sso/client-logo/{clientId}`；该端点仅 `image/*`、超 256KB 或 5s 超时 ⇒ 失败（**不跟随重定向**）                          |

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

| 断言（**平台**操作者）                           | 期望                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `getInfo` 返回体                                 | `showTenantFilter: true`                                             |
| 操作日志 / 登录日志 / 前端错误 / 用户管理 搜索栏 | 出现「租户号」输入框（组件 `TenantFilter`）                          |
| 输入某租户号后查询                               | 结果**仅**该租户行（显式 `tenantId` 与行级 `tenant_scope` **相与**） |

| 断言（**租户**操作者）                                 | 期望                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `getInfo` 返回体（`platform` 档）                      | `showTenantFilter: false`                                   |
| 手工构造 `GET /monitor/operlog/list?tenantId=<他租户>` | **200 但空集**（只收窄、不放宽 ⇒ 该筛选**不构成安全边界**） |

- 置 `always` 重启 ⇒ 租户操作者也出现输入框（传自己 = 结果不变，传他人 = 空集）；
- 置 `off` 重启 ⇒ 输入框消失且 `getInfo` 返回 `showTenantFilter: false`（**关闭态即现状**）；
- 负路径：写非法值（如 `"on"`）⇒ 启动 **WARN** 并回落 `off` 且不提供入口。

### 3.21 本轮（第十五批）专项方案落地配方（改这批代码必跑）

本批把台账 §8.17-C 登记的三项"单独专题"从登记转为**落地**（另两项经重分析判定"更优方案已存在/不宜实现"，见台账）。默认全部**关闭/现状**，故关闭态必须先跑一遍确认零回归。

#### (1) SSO D9：`client_secret` 零停机轮换（双密钥读取期）

| 步骤 | 操作                                          | 期望                                                                                                         |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | 客户端列表任选一行 → 点「轮换密钥」           | 弹确认 → 弹"一次性密钥"框，含**新密钥明文**（关闭后不可再查看）                                              |
| 2    | 用**旧** `client_secret` 走 `POST /sso/token` | **仍可鉴权**（读到"旧密钥"WARN 即读取期生效）：密钥错 ⇒ `invalid_grant`；密钥对但码错 ⇒ 也是 `invalid_grant` |
| 3    | 用**新** `client_secret` 同上                 | 立即可用                                                                                                     |
| 4    | 点「结束读取期」                              | 再用**旧**密钥 ⇒ `401 invalid_client`（立即失效）；新密钥不受影响                                            |
| 5    | 再次点「结束读取期」                          | 幂等成功                                                                                                     |

- 判定技巧：客户端鉴权**先于**授权码校验 ⇒ 用任意无效 `code` 即可把两段解耦 —— 密钥被接受 = `invalid_grant`；被拒 = `401 invalid_client`。
- 连续轮换两次 ⇒ 只有"最近一把"在读取期内，更早的密钥**不得复活**。
- 关闭态（未轮换过任何客户端）：`previous_client_secret_hash` 为 NULL ⇒ 行为与改造前逐字节一致。

#### (2) P2-33：`[server].http_status_convention`

| 档位                        | 自定义业务码（如 TOTP `1003`）  | 已知码（400/401/403/404/409/422/429/500/503） |
| --------------------------- | ------------------------------- | --------------------------------------------- |
| `legacy`（**默认 = 现状**） | HTTP **200** + `body.code=1003` | 映射为同名真实 HTTP 状态                      |
| `restful`                   | HTTP **400** + `body.code=1003` | **完全相同**（两档只在未归类码上分叉）        |

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

| 步骤                                            | 期望                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 个人中心 → 「通行密钥」→ 添加                   | 浏览器弹出 passkey 创建（Windows Hello / 安全密钥 / 手机）；成功后列表出现 1 条                                                                                  |
| 退出登录 → 登录页「使用通行密钥登录」+ 填用户名 | 弹出凭据选择 → 通过后**直接进入系统**（无需密码/TOTP）                                                                                                           |
| 删除该凭据后再用 passkey 登录                   | 失败（无凭据）；用户名不存在 与 无凭据用户 的**提示必须同形**（防枚举）                                                                                          |
| **关闭能力位重启**                              | 登录页分隔线与按钮**都不出现**、个人中心**无**「通行密钥」页签，且控制台**无** `/system/user/webauthn/*` 404（第二十一批前的旧行为：入口在但请求 404 —— 假入口） |
| **开启能力位重启**                              | 上述两处入口**都要出现**（验证门控不会"误藏真入口"）                                                                                                             |

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

| 步骤 | 操作                                                                                                            | 期望                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | `[events] outbound="webhook"` 指向一个**必然失败**的地址（如 `http://127.0.0.1:9/hook`），触发 3 次租户状态变更 | 每次事件打 1 条 WARN；第 3 次出现「连续失败达阈值，熔断打开」WARN                |
| 2    | 再触发 1 次事件                                                                                                 | **不再发请求**（只打 1 条 DEBUG「已被出站熔断跳过」），业务结果不受影响          |
| 3    | 等过 `cooldown_secs` 再触发                                                                                     | 放行**一次**探测（半开）：失败 ⇒ WARN「熔断保持打开」并重新计时                  |
| 4    | 把目标地址改回可用端点再触发                                                                                    | 探测成功 ⇒ WARN「熔断恢复」，之后每次照常发送                                    |
| 5    | 关掉熔断（`off`）复跑第 1 步                                                                                    | 每次都尝试发送（**关闭态零行为变更**），且 `sso`/`events` 的行为与改造前逐字一致 |

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

| 步骤 | 操作                                                               | 期望                                                                           |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1    | 建一个 `consentRequired=1` 的客户端，浏览器走 `/sso/authorize?...` | 302 到 `/sso-consent?...&ticket=<32 位随机 id>`（**query 里必须出现 ticket**） |
| 2    | 同意页点「批准」                                                   | 正常签发 code 并回跳 RP（前端已自动回传 ticket）                               |
| 3    | 用 curl 直发 `POST /sso/consent`（**不带** ticket）                | `400`，文案「同意票据无效或已过期，请重新发起授权」                            |
| 4    | 同请求带上任意伪造 ticket                                          | 同上 400（不区分"票不存在"与"参数不符"，防探测）                               |
| 5    | 带**合法** ticket 但改 `scope` / `state`                           | 同上 400，且该票**未被消费**（用原参数再发一次仍成功）                         |
| 6    | 用合法 ticket 且参数一致再发一次                                   | 成功；**同票重放** ⇒ 400（一次性）                                             |
| 7    | 把 `consent_ticket` 改回 `off` 复跑                                | 不带 ticket 也能成功（**关闭态零行为变更**，与历史行为逐字节一致）             |

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

| 元素                                                    | 修复前                                                                       | 影响                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `.ql-editor`（contenteditable 编辑区）                  | 无 `role` / 无 `aria-label` / 无 `aria-multiline`，`tabIndex = -1`           | 读屏只读到"无名可编辑区域"；键盘无法 Tab 进入 |
| `.ql-picker-label`（字号/标题/颜色/背景/对齐 5 个下拉） | 有 `role="button"` + `tabindex="0"`，但**无可访问名称**                      | 读屏只念"按钮"                                |
| `.ql-toolbar`                                           | 有 `role="toolbar"`，无名称                                                  | 区域不可定位                                  |
| 工具栏 `button`                                         | 有 `aria-label`，但是 **Quill 硬编码英文**（`list: ordered` / `indent: -1`） | 中文界面下读屏念英文                          |
| `.ql-picker-item`（尤其色板项）                         | 免文本项**无可访问名称**                                                     | 读屏念不出颜色/对齐                           |

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

- `menu_type` 常量化（纯重构，无行为变更）+ cron DTO 上限对齐 `64`。

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
- 类型导出：`cargo ts`（= `cargo run --bin export_ts`）刷新 ts-rs 生成的前端类型（实测 **86** 个类型：73 个写 `export_to`、13 个只写 `export` 按类型名/rename 落盘；条数不再手抄进文档，以 `python scripts/ts_export_audit.py` 的输出为准——上一句写死的"50 个"就是这么烂掉的）。新增带 `#[ts(export)]` 的类型若非既有类型的依赖，**必须**在 `src/bin/export_ts.rs` 的清单里登记一行，否则 `cargo ts` 会静默漏导——`FlowDoneVo` 先漏后补（旧记录），批七十六又机械核出**根清单漏了 22 个（20%）**：`cargo ts` 只实出 64/86，而 CI 跑 `cargo test`（derive 兜底会刷全），所以这条断裂 CI 看不见、只有照本配方用本地命令的人拿到过期类型（本轮改 `entity/sys_flow_log.rs` 注释后 `SysFlowLog.ts` 一字未变即为此）。现已补齐 22 个根，并有常驻门禁 `python scripts/ts_export_audit.py --selftest` + 本体（已接进 `ci.yml` backend job）；`cargo run` 因新增 `export_ts` bin 已在 `Cargo.toml` 设 `default-run="stepby-axum"` 消歧义。
- CI 额外强制：`stepby-axum` job 校验 ts-rs 生成的 TS 类型与 `stepby-vue/src/types/api/generated/` 一致（`git diff --exit-code`）；`compose-config` job 对全部 5 个编排执行 `docker compose config --quiet`（含 `include` 复用的 `deploy/docker-compose.db.yml`）。
- 浏览器引擎（Playwright）：`tests/e2e/node_modules/playwright` 与 `playwright-core` 均为 **1.62.1**
  （= `tests/e2e/package.json` 的 `^1.62.1`），需要缓存里的 **`chromium-1234` + `chromium_headless_shell-1234`**
  （Chrome for Testing 151）。
  - **b78 已复原**（b76 的临时降级结束）：此前 CDN 不可达导致 `npx playwright install chromium` 失败，
    且失败的安装会**先删目标目录**（把已有的 1234 清掉），于是临时换成全局 1.61.1 + `chromium-1228`。
    b78 网络恢复后，用 1.62.1 自己的 CLI（把两个 `__v1621_bak` 目录拼成临时 `node_modules` 再执行，
    绕开 `npx playwright@1.62.1` 被解析到别的版本）执行 `install chromium`，实下载
    `chromium_headless_shell-1234`（114.5 MiB）成功，再把目录换回原名；`executablePath()` 现指向
    `…\ms-playwright\chromium-1234\chrome-win64\chrome.exe` 且存在。**1.61.1 的备份目录已删除**。
  - 核对口径（一行，任何环境都适用）：`node -e "console.log(require('playwright').chromium.executablePath())"`
    再 `ls` 该路径；不匹配时**不要**手改 `PLAYWRIGHT_BROWSERS_PATH`，先看报错里的构建号。
  - 注意：`npx playwright@<ver> install` 在版本被解析错时会打印 "Removing unused browser at …" 并删掉
    另一个版本的目录（b78 实测 1.61.1 被解析成别的版本、删了 `chromium-1234` 的安装标记，随后 1.62.1
    的 CLI 又重装回来）。跑安装前后都用上面的核对口径看一遍。
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

## 6. 功能 87-93（批次五新增，2026-10-07）通过判据

命令同 §3，`--feature=87-93` → `总计 28 通过 28 失败 0`（EXIT=0，已验证基线）。

| 功能 | 覆盖                   | 关键断言                                                                                                                                                                                                                                                            |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 87   | 消息渠道编辑全链       | 新增重复编码被唯一约束拒绝（负路径，`channelCode=channelType` 与种子冲突是产品语义）；编辑对话框 configJson **明文回显**（EncryptedString 读路径解密，非 `enc*:` 密文）；仅改备注配置保持；`clearFields` 显式清空；**零污染闭环**（清空验证后写回原配置并回显一致） |
| 88   | 消息模板增改删         | email 渠道 + 变量占位 `{{nickName}}`；主题编辑生效；删除后行消失                                                                                                                                                                                                    |
| 89   | OSS 存储配置页（G-11） | GET 出参掩码（accessKeyMasked/secretKeyMasked 不回明文）；页面可达（**菜单 4103 孤儿占位修复回归点**）；档位提示；PUT 空 secretKey 保留原值（掩码不变）                                                                                                             |
| 90   | AI 助手配置页          | 表单关键字段；API Key 保留语义；空 Key 保存；测试连通负路径无崩溃                                                                                                                                                                                                   |
| 91   | 盲区冒烟               | /monitor/task、/system/dataRule、**/system/log/auditChange**（注意前缀是 /system/log）                                                                                                                                                                              |
| 92   | 盲区冒烟               | /system/oauth/scimGroup、/tool/http-debugger、/tool/swagger                                                                                                                                                                                                         |
| 93   | e2e 孤儿数据巡检       | `test-menu-*` 孤儿菜单清零；e2e 用户残留清理（防测试污染复发——历史 F23 孤儿占位 menu_id=4101-4147 导致固定 ID 菜单 INSERT OR IGNORE 静默失效的教训）                                                                                                                |

**本批修复的真实缺陷（测试反哺产品）**：

1. 38 个 e2e 孤儿菜单占位 → AI 配置(4102)/OSS 配置(4103)/告警规则(4110) 等业务菜单从未落库（固定 ID + OR IGNORE 静默失效）——已数据修复 + `ensure_upload_config_menu` 加内容校验 warn + F23 finally 兜底清理 + F93 巡检。
2. F23 删除失败无兜底 → 加"菜单删除兜底清理"断言。
3. admin 密码漂移（历史改密测试残留）→ 本地库重置 admin123；e2e 依赖 `sys_config.sys.account.captchaEnabled=false`。

**对话框交互经验（写新 UI 用例必读）**：goto 前 `presetTourDisabled(page)`（tour 遮罩 z-9998 拦截一切点击，goto 后 skipTour 来不及）；自家对话框提交用 `click({ force: true })`（actionability 判定偶发抖动，非确定性实测）；提交失败关闭对话框会触发**未保存守卫**（"不保存并离开"按钮，需循环收敛处理）；el-select 下拉 option 用 `getByRole('option')`（`.el-select-dropdown:visible` 对 popper 不可靠）。

## 7. 功能 94-97（批次十八新增，2026-10-08）通过判据

命令同 §3，`--feature=94-97` → `总计 14 通过 14 失败 0`（EXIT=0，embedded 8080 基线已验证）。

| 功能 | 覆盖                                 | 关键断言                                                                                                   |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 94   | 报表数据集页全链（G-01 e2e 盲区）    | 新增落库→SQL 明文端点回填（admin 持 edit 键 200 且含明文）→试跑对话框开/**关**→删除后列表轮询复查不再命中  |
| 95   | 图驱动审批全链（含批次十七 UI 入口） | API 建图发布→UI「提交测试单据」按钮→对话框提交 Toast→stepby 会话按图两级办结（条件 days>3 真走长链 a1→a2） |
| 96   | actions 白名单收窄                   | 图节点未勾 delegate → 403；勾选 countersign_add → 非 403（**属主会话调用**，白名单 403 与属主 403 不混淆） |
| 97   | 大屏 view 页冒烟                     | `/system/reportDashboard` 可达（菜单 4148，parent=1 前缀 /system）→ 运行/设计模式切换                      |

**批次十八新坑（写新 UI 用例必读，均有探针/截图实证）**：

1. **「按钮可见」≠「交互可用」**：v-if 的对话框若误嵌在未激活的 v-if/v-else 分支，组件不挂载、点击零响应**且零报错**（F95 提交对话框曾误嵌 designer 分支）。新用例必须点到底断言对话框可见，不能止步于按钮 count。
2. **裸 `permissions.includes('xxx')` 不识别超管 `*:*:*`**：超管看不到按钮（dataset 页 canEdit 实证）。一律用 `checkPermi([...])`（utils/permission.ts，P0-47 空值防护）。
3. **ElMessageBox 确认键文案**：未显式传 confirmButtonText 时是 EP locale 默认「确定」（**无空格**），`hasText: '确 定'` 匹配失败。结构化定位：`.el-message-box:visible .el-message-box__btns .el-button--primary`。
4. **Escape 关框不可靠**（force 点击后焦点不在框内）：改点 `.el-dialog__headerbtn`，并断言「对话框已关闭」。
5. **动态路由竞态**：登录后立即 goto 未注册路由 → 404 回首页，`is404Page` 对首页误判 PASS（假绿）。goto 重试至 URL 命中（F95 范式）：
   ```js
   for (let i = 0; i < 5; i++) {
     await page.goto(url)
     await page.waitForTimeout(1500)
     if (page.url().includes('xxx')) break
   }
   ```
6. **图流程测试的自审禁区**：admin 提交 + 审批人全为 role:admin = 「禁止全链自审」400。审批人用 `role:common`，推进用 stepby/admin123 独立 API 会话（todo/action 端点仅登录、归属校验在 service 层）——与集成测试同范式。
7. **embedded 链路铁律**：main.mjs 默认 `frontendUrl = FRONTEND_URL || STEPBY_UI_URL || BASE_URL` = **8080 embedded**。改前端源码后必须 `vite build → cp dist/* stepby-axum/frontend-dist/ → 重启后端`（build.rs include 重编），否则测到"不存在的修复"。
8. `ResizeObserver loop` 控制台噪声已入 EXT_NOISE_RE 过滤（良性，非应用缺陷）。

**10 轮循环沉淀（run-rounds.mjs，2026-10-08 批次十八）**：9. **API 连发段必遇 sys_rate_limit 令牌桶 429**（"请求过于频繁"）：M 级簇 76-83 每功能 10-20 连发 API，多轮满载下令牌桶耗尽 → R6-R9 连环 429 假失败。`mLevelApiSetup` 的 `api` 助手已内建 429 退避（1.2s × 3，令牌桶按秒回填）——**尊重限流语义的确定性化，非绕过**；新功能用 mLevelApiSetup 即自动获得。无任何用例以 429 为期望值，重试不改变断言语义。10. **链路中断会污染下一轮状态**：F83「停用→恢复」链在 E1 429 中断会把种子事件 user.created 留在 disabled=0，下一轮 A1 前置断言假失败——尾部已加 best-effort 恢复启用态（幂等）。教训：**有状态翻转的用例必须在尾部恢复初态，不能假设链路必然走完**。

## 8. 批次二十四：后台管理系统审计修复轮（2026-10-09）— 通过判据与长跑漂移根治

命令同 §3（embedded :8080 权威环境），全量 **939 项**。

### 8.1 本轮通过判据

- 首轮全量：939 项 / 932 通过 / **7 失败**（此前一轮 936 项 / 926 通过 / 10 失败）。
- 失败项**全部定性为测试脚本竞态/靶点问题**，逐条根因修正后单跑全绿：
  - `--feature=8,42,59,60,61` → **59 / 59 通过**
  - `--feature=53,54,67,84` → **68 / 68 通过**
- **注意**：验收必须「重启后端 + 全量复跑」，单跑绿不等价（漂移失败正是单跑绿、全量随机失败）。

### 8.2 长跑漂移失败根治（本轮新增铁律）

**根因**：管理后台页面大量使用「固定 sleep → 立即断言首屏/异步元素可见」。全量跑至后半段（功能 50+）时
浏览器累积负载 + 路由 chunk 懒加载变慢，固定等待不足 → 元素未挂载 → **假失败**（用例逻辑本身正确）。

**根治范式**（本轮 8 个功能段统一改造）：

```js
// ❌ 旧：固定 sleep 后立即断言
await sleep(1500)
const visible = await el.isVisible({ timeout: 1500 }).catch(() => false)

// ✅ 新：waitFor 优先（显式上限），再断言
await el.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
const visible = await el.isVisible({ timeout: 1500 }).catch(() => false)
```

覆盖点：

| 功能 | 元素                                 | 改造                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8    | 限流页表格行                         | 等 `.el-table__row` 出现；断言升级为「可见**且**行数>0」（骨架态不算通过）                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 42   | 后端 VO 源码扫描                     | **靶点迁移**：B-2 重构把聚合下沉 `service/dashboard_service.rs`，断言随 source of truth 迁移，**并新增** handler `pub use` 重导出 + 委托调用断言（保对外契约）                                                                                                                                                                                                                                                                                                                                                             |
| 53   | frontendError 清空按钮               | waitFor 10s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 54   | 各页 `.el-tabs__item`                | 等首个页签挂载再断言 tabs 数                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 59   | 导航栏语言入口                       | waitFor 10s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 60   | 菜单/部门页展开折叠按钮              | waitFor 10s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 61   | 数据权限对话框                       | 点击后 waitFor 再断言（非固定 timeout）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 67   | 个人中心昵称输入                     | waitFor 10s；**并修监听窗口**——原 `sleep(1500)` 后即 `off`，慢响应漏采致 `status=null`，改为轮询等响应（上限 8s）                                                                                                                                                                                                                                                                                                                                                                                                          |
| 84   | 定时任务页 el-table                  | waitFor 10s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 75   | 看板「我的待办」卡片（G4）           | 等 `.widget-card` 容器出现后再对目标卡片 waitFor 15s——卡片数量来自异步 `pending-count`，固定 `sleep(2500)` 在长跑下不足（**全量 954/1 实证**，单跑 75 恒 16/16 通过 ⇒ 判定为漂移非缺陷）                                                                                                                                                                                                                                                                                                                                   |
| 52   | 用户页搜索回查（新增/编辑/删除三处） | `searchBy` 三点加固：①**先挂响应监听再点击**，且等请求 URL 含本次 `userName=<name>` 参数的响应（旧写法只匹配 `/system/user/list`，会被**点击前在途的旧响应**提前满足）；②响应到后再**等目标行 `waitFor` 可见**——根因为该页 `syncUrlQuery()→router.replace({query})` 会触发路由**卸载→重挂**，中间存在**表格短暂消失的空白窗口**（实测时序 `el-table` 计数 1→1→1→(sleep后)0→(更晚)1），断言落在窗口内即误判 `rows=0`；③回查重试 3~~4×1.2~~1.5s → **6×2s**。`--feature=51,52` 曾稳定复现（37/37→28/27），修复后 53/53 全通过 |

**漂移诊断口诀（本轮多次实证）**：全量失败但**单跑该功能段全通过** ⇒ 多为长跑漂移（改等待），
不是业务缺陷；反之单跑亦失败 ⇒ 真缺陷。失败 evidence 里若夹杂**上一条用例的 toast/net 残留**，
即是「用例间状态未复位」信号（有状态翻转用例必须尾部恢复初态）。
**取证铁律（本轮血泪）**：**失败截图是最高优先级证据**——本轮 `fail-F52-*.png` 直接显示「表格有 1 行、
搜索框已填值、共 1 条」，一举推翻先前所有「后端无数据/会话污染/动态路由缺失」的推测，将问题
锁定为「断言时机落在组件重挂空白窗口」。**先看截图，再动假设。**
**反例警示**：定位根因时勿凭「URL 深链残留 / localStorage 污染」直觉下结论——功能 51 的深链测试
用 `browser.newContext()` **独立上下文**（localStorage 隔离 + `ctx.close()`）、且其收尾 clear+重登
后 `getInfo`/`getRouters` 均正常，均**不是**污染源；且**凭假设添加"会话重置"修复反而引入新回归**
（单跑 52 从通过变失败）。必须以「同代码历次跑对比 + 单跑复现 + 失败截图」为完整证据链。

**契约保持原则**：凡因**架构重构**（如 handler→service 下沉）导致断言靶点搬家的，
迁移靶点时**必须同时断言旧位置的对外契约仍成立**（重导出/委托），否则等于放弃该契约的回归保护。

### 8.3 附带修复的既有问题（用户指令「预先存在的问题也要一并优化修复」）

- e2e 异步元素等待范式统一（§8.2）：消除长跑漂移这一**长期存在的测试脆弱性**。
- e2e 断言点与架构同步（功能 42）+ 契约保持断言。

### 8.4 a11y 全站巡检基线（2026-10-09 本批闭环）

命令：

```bash
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
STEPBY_BASE_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
node a11y-full.mjs
```

> **`PLAYWRIGHT_BROWSERS_PATH` 一律不写**（b79 清掉本行残留的 `D:/Projects/.pw-browsers`）：
> 需要哪个构建号由 `tests/e2e/node_modules/playwright` 的版本决定（§3 浏览器引擎段），
> 写死目录在版本升级后就是"环境没装浏览器"的假象；两处目录都存在时更容易误判。

> ⚠️ **不要传 `--headless`**：`a11y-full.mjs` 的参数解析器只认 `--route=` / `--limit=`，其余一律
> `throw new Error("未知参数")` → 整轮退化为 `PASS=0 FAIL=1（运行异常）`。脚本内部已默认 headless。
> （与 `main.mjs` 不同——后者接受 `--headless`。二者参数约定不一致。批二十八踩坑。）

- **基线：PASS=560 / FAIL=0（EXIT=0）**，56 路由全扫。
- 演变：**461/99（暴露存量）→ 529/31（修字号）→ 534/26（修 label/iframe）→ 560/0（全口径）**。

**a11y 修复两类根因**：

1. **真实应用缺陷（2 处，已修源码）**：`HeaderNotice` 角标 10px、`notice-center` badge 11px
   （低于全站 12px 可读性基线；前者全站每页渲染 → 单点缺陷放大为 56 条 FAIL）。
2. **扫描器口径缺口（7 类，已修脚本）**：`unnamed` 判定 `!text && !ariaLabel && !title` 过窄，
   必须并计 WCAG 认可来源 —— `placeholder` / 关联 `<label>` 文本 / `aria-valuenow|valuetext|labelledby`
   / combobox 的 form-item label 与 `.el-select__placeholder` / 第三方 iframe / `.el-table` 选择列 checkbox；
   并排除 `.hidden-columns`（EP 隐藏列模板）。

**判读口诀**：a11y 报 FAIL 先分「应用缺陷 vs 扫描器口径」——**误报的形态是「同一元素在 N 个路由重复出现、
且形态恒定」**（如 `.notice-badge` 在 56 页都有）；真实缺陷则**集中于个别页面**。

### 3.27 批二十九：e2e 稳定性三坑（跑全量前必读）

1. **禁止外网依赖**：用例的 URL 样例**不得用公网域名**（`httpbin.org` / `example.com`）。后端
   `validate_host_resolution` 在创建时先做 DNS 解析，离线/被墙环境必 `400 DNS 解析失败` → 用例必挂。
   **正解**：用 **IP 字面量 + 封闭端口**（`http://1.1.1.1:81/hook`）——`validate_url` 走 Ipv4 分支放行、
   IP 字面量 lookup 必成功、`:81` 无服务 → 连接失败，**完整保留「不可达目标返回 error」语义**。
   （F78-B1 曾用 `httpbin.org:81` 挂 2 条；批二十九改 IP 字面量后 11/11。）
2. **弹窗链必须卸净遮罩再点下一个**：同一测试段内**连开多个 `el-dialog`**时，前一个用 `Escape` 关闭后
   `sleep(600)` **不足以**等遮罩卸载完毕 → 后继 click 被残留遮罩吞掉 → 弹窗不渲染 → **间歇 FAIL**
   （非稳定失败，单跑常通过、全量累积状态时暴露）。**正解**：每处关闭后追加 `await dismissAllOverlays(page)`
   （内部会检查 `.el-dialog:visible/.el-drawer:visible/.el-message-box:visible` 是否归零，未归零再 Escape）。
   （F5 链校验→合规报告→归档锚点三段曾偶发 2-4 条 FAIL；批二十九加固后三轮 13/13。）
3. **首段低编号假失败要区分真假**：全量首 1 分钟内（功能 4/5 等）的渲染类 FAIL，**若与并行负载同时发生**
   （同期跑 clippy / typecheck / 另一个 e2e），多为**资源争用假失败**。判据：**干净环境单跑该段能全绿** →
   假失败，勿改代码。**铁律**：e2e 全量运行期间**严禁**任何并行编译/测试。
4. **同一用例内的多段扫描必须对称处理浮层**：F16「中文扫描 → 切英文 → 英文扫描」三段，中文扫描段每页调
   `skipTour` 而英文扫描段**漏调** ⇒ 若 tour 在英文段弹出，其**中文引导文案**（标题/按钮）被统计进
   「残留中文」→ 误报硬编码遗漏（实测 44 处假残留，`--feature=16` 单跑复现）。**正解**：两段对称调用
   `skipTour`。**通用教训**：同一用例内若有多段「goto 页面并断言」，各段的浮层清理必须一致——漏一段即
   引入「浮层文案/遮罩」污染。
5. **i18n 残留数与 HTML `lang` 交叉判定**：判断「英文模式残留中文」是真缺陷还是假失败，**先看
   `document.documentElement.lang`**——若仍为 `zh-CN`，说明**语言根本没切成功**（浮层拦截了语言图标点击），
   报告里的「残留中文」是**整页中文**的假象，非逐条硬编码。真缺陷的形态是「lang=en-US 且仍有零星中文」。

### 3.28 批三十二（循环第八轮）：el-switch 隐藏 input 与菜单父链陷阱

1. **el-switch 的 aria-label 命中的是视觉隐藏 checkbox**（`el-switch__input`，viewport 外）——
   Playwright 对它 click 连 `force:true` 也抛 `Element is outside of the viewport`；对 `.el-switch`
   根节点 force click 则**不触发 v-model 切换**（EP 内部实现，探针实证 aria-checked 恒 null）。
   **正解**：`page.locator('input[aria-label="…"]').evaluate(e => e.click())`（JS click 触发 change）。
   （F115④ 曾因此 0 次轮询 FAIL；修正后 1063 全绿。）
2. **存量库菜单父链 ≠ 迁移种子**（二度踩坑，aiHistory 同型）：F112 按 `m20260823` 种子 parent=2 写
   `/monitor/pat`，但存量库菜单 3560 parent=3（系统工具）→ 真实路由 `/tool/pat`。**铁律重申**：
   写路由前必查库追 `sys_menu` parent 链，以部署库真实路由为准。
3. **响应字段命名以 serde rename_all 为准**：后端 VO `#[serde(rename_all="camelCase")]` 时 JSON 是
   `fileName` 系，前端接口按 snake_case 写 = 页面静默失效（logtail 日志正文永不出、自动刷新空转，
   零 console 错误、vue-tsc 不报）。**Query 参数**无 rename 时仍是 snake（`file_name`），双向分别核对。
4. **空 SKIP 不得冒充 PASS**：`record(N, …, true, 'SKIP：…')` 掩盖列表接口 500。新范式
   `recordSkip(feature, name, reason, apiOk)`——记独立 skip 态 + API 200 兜底断言。

### 3.29 批三十三（循环第九轮）：isVisible-timeout 误用 / getNames 白名单 / 锁屏死入口

1. **`locator.isVisible({ timeout })` 不等待**：新版 Playwright `isVisible()` 不接受 timeout、
   **立即返回**——SPA 异步挂载/Toast 异步渲染慢于前置 sleep 时必误判 false（F40 TierB-3、F121③
   双双因此假失败）。**正解**：`waitFor({ state: 'visible', timeout })`。存量 201 处已于
   **批三十五全量清零**（等价改写 `waitFor({state:'visible',timeout}).then(()=>true).catch(()=>false)`，
   见 §3.31）——**新代码禁用 isVisible({ timeout })**。
2. **getNames 与白名单口径必须一致**：getNames 分组全 Redis 前缀但 getKeys/清理按白名单校验 →
   页面列出点击必 400 的死行（F122 实证 status=400）。axum e8de93f 已在 get_names retain 白名单。
   **教训**：列表接口与操作接口的安全口径要单点收敛，否则 UI 必出假入口。
3. **workbench 锁屏快捷入口死链**：守卫在未锁定态拒绝 /lock（P0-62 防绕过），只 `router.push('/lock')`
   会被弹回 /index。跳转 /lock 前必须先 `lockStore.lockScreen(currentPath)`（Navbar 范式）。
4. **lock 态持久化 → 测试尾部必须真实解锁**：伪签名/直接 goBack 都会让守卫持续劫持后续用例路由；
   F120 尾部走 lock 页真实密码解锁链（unlockScreen API）。
5. **waitForResponse 监听必须在触发动作之前挂载**：getNames/getKeys 类快速响应在 click 后瞬间完成，
   click 后再挂监听必 miss（F122② resp=false 而 rows=11 的根因）。

### 3.30 批三十四（循环第十轮·角度 E 并发竞态实测）：内存缓存击穿路由拦截

1. **同 URL 二次 XHR 命中 Chromium 内存缓存 → page.route 拦截不到**：page.on('request') 照发
   （极易误判"请求已发出"），但 route handler 静默旁路（F124 连点搜索 reqSeq=0 实证，三轮排除了
   tour 遮挡/glob-vs-regex/CDP 禁缓存未先 Network.enable 等假设后由 context.route 定案）。
   **正解：一律 `page.context().route(...)`**（上下文级拦截可击穿内存缓存）。判别特征：目标请求
   在页面加载时已经发过一次、后续点击重复同 URL——scimGroup role/list 是点击后才首请求所以
   page.route 能拦，user/list 页面加载即请求所以拦不到。**新用例拦截 XHR 默认 context.route**。
2. **el-button 被 Tour 遮罩拦截时 JS click 是唯一解**：`.evaluate((e) => e.click())`（F124 二证，
   与 §3.28 el-switch 同型）。Playwright 原生 click 会因 elementFromPoint 命中 mask 而超时 30s。
3. ~~**存量脚本债：F40 的 `page.route('**/system/user/list**')` 注册后从不 unroute**~~
   **已修（批三十五）**：unroute 移入 `finally` 块——原实现 unroute 在 try 体内，
   body 中途抛异常（goto 失败等）会跳过卸载，800ms 延迟拦截器泄漏到全量后续所有 user/list 请求。
   **铁律：route 与 unroute 必须 try/finally 配对**。

### 3.31 批三十五（循环第十一轮）：脚本债全量清零

1. **isVisible({timeout}) 误用 202 处等价改写（main.mjs 200 + a11y-full.mjs 2）**：
   `locator.isVisible({ timeout: N }).catch(() => false)` →
   `locator.waitFor({ state: 'visible', timeout: N }).then(() => true).catch(() => false)`。
   等价性论证：isVisible 本就不接受 timeout 立即返回，调用点传 timeout 的**真实意图**即"等至多 N ms"；
   waitFor 语义严格覆盖（已可见立即 true / 迟到元素等满窗口 true / 缺席等满窗口经 catch false）。
   副作用仅负路径分支等满超时（全量耗时小幅上升），换取长跑鲁棒性（r37 实测 isVisible 误判
   与 Redis 抖动叠加放大假失败）。裸 `isVisible()`（立即状态探测）51 处语义正确**保留**。
   批量改写用脚本执行（正则双形态：`{timeout:N}` / `{timeout}`）+ 同行/跨行冗余 `.catch` 去重 +
   `node --check` 语法验证 + F5/F40/F119 三用例冒烟。
2. **F40 route 泄漏 try/finally 修复**（见 §3.30-3）。
3. **deep-e2e.mjs 不在本次改写范围**：非门禁脚本（补充深测），改动而不再全量验证违反
   「改哪测哪」纪律——其 isVisible 用法仅在门禁口径外记档。
4. **404 页 5s 自动回首页窗口**：`src/views/error/404.vue` 有 `AUTO_BACK_SECONDS=5` 倒计时
   `router.replace('/index')`（应用设计行为）。一切「深链 → 期望 404」的断言必须在
   goto 后 **5s 内**完成，且 skipTour 等晚到窗口等待不得插在判定之前（r42 实证：
   sleep(2500)+skipTour(2.5s) 推过窗口 → URL 已变 /index 误判「未 404」）。
   F17 修复：is404Page 移到 skipTour 之前。
5. **语言切换必须「验证后继续」**：EP 下拉项 click 被瞬时拦截时 `.catch(()=>{})` 会静默吞掉
   （r42 fail 截图实证：下拉开着、English 在场却未点上 → 8 页按中文扫描 → 77 处假残留）。
   F16 修复：点击后验证 `documentElement.lang==='en-US'`，失败重试 ×3（JS click 穿透兜底）；
   重试耗尽跳过扫描并诚实判定（不制造海量假残留）。切回中文路径已有同型三重兜底（对齐）。
6. **skipTour 快路径**：login/presetTourDisabled 已注入 `*-tour=completed` 抑制标记——
   标记在场时 tour 不会弹出，仅即时探测兜底（省 88 处 × 2.5s ≈ 4 分钟全量耗时）；
   标记缺失（独立 newContext）保留完整 2500ms 晚到窗口（收尾十三 operlog 实证）。
7. **a11y 字号基线**：日志类页面「终端风」小字易踩 a11y 规则「正文文本字号不小于 12px」
   （r43 实证 logtail `.level-badge` 11px × 500 行 = 500 违规）。日志正文可 12.5px，
   徽章/行号等重复元素一律 ≥12px。另：Git Bash 下传 `--route=/x` 会被 MSYS 路径转换改写
   成盘符路径 → 加 `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"` 前缀。

### 3.32 批三十六（循环第十二轮）：缺口落地 + 两类应用崩溃缺陷

1. **try/finally 无 catch = ErrorBoundary 整页崩溃（真实应用缺陷，两视图 4 处）**：
   `report/dataset/index.vue handleSave` 与 `flow/designer/index.vue`（load/保存/图提交）的
   `await api()` rejection 直接冒泡 → ErrorBoundary 捕获 AxiosError（info=runtime-6）→
   整页替换为「页面加载失败」。用户输入非法 SQL/撞唯一约束即触发（r44 fail 截图+探针复现）。
   **修复范式**：catch{} 注释「拦截器已弹错，保持对话框打开修正重试」——与 useCrudTable
   submitForm 的既有语义对齐。**新写视图一律禁止 try/finally 包 api 而无 catch**。
2. **EP 2.x aria-label 透传到内部 input**：`.el-select[aria-label="X"]` 恒不命中（根上为 null，
   input 上才是值，探针实证）→ 用 `input[aria-label="X"]`。F97/F127 双双踩中。
3. **gotoDynamicRoute 返回 void**：不能 `const ok = await gotoDynamicRoute(...)`——恒 undefined
   即恒 FAIL。可达性自判：`page.url().includes(token) && !is404Page(page)`。
4. **webHook 目标 URL 受 SSRF 校验**：localhost/内网被拒 400——按铁律用
   `http://1.1.1.1:81/hook`（IP 字面量+封闭端口）。
5. **EP 对话框关闭判定**：POST 响应到达 ≠ 对话框已关（关闭动画 ~300ms）——立即 count 恒 false，
   用 `dlg.waitFor({ state: 'hidden' })`。
6. **e2e 残留自清理扩展**：dict_type/dict_data（软删 e2e 前缀）/sys_pat（e2e 前缀+已吊销）/
   sys_config（e2e_gov 键）四类纳入——r43 巡检实证 127+261+2 行无限增长，r44 验证清零。
7. **负例断言先挂响应监听**：`waitForResponse` 在 click 前挂载，以服务端响应（400）为
   拒绝判定基准，toast/对话框状态在响应后测量（时序稳定）。

### 3.33 批三十九（循环第十五轮）：flow 设计器闭环 + 渠道测试链

1. **flow/designer 是表单式设计器（非画布）**：节点/边均为 el-card 列表 + 下拉选择（添加连线=弹窗
   双 el-select），零拖拽——Playwright 纯 DOM 即可闭环，无需 mouse 轨迹模拟。编辑态**没有**
   编码/名称输入框（新建自动生成 `flow_<ts>`）→ 落库断言从 POST 响应体回读 flowId/flowCode。
2. **validateGraph 前端先拦**：图不连通/孤立节点时保存不发 POST（el-alert 错误清单 + graphInvalid
   toast）——负例断言「无 POST」比断言 400 更准。审批节点必须入边+出边（加 1 条边必挂）。
3. **msg-channel 发送测试**：site 渠道后端 `"site" => Ok(())` 无条件成功（零外部依赖）——
   成功链用 site；email 本机 mailer 未启用 → 400 mail_disabled 错误 toast（负路径）。
   **runTest 曾缺 .catch**（失败时 Unhandled Rejection，批三十九修复——与 batch36 try/catch 族同型）。
4. **flow_definition 软删清理口径**：API 删除=del_flag=1 软删，DB 累积——自清理按
   `del_flag=1 AND (it_*/flow_<digits>/e2e-*)` 物理清除（r50 巡检 6 行）。

### 3.34 批四十（循环第十六轮）：命名前缀裁决 + integration teardown 落地

1. **数据命名五风格裁决：维持现状**——`it_*`（integration_tests，teardown 自清）/`e2e-<feature>-<语义>-<ts>`（新范式）/`e2e75-doc-` 等老用例存量（自清理 LIKE 模式与之成对，改名=纯 churn 且需同步改清理契约）/`e2e.gov.*`（租户治理键格式约束）/`flow_<ts>`（designer 前端自动生成，应用行为）。**统一命名收益低于 churn 风险，有据否决**。
2. **integration_tests teardown 落地**：`cleanup_flow_defs`/`cleanup_flow_demo_docs` helper（mod.rs，绑定参数防注入，先子后父按精确码删除）+ 25 处落点（flow.rs 19/flow_graph_doc.rs 4/flow_definition.rs 2——后者为任务外补充的真实创建点）。262 集成测试两遍全绿 + clippy 0 + 1345 lib tests 全绿。
3. **事实修正**：现行集成测试用隔离临时库（unique_temp_db_path），data/stepby.db 的 it_ 残留系旧版共享库时代遗迹（批三十九已清 2047 行）。

### 3.35 批四十二（循环第十七轮）：initialize 拆分 + F16 切英文 localStorage 兜底

1. **initialize/mod.rs 拆分（纯机械零行为变更）**：6778 行 → 10 文件（mod.rs 692 行编排 +
   tenant/schema/menu/oauth_sso/flow/ledger/helpers/scim/tests），89 个顶层项逐字节唯一归属，
   外部 `crate::initialize::` 引用 6 符号经 `pub(crate) use` 原路径转发。验证链：脚本级逐字节
   校验 + clippy 0 + 1345 lib + 262 集成测试 + e2e 全量回归。
2. **F16 切英文 localStorage 兜底**：UI 三连重试全败时（长跑负载下下拉点击链偶发，r52 实证）
   写 `localStorage.language=en-US` + reload 强制生效——与切回中文路径同款确定性兜底，
   彻底摆脱下拉交互时序依赖。守卫诚实判定 + 兜底兜住，杜绝假残留放大。
3. **auth 闸门超时基线**：cmd_timeout=5 后每轮窗口稳定 ~3 条（SQLite 负载尖峰 fail-closed），
   文案已档位无关；属环境基线而非回归信号。

### 3.36 批四十四：全量前内存核查（r55 风暴轮实证）

- **可用内存 <2GB 时勿跑全量**：r55 实证 0.8GB 可用（IDE/patcher 吃满 15.7GB）→ 换页 →
  SQLite auth 闸门超时 **65 次/轮**（正常 ~1-3 次）→ 16 个用例假失败（Toast 时序/列表渲染/
  503 拒绝全家族）。内存回升后 r56 同代码 1167/1167 零失败 + 仅 1 次超时——A/B 定案环境根因。
- 失败特征识别：失败散布大量不相关 feature + 后端窗口闸门超时数暴涨 ⇒ 环境风暴，
  单跑复判 + 内存核查，勿改代码。

### 3.37 批四十五：deep-e2e 复活（相位 1 完成，新基线）

- **基线**：84 模块 / **1029 ✅ / 0 ❌** / SKIP 48 / 2333.5s（38.9min），headless 无过滤器。
  运行：`STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 STEPBY_BASE_URL=http://localhost:8080
FRONTEND_URL=http://localhost:8080 PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers"
node deep-e2e.mjs --headless`（支持 --feature/--range/--domain/--except）。
  > **批八十三订正**：这四个里 `--domain=` **从来没有实现过**——它把值写进
  > `CONFIG.domainFilter`，而全树没有任何读点（旗标纪律扫描器 `scripts/e2e_flag_discipline.py`
  > R2 报出来的）。真实可用的筛法只有 `--feature` / `--range` / `--except` 三个；
  > `--domain=` 现在会**响亮拒绝并 EXIT=2**，不再默默跑全量骗人。
- **改写**：networkidle→load ×27（逐处确认有 sleep/waitFor 缓冲）；isVisible({timeout})→waitFor
  等价改写 ×741；跨行冗余 catch 去重 ×382；裸 isVisible() 6 处语义正确保留。
- **修复 2 处**：M9 console 401 白名单补 `/system/notice/`（listTop 为批三十一新增的顶部通知）；
  M79 doTest waitForApi 超时 10s→20s（真实外呼不可达目标耗时 10.07s）。
- **警告**：不要传 `STEPBY_UI_URL` 指向非 8080 实例（登录异常）——默认嵌入式同进程 8080。

### 3.38 批四十七：F135 运行时 metrics 捕获维度（新捕获面）

- `/metrics`（public.rs 公开端点，Prometheus 文本）此前不在 e2e 捕获面——F135 纳入：
  结构健全性（uptime/db_connected/shared_store_kind）+ **5xx 轮内增量**（累计计数器跨轮快照
  delta ≤10，首轮建基线；环境风暴信号，r55 实证暴涨可捕获）+ 定时任务失败计数 + DB 池结构健康。
- **坑**：①计数器为进程启动以来累计值，固定阈值必错（首轮即 76 含风暴史）——必须 delta 语义；
  ②shared_store_kind/db_connected 为带 label 形态（前缀匹配，裸名查不到）；③local 档 SQLite
  池 size=1，单次抓取 busy=1/1 属瞬时正常（断言 busy ≤ size）。

### 3.39 批五十（相位 2）：M85/M86 深测模块（新基线 86 模块 / 1053✅）

> **b79 订正**：本行原标题写的是"87 模块"。M85/M86 是在 §3.37（批四十五）的 **84 模块** 上 +2
> 得到的 86，与同一条 1053✅ 的另一处实测（§3.57.6，批七十一两次全量单轮 + 分 6 段求和互证）一致；
> 87 是后来把"当前模块总数"倒灌进历史标题造成的。87 是**批七十九新增 M87 之后**才有的数，
> 且该数以 `--plan` 现打为准，不得回填历史行。

- **M85（13 断言）flow_definition 版本化/发布不可变链**：草稿 v1→UI 发布→v2 isLatest 切换→
  版本列表双行→**已发布版本修改图定义 = PUT 400**（不可变契约）→ 全清理。publish/version/
  is_latest 语义此前全套件零断言。
- **M86（11 断言）msg 组合链**：变量模板 + `POST /system/msg/send`（**史上零覆盖**）→
  status='0' + 变量渲染精确命中 → 发送记录 UI 回显无 `{{` 残留 → 负路径 404 不落库。
  site 投递语义=系统内记录（sys_msg_service.rs:1164，不写 notice 表）。
- 覆盖率首测：Vue 单测 51.0% 语句/39.0% 函数（api 层盲区由 e2e 真链路互补）；Rust lib
  **76.38% 行/74.49% 分支/79.12% 函数**（llvm-cov，1347 tests）。

### 3.40 批五十一：cargo-audit 离线扫描配方（security.yml 休眠期本地替代）

- **配方**：`cargo audit --no-fetch --stale`（advisory-db 更新需 github.com，受限网络下本地库
  上次同步 2026-08-24/1226 advisories 可用）；cargo-audit 0.22.2 已在位。
- **配置位置坑**：0.22.x 读 **`.cargo/audit.toml`**（工作区根的 `audit.toml` 不被读取）；
  schema=`[advisories] ignore=["RUSTSEC-ID"]`（**无 version 字段**——加了直接报 unknown field）。
- **首扫结果**：rsa 0.9.10 RUSTSEC-2023-0071（Marvin Attack，无 stable 修复）→ 攻击面取证
  （全仓零 RSA 解密，唯一用点为 SSO RS256 私钥签名——非攻击向量）→ `.cargo/audit.toml`
  ignore 登记；atomic-polyfill unmaintained 为非阻断警告。**EXIT=0**。

### 3.41 批五十二：Vue 单测盲区补齐 + npm audit 配方修正

- **单测盲区**：`src/utils/` 四个零覆盖模块补齐——safeI18n（8）/progress（7）/passwordRule（15）/
  navigation（5），共 **35 用例**；vitest 总量 **973/973 全绿**（基线 938 + 35）。passwordRule
  两个有意行为（null/undefined 传入、纯空白密码路径）已用测试锁定。vue-tsc/eslint 全绿。
- **npm audit "不可用"过时结论修正**：旧结论来自默认 registry（淘宝镜像不支持 audit 端点）→
  **新配方 `pnpm audit --registry=https://registry.npmjs.org`** 可用。首测 96 条，axios
  1.18.1→1.20.0 直升后清零生产可达 7 条 high，余 84 条均为 dev 链（vite/esbuild/playwright）
  或上游未发布修复（braces <3.0.3 无新版）。
- **pnpm 10 overrides 坑**：package.json 的 `pnpm.overrides` 字段被 pnpm 10 忽略 → 必须
  迁移到 `pnpm-workspace.yaml`；非 TTY 需 `CI=true`；allowBuilds 占位符需填 true。

### 3.42 批五十四：测试数据治理审计与清理配方（数据污染全景）

- **审计方法**：SQLite 直连逐表计数（66 表）→ 可疑膨胀表按 `del_flag`/命名模式/时间分布下钻
  → 逐消费方 grep 定性（HTTP 面 vs 仅日志）→ 命中条件先验证"非命中行=种子/合法"再清理。
- **两大机制缺口（已修复）**：①`sys_frontend_error` 保留期清理是死方法（service `clean()`
  零调用点）——e2e 埋点 10 天 12 万行（97% vitals info）；②local 档 `sys_shared_kv` 过期键
  无物理清扫（`is_expired` 仅读时过滤，10 天 3387 行 100% 过期堆积）。修复=两者均接入
  `cleanup_expired_logs`（每日 03:00），frontend_error 独立短保留
  `[sys_log].frontend_error_retention_days` 默认 7（`FRONTEND_ERROR_RETENTION_DAYS`）。
- **e2e 残留命名规律（cleanupE2eResidue 已扩展的命中条件）**：webhook
  `e2e*/E2E79_*/probe-diag-*`（活跃中断遗留 9 个 + 软删 404）、oauth client `E2E-*`
  （活跃 4 + 软删 197）、PAT 过期（`expires_at < CURRENT_TIMESTAMP`，命名 mlevel-ak/akprobe
  不带 e2e 前缀！）、报表族 `e2e%`（report 38/dashboard 16/dataset 131/sub 7）、字典改名软删链
  `i18n_test_*`（306）与 `testdict*`（161）。
- **一次性清理实绩**：104,797+161 行，VACUUM 后 174MB→114MB；种子零损伤（dict 活跃 13、
  config 29、user 2、menu 无重名逐一复核）。
- **前端降噪**：`frontendErrorReporter.transport` 增加良性错误过滤
  （ResizeObserver loop——浏览器渲染循环警告，errorHub 本地展示不受影响）。
- **教训**：审计先验证清理条件反例（非命中行必须是种子/合法数据）再执行；
  LIKE 对 ASCII 大小写不敏感（`'e2e%'` 同时命中 `E2E79_`）。

### 3.43 批五十五：数据治理第二轮巡检（上批修复复检 + 未覆盖表深挖）

- **复检结论**：批五十四全部清理目标归零（webhook/oauth_client/shared_kv/pat/report 族/
  dict 软删 6 类，且经一轮全量 e2e 后仍为 0——起跑清理实链闭环）；verify-chain **valid=true**
  （checked=61923，gapCount=156 全为锚点续接合法缺口）。
- **第二轮新发现（cleanupE2eResidue +7 步收口）**：①graph doc 链——M85/F133 每轮 +2 活跃
  单据（'e2e 动作收窄单'/'e2e 图驱动单据（长链）'），且 doc 被既有 `flow_graphdoc` 步删除后
  task/log 成**孤儿**（biz_type='flow_graph_doc' 全族 task 70/log 117，孤儿 task 40/log 67）；
  ②AI 会话——F86 'e2e86 探针' 累积 113 行零清理；③OAuth provider——E2E81 活跃残留 1。
- **一次性清理实绩**：321 行（五表归零，provider 回 4 种子）；审计连带确认 notice/msg_send_log/
  logininfor 非种子行（2108，删除用户的历史登录日志=合法审计保留）与 audit_change 均为设计内。
- **方法论沉淀**：巡检按「关联族」推进——发现单表残留后必须沿外键（biz_id/hook_id/report_id）
  查全族，孤儿判定=「父行已删而子行留存」，清理顺序=先子后父。

### 3.44 批五十六：种子漂移审计（临时库 diff 法）+ config 部分更新语义补全

- **方法升级**：以 `DATABASE_URL=sqlite://./data/seed-check.db` + `SERVER_PORT=8093` 启动第二
  实例构建**纯种子临时库**，python 逐行逐列 diff 生产库种子表（menu/dict/config/role/dept/
  post/user/role_menu/msg_template）——比残留模式扫描更强，直接暴露"种子 vs 运行库"语义漂移。
  比对口径：跳过 create_time/update_time/update_by 审计列；config/msg_template 按**业务键**
  （config_key/template_code）而非 PK（PK 随演进重排）；role_menu 按复合键。
- **真产品缺陷一（已修，axum）**：`edit_config` 对 config_name/config_value/config_type/remark
  无条件 `Set(dto.*)` ——DTO 全 Option，前端"只改 remark"的部分载荷把未提交列抹成 NULL。
  e2e F10 实证 skinName 的 config_name 被清空。修复=四列对齐治理列的 2026-09-26 部分更新
  语义（None=保留现值，Some("")=清空）。
- **真产品缺陷二（已修，axum 迁移 m20261012_000001）**：皮肤/主题键种子治理列缺失
  （init 迁移未指定→列默认 platform_only），与功能 72「租户覆盖 platform_default 键」的
  产品语义冲突（**全新部署该测试必失败**）→ 迁移落定 platform_default/1/1；同迁移补种
  4180/4181 两个 F 型按钮菜单（批次十九手工创建未登记种子，全新部署缺归档下载/链校验入口）；
  initialize 兜底镜像 `ensure_archive_menus`（幂等 INSERT，治理 UPDATE 不镜像防覆盖管理员变更）。
- **e2e 缺陷修复**：F90「空 Key 保存」PUT 固化前端表单默认值（base_url 被写为
  api.openai.com/v1 占位）→ 加配置快照恢复段；cleanupE2eResidue +3 步（F23 软删菜单 107 行
  物理清除、role2 授权漂移 4 行）。
- **一次性数据修复 118 行**：治理/名称/备注回种子值、ai.base_url 清空、admin avatar 指针
  （指向已丢失文件）与 country_code 回种子态、role_menu 4 行、软删菜单 107 行。
- **定性不动**：captchaEnabled 种子 'true' vs 运行态 'false' —— RuoYi 上游传统默认 true，
  e2e 恢复逻辑固化为 false（套件便利态）；属产品默认值决策项，留档待福哥拍板。
- **教训**：种子审计必须做——残留清零 ≠ 种子未漂移；「临时种子库 diff」是可复用配方。

### 3.45 批五十六收尾：F106 ssoGrants 语义分歧攻坚 + OOM 环境风暴复现

- **F106 ② 攻坚实录**（全量 1171/1172 唯一失败 → 6 轮取证）：goto 后 sso-grants API 1.6s
  即 200、DOM/截图/时间线轮询全程显示「Tab 激活 + el-empty 已渲染 + CSS 链全 visible」，
  而 Playwright `locator('.el-card:has(.grant-list)').waitFor(visible)` 持续 false（15s/30s
  双窗均败，无 waitFor 异常、无中途导航）。已知差异：`.el-card:has(.grant-list)` 在此页
  **双匹配**（外层「基本资料」卡因嵌套 ssoGrants 卡而同样命中 :has()）+ EP tab-pane 渲染
  时序。**终局解 = ② 断言改 DOM 真值轮询**（page.evaluate + offsetParent 启发式，30×1s
  预算）——断言语义不变，Playwright 语义分歧绕行；②b 同步去 card 依赖改 #pane-ssoGrants
  作用域。单跑+全量双验证 ✅。
- **教训**：locator.waitFor 持续 false 而 DOM/截图证真时，先做「CSS 真值 vs Playwright
  语义」对照取证（getComputedStyle 链 + pwCount/pwVis），证实分歧后改 evaluate 轮询，
  不无限加 timeout。
- **OOM 环境风暴复现**：终验首跑 F65 起浏览器进程崩溃（"Target page closed" ×76）——
  **可用内存 0.74GB**（孤儿 link 3.64GB + rustc×2 2.8GB 未退场）。清孤儿进程 → 4.75GB →
  重跑 1170/1172。§3.36 内存规则补充：**cargo build 链的 rustc/link 进程（合计可达 6GB+）
  是头号内存户，全量 e2e 前必须确认其已退场**。
- 功能 33 两断言失败为已知负载型面孔（段内零改造点，干净单跑 16/16 全绿复现通过）。

### 3.46 批五十七：种子 diff 复验（b56 落地验证）+ 保留机制全景补齐

- **复验结论**：b56 全部修复落地——菜单多行 109→0、治理列漂移消失、role_menu 归零、
  dict/role/dept/post 关系表零差异。剩余差异三类定性：①菜单种子文案/类型 4 处落后于
  迁移终态（4102 remark/4115 menu_type F→C/4116 icon/4117 remark——迁移演进了生产库而
  initialize 种子源未同步，**真种子源漂移**）；②config_id/template_id PK 演进（合法——
  键经迁移后期补种，PK 序不同，内容零差异）；③sys.ai.base_url（**非漂移**：F90 快照恢复
  按 effective 口径闭环，GET 返回双源合并值（sys 行空→回落 config.toml 默认），行级 openai
  仅为 toml 值的合法物化，有效值零漂移）。
- **菜单元数据装饰性差异定性留档**（4102 remark/4115 menu_type+icon/4116 icon/4117 remark）：
  功能层（perms/parent/path/component）零差异，差异均为 remark/icon/menu_type 装饰性元数据、
  方向不明（生产手调运营态 vs 不可变迁移种子）——按防打地鼠纪律**不迁移**（改历史迁移违不可
  变性，追迁移纯为文案属 churn）；schema 等价性总锁只锁 menu_id+perms，此类装饰性漂移须靠
  本 diff 配方定期捕获定性。
- **保留机制全景补齐**（对齐 b54 范式接入 cleanup_expired_logs）：
  - `sys_audit_change`（15,276 行无界增长，1.2k/天）：repo delete_older_than +
    service clean_expired + `audit_change_retention_days` 默认 **180**（审计合规域长于
    oper_log 的 90；无防篡改链直删安全）。
  - `sys_msg_send_log`（593 行）：`msg_send_log_retention_days` 默认 **90**；
    **send_time IS NULL（待发送/重试中）记录永不清理**。
- 双源语义注意：GET /system/aiConfig 返回 effective（sys 行空→config.toml 回落）——
  seed diff 工具对 sys.ai.* 的行级差异须按 effective 口径定性，勿误报。

### 3.47 批五十七收尾：F122 响应监听竞态（b35 铁律又一实证）+ OOM 二次复发

- **F122 ⑥ 攻坚**：缓存统计 tab 的 hotKeys/prefixStats 断言全量+单跑双败——根因 =
  `waitForResponse` 在 `click()` **之后**挂载（违反 b35 铁律），shared_kv 清理后响应提速
  （空数据序列化更快），监听挂载前响应已到达 → 竞态必败。修复 = 监听前置到 click 之前
  （对齐既有铁律），单跑+全量双验证 ✅。**该铁律至此已三次实证（b35/r62），任何
  waitForResponse 均须先于触发动作挂载。**
- **OOM 二次复发**：b57 首跑 F87 起 68 失败（浏览器死亡，可用内存当时不足）——环境性
  （桌面应用内存波动，事件日志仅外部 Tobii 崩溃），清理后重跑 1173/1173 EXIT=0。
  内存纪律再确认：全量 e2e 前确认可用内存 ≥2GB 且无孤儿构建进程。
- F90 快照恢复新增第 1173 项断言（写后读闭环）随全量通过。

### 3.48 批五十九：cleanup 手动触发能力补全（真实执行验证闭环）

- **运营缺口发现**：b54-b57 的七类清理接线仅有 03:00 cron 一条触发路径，且手动触发入口
  `cleanup_expired_logs`（registry 项，b54 建）的清理体**未随接线同步**（仅覆盖
  oper_log/logininfor 两类，b56/b57 新增五类在手动路径缺失）。
- **修复（axum）**：清理体抽取为独立函数 `run_cleanup_expired_logs(db, &config, archive_storage)`
  （cron 闭包与 registry 项完全同源，七类清理全覆盖）；registry 项改为调用统一清理体。
  抽取时的所有权坑：cron 闭包内 clone 必须捕获**外层前置 clone 变量**（cleanup_db/
  cleanup_config/cleanup_archive），否则 post-closure 的 `config.sys_log` 借用冲突
  （E0382）；`retention_mode=keep` 分支 return 改 `return Ok(...)`。
- **真实执行验证闭环**：临时 sys_job（invoke_target=cleanup_expired_logs）→ 执行一次 →
  后端日志七类清理全部真实发生（前端错误/埋点实清 **2219 条**，100,350→98,131）→
  临时任务删除。**b54-b57 接线自此有运行栈级真实验证。**
- 集成测试补齐（b58 的 retention_cleanup 2 用例覆盖方法级边界）+ 本批运行栈级触发验证
  构成双层验证。

### 3.49 批六十：seed_diff.py 常驻工具固化（种子漂移审计标准化）

- **背景**：b54-b57 的种子 diff 均为一次性内联 python 脚本，配方散落在日志里无法复用；
  批六十固化为 `stepby-axum/scripts/seed_diff.py`（仅标准库，无第三方依赖）。
- **标准流程（两步）**：
  1. 构建纯种子库：`DATABASE_URL="sqlite://./data/seed-check.db?mode=rwc" SERVER_PORT=8094
target/release/stepby-axum.exe`（起来即种子写完，Ctrl-C/停进程）。
     **⚠️ 必须 `?mode=rwc`**——sqlx 默认不创建新文件，缺省时 `unable to open database file
(code: 14)`（本批两次实证；testing-guide.md:107 早有正确写法）。
  2. 比对：`python scripts/seed_diff.py data/seed-check.db data/stepby.db`
     （退出码 0=零漂移 / 1=有漂移 / 2=用法错误，可直接接 CI）。
- **比对口径（内建豁免，均为实证定性）**：
  - R1 审计列豁免：create_time/update_time/update_by/created_at/updated_at；
  - R2 业务键优先：sys_config=config_key、sys_msg_template=template_code、
    dict 按 (dict_type,dict_value) 等——PK 经迁移补种必然演进（b57 ②）；
  - K3 代理 PK 列不参与比对（config_id/template_id 漂移=合法演进）；
  - K1 双源物化：sys.ai.* 前缀 + sys.upload.s3.path_style（F89 PUT 回显 toml effective
    物化进 sys 行，有效值零漂移——与 §3.46 sys.ai.base_url 同源语义）；
  - K2 菜单装饰性留档：4102 remark/4115 menu_type+icon+remark/4116 icon+remark/
    4117 remark（防打地鼠；b60 补 4115/4116 remark，同为生产手调态）；
  - K4 运行态：sys_user 账号态六列（password/头像/登录时间等）、sys_shared_kv 整表
    （config:def:* 为 TTL 300s 缓存层读时重建；sso:v4_legacy_at_migrated 幂等 SETNX 自愈）；
  - K5 有意运行态覆写（informational）：运行时**可编辑**配置键，种子=生产安全默认、运行库有意覆写
    为便利值——当前 1 项 `sys.account.captchaEnabled`（种子 true=安全默认 vs 运行库 false=e2e 便利态，
    2026-10-13 定案，不再计入 PENDING）。
- **方向语义**：种子有→运行库无 = 漂移（丢失）；值不同 = 漂移（篡改）；
  运行库有→种子无 = 运行数据（只汇总不计失败）。
- **批六十四实测**：K5 分类生效后结论 `漂移 0 | 豁免 30 | PENDING 0`，EXIT=0。
- **批六十实测教训**：种子基线必须由**当前 HEAD 二进制**构建——本批首跑用 03:19 旧 exe
  构建 seed-check.db，skin 治理三元组误报 6 处（b56 迁移在旧二进制中不存在）；
  重建 b59 二进制后归零。**基线陈旧 = 整个 diff 无效。**

### 3.50 批六十一：企业级交付补齐——公开仓 CI/Release 流水线首激活攻坚

- **缺口审计结论**：v0.2.0 发布时公开仓（axum/vue）**零 CI workflow**（全部在未发布的
  根仓，dormant 设计）+ Release 无构建产物（release.yml 未随 tag 生效）——开源门面两大缺口。
- **单仓流水线下发**：axum（ci/security/release）+ vue（ci/security/release）六文件，
  门禁与根仓编排版等价；根仓 ci.yml org 名漂移修正（stepby/ → stepbylabs/，9 处）。
- **首激活三轮攻坚（每轮以 GitHub run 日志取证驱动）**：
  - R1（6 红根因）：①build.rs 硬要求 frontend-dist/（rust-embed 编译期校验）→ CI/release
    补前端真实构建链（checkout vue + build:embedded + cp，与本地 embedded 链同源）；
    ②compose-config 缺 POSTGRES_PASSWORD 注入；③governance/migration 缺 license 字段
    → 补 MIT；④cargo-deny 两项无补丁 advisory（RUSTSEC-2023-0071 rsa Marvin Attack
    patched=[] 上游有意；RUSTSEC-2023-0089 atomic-polyfill 构建期传递引入）→ deny.toml
    记录式豁免（理由+复评条件）+ bzip2/CDLA 许可白名单；⑤gitleaks-action 仓库 404
    （zricethezdev 已删）→ 迁移 gitleaks/gitleaks-action@v2；⑥vue pnpm-audit 37 high
    → vue 3.5.40→3.5.43（GHSA-g2v6-rqmx-r4w6 XSS 补丁）+ workspace.yaml overrides
    （brace-expansion@5/ini@1/nanoid@3/source-map-js）+ audit 口径改 --prod。
  - R2（2 红根因）：①CI 前端构建步骤 cd ../stepby-vue 越出 workspace → $GITHUB_WORKSPACE
    路径修正；②docker-compose.prod.yml include 根仓 deploy/ 跨仓文件单仓不可解析 →
    校验面收敛为自包含两文件（prod 留根仓编排 CI）。
  - R3（3 红根因）：①gitleaks-action v2 对 **org 仓收费**（GITLEAKS_LICENSE 硬门槛）→
    换官方免费 gitleaks/gitleaks@v8（三仓）；②CI Test 步 12 例红=两类：**webauthn 6 例
    确定性**（部署态 config.toml 带 rp_id/origin 而 env-only 缺失 → 503「WebAuthn 未
    配置」，本地移走 config.toml 复现实证）→ 用例自含化（webauthn_ctx() 注入 rp_id/
    origin，8 处调用替换）；**6 例负载型偶发**（switch_states/oper_log 归档/ip_location
    "写后读"类，本地并行不可复现）→ CI RUST_TEST_THREADS=4 钳制（§3.36 负载管理同源）。
  - R4 起跑（axum 89adba6 / vue 779f473 基线）。
- **vue overrides 深坑（本地实证）**：brace-expansion 维护版（1.1.20/2.1.6）**破坏
  minimatch API**（expand is not a function，eslint/glob 构建链全断）——audit 的
  patched>=2.1.6 字段与生态兼容性不同步，overrides 逐项二分后撤销 @1/@2，保留 @5/
  ini/nanoid/source-map-js；**生产树 high 清零（audit --prod RC=0）**，@1/@2 链 DoS
  属构建期风险由 lockfile 升级管理（pnpm-workspace.yaml 注释留档）。
- **机制沉淀**：单跑红/组跑绿的判读——webauthn 首用例 503 确定性、组跑被 config-save
  用例"预热"掩盖；复现 CI 环境的标准姿势=临时移走 config/config.toml（from_file 回退
  env-only，Settings::default 语义）+ 显式 DATABASE_URL=sqlite::memory:。
- **推送网络韧性**：github 443 间歇中断（curl 28），逐 ref 补推 + 真实退出码校验
  （管道 tail -1 会吞失败码——`git push | tail -1 &&` 不可靠，须 `if git push ... &&`）。

### 3.83 追记：迁移方言债首次全量暴露与清偿（r6→r11 六轮攻坚）

- **爆发机制**：`cargo run -p migration` 契约从未存在（ed93647 重组删 main.rs 未补）
  ⇒ CI migration-matrix 三库全挂 `a bin target must be available`——**多数据库支持
  在全新库场景从未被真正验证过**（存量库走 initialize 兜底掩盖了一切）。
- **bin 补齐**（migration/src/main.rs）：DATABASE_URL env → Migrator::up → 「迁移完成」；
  本地三库全新库（docker compose down -v 重建）实证 86 迁移跑通。
- **方言债清偿清单（每处均本地三库实证）**：
  - `add_column_if_not_exists`：sea-orm MySQL 后端直译 `ADD COLUMN IF NOT EXISTS`
    （MySQL 8.0 不支持）→ m20260928_000002 改"先查列存在再 ALTER"既定范式；
  - `CREATE INDEX IF NOT EXISTS` ×6：alert_rule 已有分支，webhook_event/flow_definition/
    report_dataset×2/flow_graph_doc 补方言分支（MySql 裸语句 + IndexDdlExt"已存在"容错）；
  - boolean 赋值：`SET is_system = 1` → `= TRUE`（PG boolean 拒 integer，三库兼容 TRUE）；
  - TEXT DEFAULT：MySQL 8 严格模式禁 BLOB/TEXT 列 DEFAULT ⇒ flow_graph_doc fields_json
    MySQL 分支改可空（应用层恒写值）；
  - DATETIME 类型：PG 无 DATETIME ⇒ flow_definition/report_dataset/flow_graph_doc 补
    ts_type 映射（PG=TIMESTAMP，其余=DATETIME）；
  - 幂等前缀：m20261012 菜单补种硬编码 `INSERT OR IGNORE`（SQLite 专属）→ 三方言分支
    （与 execute_idempotent_insert 同款）。
- **方法论沉淀**：本地复刻 CI 的标准姿势 = `docker compose down -v`（必须 -v 清 volume，
  半迁移态 seaql_migrations 残留会掩盖错误）+ `DATABASE_URL=<三库串> cargo run -q -p
migration` 逐库跑全新库；ci.yml mysql health-cmd 须用 root/root123（对齐根版）。

### 3.51 批六十二：企业级交付加固——冒烟门禁/checksums/dependabot/e2e embedded 兼容

- **Release 冒烟门禁机制化**：release.yml 新增 smoke job（needs: backend）——下载
  linux-x86_64 产物 → 零配置（SQLite 自动建库）起服 → 断言 /health UP（db/redis）、
  GET / 返回嵌入 SPA（200 text/html）、/captchaImage captchaEnabled:true → 不通过
  则 release job（needs 含 smoke）不发布。**本地同款实测先行**：下载 windows 产物
  解包 SERVER_PORT=18080 起服，全断言通过（产物默认 captchaEnabled=true 属安全
  语义，登录完整流程由 e2e 覆盖）。
- **checksums.txt**：release job 生成 sha256 并附 Release（供应链惯例）；v0.2.0
  手动补齐（本地下载三产物算哈希经 API 上传）。
- **dependabot.yml 两仓下发**：cargo/npm/github-actions 周更 + CI 门禁合并——
  机制性防方言债/漏洞债复发。dev 工具链 25 high 经分析**不盲改**（brace-expansion
  维护版破坏 minimatch API 已实证），由 dependabot 跟进。
- **rsa RUSTSEC-2023-0071 定性升级**：全仓 rsa 使用点仅 sso_service RS256 签名 +
  JWKS 公钥分发，零 decrypt（grep 实证）——Marvin Attack 针对解密时序场景，
  **攻击面不适用**；deny.toml 豁免理由同步升级。
- **e2e embedded 兼容坑（本轮 2 例假失败根因）**：.env.embedded 的
  VITE_APP_BASE_API='' ⇒ axios 同源根路径请求**无 /prod-api 前缀**，竞态守卫用例
  的 page.context().route 正则写死 /prod-api ⇒ reqSeq=0 拦截失配（②④ 两断言红）。
  修正则 `\/(prod-api\/)?system\/user\/list` 兼容两形态；全量 1173/1173 复绿。
  a11y-full 560 检查全绿。fetchWithAuth 显式 /prod-api 前缀（后端双路径兼容）不受影响。
- **仓库门面**：README CI 动态徽章（actions/workflows/ci.yml/badge.svg）替换静态
  build 图；GitHub description/topics 设置（API PATCH）。

### 3.52 批六十二收官：oper_log 时序红根因终局定性 + 三平台推送纪律重申

- **it_opl_archive 第 5 次同因红终局定性**：根因非"锚点落库延迟"（重试收敛无效），
  而是**落库序 != 业务序**——CI 2 核慢机 spawn 竞争恒定复现（brokenAtOperId 恒定
  105/gapCount 恒 3），本地 env-only 4 线程全量不复现。链序锚定**落库序** ⇒ 业务序
  顺序断言（id1<id2、散段衔接）前提不成立。修复 = rowid 落库序前置检测
  （`SELECT oper_id ... ORDER BY rowid` vs 业务序比对，序不一致降级跳过）——
  axum r17 @f61b2b3 CI+Security 全绿确认根除。
- **sea-orm 2.0 raw 查询**：`DatabaseConnection` 需 `use sea_orm::ConnectionTrait`
  才有 query_all_raw/query_one_raw（run 实证 E0599）。
- **三平台推送纪律**：origin（gitcode）只是开发同步；github/gitee/labs 的 main 是
  孤儿基线线——全史 main 直推必非快进拒绝，必须走 commit-tree 基线重建 + `--force
clean-main:refs/heads/main` 批流程（批六十二下午两轮 push 全败根因即此 + 网络
  劣化叠加）。

### 3.53 批六十三：发布流程正常化——孤儿基线作废，正常 GitHub Flow 生效

- **用户决策**：v0.2.0 发布以前的历史一律不管（mmdb blob 合规重写已在本地完成，
  filter-repo 后 pack 53→20MiB、HEAD 树 hash 不变、代码零变化、全史 gitleaks 零发现
  ——vue 全史已推三平台成功；axum 全史 20MiB 在网络劣化窗口重试推送中）。
- **以后的标准流程（替代批六十一的 commit-tree 基线重建流程）**：
  1. 开发 → `git commit`（本地 main 全史线）
  2. `git push origin main && git push github main`（同线天然快进，**无需 --force**）
  3. 发布：`git tag vX.Y.Z && git push github vX.Y.Z` → Actions 自动跑
     CI/Security/Release（三平台构建 + smoke 冒烟门禁 + checksums 自动附）
  4. 首次登录强制改密等语义不变；gitee/labs/gitcode 同步推 main 即可
- **孤儿基线机制作废**：clean-main 分支与 refs/backup/clean-main-* 锚点保留仅作
  历史存档，不再参与发布；v0.2.0 tag 保持指向 r16 基线（Release 四产物+checksums
  与该树构建一致，关联不断）。
- **一次性切换状态**：vue main=6882dc0 已上 github；axum main（含 filter-repo 重写）
  全史 20MiB 推送后台长退避中，网络窗口恢复即自动完成。

### 3.54 批六十四循环测试深化：F136-140 新用例 + 三真实缺陷修复（2026-10-13）

**新用例（main.mjs 功能 136-140，页面×按钮×覆盖度盘点后的低覆盖面补强）**：

- F136 运行监控页（慢请求/错误聚合/统计卡/local 档「—」渲染判定/顶栏刷新回归锁）；
- F137 变更留痕页（列表/搜索过滤/重置恢复/导出 200/展开明细）；
- F138/F139 我的导航/域名管理（平台态选择器 + 自助说明 + 列表 API）；
- F140 报表看板（新建→落库 API 复核→删除自清理；②反向锁定 `v-if="activeBoard"`
  门控——未选中看板时删除按钮**不渲染**，防假入口）。

**连带揪出并修复的三个真实缺陷**：

1. **`tab.refreshPage`/`closePage` 崩页（P0 级 UX）**：`delCachedView`/`delView` 是
   **同步** action（返回数组/对象非 Promise），`.then()` 链同步抛
   `TypeError: ... .then is not a function`——顶栏「刷新当前页」全局动作**必然崩到 /500**，
   且错误在返回 Promise 前同步抛出，调用方 `.catch()` 兜不住。修复=同步调用后构造
   Promise；App.vue 错误边界补 `errorReporter.report`（此前生产构建静默吞错零诊断信号）。
   回归锁：F136⑧ + `src/plugins/tab.test.ts`（vitest）。
2. **observability local 档误导渲染**：local 档无 Redis，此前把空值渲染成
   `0s/0 B/0`（"不适用"误呈现为"真实的 0"）。修复=后端 `RedisStats.storeKind`
   单点判定下发，前端 `isRedisStore` 消费（缺字段 fail-safe 为 false）+ 档位提示
   el-alert；F136⑥ 双档判定回归锁。
3. **useCrudTable 重置失效（波及全部 URL 同步页，35 个 useTemplateRef 页面同模式）**：
   AppMain 以 `route.fullPath` 为组件 key（P1 设计）⇒ 搜索 → `syncUrlQuery` 写 URL →
   页面**重挂载** → `restoreQueryFromUrl` 回填 → 重挂载实例的 EP form-item
   `initialValue` 被污染为搜索值 ⇒ `resetFields()` 只会"重置回搜索值"，重置按钮无效。
   修复=useCrudTable 在 URL 恢复**前**快照干净默认值（`QUERY_DEFAULTS` WeakMap），
   `resetQuery` 显式恢复快照；导出 `resetQueryDefaults()` 供 13 个本地 shadow 页接入
   （config/frontendError/role/logininfor/operlog/message/log/backup/dict/dept/menu/
   task/gen/webHook log）；user/index（自带 URL 同步）显式清表单键。顺带修复
   `syncUrlQuery` 把嵌套 params 对象序列化成 `params=[object Object]` 垃圾参数。
   回归锁：`useCrudTable.test.ts` ×2（污染恢复语义 + WeakMap 多实例隔离）。

**e2e 断言时序纪律（本轮实证）**：

- 重置/搜索等触发 fullPath 变化的动作后，页面会重挂载（out-in 过渡）——下一动作前
  必须 `_visible` 等新实例按钮就绪，否则 evaluate 点击落在 detached 节点被静默吞掉
  （F137⑥ 首轮偶发实证）；
- 搜索/重置断言以**列表请求参数**为取证（waitForResponse 带/不带筛选值），
  固定 sleep 在深链慢挂载时两侧都会假失败（探针实证）。

### 3.55 批六十四收官基线（2026-10-13 实测）

- **e2e 全量**：`main.mjs` **140 features / 1203 断言全绿**（EXIT=0，含 8 设计内 SKIP；窗口零 503/ERROR）。
  断言总数 1173 → 1203（+30：F136 ⑧项 / F137 ⑦项 / F138 ⑤项 / F139 ⑥项 / F140 ④项）。
- 首跑 15 项失败（F3-F6/10-12/17/111/135/137）为 **503 连接风暴**环境性假失败（F135③ 实证采样
  64 个 503：`/getInfo`、`/getRouters`、`/monitor/frontendError/report`——后端重启后立即全量的
  启动期负载）；失败功能单跑 **59/59 全绿** ⇒ 三判据成立；复跑 1202/1203（F88 删除后固定 sleep
  时序边缘，已改轮询等待），**终轮 1203/1203**。教训：**全量前重启后端后须预热 ≥25s 再起跑**
  （20s 实测仍会中段偶发 503，25s 全程零风暴）；疑似风暴时先看 F135③ 的 503 采样再定性。
- **a11y**：560 项检查 / 0 FAIL（observability/auditChange/reportBoard/my-nav/my-domain 页面改动后复核）。
- **vitest**：984→985（70 文件，+4：useCrudTable 污染恢复/多实例隔离/params 容器隔离 + tab.test.ts 同步 action 兼容）。
- **deep-e2e**：84 模块 / **2106 ✅** / 0 ❌（EXIT=0、被吞异常 0、后端 ERROR/WARN 0；2106 为本轮
  精确实测，历史口径 1029 严重过时已订正 TESTING/AGENTS）。
  > **b71 订正（保留原文）**：该 2106 **不可复现**——b71 在同一套件上全量单轮实测 1053、
  > 分 6 段求和 1054，而 `record(` 调用点总量仅 1167，单次运行不可能产出 2106。
  > 现行基线以 **86 模块 / 1053✅ / 48 SKIP** 为准（§3.57.6）。教训：基线数字必须与"断言调用点总量"做量级对账。
  >
  > **b79 再订正**：上面那句"现行基线"到本批也已过期——**唯一事实源是 `AGENTS.md`《测试门禁全景》的
  > deep-e2e 行**（b79 权威轮为该行的第一组粗体数字；**本处不再抄一遍**——抄了就已经过期一次，
  > 这一行本身就是证据），
  > 本文件与各批次台账里的数字都只是当时快照。为什么强调这件事：b71 那次是"数字不可复现"，
  > b79 这次是"数字可复现但**分片边界**手抄漏了最后一个模块"（见上文「分片边界不得手抄」口径，
  > 现行做法是跑 `--plan` 从注册表派生），两类都出自同一个动作——
  > 把别处的计数抄进这里。要查现状就重跑或读 AGENTS，不要读这一段。

### 3.79 SCIM provisioning 环境要求（循环轮 13 激活 F118②/F119②）

- **后端**：`stepby-axum/.env` 追加 `SCIM_ENABLED=true` + `SCIM_BEARER_TOKEN=<≥32 字符>`
  （本地实值见 .env；重启后端生效——`/scim/v2/Groups` 端点开启，curl 验证 200）。
- **e2e 脚本**：运行前 export SCIM_BEARER_TOKEN（与 .env 同值，凭据不入库——gitleaks allowlist 定性豁免历史 commit 7e7ba10）；F118 无组时以标准
  SCIM API 建组（IdP 视角 RFC 7644），F119 尾 SCIM DELETE 清理（provisioning 真链路）。
  - ⚠️ **批六十五：未注入 SCIM_BEARER_TOKEN 时 F118② 改为 SKIP（不再计硬失败）**。
    此前直接 `record(false)` ⇒ 缺可选集成凭据被判为失败（本轮全量 1206/1207 的唯一失败即此），
    属"环境耦合导致的假失败"。注入凭据时仍走真实建组链路（实测 12/12 通过）。
- **主 context 已 `serviceWorkers: block`**：PWA SW 会代理页面 fetch 绕过 page.route 拦截
  （F119 role/list 500 mock 失效实证）——依赖 route mock 的用例均依赖此设置。
- **剩余设计内 SKIP 3 项**：F2（scheduler 无运行时 API）、F106①/F129③（passkeys 能力位
  auth.webauthn 关闭——激活需 headless 虚拟认证器（CDP WebAuthn）+ 后端 rp 配置，另立项）。

### 3.80 分片与视觉回归（批六十四质量工程）

- **分片**：`node main.mjs --headless --shard=N/M`（N=1..M，按**序号连续区间**切分——保持
  用例前向依赖链，id 取模分片实证破坏依赖产生假失败）→ 每片落盘 shard-N.json →
  `node main.mjs --merge` 合并总汇总。SQLite 档建议顺序跑各片（并行会加剧 503 风暴）。
- **视觉回归**：`TEST_BASE=http://localhost:8080 node tests/e2e/visual-regression.mjs`
  （多页面像素比对，阈值 1%；基线库 **baselines**/ 入库；有意变更后 --update 重新生成；
  零数据依赖静态页 login/lock/notfound——动态数据页会产生假差异不纳入）。
- **passkeys 激活**：e2e 档 config/config.toml（gitignore 本机文件）`[features] "auth.webauthn" = "on"`
  → F106①/F129③ 激活；headless 注册走 CDP 虚拟认证器（`WebAuthn.enable` +
  `addVirtualAuthenticator`）。
  - ⚠️ **`[webauthn].origin` 必须等于前端页面的真实服务源**（WebAuthn 信任锚）。E2E 由后端在
    `:8080` 同源托管 SPA，而 `origin` 留空时从 `[server].cors_origins` 首个来源推导（通常是
    Vite dev 源 `:5173`）⇒ 浏览器 clientDataJSON.origin（`:8080`）与配置不符，
    `register/finish` 必 **400「WebAuthn 响应无效」**。修法二选一：
    ① 配置 `[webauthn] origin = "http://localhost:8080"`；② 环境变量
    `WEBAUTHN_ORIGIN=http://localhost:8080`（另 `WEBAUTHN_RP_ID` 同机制，空白值忽略）。
  - ✅ **历史"后端缺陷（pubKeyCredParams 缺 RS256 → finish 400）"系误判，已订正**：真因是上述
    **origin 失配**（库以 `PasskeyError::OriginMismatch` 返回，落在兜底分支且当时无日志 ⇒ 被
    误读为算法问题）。Chrome 的 "missing ES256 and RS256" 仅为**建议性警告**——本仓
    `passkey-server` 验签为 **P-256/ES256**（`verify_p256_signature`），只广播 ES256 才是
    正确的；广播 RS256 会注册成功但**登录必失败**。修复：`map_passkey_error` 对
    `OriginMismatch` 补 WARN 日志（含期望/实到来源 + 处置指引）；F106① 断言由"接受
    ≥400 的弱断言"**强化为成功链**（registerFinish 200 + 列表新增）。

### 3.81 测试产生的系统数据治理（批六十六，b66）

**为什么单列一节**：e2e 会真实改变系统数据（落库行 + 落盘文件）。若不治理，数据会
**无限累积**并与业务数据混放，最终让"系统数据是否合理/状态是否正常"无法判断。

### B66-1 F25 头像：桩图污染管理员头像指针（真实缺陷）

- **现象**：`Resource load failed: IMG http://localhost:8080/user/profile` 每页加载必报
  （24h 31 条 / 累计 109 条，仅出现在 `/user/profile`）。
- **根因**：F25 的"合法 PNG/JPEG"用 **64 字节 magic-only 桩图**（仅 magic bytes + 零填充）。
  后端 magic 校验只看前几字节 ⇒ 通过；但**桩图不可解码**，被持久化为 `sys_user.avatar`，
  此后每次加载 profile 页两个 `<img>` 报错并回落默认头像。
- ****取证要点**：该请求 HTTP **200**（返回 HTML），故 `requestfailed` **不触发**，只有
  `img.onerror` 会触发 ⇒ **必须用 `page.addEventListener('error', …, true)` 捕获资源
  error 事件**（见 `_probe_img.mjs`）。
- **修复**（`main.mjs` F25）：
  1. 合法 PNG/JPEG 改用**真实可解码 1×1 图**（base64 → `Uint8Array`，浏览器实证 `naturalWidth=1`）；
  2. 新增**"落库完整性"断言**：回读落盘文件，PNG 须以 IEND+CRC、JPEG 须以 FFD9(EOI) 收尾；
  3. 记录**原头像指针**，用例结束**恢复**（无"清空头像" API，用 `node:sqlite` 直连恢复）。

### B66-2 uploads 磁盘无限增长（真实缺陷）

- **现象**：`stepby-axum/uploads` 累积 **1.3 GB / 1702 文件**（`uploads/0/file/` 下 ~754 个
  11 MB 测试 zip）——e2e 上传永不回收，且与业务数据混放。
- **⚠️ 陷阱**：`uploads/<tenant>/audit-archive/anchor_*.jsonl`（74 个）是**审计链归档锚
  = 业务数据**，与上传件同根混放，**盲删会毁业务数据**。
- **工具**：`scripts/cleanup-orphan-uploads.mjs`（核心逻辑 `scripts/lib/cleanup-uploads.mjs`，
  CLI 与 e2e 共用、**不派生子进程**）。
  - **默认排除 `audit-archive`**；`--exclude <子串>` 追加，`--exclude-none` 关闭（不推荐）
  - **dry-run 默认**，`--apply` 才删除；`--since/--before/--older-than-hours` 时间窗
  - `--limit N` 分批（受限沙箱按批）；`--prune-dirs` 清空目录
- **e2e 自清理**：记录 `RUN_START_ISO`，套件结束（含异常路径）清理本次运行新增上传文件。
- **存量清退**：b66 删除 1579 个测试上传件，释放 **1.24 GB**；74 个审计锚完好。

### B66-3 生产代码 panic 硬化（真实缺陷）

- `handler/sso_handler.rs`：`serde_json::to_value(result).unwrap()` → 失败走
  `tracing::error!` + `AppError::internal` 500（保留 RFC 6749 §5.1 的 `Cache-Control: no-store`）。
- `service/gen_table_service.rs::import_table`：`models.pop().unwrap()` → `ServiceError::internal`。
- **回归锁**：`src/handler/no_panic_guard.rs`（2 项）——handler 生产码零 `.unwrap()` 总锁 +
  `gen_table_service` 禁止 panic 回归锁。
- 过程踩坑（均已修复）：`needless_question_mark`（`Ok(x?)`）、`module_inception`
  （`no_panic_guard::no_panic_guard` → 内层改名 `no_panic_mod`）。

### B66-4 纪律重申：全量期间零并行

b66 我在全量 e2e 期间并行跑了 `cargo test --lib`，导致：

- 后端集成测试 **263 假失败**（Redis 连接超时，非代码缺陷）；
- e2e F4 **假失败**（ECharts 0 个，CPU 饱和图表未渲染）。
  **单跑复核**：e2e F4 **4/4 PASS、6 个 ECharts 图表**（假失败确认为 CPU 争用）。

### B66-5 后端集成测试 263 失败 = Redis 容器退出（环境定因，非代码缺陷）

- 报错：`连接测试 Redis 失败（请确认本机 Redis 可达...）: Redis 连接超时`。
- 根因：**docker 容器 `stepby-redis`（redis:7-alpine）退出**（`docker ps -a` 可见 `Exited`）。
  `docker start stepby-redis` 后复跑即绿。
- **⚠️ 陷阱**：`/health` 返回 `redis: UP` **不代表**字面 Redis 在跑——该字段反映
  **SharedStore**（`local` 档 = 业务库连通性，`health.rs:37-38`）。
  ⇒ **后端 health 全 UP 与"集成测试可跑"不是一回事**；集成测试依赖 docker 里的 Redis。
- 排查顺序固化：**先 `docker ps -a | grep redis` / `netstat` 查 6379，再怀疑代码**。

---

### 3.82 前端 dist 构建模式辨析（b66 取证，排除嫌疑）

- `.env.production` = `VITE_APP_BASE_API='/prod-api'`；`.env.embedded` = `''`。
- 后端 `Router::nest` 同时挂 **`/prod-api`、`/dev-api`、`/stage-api`** 三前缀
  （`middleware/mod.rs:31` `API_PATH_PREFIXES`），三者行为等价。
- ⇒ `build:prod` 的 dist 交给后端同源托管**同样可用**（实测 `/prod-api/uploads/...` 200 image/jpeg）。
- ⇒ B66-1 的 IMG 错误与构建模式**无关**（已排除）。`scripts/build-all.ps1` 用 `build:embedded`
  属另一种部署形态（反向代理去掉前缀），两者皆合法，**不是缺陷**。

---

## 3.56 批七十（2026-10-16）：F141 文件页 UI 全链 + F142 redirect 防护 + 死代码清理后全量复核

**新用例（main.mjs 功能 141-142，文件页零 UI 覆盖 + redirect 防护缺口补强）**：

- F141 文件页 UI 全链（5 项断言）：① 页面可达（/system/file）② 工具栏/搜索表单/上传入口渲染
  （fileInput 按 `.count() > 0` 判存在——EP el-upload 的 file input 按设计 `display:none`，
  e2e 判存在不判可见，`_visible` 必败）③ 文件表格渲染 ④ **UI 上传落库（上传前后列表首行对比）**
  ——后端 `save_upload_bytes` 存 UUID 文件名（原名丢失）、fileName 过滤是 `contains`、列表按
  lastModified 倒序，故禁用"按原名过滤命中"式断言，改确定性首行对比（beforeTop≠newTop 且 ext=txt）
  ⑤ UI 删除（API 复核已移除 + 兜底清理）。
- F142 redirect 防护（2 项断言）：① 安全路径跳转（`/redirect/workbench/index` → `/workbench/index`）
  ② 开放重定向防护（`/redirect//evil.example.com` 不回跳外域，落回 `/index`）。

**基线变化**：断言总数 1204 → **1211**（+7：F141 ⑤项 / F142 ②项）；功能数 140 → **142**
（F117 仍为设计内 SKIP，不产断言条目）。

**全量实测（2026-10-16，重启后端后单跑，29m27s）**：`总计 1211 通过 1211 失败 0`（EXIT=0），
pageerror=0；可疑 Toast 3 条（验证码错误/SQL 模板校验/流程图校验——均为负路径预期反馈）；
consoleErrors 9 与 networkErrors 9 一一对应且全为负路径探针（403 register、401 unlock/login×2、
400 channel/aiConfig/totp/dataset/channel-test）；hub 镜像 40 条 = 已知环境噪声 38 + 未分类 2
（2 条均为负路径 400 资源加载，与 networkErrors 对账一致）。后端窗口零 ERROR/WARN。

**同批前端静态门禁**：`vue-tsc --noEmit` 0 错误、`eslint .` 0 error 0 warning、
`vitest run` **81 文件 / 1047 用例全绿**（b70 净删除 25 个零引用导出——makeMap/titleCase 曾误删，
被 `src/utils/generator/*.js` 消费，CI 生产构建红暴露后恢复并补回归测试，事故详情见 b70 台账 §3.6；
新增 `src/api/system/file.test.ts` 9 例）+ 生产构建 `vite build` EXIT=0（b70 起固化进本地门禁）。
单跑启动器 `e2e-b70-single.sh`（自定位 + 环境变量）。

---

## 3.57 批七十一（2026-10-16）：上传链 multipart 真缺陷取证配方 + 三条"假信号/假结论"教训

### 3.57.1 浏览器 wire-level 取证：F141 "Invalid boundary" 的定位配方

F141 ④⑤ 稳定失败（UI 上传不落库），但**静态源码守卫（`api/system/file.test.ts`）全绿**——
说明缺陷不在"有没有手动设头"，而在**实际发出的字节**。一次性探针（Playwright 读 `request.headers()`
与 `postDataBuffer()`）是唯一定位手段：

```js
page.on('request', (r) => {
  if (r.url().includes('/system/file/upload')) {
    console.log(r.headers()['content-type'], r.postDataBuffer()?.toString('utf8').slice(0, 200))
  }
})
```

实测（修复前）：`content-type="application/json;charset=UTF-8"`、请求体 `{"file":{"uid":1792149854495}}`
（30 字节，**文件字节整体不存在**）。根因：`request.ts` 的实例顶层默认头
`service.defaults.headers['Content-Type'] = 'application/json;charset=utf-8'` 会合并进**每一个请求**，
axios 1.20 的 `transformRequest` 见「JSON 头 + FormData」直接走 `formDataToJSON`，
而"FormData 时移除 Content-Type"的分支在之后的 `resolveConfig` 里、判的是已变成字符串的 data ⇒ 救不回来。

修法（同族一次收干净，覆盖 FormData / Blob / File 三类载荷）：请求拦截器内
`config.headers.setContentType(false)`。**必须是 `false` 不能是 `delete`**——`dispatchRequest`
随后对 post/put/patch 有 `setContentType('application/x-www-form-urlencoded', false)` 的缺省补值，
`rewrite=false` 只在头**缺省**时生效，`delete` 会被它回填；`false` 既不被覆盖又被
`AxiosHeaders.toJSON` 过滤（null/undefined/false 不上线）⇒ 头不发出，浏览器自动补 boundary。
回归锁：`src/utils/request.upload.test.ts`（真实 service + 桩适配器断言 `config.data === form`
且头不上线；已做变异证伪——注掉修复即变红 `expected '{"file":{}}' to be FormData{}`）。

**为什么 1211 条断集体漏掉这条链**：头像/分片/富文本此前要么走裸 axios（不受实例默认头影响），
要么 e2e 用手工拼 multipart 的 API 级请求（自带 boundary）；F141 是**第一条经 `service` 的浏览器 UI 上传**。
教训：**"接口能通"不等于"链路能通"**，UI→封装层→传输层→后端四层里任一层被绕过，缺陷就隐身。

### 3.57.2 加 aria-label 会撞全页 `getByRole` 定位器（F63 真回归）

给 TreePanel 树刷新按钮补 `aria-label="刷新"` 后，F63 的全页
`getByRole('button', { name: /^刷新$/ })` **抢先命中树面板按钮**，点了 `/system/dept/list`
→ `reqs=0` → F63 判失败。这是可访问性改动引发的**真实**回归（不是用例脆性）。双侧修：

1. 可访问名去歧义：树刷新改 `'刷新树列表'`（`zh-CN/tool.ts` `treePanel.refresh` / `en-US` `'Refresh Tree'`）
   ——原本"图标即按钮、无名称"本身也是 a11y 缺陷；
2. 用例限定作用域：`page.locator('.top-right-btn').getByRole('button', { name: ... })`。

**纪律**：新增 `aria-label`/`role` 后必须 `grep -rn "getByRole" tests/e2e | grep "<新名称>"` 全仓对账。

### 3.57.3 分段区间的边界**必须由注册表派生**，不得手抄（b83 按实测订正本节原结论）

原文写的是"F117 是保留编号、设计内不注册、不产断言条目，所以 `--feature=91-120` 会把它当缺失而报失败，
正确写法 `--feature=91-116,118-120`"。**这条建议现在是错的，而且错的方向正是本仓立过案的那一族：
静默少跑一个已注册功能。**

实测（b83）：

- `main.mjs:18585` 有 `{ id: 117, fn: testFeature117 }` ⇒ F117 **在册**；
- 每段开头的注册表自检记的是 `144 项，编号 1..144` ⇒ 117 不在空洞里；
- b82 权威轮日志里 `[功能117]` 命中 **19 行**，但其中**判定记录只有 9 条**：另外 9 条来自结尾汇总块
  （与逐条目行同形，聚合前必须剔除，见本表⑧ 同源纪律）、1 条是 `⏱ [功能117] 21.0s` 耗时行。
  正确取法 `grep -cE '✅ PASS \[功能117\]'` = 9。

后果：照原文把 117 剔出去，第 5 段少跑 9 条判据，而**每段照样报绿**——与 b79 那条
"手抄 `76-86` 会静默少跑最后一个模块"完全同形，只是这次的坑写在配方里。

**规则**：分段边界一律由注册表派生，不抄文档也不抄上一批的命令。

b84 起这条有了**入口**，不再依赖任何人记得跑一段手工命令：

```bash
node tests/e2e/main.mjs --plan      # 免凭据、不启浏览器、不碰库
```

它打印功能总数与分片口径（现打：`--feature=1-24 / 25-48 / 49-72 / 73-96 / 97-120 / 121-144`），
并在三种情况下 **EXIT=2 且拒绝给出口径**：编号有空洞、有重复、条数与最大编号不吻合，
以及"注册表区派生出的条目数低于采集面下限"。

**为什么把手工 `node -e` 换成入口旗标**（这就是"有更好的方案"的那一步）：原文给的补救是
一段正则命令，它有三处会坏——① 没人跑（本仓的铁律"写了没接线=没写"，手工命令是最容易忘的接线）；
② 它扫的是**全文**，注释里讲解旧写法的那条 `{ id: 999, fn: … }` 会被算成在册条目（b83 那段注释
本身就写着这个形状）；③ 它只打印不判定，末位输出 `0` 要人眼睛读。现由
`tests/e2e/e2e/run/plan.mjs` 承担：派生面只取 `const features = [ … ]` 的**数组区**
（自检 ⑥ 钉住"数组区之外的同形状文本不得进集合"），四条口径一律 fail-closed，
且接了 `run-gates.py` 的 `plansynth`/`plan` 与 `ci.yml`。

四条口径里第三条是**漏读探测**（区内"条目形状数"必须等于读到的条数），它补的是一类
形状判定**结构性看不见**的缺陷：派生正则漏读某个编号时，那个编号压根不在集合里，
于是 `1..max` 依然连续、`count === max` 依然成立——**"漏读"在集合论上和"没注册"不可区分**，
但后果完全不同（前者是每轮静默少跑一族）。探测同时把派生正则放宽到能吃下
多行写法 / 尾部逗号 / 条目里多一个键（自检 ⑨），把残留盲区缩到"键序颠倒、`id` 取变量、
数组区外 `push`"三种，而这三种由下一条兜。

还有一条**每轮自证**：主套件开头的注册表自检把"文本派生集合"与"运行时 `features` 数组"对账
（不一致即该段判红）。两条腿**必须都有独立变异证据**，否则写"有对账"等于没写：

| 变异                                                         | `--plan` / `--selftest`                                                                                                                             | F0 运行时对账                                          | 结论                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 数组区外 `features.push({ id: 145, fn: testFeature1 })`      | **双双报绿**（文本侧 144 条自洽，探测也看不见）                                                                                                     | ❌ FAIL `运行时在册但文本派生漏掉的编号=145`，EXIT=1   | 运行时腿不是冗余：它是唯一能看见"注册写在数组区之外"的通道                                                                                |
| 把一条注册写成 `{ fn: testFeature143, id: 143 }`（键序颠倒） | `--plan` EXIT=2、`--selftest` EXIT=1（⑪ 真实正控转红），均点名 `注册表区里有 144 处"条目形状"（对象字面量 144 / id: 144），但派生口径只读到 143 条` | ❌ FAIL `派生口径失效：注册表区里有 144 处"条目形状"…` | 探测腿有效：它不要求正则穷举写法，只要求"形状数 === 读到数"，且把 FATAL 同时透传给运行时腿（`main.mjs` 里 `derived.fatal` 进 `problems`） |

两轮变异实测后均 `diff -q` 逐字节还原并复绿（`✅ PASS [功能0] … 144 项，编号 1..144（与 --plan 派生口径一致）`）。

若将来真的出现未注册编号，`--plan` 会先拒绝给口径，注册表自检也会把这一段判红，
**不需要任何人手抄排除表**。

同理 `121-142` 内含 SKIP 项，判据是 `失败: 0` 而非 `SKIP: 0`。

### 3.57.4 构建模式正确性要看入口 chunk，不看 index.html

`/prod-api` 注入在 `static/js/index-*.js`，`index.html` 里**查不到**。b71 实测：
`grep -rho "/prod-api" dist/static/js/index-*.js | wc -l` = **18**（production）、
`frontend-dist/static/js/index-*.js` = **0**（embedded）。用 index.html 判定模式是空探针。

### 3.57.5 基线与门禁实测（b71 终值，全部真实执行）

- **main.mjs**：142 features / **1211 断言 / 0 失败**，分 5 段前台跑，各段 EXIT=0：
  `1-30` 235、`31-60` 352、`61-90` 343、`91-116,118-120` 151、`121-142` 130（SKIP 4 均为设计内）。
  （**b73 订正**：这里的"142"是**最大编号**，真实注册数当时为 **141**——117 是空洞，故分段
  `--feature=97-143` 会撞上"未注册"硬失败；b73 补注册 F117 + 新增 F143 ⇒ 现 143 项连续，
  并加无条件注册表自检使该类漂移**当场可失败**，见 §3.59.13。）
- **a11y-full**：**560/560**，EXIT=0。首跑 559/560——`/workbench/index` 的 `el-avatar` 未给 `alt`
  （EP 的 `alt` prop 才会落到内层 `<img>`），补 `avatarAlt` computed 并复用既有键
  `layout.navbar.avatarAlt`；同族扫 `sso/consent.vue` logo（`:alt="clientName"`）；
  全仓 `<img>` 缺 alt 静态扫描归零。
- **deep-e2e**：见 §3.57.6（本轮实测口径订正）。
- **前端**：`vue-tsc --noEmit` 0 错误；`eslint .` 0 error 0 warning；
  `vitest run` **87 文件 / 1096 用例全绿**（+6 测试文件：request.upload / useUnsavedGuard /
  auth / download / modal / dict）；`vitest run --coverage` 全 src 默认口径
  **语句 68.66 / 分支 62.09 / 函数 55.40 / 行 69.69**（分目录表见 `TESTING.md`）；`vite build` 双模式 EXIT=0。
- **后端**：`cargo fmt --check` 0 diff；`clippy --all-targets -D warnings` EXIT=0；
  `cargo test --lib` **1394 passed / 0 failed**（含 integration_tests 270；b70 基线 1372）；
  `RUSTDOCFLAGS=-D warnings cargo doc` 0 警告。
- **种子**：`python stepby-axum/scripts/seed_diff.py data/seed-check.db` ⇒ **漂移 0**
  （留档 29 / PENDING 0 / 运行行 264609 不计）。构建纯种子库用**已构建二进制**直接起第二实例
  （`DATABASE_URL='sqlite://./data/seed-check.db?mode=rwc' SERVER_PORT=8094 target/debug/stepby-axum.exe`），
  避免 `cargo run` 触发重编译与运行中 :8080 二进制的文件锁；用完按 PID 精杀（**只杀 8094，勿动 8080**）。

### 3.57.6 deep-e2e 基线数字订正（2106 系文档错误）

AGENTS.md/TESTING.md 自 2026-10-14 起记 `84 模块 / 2106✅`，与同段"历史口径 1029"差整 2 倍。
b71 用**两条独立路径**实测同一套件：

| 口径                                                                                                  | 结果                                                                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 全量单轮（无过滤，修复中期产物）                                                                      | **86 模块 / ✅ 1053 / ❌ 0 / SKIP 48 / 2423.2s**，被吞异常 0、后端 ERROR·WARN 0，EXIT=0 |
| 全量单轮（无过滤，**最终二进制复跑**）                                                                | **86 模块 / ✅ 1053 / ❌ 0 / SKIP 48 / 2550.3s**，被吞异常 0、后端 ERROR·WARN 0，EXIT=0 |
| 分 6 段（`--range=1-15 / 16-30 / 31-45 / 46-60 / 61-75 / 76-86`）求和，与"修复中期产物"单轮同产物互证 | 302+173+134+158+149+138 = **1054**，0 失败                                              |

两条路径互相印证（差 1 为时间敏感软断言），且 `deep-e2e.mjs` 全文 `record(` 调用点仅 1167 处
——**单次运行不可能产出 2106 条计数**。结论：2106 是历史誊写/翻倍错误，现行基线以 **86 模块 / 1053✅** 为准。
**纪律**：基线数字必须"两处同写、每批复跑"。**b79 订正**：原来这条还写着"与断言调用点总量做量级对账，
超出即错"——**这条不成立**（见下 ③）。调用点计数只能当"值得去重跑"的量级直觉，不能当判据。
本轮就是靠这个量级直觉发现 2106 与 1167 矛盾，但**真正定性靠的是重跑**。

> **b79 三点订正**：
> ① "现行基线以 86 模块 / 1053✅ 为准" 到本批已过期——**唯一事实源是 `AGENTS.md`《测试门禁全景》的
> deep-e2e 行**，模块总数由 `node tests/e2e/deep-e2e.mjs --plan` 现打（本批为 87）；本节只保留
> "证伪 2106" 这条方法与结论，不当现行值用。
> ② 上表"差 1 为时间敏感软断言"这句在本批被**落实到了具体判据**：同产物两轮全量的逐条 verdict
> 差集只翻一条，就是 25.11 的 `SkeletonTable: 骨架屏（瞬时）`（§3.60.7）。它此前被当成"软断言正常抖动"
> 记账，实际是**判据与竞态耦合**——已改成 route 按住响应构造加载态，不再依赖"恰好抓到那一帧"。
> ③ 量级对账的口径必须写明，否则"1167"这类数字不可复现。本批口径：
> `grep -o 'record(\|recordSkip(\|recordSoft(' deep-e2e.mjs | wc -l` = **1448**（含 3 处函数定义行），
> 单轮实测 1210 条 ⇒ 1210 ≤ 1448 成立。若某轮总数超过该值，先怀疑判据被重复记账，不是"跑得更多"。

### 3.57.7 ux-compat 的 URL 口径（假失败陷阱）

`ux-compat-verify.mjs` 的 `UI_URL` 缺省指向 **:5173（vite dev）**，与本配方权威环境（embedded :8080）不同。
不带 `STEPBY_UI_URL` 直接跑会得到 `net::ERR_CONNECTION_REFUSED at http://localhost:5173/login` 的**环境性假失败**。
正确启动式：

```bash
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
STEPBY_BASE_URL=http://localhost:8080 STEPBY_UI_URL=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
PLAYWRIGHT_BROWSERS_PATH="D:/Projects/.pw-browsers" node ux-compat-verify.mjs   # ⇒ 11/11 PASS
```

### 3.57.8 后端改动后重跑 e2e 的固定顺序（exe 锁与预热）

`target/debug/stepby-axum.exe` 被运行中进程**独占锁定**，直接 `cargo build` 会 `os error 5`。固定顺序：

1. `Stop-ScheduledTask stepby-backend-tmp` → 确认进程已退（残留则按 PID 精杀）；
2. `cargo build -j 4`（embedded 前端产物须已同步进 `frontend-dist/`，见 §2）；
3. `Start-ScheduledTask stepby-backend-tmp`（任务里不带 env，配置来自 `config.toml` + `.env`，
   与手工 `EMBEDDED_FRONTEND=true … cargo run` 等价但**不受会话回收**——见 §3.34 进程树级联教训）；
4. `/health` 探活 200 后**再等 ≥25s** 起跑（§3.55 503 连接风暴教训）；
5. 全量重跑主套件（分 5 段）+ 受影响域的 deep-e2e。

## 3.58 批七十二（2026-10-17）：敏感操作独立限流上线后的三条配方 + 虚锁自查

### 3.58.1 数据量增长会让"首页可见"类断言变成假失败（F8）

`sys_rate_limit` 由 6 行涨到 **25 行**（敏感操作独立限流 19 档，AGENTS C.10）后，F8 原断言
"表格首页出现 `全局默认` tag"必然翻红——`*` 行被分页翻到后面。
**修复口径（不是放宽断言）**：先按 `routePattern=*` 过滤再断言"过滤后行数 = 1 且渲染成 `全局默认` tag"，
用例末尾**重置过滤条件**（防污染后续用例的表格状态）。
**通用判据**：向任何被 e2e 覆盖的配置表播种新行前，先 grep 该页面对应的 feature，把"位置依赖"
（首页/第一行/前 N 行）断言改成"契约依赖"（过滤后唯一命中）。同类前例：b71 F118 环境耦合、b70 F141。

### 3.58.2 429 的第二种成因：桶键共用（F71），与"限流太松"无关

b71 的 429 教训是"配额取太紧"；b72 是**分桶口径**：`rate_limit_bucket_key(tenant, ip)` 被所有规则共用，
于是打满 `/system/user/profile/updatePwd`（容量 5）会令同一客户端的 `/system/user/list`（走 `*`，容量 100）
一并被拒。取证顺序：

1. 看 429 响应的 `Retry-After` 与**被拒路径**是否与"打满的路径"不同 ⇒ 若是，怀疑跨规则共桶而非配额；
2. 直接查库确认命中规则：`SELECT route_pattern, capacity, refill_per_second FROM sys_rate_limit WHERE enabled='0'`；
3. 复现最小化：集成测试里"打满 A → 断言 B 不得 429"（`test_own_tier_exhaustion_does_not_starve_other_routes`）。

修复后口径：**命中自有档位的走路由级桶**（`rate_limit_route_bucket_key`），回落全局的仍走 (租户,IP) 共享桶。

### 3.58.3 虚锁自查：harness 缺省值会把自己的断言洗白

上条集成锁**首轮是虚锁**——把分桶修复回退后仍然绿。根因：`integration_tests/mod.rs` 把全局 `*`
钳到 `capacity=1e6 / refill=1e6`，"其它接口不被饿死"在该缺省下恒真。处置：

- 用例内**显式钉回生产量级**（`UPDATE sys_rate_limit SET capacity=100, refill_per_second=10.0 WHERE route_pattern='*'`
  - `invalidate_all_cache`）后再断言，此时回退修复会**立刻复现 429**；
- 判据口诀：**"某接口不受影响"类断言，必须先让对照组真的受配额约束**，否则锁的是环境不是代码；
- 另：本批把用例里一处 `/system/user/resetPwd` 换成 `POST /system/pat/999999/rotate-ak`——
  前者会改掉 admin 密码并破坏并行用例（**用例不得动全局凭据**）。

### 3.58.4 `[health].external_probes` 翻档的正确姿势（勿用 set_var）

`[health]` 是部署态开关段：`off`（默认 = 现状，响应体不含 `external`/`externalStatus`）与 `basic`。
集成测试已在 `integration_tests/mod.rs` 钳制为 `HealthConfig::default()`（AGENTS 开关规范⑧）；
用例需翻档时**必须在该用例的 `configure` 闭包内**声明 `s.rate_limit`/`s.health` 字段，
禁止进程级 `set_var`（会污染并行测试）。真实探活只在 `basic` 档发生，故 off 档跑全量 e2e 不引入外呼。

### 3.58.5 长套件分段被系统转后台时的接管口径

deep-e2e 单段（如 `--range=16-30`）可能超过单次工具超时而被自动转后台。正确做法：
**前台等待完成通知后一次性读整份日志**，不轮询、不 `tail` 截断（截断会丢掉 `❌` 行与终局统计）。
b72 分 6 段实测：302 + 172 + 134 + 158 + 149 + 138 = **1053**，与 b71 全量单轮同数（§3.57.6 量级对账口径）。

**分片边界不得手抄**（批七十九新增口径）：跑批前用
`STEPBY_TEST_USER=… STEPBY_TEST_PASS=… node tests/e2e/deep-e2e.mjs --plan` 取当前分片方案——
它从注册表 `testFns` 派生模块总数与边界，并顺带校验「编号 1..max 连续」（有空洞 ⇒ 退出码 2，
因为分片会静默跳过那个编号）。此前 `--range=…/76-86` 手抄在本文与 AGENTS 两处，
M87 落地后若不同步改文档，最后一片会**静默少跑一个模块**而每段照样报绿
（与路由清单手抄同一类缺陷）。本文里出现的历史段边界只作当时凭证，不作操作指引。

### 3.58.6 基线与门禁实测（b72 终值，全部真实执行）

| 门禁                                                 | 实测                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `cargo test --lib`                                   | **1426 passed / 0 failed**（`-- --list` 交叉核对同数；integration_tests **274**）                |
| fmt / clippy `-D warnings` / `cargo doc -D warnings` | 全 PASS（`-j 4`）                                                                                |
| `vitest run`                                         | **92 文件 / 1162 例**；覆盖率（`--coverage`）All files **69.30 / 62.86 / 55.80 / 70.33**         |
| `vue-tsc` / `eslint`                                 | 0 错误 / 0 error 0 warning                                                                       |
| e2e 主套件（分 5 段）                                | **1211 断言 / ❌0 / SKIP 5**，全段 EXIT=0                                                        |
| deep-e2e（分 6 段）                                  | **86 模块 / ✅1053 / ❌0 / SKIP 48**，全段 EXIT=0（约 40.5min）                                  |
| a11y / ux-compat / perf-budget / duplicate-deps      | 560/560 / 11/11 / 6/6 / 0 重复                                                                   |
| `seed_diff.py`                                       | **PASS 漂移 0 / 豁免 48**（首跑 19 处假漂移见 b72 台账 §五 轮 5：`sys_rate_limit` 需登记业务键） |
| 后端窗口                                             | **0 ERROR / 47 WARN**（WARN 全部归入设计内负路径：限流拒绝 / 探活 DOWN / best-effort 留痕）      |

## 3.59 批七十三（2026-10-17）：假断言判据配方 + 断言工具自曝 + common 授权跨语言锁

### 3.59.1 两个必须知道的取证事实（否则"接口没被调用"全是假失败）

1. **axios 入参全为 `undefined` 时不生成查询串**：`GET /monitor/online/list` 实测 URL **不带 `?`** ⇒
   `listHint: /\/x\/list\?/` 永不命中。统一写法：`(\?|$)` 收尾；同一页多面板共用端点时按查询串区分
   （如 `/monitor/logininfor/list(\?(?!.*userName=)|$)` = 全部日志 vs `list\?(?=.*userName=)` = 我的登录）。
2. **Element Plus 的 `el-tab-pane` 默认非 lazy**：面板在**挂载时**就发自己的请求并留在 DOM（`display:none`），
   点 Tab **不产生新请求** ⇒ 把"点 Tab"当触发器必然误报。配方：以 reload 为触发 + `activate` 切面板 +
   `container: '.el-tab-pane:visible'` 限域（否则行数为全站之和）。

### 3.59.2 Playwright 的 "visible" ≠ 在画布内

`translate3d(-210px,0,0)` 移出视口的抽屉式侧栏，`isVisible()` 仍返回 **true**（只看有无非零盒）。
移动端/抽屉类判据必须取几何：`getBoundingClientRect()` 关闭态 `right<=1`、展开态 `left>=-1 && right>1`。

### 3.59.3 未命中的 `locator.textContent()` 会等满默认 30s

M47「执行一次」逐按钮 hover 取 tooltip 一段实测拖到 62s：`textContent()` 对**不存在**的元素按默认超时等待。
统一改为"先 `waitFor({state:'visible', timeout:N})` 再取文本 + 显式超时"，且把等待失败计入可打印的计数。

### 3.59.4 HTTP 400 的用户提示走 **warning** 通道，且有 600ms 聚合窗口

`request` 拦截器把 400/403/404/429 交给 `errorHub.report('warning','api', backendMsg)`，
经 **600ms 聚合**后弹 `.el-message--warning`（存活 5s）。只数 `.el-message--error` 的负路径断言必然假失败
（M26「岗位唯一性」改前三段皆假绿）。正确判据：① watched 请求确实发出且被拒 +
② **提示文案包含后端返回的 `msg`**（用 `hasText: msg` 匹配，不猜 Toast 类型）+ ③ 弹窗仍未关闭。

### 3.59.5 断言工具自身的缺陷必须自曝，不得降级成被测系统的失败

`verifyListLoaded` 的容器限域分支曾调用 `page.evaluate((c) => …)` **漏传第二个实参** ⇒ `c.replace` 抛错 ⇒
`catch` 静默返回兜底对象 ⇒ 所有带 `container` 的判据一律报"表格未落定"（工具 bug 冒充产品缺陷）。
修复：补传实参，并把异常文本收进 `evalError`、在 `why` 里显式标注"⟵ 断言工具异常，非产品问题"。

### 3.59.6 失败请求要能全量对账（抽样打印等于没有）

门禁判据是"负路径断言与 `失败请求(HTTP>=400)` 逐条对账"，旧实现每 hub 只取最后 2 条、总量截到 12 行
（实测"总数 11 / 只打印 4 行"）。现口径：`capture-kit` 单 hub 上限 **200** 并暴露 `tag`（M<id> 归因）；
`runner` 按（模块, 方法, 状态, 路径, 响应体）聚合去重、打印**全部种类 + 重复计数**，
全量清单落盘 `screenshots/deep-e2e-net-<ts>.json` 供轮后复核。

### 3.59.7 分片参数不得静默缩水

`--feature=1,21,70` 曾因 `parseInt` **只跑模块 1 且退出码 0**（覆盖率被静默高估，台账数字失真）。
现支持单值 / 逗号 / 区间，且解析失败、命中未注册模块号、`--range` 非法 → **退出码 2 当场失败**。

### 3.59.8 `<Transition mode="out-in">` × 模板 ref = 图表永不首绘

`out-in` 要等**旧分支 leave 动画结束**才插入新分支 ⇒ 数据到达后单次 `nextTick()` 时模板 ref 仍是 `null`。
产品侧修法见 `useChart.ts::waitForRef`（轮询到容器进 DOM，超时返回 `null`）；
`CacheOverview.vue` 两张图**各自独立**取实例（旧写法第一张 `return` 会连累第二张），
无数据时渲染 `el-empty` 而非空白卡片。测试侧若判据依赖 canvas，必须先按档位分支
（SharedStore `local` 档合法地没有 Redis 内存图 ⇒ `c.pass || 可见 el-empty` 才算过）。

### 3.59.9 排序键必须在初始 `queryParams` 里声明

`useCrudTable.getList()` → `syncUrlQuery()` → `router.replace({query})`，而 `AppMain.vue:11`
用 `:key="route.fullPath"` 缓存页面 ⇒ **query 变化即重建组件**；`restoreQueryFromUrl()` 只回填
"初始查询对象里已存在的键"。`handleSortChange` 事后挂的 `orderByColumn` / `isAsc` 若未在初始对象声明，
重建时被丢弃 ⇒ 用户点排序等于没点（实测请求带 `isAsc=asc` 而渲染仍倒序）。
四个页面补键 + 两页面 `defaultSort` 回灌/`resetQuery` 拉回，判据用**整列单调性**而非首行文本
（同名行、同秒记录会洗白）。

### 3.59.10 跨语言判据镜像的唯一机械对账器是 `seed_diff.py`

M9 前置在 JS 侧镜像了两张后端表：`PLATFORM_ONLY_PERM_PREFIXES`（后端 12 条，JS 曾漏 2 条）与
common 写权限例外（后端 `governance::COMMON_ROLE_WRITE_EXCEPTIONS`）。**镜像必然漂移**，
本轮就是靠 `seed_diff.py`（纯种子库 vs 运行库逐行 diff）抓回 12 处漂移与 2 条前缀缺失。
纪律：新增/修改任一侧判据后必须跑一次 seed_diff；前置记录同时做**写后读回闭环**
（`roleMenuTreeselect/2` 读回 === 目标集合，打印 `补N/剔M`；种子正确时应为 `补0/剔0（种子即终态）`）。

### 3.59.11 `Statement::from_string` 与迁移 `execute_unprepared` 的参数解析路径不同

生成的 SQL 里漏一个闭引号（`perms LIKE '%:list`）会让后续 `'%:query'` 失去字符串字面量身份，
sqlx 把它当**命名参数** ⇒ `unsupported SQL parameter format: :query`，且只在走 `execute_raw` 的
兜底路径报错、走 `execute_unprepared` 的迁移路径不报。教训：拼接 SQL 的子句必须有
**单引号成对**静态锁（`governance` 已有），不要指望"迁移里能跑"代表兜底也能跑。

### 3.59.12 深链数字参数禁裸 `Number(route.…)`：IEEE754 会把畸形值"洗白"成可发请求

`Number('1'.repeat(100))` **不抛错**，而是折成 `1.111111111111111e+99`，于是
`Number(route.params.userId)` 直接把畸形深链变成一个**看起来合法**的出网请求
（真机取证：`GET /system/user/authRole/1.111111111111111e+99` → 后端
`400 Invalid URL: Cannot parse … to a i64`）。用户视角＝"点了没反应 + 一次注定失败的往返"。

- 统一写法：`toPositiveInt(route.params.userId)`（`src/utils/validate.ts`，
  `^\d{1,15}$` + `Number.isSafeInteger` 双闸，非法返回 0 ⇒ 调用方以 0 判"不发请求"）。
  放 `validate.ts` 不是审美问题：`utils/index.ts` 引 `i18n` + DOMPurify，
  而 `useCrudTable.test.ts` 整体禁真实加载这些重依赖（否则 fork worker 超时）。
- 形状锁：`src/utils/routeParamNumber.guard.test.ts` 扫全 src，裸 `Number(route.` 必须 0 处，
  并钉住五处已接线站点；含"扫描器自检"控制组（合成样本必须被抓、注释行不得误抓）。
- **同族第五处**在 `useCrudTable.restoreQueryFromUrl`：`pageNum/pageSize` 走 `toPositiveInt`，
  其它数值型查询键只在 **`String(Number(v)) === v.trim()`（往返无损）** 时才接受 URL 注入。
  这样 `007 / 1e99 / 100 位串` 保持页面默认，而 `0`、负数、`1.5` 仍按字面注入
  （页面自己 `syncUrlQuery` 写出的值必然往返无损，正常深链与刷新恢复不受影响）。
- e2e 判据必须**两侧都钉**：畸形 ⇒ 请求不得出网 + 页面落确定态；
  对照组（合法不存在的 ID）⇒ 必须照常出网且路径尾为该 ID。只测前者，实现可以是"永远不发请求"。
  见 `main.mjs` F117 与 `deep-e2e.mjs` M32 的 32.3/32.4/32.4b。

### 3.59.13 分段跑批会撞上"注册表编号空洞"——全量跑批永远看不出

`main.mjs` 的过滤卫生要求 `--feature` 指定的编号必须已注册，否则记 ❌（这是对的：
否则"0 项通过"会被误读成全绿）。但 features 数组历史上**从未注册 117**——注释里的
"F117"指一次测试债改造的标签。后果是双重的：

1. `--feature=97-143` 必然报一条"未注册"硬失败（实测本批唯一 ❌）；
2. 全量跑批看不出该洞，于是文档写的"143 features"与真实注册数长期不符——**b73 机械对账订正**：
   `git show HEAD:tests/e2e/main.mjs` 数 `{ id: N, fn: … }` 条目得 **141 条 / 最大编号 142 / 空洞 = [117]**，
   即当时"142"这个数本身就是**最大编号被当成条目数**的误读（AGENTS 写 143、main.mjs 头写 142、
   §3.57.5 记 142，三处各错一个方向，而全量跑批永远看不出来）。

处置不是"让范围过滤跳过未注册编号"（那等于把静默缩水重新请回来），而是
**补上真实用例 + 加无条件注册表自检**：编号 1..N 连续、无重复，且
"用例数 === 最大编号"（第三项专防"一个重复 + 一个空洞"互相抵消成假绿）。
自检每段贡献 1 条记录（`[功能0]`），因此**分段基线数字要 +1 重算**——
台账/AGENTS 里写的条目数必须由该自检输出对账，不再靠人记。

### 3.59.14 免鉴权端点的每个响应字段都是泄露面（`/health` 曾带出绝对路径）

`[health].external_probes = basic` 档运行栈实测：storage 探针 detail 原样输出
`D:\...\uploads\file`，而 `/health` 挂在 `router/public.rs`（免鉴权 200）⇒ 部署目录结构
交给未认证访问者。此前脱敏口径只覆盖"密码/token/PII"，没人把**路径**当敏感项。
双层修复：源头 `writable_probe` 只报 `file_name()`；`sanitize_detail()` 第④步把绝对路径
折叠为 `<path>`，边界口径钉死为"Windows 盘符 + ASCII 段（不含括号/空格/CJK）"与
"POSIX 必须行首或空白起手且 ≥3 层段"，以保住 `https://host:465`、`GET /models`
这类**排障必需**的信息不被过度脱敏。判据：单测四组边界 + basic 档集成以同源正则断言
detail 不含绝对路径。

### 3.59.15 `waitUntil: 'load'` 超时的重试必须**只对超时**生效

b73 分段跑批实测：`/system/menu` 一次 `page.goto(..., {waitUntil:'load'})` 30s 超时——
同段同时出现 5 条"可疑慢"（F54 99.7s / F56 74s / F52 52.4s / F87 49.1s），后端窗口
**零 ERROR、零 5xx、无失败资源**，是典型的高负载抖动（SPA 首屏要等全部子资源 `load`，
而 embedded 模式的后端在同一个 CPU 上做 gzip 解压，与 Chromium 争核）。

两个真实缺陷被这次抖动暴露出来（都属于"测试自己的缺陷被记成产品失败"，同 §3.59.5）：

1. `gotoDynamicRoute` 名义上"重试 5 次"，但 `page.goto` **抛错**时直接上抛——重试只对
   "落到错误 URL"生效，对最常见的失败形态（超时）完全不生效；
2. 一次抛错使整个功能中止：F58 的四个目标（user/dept/menu/notice）里 menu 抖动
   ⇒ notice 的**全部覆盖丢失**，且只剩一条无归因的 `❌ 测试执行 - 异常: page.goto…`。

处置（**加固 harness，不放宽判据**）：

- `main.mjs::gotoDynamicRoute` 与 `deep-e2e.mjs::safeGoto` 都对导航加"仅超时重试"环
  （`if (!/Timeout/i.test(err.message)) break`）：
  **连接被拒 / 空响应 ⇒ 立刻失败**——那说明后端或整台机器已经没了，重试只会把一个坏环境
  跑成三倍时长，且把"环境已死"伪装成"某模块偶发慢"；
- F58 循环体改为**逐目标 try/catch**，异常记在该目标名下并继续下一个目标
  （覆盖不得因一次抖动缩水，与 §3.59.7"分片参数不得静默缩水"同族）。

判据侧保持硬度：`safeGoto` 重试耗尽仍 `record(..., false, '异常: …')`，
`gotoDynamicRoute` 耗尽后抛出带"5 次均未成功"的归因信息。

### 3.59.16 断言扫描器自身也会误报/漏报——判据必须按实参粒度

`scripts/e2e_assertion_scan.py` 的 literal-true 判据此前是"本行 + 两行续写"的窗口配 `re.S` + `[^;]*?`。
b73 轮 17 实测它**同时**有两类错：

| 方向 | 形态                                                                         | 后果                                                                                                  |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 误报 | `[^;]*?` 跨过本调用的右括号，摸到**下一条** `record(..., true)`              | 一条 `, false,` 的失败分支被记成恒真断言 ⇒ 人去"改代码消警"，判据与真实代码脱钩（deep-e2e 多报 3 处） |
| 漏报 | 窗口只有三行，跨 4 行书写的 `record(\n id,\n name,\n true,\n detail)` 抓不到 | 恒真断言蒙混过关（main.mjs 少报 1 处）                                                                |

另外偏移换算也错：用 `line.strip()` 的相对位置加行首偏移 ⇒ 缩进行的起点整体左移。

**修法**：`_call_args()` 按括号平衡取顶层实参（跳过引号/模板串），判据为
"第三个实参 strip 后 `=== 'true'`"。并配 `--selftest`：合成样本断言"该报的 4 处（含模板含括号、
跨行 `recordSoft`）恰好报，不该报的（失败分支 `false`、变量判据、缩进行、注释里的文档引用）一处不报"。

**基线口径**：修具后 `157 → 155`（`main 39→40` 补回漏报、`deep-e2e 118→115` 去掉误报）。
这是**工具判据修正**，不是放宽棘轮——"只允许下降"从 155 起继续生效。
凡因修工具而重算基线，必须同时写清"哪几处、为什么、方向如何"，否则无法与"偷偷放宽"区分。

---

## 3.60 批七十九（2026-10-20）：三条"绿了也不可信"的判据配方

M87 首跑 ✅32/❌8，逐条取证后 8 条红全部不是"产品按钮坏了"，但挖出 2 个真产品缺陷（P1 表单校验拒绝
逸出成 unhandledrejection、P2 HTTP 调试器内联显示裸 axios 技术串）与 3 类判据自欺。三条通用配方：

### 3.60.1 首访引导遮罩会吞掉**所有**点击；被咽掉的 TimeoutError 造出假绿

```
<div class="stepby-tour-mask fixed inset-0 z-[9998] pointer-events-auto"> … intercepts pointer events
```

新浏览器上下文没有 `localStorage` 的 `*-tour=completed` 标记 ⇒ 每个页面都会起引导 Tour。
Playwright 的 actionability 检查永远等不到"可点"，`btn.click({timeout:3000}).catch(()=>{})`
把超时咽掉后代码照样 `return true`。于是"点击=true + 什么都没发生 + 请求数=0"被记成 PASS——
**本轮 8 条红里两条"不得出网"其实是这个假绿**（红的那条只是同批的"确认框文案"判据先撞上了）。

配方（`deep-e2e.mjs` M87 已接线）：

- 导航后一律 `dismissTour(page)`（本模块用 `gotoPage()` 把 `safeGoto + dismissTour` 绑成一步，
  靠每条用例自觉必然漏）；**但"进页面时收一次"不够**——引导是在页面数据加载之后才挂出来的，
  而 `dismissTour` 只在"300ms 内可见"时按 Esc，于是形成时序竞态：赶上就绿、没赶上就
  `落地=force` 且状态纹丝不动（本批 `/system/menu` 同码两轮跑出相反结论，见 §3.60.5）；
- 点击必须返回**落地证据**：普通点击 → `force` → 元素自身 `dispatch`，返回用到的策略，
  失败返回 `false`（`realClick()`，与既有 `clickButton()` 同三段策略）；
  **每次按下之前**重做"收引导 + 等遮罩"，普通点击失败即重收再试（上限 3 次）——
  `force` 会跳过 actionability 按坐标点，事件打在遮挡物自己身上，
  于是"点了没反应"被记成一次成功点击，这是假绿而不是降级取证；
- **任何"请求数=0 / 不落库 / 不推他人待办"的断言，一律 `!!how && …`**——
  否则它同时被"闸门生效"和"按钮失灵"两种相反状态满足（与 AGENTS《前端外部输入归一》第 3 条同源）。

### 3.60.2 树表折叠态的行**全量留在 DOM**：`.el-table__row` 计数判不出展开/收起

实测 `/system/menu` 折叠态：`nodes=244 / visible=8 / expandedIcons=0`；展开态 `visible=244 /
expandedIcons=56`。Element Plus 的树表把子行留在 DOM 里，用 `.el-table__row` 的 `count()`
判"展开/收起是否生效"是**恒假判据**（点了也永远不变，改一万次都不绿）。必须按
`getClientRects().length > 0` 数可见行，并**双向对账**（点一次变、点回来复原）——
单向"变一下"可以是任何抖动造成的。方向取自页面源码的 `defaultExpand` 实参
（dept=true、menu=false，`views/system/{dept,menu}/index.vue`），不是猜的。

### 3.60.3 外链判据断 `window.open` 的**入参**，不等 popup 真加载

旧写法"等 `context.waitForEvent('page')` 再断 URL"有两个不可接受的面：

| 现象                        | 实测                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| 外链可达性是环境因素        | 无外网时新标签落 `chrome-error://chromewebdata/`，判据随环境翻转         |
| `noopener` 切断 opener 关系 | 关于页 8s 内**拿不到 popup 句柄**（`window.open` 返回 null，时序不稳定） |

被测事实只有三条，全在入参里：`target === '_blank'`、features 含 `noopener,noreferrer`
（tab-napping 防护）、目标是声明的绝对 https 外站。⇒ 装一个 `window.open` 替身捕获调用，
断言捕获到的参数（`armWindowOpen()/readWindowOpen()/externalOpenChecks()`）。
**"URL 恰好能打开"不是被测对象**，把它写进判据等于把门禁耦合到外网。

### 3.60.4 行内交互的定位器不得用"会随交互结果变化的属性"

`action-inventory` 收口时新写的行内「展开当前行」判据首跑就红，页面其实按预期变了（`可见行 8→9`、
`展开图标 0→1`），红在定位器：

| 写法                                               | 为什么错                                                                                                  | 一手证据                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `button[aria-label="展开当前行"]:visible` 点第二次 | EP 树表折叠态**只隐藏不卸载**子行，展开后新出现的可见行自带同名 `aria-label` ⇒ 第二跳解析到**另一个按钮** | 菜单页 `nodes=244 / visible=8`；第二跳后 `可见行 9→32`、`已展开图标 1→2`（多展开了一个兄弟节点） |
| 同上，收起方向                                     | 收起后该选择器**一个都不剩** ⇒ `realClick` 三段全失败，`落地=false`                                       | 部门页 `defaultExpand=true`，收起后 `可见行 10→1`，第二次点击 `落地=false`                       |

配方：**先用一次 `evaluate` 取该行在 `tbody.children` 里的下标，再用 `.nth(idx)` 锁同一个 DOM 节点**
（不卸载 ⇒ 序位在展开/收起前后稳定），随后对**同一节点**读 `aria-label` / `aria-expanded` 的变化。
推论同样适用于其他"点了会变文案"的控件（展开/收起、启用/停用、已读/未读）：
凡是**判据要读的那个属性正是被点击改变的那个**，就不许拿它当选择器。

### 3.60.5 复原类判据的期望值必须是"点击前采集的值"，不是常量

同一批新写的"再点一次回到基线"断言写成 `aria-expanded === 'false'`。展开方向确实如此，
收起方向复原后 `aria-expanded` 本就是 `true` ⇒ 假红。正确形态：点第一跳**之前**采集
`exp0/label0/visible0`，复原跳一律与这三个**实测基线**比。
这与 §3.60.2 的"双向对账"是同一条纪律的两半——
"变一下"要对着前态比，"复原"要对着**初始态**比，两个都不能对着硬编码终态比。

同型缺陷还有链式 `replace`：`'展开当前行'.replace('展开','收起').replace('收起','展开')`
第二步把刚换好的词又换回去，期望值恒等于原值 ⇒ 判据对"展开成功"必然红。
成对文案一律显式二值映射（`other = dir === 'up' ? '收起当前行' : '展开当前行'`）。

### 3.60.6 遮罩竞态的取证配方：把 Playwright 报错原文与命中元素写进凭证

同一份代码、同一个页面两轮跑出相反结论（r1 `落地=click` 全绿、r2/r3 `落地=force` 且 `可见行 8→8`）时，
**不要先改判据、也不要先怀疑环境**，先让判据自己交代遮挡物：

1. `realClick` 在普通点击失败时把 `e.message` 的**尾部两行**存进模块级变量并打进 detail
   （`… intercepts pointer events` / `element is not stable` 是两种完全不同的根因）；
2. 配一个一次性探针：对目标按钮盒中心做 `document.elementFromPoint(cx, cy)`，打印
   `tagName + class + z-index + pointer-events`。本批实测命中
   `div[stepby-tour-mask] z=9998 pointer-events-auto`，而 `page.keyboard.press('Escape')` 之后
   `mask=false` ⇒ 结论是"引导在数据加载后才挂、`dismissTour` 的 300ms peek 赶不上"，修法是把
   收遮罩做成**每次按下前的前置条件**（见 §3.60.1），不是把判据放宽；
3. 探针用完即删，但**证据写进台账**——否则下一轮还会有人把这轮的红当成"环境抖动"记一遍。

反面形态（本批真踩过）：`overlaysSeen` 是全局去重集合，用"本轮新增条目"做差集打凭证，
会把第二个页面重见的同类遮罩报成"无"，于是**证据本身**把排查误导了一整轮。
凭证要么报"当前时刻看到的东西"，要么什么都不报。

### 3.60.7 与竞态耦合的判据：用"同产物两轮 verdict 集合做差集"抓，不许留软断言

瞬时元素（骨架屏、Toast、加载遮罩）写成"导航后看一眼"的软断言，**判据本身**就是环境耦合的：
b79 在同一产物（`index-BAE7_ZfO.js`）、同一服务（pid 25864）上跑的两轮全量，把逐条
`verdict + 断言名` 排序做差集，1210 条里**只有 1 条翻了**——就是 `SkeletonTable: 骨架屏（瞬时）`
（A 轮 SKIP、B 轮 PASS）。这条抖动直接让"只许降"的 SKIP 棘轮基线可被网络快慢决定，
属 AGENTS 铁律"门禁不得与环境耦合"的同一类缺陷。

检测配方（零新跑批成本，任意两轮同产物全量日志即可）：

```bash
# 工具：tests/e2e/deep-verdict-diff.mjs（b79 新增；自检已接进 run-gates.py 的 `verdictsynth`）
node tests/e2e/deep-verdict-diff.mjs <roundA.log> <roundB.log>
# 退出码：0=两轮逐条同 verdict；1=存在抖动/总数不等/同模块重名；2=输入不是全量日志
```

修法不是把 SKIP 数放宽，而是**构造该状态**再判：`page.route(/\/system\/role\/list/)` 按住列表
响应 ⇒ `loading` 恒真 ⇒ 骨架屏**必可见**；放行后再断它**必消失**（反向锁原本没有）。
三条纪律：

1. 按住/放行的 `release()` 必须放在 `finally` 里——半途抛错时不放开会把后续模块拖到 axios 30s 超时。
2. **拦截器 0 次命中要响亮自曝**：走 `recordSkip` + 文案含「断言工具异常」，命中
   `runner.mjs` 的 `TOOL_BROKEN_RE` ⇒ 退出码 1。不得记 PASS（等于没检验），也不得记产品 ❌（冤枉）。
3. 判据从 1 条变 2 条会改变全量总数 ⇒ 棘轮/基线数字必须用**新一轮复跑实测值**刷新，不得手算
   （本批 M25 由 1 条软断言变 2 条确定态判据，总数随之变化；写进 AGENTS/TESTING 的是复跑结果，不是推算结果）。

### 3.60.8 EP 组件定位的两个静默坑（b80 实测，三次假红才定位）

**坑一：中文双字按钮被 `autoInsertSpace` 渲染成「取 消」。** `button:has-text("取消")` 匹配不到，
点击默认等待 30s 后超时；`.catch(()=>{})` 把超时吞掉，于是弹窗和 modal 遮罩**留在页面上**，
后续所有"搜索区"控件点击都会超时或打到遮罩上。判据表现是"下拉不可见/选项为空"，真正原因却是
上一个弹窗没关。三条纪律：

1. 关对话框优先点 `.el-dialog__headerbtn`（与文案无关），并 `waitFor({state:'hidden'})`——
   只点不等的下一行仍可能被残留遮罩拦截。
2. 中文按钮若必须按文案定位，用 `hasText: /取\s*消/` 或 `getByRole('button', { name: /取\s*消/ })`；
   不要用无空格的 `has-text("取消")`。
3. 交互失败必须留**截图 + 当前可见弹窗数**。b80 正是靠失败截图看到"新增公告管理"弹窗还开着，
   否则会一直在下拉定位器上打转。

**坑二：EP 2.x 的 `el-select` 没有 `<input placeholder>`。** placeholder 渲染在
`.el-select__placeholder` 的 span 上，`getByPlaceholder('请输入公告状态')` 永远 `visible=false`。
定位改用表单项标签作用域：

```js
const select = page
  .locator('.el-form-item')
  .filter({ has: page.locator('.el-form-item__label:text-is("状态")') })
  .locator('.el-select')
await select.locator('.el-select__wrapper').click() // 展开热区在 wrapper，不是根节点
const option = page.locator('.el-select-dropdown__item:visible').filter({ hasText: /^关闭$/ })
```

**筛选类判据必须带正反夹具**（b80 F7 模板）：建一条匹配值与一条不匹配值 → 真实下拉选择 →
`waitForResponse` 断言请求确带服务端参数（如 `status=1`）→ 断言响应集合**只含匹配项**且不匹配项
不在 → 收尾删除。只断"请求发出了"会把"参数被 serde 丢弃"（假控件）照样判绿；只断"行全匹配"
在 0 行时是空真。

### 3.61 棘轮"收紧入口"必须先比后写：只许降的不变式由**写入**守住，不由退出码守住

本批查出三个收紧入口都是**无条件落盘**——比较只写在 `--gate` 那一路，写入那一路不比：

| 工具                               | 旗标                     | 原来会发生什么                      |
| ---------------------------------- | ------------------------ | ----------------------------------- |
| `deep-e2e`（`e2e/run/runner.mjs`） | `--update-skip-baseline` | SKIP 变多的一轮照样把基线抬高       |
| `action-inventory.mjs`             | `--update-baseline`      | 覆盖率下降 / 路由数减少照样写进基线 |
| `collect-warnings.mjs`             | `--update-baseline`      | INTERACT 四项上限被退步轮自己抬高   |

要点：**退出码不撤回已经写出去的文件**。判红只活在这次终端里，下一轮读的是被放松后的新天花板。
三条一起改成"先比后写"，并把比较式抽成**单一事实源**（`--gate` 与收紧入口共用一份）：
`skipRatchet()` / `ratchetRegressions()` / `makeChecks()`。

自检怎么跑（这三条都是纯函数，不启浏览器，可常驻）：

```bash
node tests/e2e/skip-ratchet-selftest.mjs        # run-gates.py: skiprsynth
node tests/e2e/action-inventory.mjs --selftest  # run-gates.py: actsynth（含棘轮比较式 5 条）
node tests/e2e/deep-verdict-diff.mjs --selftest # run-gates.py: verdictsynth
# INTERACT 比较式自检必须带凭据（该脚本 import 期读 test-config），挂在 INTERACT 配方第一条：
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node tests/e2e/collect-warnings.mjs --selftest
```

写这三条自检时**当场抓到三个缺陷**（值得记住，因为它们都不是"判据红"）：
① `NaN > 容差` 恒 false ⇒ "取不到数"会被读成"没有退步"并放行写入；
② 基线字段名与本轮字段名不同（`guardPopups` ↔ `guards`、`overlayLeftover` ↔ `leftover`），
照抄一边造夹具会把"完全持平"误报成退步——**是夹具错**，但正说明两处必须共用一张表；
③ 把比较式抽成纯函数时，容易把"**基线缺失 ⇒ 判红**"一起抽走（纯函数给的是
`writeAllowed=true`，语义是"允许首建"，不是"允许通过"）——还原时在该分支上写了禁止性注释。

### 3.62 「HTTP 200 但响应体写着部分失败」捕获通道（批量接口的隐形失败族）

`netFails` 只在 `status >= 400` 时读响应体（性能决定）。这对**批量操作**是盲区，因为本仓后端刻意
把批量语义做成"整体成功 + 逐项结果"：`POST /monitor/online/batchLogout` 返回
`{code:200, data:{successCount, failed:[{tokenHash, code, msg}]}}`
（`stepby-axum/src/handler/monitor_online_handler.rs:599-606`）——撤不掉的会话只出现在
`data.failed` 里，HTTP 层 / `body.code` 层 / Toast 层可以同时是绿的。

新增判据 `capture-kit.mjs::detectPartialFailure(method, status, contentType, text)`：

| 条件   | 取值                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| 方法   | 仅写请求（`POST/PUT/DELETE/PATCH`，大小写归一）                                   |
| 状态   | `200 ≤ status < 400`（`>=400` 归 `netFails` 管，不得重复计数）                    |
| 响应体 | `content-type` 含 json 且长度 ≤ 20000；解析失败即 `null`（不得抛）                |
| 命中   | `body.code === 200` 且 `data.failed[]` / `data.errors[]` 非空，或 `failCount > 0` |

消费侧：深测 `runner.mjs` 按"模块 / 方法 状态 端点 / 形态 / 所属动作"聚合枚举并落
`deep-e2e-partial-<ts>.json`；主套件 `main.mjs` 打 `🧩 部分失败响应…` 并把 `bizPartialTotal`
写进报告 JSON 供轮间对账（主套件此前**完全不消费** hub 的失败面）。
**口径与失败请求一致：枚举 + 逐条对账，不单独判红**（负路径用例本来就会故意造部分失败）。

自检与证伪：

```bash
node tests/e2e/capture-kit-selftest.mjs
# SYNTH_OK（含部分失败判据 12 条双向：4 必抓 / 8 必不抓）
```

8 条"必不抓"不是凑数：读接口带 `failed`、空数组、无 `data`、非 JSON、`code≠200`、超长体，
任何一条被误报，全量跑批就会出现"几十条噪声里挑一条真信号"——b69 的 `oper_log` 被遥测刷成
流水正是同一形态。变异证伪实测：删掉 `WRITE_METHODS` 守卫 ⇒
`SYNTH_FAIL: 读接口不得算部分失败`（exit 1），还原 ⇒ `SYNTH_OK`。

顺带一条**否定结论**（同样值得记）：候选缺口"HTTP 200 但 `body.code` 是失败码"经查**不是缺口**——
`legacy` 档（默认档）把 `400/401/403/404/409/422/429/500/503` 全映射成同名真实状态码
（`src/common/http_status.rs:118-131`），且全仓 `src/` 没有任何非标准失败码，所以这一族今天不存在，
不为它加通道（加了就是"为不可能发生的场景写校验"，还要白付全量读体的成本）。

### 3.63 采集态数据集必须区分"全量轮 / 分段轮"

`deep-e2e-reqstats.json`（每动作出网请求分布，将来的"接口风暴"判据唯一数据源）此前**不分
全量/分段一律覆盖写**。本批为验证 M25 重写单跑 `--feature=25`，直接把全站动作分布刷成只剩
M25 的 27 行，而文件照样生成、时间戳照样新 ⇒ 无人报错。现在按 `isFullRun` 分流：

- 全量轮 → `deep-e2e-reqstats.json`，载荷带 `full: true`
- 分段轮 → `deep-e2e-reqstats.incremental.json`（不覆盖全站数据）

与 `collect-warnings` 基线的 `full: true`、`tenant-audit.incremental.*` 同一条纪律：
**"没跑全量"与"跑了且干净"必须可区分，部分数据不得覆盖全站数据。**

### 3.64 写端点"触达"覆盖对账（判据取运行期出网路径，不取源码字符串）

问"还有哪些写接口没人碰"时，静态 grep 套件源码会**双向**犯错，两处都是本仓真实代码：

| 误差方向             | 实例                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 假报未覆盖           | UI 触发只写按钮文案：`main.mjs:27065` 用 `getByRole('button',{name:'清空错误日志'})`，源码里没有 `/monitor/error-log/clear`                     |
| 假报已覆盖（更危险） | `deep-e2e.mjs:20836-20849` 出现 `slow-sql/clear` 字符串，但那是**"取消后 DELETE 不得出网"的跨租户护栏断言**（要求请求数必须 0）——设计上永不触达 |

`node tests/e2e/endpoint-coverage.mjs` 把全量轮的 `(方法 端点)`（来自 `deep-e2e-reqstats.json`，
必须 `full: true`）与后端 `src/router/*.rs` 的写路由模板做**逐段匹配**：

- 模板 `{id}` 匹配任意一段；数字段 / UUID / 32+ 位十六进制哈希折成 `N`；`/prod-api` 前缀剥离；
- **段数不同绝不互替**（否则 `/system/user` 会"覆盖" `/system/user/{id}/authRole`）；
- 方法必须相同（GET 触达不算 POST 端点被覆盖）。

```bash
node tests/e2e/endpoint-coverage.mjs --selftest             # run-gates.py: endpcovsynth
node tests/e2e/endpoint-coverage.mjs                        # 打印本轮未触达清单（单源，仅诊断）
node tests/e2e/endpoint-coverage.mjs --gate --operlog       # 与基线同口径：新增未触达即红（常驻那把）
node tests/e2e/endpoint-coverage.mjs --update-baseline --operlog  # 全量轮后收紧（只许降，且必须逐条签名）
```

**触达源必须两路并集**（b79 二轮订正）：只用 `deep-e2e-reqstats.json` 会把 `PUT /system/user`、
`DELETE /system/user/{id}`、`PUT /system/user/resetPwd` 这类**主套件天天在打、deep-e2e 不打**的
端点报成"未触达"（实测：单源 197 条写路由里 161 条未触达，其中相当比例属此类误报；并上服务端那一路后
是 **136**）。第二路取服务端权威留痕 `sys_oper_log` 的 `DISTINCT (request_method, oper_url)`
并按**窗口**过滤，与客户端数据集做并集；窗口默认由数据集自证字段给出（`windowStart/windowEnd`，
UTC 裸文本，与 `oper_time` 同口径），只有做**历史对账**时才手动传 `--since/--until`：

```bash
node tests/e2e/endpoint-coverage.mjs --operlog --since='2026-10-20 00:25:00' --until='2026-10-20 03:20:00' --update-baseline
```

**旗标必须与基线同口径**（b79 实测，见 §3.68）：基线记的是 `sources=oper_log+reqstats`，
漏 `--operlog` 跑 `--gate`/`--update-baseline` 会被口径闸拒绝（EXIT=2 并说明源集合不同）。
**这道口径闸必须排在登记表闸之前**——写反时报出来的是 25 条"没登记理由"，
而那 25 条正是服务端已证明打过、只因旗标不同而不在单源集合里的端点。

三条边界：① `--operlog` 不给 `--since/--until` 直接 FATAL（无窗口的服务端触达 = "谁打过都算覆盖"）；
② 基线里记 `sources` 字段，`--gate` 时源集合不一致**拒绝比对**（拿两源结果对一源基线会白赚一个
更低的数字，那不是变好，是换判据）；③ 已知不足并写进注释：机器遥测通道按 b69 纪律不写 oper_log
（`/monitor/frontendError/report` 等），所以两源是**并集**而非替换——客户端那一路仍然必须存在。
`oper_time` 实测是 **UTC 文本**（当日 `max(oper_time)=02:29` 而本地 10:29），窗口值按库内口径写。

四类输入必须**响亮失败**（自检各钉一条）：路由条数低于下限、路由目录缺失、数据集未标 `full`、
`full` 但零写请求。**"设计上不该触达"的端点逐条签名在 `endpoint-coverage-reasons.json`**（§3.68），
不是代码里的通配白名单，也不再只写在台账里——将来它被真触达或被删掉，差集会当场说出来。

### 3.65 测试数据态审计：跑批结束后判"测试自己造出来的数据"（b79 新增）

**跑在浏览器套件停止之后**（`run-gates.py` 已把它归入 `LIVE_DB_GATES`）。
它答两件既有门禁都不答的事：

1. **清理盲区**：命中测试命名族的行，`residue-cleanup.mjs` 里**有没有任何一条谓词会删掉它**。
   谓词表是导出的 `RESIDUE_STEPS`（单一事实源），判据把每条谓词原文写成
   `CASE WHEN (<谓词>) THEN 1 ELSE 0 END` 与候选列一次 SELECT——不重implement LIKE 语义、
   不手抄第二份家族串（b78 实测过手抄的失效形状：清理写 `'e2e75-%'`、用例产出
   `'e2e75b-doc-…'`，各自"看着对"，残留每轮 +1 无人报）。
2. **数据终态**：测试数据族的软删残留 / 跨表孤儿 / 状态枚举越界 / 未来时间。
   `scripts/db_state_audit.py` 判的是业务数据卫生与锚点完整性，两边不重叠。

```bash
node tests/e2e/test-data-audit.mjs --selftest   # run-gates.py: testdatasynth（临时库夹具，零外部依赖）
node tests/e2e/test-data-audit.mjs              # run-gates.py: testdata（读运行库，套件停止后）
```

四条纪律（都是本条实测踩出来的，改判据前先读）：

- **"每族取前 N 行"的取样实现必漏报**：同族内 `status`/`del_flag` 不同 ⇒ 覆盖结果不同，
  而已覆盖行按主键序恰好排在前面。所以覆盖判定是集合式的（没有取样概念就没有取样偏差）。
- **软删判据必须带命名信号**：运行库实测 `sys_menu` 有 6 行 `del_flag='2'`
  （3800-3804 域名按钮组 + 4115 AI 历史查询）是 `m20261007_000011` **故意**软删的假入口，
  `initialize/tenant.rs:165` 还写了防复活的孪生语句。把它报成测试残留就是"每轮必红的判据"，
  结局是被当噪声忽略——判据要判的是**测试数据**，不是"所有软删行"。
- **"现在"只能由 SQL 侧给**：`datetime('now','localtime','+1 hour')`；本地 UTC+8 机器上拿
  `toISOString()` 的 UTC 串当阈值等于把阈值前挪 8 小时，会把大量正常行判成未来时间。
- **不得报绿的两条静默通道**：单列扫描失败（谓词引用了该表没有的列）、命中行数超过上限
  （只看了前 N 行）——都算发现。`countWhere` 的查询错误同样算发现，
  本条上线第一跑就靠它抓出两处臆测列名（`sys_oper_log` 真实列是 `oper_time`、
  `sys_logininfor` 是 `login_time`，不是 `create_time`/`check_time`）。

**时序是结论的一部分**：跑在套件中间得到的是"此刻库里有什么"，不是"收尾后漏了什么"。
本工具首跑就是这样——`软删残留：sys_post=1` 与 `sys_msg_template` 两族"盲区"都是 M24/M86
的在途数据（套件自己的清理排在收尾），停库复测即归零。同一个数字不得在两种时序下混用。

**这条前置现在是机器闸，不是纪律**（b79 收口第三轮，§10 N-14）：`activeWriteVerdict()` 读
`operLogFreshness()`，距最近一条 `sys_oper_log` 写入不足 `ACTIVE_WRITE_MINUTES`（2 分钟；
依据是 round E 实测 88 模块 / 2722.3s ⇒ 平均 31s 一模块，2 分钟跨约 4 个模块的写入窗口）⇒
报告照常打印（证据不藏），随后打 `[FATAL] 时序前置不成立…以上发现**不作数**` 并 **EXIT=2**（`run-gates.py` 记 UNRUN）。
`testdata` 那条 **红** 与 **UNRUN** 因此含义不同：红=数据真有洞，UNRUN=证不了"没人在写库"。
实测取证（就在 round F 写库期间）：`LIVE_EXIT=2`，同一条 `sys_post` 在途残留被拒绝当成结论。
两道 fail-open 由自检的正控当场抓出：**`Number(null) === 0`** 会把"空库"判成"刚写过"（误拒），
并把"有行但时间不可解析"那一支整个遮掉（误放）——"取不到"必须先归成 `NaN` 再与"取到了 0"区分。

---

### 3.66 补未触达写端点：先做**非破坏探针**，再把探针的实测文案写进判据（b79 M88）

`endpoint-coverage.mjs --gate` 报出的"未触达"不能直接照着列表写用例——一半是**不该触达**的
（清库类会洗掉同轮其他模块的判据面，切后端/改套餐类不可逆），一半的契约光看路由猜不出来。
b79 的做法是先跑一次性只读探针把契约量出来，再写模块：

```bash
# ① 量基线（窗口必须与跑批对齐；oper_log 落库是 UTC 文本）
node tests/e2e/endpoint-coverage.mjs --operlog --since='<UTC>' --until='<UTC>'
# ② 写模块后单模块验证（不整轮，几分钟）
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node tests/e2e/deep-e2e.mjs --feature=88
# ③ 全量轮跑完再重生成基线（两源，窗口取全量轮的起止）
node tests/e2e/endpoint-coverage.mjs --operlog --since='<UTC>' --until='<UTC>' --update-baseline
```

五条纪律（都是 M88 这一步实测逼出来的）：

- **探针要打在真实服务上，但要先问"这一发会不会改全局态"**。b79 探针因此避开了 `*/clean`、
  `uploadConfig/switchBackend`、`tenant/package/features`、`user/{id}/anonymize` 四类，
  并且把新建的限流行指向 `/e2e88/unused-{id}`（一个不存在的路由），收尾再 DELETE——
  活规则留在库里会改变全局节流（b72 F71 同族）。
- **探针自己的畸形入参不是产品缺陷**。`idB` 还是 `undefined` 时把 `"2477,undefined"` 发进
  `deptIds`，服务端 `parse_id_list` 丢掉非数字 ⇒ "数量不一致"，看起来像反向缺陷。
  模块内置 `needId()`：ID 不是有限数字就当场记 FAIL 自曝，绝不发出畸形请求。
- **异步落库用轮询，不用固定 sleep**。回调投递是后台任务，`test` 之后固定等 3s 在高负载下会假失败；
  M88 用 `waitFor()`（10s 上限）等日志行出现，等不到就是 FAIL。
- **不可达目标的失败要"两半都判"**。`POST /webHook/log/{ids}/retry` 的判据是
  `data.count=0`（成功数必须 0）**AND** 该回调日志 `total` 增长 1（确实重投了）——
  只写前半，"什么都没做"的实现也能绿；这跟 §3.60.3"请求数 0 必须 AND 点击确实落地"是同一条形状。
- **SSRF 守卫决定了能用什么目标**。`127.0.0.1`、私网段与 `192.0.2.1`（TEST-NET 也算保留地址）
  都在创建时就被拒（实测 `禁止访问内网/保留地址 …`），所以外呼类用例只能用公网不可达地址
  且把 `timeoutSecs` 压到 1，并**在模块内删掉回调**（b78 实测一个遗留活跃回调在 8 分钟里刷出 12 条失败投递）。

新增用例的数据命名族必须同步进 `residue-cleanup.mjs`（`job_softdel_e2e` 就是 M88 补的），
否则 `test-data-audit.mjs` 的盲区判据下一轮直接红——那是设计如此：**先有谓词，再有残留**。

### 3.67 出站请求**每导航均值**棘轮 + 判据脚本之间只能共享纯函数模块（b79 新增）

`runner.mjs` 每轮都在落 `deep-e2e-reqstats.json`（按动作聚合的出网请求分布），但 **`count` 维度此前采了不判**：
某页改成"每次渲染都全量拉列表"，套件照旧全绿，只有人工翻 JSON 才看得见。`request-storm.mjs` 把这一轴做成棘轮。

**口径必须是"每导航均值"，不能是"每轮总次数"**（§10 N-13 的结论，本批落地）。总数同时由
"这个模块本轮访问了几页"和"机器快慢（轮询/心跳类端点与墙钟时长成正比）"两件事驱动，
所以任何绝对阈值、甚至"总数相对增幅"都是**与环境耦合**的判据——这正是 b74 当初只落盘不判的原因。
现在分母由采集侧自己给出：`capture-kit.mjs` 的 `navCount` 只数 **main frame 的 http(s) `framenavigated`**
（子 iframe 与 `about:blank` 不计——少计会让密度偏高，属可发现的错；多计会让密度偏低，属发现不了的错），
纯 API 动作（如 M88，一次都不导航）分母取 `max(1, navs)`，按"一次工作单元"计，不会算出 `Infinity`。

```bash
# 全量轮跑完之后（数据集自带窗口与分母，不需要人抄时间串）
node tests/e2e/request-storm.mjs                      # 打印键数/总次数/Top12（含每导航密度与最密动作）
node tests/e2e/request-storm.mjs --gate               # 与基线比密度，退步即 EXIT=1
node tests/e2e/request-storm.mjs --update-baseline    # 先比后写：退步时**不落盘**
node tests/e2e/request-storm.mjs --selftest           # 13 组合成双向，不碰浏览器/运行库
node tests/e2e/capture-kit-selftest.mjs               # 采集侧 5 条（分母坏了不会报错，只会全体失真）
```

判据形状五条，各对应一种"比红更糟"的形态：

- **密度容差 + 新键下限双向**。基线里已有的键，容差（`STORM_TOLERANCE`）内的波动不得报（否则每轮必红，
  最终被人当成噪声关掉）；密度翻几倍必须报；基线没有的新键按 `NEW_DENSITY_FLOOR`（**每导航**次数）分档。
  自检 ⑥⑦⑨ 就是这三条的正反两面。
- **"页数变多而密度不变"必须不报**（自检 ⑧）。这条是换口径唯一要买到的东西，也是它自己的回归锁：
  把比较式从 `cur.density` 改回 `cur.total`，⑥⑧ 两条同时转红（变异实测 M4）。
- **基线形状与口径闸（自检 ⑫：1 类正控 + 9 类坏输入）**。棘轮比较式写错方向是"每轮必红"，马上有人来修；
  **基线形状写错是"永不红"**——缺 `window`、缺 `perKey`、`full` 不为 true、
  **`metric` 不是 `density-per-nav`**、记录的 `tolerance`/`newDensityFloor` 与代码常量不一致，一律拒绝比对（EXIT=2）。
  `metric` 那条针对最隐蔽的一种换判据：`perKey` 里的数从"总次数"悄悄换成"每导航均值"，
  数字形状一模一样，比较式照样跑，结论照样"变好"。
- **五类输入响亮失败**（自检 ②③④⑤ + ⑫）。实测拿本轮早期（加窗口字段之前）的 round D 产物跑 `--gate` ⇒
  `[FATAL] 数据集没有 windowStart/windowEnd（旧格式…）`、**EXIT=2**；行里缺 `navs` 同样硬失败——
  **缺分母绝不能当 0**，那会把密度放大成 `total`，全线误报（变异实测 M1、M2）。
- **采集侧自己要有锁**。`navCount` 坏掉不会报错，只会让所有密度一起变大或变小，其中"变小"那一半是静默放行
  ⇒ `capture-kit-selftest.mjs` 用桩 page 直接 fire `framenavigated` / `request`，钉住
  "main frame 的 http/https 各计一次、`about:blank` 与子 frame 不计、数字归一、`beginAction` 换桶、快照条数与降序"；
  断言条数由计数器 `hubChecks` 打印，不写进文案（写死的数字抄一次就漂一次）。

- **新键必须有一条"登记通道"，否则棘轮会把自己锁死**（自检 ⑬ 双向）。纯密度棘轮对**新增端点**是死结：
  正常加一个接口 ⇒ 它天然不在基线里 ⇒ 密度超下限就永远红 ⇒ 唯一出路是放宽 `NEW_DENSITY_FLOOR`（那就是换判据）。
  解法是 `--accept-new-key=<METHOD /path>` 显式签名吸收，写进基线的 `acceptedNewKeys` 留痕，
  而 `--gate` 走 `filterAccepted()`：已登记的不再报，**未登记的新键照旧报**。
  变异证伪：把 `filterAccepted` 写死成"永远返回空集"⇒ ⑬ 三条同时红（正控那两条也红，说明这条锁不是只测拒绝面）。

两条接线纪律（本批实测踩过，写死在这里）：

1. **判据脚本之间共享的只能是纯函数模块，不能是入口脚本**。`request-storm` 最初写
   `import { loadWindow } from './endpoint-coverage.mjs'`，而 `endpoint-coverage.mjs` 底部按 `argv` 直接执行 ⇒
   跑 `request-storm --selftest` 打出的是**对方**的 `SYNTH_OK 写端点触达判据 … 条双向` 并且 `process.exit(0)`：
   自己的 13 组一条没跑，却留下一条看起来正确的"绿"。这比缺判据更坏。
   修法是把 `readWindow` / `assertFullRun` 抽进 `dataset-window.mjs`（无入口、无副作用），两侧各自 import，
   两条闸因此只有一份实现。同族约束本仓早已存在（`collect-warnings` 因"import 期就要凭据"而不进 `run-gates.py` 清单）。
2. **提示语必须点名调用方**。抽出来的 `readWindow()` 文案原本写"请显式给 `--since=/--until=`"，
   而 `request-storm` 根本没有这两个旗标（它判的是本轮自己的出网分布，"任意窗口"无意义）；
   `endpoint-coverage` 才有，且只在 `--operlog` 路径生效（已回查其 `main()` 的旗标解析确认，不是凭印象）。
   一条不存在的恢复路径会被照着敲，然后变成"判据看起来坏了"的误报 ⇒ 文案改为按两个消费者分别说清正确做法。

**载体**：`run-gates.py` 新增 `stormsynth`（常驻自检）与 `storm`（`--gate`，前置同 `endpcov`：必须有刚跑完的
全量数据集，否则 EXIT=2 → 汇总打 UNRUN、整体非零，"没跑"不冒充干净）；`ci.yml` 的 `doc-gates`
补 `node request-storm.mjs --selftest`。注意"写了没接线=没写"在本仓仍有一半成立：根仓 `git remote -v` 为空，
`ci.yml` 从未在任何平台执行过，今天真正会跑的只有 `run-gates.py` 与 preflight。

顺带结掉 §10 的两条立案：

- **N-20**（"`endpoint-coverage --gate` 不能进固定清单，因为窗口得每轮改写"）——它自己给出的解法
  （把最近一次全量轮的起止写进机器可读产物、让 `--gate` 自己取窗口）本批已落地
  （`runner.mjs` 写 `windowStart/windowEnd`，UTC 裸文本与 `sys_oper_log.oper_time` 同口径），
  所以 `endpcov` 与 `storm` 两条现在都在 `run-gates.py` 常驻。
- **N-13**（"接口风暴判据不能按每动作请求数判"）——分母字段本批已采（`navs`），判据按每导航均值实现，
  立案时设计的第二步（把端点分"已声明轮询"与"未声明"两类、各自设阈）仍缺，转下批（新立案 N-21）。

### 3.68 未触达写端点的**理由登记表**：定性必须是判据，不是台账里的一段话

`endpoint-coverage --gate` 只回答"还有哪些写端点没被打过"，不回答"这条为什么允许没被打"。
此前后者只写在优化台账的分类表里——**判据只数条数**，于是留下一个具体漏洞：
新添一条未触达，只要总数还在降，`--gate` 照样绿。把理由写成登记表 `endpoint-coverage-reasons.json`
之后，"知道有洞然后记在文档里"这一形态结构上不成立了。

```bash
node tests/e2e/endpoint-coverage.mjs --selftest            # 40 条双向（含 ㉑ 组 10 条登记表对账）
node tests/e2e/endpoint-coverage.mjs --gate --operlog      # 未触达 ∖ 已登记 ⇒ EXIT=1
```

四条形状约束（缺一条就退化成"记账"）：

- **`missing` 判红**：登记表里没有该键，**或** `why` 去掉空白后为空，**或** `why` 含"同上"这类跨条目指代 ⇒ 红。
  "空字符串理由"与"没写"必须同罪，否则这张表能靠 `why: " "` 刷绿（自检 ㉑ 第 2 条）；
  "同上"与没写也必须同罪，因为**条目集合一变（新增/删除/改序），"同上"指向的就是另一条理由**
  ——登记表要能被独立复读，只在整表里读得通的不是理由（自检 ㉑ 双向：含同上必报、自足理由不得误伤）。
  这条规则是判据上线后**第一个抓到我自己**的：136 条里 93 条共用同一句模板、1 条只写"同上"。
  模板句 `--gate` 看不出来（形状上是合法签名），所以配套做法是：**签完表回查内容一次**——
  按 `why` 分组数重复条数、数最短长度，然后逐条换成可复核的证据
  （`other-suite` 那 94 条的证据来自只读查询 `sys_oper_log` 在**基线窗口外**的真实留痕：
  `行数 + 首末 UTC 时刻 + 一条样例 URL`，实测 1287 行窗口外留痕、94 条全部命中 ⇒ 分类不是凭印象）。
- **`badKind` 判红**：`kind` 只允许 `by-design | needs-fixture | other-suite | todo` 四值，表外值点名报出。
  分类一散，"这条到底欠不欠账"就重新变成口口相传。
- **`stale` 只打 ℹ，绝不判红**：登记着的端点这轮被打过了 ⇒ 那是**好消息**，
  该提示的是"这条登记可以退役"。把好消息报成红灯的判据，下一轮就没人再登记（登记率归零）。
- **`todo` 单独计数并每轮打印**：`未触达登记：136/136 条已签名（kind=todo 欠账 18 条；登记可退役 0 条）`。
  欠账不许化在水里——这一行就是下一批的工作清单。

登记表缺失 / JSON 坏掉 / 顶层不是对象 ⇒ `loadReasons()` 抛错（EXIT=2 那一路），
**"没登记"与"表坏了"必须可区分**，与 §3.63 的"没跑 ≠ 干净"同源。

`--gate` 与 `--update-baseline` **两路都拦**：收紧基线时同样要求逐条签名，
否则"先落基线再补理由"会让补签这一步永远排不到（§3.61 是同一条纪律）。

两类**相对窗口**的条目要分清方向：`other-suite` 判的是"这条由另一条套件在**同一窗口**里打过"。
窗口的唯一来源是数据集自证字段（那一轮 deep-e2e 全量轮的起止），所以主套件之后写库**不会**改变未触达集合
——实测主套件六段跑批期间连跑三次 `--gate --operlog` 都是 `136/136 条已签名`、EXIT=0。
⇒ 需要重生成登记表的时机只有一个：**换一轮新的全量轮**（窗口和触达集合同时变）。
（这一条本批先写成"每轮收口都要重生成"，是没回查窗口口径就转述因果，已订正。）
生成器脚本不入库（`_scratch/` 一次性），入库的是生成结果，且必须人工过一遍 `why` 文案，不能留模板句。

**闸的顺序也是判据**（本批实测踩过）：入口里 `assertComparableBaseline`（口径闸）**必须排在登记表闸之前**。
写反时的症状不是"漏判"而是"报错把你引向错误的修法"——漏 `--operlog` 跑 `--update-baseline` 会把
25 条"服务端证明打过、只是不在单源集合里"的端点报成"没登记理由"，照着提示去补登记，
就等于给事实相反的理由签名，而 `--gate` 从此一直绿。修完实测：`--gate --operlog` ⇒ EXIT=0；
`--gate` / `--update-baseline` 漏旗标 ⇒ `[FATAL] 基线源集合是 oper_log+reqstats，本轮是 reqstats…`、EXIT=2，
基线文件 md5 不变。未登记报错里另加一行"当前用的是哪套触达源 / 基线记的是哪套"，
因为这条错的第一反应就是"是不是漏登记了"。

**变异证伪两次**（都属于"红在哪条用例上"必须精确，不能只证明"会红"）：

1. 真数据侧：从登记表删掉 `POST /system/user/importData` ⇒ `--gate` **EXIT=1 并点名该条**，还原后 0。
2. 代码侧：`missing.push(k)` → `missing.push(...(e ? [k] : []))`（保留检测、只丢"未登记"那一支的上报）
   ⇒ `SYNTH_FAIL: ㉑ 未登记的新洞必须点名：实际 POST /e`，EXIT=1。
   第一次尝试写成 `if (false) missing.push(k)`，结果不是干净的 ㉑ 红线而是
   `TypeError: Cannot read properties of undefined (reading 'kind')`——`!e` 被摘掉后
   `else if (!kinds.includes(e.kind))` 直接吃到 `undefined`。崩掉同样非零（fail-closed 没破），
   但**丢失了"红在哪条用例"这条信息**，拿它当变异证据等于没做 ⇒ 变异要挑"只动上报、不动结构"的刀法。

### 3.84 已声明轮询清单（b81 / §10 N-21）

风暴判据（§3.67）此前只有"新键密度下限"一条兜底，后果是：任何**合法**的周期性出网
（服务器监控 2s、健康页按用户偏好、任务页有 running 时 5s）第一次跑都会被判成风暴；
而为了消红去放宽全局阈值，又会把真正的"逐行请求"一起放走。b81 把声明做成事实源：

- 清单文件：`tests/e2e/polling-declarations.json`，每条必须带
  `key`（`METHOD /path`）、`intervalMs`（(0, 24h]）、`source`（**相对路径:行号**）、
  `why`（≥10 字符，写清为什么它就该周期性出网）。
- `request-storm.mjs` 的 `loadDeclarations()` 逐条校验；清单缺失 / 版本错 / 空清单 /
  无行号 / 间隔非法 / 理由过短 / 重复键一律**响亮失败（EXIT=2）**。
  **不得把坏清单当空集**：那会让所有已声明轮询重新变成风暴。
- 声明项在 `stormRegressions` 里**只记密度、不设阈**；未声明项照旧走容差 + 新键下限。
  两者不共享任何"豁免"状态。
- 自检第 ⑭ 组双向：合法清单读得出；声明项每导航 400 次不报；**把 `declared` 参数摘掉后
  同一端点必须报**（证明声明通道不是通配）；清单缺失/九类形状缺陷必须拒。
- 换口径的合法路径：`--reset-baseline` **只能与** `--update-baseline` 同用，且只在
  磁盘基线 `metric` 与代码 `METRIC` **不同**时放行；同口径下 reset 会抹掉棘轮，必须拒绝，
  新增出网面仍走 `--accept-new-key=` 逐个点名。重建后的基线写入 `resetFrom` 留痕。
  b81 把 `density-per-nav` 换成 `density-per-nav-endpoint`（采集键原为
  `"<动作> | METHOD /path"`，动作前缀让同一端点按动作裂开、声明永远匹配不上），
  当轮必须重建基线，不得拿旧数字继续比。

### 3.69 通知已读半连接的执行计划锁（b81 / §10 N-9）

`/system/notice/list?isRead=0` 与 `listTop` 每次都要跑一次
`SELECT notice_id FROM sys_notice_read WHERE user_id = ? [AND tenant_id = ?]`。
既有索引是 `(notice_id, user_id)` 与 `(tenant_id)`：前者首列不是 `user_id`，后者对平台操作者
没有区分度 ⇒ SQLite 实测选择 `idx_sys_notice_read_tid (tenant_id=?)`，每次列表扫描该租户全部
已读行。b81 新增 `idx_sys_notice_read_user_tenant_notice (user_id, tenant_id, notice_id)`
（迁移 `m20261021_000001` + 存量库 `ensure_perf_indexes` 兜底），并用
`integration_tests::tenant_index_plan::it_notice_read_user_index_used_for_platform_and_tenant_sqlite`
钉住计划形状：

- 平台谓词（仅 `user_id`）与租户谓词（`user_id + tenant_id`）都必须命中该索引；
- 必须出现 `COVERING INDEX`（子查询只取 `notice_id`，不该回表）；
- **变异控制组**：`DROP INDEX` 后同一判据必须不再命中 —— 证明断言受真实 schema 约束，
  不是"字符串恒成立"；
- 不测耗时（机器快慢会把它变成环境耦合判据），测的是计划形状与索引是否真的存在。

存量库启动不跑 `Migrator::up`，因此迁移与 `ensure_perf_indexes` 必须**同时**加，
否则新装库有索引、升级库永远没有（这类"迁移单独加"的分裂在 b77 的索引纪律里已登记）。

### 3.70 后端日志判据（b81）

起后端时给一份按轮日志（`start-backend.mjs` 已支持）：

```bash
cd stepby-axum
STEPBY_BACKEND_LOG=logs/b81_r2.log node start-backend.mjs
```

全量结束后（或任意时刻看当前进展）：

```bash
cd stepby-vue
STEPBY_BACKEND_LOG=D:/Projects/stepby/stepby-axum/logs/b81_r2.log \
  node tests/e2e/backend-log-audit.mjs --gate
```

判据口径：

- `ERROR` / `WARN` **逐条登记**在 `backend-log-allowlist.json`（`level + 正则 + why`）；
  未登记即红。新增一条允许项前，先在日志里找到它的完整上下文，确认是设计内信号。
- **非 tracing 行**（panic、stderr 裸输出）一律红——它们最容易从 `grep WARN|ERROR` 的缝里漏掉。
- 空日志 / 文件不存在 ⇒ EXIT=2；不得把"没跑"或"读错轮次"判成通过。
- **`--gate` 必须显式给**（b83）：此前用法注释承诺了它、代码里却没有任何读点，加与不加输出逐字节
  相同——属"静默无效旗标"这一族，现未加一律 `EXIT=2 不作结论`（`run-gates.py`/收口命令本来就带）。
- 窗口（UTC）**必填，三选一**（b83 统一口径，与 `oper-log-audit` 一致）：`--since=`（+可选 `--until=`）
  > `STEPBY_BACKEND_SINCE` > 本轮 `screenshots/deep-e2e-reqstats.json` 的自证字段（仅 `full: true` 的
  > 全量轮可自证）。裸串一律按 **UTC** 解析——JS 的 `Date.parse('2026-10-20 00:00:02')` 按挂钟解会
  > 整体偏移 8 小时（落库/日志都是 UTC），这是 b74 轮 25 "少报"同族缺陷。
- 自检：`node tests/e2e/backend-log-audit.mjs --selftest`（条数由脚本自打，含允许表坏形状/空日志/
  未登记必红/裸串与 `Z` 等价两组时区口径）。
  b81 终值：**3441 条记录 / 76 条 WARN+ERROR / 已登记 76 / 非 tracing 0**，允许表 19 条逐条带理由。
- `run-gates.py` 的 `backendlog` 已接线；环境变量缺失时显示 UNRUN，而不是 PASS。

### 3.71 失败操作判据（b81，`sys_oper_log.status='1'`）

后端日志判据看的是"服务端说了什么"，这把看的是"审计事实"：窗口内每条失败写操作必须
对得上一条**期望失败**的负路径；对不上就是真实缺陷（被前端吞掉的 5xx 最危险）。

```bash
cd stepby-vue
STEPBY_OPER_SINCE='2026-10-20 19:48:00' node tests/e2e/oper-log-audit.mjs --gate
```

- 时间口径：`oper_time` 落库是 **UTC** 裸时间（9 位小数秒）。给 `--since/--until` 或
  `STEPBY_OPER_SINCE/UNTIL` 时用同一口径；不给 since、库缺失、窗口反向、窗口内零操作
  一律 EXIT=2（"没跑/读错库"与"零失败"必须可区分）。
- 允许表 `oper-log-allowlist.json` 每条必须带 `method + url 正则 + error 正则 + why`；
  业务原因写在 `json_result.msg` 里（`error_msg` 往往只有 `HTTP 400`），因此**能带 `msg`
  就必须带**，否则同一端点的任何 400 都会被吞成"设计内"。
- `msg` 精确到业务文案，而不是"该端点 400 都算"：b81 收口 75 条登记逐条自足，
  覆盖权限拒绝、租户生命周期/配额、平台治理、域名校验、上传/流程/报表/回调负路径等。
- **`until` 日落豁免**（b81 收口新增）：只用于"缺陷已修复，但旧窗口的历史审计行仍需定性"。
  条目只在 `oper_time < until` 时生效；之后同类信号未登记即红。禁止拿它当永久豁免。
  自检含三种形状：until 前放行 / until 当秒起转红 / 坏 until 拒绝（条数由脚本自打）。
- **`--gate` 必须显式给**（b83，与 `backend-log-audit` 同一条修法）：用法注释里承诺了它而代码
  从不读，加与不加逐字节同形 ⇒ 未加一律 `EXIT=2`。同批移除该脚本函数体内第二条永远走不到的
  `--selftest` 派发（`e2e_flag_discipline.py` R3 现在钉住"每脚本至多一条派发"）。
- 自检：`node tests/e2e/oper-log-audit.mjs --selftest`；`run-gates.py` 的 `operlog`
  已接线并归入 `LIVE_DB_GATES`（库未静默时提示"结论不可信"，须在套件停止后单独复跑）。
- b81 终值：窗口 770 条操作 / 失败 140 条 / 已登记 140 / 未登记 0。
  **这条判据抓到过用例自身的缺陷**：F143 限流压测只送 `code` 不送 `secret`，20 条 422
  被 garde 拦在业务层之外，而 HTTP/断言全绿；修复见台账 §11.5。

### 3.72 写端点触达对账：基线必须与数据集**同断面**（b82 新增闸）

b81 把 `endpoint-coverage` 从单源改成两源（`reqstats` ∪ `sys_oper_log`），并加了
`assertComparableBaseline` 钉"源集合 / 有没有窗口"。它**没钉窗口相等**，于是：

```text
基线 window = 2026-10-20 04:59:30 .. 05:45:20   ← b80 期生成
数据集 window = 2026-10-20 18:44:36 .. 19:36:34  ← b81 r2 全量轮
```

`--gate` 照样绿，而它报出来的"18 条 `kind=todo` 欠账"里有 **17 条在那 8 小时里已被真打过**
（回库逐条核对 `sys_oper_log`：`PUT /monitor/job/changeStatus`、`PUT /system/menu/updateSort`、
`DELETE /monitor/online/{h}`、`msg/log/{markPending,retry,retryPending}`、
`tool/gen/{createTable,synchDb}`、`PUT /tool/gen`、`uploadConfig/test`、两个 export 等）。

跑法（顺序即判据，不能跳）：

```bash
# 1) 全量单轮 deep-e2e（分段轮只写 .incremental，主数据集不更新 ⇒ 没有新断面）
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 STEPBY_BASE_URL=http://localhost:8080 \
  node tests/e2e/deep-e2e.mjs > tests/e2e/_deep_full.log 2>&1
# 2) 同批重生成基线（先比后写；有新增未触达就拒绝落盘）
node tests/e2e/endpoint-coverage.mjs --operlog --update-baseline
# 3) 退役"本轮已打过"的登记（只在同断面 + 全部已签名时允许）
node tests/e2e/endpoint-coverage.mjs --operlog --retire-stale
# 4) 判据
node tests/e2e/endpoint-coverage.mjs --gate --operlog
```

- 新闸的行为：`--gate` 且窗口取自数据集自证字段时，基线窗口必须**逐字符等于**本轮窗口，
  否则 `[FATAL] … EXIT=2`；显式 `--since/--until` 视为历史对账，本闸不介入。
- `--retire-stale` 需要 `--operlog` + 可比对基线 + 数据集自证窗口 + 未触达集合全部已签名，
  四个条件缺一个就 `EXIT=2`/`EXIT=1`，**不改文件**。它只删"未触达集合里已经没有的键"。
- 自检：`node tests/e2e/endpoint-coverage.mjs --selftest` ⇒ 48 条双向（新增 ㉒ 新鲜度 4 条、
  ㉓ 退役 4 条，其中"未触达条目的理由一个都不许删"是反向控制组）。

### 3.73 动作清单：无点击证据要分"点不动"与"没点"（b82 口径）

`clicked` 是"文案 ±3 行内有真实交互"的**下界**。未命中的原因有两种，混在一个数字里就会
出现"68 条待补"这种无法结清的队列——b82 实测其中 **27 条是首页态被禁用的分页按钮**，
用例怎么写都点不到它。

- 拆分判据用 DOM 事实：`disabled && btn.closest('.el-pagination')` ⇒ `stateLocked`；
  其余无证据项 ⇒ `backlog`（补测队列）。**不用文案黑名单**（改名/换组件即失效）。
- `clicked` 优先于 `stateLocked`：点过一次就不回落。
- `dedupe` 合并同名按钮时 `pag` 取"与"、`disabled` 取"与"——只要有一个实例不在分页容器里，
  这个动作名就不算结构性点不动。
- 两个口径同时打印（原始 `interactionCoverage` 与 `…Clickable`），基线键不变，
  所以分母缩小是**看得见**的，不是随手放宽。
- `stateLocked` 在报告里单独成节并逐条列名："从分母剔除"不等于"从报告消失"。
- 自检：`node tests/e2e/action-inventory.mjs --selftest` ⇒ 12 + 12 + 5 + 6 条双向，
  第 6 条是拆分守恒正控（三类之和 === 输入条数）。

### 3.74 断言质量扫描的目标面（b82 扩面 → b83 改为**由事实派生**）

`scripts/e2e_assertion_scan.py` 的目标集合改为"5 个入口 + `tests/e2e/modules/*.mjs` 全量"，
并在开头打印 `扫描面：N 个文件`（文件数由脚本自己给，文档不抄）。模块目录缺失 ⇒ `[FATAL]` 退出，
不是"扫到 0 处 ✅"。b82 扩面当天抓回的两条都在 `deep-e2e.mjs` / `modules/writeEndpointBreadth.mjs`
里（字面 `true` 与 `baseCount >= 0 && after === before` 的"两边都读失败也算通过"）。

**b83 收口把这一支彻底改干净**：b82 的修法是"再补一个目录"，等于把下一次迁移留给下一个人踩——
本批实测仍有 5 个含 28 个记录点的文件在面外（`e2e/run/runner.mjs`、`fieldperm-smoke.mjs`、
`mlevel-verify.mjs`、`page-state.mjs`、`deep-verdict-diff.mjs`；显式 `--targets` 复扫是 0 处违规，
所以这次没漏缺陷，但"面不完整"本身仍然是红的）。现在**不按名字枚举，按事实派生**：
递归 `stepby-vue/tests/e2e`（跳过 `_tmp`/`screenshots`/`node_modules`/`playwright-report`/`test-results`
与 `*.test.mjs`），凡出现记录族调用点（`record`/`recordSoft`/`recordSkip` 后跟 `(`）的 `.mjs` 一律进面。
三条反脆弱一律 fail-closed：e2e 目录缺失、面 `<6` 个文件、**已知记录点所在文件消失**
（`main.mjs` / `deep-e2e.mjs` / `modules/actionBreadth.mjs` / `modules/writeEndpointBreadth.mjs`）；
`--selftest` 另配一条正控："没在任何清单里出现过的目录"（合成树里的 `nested/newHome.mjs`）**必须**进面。
真树扫描面 7 → 11 个文件 / 合计 0 处。变异证伪：往 `SKIP_DIRS` 加 `"nested"` ⇒ `--selftest EXIT=1`。

```bash
python scripts/e2e_assertion_scan.py --selftest
python scripts/e2e_assertion_scan.py --strict --baseline scripts/e2e-assertion-baseline.json
python scripts/e2e_assertion_scan.py --json > scripts/e2e-assertion-baseline.json   # 刷新快照（横幅走 stderr）
```

载体（b83 补齐）：`run-gates.py` 的 `assertscan` 现在带 `--strict --baseline`——此前它**不带任何判定旗标**，
而 plain 模式扫到违规也返回 0；`--baseline` 全仓无载体，可 AGENTS 一直写"棘轮只许降"。
"只打提示、没有动作通道"= 没判（§测试门禁 ⑨）。

### 3.75 全量轮"跑完了"必须由执行计数自证，不由 `full` 旗标自证（b82 新增）

**现场**：第一轮全量（窗口 UTC `2026-10-21 02:57:26 .. 03:25:01`）跑到 M38 时 Chromium 整个没了，
M39–M90 每模块只吃一条 `browser.newContext: Target page, context or browser has been closed`，
汇总照样打"模块: 90"、`deep-e2e-reqstats.json` 照样写 `full: true`。
这一轮如果拿去 `--update-baseline`，会把 52 个模块覆盖的端点全记成"未触达"、把风暴基线缩到前 38 个模块。

**四个判据位置与读法**：

1. `runner.mjs` 每模块统计 `verdicts = results.length - before`（PASS+FAIL+SKIP 都算，
   `results` 是唯一事实源），数据集落 `modulesPlanned` / `modulesAttempted` /
   `modulesWithZeroVerdicts` / `totalVerdictRows` 四个自证字段；
   **`break` 掉的那几个模块连 `moduleStats` 都没有**，所以"零判定列表"必须并入"从未入场"的编号——
   这正是 `modulesAttempted ≠ modulesPlanned` 这道闸存在的理由（只判零判定列表会漏）。
2. `dataset-window.mjs::assertFullRun`（`endpoint-coverage` 与 `request-storm` 共用）三道闸：
   缺字段拒 / 计数不等拒 / 有零判定模块拒。旧格式一律拒，宁要一声"重跑"。
3. 汇总退出码取 `max(record 计数器, 判定行里 passed===false 的条数)`：
   模块异常是**直接 push 行**的，旧写法只看计数器 ⇒ 52 个模块抛异常也能 EXIT=0。
4. SKIP 棘轮：提前终止的一轮**既不比对也不许 `--update-skip-baseline`**（崩轮 SKIP 32 < 基线 34，
   那是"没跑"，`skipRatchet()` 对"比基线小"给 `writeAllowed=true`，而退出码拦不住已经写出去的文件
   ——所以这一支必须在写入之前 `return 2`）。

**失联自愈**（同一处 `runner.mjs`）：命中 `BROWSER_DEAD_RE` 或 `!browser.isConnected()` ⇒
重启 Chromium（预算 2 次）并**重试同一个模块**；预算用尽或重启失败 ⇒ 立刻 `🛑` 终止，
不再把剩下几十个模块空跑一遍。日志行里会带 `os.freemem()`，因为这类失联的常见成因是内存压力
（并行 `cargo` / 另一套浏览器套件同时在跑）。重试前 `hubs.length = hubMark`——失联那半截采集
留在 `hubs` 里会给请求密度数据集混入僵尸行。

**上下文的关闭改在 `finally`**：旧写法只在成功路径 `ctx.close()`，模块一抛错就把上下文留在
同一个 Chromium 里（90 个模块跑下来是实打实的句柄泄漏）。同批还修了重试循环必须给普通模块异常
`break`——`for (;;)` 没有终止条件时，同一个坏模块会无限重跑。

**跑法不变**：全量单轮（不带 `--range/--feature/--except`）才允许收紧基线；
判据是 `❌ 0` + `EXIT=0` + 汇总行没有 `🛑 / 🔌 / 提前终止`。看到这三行之一，本轮数字**全部作废**，
先修执行环境（内存、并行编译、产物）再重跑，不得"取其中一段"。

### 3.76 跑任何浏览器级验证之前：前端产物也必须证"是本仓当前源码构建的"（b82 新增）

本表① 那条（核对 :8080 监听进程的镜像路径）只管到了后端。b82 实测缺的另一条腿：
`:8080` 内嵌服务的是 `stepby-axum/frontend-dist/`，实测它停在 06:37 的构建，
而 `src/views/monitor/job/index.vue`、`src/views/system/user/index.vue` 属 **07:27** 的提交
⇒ 一整套 UI 判据加载的是改动**之前**的包，而脚本毫无提示。

顺序固定（§1/§2 原样）：

```bash
cd stepby-vue
NODE_OPTIONS="" npm run build:embedded            # base='' 同源，产物落 dist/
cp -r dist/. ../stepby-axum/frontend-dist/        # :8080 的 ServeDir 读这里，改完不必重启
NODE_OPTIONS="" npm run build:prod                # dist/ 恢复成 :4173 preview 用的那份
node tests/e2e/build-freshness.mjs                # 两道闸：新鲜度 + 服务即产物
```

`build-freshness.mjs` 的输出形态：

- ✅ `产物新鲜且服务即产物：<目录>（入口 /static/js/index-*.js / N 字节）` ⇒ 可以起浏览器；
- ❌ `[FATAL] 产物陈旧：… 早于 N 个应用源码文件——首推 <文件>（比产物新 X 分钟）` + EXIT=2 ⇒ 重建；
- ❌ `[FATAL] … 服务端 M 字节，磁盘 N 字节 …` + EXIT=2 ⇒ 服务的是另一份产物/另一棵树。

同一条预检已经接在 `deep-e2e.mjs` / `main.mjs` / `a11y-full.mjs` / `action-inventory.mjs` 的启动路径上，
所以**忘了手动跑也会被拦下**。`--plan`、`--selftest` 这类不启浏览器的路径不受影响。
判据自检：`node tests/e2e/build-freshness.mjs --selftest`（**b84 起 16 组双向**，`run-gates.py` 的 `freshsynth`、
`ci.yml` 的 `doc-gates` 都接了）。排除项与理由：`*.test.ts` 与 `src/types/api/generated/**` 都不进包，
把它们计入会让每次 `vitest` 都被迫重构建——判据就变成噪声。

**后端那一腿（b83 加、b84 改口径）**：除 exe 存在性与采集面下限之外，"什么算测试文件"必须**由声明派生**，
不得按目录名硬编码。b84 的实测代价是收口当晚 `cargo fmt --all` 只改了 `src/initialize/tests.rs` 的空白
（该文件挂在 `#[cfg(test)] mod tests;` 上，生产码一行没变），闸却报 `[FATAL] 后端产物陈旧、先重构建再重启`。
现在的规则是扫全部 `.rs`，把"属性行逐字符等于 `#[cfg(test)]` 且紧跟 `mod NAME;`"解析成
`NAME.rs` 与整个 `NAME/` 目录，命中才排除——两种真实形状（目录形 `integration_tests`、文件形
`initialize/tests.rs`）与将来任何新写法自动同口径。三点配套：

- 只认逐字符 `#[cfg(test)]`：`#[cfg(all(test, …))]`、`#[cfg(not(test))]`、以及**无属性**的 `mod tests;`
  一律不排除。方向必须是"宁可多要求一次重构建"，绝不能把真生产文件静默剔出采集面；
- 自检 ⑯ 是对照组：夹具里 `src/probe/tests.rs`（无属性声明）与 `src/probe/gated.rs`
  （属性不是纯 `#[cfg(test)]`）晚于 exe 时**必须**出现在陈旧清单里——这条专门挡"按文件名排除"的捷径；
- 自检 ⑭ 要求 `excluded >= 2`：派生逻辑坏掉时会"什么都没排除"，三条排除用例于是同时变绿。
  这条上线第一轮就抓到自己的算术：`excluded` 原先按 `all.length - files.length` 算，
  而 `Cargo.toml` 等根文件是**加进面**的，被读成了"被排除的测试文件"。

### 3.77 不可分段的全量轮：脱离进程树启动，通知的退出码不是结论（b82 新增）

b82 连吃两次同类打断。第一轮是 Chromium 在 M38 没了（node 还活着，跑完了并落了汇总）；
第二轮是 **node 进程整个消失**在 M24 的登录行之后，取证四条方向一致：

| 观测                                                                               | 排除/指向                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| 日志里既无 JS 栈也无 `FATAL ERROR: Reached heap limit`（stdout/stderr 同一份文件） | 不是套件内异常，不是 Node 堆 OOM                |
| Windows 应用日志近 30 分钟无 node.exe / chrome.exe 的 WER 事件                     | 不是进程自身崩溃                                |
| 进程表里 node 与 chrome **都不在**                                                 | 整棵进程树没了                                  |
| 外层 shell 记 `DEEP_FULL2_EXIT=127`                                                | 既不是 0 也不是崩溃码 ⇒ 外部 `TerminateProcess` |

期间后台任务通知**两次提前**报 `completed (exit code 0)`——那是命令末尾 `echo` 的退出码，
不是套件的。⇒ 结论：**不能假设"通知=进程还活着"，也不能假设"后台任务能活到跑完"**。

跑法（`--log` 目标必须不存在；`--` 必须有）：

```bash
cd stepby-vue
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 \
  node tests/e2e/run-detached.mjs --log=tests/e2e/_deep_full3.log -- node tests/e2e/deep-e2e.mjs
# 立刻返回：DETACHED pid=15256 log=… pidfile=….pid
node tests/e2e/run-detached.mjs --wait=tests/e2e/_deep_full3.log.pid --timeout=540
```

`--wait` 每 10s 只探一次 `process.kill(pid, 0)`（**不刷日志**）；退出码 0 = 进程没了（去读日志），
1 = 等满还在跑（可再来一轮），2 = PID 文件坏了（不得读成"跑完了"）。
读结论时看三样：汇总行 `✅/❌/SKIP`、`EXIT`，以及有没有 `🛑 / 🔌 / 提前终止` 三行
（见 §3.75）。看到其中任何一行，本轮数字全部作废。

为什么非要脱离而不是分段：`--update-skip-baseline`、`request-storm --update-baseline`、
`endpoint-coverage --update-baseline` 都只允许在**全量单轮**上用（分段是子集，写进去等于放松基线），
而全量单轮实测 45–55 分钟，超过前台调用的 10 分钟硬上限。

### 3.78 脱离启动器的采集面本身要判据；变异必须改在真正被执行的那份文件上（b82 新增）

§3.77 那个启动器自己藏了一个缺陷，代价是一整轮六段套件的退出码无法归因：
`supervise()` 原先把 `fs.openSync(logPath,'a')` 的**文件句柄**直接当子进程 stdio。MSYS 的 `sh` 写这种
由非 cygwin 进程创建的句柄**不报错也写不进去**，而 `echo` 是内建命令，写失败直接变成它自己的退出码：

```text
spawn('sh',['-c','echo A; echo B'], {stdio:['ignore', fd, fd]})        ⇒ 退出码 1、正文 ""
spawn('sh',['-c','echo A; echo B'], {stdio:['ignore','pipe','pipe']})  ⇒ 退出码 0、正文 "A\nB\n"
```

node 子进程是原生 Win32 程序，写句柄没问题 ⇒ 症状是**分裂的**：套件输出的 1263 条断言一条不少，
包装层自己打的 `=== SEG … EXIT=0 ===` 凭证一条不落，`.exit` 还因为载荷最后一条 `echo` 写失败而记成 1。
`❌ 0` 与 `EXIT=0` 是两条独立证据，第二条当场失效。

跑法上的三条纪律：

1. **包装层必须走 pipe**（已修，由 `run-detached.mjs --selftest` 12 条双向钉住，接在
   `run-gates.py` 的 `rdsynth` 与 `ci.yml` 的 `doc-gates`）。自检在 `sh` 不在场时**拒绝运行**（EXIT=2），
   不得跳过那两组再报 SYNTH_OK。
2. **载荷里不要用 `| tail`**。`node x.mjs | tail -4; echo "EXIT=$?"` 取到的是 `tail` 的码——
   b82 实测 cargo doc 真的失败（101），而凭证行写的是 `CARGO_DOC EXIT=0`。要看结尾就直接读日志。
3. **`sh` 的退出码等于最后一条命令**：驱动器把逐段凭证打成 `echo "=== SEG $s EXIT=$? ==="`
   才有归因依据；`.exit` 本身只说明"这条链跑完了"，不代表每一段都 0。

**变异证伪的方法论**（本批两次自曝）：起初用 `cp run-detached.mjs _rd_mut.mjs` 改副本跑自检，
结果**四组变异全绿**，差点写下"自检抓不住"。真因是 `start()` 里固定
`spawn(process.execPath, [path.join(HERE,'run-detached.mjs'), '--supervise', …])`——
**副本的 `start()` 委托回原件**，变异的那份代码根本没被执行。凡是自带"spawn 自己"入口的脚本
（本仓的判据脚本多是这种形状），变异必须改在**被真正执行的那份文件**上，改完 `diff -q` 确认还原；
并且加一条 `MUT_APPLIED` 式的断言证明改动确实落到了那一版里——第二次变异就因 sed 分隔符写错而
`APPLIED=false`，报出来的三条红其实是另外两组变异的叠加，差点被记成"fd 形态复现成功"。

另：`--update-skip-baseline-from=<日志>` 这类**不启浏览器的入口一律要免凭据**（b82 实测它被
`test-config.mjs` 的 import 期 fail-fast 挡住）。免凭据的判据是"是否需要浏览器"，不按旗标名枚举。

### 3.85 点击落地判据的**匹配口径**：允许表读全文，报告才截断（b83 收口）

症状是判据自己打出一对矛盾行：

```text
❌ 未登记: deep|M81|click|.el-dialog:visible button:has-text("取 消"), … ×1
ℹ 登记了但本轮没出现: deep|M81|click|^\.el-dialog:visible button:has-text\("取 消"\), .*\.el-dialog__head
```

同一个形状既"未登记"又"没出现"，只可能是**匹配代码与展示代码读的不是同一段文本**。实测这一条
`selector` 归一后长度恰好 120（截断上限），`message` 恰好 600（`CLICK_MESSAGE_CAP`），而
`- element is not stable` 位于**第 330 字符**：Playwright 的调用日志先印
`waiting for locator('<那条 120 字符选择器>')`，原因写在后面。旧写法拿 `messageRe` 去比
`sample.slice(0,160)` ⇒ 带 `messageRe` 的条目结构上永远匹配不上，判据红在自己的截断上。

跑法与验证：

```bash
node tests/e2e/click-failure-audit.mjs --selftest     # SYNTH_OK … 24 条双向（含 ⑳/⑳b 这一对）
node tests/e2e/click-failure-audit.mjs --gate         # 两路输入都要 full:true，否则 UNRUN(EXIT=2)
node tests/e2e/click-failure-audit.mjs --gate --dataset=deep:tests/e2e/screenshots/deep-e2e-clickfails.json
```

三条口径：① **显示截断与匹配必须分叉**——`sample` 给人读（160），`msgFull` 给判据比（整段，
采集侧已限 600）；② 归一化选择器超 120 字符会被截，允许表条目**只能写前缀锚**；
③ 登记条目匹配不上时，先怀疑判据读的是哪一段文本，**再**怀疑形状变了——按字面提示去放宽正则
等于把判据改掉。自检 ⑳/⑳b 是一对双向：原因在 160 之后必须命中、原因确实不在正文里必须不命中
（后者防修法退化成"`messageRe` 一律放行"）。

### 3.86 落盘与采集面一律锚定"脚本位置 / 事实"（b83 收口六处站点 + 一把扫描器）

b82 为 `run-detached.mjs` 立的那条"默认输入必须从脚本位置反推本仓根"只覆盖了**输入**；
实测**输出**与**扫描面**同样会漂。两条启动目录都合法（RUN-RECIPE §3 教 `cd tests/e2e && node main.mjs`，
而门禁脚本常从仓根跑），于是主套件的断面分居两棵树：

| 文件                         | `stepby-vue/screenshots/`（cwd=仓根时） | `stepby-vue/tests/e2e/screenshots/`（消费方读这里） |
| ---------------------------- | --------------------------------------- | --------------------------------------------------- |
| `main-clickfails.json`       | 有（b83 全量轮）                        | 缺失 ⇒ 判据 `[main] 数据集缺失` UNRUN               |
| `_metrics_5xx_baseline.json` | 10-22                                   | 10-20 ⇒ 跨轮 delta 对着旧树算                       |

现在六个入口脚本的落盘/取路径全部锚定脚本位置（`main.mjs` 的 `CONFIG.screenshotDir`、
`capture-kit` 的 `shotDir` 默认值、`deep-e2e` M83 的 `_tmp`、`perf-throttle-check` 的
`perf-budget.json`、`validate-phone-redirect`、`diag-pages`），并由常驻守卫钉住：

```bash
npx vitest run src/utils/e2eCwdPath.guard.test.ts   # 4 例；扫描面 = tests/ 下 85 个 .mjs
```

判据形状：真实树 `process.cwd()` 必须 **0 处** + 逐文件掩码长度不变式 + **差异法活性**
（每个被扫文件末尾追加一条合成违规，命中数必须 +1，85/85）+ 反证（注释与字符串里的关键字不算，
且反证文本必须真含该关键字）。边界写进文件头：`src/utils/*.guard.test.ts` 不扩——vitest 只有一种
启动目录，且拿错根时 `collectMjs` 抛 `ENOENT` 而非返回空集，不存在"静默读旧树"这一支。

同一件事在**扫描器的目标面**上是第二条腿：`scripts/e2e_assertion_scan.py` 在 b82 补过"用例往
`modules/` 迁"之后仍按名字枚举（5 入口 + 1 目录），本批实测还有 5 个含 28 个记录点的文件在外面。
现改为**由事实派生**（递归 `tests/e2e`，凡出现 `record|recordSoft|recordSkip` 调用点的 `.mjs` 一律进面），
三条反脆弱 fail-closed（目录缺失 / 面 `<6` 文件 / 已知记录点文件消失），正控是"没在任何清单里
出现过的目录必须进面"。真树扫描面 7 → 11 个文件 / 合计 0 处。

载体补齐：`assertscan` 原先在 `run-gates.py` 里**不带判定旗标**（plain 模式扫到违规也返回 0），
`--baseline` 全仓无载体，而 AGENTS 写着"棘轮只许降"——正是"只打提示、没有动作通道=没判"。
现在 run-gates 与 `ci.yml` 都跑 `--strict --baseline scripts/e2e-assertion-baseline.json`；
刷新快照就一行（`--json` 的"扫描面"横幅走 stderr，所以可以直接重定向）：

```bash
python scripts/e2e_assertion_scan.py --json > scripts/e2e-assertion-baseline.json
```

### 3.87 表单类点击判据必须判"回显"，不能只判"点击返回成功"（b83 F52）

`click()` 返回成功只证明事件派发了，不证明 `v-model` 变了。EP 里"点了但不落 model"至少三条真实路径：
多选点回（再点一次是取消）、`is-disabled` 选项（本仓角色选项按 `status==1 || scimRoleIds` 禁用，
**首项可能就是禁用项**，故选择器要写 `.el-select-dropdown__item:not(.is-disabled)`）、
tree-select 的懒加载子层。这三种情况下后续"提交成功"照样全绿。

实测形状（`main.mjs` F52 用户新增）：

```js
// ❌ 旧：EP 2.x 的 .el-select__input 是只读零宽 input，点它卡在 waiting for element to be visible
await itemByLabel('归属部门')
  .locator('input')
  .first()
  .click({ timeout: 3000 })
  .catch(() => {})
// ✅ 新：点 .el-select__wrapper → 等 `.el-select-dropdown:visible` → 点首项 → 回读 form-item 文本判"回显"
const deptPick = await pickFirstFromSelect('归属部门', '.el-tree-node__content')
record(52, '归属部门选中值回显到表单', deptPick.echoed, `回显=${deptPick.echoed ? '含' : '不含'}首节点文本`)
```

改前那两步**从来没有成功过**：部门与角色均未被选中，而用例记 ✅（这两项非必填 ⇒ "提交成功"
对它们的约束恰好是零）。查同族站点一行即可：

```bash
grep -n "itemByLabel(.*)\s*$\|\.locator('input')\.first()\.click" tests/e2e/main.mjs | head
```

规则来自 `main.mjs:1340` 已有的注释（"EP 2.x 的展开热区在 `.el-select__wrapper`；点根节点在部分版本
不触发 popper"）——同文件另外 6 处都照写了，F52 是漏改的第 6 处。**写法注释挡不住漏改，能挡住的只有回显对账。**

### 3.88 前置条件在这套代码里根本不成立 ⇒ 改判据形状，不是加登记（b83 F3）

`main.mjs` F3 的注释写着"下载属敏感操作，首启会弹「安全提示」MessageBox，确认后请求才放行"，
于是对 `.el-overlay-message-box .el-button--primary` 盲等 8000ms。两句事实证伪：
`views/system/backup/index.vue:334-344 handleDownload` 直接 `downloadBackup`（链路里没有确认步骤）；
本仓 `.el-overlay-message-box` 只由 `store/modules/user.ts:201/213/225`
（强改密 / 初始口令 / 口令过期）在登录与 getInfo 时弹出。
⇒ 这 8 秒每轮必然超时，并每轮在点击失败台账留一条归不了因的 unrecovered。

**危险在于下一步**：按"未登记形状必须逐条带理由"的纪律，人会去给一个不可能发生的分支编理由登记掉，
判据就此与事实脱钩。所以"允许表加一条"之前必须先问：**这个形状在这套代码里可能成立吗？**
答案是不能时，正确动作是改判据形状——分支探测 + 两支都判测量值：

```js
const mbShown = await page
  .locator('.el-overlay-message-box')
  .first()
  .waitFor({ state: 'visible', timeout: 2000 })
  .then(() => true)
  .catch(() => false)
if (mbShown) {
  /* 点击落地 + 框计数归零，两条都判实测值 */
} else {
  record(3, '下载链路无确认框（提示框仅来自登录期口令态）', !mbShown, '点击后 2s 内可见数=0')
}
```

两支的条件都是变量而非字面量（`e2e_assertion_scan.py` 的字面 true 判据会当场抓），
且不再有 8 秒死等。若确实需要"出现过确认框"那一支的证据，见台账 §15 N-29（需口令态夹具）。

---

### 3.89 收口期两支审计判据的窗口必须**覆盖整批浏览器套件**，不得只取 deep 自证窗口（b85 固化）

`backend-log-audit` / `oper-log-audit` 的缺省窗口来自 `screenshots/deep-e2e-reqstats.json` 的自证字段——
那是**深度套件那一轮**的断面。允许表却是按"一批收口"积累的：启动期告知性 WARN（`Redis 配置被忽略`、
`权限 fail-closed 模式已启用`、`错过 03:00 调度窗口`、mmdb/xdb 加载失败）只在后端进程启动那一刻出现一次，
越权/危险扩展名/畸形 JSON/令牌自管理这一族负路径大多由**主套件**产生。

实测后果（b85 第一轮门禁扫描）：

```
后端日志：窗口 04:51:37 → 05:39:58 ⇒ 未登记 7 / 允许表未命中 15
失败操作：窗口 04:51:37 → 9999-12-31 ⇒ 失败 35 / 已登记 35 / 未登记 0 / 允许表未命中 54
```

"未命中 54"听起来像"允许表里 54 条都是废条目、该退役了"，**照着这句提示去 `--retire-stale`
就会把 54 条真在用的豁免删掉**——下一批同类负路径全部判成未登记。这正是 b82 ⑩ 那一族：
**判据读的是自己的旧断面/半截断面，而不是事实**。

正确做法（b83/b84 收口实际用的就是这个，只是从没写成配方）：

```bash
# 后端启动即计时；窗口起点取本批第一个浏览器套件之前，终点取最后一个套件之后
export STEPBY_BACKEND_LOG=D:/Projects/stepby/stepby-axum/logs/b85_r2.log
node tests/e2e/backend-log-audit.mjs --gate --since=2026-10-22T06:05:00Z --until=2026-10-22T08:35:00Z
node tests/e2e/oper-log-audit.mjs     --gate --since=2026-10-22T06:05:00Z --until=2026-10-22T08:35:00Z
```

三条要点：

1. **窗口必须包含后端那一次启动**——启动期那批 WARN 一生只出现一次，切掉启动就必然"未命中"。
   所以本批权威轮的日志文件必须是**新建的**（`logs/b85_r2.log`，`rm -f` 后由 `start-backend.mjs` 重定向），
   不能拿按日轮转的 `app.log.*` 拼。
2. **先跑完两套件再判**：`run-gates.py` 里 `backendlog`/`operlog` 属 `LIVE_DB_GATES`，
   必须排在浏览器套件停止之后；`operlog` 还要求窗口内 `sys_oper_log` 有真实写入（零操作 ⇒ EXIT=2）。
3. `--retire-stale` 只在**整批窗口**上跑一次，且退役前后各打一次逐条清单入台账——
   它删的是文件里的条目，退出码撤回不了已经写出去的内容（AGENTS ⑤）。

判据侧配套的硬闸（b85）：`--gate` 必须显式给；窗口优先级 `--since=` > 环境变量 > 数据集自证；
未命中对账与退役通道都在（`allowlist unused ⇒ 判红`）。缺的那一半是**用法**：
没人规定"这个窗口应该覆盖什么"，于是每次都按脚本缺省跑，跑出 54 条假退役信号。本节就是补这一半。

### 3.90 `click-failure-audit` 要求两路输入**同一批**：全量单轮主套件不可省（b85 固化）

`main-clickfails.json` 只在**全量单轮** `main.mjs` 时落盘，分段跑批写的是 `main-clickfails.incremental.json`
（这是 b82 定的规矩，防止一段的局部断面冒充全站）。于是"六段跑完"并不等于"main 这一侧被 judge 过"。
判据本体现在会直接拒绝这种拼接：两路断面相差超 `BATCH_SPAN_HOURS = 8` 小时 ⇒ `[FATAL]` + UNRUN，
并点名陈旧那一路与它需要的动作。

收口配方因此固定为**两次**主套件运行，各自买不同的东西：

| 跑法                                            | 买到的证据                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 六段 `--feature=A-B`（每段 <10 分钟，前台逐段） | 逐段 `SEG … EXIT=` 凭证、注册表分片卫生（b84 那条空洞就是靠分段过滤才撞出来的）          |
| 一次全量单轮（`run-detached.mjs` + `--wait`）   | `main-clickfails.json` 主文件、`test-report.json` 全量断面、可与上一批单轮直接对账的条数 |

实测对账（b85 r2，同一后端进程）：六段 `190+222+344+223+139+150 = 1268`，全量单轮 `1263`；
差 5 条 = F0 注册表自检在六段各跑一次多算 5 次（单轮只 1 次）。**这个差是恒等式不是漂移**——
把它记进台账前必须先做逐功能差集确认除 F0 外逐条同数，否则就会像 b79 那次把"跨文件加了 3 条判据"
读成"数据面位移一档"。

### 3.91 窗口必须同时管住"统计量"与"结论"，且计数要有判据之外的复核（b85 固化）

`backend-log-audit` 判 `--gate` 时读了两类数：**结论类**（`classify` 的 WARN/ERROR 扫描、`detectStalls` 的停顿）
和**统计类**（记录数、级别直方图、非 tracing 裸行数）。b85 之前只有前者过窗，后者取整份文件。
两个可复现的症状：

1. 同一个窗口 `06:17→08:35`，两次收口分别打 `2852` 与 `3137` 条记录——**后端在收口之后还在写同一个
   日志文件**，晚于 `until` 的行也被算进"本轮记录数"。台账据此写的数字因此每次都对不上。
2. `unparsed`（裸 panic/stderr）**参与判定**（`bad = unknown + unparsed + unused`）。于是下一轮启动时崩出来的
   一条裸行会把**上一批**的收口判红。这与 3.89/§14 那条"窗口外的静默不得算进本轮"是同一条纪律的反面。

配方三条：

- **`--until` / `STEPBY_BACKEND_UNTIL` 必须给实数**，不许留"（到文件末尾）"。留空时判据照跑，
  但"本轮"就变成"这份日志 currently 有的全部"——跑批与收口之间隔多久，数字就漂多久。
- **判据之外的复核**：窗口内计数要能被一条独立命令对上，否则是判据自证自。实测同意（b85 收口）：

  ```bash
  # 与 --gate 打的"窗口内记录 2840"必须相等（时间戳前缀逐行判，不经判据代码）
  awk '/^2026-10-22T/{t=substr($0,12,8); if (t>="06:17:00" && t<="08:35:00") c++} END{print c}' \
    ../../../stepby-axum/logs/b85_r2.log
  ```

- **裸行怎么归窗**：它自己**没有**时间戳（这正是抓它的特征），判据让它继承"前面最近一条 tracing 记录"
  的时刻；文件最开头、任何记录之前的裸行 `ts=null`，一律按**窗口内**计（fail-closed：宁可多判一条红，
  也不能让真 panic 因为"定不了位"被筛掉）。这与 `detectStalls` 的额外要求**故意相反**——那里 gap 是
  减法算出来的，`NaN >= 20000` 恒 false，定不了位的记录会静默漏判停顿。改这两处之一前先读另一处的注释。

自检 46 条双向覆盖上述四条（含"把窗口挪到裸行之后必须计入"的对照组——只判"排除"判不出"一律排除"）；
变异证伪：摘掉 `filterWindow` ⇒ 自检 4 条同时红，且真日志上的 `--gate` 当场把"窗口内记录"打成全文件数 3152。

### 3.92 `libtest` 只在并发轮红、单线程恒绿 ⇒ 先怀疑进程环境，不要怀疑用例（b85 固化）

症状（b85 提交后复跑实测）：同一份代码，几十分钟前 64 把全绿，复跑 `libtest` `EXIT=101`，
5 条集成用例失败——3 条是 `login 业务码应为 200 … {"code":401,"msg":"用户名或密码错误"}`，
2 条是行数对账（`left 2 / right 1`、`left 4 / right 1`）。

四步取证，顺序不能换：

1. **先证"不是用例坏了"**：`cargo test -j 4 --lib -- --test-threads=1 <这几条>` ⇒ 全绿。
2. **再证"随机"**：换一组同模块用例、`--test-threads=20` 连跑 3-6 轮 ⇒ 每轮红的**不是同一条**。
   红哪条不确定 = 共享状态，而不是某条用例的断言写错。
3. **归因只能按 `---- <test> stdout ----` 块**：并发 20 线程时，夹在 `test … ok` 之间的裸 WARN 行
   **不属于**时间上最近的那条用例。这一步差点把人支使去查"租户闸门为什么拒绝 tenant 9001"
   （那是别的用例的日志），而失败用例自己块里的第一行才是真正的证据：
   `panicked at src\integration_tests\mod.rs:305 … SSO_ENABLED=true 时必须显式配置 SSO_ISSUER`。
4. **查共享可变量**：`grep -rn "set_var\|remove_var\|dotenv" src/` —— 本轮查到四处，
   根因是 harness 把 `dotenvy::dotenv()` 排在 `Settings::from_file()` 之后，而 dotenv 逐行写环境，
   `.env` 里 `SSO_ENABLED`(36 行) 比 `SSO_ISSUER`(38 行) 先进 ⇒ 并发中有用例读到半份。
   修法：`static TEST_ENV: Once` + `call_once`（后到线程阻塞等装载完成），锁在
   `integration_tests/env_discipline.rs`。

跑批口径也一并记下：**收口用的 `libtest` 必须是全量单轮**（`run-gates.py` 的 `libtest` 就是它），
"某模块单独复跑全绿"不能替代它——单独复跑只有 1-3 个应用实例在跑，抢不到那个中间态。

### 3.93 平台参数当旋钮用：三条判据缺一条就是假绿（b86 固化，`main.mjs` 功能 45）

`sys.index.sideTheme` 在 §5.23 之后是"参数页可见可编辑、后端零消费者"的死键。把它做成真旋钮之后，
判据不能只写"默认值是 theme-auto"——那条判据对"改完毫无反应"是**瞎的**（它本来就是靠这一点蒙混过关的）。

本仓落的形状是三条，同一功能里连续判：

1. **平台值改得动界面**：`PUT /system/config` 把平台层写成 `theme-dark` ⇒ 清掉本地存档与
   「用户选过」标记 ⇒ 重新导航 ⇒ `.sidebar-theme-wrapper` 的 class 必须含 `theme-dark`。
2. **对照组：用户选择优先于平台缺省**：本地写 `stepby_sidetheme_user_set=1` +
   `layout-setting.sideTheme=theme-light` ⇒ DOM 必须是 `theme-light`。
   少了这一支，实现可以是"每次进入都拿平台值覆盖用户"——第 1 条照样全绿，
   而所有用户自己的主题选择被静默洗掉。
3. **复原 `theme-auto`**：否则下一批的 45-1（默认 theme-auto）与任何后续功能都被本支污染，
   而且"复原成功"本身就是"写路径通"的第二次证据。

两条实现细节（都是实测逼出来的）：

- **采样必须轮询到落定**：`page.goto(..., {waitUntil:'load'})` 之后主题类名才由路由守卫里的
  `getInfo` → `getConfigKey` → store 落上，"看一眼"的写法结论由网络快慢决定（本表前言 ④）。
  落法是 `readSidebarClassUntil(want)`：轮询到命中或 12s 超时，**并把等待时长写进凭证**
  （实测 `等0ms` = 一次命中；出现"等 250ms"级别的正常抖动也能从凭证里看出来）。
- **类名是被点击改变的那个属性**，所以判据读它是对的（本表前言 ③ 的反面情形：
  要读的属性正是被操作改变的对象时，不得再拿它当选择器）。

配套的服务端判据（不在 e2e 里重复）：`integration_tests/sys_config_dict.rs`
的 `test_config_retired_keys_and_value_domain` 判值域拒绝、退役键 404、改名拦截与"未登记键照常可写"对照组。

### 3.94 登录期弹框判据：harness 收 Tour 遮罩的 Escape 会把你测的框一起关掉（b86 固化，`deep-e2e` M92）

M92（新建账号 → UI 登录 → 「安全提示」MessageBox）首跑三条弹框判据全红，
detail 只有 `visible=false text=` ——看着像"产品没弹框"。DOM 取证脚本打出来的事实相反：

```
t=1s {"url":"…/index","overlay":[{"cls":"el-overlay-message-box","vis":true,
      "text":"安全提示您的密码还是初始密码，请修改密码！取 消确 定"}], …}
```

框**确实出现了**，是被 `deep-e2e` 的 `login()` 关掉的：它成功登录后发现
`.stepby-tour-mask` 可见就按一次 `Escape`，而 Element Plus 的 `confirm` 默认
`closeOnPressEscape=true` ⇒ 同一个 Escape 同时关掉了被测对象。

修法只有一条，且必须是**导航前**生效：

```js
await page.addInitScript(() => {
  try {
    localStorage.setItem('stepby-layout-tour', 'completed')
  } catch {}
})
```

事后 `localStorage.setItem` 无效——Tour 在首次渲染时就已经决定要不要出现（与 §3.60.4 的
"遮罩在数据加载后才挂"是同一类时序）。

由此定两条写弹框/遮罩类判据的规则：

1. **凭证必须够归因**：detail 里要同时有 `登录落地=`、`url=`、`框数=`。
   只写 `visible=false` 分不清"没弹框""登录没成""被 harness 关掉"三种相反状态，
   而这三条里只有第一条值得改产品码——本轮差点照着"产品没弹框"去改 `user.ts`。
2. **harness 的便利动作（收遮罩、清存档、按 Escape）都是被测环境的组成部分**，
   它动了被测对象就必须在判据里显式排除，而不是把判据改成"允许框不在"。

### 3.95 清会话必须落在"没有认证链在飞"的时刻（b86 固化，`e2e/run/auth.mjs::clearSession`）

b86 全量 deep-e2e 唯一一条 ❌ 在 M9「无控制台错误 - 3 个错误」，而同一行代码在 b84 全量是
`0 个错误`。诊断脚本（复刻 M9 开头 + 逐请求打印 Authorization 头）实测到的时间线：

```
  5846ms  REQ GET /getInfo   auth=Bearer eyJ0e…     ← goto('/logout') 触发的冷加载
  5847ms  ## goto(/logout) 已 resolve（waitUntil=load）
  5895ms  REQ GET /system/config/configKey/…  auth=Bearer eyJ0e…
  5896ms  ## clearCookies() 完成
  5899ms  REQ GET /getRouters              auth=(none) → 401 + console error
  6169ms  REQ GET /system/notice/listTop   auth=(none) → 401 + console error
```

两笔独立的账：

1. **`goto('${frontendUrl}/logout')` 从来不是登出**。前端路由表里没有 `/logout`
   （`src/router/index.ts` 只有动态路由 + 错误页），`curl -i :8080/logout` 回
   `content-type: text/html` ⇒ 命中的是 SPA 兜底，服务端会话原样活着。注释写着
   "先登出当前用户"，描述的是一个不存在的动作；它真正的副作用是**把应用冷加载一遍**。
2. **`waitUntil:'load'` 早于守卫的串行认证链**（`getInfo → configKey → getRouters →
布局挂载后的 listTop`，见 `src/permission.ts`）。清除点落在这条链中间 ⇒ 排在后面的请求
   以 `auth=(none)` 出网。同一段代码 0 条与 3 条 console error 轮流出现，
   结论由毫秒时机决定——这正是 AGENTS 测试门禁全景 前言 ④ 禁止的形态。

落法（`clearSession(page, frontendUrl)`，M9 与 M12 共用同一实现，禁两处各写一份）：

```js
const cleared = await clearSession(page, CONFIG.frontendUrl)
record(
  M,
  '前置: 浏览器会话已清除（Admin-Token 不残留）',
  cleared.landedOnWhitelist && !cleared.tokenLeft,
  `白名单页落地=${cleared.landedOnWhitelist}, cookie 残留=${cleared.tokenLeft}`
)
```

- 先切 `/privacy`：它在 `src/permission.ts` 的 `whiteList` 里 ⇒ 守卫 `isWhiteList` 直放行、
  不发认证请求；又不套布局 ⇒ 铃铛/公告那类挂载期拉取随之卸载。清完之后没有任何链在飞。
- **必须留一条自证**：`tokenLeft` 读的是 `document.cookie`（应用 `getToken()` 读的同一个来源）。
  没有它，"stepby 用户只读"整组结论都可能建立在"其实还是 admin 在跑"上。

为什么不改成"往 401 豁免表加一条 `configKey`"：那张表判的是 `every(整个页面生命周期累积的 401 URL)`，
加一条豁免等于承认这个形状合法；而清除时机完全可控。**能消除产生形态的动作时，不要登记形态。**
（例外见 §3.96：修复后 `POST /logout` 的 401 是设计内自愈链，那条才进表，且逐条带 `why`。）

### 3.96 会话过期有两条通道，判据必须各判一条（b86 固化，M32 32.7 / 32.7b）

同一次"令牌失效"，走两条完全不同的代码路径，修复前只有第一条有判据：

| 形状             | 触发方式                             | 谁在发请求                            | 应有的确定态                | 修复前实测                                   |
| ---------------- | ------------------------------------ | ------------------------------------- | --------------------------- | -------------------------------------------- |
| 32.7 中途过期    | 登录后在页面点"搜索"                 | 组件（`roles` 已加载，守卫不再介入）  | 重新登录弹框或跳登录页      | 弹框 ✅ 已判                                 |
| 32.7b 冷加载过期 | 失效 cookie + `goto('/system/user')` | 守卫（`getInfo` → `logOut` → 回首页） | 落 `/login`，死 cookie 消失 | **落 `/500`、cookie 残留、无弹框** ❌ 零判据 |

根因在两个通道的 reject 形状不一致：`request.ts` 对 401 一律 `Promise.reject(new Error(译文))`
（丢掉 `response`），而守卫读的是 `err.response.status` ⇒ 那条"401 ⇒ logOut"从不执行；
400/403/404/429/503 反倒原样透传 axios error。修复＝拒绝带 `httpStatus=401` 标记 + 守卫
`response?.status ?? httpStatus`，两头各一把锁：

- 产出侧 `src/utils/request.sessionExpired.test.ts`（真实 service + 桩适配器，两条通道 +
  `/login`、`/lock` 两个**不得**带标记的对照组 + 静态锁"裸写会话过期 Error 必须 0 处"）；
- 消费侧 `src/permission.test.ts` ④ 追加一行**真实形状**夹具（只有 `httpStatus`、无 `response`）。

32.7b 的两条判据形态（都不靠 toast，toast 会自己消失）：

```js
record(M, '会话过期: 冷加载必须落回登录页（不得落 /500 错误页）',
  coldLanded.includes('/login') && !coldLanded.includes('/500'), `落地=${coldLanded…}`)
record(M, '会话过期: 冷加载后死令牌已清除', deadTokenLeft === false, `cookie 残留=${deadTokenLeft}`)
```

实测修复后：`落地=/login?redirect=/index`、`cookie 残留=false`、M32 无控制台错误 0 条。
副作用一条：守卫执行 `logOut()` 会真的向服务端发 `POST /logout`，令牌正是失效的 ⇒ 401 属设计内，
已按"逐条带理由"进 `deep-e2e.mjs` 的 401 无害清单（`u.includes('/logout')`）。

### 3.97 条件型豁免：本轮没出现 ≠ 废条目（b86 固化，`backend-log-audit` 的 `producer` 锚点）

b86 收口跑 `backend-log-audit --gate` 报 3 条，其中两条是"允许表未命中"：

```
WARN /错过 03:00 调度窗口，启动期补跑一轮保留期清理/
WARN /slow statement.*FROM "sys_audit_change" … LIMIT ?/
```

b85 项 F 给未命中配的语义是"本轮没再出现 ⇒ 必须撤销"，`--retire-stale` 也真会删掉它们。
**但对这一族那是错的**，两条都有实测的成因：

| 条目            | 触发条件                                    | 本轮为什么没有                                                                       | 下一次什么时候一定出现             |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| 错过 03:00 补跑 | `retention:last_success_at` 缺失或距今 ≥20h | 上一批刚跑过补跑，标记是新的（`grep -c "保留期清理\|retention"` 在本轮窗口 = **0**） | 每天第一个批次启动时               |
| 审计留痕导出慢  | 导出那条批量读**真的**慢过 sqlx 的 1s 阈    | 本轮没有慢查询（`grep -c "slow statement.*sys_audit_change"` = 0）                   | 运行库审计行再涨上去、且导出被跑到 |

撤销它们的后果不是"少一条豁免"，而是**条件再次成立时判据报红、把人支使去补登记**——
补回去的还是同一句理由。这就是前言 ⑯(c) 立案的那一型：给一个"本轮不可能出现"的形状临时编豁免，
或者反过来把合法形状当废条目删掉。

判据因此改问**真正想问的问题**：这条豁免是"产生它的代码已经没了"（废条目），
还是"代码还在、条件没凑巧"。条目上多一个锚点即可，由判据自己回源码核：

```json
{
  "level": "WARN",
  "match": "错过 03:00 调度窗口…",
  "why": "…",
  "producer": { "file": "stepby-axum/src/scheduler/mod.rs", "contains": "错过 03:00" }
}
```

语义（`producerLive()` + `classify(..., { verify })`）：

- 条目**被打中** ⇒ 与 producer 无关，照常"已登记"（对照组，防"挂了锚点就永远不算未命中"）。
- 条目未打中且有合法 producer ⇒ 进 `held`，打 `ℹ [条件型豁免未触发] … 生产者仍在 <file>（锚点已核）`，
  **不判红也不静默**，`--retire-stale` 不会碰它。
- 验证不了（`file` 读不到 / `contains` 在源码里找不到 / 没有 producer）⇒ 照旧按未命中红，
  并把失败原因写进那条打印（"取不到"不得读成"没问题"，前言 ⑧ 同族）。
- `producer` 形状坏了（非对象 / 缺 file / 锚点空串 / 锚点非字符串）⇒ `loadAllowlist` **抛**。
  空串锚点尤其致命：`text.includes('')` 恒真，等于给这条豁免永久免疫。

自检从 46 条到 **68 条双向**（注入桩判分叉逻辑、真函数判文件读取、临时允许表判装载形状、
外加两条**真实树上的正控**：两个锚点必须在真源码里找得到——锚点写错就是废条目）。
变异证伪实测：把 `contains` 改成一个不存在的串 ⇒ `未命中 1 / held 1 / EXIT=1`，另一条不受影响；
还原后 `diff -q` 逐字节一致。

同一条锚点也给了本轮新登记的 `sqlx::pool::acquire` 慢获取 WARN（`producer` =
`stepby-axum/src/db/pool.rs` 的 `.acquire_timeout(`）：池还在构造，这条遥测就还有可能再来。

### 3.98 陈旧判据红了怎么定性：采集面的 crate 边界与两枚 exe 的逐字节对账（b86 固化）

`build-freshness.mjs` 的后端那一腿现在扫的是**链进同一个 exe 的全部 crate 源码**：
`stepby-axum/src/**` + `governance/src/**` + `migration/src/**`（外加两份 sibling `Cargo.toml`）。
补面的起因是实测的：本批收 `sideTheme` 时 `governance/src/lib.rs` 比在跑的 exe 新 **219.5 分钟**，
而判据只扫 `src/` ⇒ 一声不响放行。`:8080` 上那个二进制里的 `governance::CONFIGS`、
`RETIRED_CONFIG_KEYS`、`side_theme_normalize_sql()` 都是产种子 SQL 的生产码，不是"另一个 crate 的事"。

**红了之后先定性，再决定要不要重跑轮**（重跑一轮 deep + main 是 90 分钟量级，判据本身回答不了"这次改动进没进码段"）：

```bash
# 1) 留住旧 exe（重启会覆盖 target/debug/stepby-axum.exe，先拷走）
cp stepby-axum/target/debug/stepby-axum.exe /tmp/exe_old.bin
# 2) 停 :8080（Windows 不允许覆盖正在运行的 exe，cargo 的 link 步会 access denied）
powershell -NoProfile -Command "Stop-Process -Id <8080 的 PID> -Force"
# 3) 重建 + 重启（启动器负责 STEPBY_BACKEND_LOG 留痕）
cd stepby-axum && cargo build -j 4 --bin stepby-axum
STEPBY_BACKEND_LOG=logs/<本轮>_r2.log node start-backend.mjs
# 4) 逐字节对账两枚 exe，看差异落在哪些区间
python - /tmp/exe_old.bin <<'PY'
import sys
old=open(sys.argv[1],'rb'); new=open('stepby-axum/target/debug/stepby-axum.exe','rb')
groups=[]; i=0
while True:
    a=old.read(1<<20); b=new.read(1<<20)
    if not a: break
    for j,(x,y) in enumerate(zip(a,b)):
        if x!=y:
            off=i+j
            if groups and off==groups[-1][1]+1: groups[-1][1]=off
            else: groups.append([off,off])
    i+=len(a)
def ctx(f,o):
    f.seek(max(0,o-45)); return ''.join(chr(c) if 32<=c<127 else '.' for c in f.read(110))
for g in groups:
    print(f'@{g[0]}..{g[1]} ({g[1]-g[0]+1}B)'); print(' 旧:',ctx(old,g[0])); print(' 新:',ctx(new,g[0]))
PY
```

读法（b86 实测就是这一例）：**7 个区间 / 28 字节 / 109,324,288 = 2.56e-07**，内容分别是
PE TimeDateStamp、内嵌 `build_ts=…` 的十进制位、RSDS/PDB 的 GUID+age 与几处指向时间戳的指针——
**`.text` 一字节未变** ⇒ 那次"比 exe 新"的改动是**测试码**，权威轮测的确实是同一份生产码。
差异若落在码段（区间多、字节数以 KB 计），结论反过来：先前那几轮不含这些改动，必须重建后复跑受影响套件。
两条证据要**互相印证**，不要只靠字节数：本轮另有一条独立证据是 F45 的"平台旋钮真实生效"判据
在旧 exe 上就已通过（`_tmp_b86_f4572.log:52`），说明治理行为当时在场。

同一条纪律在**悬挂提交核对**上也用了一次（见 AGENTS 前言 ㉔）：判"stash 里的内容有没有着落"时，
参考集合用 `git log --branches --tags --full-history -- <path>`，**不要用 `--all`**——
`git stash` 会把备份挂到 `refs/stash`，`--all` 连它一起收进集合，于是"从未提交"被读成"已着落"。
配套两条夹具正控（临时仓，别在真仓里造）：A 内容从未提交 ⇒ 必须报"无着落 1"；
B 同一内容随后提交但被 prettier 重排 ⇒ 必须报"无着落 0"。A 第一次没红，才把 `--all` 换掉。

同一套"先归因再动手"也用在 `action-inventory` 的逐页分母上：某个动作键从 12 个降到 7 个，
判据只报"变少了"，报不出"为什么"——而降分母最常见的成因是**该页本轮 0 行**（行内动作挂在数据行上，
数据没了动作就没了），这与"覆盖率变好"在纯计数上同形。现在每页的差分行同时带
`本轮该页 rowCount` 与空态文案，命中"0 行 + 空态"时打印
`（本轮该页 0 行、空态「暂无数据」⇒ 行内动作随数据消失，分母在缩，不等于覆盖率变好）`。
b86 实测：`/system/msg/channel` 的动作数 12 → 7 → 12（第三轮该页回到 3 行），
三次都是数据态决定，一次也不是代码决定。

### 3.99 变异还原会把 mtime 推到产物之后：两种后果与各自的正确动作（b87 实测）

`cp x.py.orig x.py` 式的"逐字节还原"只还原**内容**，不还原**时间**。产物新鲜度闸
（`build-freshness.mjs::staleFrontendSources`）判的是 mtime，于是还原后的第一件事往往是
`[FATAL] 产物陈旧：… 首推 src\views\system\user\index.vue（比产物新 152.9 分钟）`——
而那句里的文件字节与产物里的对应代码**完全一致**。b87 实测两次踩中（对
`src/api/system/config.ts`、`src/views/system/user/index.vue` 各做一次盘上变异后还原）。

两种后果要分开处理，别混成一条：

1. **只是被自己的还原动作推晚** ⇒ 正确动作是 `cp` 之前先记下原 mtime，还原时一起复原：
   ```bash
   stat -c %y src/api/system/config.ts        # 记下
   touch -d "<原 mtime>" src/api/system/config.ts   # 还原内容后再执行
   ```
   做不到（已经忘了记）就重建产物——重建不是妥协：`__BUILD_TIME__` 被 vite 打进
   入口 chunk（`vite.config.ts:84/100`），所以**每次重建入口 chunk 的文件名必然变**，
   这不是"生产码变了"的证据；要判"生产码有没有变"照 §3.98 的逐字节法（前端比 chunk 集合，
   后端比 exe 差异区间）。b87 的重建实测：23 个产物文件里 15 个逐字节相同、
   5 个同路径不同（`index.html`/`sw.js*` 这类含时间戳或预缓存清单的）、入口 chunk 换名——
   形状与"`__BUILD_TIME__` 变了而码没变"一致。
2. **真陈旧**（确实改了 `src/**` 没重建） ⇒ 按 §1/§2 的顺序重建：
   `build:embedded` → 立即拷入 `stepby-axum/frontend-dist/` → `build:prod` 留在 `dist/`。
   顺序搞反会让 :4173 用同源 baseURL 请求 `/getRouters` 命中 SPA fallback，登录后跳 `/500`。
3. **Rust 侧的变异还原必须反过来做**（b88 台账 §13.7 实测）：上面那条 `cp -p` + `touch -d "<原 mtime>"`
   在 Rust 上是**反效果**——cargo 的增量判断同样读 mtime，把 mtime 拉回产物之前等于告诉它
   "源码没变，不用重编"，于是接下来那把 `cargo test` 跑的是**上一次编译的变异体二进制**，
   红在一句磁盘上早已不存在的缺陷上（b88 现场：整跑红在 `不该回收的被回收了：mtime 取不到` 那条用例，
   而 `mod.rs` 里写的是 `None => false`；我第一时间以为是新判据不稳，差点对着它去改判据）。
   正确动作：**内容 `diff -q` 逐字节还原 + `touch` 到当下**，让 cargo 必然重编；
   下一把真的花掉编译时间（本轮实测 `Finished … in 5m 47s`）就是"确实重编了"的证据。
   两条纪律方向相反并不矛盾，根因是**同一个 mtime 在两个判据里角色相反**：
   `build-freshness` 读的是"src vs 产物"（src 变新 = 要重建），cargo 读的是"src vs target/"（src 变旧 = 不用重编）。
   所以写还原配方时必须问一句"这份 mtime 会被谁来读"。

顺带一条**取证用途**（b86 §16 用它反证过）：段首预检打 `新鲜且服务一致` 本身就是证据——
它证明那一刻所有 `src/**` 的 mtime 都早于产物，于是"某次源码改动早于那次构建"可以被
后来跑批的预检行坐实，不必靠人回忆改码顺序。

### 3.100 行内动作面覆盖率：分母来自基线，不来自本轮 DOM（b87 项 5）

`action-inventory.mjs` 的 `coverage` 是"本轮扫到的动作里覆盖了几个"，而**行内动作
（修改/删除/测试…）只在有数据行时才存在于 DOM** ⇒ 一页本轮 0 行时分子分母一起缩，
`coverage` 仍然 100%。§3.98 之后那条归因提示只解决"看得懂为什么变小"，不解决
"数据没了被读成质量变好"。现在多一栏判定：

- 基线新增 `rowPerRoute: { 路径: { t, c, r, e } }` 与 `rowSurfaceCoverage`；
- 判据 `rowSurface(基线 t 之和为分母, 本轮覆盖数为分子、按基线 t 封顶)`，`--gate` 与
  `--update-baseline` 共用同一个 `rowRatchetRegressions`；
- 退步文案逐页点名，并把两种成因分开写：该页本轮 0 行 ⇒"需要给这一页配数据夹具或用例"；
  仍有数据行 ⇒"控件被删或用例文案变了"。照着提示做，动作是补覆盖面，不是改阈值。

**读数必须轮询到落定，不得"固定 sleep 看一眼"**（b87 收口期实测的自曝）：
同一份产物、同一份库，`/system/msg/channel` 曾被连跑两把分别读成 **0 行/7 动作**与
**3 行/12 动作** ⇒ 行内动作面的**分母**自己抖（56 与 59）。诊断脚本证明服务端一直返回
`total=3`（`GET /system/msg/channel/list?pageNum=1&pageSize=10` ⇒ 200 / 3 行），
坏的是采样时机：原来 `goto(domcontentloaded)` 之后固定 `sleep(1400)` 再采样，
列表慢于 1.4 秒时读到的是 el-table 的"暂无数据"。
现在的形状：`settleVerdict`（连续两次 `(rows, loading)` 相同且无遮罩 ⇒ 落定；
**真空表算落定**，那是合法的 0 行）+ `waitTableSettled(8000ms, 250ms)` 轮询，
每页把 `{settled, settleMs, settleReason}` 写进凭证，
**任一页未落定 ⇒ `[FATAL]` + EXIT=2（UNRUN）**，且排在内容比对之前（禁则 ⑨）。
换这把尺的连带后果：同页多扫出 5 个动作 ⇒ `backlog 46 → 50`，旧尺写的基线会把
"扫出了更多面"判成退步。因此基线带口径戳 `sampling: 'settled-poll-v1'`，
缺戳 ⇒ `baselineShapeGaps` 点名 `sampling` ⇒ `--gate` UNRUN、`--update-baseline` 走口径迁移。
**结论：判据换形必须与重生成基线同批**（与 `metric`/`sources` 同一条纪律）。
配方同 §3.60.6（"判据不得与环境耦合"的第四例：这一例脏的是**分母**）。

```bash
node action-inventory.mjs --selftest        # 含"0 行必须判退步"与"纯工具栏页不得算缩水"双向
node action-inventory.mjs --update-baseline # 旧格式基线走"口径迁移"通道落盘（缺栏≠退步）
node action-inventory.mjs --gate            # 缺 rowPerRoute 栏 ⇒ EXIT=2（UNRUN），不是 EXIT=1
```

刻意**不**做成"0 行就 UNRUN"：实测 56 页里 17 页本轮就是 0 行（`/user/profile/*`、
`/monitor/cache` 等），那样装的闸第一轮就变成每轮必红，结局是被人去改阈值——
本仓对这一族的定论是"判据不能由环境决定绿红"。棘轮只许升，所以"给空页补数据"是唯一
能让这一栏变好的动作。

### 3.101 console 状态码豁免：第五张登记表 + 命中账 + 「兜底不得成主通道」的证据通道（b88 项 N-4）

```bash
node console-allowlist-audit.mjs --selftest   # 27 条双向（装载 9 + 判定 12 + 正控/反证/自证 6）
node console-allowlist-audit.mjs --gate       # 读 screenshots/deep-e2e-console-exemptions.json
node console-allowlist-audit.mjs --retire-stale   # 只删本轮一次都没命中的条目（表头 version/note 一起写回）
```

`deep-e2e` 判"这条 console 的 4xx 是不是设计内噪声"的清单原先是源码里的内联字典：31 个 URL 前缀、
**一条理由都没有**。b87 ㉘ 的"逐条自足理由"纪律当时收了四张表，这是第五张。外置的三条硬要求：

1. **每条带 `why`**，判据与另四张表共用 `producer-kit`（下限 12 字符、禁"同上/见上/如上/如前/同前"、
   同表不得有逐字相同的理由）；装载即校验，坏在装载就抛 ⇒ `deep-e2e` 启动预检多一条（排在验证码之前）。
   不要把它写成运行期的"跳过"：`page.on('console')` 回调里抛出的异常会被事件循环吞掉，
   于是表坏了的表现是"该模块所有 4xx 一律判红"，把人支使去**往表里加条目**——那正是把判据改掉。
2. **结构性遮蔽**：匹配是子串语义、取该状态码列表的第一条命中 ⇒ 同状态两条 URL 互为子串时，
   靠后那条**永远**轮不到。这类条目不报错，只每轮"未被使用"，所以在装载时就判掉。
   实测本批真表：31 条 / `401:11 403:7 400:7 404:6` / 最短理由 51 字符 / 重复组 0 / 遮蔽对 0

**收口之后还要做的两件事（b88）**：

1. **零命中条目走退役通道，不是登记成"长期豁免"**：`--retire-stale` 之后真表 31 → **11** 条，
   而权威轮的断面是 `命中条目 11 / 条目命中合计 16 / 主通道 16 / 整页兜底 0` ⇒ **留下的 11 条恰好是整轮
   唯一被真实命中的那些**。退役的 20 条必须在台账逐族写明为什么不再可能（b88 的三族：b86 `clearSession`
   把"清 token 时还有认证链在飞"这条竞态消灭、b87 项 9 把 25 处占位 API 清零、b88 项 C 把会话过期改成
   带 `httpStatus` 标记的单一通道），否则下一批会把"表变小"当成异常去补回来。
2. **条数下限不得是记住的数字**：`--selftest` 原先写"登记表 ≥25 条必须成立"，于是它**与本工具自己的退役
   通道顶死**——退役 20 条之后自检当场红在"只有 11 条"，而 11 才是事实。判据换成与事实的关系：
   **上一轮真实命中过的每个 id 都必须在册**（读 `screenshots/deep-e2e-console-exemptions.json`）；
   没有数据集时这一支不参与判定，下限由"四个状态档齐 + 逐条自足理由"承担。
   ⇒ 通用形状：**"数量不得低于 N"这种判据，N 必须由本轮事实或结构约束派生**；写死一个 N 的锁，
   第一次生效的动作就是把合法收紧判成回归（前言 ⑯(b)、㉘）
   （状态分布与外置前逐档同数，这是"迁移没改语义"的对账）。
3. **命中必须留痕**：条目级计数 + 「逐条主通道 ownUrl」「整页集合兜底 setFallback」分开计数，
   由 `runner.mjs` 与 reqstats / 点击数据集同轮窗口落盘；`--gate` 判四件事：
   零命中条目（并给退役通道）、命中账出现表外 id、ownUrl 一次没用而兜底在用（b87 那句
   "兜底不得变成主通道"从承诺变判据）、条目命中合计 < 被放行消息数（账不平 = 采集面自失效）。
   数据集缺失 / `full!==true` / 窗口反向 / 模块没跑全 / 旧格式缺 `entries` 快照 / 通道计数非数字
   ⇒ 一律 **EXIT=2 UNRUN**，不得读成"本轮没有噪声"。

`e2eCwdPath` 守卫扫到 91 个 `.mjs` 全锚脚本位置；临时夹具目录要先 `mkdirSync(recursive)`——
新克隆的仓里 `_tmp/` 不存在而 `mkdtempSync` 不替你建父目录，否则自检会以 ENOENT 崩死
（fail-closed 有了，但"红在哪条"这条信息会丢）。
M5 那次变异就是这个形状：摘掉"数据集缺失 fail-closed"后自检直接抛 TypeError，EXIT=1 却没有用例点名。

### 3.102 列表「加载失败」与「暂无数据」的分形配方（b88 项 D + M93）

```bash
node deep-e2e.mjs --feature=93    # 单模块复验（需先重建产物并重启 :8080）
```

缺陷形状：列表请求失败 → 拦截器弹一次 toast → 消失后组合子的 catch 把失败吞成空列表 →
屏幕上只剩"暂无数据"，与"真的没有数据"同形。修法两处：
`useCrudTable` 增 `loadError`/`retryLoad`（置真置假都必须在既有的 `currentRequestId === listRequestId`
版本号守卫**之内**，否则旧请求的迟到响应会改写新态），空态模板收进唯一实现
`src/components/ListEmpty/index.vue`；静态侧由 `src/utils/listEmptyLoadError.guard.test.ts` 钉接线。

浏览器那一半（M93）的四条判据形状，逐条对应一种"实现可以怎样蒙过去"：

| 判据                                                   | 蒙过去的实现                                 | 反证材料                    |
| ------------------------------------------------------ | -------------------------------------------- | --------------------------- |
| 93.1/93.2 失败态显示"加载失败"且**不得**显示"暂无数据" | 失败仍落空态                                 | 轮询到落定 + 耗时进凭证     |
| 93.3 重试确实重发请求                                  | `click()` 返回成功但没落地（遮罩/禁用/漂移） | **请求计数增量 > 0**        |
| 93.4 故障未撤时重试后仍是失败态                        | 重试被写成"无条件标成功"                     | 空态文案回读                |
| 93.5 撤故障后重试即恢复真实数据                        | 失败态一旦置真就永不消失                     | 数据行数 > 0 且失败文案消失 |
| 93.6 合法空结果仍显示"暂无数据"                        | **空列表即失败**（与缺陷同样严重）           | 深链不存在的 `postCode`     |

两个坑记下来：

- 注入故障要用 **HTTP 200 + `body.code=500`** 的业务失败，不要用 HTTP 500——后者会让 Chromium 打
  `Failed to load resource … 500` 的 console 错误，把"自己注入的故障"变成模块的 console 判红源，
  归因方向就错了。业务码失败走的是同一条前端 reject 通道，零 console 噪声。
- `page.unroute` 必须传**同一个谓词引用**：换一个等价的新箭头函数删不掉原处理器，
  注入会一路跟着这个页面。同理不要在同一个谓词上 `route()` 两次（会叠处理器）。

---

### 3.103 表格与 tab 读数的"落定"尺：v3 = 请求静默 + 稳定窗口（b88 项 G）

**要判的事**：`action-inventory` 的行内动作面分母（`rowPerRoute.t`）与逐 tab 动作采集，都必须读在
"这页不再变了"的时刻；读早了就是 b87 ㉗ 那一族（分母随数据/时机漂移），读晚了就是白等 56 页。

**三条命令**：

```bash
node tests/e2e/action-inventory.mjs --selftest        # 落定 13 + 接受 13 + tab 标签 6 + 反查 14（条数由 actsynth 自打）
node tests/e2e/action-inventory.mjs --update-baseline # 先比后写；口径戳变了走"迁移通道"
node tests/e2e/action-inventory.mjs --gate            # 与基线逐页对账
```

**接受条件（v3，`settled-poll-v3`）**——三个量各挡一种自欺，缺一不可：

| 量                        | 取值                  | 挡住的是什么                                                                                                                                                      |
| ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 距最后一次 XHR/fetch 事件 | `≥ QUIET_MS`(1200ms)  | "还没回"读成"没有"。**不用** `inflight === 0`：导航期被 abort 的请求永不 `finished`，实测把 `/system/user` 用"在飞 1"钉满 20 秒，而 76 拍里 74 拍都是 `行 2 表 1` |
| 同一读数维持时长          | `≥ STABLE_MS`(1500ms) | "网络静默"读成"DOM 终态"：Vue 渲染排在响应之后，实测 518ms 那一轮静默够久、两拍相同，第三拍仍从 `行 0 表 0` 变 `行 2 表 1`                                        |
| 可观察性                  | 有表或有显式空态      | 什么证据都没有的"一致"；两者皆无时只能等预算走完，而走完仍不落定 ⇒ **UNRUN**，不冒充终态                                                                          |

两条口径纪律：**只比最后两拍**（`settleVerdict` 原先扫全部样本取"第一对相等"，开局两拍都"什么都没有"
被当成终态）；**只数 `xhr|fetch`**（本仓布局常驻 WebSocket，WS 只在关闭时 `finished` ⇒ 计入就永远不静默）。

**同一把尺必须套到 tab 标签上**（`waitTabLabels`）：EP 的 `.el-tabs__item` 在挂载后 +1.6s 才补齐，
`/monitor/cache` 落定时只有 1 项 ⇒ `tabs.length > 1` 不成立、另外两个 pane 的按钮从没被采到过、
整页报"动作 0"并**照常落进基线**（分母就此缩掉）。tab 点击还有遮罩问题：首启引导在 +1.6s 才挂载，
而跑批在 +0.6s 收过一次 ⇒ **每次按下前重收遮罩 + 失败重试一次 + 仍未落地即点名 UNRUN**
（`.catch(() => false)` 把"没点到"洗成"没有动作"，正是前言 ⑭ 的形状）。

**五条 UNRUN 通道**（全部排在内容比对之前，前言 ⑨）：读数未落定 / 兜底通道占多数 / tab 按两次仍未落地 /
落定与随后采集自相矛盾 / 跨口径基线。其中"自相矛盾"那条的判据形状要说清，它自己红过两次：
第一版拿 `collectActions` 的 `columns/rowCount` 当"这页有表"的证据 ⇒ 误报 8 页（那个通道**不看可见性**，
未渲染子树的 `innerText` 按规范回退成 `textContent`，隐藏 pane 里的表头也算"有表头"）；
第二版只看"落定时可见表 0 张 → 随后 >0"⇒ 把**本判据自己点开 tab 造成的变化**判成尺坏。
终版要求"落定时 DOM 里连一个 `.el-table` 都没有（`tablesAll=0`）而随后采到可见表 + 可见行"。

**跨轮数字变了怎么定性**（本批 387 → 406 的实例）：逐页差集 + 通道戳。九页涨的是 tab（`/user/profile/*`、
`/monitor/cache` 等，合计 +13），两页跌的分别是"跨 tab 同名去重"（`/tool/build`）与"iframe 不受主文档
静默约束"（`/tool/swagger`）——后者是真缺口，登记为 N-H 而不是把较小的数签成基线。
**换尺必须与重生成基线同批**（前言 ⑩），且 `rowPerRoute` 相对旧口径逐页 0 处变化要写进台账：
那是"换尺没有顺手变成换判据"的唯一证据。

**反查生效路径的判据读全文时，清单自己必须被掩掉**：`maskNeedleLines()` 剔行首 `needle:` 行与注释行
（行中的 `{ t, needle }` 不剔），配四条合成双向正控。起因是"只活在清单上的 needle 会匹配到自己那一行"，
实测把某条 FATAL 文案改名之后旧 needle 在正文里一处都没有，反查却照常放行（前言 ⑬ 的第三个断面）。

---

### 3.104 判据调用生成器必须走它声明的启动通道（b88 项 N-6）

`ts_export_audit.py` 的 D 腿（同名类型正文逐字比对）第一次真跑报出 **72 个漂移，全是 `number` ↔ `bigint`**——
看着像"前端契约全陈旧"，实际是判据自己坏了：旧实现直接执行 `target/debug/export_ts.exe`，而
`.cargo/config.toml` 的 `[env] TS_RS_LARGE_INT = "number"` **只在经 cargo 启动子进程时才注入**。

```bash
# 正确通道（与开发者用的 cargo ts 同一条；TS_RS_EXPORT_DIR 由脚本显式塞，cargo 的 [env] 默认 force=false ⇒ 已有变量优先）
cargo run --bin export_ts
```

配套的第二条腿：**`[env]` 声明与产出形态必须对账**——声明 `number` 而产出含 `bigint` ⇒ 硬失败，
并在文案里写明"这是判据自己的输入坏了，不得据此判前端契约陈旧"；`--selftest` 配双向，
其中"配置根本没声明这一档"时不得拦。变异证伪两侧都做：手改 `UserVo.ts` 一个字段 ⇒ 点名那一行两侧文本；
**只改 Rust 一行文档注释**（不动字段）⇒ 也点名，证明端到端通道真通了。

与前言 ⑰ 同族而方向相反：⑰ 是"把工具链的排版决定当事实"，这里是"把自己缺失的启动环境当事实"；
共同修法都是**先让判据证明输入形状对**（⑬）。

### 3.105 环境性网络中断 ⇒ 本轮**不作数**（第三种结局，b89 项 15）

跑批时最常见的"假缺陷"是主机自己把网络栈抽走了：`net::ERR_NETWORK_CHANGED`、
`ERR_INTERNET_DISCONNECTED`、`ERR_CONNECTION_RESET`（Wi-Fi 漫游、VPN 切换、适配器休眠）。
这三类**既不是产品红、也不是"跑干净"**，唯一诚实的结论是 UNRUN（EXIT=2）：
登记进允许表 = 给用户真实遭遇的一次失败配永久豁免；判 EXIT=1 = 把人支使去补登记。

```bash
# 分类器自身的双向自检（条数由脚本自打，文档不抄）
node tests/e2e/e2e-env-abort.mjs --selftest
```

接线点六个文件（缺一处就有一路中断被洗成"0 失败"）：`e2e-env-abort.mjs`（分类器本体，`ENV_ABORT_KINDS`）→
`deep-e2e.mjs::checkConsoleErrors`（❌ **保留**，只在凭证行补"其中 N 条属环境性网络中断"）→
`e2e/run/runner.mjs`（轮末打 `🛑 本轮不作数`、把 `envNetworkAbort` 写进 `deep-e2e-reqstats.json`、
**不得改动 SKIP 棘轮基线**、`return 2`）→ `dataset-window.mjs::assertFullRun` 第四道判据（缺该字段 = 旧格式 ⇒ 拒；
`> 0` ⇒ 拒，"这是复跑一轮的活"）→ 下游 `request-storm.mjs` / `endpoint-coverage.mjs` 的夹具与用例同步。
载体：`run-gates.py` 的 `envabortsynth` + `ci.yml` 的 `doc-gates`。
**拒连（`ERR_CONNECTION_REFUSED`）刻意不在这三族里**——它归"登录失败连击"那条通道，
两条通道不得互顶（谁都能认领 = 谁都不认领）；把拒连洗成 UNRUN 等于把"后端没起来"藏起来
（前言 ⑥ 的"取不到不得读成没有失败"同族）。

### 3.106 门禁清单的结构对账：自检**不能替换**本体（b89 项 12 + 前言 ㊳）

给判据补 `--selftest` 载体时，正确动作是**在下面加一行**，而不是把本体那一行**改写**成自检行。
本批实测踩过：五把本体被替换后整轮不跑，而五条新自检条条绿，汇总照打 `PASS 75 / FAIL 0`——
"少跑了"这件事**不产生红**，只能由清单对账抓。

```bash
python scripts/run-gates.py --selftest   # 28 条双向，含"真实清单当前成立"这条正控
python scripts/run-gates.py --count      # 条数只能由 GATES 给，文档那一行由 docnum 对账
```

`manifest_gaps()` 三查（真跑路径把它排在一切执行之前，⑨：口径闸先于内容闸）：
① 每个脚本要么有**不含 `--selftest` 的本体条目**，要么进 `SELFTEST_ONLY` 表带**自足理由**登记"这条判据没有结论可跑"；
② 登记过之后又出现本体条目 ⇒ 豁免该撤（与 b85 那张"未命中的豁免必须报撤销"同一取向）；
③ `LIVE_DB_GATES` / `BROWSER_GATES` 的每个名字必须是真实条目。
有缺口 ⇒ `[FATAL] 门禁清单有结构缺口 ⇒ 本轮不作数` + 非零（清单坏了是**有缺陷要修**，不是"没跑"的 UNRUN）。

附带两条本批实测：合成夹具的脚本名**不要带目录前缀**（拼成 `scripts/` + 假名会被 `recovery_gap`
的引用悬挂判据当成真实路径报"未定性"）；取退出码一律 `cmd > log 2>&1; rc=$?`，
**不在管道右侧取码**（`… | tail -4; echo $?` 拿的是 `tail` 的码，本批自己踩了两次）。

### 3.107 动作面采集作用域必须是路由页面容器（b89 收口，口径 `page-scope-v4`）

`action-inventory` 的"这一页有几个动作"要由 DOM 作用域定义，而旧写法
`document.querySelector('.app-container') || document.body` 里那个类**只有部分视图在用**
（定义在 `src/assets/styles/index.scss:139`，`src/` 实测 64 个文件 / 68 处命中）
⇒ 兜底**恰好在没有它的那几页生效**，那几页等于在整份文档上采集。
全站壳层（`layout/index.vue:25-29` 的 `.fixed-header`：环境横幅 + 公告横幅 + navbar + tags-view）
于是被逐页计入——实测 `/tool/swagger` 的两条 backlog 全是横幅按钮 `关闭该公告提示`，
而分母随**公告发布状态**漂移（不是数据行没了，是全局控件冒出来了）。

⚠ **配方第一版把成因写成"那个类在本仓布局不存在"，那是错的，错法值得单独记**：
证据是一条 `grep -rn "app-container" stepby-vue/src/` 的**空 stdout**，而那次 cwd 是 `stepby-vue`
⇒ 路径不存在，grep 退出码 **2（No such file or directory）**而不是 1（没有命中）。空 stdout 有两种成因，
只看输出流就把"我没扫到"读成"它不存在"（§3.55/§3.64 那一族，新增一面：**取证命令的退出码也是证据**）。
正确的量法是在跑批断面里探一次——一次性 Playwright 探针（登录 → 逐条路由 → 读 `.app-main` 内是否有
`.app-container`，跑完即删、不进任何门禁清单）实测：**56/56 页取到 `.app-main`**，
`.app-main` 内没有 `.app-container` 的恰好两页 `/tool/build`、`/tool/swagger`（整份文档也没有，`doc=0`）
⇒ 缺陷范围与"净 −2 动作、两条都是横幅按钮"逐页对上。要复现这个数，把探针脚本放在 `tests/e2e/` 内
（`import` 才能按 `./route-list.mjs` 解析；放仓根就会造出代码级悬挂引用，`recover` 会当场点名——本批踩过）。

```bash
# 换尺后的两把，必须同数（写基线 → --gate）
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node tests/e2e/action-inventory.mjs --update-baseline
STEPBY_TEST_USER=admin STEPBY_TEST_PASS=admin123 node tests/e2e/action-inventory.mjs --gate
```

三条纪律：
① **口径戳必须与重生成基线同批**——`INVENTORY_SAMPLING` 不同则 `baselineShapeGaps` 判 `sampling` 缺栏 ⇒ UNRUN，
不得由内容棘轮去吸收换尺（b87 立的通道，本批走的就是它）。
② **换尺的合法性由"承诺面不变"作证**：本批 `totalActions 406 → 404`（减的是两条横幅噪声）、
`backlog 46 → 44`、覆盖率回 100%，而 `rowPerRoute` 的 `Σt=Σc=59` **逐页 0 处变化**——
"分母来自承诺"那一栏一动没动，才敢说这不是顺手放宽。
③ **作用域取不到只能 UNRUN**：`collectActions` 缺 `.app-main` 时交回 `{scopeMissing:true}`，
Node 侧 `pageScopeFailure` 把"缺容器 / evaluate 抛错被收成 `null` / 形状对不上"三类都判坏，
而**合法的空动作页不得判坏**；口径闸排在落定闸之前（比"没落定"更底层——那至少还读了 DOM）。

⚠ 反查型判据的锚点**不能由判据自己的字面量供给**：本批第一版把
`pageScopeAnchor = "document.querySelector('.app-main')"` 写成常量，于是"文件里提到过"恒真，
变异（改回旧形状）**跑绿**。修法是锚点用拼接得到 + 检查范围收窄到 `collectActions` 函数体
（边界取"下一个顶格 `}`"，且不用哨兵定位尾部，因为哨兵本身就是被测对象）。

### 3.108 执行完整性只有一份实现：click / console 也必须走 `executionCompletenessGaps`（b95）

**立的案**：`endpoint-coverage` / `request-storm` 早已用 `assertFullRun` 判四件事（`full`、
计划=入场、零判定模块、整轮环境性断网），但 `click-failure-audit` 与
`console-allowlist-audit` 各自只判了 `modulesPlanned === modulesAttempted`。这不是"少判一条"，
而是把两个判据的**结论面**交给了一条会假绿的数据集：

- "进了模块却一条判定都没有"的空跑轮，在数据集里与干净轮同形；
- 整轮环境性断网（b89 实测 15720 条 `ERR_NETWORK_IO_SUSPENDED`）期间的"没有失败"是"没跑到"，
  同样与干净轮同形；
- 而这两个判据的结论恰恰是"0 条未登记点击失败"/"0 条未豁免噪声"。

**落法**（单一实现 + 各消费方自证）：

1. `dataset-window.mjs::executionCompletenessGaps(dataset, label)` 返回**全部缺口**（不是抛第一条）；
   `assertFullRun` 只负责把缺口拼成 Error，签名不变。
2. deep 的 click / console 数据集由 `runner.mjs` 补齐 `modulesWithZeroVerdicts` / `envNetworkAbort`；
   main 的 click 数据集由 `main.mjs` 补齐四个字段。main 的两条语义要点：
   - `full` 必须排除 `--shard`（分片是子集，且分片轮只写 `main-clickfails.incremental.json`，
     不得顶替全量主文件）；
   - `modulesAttempted` 必须由事实算（`选中功能数 - 零判定功能数`）；写成"等于计划数"会让
     `planned===attempted` 这道闸恒真。
3. 两个审计脚本改为 `fatal.push(...executionCompletenessGaps(...))`，删除各自的单条判据。
4. 自检双向：`click-failure-audit --selftest` **34 条**（新增提前终止 / 零判定 / 环境断网 /
   旧格式缺字段 + 全零放行对照）；`console-allowlist-audit --selftest` **30 条**（新增零判定 /
   环境断网 / 旧格式缺字段）。缺字段必须 UNRUN，不得读成"本轮干净"。

```bash
node tests/e2e/click-failure-audit.mjs --selftest
node tests/e2e/console-allowlist-audit.mjs --selftest
node tests/e2e/click-failure-audit.mjs --gate
node tests/e2e/console-allowlist-audit.mjs --gate
```

⚠ 换这条判据后，**旧的 click/console 数据集一律 UNRUN**（缺四个字段）——这不是回归，
是"旧断面证不了跑完"。必须重跑一轮 main 全量单轮 + deep 全量单轮再判；分段轮不得用来重生成基线。
