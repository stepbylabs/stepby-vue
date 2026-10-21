/**
 * 长套件"脱离进程树"启动器（批八十二新增）。
 *
 * 立项原因是实测两轮全量都被**外力打断**：
 * - 第一轮：Chromium 在 M38 没了（`browser has been closed`），但 node 活着、跑完并落了汇总；
 * - 第二轮：node 进程**整个消失**在 M24 的"=== 登录（用户: admin）===" 之后——
 *   日志里没有 JS 栈、没有 OOM 的 `FATAL ERROR:`（stdout 与 stderr 重定向到同一份文件）、
 *   Windows 应用日志里没有 node.exe/chrome.exe 的 WER 事件，
 *   而外层 shell 报的是 `DEEP_FULL2_EXIT=127`（既不是 0 也不是崩溃码）。
 *   四条合起来只有一种解释：**外部把整棵进程树 TerminateProcess 掉了**。
 *   而这两次被打断都发生在"用后台任务跑套件"期间，后台通知还两次提前报
 *   `completed (exit code 0)`——那个 0 是外层 `echo` 的退出码，不是套件的（项目记忆里就写着这条）。
 *
 * 所以：这类"一跑就是 40–60 分钟、且**不能分段**（分段轮不能收紧任何基线）"的套件，
 * 必须像后端服务那样**脱离启动**：`detached` + `unref` + stdio 指向日志文件，
 * 启动器自己立刻退出（外层命令是个短命令，不会被回收动作波及），子进程独立存活。
 *
 * 用法：
 *   # 启动（立即返回并打印 PID；日志由套件自己写）
 *   node tests/e2e/run-detached.mjs --log=tests/e2e/_deep_full.log \
 *        -- node tests/e2e/deep-e2e.mjs
 *   # 等它跑完（前台阻塞，只探进程在不在，不刷日志）
 *   node tests/e2e/run-detached.mjs --wait=tests/e2e/_deep_full.log.pid --timeout=540
 *   # 跑完之后再读整份日志取结论
 *
 * 三条纪律写进判据本身：
 * ① `--log` 指向的文件**必须不存在**才启动：`open(path,'a')` 会把上一轮的正文留在原地，
 *    于是"读整份日志"读到的是两轮拼接，汇总行取到的是旧那轮的（本批已实测踩过拼接这个坑）；
 * ② `--wait` 的退出码 0 只代表"进程没了"，**结论一律从日志正文取**；
 *    PID 文件读不到/为空 ⇒ EXIT=2（不得读成"跑完了"，同 `NaN > 容差` 恒 false 那一族）；
 * ③ **采集面必须采得到包装层自己打的行**：stdio 只能走 pipe，不得把 `fs.openSync` 的文件句柄
 *    直接交给子进程——MSYS `sh` 写那种句柄会**静默丢内容且把纯 shell 载荷的退出码改成 1**
 *    （b82 实测，见 `supervise` 上方注释：六段主套件的 `SEG … EXIT=` 凭证全丢，`.exit` 记成 1）。
 *    这条由 `--selftest` 双向钉住，不靠注释声明。
 *
 * `--wait` 退出码：0 = 进程已退出（去日志取结论）；1 = 超时仍在跑（可再等一轮）；2 = 参数/PID 文件坏了。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VUE_ROOT = path.resolve(HERE, '..', '..')

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(`--${name}=`.length) : null
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM 在 Windows/POSIX 上都意味着"进程存在但无权限探问"，不是"不存在"
    return e.code === 'EPERM'
  }
}

function start() {
  const sep = process.argv.indexOf('--')
  if (sep < 0) {
    console.log(
      '[FATAL] 缺少 `--` 分隔符：命令必须写成 `… --log=<路径> -- node <脚本>`。' +
        '少了它会把启动器自己的 argv 当成命令再启动一遍（自家人递归启动自家人）。'
    )
    process.exit(2)
  }
  const cmd = process.argv.slice(sep + 1)
  if (cmd.length === 0) {
    console.log('[FATAL] 用法：node run-detached.mjs --log=<日志路径> -- <命令> [参数…]')
    process.exit(2)
  }
  const logRel = arg('log')
  if (!logRel) {
    console.log('[FATAL] 必须给 --log=：脱离启动后，日志是唯一的结论来源')
    process.exit(2)
  }
  const logPath = path.resolve(VUE_ROOT, logRel)
  if (fs.existsSync(logPath)) {
    console.log(
      `[FATAL] 日志文件已存在：${logPath}——追加写会把上一轮正文留在原地，` +
        `于是"读整份日志"读到的是两轮拼接、汇总行取到旧那一轮。请先把它改名或删掉。`
    )
    process.exit(2)
  }
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  // 两级：外层脱离（不受调用方回收影响），内层是**监管进程**，它等非分段套件跑完并把退出码落盘。
  // 为什么要有监管进程：套件本身脱离后没有外层 `$?`，而"退出码"在本仓是判据的一部分
  // （`❌ 0` 与 `EXIT=0` 是两条独立证据）。b82 第一轮脱离跑完就只能从日志正文反推退出码。
  const supervisor = spawn(process.execPath, [path.join(HERE, 'run-detached.mjs'), '--supervise', logPath, ...cmd], {
    cwd: VUE_ROOT,
    detached: true,
    stdio: 'ignore',
    env: process.env
  })
  if (!supervisor.pid) {
    console.log('[FATAL] 监管进程启动失败')
    process.exit(2)
  }
  fs.writeFileSync(`${logPath}.pid`, `${supervisor.pid}\n`, 'utf8')
  supervisor.unref()
  console.log(`DETACHED supervisor=${supervisor.pid} log=${logPath} exitfile=${logPath}.exit pidfile=${logPath}.pid`)
  process.exit(0)
}

/**
 * 监管模式：不起新进程组，等真子进程跑完，把它的退出码写进 `<log>.exit`（0 也要写）。
 *
 * **stdio 必须走 pipe，不得把打开的文件 fd 直接交给子进程**（b82 实测的真实缺陷，代价是一轮全量）：
 * Node 用 `fs.openSync` 拿到的是 Win32 文件句柄，MSYS2/Cygwin 的 `sh`/`bash` 继承到它之后
 * **写不进去也不报错**——`spawn('sh',['-c','echo A; echo B'],{stdio:['ignore',fd,fd]})` 实测
 * 退出码 **1**、日志正文 **空**（连 `echo` 这种内建命令都失败，失败还不打印）。node 子进程是原生
 * Win32 程序，所以它的输出照常落盘，于是症状是"**只有包装层自己打的行消失**"。
 * 后果不是难看而是**判据断供**：六段主套件用 `sh -c 'for s in …; do echo "SEG $s EXIT=$?"; done'`
 * 跑，1263 断言 / ❌0 全在，但六条 `SEG … EXIT=` 凭证一条没落盘，而 `.exit` 记的是 **1**
 * （载荷最后一条是 `echo ALL_SEGMENTS_DONE` ⇒ 写句柄失败 ⇒ sh 给 1）。
 * 拿这个 1 去记账就说不出"到底是套件红还是采集器坏"。走 pipe 是 cygwin 的正常形态（它本来就接管道），
 * 实测同一载荷：退出码 0、两条 echo 全在。
 */
