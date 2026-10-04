/**
 * 分离启动器：以 detached 模式拉起批跑器后立即退出。
 * PowerShell 后台 shell 的 120s 回收不影响 detached 孤儿（后端 exe 同款机制已实证）。
 */
import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['run-rounds.mjs'], {
  cwd: 'D:/Projects/stepby/stepby-vue/tests/e2e',
  detached: true,
  stdio: 'ignore'
})
child.unref()
console.log(`LAUNCHED runner pid=${child.pid}`)
