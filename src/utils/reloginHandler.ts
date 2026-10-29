/**
 * 「401 重新登录」的登出动作注册点（b124）
 *
 * 原来 `utils/request.ts` 直接 `import useUserStore`，为在对话框确认后调 `logOut()`；
 * 而 user store 又经 `api/login` 依赖 request（发请求）⇒ 静态循环
 * `store/modules/user.ts -> api/login.ts -> utils/request.ts -> store/modules/user.ts`
 * （rolldown `checks.circularDependency` 实测点名）。循环在 ESM 下的实际风险是初始化顺序：
 * 谁先被求值决定 request 里拿到的是 store 工厂还是 TDZ 空档——只在特定入口顺序上炸。
 *
 * 依赖方向改成单向：本模块零依赖，request 读、user store 写。
 * 未注册时（理论上只有测试或 store 尚未加载的极早 401）回落"直接去登录页"，
 * 与原先 `logOut` 失败时的结局一致——不把"没注册"变成一条静默失败的会话。
 */
type ReloginHandler = () => Promise<unknown>

let handler: ReloginHandler | null = null

/** 传 null 表示撤销注册（测试与 HMR 清理用；生产只在 user store 模块加载时注册一次） */
export function registerReloginHandler(fn: ReloginHandler | null): void {
  handler = fn
}

export function getReloginHandler(): ReloginHandler | null {
  return handler
}
