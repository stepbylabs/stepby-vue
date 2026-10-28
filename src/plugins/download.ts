import axios, { type AxiosResponse } from 'axios'
import { ElLoading } from 'element-plus'
import { saveBlob } from '@/utils/saveBlob'
import i18n from '@/i18n'
import { getToken } from '@/utils/auth'
import errorCode from '@/utils/errorCode'
import { blobValidate } from '@/utils/stepby'
import { errorHub } from '@/utils/errorHub'

const baseURL = import.meta.env.VITE_APP_BASE_API

/**
 * 解析响应头 download-filename（后端 Content-Disposition 的 filename* 派生值）。
 *
 * 缺失/为空时回退 fallback —— 原先直接 `decodeURIComponent(undefined)` 会得到字符串
 * "undefined"，用户拿到一个叫 undefined 的文件；
 * 百分号编码非法（如截断的 %E4%BF，decodeURIComponent 抛 URIError）时原样返回，
 * 绝不让整条下载链路因文件名而抛错丢掉已取到的有效 blob。
 */
function resolveFilename(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default {
  name(name: string, isDelete = true) {
    // P0 修复：添加 loading 提示和错误处理，与 zip 方法保持一致
    // 使用局部变量：避免并发下载时模块级 loading 实例被覆盖
    const downloadLoadingInstance = ElLoading.service({
      text: i18n.global.t('common.downloading'),
      background: 'rgba(0, 0, 0, 0.7)'
    })
    const url = baseURL + '/common/download?fileName=' + encodeURIComponent(name) + '&delete=' + isDelete
    axios({
      method: 'get',
      url: url,
      responseType: 'blob',
      timeout: 60000,
      headers: { Authorization: 'Bearer ' + getToken() }
    })
      .then((res: AxiosResponse<Blob>) => {
        const isBlob = blobValidate(res.data)
        if (isBlob) {
          const blob = new Blob([res.data])
          this.saveAs(blob, resolveFilename(res.headers['download-filename'], name))
        } else {
          this.printErrMsg(res.data)
        }
        downloadLoadingInstance.close()
      })
      .catch((r: unknown) => {
        if (import.meta.env.DEV) console.error('[download]', (r as { message?: string })?.message || r)
        errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
        downloadLoadingInstance.close()
      })
  },
  resource(resource: string) {
    // P0 修复：添加 loading 提示和错误处理，与 zip 方法保持一致
    // 使用局部变量：避免并发下载时模块级 loading 实例被覆盖
    const downloadLoadingInstance = ElLoading.service({
      text: i18n.global.t('common.downloading'),
      background: 'rgba(0, 0, 0, 0.7)'
    })
    const url = baseURL + '/common/download/resource?resource=' + encodeURIComponent(resource)
    axios({
      method: 'get',
      url: url,
      responseType: 'blob',
      timeout: 60000,
      headers: { Authorization: 'Bearer ' + getToken() }
    })
      .then((res: AxiosResponse<Blob>) => {
        const isBlob = blobValidate(res.data)
        if (isBlob) {
          const blob = new Blob([res.data])
          // 回退名取资源路径最后一段（如 /profile/upload/x.png → x.png）
          this.saveAs(blob, resolveFilename(res.headers['download-filename'], resource.split('/').pop() || resource))
        } else {
          this.printErrMsg(res.data)
        }
        downloadLoadingInstance.close()
      })
      .catch((r: unknown) => {
        if (import.meta.env.DEV) console.error('[download resource]', (r as { message?: string })?.message || r)
        errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
        downloadLoadingInstance.close()
      })
  },
  zip(url: string, name: string) {
    const downloadUrl = baseURL + url
    // 使用局部变量：避免并发下载时模块级 loading 实例被覆盖
    const downloadLoadingInstance = ElLoading.service({
      text: i18n.global.t('common.downloading'),
      background: 'rgba(0, 0, 0, 0.7)'
    })
    axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'blob',
      timeout: 60000,
      headers: { Authorization: 'Bearer ' + getToken() }
    })
      .then((res: AxiosResponse<Blob>) => {
        const isBlob = blobValidate(res.data)
        if (isBlob) {
          const blob = new Blob([res.data], { type: 'application/zip' })
          this.saveAs(blob, name)
        } else {
          this.printErrMsg(res.data)
        }
        downloadLoadingInstance.close()
      })
      .catch((r: unknown) => {
        if (import.meta.env.DEV) console.error('[download zip]', (r as { message?: string })?.message || r)
        errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
        downloadLoadingInstance.close()
      })
  },
  saveAs(text: Blob, name: string) {
    // 统一走 utils/saveBlob：空载荷/通道抛错必须可见，且成功不弹"下载成功"
    if (!saveBlob(text, name)) errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
  },
  async printErrMsg(data: Blob) {
    const resText = await data.text()
    try {
      const rspObj = JSON.parse(resText)
      const errMsg = errorCode[rspObj.code] || rspObj.msg || errorCode['default']
      errorHub.report('error', 'download', errMsg)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[download] Failed to parse error response:', e)
      errorHub.report('error', 'download', i18n.global.t('common.downloadError'))
    }
  }
}