async function supervise(logPath, cmd) {
  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: VUE_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  })
  if (!child.pid) {
    fs.writeFileSync(`${logPath}.exit`, '127\n', 'utf8')
    console.log(`SUPERVISION_FAILED spawn=${cmd.join(' ')}`)
    process.exit(127)
  }
  fs.writeFileSync(`${logPath}.child.pid`, `${child.pid}\n`, 'utf8')
  const fd = fs.openSync(logPath, 'a')
  // 两块管道各自 append；乱序不修（stdout/stderr 本就没有全序保证），但一条都不能丢。
  // 用 `fs.writeSync(fd, …)`（`'a'` 档天然追加）——`fs.appendSync` 不存在，写错会让监管进程
  // 在第一块数据到达时抛 TypeError 直接死掉（自检 ①②④ 当场抓到）。
  child.stdout.on('data', (b) => fs.writeSync(fd, b))
  child.stderr.on('data', (b) => fs.writeSync(fd, b))
  // 'close' 而不是 'exit'：exit 只保证进程没了，管道里最后几 KB 可能还没排空
  const { code, signal } = await new Promise((resolve) => {
    child.on('error', () => resolve({ code: 127, signal: null }))
    child.on('close', (c, s) => resolve({ code: c, signal: s }))
  })
  fs.closeSync(fd)
  if (signal) {
    // 被信号/外力终止：把这件事写进日志正文，别让"退出码 1"冒充套件结论（b82 第二轮即此形态）
    fs.appendFileSync(logPath, `\n[SUPERVISOR] 子进程被信号终止：${signal}（退出码记 1，不代表套件判据结果）\n`)
  }
  const exitCode = code === null || code === undefined ? (signal ? 1 : 0) : code
  fs.writeFileSync(`${logPath}.exit`, `${exitCode}\n`, 'utf8')
  console.log(`SUPERVISOR_EXIT child=${child.pid} code=${exitCode}${signal ? ` signal=${signal}` : ''}`)
  process.exit(exitCode)
}

