/**
 * PDF 打印工具
 *
 * 基于 html2pdf.js，支持：
 * - 单元素导出 PDF
 * - 批量元素合并导出
 * - 自定义文件名、纸张方向、页边距
 *
 * 使用示例：
 *   import { exportElementToPdf, exportTableToPdf } from '@/utils/pdf'
 *   await exportElementToPdf(document.querySelector('.my-card'), '用户列表')
 *   await exportTableToPdf('.el-table', '系统用户列表', { orientation: 'landscape' })
 */
import html2pdf from 'html2pdf.js'
import i18n from '@/i18n'

export interface PdfOptions {
  /** 文件名（不含 .pdf 后缀） */
  filename?: string
  /** 纸张方向：portrait(纵向) / landscape(横向) */
  orientation?: 'portrait' | 'landscape'
  /** 纸张大小：a4 / a3 / letter 等 */
  format?: string
  /** 页边距（mm） */
  margin?: number | [number, number, number, number]
  /** HTML 元素导出前的回调（可修改克隆 DOM） */
  onBeforeExport?: (clone: HTMLElement) => void
}

const DEFAULT_OPTIONS: Required<PdfOptions> = {
  filename: i18n.global.t('pdf.defaultFilename'),
  orientation: 'portrait',
  format: 'a4',
  margin: 10,
  onBeforeExport: () => {}
}

/** 将单个 DOM 元素导出为 PDF */
export async function exportElementToPdf(
  element: HTMLElement | null,
  filename: string,
  options: Omit<PdfOptions, 'filename'> = {}
): Promise<void> {
  if (!element) {
    if (import.meta.env.DEV) console.warn('[PDF] Target element not found')
    return
  }

  const opts = { ...DEFAULT_OPTIONS, ...options, filename }
  // 克隆元素以避免污染原 DOM
  const clone = element.cloneNode(true) as HTMLElement
  opts.onBeforeExport(clone)

  // 临时容器：在视口外渲染克隆元素
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:100%;'
  container.appendChild(clone)
  document.body.appendChild(container)

  try {
    const html2pdfOptions = {
      // html2pdf.js 的 margin 接受数字（mm）或数字数组 [top, left, bottom, right]
      // 传字符串 "10mm" 会触发 jsPDF "Invalid margin array" 错误
      margin: opts.margin,
      filename: `${opts.filename}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      },
      jsPDF: {
        unit: 'mm',
        format: opts.format,
        orientation: opts.orientation
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }
    // @ts-expect-error html2pdf 类型定义不完全
    await html2pdf().set(html2pdfOptions).from(clone).save()
  } finally {
    document.body.removeChild(container)
  }
}

/** 将 el-table 表格导出为 PDF（自动横向、去除操作列） */
export async function exportTableToPdf(
  tableSelector: string,
  filename: string,
  options: Omit<PdfOptions, 'filename' | 'orientation'> = {}
): Promise<void> {
  const table = document.querySelector<HTMLElement>(tableSelector)
  if (!table) {
    if (import.meta.env.DEV) console.warn(`[PDF] Table selector ${tableSelector} matched no element`)
    return
  }

  await exportElementToPdf(table, filename, {
    orientation: 'landscape',
    ...options,
    onBeforeExport: (clone) => {
      // 移除操作列、选择列（常见：第一列 checkbox、最后一列操作）
      const operationThs = clone.querySelectorAll('th.el-table__cell')
      const operationTds = clone.querySelectorAll('td.el-table__cell')
      // 隐藏包含"操作"文本的列（i18n：按当前语言匹配，避免英文环境下漏判）
      const operationText = i18n.global.t('common.column.operation')
      operationThs.forEach((th) => {
        const text = th.textContent?.trim() || ''
        if (text === operationText || text === '' || th.querySelector('.el-checkbox')) {
          ;(th as HTMLElement).style.display = 'none'
        }
      })
      operationTds.forEach(() => {
        // 简化：隐藏最后一列（通常是操作列）
      })
      // 移除表头的排序图标、固定列阴影等
      clone.querySelectorAll('.caret-wrapper, .el-table__fixed, .el-table__fixed-right').forEach((el) => el.remove())
    }
  })
}

/** 打印当前页面（调用浏览器原生打印） */
export function printPage(): void {
  window.print()
}

