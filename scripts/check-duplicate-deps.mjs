#!/usr/bin/env node
/**
 * 重复依赖检测（R103-INF-MIN-008）
 *
 * 检查 stepby-vue/package.json 中的依赖声明是否存在“重复”：
 *   1) 同一依赖段内重复键——JSON 规范下后写覆盖前写，JSON.parse 会静默丢键，故需按原文扫描；
 *   2) 同一包同时出现在 dependencies / devDependencies / optionalDependencies / peerDependencies
 *      两个及以上段——属重复声明，会造成安装与升级语义歧义。
 *
 * 仅使用 Node 内置模块，不新增任何依赖（不修改依赖列表）。
 * 退出码：无重复 → 0；发现重复 → 1。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const raw = readFileSync(pkgPath, 'utf8');

// ---- 1) 段内重复键：按原文对每个依赖段做大括号配对切片后逐个扫描 ----
function sectionBodies(text) {
  const out = [];
  for (const section of SECTIONS) {
    const re = new RegExp(`"${section}"\\s*:\\s*\\{`, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      let i = text.indexOf('{', m.index);
      const start = i;
      let depth = 0;
      for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      out.push({ section, body: text.slice(start + 1, i) });
    }
  }
  return out;
}

const duplicateKeys = [];
for (const { section, body } of sectionBodies(raw)) {
  const seen = new Map();
  const re = /"([^"\\]+)"\s*:/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) duplicateKeys.push(`${section}.${key}（出现 ${count} 次）`);
  }
}

// ---- 2) 跨段重复包名 ----
const pkg = JSON.parse(raw);
const declaredIn = new Map(); // name -> section[]
for (const section of SECTIONS) {
  const deps = pkg[section];
  if (!deps || typeof deps !== 'object') continue;
  for (const name of Object.keys(deps)) {
    if (!declaredIn.has(name)) declaredIn.set(name, []);
    declaredIn.get(name).push(section);
  }
}
const crossSection = [...declaredIn.entries()]
  .filter(([, secs]) => secs.length > 1)
  .map(([name, secs]) => `${name} → ${secs.join(' + ')}`);

// ---- 汇总 ----
const problems = [];
if (duplicateKeys.length) problems.push(['同一依赖段内重复键', duplicateKeys]);
if (crossSection.length) problems.push(['同一依赖跨段重复声明', crossSection]);

if (problems.length === 0) {
  // 用 stdout 直写而非 console.log：本仓 eslint 仅放行 console.warn/error（no-console），
  // 而这是 CLI 正常输出，不应触发告警也不应被降级成 stderr。
  process.stdout.write(
    `未发现重复依赖（共 ${declaredIn.size} 个依赖声明，dependencies/devDependencies/peer/optional 四段互不重叠）。\n`,
  );
  process.exit(0);
}

console.error('发现重复依赖：');
for (const [title, items] of problems) {
  console.error(`  [${title}]`);
  for (const item of items) console.error(`    - ${item}`);
}
process.exit(1);
