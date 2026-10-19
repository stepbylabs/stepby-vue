/**
 * 导出 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：统一非 useCrudTable 页面的导出逻辑（dict/data、rateLimit、job/log、logininfor 等）
 *   - 封装 download() 调用，统一文件名生成规则
 *   - downloadLoading 状态管理
 *   - 错误提示
 *
 * 用法：
 *   import { useExport } from '@/composables/useExport'
 *   const { downloadLoading, handleExport } = useExport('/monitor/logininfor/export', 'logininfor')
 *   handleExport(queryParams.value)
 *
 * 注：使用 useCrudTable 的页面已内置 handleExport，无需使用本 composable
 */
import { ref } from 'vue'
import { download } from '@/utils/request'
import modal from '@/plugins/modal'
import { useI18n } from 'vue-i18n'

export interface UseExportOptions {
  /** 导出失败时的 i18n key（默认 'common.downloadError'） */
  errorKey?: string
  /** 成功时的 i18n key（不传则不提示） */
  successKey?: string
}

export function useExport(url: string, filenamePrefix: string, options: UseExportOptions = {}) {
  const { t } = useI18n()
  const { errorKey = 'common.downloadError', successKey } = options

  const downloadLoading = ref(false)

  /**
   * 形参刻意取 unknown：模板裸写 `@click="handleExport"` 时 Vue 把 PointerEvent 送进第一个实参
   * （el-button 的 click 载荷类型宽松，vue-tsc 拦不住）。b73 在 useCrudTable 同族实证过真实后果
   * （7 个页面导出物存成 `[object PointerEvent].xlsx`），本 composable 是同一接缝的另一半，同源设防：
   * 事件对象既不能当查询条件（会静默丢筛选），也不能当文件名。
   */
  function handleExport(params?: unknown, filename?: unknown): void {
    downloadLoading.value = true
    const query: Record<string, unknown> =
      params instanceof Event ? {} : ((params as Record<string, unknown> | undefined) ?? {})
    const finalFilename =
      typeof filename === 'string' && filename ? filename : `${filenamePrefix}_${Date.now()}.xlsx`
    download(url, query, finalFilename)
      .then(() => {
        if (successKey) modal.msgSuccess(t(successKey))
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) console.error(`[useExport] ${url} export failed:`, err)
        modal.msgError(t(errorKey))
      })
      .finally(() => {
        downloadLoading.value = false
      })
  }

  return {
    downloadLoading,
    handleExport
  }
}
