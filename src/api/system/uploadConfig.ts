import request from '@/utils/request'
import type { AjaxResult } from '@/types'

export interface UploadConfigMaskedVo {
  accessKeyMasked: string
  hasAccessKey: boolean
  secretKeyMasked: string
  hasSecretKey: boolean
  endpoint: string
  region: string
  bucket: string
  pathStyle: boolean
  publicEndpoint: string
  backendMode: string
}

export interface UploadConfigUpdateForm {
  accessKey?: string
  secretKey?: string
  endpoint?: string
  region?: string
  bucket?: string
  pathStyle?: boolean
  publicEndpoint?: string
}

// 读取有效配置（access_key / secret_key 掩码回显）
export function getUploadConfig(): Promise<AjaxResult<UploadConfigMaskedVo>> {
  return request({
    url: '/system/uploadConfig',
    method: 'get'
  })
}

// 更新配置（凭据留空 = 整个字段不发 = 保留原值；endpoint 走服务端 SSRF 校验；热生效）
export function updateUploadConfig(form: UploadConfigUpdateForm): Promise<AjaxResult> {
  return request({
    url: '/system/uploadConfig',
    method: 'put',
    data: form
  })
}

/**
 * 凭据字段的**留空**必须折算成「不带」，不能发空串。
 *
 * 页面对这两个输入框的承诺是「留空保留已保存的值」（`uploadConfig.ph.keyKeep`，
 * 掩码回显时可见）。而后端对 `accessKey: ""` 的处理是**写入空值** ⇒
 * `effective_string` 视空为"未覆盖" ⇒ 回落到 config.toml 的出厂值（多半也是空）。
 * 于是"只改 bucket 保存一次"就会把 access key 静默清掉，上传链路当场打瘫——
 * `secretKey` 恰好因为写侧对空串跳过而没事，两个同族字段的语义相反。
 *
 * 「不带」与「带空串」是两种指令（对齐 IP 库凭据 b145 的同一口径）：留空即不发，
 * 真要清掉已存凭据得另有显式出口，而不是靠"留空"这个用户不可能预期会毁数据的动作。
 */
export function buildCredentialPatch(
  accessKey: string,
  secretKey: string
): Pick<UploadConfigUpdateForm, 'accessKey' | 'secretKey'> {
  const patch: Pick<UploadConfigUpdateForm, 'accessKey' | 'secretKey'> = {}
  const ak = accessKey.trim()
  const sk = secretKey.trim()
  if (ak) patch.accessKey = ak
  if (sk) patch.secretKey = sk
  return patch
}

/**
 * 连通性测试（ListObjectsV2 探活）——入参是**屏上这份草稿**。
 *
 * 改造前无 body ⇒ 服务端只能测**已保存**的配置：改完 endpoint/bucket 点「测试」，
 * 拿到的是旧值的结果，于是"测通了、保存后上传全挂"与"测失败了、但改的其实是对的"
 * 两种误导都无解。缺省字段由服务端沿用有效配置，所以 `{}`（或不填任何字段）依旧
 * 等价于"测已存配置"，向后兼容。
 *
 * 必须显式给 body：服务端现在按草稿叠加探活，无 body 会被 JSON 提取器拒成 400。
 */
export function testUploadConfig(form: UploadConfigUpdateForm = {}): Promise<AjaxResult<string>> {
  return request({
    url: '/system/uploadConfig/test',
    method: 'post',
    data: form,
    timeout: 15000
  })
}
