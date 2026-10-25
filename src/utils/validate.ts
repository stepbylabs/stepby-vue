/**
 * 路径匹配器
 * @param pattern
 * @param path
 * @returns {Boolean}
 */
export function isPathMatch(pattern: string, path: string): boolean {
  const regexPattern = pattern
    .replace(/([.+^${}()|[\]\\])/g, '\\$1')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '[^/]')
  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

/**
 * 判断value字符串是否为空
 * 处理 null、undefined、空字符串、纯空白字符串
 * @param value
 * @returns {Boolean}
 */
export function isEmpty(value: unknown): boolean {
  if (value == null || value == undefined || value == 'undefined') {
    return true
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true
  }
  return false
}

/**
 * 外部输入（URL 参数等）→ 正整数 ID；非法一律返回 0（调用方以 0 判"不发请求"）。
 *
 * 不用裸 `Number()`：IEEE754 把 100 位数字串折成 `1.11e+99`，畸形深链因此**照常发出**
 * 成 `/system/user/authRole/1.111111111111111e+99` 这样的请求（b73 轮 16 取证见
 * `tests/e2e/RUN-RECIPE.md` §3.59）。15 位上限是 `Number.isSafeInteger` 的十进制位数边界。
 * 形状锁：`src/utils/routeParamNumber.guard.test.ts` 禁止全仓再出现裸 `Number(route.…)`。
 * @param raw
 * @returns {Number}
 */
export function toPositiveInt(raw: unknown): number {
  const s = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''
  if (!/^\d+$/.test(s)) return 0
  const n = Number(s)
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

/**
 * 判断url是否是http或https
 * 同时处理协议相对 URL（以 // 开头）
 * @param url
 * @returns {Boolean}
 */
export function isHttp(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return url.indexOf('http://') !== -1 || url.indexOf('https://') !== -1 || url.startsWith('//')
}

/**
 * 判断path是否为外链
 *
 * 认四支：`http(s):`、`mailto:`、`tel:` 与协议相对 `//host`。最后一支不是新增语义——
 * 它同样是"离开本应用"的地址，漏掉它会让 `//cdn/x.png` 被当成站内资源拼上 baseAPI
 * （ImagePreview/ImageUpload/user.ts 三处都受此影响），菜单外链也会被折叠成站内路由。
 * @param path
 * @returns {Boolean}
 */
export function isExternal(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  return /^(https?:|mailto:|tel:|\/\/)/.test(path)
}

/**
 * 判断 url 是否为**绝对地址**（含协议相对 `//host`）。
 *
 * 与 `isHttp` 的区别是锚定在串首：`/iframe?u=https://x` 是站内路径，不是绝对地址。
 * `isExternal` 回答"是否离开本应用"，本函数回答"这个地址是否自带 host"——IframeToggle
 * 只需要后者（决定返回完整 URL 还是 pathname），拿前者会把 `tel:` 判成可嵌入的绝对地址。
 * @param url
 * @returns {Boolean}
 */
export function isAbsoluteUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return /^(https?:)?\/\//i.test(url)
}

// ==================== 图片 magic bytes 校验（FE-002）====================

/** 图片类型签名（magic bytes）定义 */
const IMAGE_MAGIC_BYTES: Record<string, number[]> = {
  // JPEG: FF D8 FF
  jpeg: [0xff, 0xd8, 0xff],
  jpg: [0xff, 0xd8, 0xff],
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // GIF: 47 49 46 38 (GIF8)
  gif: [0x47, 0x49, 0x46, 0x38]
}

/** 允许的图片扩展名白名单 */
const IMAGE_EXTENSION_WHITELIST = ['jpg', 'jpeg', 'png', 'gif']

/**
 * 通过 magic bytes 校验图片真实类型（FE-002）
 *
 * 浏览器的 file.type 基于扩展名推断，可被伪造。
 * 本函数读取文件头前几个字节，与预定义的 magic bytes 比对，判断真实类型。
 * 同时校验扩展名是否在白名单内，实现双重防护。
 *
 * @param file 待校验的文件
 * @param allowedTypes 允许的类型列表（如 ['jpeg', 'png', 'gif']），默认全部白名单
 * @returns 是否为合法图片
 */
export async function verifyImageMagicBytes(
  file: File,
  allowedTypes: string[] = IMAGE_EXTENSION_WHITELIST
): Promise<boolean> {
  // 1. 扩展名白名单校验
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (!IMAGE_EXTENSION_WHITELIST.includes(ext)) {
    return false
  }

  // 2. magic bytes 校验
  // 读取前 8 字节足够覆盖所有支持的图片类型签名
  const header = await readFileHeader(file, 8)
  const isValid = allowedTypes.some((type) => {
    const signature = IMAGE_MAGIC_BYTES[type]
    if (!signature) return false
    return signature.every((byte, idx) => header[idx] === byte)
  })

  return isValid
}

/**
 * 读取文件头部指定长度的字节
 */
function readFileHeader(file: File, length: number): Promise<number[]> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const buf = new Uint8Array(reader.result as ArrayBuffer)
      const header: number[] = []
      for (let i = 0; i < Math.min(length, buf.length); i++) {
        header.push(buf[i])
      }
      resolve(header)
    }
    reader.onerror = () => resolve([])
    reader.readAsArrayBuffer(file.slice(0, length))
  })
}
