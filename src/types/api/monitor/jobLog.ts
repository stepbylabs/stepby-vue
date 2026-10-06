import type { PageDomain, BaseEntity } from "../common";

/** 定时任务日志分页查询参数 */
export interface JobLogQueryParams extends PageDomain {
  /** 任务名称 */
  jobName?: string;
  /** 任务组名 */
  jobGroup?: string;
  /** 执行状态 */
  status?: string;
  /** 执行时间 */
  params?: {
    beginTime?: string;
    endTime?: string;
  };
}

/** 定时任务日志信息 */
export interface SysJobLog extends BaseEntity {
  /** 任务日志编号 */
  jobLogId?: number;
  /** 任务名称 */
  jobName?: string;
  /** 任务组名 */
  jobGroup?: string;
  /** 调用目标字符串 */
  invokeTarget?: string;
  /** 日志信息 */
  jobMessage?: string;
  /** 异常信息 */
  exceptionInfo?: string;
  /** 任务执行耗时（毫秒，G-09；存量旧行为空） */
  durationMs?: number;
  /** 状态（0正常 1失败） */
  status?: '0' | '1';
}

/** G-09：运行报表单日聚合桶 */
export interface JobStatsDaily {
  /** 日期（服务器本地时区 YYYY-MM-DD） */
  date: string;
  total: number;
  success: number;
  failed: number;
  /** 成功率（百分数 0-100，1 位小数） */
  successRate: number;
  /** 平均耗时 ms（无样本为 0） */
  avgMs: number;
}

/** G-09：运行报表失败 TOP 条目 */
export interface JobFailureTop {
  jobName: string;
  failedCount: number;
}

/** G-09：定时任务运行统计报表 */
export interface JobLogStats {
  windowDays: number;
  total: number;
  success: number;
  failed: number;
  successRate: number;
  avgMs: number;
  maxMs: number;
  /** 行数截断标记（数据源达到上界时为 true） */
  truncated: boolean;
  daily: JobStatsDaily[];
  topFailures: JobFailureTop[];
}
