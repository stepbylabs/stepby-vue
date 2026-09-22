/**
 * T-11：操作日志模块标题展示——后端 oper_log_middleware::infer_module_title 与 auth_handler
 * 将 title 存为 i18n key 形式 "module.xxx"，历史数据则直接存中文原文。
 * 前端字典在顶层命名空间 operlog 下：i18n key 为 "operlog.module.xxx"（无 "module." 前缀），
 * 故需先剥离存储前缀再拼接；缺翻译时回退为剥离前缀后的短名（如 "backup"），
 * 避免界面露出裸 "module.backup"。
 *
 * translate/exists 由调用方注入（useI18n 的 t/te），以保持各消费点随语言切换响应式。
 */
export function formatModuleTitle(
  title: string | undefined | null,
  translate: (key: string) => string,
  exists: (key: string) => boolean
): string {
  if (!title) return ''
  const moduleKey = title.startsWith('module.') ? title.slice('module.'.length) : title
  const key = `operlog.module.${moduleKey}`
  return exists(key) ? translate(key) : moduleKey
}
