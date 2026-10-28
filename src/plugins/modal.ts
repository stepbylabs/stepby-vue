import { ElMessage, ElMessageBox, ElNotification, ElLoading } from 'element-plus'
import i18n from '@/i18n'
import { errorHub } from '@/utils/errorHub'

// P1 修复: 使用栈结构管理多个 loading 实例，避免并发调用时第二次覆盖第一次的引用
// 导致第一次的 loading 永远无法关闭（loadingInstance 单例并发泄漏问题）
const loadingStack: ReturnType<typeof ElLoading.service>[] = []

// ElMessage / ElNotification 同时支持 string 和 options 对象作为参数
// 这里使用联合类型，保留与 ElMessage 原生 API 一致的灵活性
type MessageContent = Parameters<typeof ElMessage>[0]

// i18n 标题统一获取（避免硬编码中文，支持多语言）
const t = i18n.global.t
const tipTitle = () => t('common.tip')

// 将 ElMessage / ElNotification 的内容参数归一化为展示字符串，供 errorHub 记录
function toString(content: MessageContent): string {
  if (typeof content === 'string') return content
  const message = (content as { message?: string } | null)?.message
  return typeof message === 'string' ? message : ''
}

export default {
  // 消息提示
  msg(content: MessageContent) {
    ElMessage.info(content)
  },
  // 消息提示（msgInfo 别名，与 msg 等效）
  msgInfo(content: MessageContent) {
    ElMessage.info(content)
  },
  // 错误消息（统一经 errorHub 聚合弹窗并写入问题监控，避免一屏一串）
  msgError(content: MessageContent) {
    errorHub.report('error', 'other', toString(content))
  },
  // 成功消息
  msgSuccess(content: MessageContent) {
    ElMessage.success(content)
  },
  // 警告消息（统一经 errorHub 聚合弹窗并写入问题监控）
  msgWarning(content: MessageContent) {
    errorHub.report('warning', 'other', toString(content))
  },
  // 弹出提示
  alert(content: string) {
    ElMessageBox.alert(content, tipTitle())
  },
  // 错误提示
  alertError(content: string) {
    ElMessageBox.alert(content, tipTitle(), { type: 'error' })
  },
  // 成功提示
  alertSuccess(content: string) {
    ElMessageBox.alert(content, tipTitle(), { type: 'success' })
  },
  // 警告提示
  alertWarning(content: string) {
    ElMessageBox.alert(content, tipTitle(), { type: 'warning' })
  },
  // 通知提示
  notify(content: Parameters<typeof ElNotification>[0]) {
    ElNotification.info(content)
  },
  // 错误通知（统一经 errorHub 聚合弹窗并写入问题监控）
  notifyError(content: Parameters<typeof ElNotification>[0]) {
    errorHub.report('error', 'other', typeof content === 'string' ? content : content?.message || '')
  },
  // 成功通知
  notifySuccess(content: Parameters<typeof ElNotification>[0]) {
    ElNotification.success(content)
  },
  // 警告通知（统一经 errorHub 聚合弹窗并写入问题监控）
  notifyWarning(content: Parameters<typeof ElNotification>[0]) {
    errorHub.report('warning', 'other', typeof content === 'string' ? content : content?.message || '')
  },
  // 确认窗体
  confirm(content: string) {
    return ElMessageBox.confirm(content, t('common.systemTip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })
  },
  // 提交内容
  prompt(content: string) {
    return ElMessageBox.prompt(content, t('common.systemTip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })
  },
  // 打开遮罩层
  loading(content: string) {
    const instance = ElLoading.service({
      lock: true,
      text: content,
      background: 'rgba(0, 0, 0, 0.7)'
    })
    loadingStack.push(instance)
    // b117：返回实例，供长任务刷新文案（分片上传进度）；既有调用点忽略返回值即可
    return instance
  },
  /**
   * 更新栈顶 loading 的文案（b117）。
   *
   * 分片上传（>8MB）此前只有一个固定文案的遮罩：1GB 文件在慢网下要盯几分钟的"请稍候"，
   * 而 `uploadFileChunked` 的进度回调**没有消费点**（写了没接线=没写）。
   * 栈顶语义与 closeLoading 的 LIFO 一致：并发上传时进度只刷新最近打开的那一个。
   * 栈空时静默跳过（loading 已关闭而回调迟到，不是错误）。
   */
  updateLoading(content: string) {
    const instance = loadingStack[loadingStack.length - 1]
    instance?.setText(content)
  },
  // 关闭遮罩层
  closeLoading() {
    // P1 修复: 栈结构支持嵌套调用，按 LIFO 顺序关闭
    const instance = loadingStack.pop()
    if (instance) {
      instance.close()
    }
  }
}
