/**
 * HTML 净化工具（DOM 相关，依赖浏览器/jsdom 环境）
 *
 * 将 sanitizeForPrint 从 pdf.ts 抽离为独立纯函数，便于在 jsdom 环境下单测，
 * 且不再依赖 html2pdf / i18n 等模块，测试更轻量。
 */

/**
 * 净化待打印的元素副本（P2：修复 element.outerHTML 直写打印窗口的潜在 XSS）
 *
 * 原实现将 element.outerHTML 原样写入打印窗口——若元素内部含有未净化的
 * v-html 数据（如富文本/公告内容），脚本/事件属性会在打印窗口执行。
 * 现改为：克隆节点 → 移除 script/iframe/object/embed/link/meta/style 等可执行/危险元素
 * → 剥离 on* 事件属性（含顶层与所有后代）→ 再返回 outerHTML。
 * 打印样式场景不受影响（仅移除可执行内容）。
 *
 * @param element 待净化的源 DOM 元素
 * @returns 净化后的 outerHTML 字符串
 */
export function sanitizeForPrint(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement
  // 移除可执行/危险元素
  clone.querySelectorAll('script, iframe, object, embed, link, meta, style').forEach((el) => el.remove())
  // 剥离 on* 事件属性（遍历所有元素）
  // HTMLElement.attributes 在浏览器/jsdom 中恒存在（NamedNodeMap），无需 || [] 兜底
  clone.querySelectorAll('*').forEach((el) => {
    const attrs = Array.from(el.attributes)
    attrs.forEach((attr) => {
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name)
      }
    })
  })
  // 顶层元素自身也可能带事件属性
  Array.from(clone.attributes).forEach((attr) => {
    if (/^on/i.test(attr.name)) {
      clone.removeAttribute(attr.name)
    }
  })
  return clone.outerHTML
}
