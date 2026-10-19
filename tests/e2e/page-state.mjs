/**
 * 页面"落确定态"的**唯一**判据实现（批七十四 T1，取代 main.mjs / deep-e2e.mjs 两份重复探针）。
 *
 * ## 为什么必须重写（不是调参）
 *
 * b73 轮 18 把 74 处 `record(M, 'x 页面加载', true)` 换成了四条判据，方向对，但两条判据
 * 的**测量对象选错了**，于是"空壳页与正常页不可区分"：
 * - `contentRoot` 的选择器串里含 `.app-container` 与 `.el-empty`，且在 **整份 document**
 *   上求可见性——布局外壳本身就在 document 里，任何路由状态都恒真；
 * - `text` 取 `document.body.innerText`——导航菜单/面包屑/版权栏恒有文字，
 *   即使是白屏的内容区也能拿到几十字符。
 * 结果：深链落空、路由没匹配组件、内容区空白这三种"用户看得见坏了"的形态仍然记 ✅。
 *
 * ## 现在的判据
 *
 * 关键改动是**测量作用域**：探针先取路由出口 `.app-main`（无布局页退到 `body`），
 * 所有内容量都只在这个作用域里取——外壳的菜单文字再也进不了判据。
 * ① 未落到 ErrorBoundary（崩页兜底）；
 * ② 未落到 404 / error-page 容器；
 * ③ 作用域内没有 error/warning Toast 残留；
 * ④ 作用域内**有内容**：业务元素 ≥1，**或**可见文本 ≥ 40 字符
 *    （两条并列是有意的：iframe 型页面（swagger）、图表页、图片页的 innerText 可以为 0，
 *    判据不得把"合法但不写字"的页面判死——"为规范把合法页挡掉"同样是缺陷）。
 *
 * 探针与判据分离：`PAGE_STATE_PROBE` 是自包含函数（交给 `page.evaluate`），
 * `judgePageLoaded` 是纯函数（自检直接喂合成数据即可证伪，不必起浏览器）。
 */

/** 作用域内的"业务元素"清单：EP 组件 + 内容型标签（判据 ④ 的第一条腿） */
export const CONTENT_SELECTOR =
  '.el-table,.el-card,.el-tree,.el-form,.el-descriptions,.el-row,.el-tabs__content,' +
  '.el-empty,.el-result,.el-timeline,.el-steps,.app-container,canvas,svg,iframe,img,' +
  'video,pre,code,h1,h2,h3,p,ul,ol,table,form'

/** 布局外壳里的"非内容"节点：即便出现在 .app-main 也不得算作业务内容 */
const SHELL_CHILD_SELECTOR = '.el-backtop,.copyright'

/**
 * 浏览器侧探针。必须自包含（`page.evaluate` 不携带闭包），故选择器内联。
 * @returns {{hasLayout:boolean, contentNodes:number, scopeText:number, emptyState:boolean,
 *            crashed:boolean, notFound:boolean, msgToast:number}}
 */
export const PAGE_STATE_PROBE = () => {
  const visible = (root, sel) =>
    Array.from(root.querySelectorAll(sel)).some((el) => el.getClientRects().length > 0)
  const CONTENT =
    '.el-table,.el-card,.el-tree,.el-form,.el-descriptions,.el-row,.el-tabs__content,' +
    '.el-empty,.el-result,.el-timeline,.el-steps,.app-container,canvas,svg,iframe,img,' +
    'video,pre,code,h1,h2,h3,p,ul,ol,table,form'
  const SHELL = '.el-backtop,.copyright'
  const main = document.querySelector('.app-main')
  // 有布局页只看路由出口内部；登录/注册/OAuth 等无布局页退到 body
  const scope = main || document.body
  let contentNodes = 0
  for (const el of Array.from(scope.querySelectorAll(CONTENT))) {
    if (el.closest(SHELL)) continue
    if (el.getClientRects().length > 0) contentNodes += 1
  }
  return {
    hasLayout: !!main,
    contentNodes,
    scopeText: (scope.innerText || '').trim().length,
    emptyState: visible(scope, '.el-empty,.el-result,.el-table__empty-block'),
    crashed: visible(document.body, '.error-boundary'),
    notFound: visible(scope, '.wscn-http404-container,.page-404,.error-page'),
    msgToast: document.querySelectorAll('.el-message--error,.el-message--warning').length
  }
}

/** 判据 ④ 的文本下限（空壳的内容区拿不到，正常页轻松超过） */
export const MIN_SCOPE_TEXT = 40

/**
 * 纯判据：给定探针结果，给出结论、失败原因与可直接落台账的实测量。
 * @param {ReturnType<typeof PAGE_STATE_PROBE>} v
 * @returns {{ok:boolean, reasons:string[], detail:string, emptyState:boolean}}
 */
export function judgePageLoaded(v) {
  const reasons = []
  if (v.crashed) reasons.push('落到 ErrorBoundary（崩页兜底）')
  if (v.notFound) reasons.push('落到 404/error-page 容器')
  if (v.msgToast > 0) reasons.push(`残留 error/warning Toast ×${v.msgToast}`)
  if (v.contentNodes === 0 && v.scopeText < MIN_SCOPE_TEXT) {
    reasons.push(`内容区既无业务元素也无足量文本（contentNodes=0, text=${v.scopeText}）`)
  }
  return {
    ok: reasons.length === 0,
    reasons,
    emptyState: v.emptyState,
    detail:
      `layout=${v.hasLayout}, contentNodes=${v.contentNodes}, scopeText=${v.scopeText}, ` +
      `emptyState=${v.emptyState}, msgToast=${v.msgToast}, crashed=${v.crashed}, ` +
      `notFound=${v.notFound}`
  }
}
