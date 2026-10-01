#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Update testing-guide.md with M15-M25 module descriptions."""

with open(r'd:\桌面\stepby\axum-backend\docs\testing-guide.md', 'rb') as f:
    content_bytes = f.read()
crlf_count = content_bytes.count(b'\r\n')
lf_count = content_bytes.count(b'\n') - crlf_count
newline = '\r\n' if crlf_count > lf_count else '\n'

with open(r'd:\桌面\stepby\axum-backend\docs\testing-guide.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace header and run command
old_header = '''### 10.11 深度 E2E 测试套件（282 项，14 模块）

> 测试脚本：`tests/deep-e2e.mjs`（Playwright 驱动，深度覆盖每个前端界面的每个功能）

#### 运行方式

```powershell
# PowerShell 环境变量设置
$env:YEBOT_TEST_USER='<set-your-username>'
$env:YEBOT_TEST_PASS='<set-your-password>'
$env:YEBOT_BASE_URL='http://localhost:8080'

# 全量深度测试（282 项，14 模块）
node tests/deep-e2e.mjs --headless

# 单模块测试（如模块 9：权限隔离）
node tests/deep-e2e.mjs --headless --feature=9

# 有头模式（可视化调试，默认）
node tests/deep-e2e.mjs
```

#### 14 个测试模块说明

| 模块 | 名称 | 测试项数 | 覆盖内容 |
|------|------|---------|---------|
| M1 | 系统管理页面深度测试 | 73 | 用户/角色/菜单/部门/岗位/字典/参数/通知中心/通知公告/日志 CRUD、搜索表单、表格列、对话框、详情抽屉 |
| M2 | 监控页面深度测试 | 52 | 在线用户/缓存管理/服务器监控/缓存监控/登录日志/操作日志/审计大屏/IP 库管理/备份管理 |
| M3 | 系统工具页面深度测试 | 23 | 表单构建器（三栏布局）、代码生成器（导入/创建/预览对话框）、接口文档（Swagger iframe） |
| M4 | 帮助中心页面深度测试 | 25 | 关于系统（版本/依赖/技术栈）、更新日志（时间线）、快捷键中心、帮助中心（FAQ/联系） |
| M5 | Dashboard 和工作台深度测试 | 27 | 数据看板（统计卡片/图表/快捷入口/查看全部跳转）、个人工作台、首页 |
| M6 | 个人中心深度测试 | 8 | 基本资料 Tab、修改密码表单、TOTP Tab |
| M7 | 带参数路由页面测试 | 13 | 代码生成编辑（tableId）、定时任务日志（jobId）、用户分配角色（userId）、角色分配用户（roleId） |
| M8 | 错误页面和特殊页面测试 | 20 | 401/403/404/500/网络错误/隐私政策/锁屏页 |
| M9 | 权限隔离深度测试（stepby 用户） | 9 | 菜单加载、参数设置/字典管理新增按钮隐藏、在线用户/登录日志访问、写操作 API 403 |
| M10 | i18n 完整性深度扫描 | 3 | 切换英文、中文残留扫描（0 处）、控制台错误 |
| M11 | 暗色模式深度测试 | 5 | 切换暗色模式、系统管理/监控页面无硬编码白色背景 |
| M12 | CRUD 操作深度测试 | 10 | 岗位/字典/参数/通知 新增对话框表单字段验证 |
| M13 | 注册页测试 | 7 | 注册表单（用户名/密码/确认密码/验证码）、注册按钮、返回登录链接、页面标题 |
| M14 | 字典数据详情页测试 | 7 | 字典数据详情页加载、表格列、搜索表单、新增/关闭按钮、新增字典数据对话框 |'''

new_header = '''### 10.11 深度 E2E 测试套件（329 项，20 模块）

> 测试脚本：`tests/deep-e2e.mjs`（Playwright 驱动，深度覆盖每个前端界面的每个功能）

#### 运行方式

```powershell
# PowerShell 环境变量设置
$env:YEBOT_TEST_USER='<set-your-username>'
$env:YEBOT_TEST_PASS='<set-your-password>'
$env:YEBOT_BASE_URL='http://localhost:8080'

# 全量深度测试（329 项，20 模块）
node tests/deep-e2e.mjs --headless

# 单模块测试（如模块 9：权限隔离）
node tests/deep-e2e.mjs --headless --feature=9

# 有头模式（可视化调试，默认）
node tests/deep-e2e.mjs
```

#### 20 个测试模块说明

| 模块 | 名称 | 测试项数 | 覆盖内容 |
|------|------|---------|---------|
| M1 | 系统管理页面深度测试 | 73 | 用户/角色/菜单/部门/岗位/字典/参数/通知中心/通知公告/日志 CRUD、搜索表单、表格列、对话框、详情抽屉 |
| M2 | 监控页面深度测试 | 52 | 在线用户/缓存管理/服务器监控/缓存监控/登录日志/操作日志/审计大屏/IP 库管理/备份管理 |
| M3 | 系统工具页面深度测试 | 23 | 表单构建器（三栏布局）、代码生成器（导入/创建/预览对话框）、接口文档（Swagger iframe） |
| M4 | 帮助中心页面深度测试 | 25 | 关于系统（版本/依赖/技术栈）、更新日志（时间线）、快捷键中心、帮助中心（FAQ/联系） |
| M5 | Dashboard 和工作台深度测试 | 27 | 数据看板（统计卡片/图表/快捷入口/查看全部跳转）、个人工作台、首页 |
| M6 | 个人中心深度测试 | 8 | 基本资料 Tab、修改密码表单、TOTP Tab |
| M7 | 带参数路由页面测试 | 13 | 代码生成编辑（tableId）、定时任务日志（jobId）、用户分配角色（userId）、角色分配用户（roleId） |
| M8 | 错误页面和特殊页面测试 | 20 | 401/403/404/500/网络错误/隐私政策/锁屏页 |
| M9 | 权限隔离深度测试（stepby 用户） | 9 | 菜单加载、参数设置/字典管理新增按钮隐藏、在线用户/登录日志访问、写操作 API 403 |
| M10 | i18n 完整性深度扫描 | 3 | 切换英文、中文残留扫描（0 处）、控制台错误 |
| M11 | 暗色模式深度测试 | 5 | 切换暗色模式、系统管理/监控页面无硬编码白色背景 |
| M12 | CRUD 操作深度测试 | 10 | 岗位/字典/参数/通知 新增对话框表单字段验证 |
| M13 | 注册页测试 | 7 | 注册表单（用户名/密码/确认密码/验证码）、注册按钮、返回登录链接、页面标题 |
| M14 | 字典数据详情页测试 | 7 | 字典数据详情页加载、表格列、搜索表单、新增/关闭按钮、新增字典数据对话框 |
| M15 | 遗漏对话框深度测试 | 11 | 头像上传（userAvatar）、选择用户（selectUser）、任务详情（JobDetail）、图标选择（IconsDialog）、代码类型（CodeTypeDialog）、树节点（TreeNodeDialog） |
| M16 | 搜索筛选功能深度测试 | 9 | 用户/角色/岗位/字典/参数/操作日志/通知中心 搜索+重置、通知中心 Tab 过滤 |
| M17 | Tab 切换深度测试 | 8 | 在线用户/登录日志/关于系统/缓存监控/个人中心/表单构建器 Tab 切换验证 |
| M18 | 行内编辑删除+确认对话框测试 | 9 | 岗位/字典/参数/通知 行内编辑+删除确认对话框（含临时数据创建+清理） |
| M19 | 分页+导出+表单校验测试 | 8 | 用户/角色/岗位 分页可见性、导出按钮、表单空提交校验 |
| M20 | 布局功能深度测试 | 9 | 侧边栏折叠/展开、头像下拉、通知铃铛、主题切换、Settings 抽屉、TagsView 右键菜单、全屏、面包屑 |
| M21 | 缺失页面深度测试 | 8 | 404 页面（wscn-http404-container）、用户详情页（view.vue）、角色分配用户页（authUser.vue）、任务详情页（job/detail.vue）、操作日志详情页（operlog/detail.vue）、字典详情页（dict/detail.vue） |
| M22 | 组件功能深度测试 | 16 | 命令面板（Ctrl+K）、顶部搜索（HeaderSearch）、收藏夹下拉、最近访问下拉、语言切换（LangSelect）、尺寸切换（SizeSelect）、全屏按钮、主题切换、外部链接（Git/Doc） |
| M23 | 用户操作流程深度测试 | 14 | 登录页验证码/表单/记住我/注册链接、登出按钮+菜单项数量、修改密码 Tab 表单+空表单校验、TOTP（MFA）Tab 内容 |
| M24 | 批量操作 & 文件操作深度测试 | 9 | 批量选择+批量删除按钮、导出对话框、Excel 导入对话框、文件上传组件、Markdown/富文本编辑器（通知）、行内编辑组件（EditableCell） |
| M25 | 权限指令 & 锁屏 & 错误边界深度测试 | 16 | v-hasPermi/v-hasRole/v-watermark/v-copyText/v-desensitize 指令、锁屏页面（通过菜单触发）、ErrorBoundary、AnnouncementBanner、CookieConsent、network-error 重试按钮、SkeletonTable、EmptyState |'''

old_norm = old_header.replace('\n', newline)
new_norm = new_header.replace('\n', newline)

if old_norm not in content:
    print('ERROR: header block not found')
    exit(1)

content = content.replace(old_norm, new_norm, 1)
print('Header updated')

# Update JSON report example
old_json = '''```json
{
  "total": 282,
  "passed": 282,
  "failed": 0,
  "passRate": "100.0%",
  "results": [
    { "module": 1, "name": "用户管理页面加载", "passed": true, "detail": "" }
  ]
}
```'''

new_json = '''```json
{
  "total": 329,
  "passed": 329,
  "failed": 0,
  "passRate": "100.0%",
  "results": [
    { "module": 1, "name": "用户管理页面加载", "passed": true, "detail": "" }
  ]
}
```'''

old_json_norm = old_json.replace('\n', newline)
new_json_norm = new_json.replace('\n', newline)

if old_json_norm in content:
    content = content.replace(old_json_norm, new_json_norm, 1)
    print('JSON example updated')
else:
    print('WARN: JSON example not found, skipping')

with open(r'd:\桌面\stepby\axum-backend\docs\testing-guide.md', 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print('Documentation updated successfully')
