/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const mc = require('@intlify/message-compiler')
const baseCompile = mc.baseCompile

const localesDir = path.resolve('src/i18n/locales')
const files = ['zh-CN.ts', 'en-US.ts']

function loadLocale(file) {
  let src = fs.readFileSync(path.join(localesDir, file), 'utf8')
  src = src.replace(/export\s+default/, 'module.exports =')
  const tmp = path.join(localesDir, '_tmp_' + file.replace('.ts', '.cjs'))
  fs.writeFileSync(tmp, src)
  const mod = require(tmp)
  fs.unlinkSync(tmp)
  return mod.default || mod
}

function walk(obj, prefix, out) {
  if (typeof obj === 'string') {
    out.push({ key: prefix, msg: obj })
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      walk(obj[k], prefix ? prefix + '.' + k : k, out)
    }
  }
}

const bad = []
for (const f of files) {
  const data = loadLocale(f)
  const entries = []
  walk(data, '', entries)
  console.log(`[${f}] total messages: ${entries.length}`)
  for (const e of entries) {
    try {
      const errs = []
      baseCompile(e.msg, { onError: (err) => errs.push(err) })
      if (errs.length > 0) {
        bad.push({ file: f, key: e.key, msg: e.msg, code: errs[0].code, error: errs.map((x) => x.message).join(' | ') })
      }
    } catch (err) {
      bad.push({ file: f, key: e.key, msg: e.msg, error: (err && err.message) || String(err), code: err && err.code })
    }
  }
}

if (bad.length === 0) {
  console.log('NO_MALFORMED_MESSAGES')
} else {
  for (const b of bad) {
    console.log('=== MALFORMED ===')
    console.log('file:', b.file)
    console.log('key :', b.key)
    console.log('msg :', JSON.stringify(b.msg))
    console.log('err :', b.error)
  }
}
