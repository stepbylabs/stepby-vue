import type { FormInstance } from 'element-plus'

/**
 * Element Plus 表单校验的统一入口（批七十九 P1）。
 *
 * 缺陷形态：`async function submit() { await formRef.value?.validate(); ... }`。
 * EP 的**零参 `validate()`** 在校验失败时返回**被拒绝的 Promise**（拒绝值是字段错误对象），
 * 裸 `await` 让拒绝逸出点击处理器 ⇒ unhandledrejection ⇒ 被布局层 ErrorBoundary 捕获，
 * 整个子树（含正在填写的对话框）被换成错误兜底。用户看到的不是"哪一格没填"，
 * 而是"点了确定，表单整块消失、什么都没保存"。
 *
 * 真机取证（b79 M87 流程待办「提交请假单」，标题留空点确定）：
 * `console=[error] [ErrorBoundary] ... info: https://vuejs.org/error-reference/#runtime-6`
 * ——`runtime-6` 即 `ErrorCodes.COMPONENT_EVENT_HANDLER`，正是"组件事件处理器里抛出的异常"；
 * 同时刻 `.el-form-item__error` 数量为 0，因为红字连同表单一起被卸载了。
 *
 * 本仓另有两处**已正确**的写法可作对照：
 * `views/monitor/ip-location/index.vue`（`.validate().catch(() => false)` + 注释点名该风险）、
 * `composables/useCrudTable.ts`（回调形式 `validate(cb)`，EP 内部不拒绝）。
 * 统一收敛到本函数后，"校验失败必须安静地返回 false" 只有一处实现。
 *
 * 返回 false 的两种情形都**不得继续提交**：校验未通过、表单实例尚未挂载
 * （后者取自上面两处正确站点的既有约定 `if (!formRef.value) return`——
 * 表单没挂载就没有校验依据，放行等于提交未校验数据）。
 */
export async function validateForm(formRef?: FormInstance | null): Promise<boolean> {
  if (!formRef) return false
  try {
    await formRef.validate()
    return true
  } catch {
    // 校验失败：EP 已在各字段下方渲染红字提示，这里只负责"不要让它变成未捕获拒绝"
    return false
  }
}
