# Stepby UI

Stepby 管理系统前端，基于 Vue 3 + Element Plus + TypeScript + Pinia + Vite 构建，配套后端为 [Axum (Rust)](../axum-backend)。

## 技术栈

- [Vue 3](https://v3.cn.vuejs.org) - 渐进式前端框架
- [Element Plus](https://element-plus.org/zh-CN) - UI 组件库
- [TypeScript](https://www.typescriptlang.org) - 类型安全的脚本语言
- [Pinia](https://pinia.vuejs.org/zh) - 状态管理
- [Vue Router 4](https://router.vuejs.org/zh) - 路由管理
- [Axios](https://axios-http.com/zh) - HTTP 请求库
- [Vite](https://cn.vitejs.dev) - 构建工具
- [Tailwind CSS 4](https://tailwindcss.com) - 原子化 CSS 框架（默认样式实现）
- [Vue I18n](https://vue-i18n.intlify.dev/) - 国际化（中文 / 英文）
- [PWA](https://developer.mozilla.org/docs/Web/Progressive_web_apps) - 离线可用、可"安装为桌面应用/添加到主屏"（`vite-plugin-pwa`）

## 开发命令

```bash
# 安装依赖（推荐 pnpm）
pnpm install

# 启动开发服务（默认端口 5173）
pnpm dev

# 构建生产包
pnpm build:prod

# 预览生产构建
pnpm preview

# 代码检查
pnpm lint          # ESLint 检查
pnpm lint:fix      # ESLint 自动修复
pnpm typecheck     # vue-tsc 类型检查
pnpm format        # Prettier 格式化

# 单元测试（Vitest）
pnpm test          # watch 模式
pnpm test:run      # 单次运行
pnpm test:ui       # UI 模式
pnpm test:coverage # 覆盖率报告

# UI 可访问性测试（HTTP 层 + 资源/源码检查）
node scripts/ui-test.mjs                 # 启动新 dev server 并测试（默认端口 82）
node scripts/ui-test.mjs --port=5173     # 指定端口
node scripts/ui-test.mjs --no-server     # 使用已运行的 dev server
```

## E2E 测试

完整的 Playwright E2E 测试位于 [`../tests/`](../tests) 目录，覆盖 45 个功能特性：

```bash
cd ../tests

# 安装依赖
npm install

# 运行全部测试（需先启动后端 + 前端）
npm test

# 仅运行主题/侧边栏优化测试（功能 45）
npm run test:feature45

# 仅运行主题切换相关测试（功能 35 + 45）
npm run test:theme

# 无头模式
npm run test:headless
```

前置条件：

- 后端启动在 `http://localhost:8080`（SQLite + Redis）
- 前端启动在 `http://localhost:5173`（或通过 `FRONTEND_URL` 环境变量指定）
- `admin/admin123` 账号可用
- 数据库 `sys_config.sys.account.captchaEnabled=false`（关闭验证码）

环境变量：

```bash
# Windows PowerShell
$env:FRONTEND_URL = "http://localhost:5173"
$env:BACKEND_URL = "http://localhost:8080"
# 注意：需在 axum-backend 目录下执行，或使用绝对路径
$env:DATABASE_URL = "sqlite://./data/stepby.db?mode=rwc"  # 后端
$env:REDIS_URL = "redis://127.0.0.1:6379/0"              # 后端

# Linux/macOS
export FRONTEND_URL=http://localhost:5173
export BACKEND_URL=http://localhost:8080
```

> **注意**：首次启动后端前需运行数据库迁移 `cargo run -p migration`（在 axum-backend 目录下），
> 否则 `sys_menu.i18n_key` 等新增字段缺失会导致 `/getRouters` 接口 500 错误。

## 默认登录

账号：`admin`
密码：`admin123`

## 主题系统

### 侧边栏主题模式

通过 CSS 变量统一驱动，支持三种模式：

| 模式     | 值            | 说明                                             |
| -------- | ------------- | ------------------------------------------------ |
| 跟随主题 | `theme-auto`  | 默认。亮色模式用浅色侧边栏，深色模式用深色侧边栏 |
| 强制深色 | `theme-dark`  | 无论亮/暗模式，侧边栏始终为深色                  |
| 强制浅色 | `theme-light` | 无论亮/暗模式，侧边栏始终为浅色                  |

### 核心 CSS 变量

定义于 [`src/assets/styles/variables.module.scss`](src/assets/styles/variables.module.scss)：

- `--sidebar-bg` - 侧边栏背景色
- `--sidebar-text` - 侧边栏文字色
- `--sidebar-logo-text` - Logo 文字色
- `--menu-hover` - 菜单项 hover 背景色
- `--menu-active-bg` - 菜单项 active 背景色
- `--menu-active-text` - 菜单项 active 文字色
- `--navbar-bg` - 顶部导航栏背景色
- `--navbar-text` - 顶部导航栏文字色
- `--navbar-hover` - 顶部导航栏 hover 背景色

### 切换入口

1. **Settings 抽屉**（右上角头像下拉菜单 → 布局设置）：可视化预览图切换 theme-auto/dark/light
   - 头像下拉菜单使用 `trigger="click"` 触发（无障碍友好，支持键盘和移动端）
   - 抽屉内含三个预览图（auto.svg/dark.svg/light.svg），点击即切换
2. **ThemeEditor 组件**（高级主题编辑器）：单选框切换

### 暗色模式切换

- 顶部导航栏主题模式按钮（太阳/月亮图标）
- 快捷键 `Ctrl+Shift+D`
- 设置抽屉中的「主题模式」单选框（亮色/暗色/跟随系统）

## 项目结构

```
stepby-ui/
├── src/
│   ├── api/                  # API 请求层
│   ├── assets/               # 静态资源（图片、样式、图标）
│   │   ├── images/           # 主题预览图（auto.svg/dark.svg/light.svg）
│   │   ├── styles/           # 全局样式与 CSS 变量
│   │   └── icons/svg/        # SVG 图标
│   ├── components/           # 全局组件
│   │   └── ThemeEditor/      # 高级主题编辑器
│   ├── composables/          # 组合式函数
│   ├── directive/            # 自定义指令
│   ├── i18n/locales/         # 国际化语言包
│   ├── layout/               # 布局组件
│   │   └── components/
│   │       ├── Sidebar/      # 侧边栏（含 Logo）
│   │       ├── Settings/     # 设置抽屉
│   │       ├── Navbar.vue    # 顶部导航栏
│   │       └── TagsView/     # 标签页
│   ├── plugins/              # 插件（modal/tab/cache/download）
│   ├── router/               # 路由配置
│   ├── store/modules/        # Pinia 状态管理
│   ├── types/                # TypeScript 类型定义
│   ├── utils/                # 工具函数
│   └── views/                # 页面视图
├── scripts/
│   └── ui-test.mjs           # UI 可访问性测试脚本
├── tests/
│   └── validate-messages.cjs # i18n 消息格式校验
├── vite/plugins/             # Vite 插件配置
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── tsconfig.json
```

## 工程约定

- **Tailwind CSS 4 优先**：新增样式优先使用 Tailwind 工具类，无法实现时才用 CSS/SCSS
- **Element Plus 原生优先**：el-* 组件优先使用原生属性与 CSS 变量
- **暗色模式变体**：项目使用 `.dark` 类切换（非 `prefers-color-scheme`），通过 `@custom-variant dark (&:where(.dark, .dark *))` 配置
- **i18n 强制**：所有文案使用 i18n key，禁止硬编码中文
- **提交规范**：使用 Conventional Commits（commitlint + husky 强制）
- **包管理器**：统一使用 pnpm（禁止与 npm lockfile 共存）

## 无障碍设计

- **下拉菜单触发**：用户头像下拉菜单使用 `trigger="click"`（非 `hover`），支持键盘导航和移动端触摸操作
- **跳过导航链接**：布局顶部提供 `Skip to content` 链接，键盘用户可快速跳转到主内容
- **ARIA 标签**：主题切换选项、按钮等交互元素均设置 `aria-label` / `aria-pressed`
- **焦点管理**：抽屉、对话框等组件支持焦点陷阱和 ESC 关闭

## 测试截图

可视化测试截图保存在 [`../tests/screenshots/`](../tests/screenshots) 目录，覆盖登录流程、主题切换、各功能模块（feat1-19 / feature34-36 / feature45 等）的视觉回归与诊断截图。文件命名按 `feat<编号>_<描述>.png` / `feature<编号>-<描述>.png` / `visual-test-<场景>-*.png` 等约定组织，具体文件名以目录实际内容为准。
