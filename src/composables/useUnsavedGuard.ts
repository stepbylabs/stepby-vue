/**
 * 表单未保存离开确认（UX-PLAN-2026-09-28 UX-5）
 *
 * 场景：编辑弹窗（dialog）在用户已修改内容后，点击遮罩 / 取消 / 右上角 × 关闭时，
 * 静默丢弃修改是高频数据丢失源。本 composable 提供「打开时快照 → 关闭前比较 →
 * 脏则确认」的最小接入模式：
 *
 *   const { snapshot, confirmLeave } = useUnsavedGuard()
 *   function handleUpdate(row) { form.value = { ...row }; snapshot(form.value); dialog.visible = true }
 *   async function beforeClose(done: () => void) { if (await confirmLeave(form.value)) done() }
 *   <el-dialog :before-close="beforeClose" ...>
 *
 * 说明：
 * - 快照/比较均为浅层 JSON 序列化（表单字段为扁平原始值时语义精确；嵌套对象按
 *   引用顺序比较，字段顺序由后端 DTO 保证稳定）。
 * - 「确定离开」不还原表单（下次打开会重新赋值）；「取消」仅阻止关闭。
 * - cancel 按钮 / 遮罩 / ESC / × 均走 before-close（el-dialog 默认在 close 事件
 *   外层拦截），显式 save 流程不受影响（保存成功后主动置 visible=false 前重置快照）。
 */
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

export function useUnsavedGuard() {
  const { t } = useI18n()
  let snapshot = ''

  /** 打开弹窗 / 表单初始化后调用：记录当前表单为"已保存"基准 */
  function snapshotForm(form: unknown): void {
    snapshot = JSON.stringify(form ?? null)
  }

  /** 保存成功后调用：以当前表单为新基准，避免后续关闭再弹确认 */
  function markSaved(form: unknown): void {
    snapshotForm(form)
  }

  /**
   * 关闭前确认。返回 true = 可以关闭；false = 用户取消，保持弹窗打开。
   * 用法：<el-dialog :before-close="(done) => confirmLeave(form).then(ok => ok && done())">
   */
  async function confirmLeave(form: unknown): Promise<boolean> {
    if (JSON.stringify(form ?? null) === snapshot) return true
    try {
      await ElMessageBox.confirm(t('common.unsavedConfirm'), t('common.tip'), {
        confirmButtonText: t('common.leaveWithoutSaving'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      })
      return true
    } catch {
      return false
    }
  }

  return { snapshotForm, markSaved, confirmLeave }
}
