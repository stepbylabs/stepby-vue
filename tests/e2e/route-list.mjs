/**
 * 全站路由清单（单一事实源）
 *
 * 为什么单独成文件：`collect-warnings.mjs`（11 类运行时信号采集）与 `a11y-full.mjs`
 * （全站无障碍巡检）此前各自内联了一份 57 条的路由表，后者注释写着"复制而不改原文件"。
 * 两份手抄清单必然漂移——往采集面加一条路由，无障碍巡检会**静默漏扫**（反向同理），
 * 而两边的汇总数字都正常，没人会发现覆盖面少了一页。
 *
 * 权威来源是后端 `getRouters` 组合结果（`/父目录path/子path`），不是手写猜测。
 * 静态猜测会命中 404 兜底页造成误报：例如 operlog 实为 `/system/log/operlog`，
 * backup/task 在 `/monitor` 下，about/help/changelog/shortcuts 在 `/tool` 下，
 * workbench 实为 `/workbench/index`。`/index` 与 `/user/profile/*` 为"隐藏但可直达"页，保留。
 *
 * 新增页面时**只改这里**；两套脚本都从本文件 import。
 */
export const ROUTES = [
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
  // '/system/dashboard' 已移除（2026-10-02）：sys_menu 中不存在该路由，goto 必命中 404
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
  // API 令牌真实路由为 /tool/pat（sys_menu menu_id=3560 挂在 tool 目录下），2026-10-02 修正
  '/tool/pat',
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

export default ROUTES
