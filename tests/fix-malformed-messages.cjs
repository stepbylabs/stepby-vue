/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

// i18n 已按模块拆分（zh-CN/、en-US/ 目录），此处遍历全部模块文件，
// 避免模块结构调整后漏改。
const LOCALE_DIRS = ['src/i18n/locales/zh-CN', 'src/i18n/locales/en-US']
const files = LOCALE_DIRS.flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => path.join(dir, f))
)

// Targeted per-key replacements: only touch lines whose key token matches,
// so we never alter the valid linked-literal string help.contact.emailDesc (`{'@'}`).
const rules = [
  { token: 'roleKeyHelp:', repl: (s) => s.replaceAll('@', '＠') },
  { token: 'permsHelp:', repl: (s) => s.replaceAll('@', '＠') },
  { token: 'queryHelp:', repl: (s) => s.replaceAll('{', '｛').replaceAll('}', '｝') },
  { token: 'illegalChars:', repl: (s) => s.replaceAll('|', '｜') },
  { token: 'lettersDigitsSpecial:', repl: (s) => s.replaceAll('@', '＠') },
  { token: 'section6Email:', repl: (s) => s.replaceAll('@', '＠') }
]

for (const f of files) {
  const p = path.resolve(f)
  const lines = fs.readFileSync(p, 'utf8').split('\n')
  let changed = 0
  const out = lines.map((line) => {
    const rule = rules.find((r) => line.includes(r.token))
    if (rule) {
      changed++
      return rule.repl(line)
    }
    return line
  })
  fs.writeFileSync(p, out.join('\n'))
  console.log(`${f}: ${changed} line(s) updated`)
}
console.log('done')
