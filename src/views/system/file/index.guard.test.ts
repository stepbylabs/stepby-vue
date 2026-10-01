// src/views/system/file/index.guard.test.ts
// Tier A #7 对象存储多后端：文件页下载必须走存储后端统一代理 /common/download，
// 而非直连 row.url（s3 后端下对象 URL 为跨域绝对地址，直连会被同源守卫拦截导致下载失效）。
// 静态源码守卫，风格对齐 i18n-keys.test.ts；一旦被改回 anchor 直链下载即回归失败。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = fs.readFileSync(path.join(HERE, 'index.vue'), 'utf8')

describe('文件管理页下载走 /common/download 存储代理', () => {
  it('导入 download 插件', () => {
    expect(SRC).toMatch(/import\s+download\s+from\s+'@\/plugins\/download'/)
  })

  it('handleDownload 调用 download.name（代理端点，delete=false）', () => {
    // 提取 handleDownload 函数体
    const body = SRC.slice(SRC.indexOf('function handleDownload'))
    const fnBody = body.slice(0, body.indexOf('\n}') + 2)
    expect(fnBody).toMatch(/download\.name\(\s*row\.fileName\s*,\s*false\s*\)/)
  })

  it('不再信任 row.url 直接创建 anchor 下载（防跨域失效 + 防外链）', () => {
    // 下载路径不得出现 document.createElement('a') 或引用 row.url 作为下载地址
    const body = SRC.slice(SRC.indexOf('function handleDownload'))
    const fnBody = body.slice(0, body.indexOf('\n}') + 2)
    expect(fnBody).not.toMatch(/createElement\(['"]a['"]\)/)
    expect(fnBody).not.toMatch(/row\.url/)
    // 旧的 externalLinkBlocked 提示不应再被引用
    expect(SRC).not.toMatch(/externalLinkBlocked/)
  })
})
