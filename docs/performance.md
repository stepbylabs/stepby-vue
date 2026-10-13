# Stepby 前端性能优化与监控指南

> 覆盖 R102-MISC-001（性能优化 README）、R102-MISC-002（性能监控使用指南）、
> R102-MISC-010（最佳实践）。所有阈值/脚本/配置均为真实可执行项，非建议清单。

## 1. 性能预算（单一事实源：`perf-budget.json`）

预算分两段，全部门禁化：

| 段 | 内容 | 消费方 |
|---|---|---|
| `runtime` | LCP ≤ 2500ms、FCP ≤ 1800ms、INP ≤ 200ms、CLS ≤ 0.1、TTFB ≤ 800ms | Prometheus 告警（`deploy/prometheus/rules.yml`）、节流回归（`tests/e2e/perf-throttle-check.mjs`） |
| `build` | JS/CSS/图片/字体 gzip 体积 + 第三方脚本数 | 构建期门禁（`scripts/check-perf-budget.mjs`），CI 超限即失败 |

### 1.1 构建期门禁

```bash
npm run build:prod          # 构建产物到 dist/
node scripts/check-perf-budget.mjs   # 与预算比对，超限 exit 1
```

- 报告写入 `dist/perf-budget-report.json`（CI artifact 留存 = 体积趋势数据，BUNDLE-004）。
- 首次建立基线可用 `--report-only`；**有意**引入大依赖时，评审后上调
  `perf-budget.json` 并在优化台账登记理由——不要放宽脚本阈值。
- CI 已接入（`.github/workflows/ci.yml` frontend job）。

### 1.2 重复依赖检测（BUNDLE-005）

```bash
pnpm dedupe --check   # CI 同步执行；存在可合并的重复依赖实例时非零退出
```

### 1.3 体积分析（BUNDLE-006 / tree-shaking 效果）

```bash
npm run build:analyze   # rollup-plugin-visualizer → dist/stats.html treemap
```

`vite.config.ts` 已开 `treeshake: true`；结合 stats.html 可核对具名导入是否被
tree-shake（全量 `import *` 例外，见 §4.3 图标说明）。

## 2. Web Vitals 监控（运行时）

### 2.1 采集与上报

- `src/utils/frontendErrorReporter.ts` 用**原生 PerformanceObserver**（零依赖）采集
  LCP / FCP / INP / CLS / TTFB，`source='vital'` 批量上报 `POST {BASE_API}/monitor/frontendError/report`，
  持久化到 `sys_frontend_error`。
- 每条记录带 `deviceType`（mobile / tablet / desktop，按视口宽 <768 / <1024 / 其余推断，FCP-011）。
- 列表页 `/monitor/frontendError` 支持按**设备类型**筛选，做移动端/桌面端独立指标分析。

### 2.2 告警（FCP-010）

`deploy/prometheus/rules.yml` 的 `stepby-frontend-vitals` 组：基于 `sys_frontend_error`
vitals 数据经 metrics 导出后的 `stepby_frontend_vital_p95_ms / stepby_frontend_error_rate`
等指标做退化告警（阈值与 `perf-budget.json` runtime 段对齐）。部署方式见该文件头注释。

### 2.3 错误堆栈还原（SMAP-001~004）

生产构建输出 **hidden sourcemap**（`vite.config.ts` `sourcemap: 'hidden'`）：
产物 `.map` 落盘但 JS 内无 `sourceMappingURL` 注释，浏览器不会自动拉取；
`nginx.conf` / Helm ConfigMap 额外 `deny` 对外提供 `*.map`（fail-closed）。

```bash
# 单帧还原
node scripts/decode-stack.mjs dist/static/js/index-<hash>.js.map <line> <col>
# 整段堆栈还原（从错误详情复制压缩后的 stack 直接管道输入）
cat stack.txt | node scripts/decode-stack.mjs dist/static/js/index-<hash>.js.map --trace
```

本项目使用自建上报（`sys_frontend_error`），未接 Sentry/bugsnag；若未来接入第三方
错误平台，"上传 map" 步骤替换为该平台的 release/upload CLI 即可（map 产物已就绪）。

## 3. 资源加载

### 3.1 HTTP 缓存（nginx.conf / Helm ConfigMap）

- `index.html`：`no-cache, must-revalidate`（带 hash 产物名要求入口每次回源校验）；
- `/static/`（Vite 产物目录）与 `/assets/` 兜底：`public, max-age=31536000, immutable`；
- `sw.js / workbox-*.js / manifest.webmanifest`：禁长缓存（SW 更新可达）；
- `*.map`：deny（见 §2.3）。

### 3.2 预加载与资源提示

