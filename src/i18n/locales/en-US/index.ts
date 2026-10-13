// en-US 语言包 —— 按模块拆分聚合导出
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应分类文件

import common from './common'
import auth from './auth'
import dashboard from './dashboard'
import system from './system'
import monitor from './monitor'
import tool from './tool'
import error from './error'
import route from './route'
import time from './time'
import stepby from './stepby'

export default {
  ...common,
  ...auth,
  ...dashboard,
  ...system,
  ...monitor,
  ...tool,
  ...error,
  ...route,
  ...time,
  ...stepby
}
