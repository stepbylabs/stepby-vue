import { App } from 'vue'
import hasRole from './permission/hasRole'
import hasPermi from './permission/hasPermi'
import copyText from './common/copyText'
import watermark from './common/watermark'
import desensitize from './common/desensitize'

export default function directive(app: App) {
  app.directive('hasRole', hasRole)
  app.directive('hasPermi', hasPermi)
  app.directive('copyText', copyText)
  app.directive('watermark', watermark)
  app.directive('desensitize', desensitize)
}
