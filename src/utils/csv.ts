/**
 * CSV 单元格转义（OWASP 公式注入防护 + RFC 4180 引号）。
 *
 * Excel / WPS / LibreOffice 打开 CSV 时，以 `=` `+` `-` `@`、制表符或回车开头的
 * 单元格会被当公式求值（`=HYPERLINK(...)` 可把数据外带、旧版 DDE 形态可执行命令）。
 * 查询结果来自任意业务表，列值可能是别人写入的字符串——导出人与内容写入者不是
 * 同一个人，所以必须在落盘前中和，而不是指望数据源干净。
 */

/** 危险起始字符（与后端 `audit::handler::csv_escape` 的六类一致） */
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/

/** 纯十进制数值（可选符号 + 整数/小数 + 可选指数），与后端 `is_plain_number` 同口径 */
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  // 纯数字豁免：负数本身不会被求值，加前缀反而把数值列变成带撇号的文本
  const neutralized = DANGEROUS_PREFIX.test(s) && !NUMERIC.test(s) ? `'${s}` : s
  // 前景单引号必须在加引号之前——引号内的撇号会被部分表格软件当成普通字符
  return /[",\r\n]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized
}
