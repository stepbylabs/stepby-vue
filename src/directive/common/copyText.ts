/**
 * v-copyText 复制文本内容
 * Copyright (c) 2026 Stepby
 *
 * 用法：
 *   <el-button v-copyText="text" v-copyText:callback="onCopy">复制</el-button>
 *
 * `onCopy(ok, value)` 收到的是**真实结果**（b111）：必须据 `ok` 分支提示，
 * 不得在复制失败时也报"复制成功"。不给回调时，失败会弹一条 `common.copyFail`
 * ——"静默失败"与"假成功"是同一族缺陷的两个方向。
 */
import { ElMessage } from 'element-plus'
import i18n from '@/i18n'
import { copyText } from '@/utils/clipboard'

type CopyCallback = (ok: boolean, value: string) => void

interface CopyHTMLElement extends HTMLElement {
  $copyValue?: string
  $copyCallback?: CopyCallback
  $destroyCopy?: () => void
}

function normalize(value: unknown): string {
  return value == null ? '' : String(value)
}

export default {
  beforeMount(el: HTMLElement, { value, arg }: DirectiveBinding) {
    const copyEl = el as CopyHTMLElement
    if (arg === 'callback') {
      copyEl.$copyCallback = value as CopyCallback
      return
    }
    copyEl.$copyValue = normalize(value)
    const handler = async () => {
      const text = copyEl.$copyValue || ''
      const ok = await copyText(text)
      if (copyEl.$copyCallback) copyEl.$copyCallback(ok, text)
      else if (!ok) ElMessage.error(i18n.global.t('common.copyFail'))
    }
    el.addEventListener('click', handler)
    copyEl.$destroyCopy = () => el.removeEventListener('click', handler)
  },
  // 指令必须跟住值：缺少 updated 时，绑定值变了仍复制挂载那一刻的旧值
  // （实证：代码生成预览页切换语言页签后，复制的仍是上一个文件的内容）。
  updated(el: HTMLElement, { value, arg }: DirectiveBinding) {
    const copyEl = el as CopyHTMLElement
    if (arg === 'callback') copyEl.$copyCallback = value as CopyCallback
    else copyEl.$copyValue = normalize(value)
  },
  unmounted(el: HTMLElement) {
    const copyEl = el as CopyHTMLElement
    if (copyEl.$destroyCopy) {
      copyEl.$destroyCopy()
      copyEl.$destroyCopy = undefined
    }
  }
}
