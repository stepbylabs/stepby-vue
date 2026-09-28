// 去若依化改名收尾：yebotTask 系 → demoTask 系（通用演示命名，不带项目特征）；
// 并修复上一轮 "yebotParams" 子串误伤（OnlineQueyebotParams ← OnlineQueParams）。幂等。
import { readFileSync, writeFileSync } from 'node:fs'

const files = [
  'D:/Projects/yebot/axum-backend/src/scheduler/mod.rs',
  'D:/Projects/yebot/axum-backend/src/service/sys_job_service.rs',
  'D:/Projects/yebot/axum-backend/src/scheduler/registry.rs',
  'D:/Projects/yebot/axum-backend/src/handler/monitor_online_handler.rs',
  'D:/Projects/yebot/axum-backend/src/integration_tests/sys_job.rs',
  'D:/Projects/yebot/axum-backend/migration/src/m20250711_000001_init.rs',
  'D:/Projects/yebot/axum-backend/locales/zh-CN.yml',
  'D:/Projects/yebot/axum-backend/locales/en-US.yml'
]

// 顺序敏感：先修误伤，再整体改名（长串优先）
const pairs = [
  [/OnlineQueyebotParams/g, 'OnlineQueParams'],
  [/yebotMultipleParams/g, 'demoMultipleParams'],
  [/yebotNoParams/g, 'demoNoParams'],
  [/yebotParams/g, 'demoParams'],
  [/yebotTask/g, 'demoTask'],
  // 任务参数字面量：('yebot') / ''yebot''（SQL 转义）/ 日志与 i18n 值中的参数示例
  [/\('yebot'\)/g, "('demo')"],
  [/''yebot''/g, "''demo''"],
  [/参数: ry（/g, '参数: demo（'],
  [/参数: yebot（/g, '参数: demo（'],
  [/参数: ry\b/g, '参数: demo']
]

let changed = 0
for (const f of files) {
  const src = readFileSync(f, 'utf-8')
  let out = src
  for (const [re, to] of pairs) out = out.replace(re, to)
  if (out !== src) {
    writeFileSync(f, out)
    changed++
    console.log('OK', f)
  } else {
    console.log('SKIP', f)
  }
}
console.log('changed =', changed)
