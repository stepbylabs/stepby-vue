/**
 * 图标选择器的懒加载目录（b121）。
 *
 * 图标包是**单个 ESM 模块**：设计器的全量命名空间导入会把 293 个图标钉进与首屏
 * 具名导入共享的 chunk（实测首屏图标块 42.4KB gzip，其中首屏真正用到 91 个 ≈13.3KB）。
 * `?catalog` 让 Rolldown 把它当成**另一个模块实例**：首屏的 91 个具名导入照常摇树，
 * 设计器打开时再加载这一份完整目录（全量副本只存在于懒加载 chunk）。
 */
declare module '@element-plus/icons-vue?catalog' {
  export * from '@element-plus/icons-vue'
}
