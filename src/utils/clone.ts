/**
 * 把**响应式对象**还原成可结构化克隆的普通对象再深拷贝。
 *
 * `structuredClone(reactiveObj)` 必抛 `DataCloneError`——Proxy 不是可结构化克隆类型，
 * 而 `ref` / `reactive` 的值就是 Proxy。因此"提交前克隆一份快照"若直接写
 * `structuredClone(info.value)`，异常会从点击处理器里逸出：用户看到的是"按钮没反应"，
 * 而 DEV 控制台里只有一行 `Failed to clone`（b126 实现在代码生成配置页）。
 *
 * `toRaw` 只解**顶层**代理，这恰好足够：嵌套对象在被访问前一直是原始对象，
 * 代理是旁路包装、从不改写原对象；而接口响应里不会出现显式 `reactive()` 的子值。
 *
 * 只适用于 JSON 型数据（接口响应）。含 Date / Map / Set / 类实例的对象请直接
 * `structuredClone` 其原始值，不要经本函数（本函数不做类型保留承诺）。
 */
import { toRaw } from 'vue'

export function clonePlain<T>(value: T): T {
  return structuredClone(toRaw(value))
}
