// src/views/system/message/log/markPending.link.test.ts
// 「标记待重试」链路守卫（批七十六）。
//
// 本批把后端一直存在却没有入口的 POST /system/msg/log/markPending/{logIds} 接到
// 发送记录页的多选工具条，同时修掉它的两个真实缺陷：
// 1) 旧实现无条件把选中行置为待重试('2')，混选中的**成功行**会被调度器重新投递
//    （真实短信/邮件重复发给已送达的收件人）；现按 status='1' 过滤，只交回失败终态。
// 2) 旧实现不重置 retry_count，而失败终态行必然 retry_count>=max，
//    `find_pending_retry` 只取 retry_count<max 的行——只改 status 会让它永远停在
//    "待重试"（既不发送也不再判定失败）。现同步把 retry_count 归零。
// UI 文案向用户承诺的正是这两条语义，因此必须与后端实现同源钉住：语言包插值契约
// （{count}）+ 后端过滤条件，任一侧漂移即红。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIEW = path.join(HERE, 'index.vue')
const API = path.resolve(HERE, '../../../../api/system/msg.ts')
const REPO = path.resolve(
  HERE,
  '../../../../../../stepby-axum/src/repository/sys_msg_send_log.rs'
)

function readRequired(fp: string, label: string): string {
  if (!fs.existsSync(fp)) {
    throw new Error(`${label} 读不到输入：${fp}（校验没有跑，不得当成通过）`)
  }
  return fs.readFileSync(fp, 'utf8')
}

function localeLeaf(locale: unknown, dotted: string): unknown {
  let cur: unknown = locale
  for (const seg of dotted.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

const viewSrc = readRequired(VIEW, '发送记录页')
const apiSrc = readRequired(API, '消息 api 层')
const repoSrc = readRequired(REPO, '发送记录仓储')

function fnBody(src: string, decl: string, stop = '\n}'): string {
  const start = src.indexOf(decl)
  expect(start, `${decl} 不存在`).toBeGreaterThanOrEqual(0)
  const rest = src.slice(start)
  const end = rest.indexOf(stop)
  expect(end, `${decl} 函数体未按 ${JSON.stringify(stop)} 闭合`).toBeGreaterThan(0)
  return rest.slice(0, end)
}

describe('标记待重试链路', () => {
  it('api 层打到 markPending 端点（路径与后端路由逐字对齐，POST）', () => {
    expect(apiSrc).toContain('export function markPendingSendLog')
    const body = fnBody(apiSrc, 'export function markPendingSendLog')
    expect(body).toContain("'/system/msg/log/markPending/' + logIds")
    expect(body).toContain("method: 'post'")
  })

  it('工具条按钮存在、受多选态与权限键约束（与单条重试同键）', () => {
    expect(viewSrc).toContain("t('msg.log.btn.markPending')")
    expect(viewSrc).toContain('@click="handleMarkPending"')
    expect(viewSrc).toContain(':disabled="multiple"')
    expect(viewSrc).toContain("v-hasPermi=\"['system:msg:log:retry']\"")
    expect(viewSrc).toContain('markPendingSendLog')
  })

  it('处理函数如实回报"真正交回队列的条数"，不是选中数', () => {
    const body = fnBody(viewSrc, 'function handleMarkPending')
    expect(body).toContain('markPendingSendLog(selected.join(\',\'))')
    expect(body).toContain('res?.data')
    expect(body).toContain("t('msg.log.markPendingSuccess'")
    expect(body).toContain('getList()')
  })

  it('插值契约：两条文案都带 {count}（少了就是静默显示占位符）', () => {
    for (const [locale, name] of [
      [zhCN, 'zh-CN'],
      [enUS, 'en-US']
    ] as const) {
      const tip = localeLeaf(locale, 'msg.log.tip.confirmMarkPending')
      const ok = localeLeaf(locale, 'msg.log.markPendingSuccess')
      expect(typeof tip, `${name} confirmMarkPending 缺词条`).toBe('string')
      expect(typeof ok, `${name} markPendingSuccess 缺词条`).toBe('string')
      expect(tip as string, `${name} confirmMarkPending 缺 {count}`).toContain('{count}')
      expect(ok as string, `${name} markPendingSuccess 缺 {count}`).toContain('{count}')
    }
    expect(localeLeaf(zhCN, 'msg.log.btn.markPending')).not.toBe(
      localeLeaf(enUS, 'msg.log.btn.markPending')
    )
  })

  it('后端防线与 UI 承诺同源：只交回失败终态且重算额度', () => {
    const body = fnBody(repoSrc, 'pub async fn mark_pending_retry', '\n    }')
    // 只改判失败终态行（防对已成功收件人重复投递）
    expect(body).toContain('.filter(Column::Status.eq("1"))')
    // 归零额度（否则 find_pending_retry 的 retry_count<max 永不取它）
    expect(body).toContain('.col_expr(Column::RetryCount, Expr::value(0i32))')
    expect(repoSrc).toContain('Expr::col(Column::RetryCount).lt(Expr::col(Column::MaxRetryCount))')
  })

  it('变异证伪：抹掉后端过滤或 UI 派发，守卫必须转红', () => {
    const mutatedRepo = repoSrc.replace('.filter(Column::Status.eq("1"))', '')
    expect(fnBody(mutatedRepo, 'pub async fn mark_pending_retry', '\n    }')).not.toContain(
      '.filter(Column::Status.eq("1"))'
    )
    const mutatedView = viewSrc.replace('markPendingSendLog(selected.join(\',\'))', 'void 0')
    expect(fnBody(mutatedView, 'function handleMarkPending')).not.toContain('markPendingSendLog(')
  })
})