async function wait() {
  const pidFile = arg('wait')
  const timeoutSec = Number(arg('timeout') || 540)
  if (!pidFile || !Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    console.log('[FATAL] 用法：node run-detached.mjs --wait=<pid 文件> --timeout=<秒>')
    process.exit(2)
  }
  const abs = path.resolve(VUE_ROOT, pidFile)
  if (!fs.existsSync(abs)) {
    console.log(`[FATAL] PID 文件不存在：${abs}——没启动过就等，等于把"无从判断"读成"跑完了"`)
    process.exit(2)
  }
  const pid = Number(String(fs.readFileSync(abs, 'utf8')).trim())
  if (!Number.isInteger(pid) || pid <= 0) {
    console.log(`[FATAL] PID 文件内容不是数字：${abs} ⇒ ${JSON.stringify(fs.readFileSync(abs, 'utf8').trim())}`)
    process.exit(2)
  }
  const deadline = Date.now() + timeoutSec * 1000
  // 短窗口（自检、或"应该已经跑完了"的复核）按 1s 轮询；长窗口按 10s，不刷日志
  const stepMs = timeoutSec <= 60 ? 1000 : 10000
  while (Date.now() < deadline) {
    if (!alive(pid)) {
      const exitFile = `${abs.replace(/\.pid$/, '')}.exit`
      const recorded = fs.existsSync(exitFile) ? fs.readFileSync(exitFile, 'utf8').trim() : null
      console.log(
        `EXITED pid=${pid} 监管进程已退出；套件退出码=${recorded === null ? '（没落盘，必须从日志正文反推）' : recorded}`
      )
      // `.exit` 内容不是数字 ⇒ 3（"取不到判定"不得读成 0，同 NaN 那一族）
      const num = recorded === null ? 3 : Number(recorded)
      process.exit(Number.isInteger(num) ? num : 3)
    }
    await new Promise((r) => setTimeout(r, stepMs))
  }
  console.log(`STILL_RUNNING pid=${pid} 已等满 ${timeoutSec}s 仍在跑——可再等一轮，不要提前取结论`)
  process.exit(1)
}

