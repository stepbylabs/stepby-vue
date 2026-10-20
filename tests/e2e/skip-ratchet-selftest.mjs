/**
 * SKIP 棘轮比较式自检（批七十九新增，不启浏览器）
 *
 * 为什么需要这条自检：`--update-skip-baseline` 原本**无条件**回写基线文件。
 * 一轮"SKIP 变多"的跑批（判据被打断、环境缺东西）执行收紧，就会把基线抬高，
 * 而 `--gate` 下次读的正是这个被放松的天花板——"只许降"只剩字面意思。
 * 退出码只活在这次终端里，落盘却是永久的，所以**写入这一步必须自己守住方向**。
 * 同批修掉的另两个收紧入口：`action-inventory --update-baseline`、
 * `collect-warnings --update-baseline`（各自的比较式自检在它们自己文件里，
 * 因为那两个脚本 import 即执行，无法被这里安全引用）。
 *
 * 用法：node tests/e2e/skip-ratchet-selftest.mjs
 * 退出码：0=SYNTH_OK，1=比较式不可信（此时禁用收紧入口）
 */
import { skipRatchet } from './e2e/run/runner.mjs'

const cases = [
  // [说明, 基线, 本轮, 期望 ratchetBroken, 期望 writeAllowed]
  ['退步必须判红且禁止回写', 34, 35, true, false],
  ['持平可回写（幂等收紧）', 34, 34, false, true],
  ['下降必须放行回写', 34, 33, false, true],
  ['基线缺失时允许首次生成', null, 30, false, true],
  ['本轮取不到数 = 判据断电，fail-closed', 34, undefined, true, false],
  ['基线不可读时收敛成 null ⇒ 允许首建但不得判通过（判红在调用侧）', null, 999, false, true]
]

let bad = 0
for (const [desc, base, now, wantBroken, wantWrite] of cases) {
  const got = skipRatchet(base, now)
  const ok = got.ratchetBroken === wantBroken && got.writeAllowed === wantWrite
  if (!ok) bad++
  console.log(
    `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：` +
      `期望 broken=${wantBroken}/write=${wantWrite}，实际 ${got.ratchetBroken}/${got.writeAllowed}`
  )
}
if (bad) {
  console.error(`❌ SYNTH_FAIL：SKIP 棘轮比较式 ${bad}/${cases.length} 条不符——禁用 --update-skip-baseline`)
  process.exit(1)
}
console.log(`SYNTH_OK SKIP 棘轮比较式 ${cases.length} 条双向（退步/持平/收紧/首建/断电）`)
process.exit(0)
