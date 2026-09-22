/**
 * 审计合规报告 PDF 导出 composable
 *
 * 从 audit-dashboard/index.vue 中抽取：
 * - ComplianceReport 数据结构
 * - buildReportDom（构建临时报告 DOM）
 * - handleExportPdf（导出 PDF 全流程）
 * - lastBusinessTypes 缓存（饼图点击反查 code 用）
 * - handlePieChartClick（点击饼图扇区跳转 operlog）
 *
 * 依赖说明：
 * - days（报表统计天数 Ref）与 formatBusinessType（业务类型映射）由父组件传入
 * - t / router / escapeHtml 在 composable 内获取或导入
 */
import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { errorHub } from '@/utils/errorHub'
import { exportElementToPdf } from '@/utils/pdf'
import { getComplianceReport } from '@/api/monitor/operlog'
import { escapeHtml } from '@/utils'
import type { PieClickParams } from './useAuditCharts'

/** 合规报告数据结构（导出 PDF 用） */
export interface ComplianceReport {
  periodFrom: string
  periodTo: string
  generatedAt: string
  summary: { total: number; success: number; fail: number }
  businessTypes: Array<{ businessType: number; count: number }>
  topOperators: Array<{ operName: string; count: number }>
  topModules: Array<{ moduleName: string; count: number }>
  anomalies: Array<{
    operTime: string
    title: string
    operName: string
    operIp: string
    errorMsg?: string
  }>
}

export interface UseComplianceReportOptions {
  /** 报表统计天数（与页面天数组件联动） */
  days: Ref<number>
  /** 业务类型 code → 中文名称映射（由 useAuditCharts 提供） */
  formatBusinessType: (code: number) => string
}

export function useComplianceReport(options: UseComplianceReportOptions) {
  const { days, formatBusinessType } = options
  const { t } = useI18n()
  const router = useRouter()

  const exporting = ref(false)
  // 缓存最近一次 businessTypes，供饼图点击回调反查 code
  const lastBusinessTypes = ref<Array<{ businessType: number; count: number }>>([])

  /** 构建临时报告 DOM（脱离文档流，导出后移除） */
  function buildReportDom(report: ComplianceReport): HTMLElement {
    const container = document.createElement('div')
    container.style.cssText =
      'position:fixed;left:-9999px;top:0;width:794px;padding:30px;background:#fff;font-family:"Microsoft YaHei",sans-serif;'

    const successRate =
      report.summary.total > 0 ? ((report.summary.success / report.summary.total) * 100).toFixed(2) : '0.00'

    container.innerHTML = `
    <h1 style="text-align:center;font-size:24px;margin-bottom:8px;">${t('auditDashboard.report.title')}</h1>
    <div style="text-align:center;color:#666;margin-bottom:20px;">
      ${t('auditDashboard.report.period')}：${escapeHtml(report.periodFrom)} ${t('auditDashboard.report.periodConnector')} ${escapeHtml(report.periodTo)}<br/>
      ${t('auditDashboard.report.generatedAt')}：${escapeHtml(report.generatedAt)}
    </div>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.sectionOverview')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <tr>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.totalOps')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(report.summary.total)}</td>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.successOps')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(report.summary.success)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.failOps')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(report.summary.fail)}</td>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.successRate')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${successRate}%</td>
      </tr>
    </table>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.section2')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.businessType')}</th>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.operCount')}</th>
        </tr>
      </thead>
      <tbody>
        ${(report.businessTypes || [])
          .map(
            (bt: { businessType: number; count: number }) => `<tr>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(formatBusinessType(bt.businessType))}</td>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(bt.count)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.section3')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.username')}</th>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.operCount')}</th>
        </tr>
      </thead>
      <tbody>
        ${(report.topOperators || [])
          .map(
            (op: { operName: string; count: number }) => `<tr>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(op.operName)}</td>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(op.count)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.sectionTopModules')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.module')}</th>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.operCount')}</th>
        </tr>
      </thead>
      <tbody>
        ${(report.topModules || [])
          .map(
            (m: { moduleName: string; count: number }) => `<tr>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(m.moduleName)}</td>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(m.count)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.sectionAnomalies', { count: (report.anomalies || []).length })}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:12px;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.time')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.module')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.operator')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.ip')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.errorMsg')}</th>
        </tr>
      </thead>
      <tbody>
        ${(report.anomalies || [])
          .map(
            (a: { operTime: string; title: string; operName: string; operIp: string; errorMsg?: string }) => `<tr>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.operTime)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.title)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.operName)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.operIp)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.errorMsg || '')}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <div style="margin-top:40px;text-align:center;color:#999;font-size:12px;">
      ${t('auditDashboard.report.footerDisclaimer')}
    </div>
  `

    document.body.appendChild(container)
    return container
  }

  /** 导出审计合规报告 PDF */
  async function handleExportPdf() {
    exporting.value = true
    try {
      const res = await getComplianceReport(days.value)
      const report = (res?.data ?? res) as ComplianceReport | undefined
      if (!report) {
        errorHub.report('warning', 'other', t('auditDashboard.report.noData'))
        return
      }

      const reportEl = buildReportDom(report)
      try {
        const filename = `${t('auditDashboard.report.title')}_${new Date().toISOString().slice(0, 10)}`
        await exportElementToPdf(reportEl, filename, {
          orientation: 'portrait',
          format: 'a4'
        })
        ElMessage.success(t('auditDashboard.report.exportSuccess'))
      } finally {
        reportEl.remove()
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Export PDF failed:', e)
      errorHub.report('error', 'other', t('auditDashboard.report.exportFail'))
    } finally {
      exporting.value = false
    }
  }

  /** P1-3：点击饼图业务类型扇区 → 跳转 operlog 并按该业务类型筛选 */
  function handlePieChartClick(params: PieClickParams): void {
    // businessTypes 数据已通过 renderPieChart 传入，但 ECharts 回调不携带原始 code
    // 因此从 name 反查最近一次 businessTypes 数据
    const bt = lastBusinessTypes.value.find(
      (b: { businessType: number; count: number }) => formatBusinessType(b.businessType) === params.name
    )
    if (!bt) return
    router.push({
      // 操作日志菜单动态注册路径为 /system/log/operlog（旧值 /monitor/operlog 非注册路由，命中 404）
      path: '/system/log/operlog',
      query: { businessType: String(bt.businessType) }
    })
  }

  return {
    exporting,
    lastBusinessTypes,
    handleExportPdf,
    handlePieChartClick
  }
}
