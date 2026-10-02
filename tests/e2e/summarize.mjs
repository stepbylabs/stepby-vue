import fs from 'fs';
const r = JSON.parse(fs.readFileSync('d:/桌面/stepby/tests/screenshots/test-report.json', 'utf8'));
console.log(`总计: ${r.total}  通过: ${r.passed}  失败: ${r.failed}`);
console.log('---');
const failed = r.results.filter(x => !x.passed);
const byFeature = {};
for (const f of failed) {
  byFeature[f.feature] = (byFeature[f.feature] || 0) + 1;
}
for (const [k, v] of Object.entries(byFeature)) {
  console.log(`Feature ${k}: ${v} 项失败`);
}
console.log('---');
for (const f of failed) {
  console.log(`  [F${f.feature}] ${f.name} - ${f.detail}`);
}