- 登录/注册/SSO 同意页背景图 `public/bg-login.webp`（75KB，原 JPG 509KB）在
  `index.html` 以 `<link rel="preload" as="image" fetchpriority="high">` 提前拉取。
- `modulepreload` / 首屏 CSS 注入由 Vite 构建自动完成（`dist/index.html` 实证），不手写。
- 接入 CDN / 第三方域时在 `.env.*` 配置
  `VITE_PRECONNECT_DOMAINS=https://cdn.example.com,https://oss.example.com`，
  构建期自动注入 `preconnect` + `dns-prefetch`（默认空 = 不注入）。

### 3.3 CDN 集成点

- `VITE_APP_CDN_BASE=https://cdn.example.com/`（`.env.production`）→ Vite `base`
  切换，全部静态资源引用指向 CDN（CDN-001/002 集成点）。
- 发布后预热：`node scripts/cdn-warmup.mjs --base https://cdn.example.com`（读
  dist 清单并发 GET，CDN-010）。
- externals（CDN-003~005）：有意不默认外置 Vue/Element Plus/echarts——无 CDN 域名时
  externals 反而增加首屏请求数与第三方可用性风险；需要时在 `vite.config.ts`
  `rollupOptions.external + globals` 自行开启（文档化集成点）。

## 4. 图片与字体

### 4.1 WebP（IMG-011~015/018）

`login-background.jpg`(509KB) → `public/bg-login.webp`(75KB)、`profile.jpg`(79KB) →
`profile.webp`(9KB)、`404.png`(96KB) → `404.webp`(24KB)、`404_cloud.png` → webp(2KB)。
**例外**：`401.gif`（动图）转 animated WebP 后体积反而 160KB → 367KB，故保留 GIF（实测否决）。
原图文件保留于 `src/assets/` 供再生成（转换命令见 git 历史与本文件 §4.2），不再被打包引用。

### 4.2 favicon 多尺寸（IMG-016）

由 `src/assets/logo/logo.svg` 经 sharp 生成：`public/favicon-32x32.png`、
`favicon-16x16.png`、`apple-touch-icon.png`(180×180)，`index.html` 声明齐全。

### 4.3 图标（BUNDLE-002 改判说明）

Element Plus 图标保持全局注册（`src/components/SvgIcon/svgicon.ts`）：
表单构建器图标选择器（`IconsDialog.vue`）真实需要**全量枚举**供用户选择，且菜单/
仪表盘等 `<component :is>` 动态图标名来自配置数据、无法静态穷举；各文件的具名
`import { User } from '@element-plus/icons-vue'` 已被 tree-shaking 覆盖。

### 4.4 字体（FONT-001~007）

项目无任何自定义 Web 字体（系统字体栈 + `font-display` 不适用），全部字体优化项
不适用；字体预算（`build.fontTotalGzipKb: 100`）作为"未来引入字体"的护栏存在。

## 5. 性能回归测试（FCP-006/012/013）

```bash
# 前置：起预览服（NODE_OPTIONS="" sh node_modules/.bin/vite preview --port 4173）
# 或生产环境域名（TEST_BASE=http://prod.example.com）

# 弱网（Slow 3G）+ 弱设备（CPU 4x）节流回归：FCP/LCP 与 perf-budget.json 对齐（节流档放宽倍数见脚本头注释）
node tests/e2e/perf-throttle-check.mjs

# 首屏截图基线像素回归（差异 >1% 失败；有意变更后 --update 重新生成基线）
node tests/e2e/visual-regression.mjs
node tests/e2e/visual-regression.mjs --update
```

> 依赖说明：两个脚本需要 `playwright`（+ `pixelmatch`/`pngjs`），属**本地回归工具**
> （不进 CI、不进 devDeps）。解析顺序：本仓 `node_modules` → `NODE_PATH`（可指向独立
> 安装目录，如 `NODE_PATH=<dir>/node_modules node tests/e2e/visual-regression.mjs`）。
> 浏览器二进制复用 Playwright 默认缓存（`%LOCALAPPDATA%\ms-playwright`）。

## 6. 已知限制（诚实登记）

- **单 chunk**：`codeSplitting: false`（Rolldown v8.1.5 跨 chunk panic bug 的必选
  workaround，见 vite.config.ts 注释）→ 无路由级分包，JS 总体积大；Rolldown 修复后
  移除该选项即可恢复分包（届时 vendor/路由 chunk 自动落入 `/static/` 长缓存规则）。
- MySQL 语句级超时仅覆盖 SELECT（引擎限制，见后端 `config.toml.example` 注释）。
- Web Push / Background Sync / Periodic Sync（PWA-005/006/008）：需要后端推送服务
  （VAPID、订阅存储、推送场景定义），单独做前端 handler 属无后端的假功能——按
  项目准则登记为**集成点待立项**，不在本仓实现半截功能。
