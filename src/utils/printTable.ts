/**
 * TierA-6: 表格打印工具
 *
 * 功能：将 el-table 数据打印为新窗口，支持自定义标题和列配置
 *
 * 使用方式：
 *   import { printTable } from '@/utils/printTable'
 *   printTable({
 *     title: '用户列表',
 *     columns: [
 *       { label: '用户名', prop: 'userName' },
 *       { label: '手机号', prop: 'phonenumber' }
 *     ],
 *     data: [
 *       { userName: 'admin', phonenumber: '13800138000' },
 *       ...
 *     ]
 *   })
 *
 * 设计说明：
 * - 在新窗口中渲染 HTML 表格，避免影响当前页面
 * - 自动应用打印样式（边框、对齐、字体）
 * - 支持自定义标题、副标题（打印时间）
 * - 弹出新窗口的 window.print()，用户可选择打印或另存为 PDF
 */
import { ElMessage } from 'element-plus'
import i18n from '@/i18n'
import { errorHub } from '@/utils/errorHub'
// HTML 转义统一走 @/utils 的规范实现（打印模板把列名/单元格/标题拼进 innerHTML，
// 多处私有 escapeHtml 会各自漂移，正是 HTML 注入回归的 reintroduce 路径）
import { escapeHtml } from '@/utils'

export interface PrintColumn {
  label: string
  prop: string
  /** 可选的格式化函数 */
  formatter?: (row: Record<string, unknown>, column: PrintColumn, cellValue: unknown) => string
}

export interface PrintTableOptions {
  /** 表格标题 */
  title?: string
  /** 列配置 */
  columns: PrintColumn[]
  /** 数据行 */
  data: Record<string, unknown>[]
  /** 是否立即调用 print()（默认 true） */
  autoPrint?: boolean
}

/**
 * 打印表格数据
 * @param options 打印选项
 */
export function printTable(options: PrintTableOptions): void {
  const { title, columns, data, autoPrint = true } = options

  if (!data || data.length === 0) {
    errorHub.report('warning', 'other', i18n.global.t('printTable.noData'))
    return
  }

  const t = i18n.global.t.bind(i18n.global)
  const printTime = new Date().toLocaleString()

  // 构建表格 HTML
  const headerHtml = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('')

  const rowsHtml = data
    .map((row) => {
      const cells = columns
        .map((col) => {
          let cellValue = row[col.prop]
          if (col.formatter) {
            cellValue = col.formatter(row, col, cellValue)
          }
          if (cellValue === null || cellValue === undefined) {
            cellValue = ''
          }
          return `<td>${escapeHtml(String(cellValue))}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  // 构建完整 HTML
  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(document.documentElement.lang || 'zh-CN')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title ? escapeHtml(title) : escapeHtml(t('printTable.title'))}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
    margin: 24px;
    color: #303030;
    font-size: 13px;
    line-height: 1.5;
  }
  .print-header {
    text-align: center;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 2px solid #303030;
  }
  .print-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 6px 0;
  }
  .print-meta {
    font-size: 12px;
    color: #909399;
    margin: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  th, td {
    border: 1px solid #d0d0d0;
    padding: 6px 10px;
    text-align: left;
    word-break: break-all;
  }
  th {
    background-color: #f5f7fa;
    font-weight: 600;
    color: #303030;
  }
  tr:nth-child(even) td {
    background-color: #fafafa;
  }
  .print-footer {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
    font-size: 11px;
    color: #909399;
  }
  @media print {
    body { margin: 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="print-header">
    <h1 class="print-title">${title ? escapeHtml(title) : escapeHtml(t('printTable.title'))}</h1>
    <p class="print-meta">${escapeHtml(t('common.tip'))}: ${printTime} · ${escapeHtml(t('printTable.print'))}</p>
  </div>
  <table>
    <thead>
      <tr>${headerHtml}</tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="print-footer">
    ${escapeHtml(t('printTable.title'))} · ${data.length} ${escapeHtml(t('common.detail'))}
  </div>
</body>
</html>`

  // 在新窗口中打开
  const printWindow = window.open('', '_blank', 'width=1024,height=768')
  if (!printWindow) {
    errorHub.report('error', 'other', i18n.global.t('printTable.printFail'))
    return
  }

  // b112：原先这里往新窗口写了一段内联 `<script>window.onload=…print()</script>`，
  // 而本站 CSP 是 `script-src 'self'`（无 'unsafe-inline'），about:blank 继承 opener 的 CSP
  // ⇒ 那段脚本**从未执行**（真机探针实测 `inlineRan=false`），打印实际只靠父窗口 1.5s 兜底；
  // 兜底定时器还会在用户关掉第一个打印对话框后才触发 ⇒ 第二次弹框。
  // 现改为：父窗口写完后**只发起一次** print()，不再往子文档写脚本，也不留定时器。
  try {
    printWindow.opener = null
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  } catch (e) {
    // 弹窗被关闭 / 写文档被拦截：必须可见（此前是裸写，异常直接穿到点击处理器），
    // 窗口里没有可用内容 ⇒ 关掉，免得留一个空白页
    errorHub.report('error', 'other', i18n.global.t('printTable.printFail'))
    if (import.meta.env.DEV) console.error('[printTable] failed:', e)
    try {
      printWindow.close()
    } catch {
      /* 窗口可能已关闭 */
    }
    return
  }

  if (autoPrint) {
    try {
      printWindow.focus()
      printWindow.print()
    } catch (e) {
      // 打印被拦（部分浏览器在非用户手势下会抛）：内容已就绪，**不关窗**，
      // 用户仍可手动 Ctrl+P；但不得报成功
      errorHub.report('error', 'other', i18n.global.t('printTable.printFail'))
      if (import.meta.env.DEV) console.error('[printTable] print failed:', e)
      return
    }
  }

  ElMessage.success(i18n.global.t('printTable.printed'))
}
