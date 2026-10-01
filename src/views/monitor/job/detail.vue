<template>
  <el-dialog
    :title="type === 'log' ? t('jobLog.detail.titleLog') : t('jobLog.detail.titleJob')"
    v-model="dialogVisible"
    width="min(80%, 780px)"
    append-to-body
    destroy-on-close
  >
    <div class="detail-wrap">
      <Transition mode="out-in" name="fade-slide">
        <div v-if="type === 'log'" key="log">
          <!-- 基本信息 -->
          <div class="detail-card">
            <div class="detail-card-title">
              <el-icon><InfoFilled /></el-icon>
              {{ t('jobLog.detail.basicInfo') }}
            </div>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.jobLogId') }}</span>
                  <span class="detail-value">{{ logForm.jobLogId }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.execStatus') }}</span>
                  <el-tag v-if="logForm.status == 0" type="success" size="small">{{ t('job.tip.normal') }}</el-tag>
                  <el-tag v-else type="danger" size="small">{{ t('job.tip.fail') }}</el-tag>
                </div>
              </el-col>
            </el-row>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.startTime') }}</span>
                  <span class="detail-value">{{ logForm.startTime }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.endTime') }}</span>
                  <span class="detail-value">{{ logForm.endTime }}</span>
                </div>
              </el-col>
            </el-row>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.recordTime') }}</span>
                  <span class="detail-value">{{ logForm.createTime }}</span>
                </div>
              </el-col>
              <el-col :span="12" v-if="logForm.status == 0 && logForm.startTime && logForm.endTime">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.costTime') }}</span>
                  <span class="detail-value">{{ costTime }} {{ t('jobLog.detail.millisecond') }}</span>
                </div>
              </el-col>
            </el-row>
          </div>
          <!-- 任务信息 -->
          <div class="detail-card">
            <div class="detail-card-title">
              <el-icon><Clock /></el-icon>
              {{ t('jobLog.detail.taskInfo') }}
            </div>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('job.column.name') }}</span>
                  <span class="detail-value">{{ logForm.jobName }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.jobGroup') }}</span>
                  <dict-tag :options="sys_job_group" :value="logForm.jobGroup" />
                </div>
              </el-col>
            </el-row>
            <el-row class="detail-row">
              <el-col :span="24">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.jobMessage') }}</span>
                  <span class="detail-value">{{ logForm.jobMessage }}</span>
                </div>
              </el-col>
            </el-row>
          </div>
          <!-- 调用目标 -->
          <div class="detail-card">
            <div class="detail-card-title">
              <el-icon><Operation /></el-icon>
              {{ t('jobLog.detail.invokeTarget') }}
            </div>
            <div class="code-body">
              <div class="code-wrap">
                <pre class="code-pre">{{ logForm.invokeTarget || t('jobLog.detail.empty') }}</pre>
              </div>
            </div>
          </div>
          <!-- 异常信息 -->
          <Transition name="expand-fade">
            <div class="detail-card" v-if="logForm.status == 1">
              <div class="detail-card-title error-title">
                <el-icon><Warning /></el-icon>
                {{ t('jobLog.detail.exceptionInfo') }}
              </div>
              <div class="error-body">
                <div class="error-msg">{{ logForm.exceptionInfo }}</div>
              </div>
            </div>
          </Transition>
        </div>

        <div v-else key="job">
          <!-- 任务配置 -->
          <div class="detail-card">
            <div class="detail-card-title">
              <el-icon><Setting /></el-icon>
              {{ t('jobLog.detail.taskConfig') }}
            </div>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('job.column.id') }}</span>
                  <span class="detail-value">{{ jobForm.jobId }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('job.column.name') }}</span>
                  <span class="detail-value">{{ jobForm.jobName }}</span>
                </div>
              </el-col>
            </el-row>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.jobGroup') }}</span>
                  <dict-tag :options="sys_job_group" :value="jobForm.jobGroup" />
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.execStatus') }}</span>
                  <el-tag v-if="jobForm.status == 0" type="success" size="small">{{ t('job.tip.normal') }}</el-tag>
                  <el-tag v-else type="info" size="small">{{ t('job.tip.paused') }}</el-tag>
                </div>
              </el-col>
            </el-row>
          </div>
          <!-- 调度信息 -->
          <div class="detail-card">
            <div class="detail-card-title">
              <el-icon><Calendar /></el-icon>
              {{ t('jobLog.detail.scheduleInfo') }}
            </div>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.cronExpression') }}</span>
                  <span class="detail-value mono">{{ jobForm.cronExpression }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('job.column.nextTime') }}</span>
                  <span class="detail-value">{{ parseTime(jobForm.nextValidTime) }}</span>
                </div>
              </el-col>
            </el-row>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('job.form.misfirePolicy') }}</span>
                  <Transition mode="out-in" name="fade">
                    <el-tag v-if="jobForm.misfirePolicy == 0" key="m0" type="info" size="small">
                      {{ t('job.tip.defaultPolicy') }}
                    </el-tag>
                    <el-tag v-else-if="jobForm.misfirePolicy == 1" key="m1" type="warning" size="small">
                      {{ t('job.tip.executeImmediate') }}
                    </el-tag>
                    <el-tag v-else-if="jobForm.misfirePolicy == 2" key="m2" type="primary" size="small">
                      {{ t('job.tip.executeOnce') }}
                    </el-tag>
                    <el-tag v-else-if="jobForm.misfirePolicy == 3" key="m3" type="danger" size="small">
                      {{ t('job.tip.abandon') }}
                    </el-tag>
                    <!-- 未知策略兜底 -->
                    <el-tag v-else key="m-" type="info" size="small">-</el-tag>
                  </Transition>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('jobLog.detail.concurrent') }}</span>
                  <el-tag v-if="jobForm.concurrent == 0" type="success" size="small">
                    {{ t('job.tip.allowConcurrent') }}
                  </el-tag>
                  <el-tag v-else type="danger" size="small">{{ t('job.tip.forbidConcurrent') }}</el-tag>
                </div>
              </el-col>
            </el-row>
          </div>
          <!-- 执行方法 -->
          <div class="detail-card">
            <div class="detail-card-title">
              <el-icon><Operation /></el-icon>
              {{ t('jobLog.detail.execMethod') }}
            </div>
            <div class="code-body">
              <div class="code-wrap">
                <pre class="code-pre">{{ jobForm.invokeTarget || t('jobLog.detail.empty') }}</pre>
              </div>
            </div>
          </div>
          <!-- 元信息 -->
          <div class="detail-card">
            <div class="detail-card-title">
              <el-icon><Document /></el-icon>
              {{ t('jobLog.detail.metaInfo') }}
            </div>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('common.column.createBy') }}</span>
                  <span class="detail-value">{{ jobForm.createBy || '-' }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('common.column.createTime') }}</span>
                  <span class="detail-value">{{ jobForm.createTime }}</span>
                </div>
              </el-col>
            </el-row>
            <el-row class="detail-row">
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('common.column.updateBy') }}</span>
                  <span class="detail-value">{{ jobForm.updateBy || '-' }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('common.column.updateTime') }}</span>
                  <span class="detail-value">{{ jobForm.updateTime || '-' }}</span>
                </div>
              </el-col>
            </el-row>
            <el-row class="detail-row" v-if="jobForm.remark">
              <el-col :span="24">
                <div class="detail-item">
                  <span class="detail-label w-20">{{ t('common.column.remark') }}</span>
                  <span class="detail-value">{{ jobForm.remark }}</span>
                </div>
              </el-col>
            </el-row>
          </div>
        </div>
      </Transition>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">{{ t('common.close') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="JobDetail">
import type { SysJob } from '@/types/api/monitor/job'
import type { SysJobLog } from '@/types/api/monitor/jobLog'

const { t } = useI18n()

type DetailType = 'job' | 'log'

const props = defineProps<{
  row: SysJob | SysJobLog
  type?: DetailType
}>()

const dialogVisible = defineModel<boolean>('visible')

const { sys_job_group } = useDict('sys_job_group')

const jobForm = computed<SysJob>(() => props.row as SysJob)
const logForm = computed<SysJobLog>(() => props.row as SysJobLog)

const costTime = computed<number>(() => {
  const { startTime, endTime } = logForm.value
  if (!startTime || !endTime) return 0
  // Math.max 兜底，避免 endTime 早于 startTime 时返回负数
  return Math.max(0, new Date(endTime).getTime() - new Date(startTime).getTime())
})
</script>

<style scoped>
:deep(.el-tag) {
  transition: all 0.2s ease;
}
</style>
