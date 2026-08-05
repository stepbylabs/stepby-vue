/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

const files = ['src/i18n/locales/zh-CN.ts', 'src/i18n/locales/en-US.ts']

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
