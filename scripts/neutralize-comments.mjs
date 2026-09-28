// 去若依化：注释中性化（11 处精确替换，幂等）
import { readFileSync, writeFileSync } from 'node:fs'

const jobs = [
  {
    f: 'D:/Projects/yebot/axum-backend/src/service/auth_service.rs',
    pairs: [
      ['（对齐 RuoYi 标准 RouterVo 结构）', '（对齐标准后台 RouterVo 结构）'],
      ['输出：RuoYi 标准结构', '输出：标准后台结构'],
      ['child path 用 `index`（RuoYi 惯例）', 'child path 用 `index`（框架惯例）']
    ]
  },
  {
    f: 'D:/Projects/yebot/axum-backend/src/service/sys_tenant_service.rs',
    pairs: [
      ['m20250711 init 种子"若依科技"', 'm20250711 init 种子"Yebot科技"'],
      ['（RuoYi 系种子）', '（init 种子）'],
      ['（RuoYi init 种子）', '（init 种子）']
    ]
  },
  {
    f: 'D:/Projects/yebot/yebot-ui/src/utils/yebot.ts',
    pairs: [['原 RuoYi 基于 arguments 的实现', '原基于 arguments 的实现']]
  },
  {
    f: 'D:/Projects/yebot/axum-backend/migration/src/m20260926_000009_gen_column_rust_naming.rs',
    pairs: [['是 RuoYi（Java）的遗留命名', '是早期 Java 版本的遗留命名']]
  },
  {
    f: 'D:/Projects/yebot/axum-backend/src/integration_tests/scim_groups.rs',
    pairs: [['（RuoYi 初始库有 role_id=1/2）', '（初始库有 role_id=1/2）']]
  },
  {
    f: 'D:/Projects/yebot/axum-backend/src/service/gen_table_service.rs',
    pairs: [['两列原为 RuoYi 遗留命名', '两列原为早期 Java 版本的遗留命名']]
  }
]

let changed = 0
for (const job of jobs) {
  const src = readFileSync(job.f, 'utf-8')
  let out = src
  for (const [from, to] of job.pairs) out = out.split(from).join(to)
  if (out !== src) {
    writeFileSync(job.f, out)
    changed++
    console.log('OK', job.f.split('/').pop())
  } else {
    console.log('SKIP', job.f.split('/').pop())
  }
}
console.log('changed =', changed)
