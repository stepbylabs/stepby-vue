/**
 * 把内存里的内容交给浏览器保存为文件——全仓唯一实现（b112）。
 *
 * ## 立项取证（b112 实测；`git grep` HEAD 口径 = 8 个下载点 / 3 种写法）
 *
 * - **手搓 anchor 4 份**（`ai/panel` 的 CSV、`monitor/aiHistory` 的 xlsx、`monitor/operlog`
 *   的归档 JSONL、`useEchartsWidget` 的图表 PNG）：前三处 `createObjectURL` → `a.click()`
 *   → **同一 tick `revokeObjectURL`**，且三处都不把 anchor 挂进文档。同步回收抢在浏览器
 *   真正开始读 URL 之前——Firefox/Safari 上会得到"下载失败 / 0 字节"，而同一段代码在
 *   Chrome 上完全正常（同 `copyText` 那批的"在本机测不出来"，只是这次坏的是另一个浏览器）；
 *   `a.click()` 抛错时 URL 直接永久泄漏。第四处用的是 data URL：锚点生命周期是对的，
 *   但把整张 PNG 塞进 DOM 属性、且**在点击后立刻报"图表已下载"**。
 * - **直连 `file-saver` 4 份**（`utils/request.download`、`plugins/download.saveAs`、
 *   `api/system/auditChange`、`api/system/backup`）：回收时机是对的，但失败无人接——
 *   后两处把异常直接穿给页面（`auditChange` 的契约测试 mock 掉了 `file-saver`，
 *   所以"保存失败"这一支在单测里结构上不存在）。
 * - **空载荷无人判**：服务端回 0 字节（导出失败却回了 200）时，八处都会生成 0 字节文件
 *   并当成功；用户拿到的是"打开报损坏"的文件，界面上是一次成功。
 *
 * ## 语义
 *
 * - 返回**是否把文件交给了保存通道**（载荷非空 + 通道未抛错）；**不抛错**。
 * - **`true` 不等于"已落盘"**：`a.click()` 之后浏览器是否保存、保存到哪，页面**无法观测**
 *   （`file-saver` 内部走的就是这条不可观测通道）。这与 `copyText` 方向相反——剪贴板能读到
 *   真实结果，文件不能。因此调用方的成功提示只能表述为"已发起下载"，**不得**写成"下载成功"；
 *   `false` 才是可以也确实必须报错的那一支。
 * - 空 blob（`size === 0`）视作失败：0 字节文件必然打不开，交出去只会让用户以为导出成功了。
 * - 文件名取空视作失败：`saveAs` 会得到一个无名文件，用户根本找不到它。
 */
import { saveAs } from 'file-saver'

/** 保存结果：`false` 只代表"没交出去"，`true` 不代表"已落盘"（见模块文档） */
export function saveBlob(blob: Blob | null | undefined, fileName: string): boolean {
  if (!(blob instanceof Blob) || blob.size === 0) return false
  if (!fileName || !fileName.trim()) return false
  try {
    saveAs(blob, fileName)
    return true
  } catch (e) {
    if (import.meta.env.DEV) console.error('[saveBlob] 保存通道抛错:', e)
    return false
  }
}

/**
 * data URL → Blob 再走同一条保存通道（图表导出用：`echarts.getDataURL()` 的产出）。
 *
 * 直接把 data URL 赋给 `a.href` 会把整张图塞进 DOM 属性，且绕开了 `saveBlob` 的
 * 空载荷/失败语义。这里按 RFC 2397 解一层，非 base64 的百分号编码也照常支持
 * （`getDataURL` 只产 base64，但解出来的工具不应该只认一种）。
 */
export function saveDataUrl(dataUrl: string, fileName: string): boolean {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return false
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return false
  const meta = dataUrl.slice('data:'.length, comma)
  const payload = dataUrl.slice(comma + 1)
  const mime = meta.split(';')[0] || 'application/octet-stream'
  try {
    const bytes = /;base64/i.test(meta)
      ? Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload))
    return saveBlob(new Blob([bytes], { type: mime }), fileName)
  } catch (e) {
    if (import.meta.env.DEV) console.error('[saveDataUrl] data URL 解析失败:', e)
    return false
  }
}
