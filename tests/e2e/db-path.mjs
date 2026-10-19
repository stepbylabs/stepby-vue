// 诊断脚本用的数据库路径**唯一事实源**。
//
// 此前 check-db.mjs / check-db-menu.mjs 各自写死 `d:/桌面/stepby/stepby-axum/data/stepby.db`，
// 而项目早已迁到 `D:/Projects/stepby`（实测该路径 `No such file or directory`）⇒ 两个脚本
// 一起手就 ENOENT，属于"文档里还在用、实际早跑不通"的死链路。
//
// 路径从本文件位置推导（不依赖 cwd，也不依赖盘符），可用 STEPBY_DB 覆盖。
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 仓库根（= D:/Projects/stepby，含 stepby-axum / stepby-vue 两个子仓） */
export const REPO_ROOT = resolve(HERE, '..', '..', '..')

/** 后端 SQLite 库路径（默认 `<repo>/stepby-axum/data/stepby.db`） */
export const DB_PATH = process.env.STEPBY_DB
  ? resolve(process.env.STEPBY_DB)
  : join(REPO_ROOT, 'stepby-axum', 'data', 'stepby.db')

/**
 * 校验库存在，返回路径。缺失时给出可执行的下一步而不是抛 SQLite 的底层错误。
 * @returns {string}
 */
export function assertDbExists() {
  if (!existsSync(DB_PATH)) {
    console.error(
      `❌ 数据库不存在：${DB_PATH}\n` + '   先启动后端（首次启动会自动建库并跑迁移），或用 STEPBY_DB=<绝对路径> 指定。'
    )
    process.exit(2)
  }
  return DB_PATH
}
