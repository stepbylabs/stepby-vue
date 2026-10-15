// src/api/system/file.test.ts
// b70：文件管理页 api 接线守卫（双轨漂移修复 + multipart boundary 回归锁）
//
// 背景（真实缺陷）：
// 1. `views/system/file/index.vue` 曾 5 处裸 `request()` 直调，而类型化封装
//    `api/system/file.ts` 零引用——封装与实现双轨漂移（改端点只改一半的隐患）；
// 2. 页面上传曾手动设 `Content-Type: multipart/form-data`（无 boundary）——浏览器
//    不会补 boundary，后端 multipart 解析失败（api 模块注释与 uploadAvatar 正确范式
//    均已警示，但页面侧一直没接线，缺陷未被任何测试覆盖）。
//
// 本测试为静态源码守卫：接线被改回裸调 / 手动头复随时立即变红。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (p: string): string => fs.readFileSync(path.join(HERE, p), 'utf8')

const API_SRC = read('file.ts')
const PAGE_SRC = read('../../views/system/file/index.vue')

describe('api/system/file.ts 契约', () => {
  it('uploadFile 不手动设置 Content-Type（boundary 由浏览器自动生成，手动设必丢）', () => {
    // uploadFile 函数体内不得出现 headers/Content-Type
    const fnBody = API_SRC.slice(API_SRC.indexOf('export function uploadFile'))
    const fn = fnBody.slice(0, fnBody.indexOf('\n}'))
    expect(fn).not.toMatch(/Content-Type|headers/)
    expect(fn).toMatch(/method: 'post'/)
  })

  it('listFiles 走 GET /system/file/list 分页参数', () => {
    expect(API_SRC).toMatch(/url: '\/system\/file\/list'/)
    expect(API_SRC).toMatch(/method: 'get'/)
  })

  it('deleteFile 走 DELETE + JSON body { fileName }', () => {
    const fnBody = API_SRC.slice(API_SRC.indexOf('export function deleteFile'))
    const fn = fnBody.slice(0, fnBody.indexOf('\n}'))
    expect(fn).toMatch(/method: 'delete'/)
    expect(fn).toMatch(/data: \{ fileName \}/)
  })

  it('downloadFileBlob 走 /common/download 存储代理 + responseType blob', () => {
    const fnBody = API_SRC.slice(API_SRC.indexOf('export function downloadFileBlob'))
    const fn = fnBody.slice(0, fnBody.indexOf('\n}'))
    expect(fn).toMatch(/\/common\/download\?fileName=/)
    expect(fn).toMatch(/responseType: 'blob'/)
  })
})

describe('views/system/file/index.vue 接线守卫（b70 双轨漂移修复）', () => {
  it('页面 import 类型化 api/system/file 四个函数', () => {
    expect(PAGE_SRC).toMatch(
      /import \{ listFiles, uploadFile, deleteFile, downloadFileBlob \} from '@\/api\/system\/file'/
    )
  })

  it('页面不再裸 request() 直调 /system/file/* 端点', () => {
    expect(PAGE_SRC).not.toMatch(/request\(\{[\s\S]{0,200}?url: '\/system\/file\//)
    expect(PAGE_SRC).not.toMatch(/import request from '@\/utils\/request'/)
  })

  it('FileInfo 类型单一事实源（页面不再本地重复定义接口）', () => {
    expect(PAGE_SRC).toMatch(/import type \{ FileInfo \} from '@\/api\/system\/file'/)
    expect(PAGE_SRC).not.toMatch(/^interface FileInfo \{/m)
  })

  it('handleUpload 走 uploadFile（formData 直传，不加工头）', () => {
    const body = PAGE_SRC.slice(PAGE_SRC.indexOf('async function handleUpload'))
    const fn = body.slice(0, body.indexOf('\n}'))
    expect(fn).toMatch(/await uploadFile\(formData\)/)
    // 负向断言盯「实际设头」而非注释文字：函数体内不得出现 headers 赋值
    expect(fn).not.toMatch(/headers\s*:/)
  })

  it('批量删除走 deleteFile（Promise.allSettled 部分失败统计保留）', () => {
    expect(PAGE_SRC).toMatch(/Promise\.allSettled\(\s*ids\.value\.map\(\(fileName: string\) => deleteFile\(fileName\)\)/)
  })
})
