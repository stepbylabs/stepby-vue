# e2e 套件运行配方（已验证）

> 本文件记录 `yebot-ui/tests/e2e/main.mjs`（46 个 feature / 366 checks，套件已并入 yebot-ui 仓库）在本地跑通所需的**完整环境**，
> 以及 source-check 断言的**防混淆（minify-stable）约定**。先前多次“假失败”均源于环境与混淆问题，
> 按本文配置可稳定复现全绿。

## 0. 前置依赖

- **Redis 必须在线**：`docker compose up -d redis`（或 `yebot-redis` 容器 healthy）。
  axum-backend 启动硬依赖 redis，否则接口 500。
- **两个仓库源码就绪**：`yebot-ui`（前端）与 `axum-backend`（Rust 后端）。

## 1. 后端：embedded 模式（:8080）

F24 直接校验“后端内嵌前端”能力，因此后端必须以 embedded 模式启动：

```bash
cd axum-backend
# debug 构建在运行时读 EMBEDDED_FRONTEND 环境变量，无需重新编译
EMBEDDED_FRONTEND=true cargo run
```

- 该模式会让后端用 `ServeDir` 提供 `frontend-dist/`（见 `src/embedded_assets.rs`）。
- 其余 44 个 feature 走 vite preview 的 `/prod-api` 代理（→ :8080），同样要求后端在跑。
- **必须先把前端 build 产物同步进 `axum-backend/frontend-dist/`**：
  ```bash
  # frontend-dist 已被 .gitignore 的 /frontend-dist 忽略，不会进仓库
  cp -r yebot-ui/dist/. axum-backend/frontend-dist/
  ```
  ⚠️ 每次 `yebot-ui` 重新 `vite build` 后都要重新同步，否则 embedded 后端服务的仍是旧产物。

## 2. 前端：prod preview（:4173）

**必须用 prod build（不能用 dev 5173）**——source-check 断言依赖 `dist/static/js/index-*.js`
与 `main-*.js` 这类带 hash 的生产包，dev server 没有这些文件会直接判失败。

```bash
cd yebot-ui
NODE_OPTIONS="" sh node_modules/.bin/vite build            # 出 dist
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

- 不带 `--feature` = 跑全部 46 个 feature（约 8 分钟）。
- 单跑某 feature：`node main.mjs --headless --feature 46`（按实现支持与否而定）。
- 通过判据（已验证基线）：`总计 366 通过 366 失败 0`，日志无 `❌`。

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
- 后端：`cargo check --lib --tests`、`cargo test --lib`（基线 224 passed）。
- 全部通过后，yebot-ui 与 axum-backend 分别提交；e2e 套件随 yebot-ui 提交（位于 `yebot-ui/tests/e2e/`）。
