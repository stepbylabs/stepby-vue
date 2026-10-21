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
import { skipRatchet, skipTightenFromLog, applySkipBaselineFromLog } from './e2e/run/runner.mjs'

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

// ==================== 由日志收紧基线（b82 新增通道）====================
// 全量单轮必须脱离进程树跑，脱离启动没有外层 `$?`；没有合法通道就一定有人手写基线 JSON。
// 这条通道的判据必须与轮内入口**同一条**：跑完、零失败、零工具自曝、且方向只许降。
const LOG_OK = [
  '耗时: 2831.2s | 模块: 90 | 检查: ✅ 1311 / ❌ 0',
  '跳过(SKIP): 32',
  'SKIP 分桶: 业务跳过 32 / 工具自曝 0',
  '✅ 全部模块通过'
].join('\n')
const logCases = [
  ['干净全量轮（32 < 基线 34）必须放行', LOG_OK, 34, true, 32],
  ['提前终止的一轮（模块 38/90）必须拒', LOG_OK.replace('模块: 90', '模块: 38/90'), 34, false, null],
  ['有 🛑 标记的一轮必须拒（即使汇总数字好看）', LOG_OK + '\n🛑 本轮提前终止：52/90 个模块从未执行', 34, false, null],
  ['有失败的一轮不配收紧', LOG_OK.replace('❌ 0', '❌ 3'), 34, false, null],
  ['工具自曝 >0 的 SKIP 不得进基线', LOG_OK.replace('工具自曝 0', '工具自曝 2'), 34, false, null],
  ['方向闸：本轮 SKIP 高于基线必须拒', LOG_OK.replace('跳过(SKIP): 32', '跳过(SKIP): 40'), 34, false, null],
  ['基线缺失时允许首建（与轮内同一判据）', LOG_OK, null, true, 32],
  [
    '缺"跳过(SKIP)"行 = 判据断电，必须拒且理由指向缺行',
    '模块: 90 | 检查: ✅ 1 / ❌ 0\nSKIP 分桶: 业务跳过 0 / 工具自曝 0',
    34,
    false,
    null
  ],
  [
    '缺"SKIP 分桶"行同样必须拒（工具自曝数未知）',
    '耗时: 1s | 模块: 90 | 检查: ✅ 1 / ❌ 0\n跳过(SKIP): 5',
    34,
    false,
    null
  ]
]
let lbad = 0
for (const [desc, text, base, wantOk, wantSkip] of logCases) {
  const got = skipTightenFromLog(text, base)
  const ok = got.ok === wantOk && (wantSkip === null || got.skip === wantSkip)
  if (!ok) lbad++
  console.log(
    `  ${ok ? '✅' : '✘'} [${ok ? 'OK' : 'MISMATCH'}] ${desc}：` +
      `期望 ok=${wantOk}/skip=${wantSkip}，实际 ${got.ok}/${got.skip}｜${got.problems.join('；') || '无问题'}`
  )
}
// "先比后写"必须钉在**写入这一步**上：判拒时 write 一次都不能被调到（退出码不撤回已写出去的文件）
let writes = 0
const refused = applySkipBaselineFromLog('x.log', {
  read: () => LOG_OK.replace('跳过(SKIP): 32', '跳过(SKIP): 99'),
  write: () => writes++
})
if (refused.code === 0 || writes !== 0) {
  lbad++
  console.log(`  ✘ [MISMATCH] 退步轮竟然落了盘：code=${refused.code} writes=${writes}`)
} else {
  console.log(`  ✅ [OK] 退步轮：code=${refused.code}、writes=0（先比后写守住）`)
}
const accepted = applySkipBaselineFromLog('x.log', { read: () => LOG_OK, write: () => writes++ })
if (accepted.code !== 0 || writes !== 1) {
  lbad++
  console.log(`  ✘ [MISMATCH] 合法收紧没写出去：code=${accepted.code} writes=${writes}`)
} else {
  console.log(`  ✅ [OK] 合法收紧：code=0、writes=1（${accepted.message}）`)
}
const unreadable = applySkipBaselineFromLog('x.log', {
  read: () => {
    throw new Error('ENOENT')
  },
  write: () => writes++
})
if (unreadable.code !== 2 || writes !== 1) {
  lbad++
  console.log(`  ✘ [MISMATCH] 读不到日志竟然不是 EXIT=2：code=${unreadable.code} writes=${writes}`)
} else {
  console.log(`  ✅ [OK] 读不到日志：code=2、基线未改动（${unreadable.message}）`)
}
if (lbad) {
  console.error(`❌ SYNTH_FAIL：由日志收紧基线 ${lbad} 条不符——禁用 --update-skip-baseline-from`)
  process.exit(1)
}
console.log(
  `SYNTH_OK SKIP 棘轮比较式 ${cases.length} 条双向（退步/持平/收紧/首建/断电）` +
    ` + 由日志收紧 ${logCases.length} 条双向 + 先比后写 3 条（拒绝不落盘 / 合法落盘 / 读不到=EXIT2）`
)
process.exit(0)
