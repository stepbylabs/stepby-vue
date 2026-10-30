/**
 * 前端等待上限的**单一常量表**（b138 从 `utils/request` 迁出）。
 *
 * 迁出原因：下载/导出走的是直连通道（`utils/blobRequest`），它们不该为了一个常量
 * 静态导入 `utils/request`——那里在模块顶层建 axios 实例并注册拦截器，会把整套
 * 请求栈拖进每个直连调用点的模块图与单测。`utils/request` 仍原样 re-export，
 * 既有导入点（`src/api/**` 的调用与 `blobTimeout.guard.test.ts` 的口径）不变。
 */

/**
 * 服务端同步长任务（备份创建 / 恢复 / 租户包导出）的前端等待上限。
 *
 * 后端子进程硬超时是 300s（`sys_backup_service.rs::BACKUP_TIMEOUT_SECS`），
 * 全局 axios timeout 只有 30s ⇒ 大库上任务**还在正常跑**，前端已经 abort，
 * 用户重试一次就撞上「恢复进行中」互斥锁（b99 实测：备份 43MB+ 时必然超时）。
 * 取 300s + 30s 余量，两端错开但同源；调用点一律引用此常量而非各写数字。
 */
export const LONG_TASK_TIMEOUT = 330_000

/**
 * 文件下载（blob 传输）的等待上限：耗时不取决于服务端处理时长，而取决于文件大小与链路。
 * 仍需**有限**上限——`timeout: 0` 会让连接挂死时全屏 loading 永不关闭（用户只能刷新页面），
 * 10 分钟足够传完数百 MB，也足以让挂死的连接最终落到可重试的错误提示。
 *
 * b138：`plugins/download` 三个方法此前各自写着 `60000`（1 分钟），与本常量差 10 倍——
 * 大型 `/common/download` 必然在第 60 秒被 abort，而守卫当时只扫 `src/api/**` 看不见它。
 */
export const FILE_DOWNLOAD_TIMEOUT = 600_000

/**
 * 普通控制请求的等待上限（请求层全局默认 / 分片会话的 init·session·abort 共用）。
 *
 * 单一事实源：`utils/request` 的 `service` 实例与 `src/api/upload` 的直连控制请求
 * 取同一个值，避免"全局 30s、分片链 0（永不超时）"这种两套口径（b138 勘察：`upload.ts`
 * 五处直连全部没有 timeout，链路挂死时编排器会永远停在「上传中」）。
 */
export const CONTROL_REQUEST_TIMEOUT = 30_000

/**
 * 分片上传单片（默认 5MB/片）的等待上限。
 *
 * 按 50KB/s 的慢速公网下限，5MB 需 ≈100s，留 20s 余量取 120s。快失败比无限等好：
 * 超时片会被编排器当作"服务端未收下"，由续传轮按 `receivedIndexes` 重传（`uploadOne`
 * 的 catch 刻意静默），所以这里不需要为慢链路留长尾。
 */
export const CHUNK_PART_TIMEOUT = 120_000
