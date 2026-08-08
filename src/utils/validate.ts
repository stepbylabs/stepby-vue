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
 * @param path
 * @returns {Boolean}
 */
export function isExternal(path: string): boolean {
  return /^(https?:|mailto:|tel:)/.test(path)
}

/**
 * @param url
 * @returns {Boolean}
 */
export function validURL(url: string): boolean {
  const reg =
    /^(https?|ftp):\/\/([a-zA-Z0-9.-]+(:[a-zA-Z0-9.&%$-]+)*@)*((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.(com|edu|gov|int|mil|net|org|biz|arpa|info|name|pro|aero|coop|museum|[a-zA-Z]{2}))(:[0-9]+)*(\/($|[a-zA-Z0-9.,?'\\+&%$#=~_-]+))*$/
  return reg.test(url)
}

/**
 * @param str
 * @returns {Boolean}
 */
export function validLowerCase(str: string): boolean {
  const reg = /^[a-z]+$/
  return reg.test(str)
}

/**
 * @param str
 * @returns {Boolean}
 */
export function validUpperCase(str: string): boolean {
  const reg = /^[A-Z]+$/
  return reg.test(str)
}

/**
 * @param str
 * @returns {Boolean}
 */
export function validAlphabets(str: string): boolean {
  const reg = /^[A-Za-z]+$/
  return reg.test(str)
}

/**
 * @param email
 * @returns {Boolean}
 */
export function validEmail(email: string): boolean {
  const reg =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return reg.test(email)
}

/**
 * @param str
 * @returns {Boolean}
 */
export function isString(str: unknown): boolean {
  return typeof str === 'string' || str instanceof String
}

/**
 * @param arg
 * @returns {Boolean}
 */
export function isArray(arg: unknown): boolean {
  if (typeof Array.isArray === 'undefined') {
    return Object.prototype.toString.call(arg) === '[object Array]'
  }
  return Array.isArray(arg)
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