/**
 * 自检：10 组双向用例，全部真起子进程真落盘（不测纯函数——本文件没有纯函数可测，
 * 要证的正是"采集面 + 退出码"这条物理链路）。
 *
 * 立项理由（b82 实测）：旧实现把 `fs.openSync` 的文件句柄直接交给子进程，MSYS `sh` 写它**静默失败**，
 * 于是六段主套件包装层打的 `SEG … EXIT=` 一条没落盘、`.exit` 还被写成 1；而这条采集面**当时没有任何用例**。
 * ①②两条就是那条缺陷的正控，摘掉 pipe 改造（换回 fd 直传）必然让它们同时红。
 */
async function selftest() {
  const { spawnSync } = await import('node:child_process')
  const os = await import('node:os')
  const HERE_FILE = fileURLToPath(import.meta.url)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-detached-selftest-'))
  const cli = (...a) => spawnSync(process.execPath, [HERE_FILE, ...a], { encoding: 'utf8', timeout: 90000 })
  const shOk = spawnSync('sh', ['-c', 'true'], { encoding: 'utf8' }).status === 0
  if (!shOk) {
    // 判据源缺失必须响亮失败，不得跳过这两组然后报 SYNTH_OK（"没跑"与"跑了且干净"要可区分）
    console.log('[FATAL] 自检需要 `sh`（要证的正是 shell 包装层的采集面）——本机 PATH 里没有 sh')
    process.exit(2)
  }
  let n = 0
  let bad = 0
  const check = (desc, cond, got) => {
    n++
    if (!cond) bad++
    console.log(`  ${cond ? '✅' : '✘'} [${cond ? 'OK' : 'MISMATCH'}] ${desc}${cond ? '' : ` ⇒ 实际 ${got}`}`)
  }
  /** 起一轮脱离跑批并等它退出，返回 `{ start, log, exit, wait }` */
  const round = async (tag, payload) => {
    const logPath = path.join(tmp, `${tag}.log`)
    const st = cli(`--log=${logPath}`, '--', ...payload)
    const wt = cli(`--wait=${logPath}.pid`, '--timeout=45')
    const body = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '(日志文件不存在)'
    const exitFile = fs.existsSync(`${logPath}.exit`) ? fs.readFileSync(`${logPath}.exit`, 'utf8').trim() : '(未落盘)'
    return { st, log: body, exit: exitFile, wt }
  }

  // ① 纯 shell 载荷：包装层自己打的行必须进日志，退出码必须是 0（旧实现两条全反：正文空 + 退出码 1）
  const r1 = await round('shellonly', ['sh', '-c', 'echo === SEG 1 EXIT=0 ===; echo ALL_SEGMENTS_DONE'])
  check(
    '① 纯 shell 载荷的两条 echo 都必须落进日志（采集面不得只采 node）',
    r1.log.includes('=== SEG 1 EXIT=0 ===') && r1.log.includes('ALL_SEGMENTS_DONE'),
    JSON.stringify(r1.log)
  )
  check(
    '①b 纯 shell 载荷退出码必须忠实为 0（旧实现因写句柄失败给 1）',
    r1.exit === '0' && r1.wt.status === 0,
    `${r1.exit}/${r1.wt.status}`
  )

  // ② 混合载荷：shell 的 echo 与 node 的 stdout 同时在场（分段驱动器就是这一形状）
  const r2 = await round('mixed', ['sh', '-c', 'echo SEGSTART; node -e "console.log(1)"'])
  check(
    '② 混合载荷里 shell 与 node 的输出都得在日志里',
    r2.log.includes('SEGSTART') && r2.log.includes('1'),
    JSON.stringify(r2.log)
  )

  // ③ 退出码忠实：子进程给 7 就必须记 7（不得洗成 0，也不得吞成 1）
  const r3 = await round('exit7', ['node', '-e', 'process.exit(7)'])
  check(
    '③ 子进程退出码 7 必须原样落进 .exit 并被 --wait 透出',
    r3.exit === '7' && r3.wt.status === 7,
    `${r3.exit}/${r3.wt.status}`
  )

  // ④ stderr 同池：脱离启动只有这一份文件，丢 stderr 等于丢崩栈
  const r4 = await round('stderr', ['node', '-e', 'console.error("BOOM-STACK")'])
  check('④ stderr 必须与 stdout 进同一份日志', r4.log.includes('BOOM-STACK'), JSON.stringify(r4.log.slice(0, 120)))

  // ⑤ 正控：合法路径必须由 --wait 正常取到退出码（证明 ③ 不是靠"一律拒"蒙绿）
  check(
    '⑤ 正控——--wait 对已退出的轮次必须报 EXITED 而不是 STILL_RUNNING',
    /EXITED pid=\d+/.test(r4.wt.stdout),
    JSON.stringify(r4.wt.stdout.slice(0, 80))
  )

  // ⑥ 起不来（命令名不存在）必须与"跑完但失败"可区分：127
  const r6 = await round('nosuch', ['definitely-not-a-real-binary-xyz', '--version'])
  check('⑥ 命令不存在 ⇒ .exit=127（"没跑成"不得读成"跑了且 0"）', r6.exit === '127', r6.exit)

  // ⑦~⑩ 输入侧 fail-closed
  const dupLog = path.join(tmp, 'dup.log')
  fs.writeFileSync(dupLog, '上一轮正文\n', 'utf8')
  const r7 = cli(`--log=${dupLog}`, '--', 'node', '-e', 'console.log(1)')
  check(
    '⑦ 日志已存在必须拒启动（拼接两轮正文会让汇总取到旧那轮）',
    r7.status === 2 && /FATAL/.test(r7.stdout),
    `${r7.status}`
  )

  const r8 = cli('--log=' + path.join(tmp, 'nosep.log'), 'node', '-e', 'console.log(1)')
  check('⑧ 缺 `--` 分隔符必须拒（否则递归启动启动器自己）', r8.status === 2 && /分隔符/.test(r8.stdout), `${r8.status}`)

  const r9 = cli(`--wait=${path.join(tmp, 'nope.log.pid')}`, '--timeout=5')
  check(
    '⑨ PID 文件不存在 ⇒ EXIT=2（不得读成"跑完了"）',
    r9.status === 2 && /PID 文件不存在/.test(r9.stdout),
    `${r9.status}`
  )

  const badPid = path.join(tmp, 'bad.log.pid')
  fs.writeFileSync(badPid, 'not-a-number\n', 'utf8')
  const r10 = cli(`--wait=${badPid}`, '--timeout=5')
  check('⑩ PID 内容非数字 ⇒ EXIT=2', r10.status === 2 && /不是数字/.test(r10.stdout), `${r10.status}`)

  // ⑪ .exit 坏了（非数字）必须走 3，不能 `Number(...)` 变 NaN 再被当成 0
  await round('weird', ['node', '-e', 'console.log("fine")'])
  const weirdLog = path.join(tmp, 'weird.log')
  fs.writeFileSync(`${weirdLog}.exit`, 'garbage\n', 'utf8') // 监管进程此时一定已退出（round() 已等完）
  const r11 = cli(`--wait=${weirdLog}.pid`, '--timeout=5')
  check('⑪ .exit 非数字 ⇒ 退出码 3（"取不到分类"不是"没有失败"）', r11.status === 3, `${r11.status}`)

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(bad === 0 ? `SYNTH_OK run-detached ${n} 条双向` : `SYNTH_FAIL run-detached ${bad}/${n} 条不符`)
  process.exit(bad === 0 ? 0 : 1)
}

const supIdx = process.argv.indexOf('--supervise')
if (supIdx >= 0) {
  await supervise(path.resolve(VUE_ROOT, process.argv[supIdx + 1]), process.argv.slice(supIdx + 2))
} else if (process.argv.includes('--selftest')) {
  await selftest()
} else if (arg('wait')) {
  await wait()
} else {
  start()
}
