// flow 集成测试同步：ry 用户改名后测试引用同步（"ry" 字符串 → "yebot"）
import { readFileSync, writeFileSync } from 'node:fs'

const f = 'D:/Projects/yebot/axum-backend/src/integration_tests/flow.rs'
const src = readFileSync(f, 'utf-8')
let out = src
  .split('login(&ctx.app, ctx.peer_ip, "ry", "admin123")')
  .join('login(&ctx.app, ctx.peer_ip, "yebot", "admin123")')
  .split('Column::UserName.eq("ry")')
  .join('Column::UserName.eq("yebot")')
writeFileSync(f, out)
console.log('changed =', out !== src)
