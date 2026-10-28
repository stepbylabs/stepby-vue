/**
 * 复制文本到剪贴板——全仓唯一实现（b111）。
 *
 * ## 立项取证（b111 实测；`git grep` HEAD 口径 = 11 个文件 / 11 份实现 / 17 个用户入口）
 *
 * - **假成功 3 份**：指令 `v-copyText` 与 `frontendError` / `operlog` 详情页的降级分支
 *   都忽略 `document.execCommand('copy')` 的返回值，剪贴板没写进去也照样弹"复制成功"；
 * - **无降级 5 份**：`about` / `build` / `http-debugger` / `shortcuts` / 租户域名面板只调
 *   `navigator.clipboard`。该 API **只在安全上下文存在**——自托管用 `http://<内网IP>` 打开时
 *   它是 `undefined`，这五处要么当场抛错、要么永远复制不了；
 * - **硬 TypeError 1 份**：文件页 `navigator.clipboard.writeText(...)` 连存在性都没判，
 *   http 部署下点"复制链接"会在事件处理器里同步抛错 → 由 ErrorBoundary 接管（整页被卸载）；
 * - **旧值 1 份**：指令没有 `updated` 钩子，`gen/preview` 切换语言页签后仍复制上一个文件的内容。
 * - `patToken` / `oauth client` 两份本来就有正确的降级语义，本批只是并入单一通道（无行为变化）。
 *
 * 与 b89 的 `webStorage` 同一条纪律：**浏览器提供的"能力"是会抛错的通道**，
 * 收敛成一条实现，调用方只消费布尔结果、不再各写各的防御姿势。
 *
 * ## 语义
 *
 * - 返回**是否真的写进了剪贴板**（调用方必须据此提示，不得一律报成功）；
 * - **绝不抛错**：权限被拒、非安全上下文、`execCommand` 抛异常一律折算成 `false`；
 * - 空文本视作失败（复制空串没有意义，且各页面的"无内容"按钮本就该给失败提示）；
 * - 降级路径负责复原焦点，避免把键盘焦点留在隐藏的 textarea 上（可访问性）。
 */
export async function copyText(text: unknown): Promise<boolean> {
  const value = text == null ? '' : String(text)
  if (!value) return false
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // 权限被拒 / 浏览器策略 / 非安全上下文：交给降级通道再试一次，这里不下结论
    }
  }
  return legacyCopy(value)
}

/** 降级通道：隐藏 textarea + `execCommand('copy')`，返回真实结果并复原焦点 */
function legacyCopy(value: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const active = document.activeElement as HTMLElement | null
  const ta = document.createElement('textarea')
  ta.value = value
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  let ok = false
  try {
    ta.select()
    ta.setSelectionRange(0, value.length)
    ok = document.execCommand('copy') === true
  } catch {
    ok = false
  } finally {
    ta.remove()
    active?.focus?.()
  }
  return ok
}
