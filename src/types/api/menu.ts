import type { RouteComponent, RouteRecordName, RouteRecordRedirect, RouteMeta } from 'vue-router'

/**
 * 应用路由记录类型：经 filterAsyncRouter 解析后的路由对象。
 *
 * 与 `RouterVo`（后端原始数据，component 为字符串）不同，`AppRouteRecord`
 * 的 component 已解析为实际 Vue 组件，可直接传给 `router.addRoute`。
 *
 * 兼容 vue-router 的 `RouteRecordRaw` 约束，同时携带 stepby 框架自定义字段
 * （hidden、permissions、roles 等），供侧边栏、面包屑等组件使用。
 */
export interface AppRouteRecord {
  /** 路由名字 */
  name?: RouteRecordName
  /** 路由地址 */
  path: string
  /** 是否隐藏路由，当设置 true 的时候该路由不会再侧边栏出现 */
  hidden?: boolean
  /** 重定向地址，当设置 noRedirect 的时候该路由在面包屑导航中不可被点击 */
  redirect?: RouteRecordRedirect | string
  /** 组件（经 filterAsyncRouter 解析后为实际组件，原始数据中为字符串路径） */
  component?: RouteComponent | string
  /** 路由参数：如 {"id": 1, "name": "stepby"} */
  query?: string
  /** 当你一个路由下面的 children 声明的路由大于1个时，自动会变成嵌套的模式--如组件页面 */
  alwaysShow?: boolean
  /** 其他元素 */
  meta?: RouteMeta
  /** 访问路由的菜单权限 */
  permissions?: string[]
  /** 访问路由的角色权限 */
  roles?: string[]
  /** 子路由 */
  children?: AppRouteRecord[]
  /** TopNav 组件使用的父路径标记 */
  parentPath?: string
  /** SidebarItem 组件使用的"仅有一个可见子路由"标记 */
  noShowingChildren?: boolean
}

/** 后端返回的路由信息（component 为字符串路径，待 filterAsyncRouter 解析为实际组件） */
export interface RouterVo {
  /** 路由名字 */
  name?: string
  /** 路由地址 */
  path?: string
  /** 是否隐藏路由，当设置 true 的时候该路由不会再侧边栏出现 */
  hidden?: boolean
  /** 重定向地址，当设置 noRedirect 的时候该路由在面包屑导航中不可被点击 */
  redirect?: string
  /** 组件地址 */
  component?: string
  /** 路由参数：如 {"id": 1, "name": "stepby"} */
  query?: string
  /** 当你一个路由下面的 children 声明的路由大于1个时，自动会变成嵌套的模式--如组件页面 */
  alwaysShow?: boolean
  /** 其他元素 */
  meta?: MetaVo
  /** 子路由 */
  children?: RouterVo[]
}

/** 路由其他元素信息 */
export interface MetaVo {
  /** 设置该路由在侧边栏和面包屑中展示的名字 */
  title?: string
  /** 设置该路由的图标，对应路径src/assets/icons/svg */
  icon?: string
  /** 设置为true，则不会被 <keep-alive>缓存 */
  noCache?: boolean
  /** 内链地址（http(s)://开头） */
  link?: string
  /** i18n 翻译 key（可选）：前端优先用 t(i18nKey) 翻译标题，回退到 title 原文 */
  i18nKey?: string
}
