<template>
  <!-- 指定报表的订阅管理对话框 -->
  <el-dialog :title="t('report.sub.title')" v-model="open" width="min(94%, 860px)" append-to-body destroy-on-close>
    <div class="mb8 flex items-center justify-between">
      <div class="text-text-secondary">{{ t('report.sub.target', { name: report?.reportName || '' }) }}</div>
      <el-button type="primary" plain icon="Plus" @click="handleSubAdd" v-hasPermi="['system:report:sub:add']">
        {{ t('common.add') }}
      </el-button>
    </div>

    <el-alert
      v-if="subLoadError"
      class="mb-2"
      type="error"
      :closable="false"
      show-icon
      :title="t('report.sub.listLoadFailed')"
      data-test="sub-list-load-error"
    >
      <el-button link type="primary" @click="getSubList">{{ t('common.retry') }}</el-button>
    </el-alert>
    <div v-else-if="subTruncated" class="mb-2 text-xs text-[var(--el-color-warning)]" data-test="sub-list-truncated">
      {{ t('common.optionsTruncated', { count: subList.length, total: subTotal }) }}
    </div>

    <el-table v-loading="subLoading" :data="subList">
      <el-table-column
        :label="t('report.sub.column.subName')"
        align="center"
        prop="subName"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('report.sub.column.cron')"
        align="center"
        prop="cron"
        width="170"
        show-overflow-tooltip
      />
      <el-table-column :label="t('report.sub.column.channels')" align="center" width="150">
        <template #default="scope">
          <div class="flex-center gap-1">
            <el-tag v-if="scope.row.pushEmail === '1'" size="small" type="primary">
              {{ t('report.sub.channel.email') }}
            </el-tag>
            <el-tag v-if="scope.row.pushSysMsg === '1'" size="small" type="success">
              {{ t('report.sub.channel.site') }}
            </el-tag>
            <span v-if="scope.row.pushEmail !== '1' && scope.row.pushSysMsg !== '1'" class="text-text-secondary">
              -
            </span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('report.sub.column.status')" align="center" width="90">
        <template #default="scope">
          <el-switch
            v-model="scope.row.status"
            :loading="subStatusLoadingIds.includes(scope.row.subId!)"
            active-value="0"
            inactive-value="1"
            @change="handleSubStatusChange(scope.row)"
            v-hasPermi="['system:report:sub:status']"
          ></el-switch>
        </template>
      </el-table-column>
      <el-table-column :label="t('report.sub.column.lastRunTime')" align="center" prop="lastRunTime" width="170" />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="210"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Promotion"
            :loading="runningIds.includes(scope.row.subId)"
            :disabled="runningIds.includes(scope.row.subId)"
            @click="handleSubRun(scope.row)"
            v-hasPermi="['system:report:sub:run']"
          >
            {{ t('report.sub.btn.run') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleSubEdit(scope.row)"
            v-hasPermi="['system:report:sub:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleSubDelete(scope.row)"
            v-hasPermi="['system:report:sub:remove']"
          >
            {{ t('common.delete') }}
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('common.empty')" />
      </template>
    </el-table>

    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" @click="open = false">{{ t('common.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 订阅新增/编辑对话框 -->
  <el-dialog
    :title="subTitle"
    v-model="subFormOpen"
    width="min(90%, 620px)"
    append-to-body
    destroy-on-close
    :before-close="beforeSubClose"
  >
    <el-form ref="subFormRef" :model="subForm" :rules="subRules" label-width="120px">
      <el-form-item :label="t('report.sub.form.subName')" prop="subName">
        <el-input
          v-model.trim="subForm.subName"
          :placeholder="t('report.sub.form.phSubName')"
          :maxlength="64"
          :aria-label="t('report.sub.form.phSubName')"
        />
      </el-form-item>
      <el-form-item :label="t('report.sub.form.cron')" prop="cron">
        <div class="w-full">
          <el-input
            v-model.trim="subForm.cron"
            :placeholder="t('report.sub.form.phCron')"
            class="font-mono"
            :aria-label="t('report.sub.form.phCron')"
          />
          <div class="mt-1 text-xs text-text-secondary">{{ t('report.sub.form.cronTip') }}</div>
        </div>
      </el-form-item>
      <el-form-item :label="t('report.sub.form.channels')" prop="channels">
        <el-checkbox-group v-model="subChannels">
          <el-checkbox value="email">{{ t('report.sub.channel.email') }}</el-checkbox>
          <el-checkbox value="site">{{ t('report.sub.channel.site') }}</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item v-if="subChannels.includes('email')" :label="t('report.sub.form.receiveEmail')" prop="receiveEmail">
        <el-input
          v-model="subForm.receiveEmail"
          type="textarea"
          :rows="3"
          :placeholder="t('report.sub.form.phReceiveEmail')"
          :aria-label="t('report.sub.form.phReceiveEmail')"
        />
      </el-form-item>
      <el-form-item
        v-if="subChannels.includes('site')"
        :label="t('report.sub.form.receiveUserIds')"
        prop="receiveUserIds"
      >
        <el-input
          v-model="subForm.receiveUserIds"
          type="textarea"
          :rows="3"
          :placeholder="t('report.sub.form.phReceiveUserIds')"
          :aria-label="t('report.sub.form.phReceiveUserIds')"
        />
      </el-form-item>
      <el-form-item :label="t('report.sub.form.status')">
        <el-switch
          v-model="subForm.status"
          active-value="0"
          inactive-value="1"
          :active-text="t('common.enabled')"
          :inactive-text="t('common.disabled')"
        />
      </el-form-item>
      <el-form-item :label="t('report.sub.form.lastRunTime')" v-if="subForm.subId">
        <span class="text-text-secondary">{{ subForm.lastRunTime || '-' }}</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" :loading="subSubmitLoading" @click="submitSubForm">
          {{ t('common.confirm') }}
        </el-button>
        <el-button @click="cancelSub">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="SubReportSection">
import { listSub, getSub, delSub, addSub, updateSub, changeSubStatus, runSub } from '@/api/system/report'
import type { SysReport, SysReportSub } from '@/types/api/system/report'
import { useRowActionGuard } from '@/composables/useRowActionGuard'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { createLatestGuard } from '@/composables/latestRequest'
import { fetchAllPages } from '@/utils/paging'
import { recipientRule } from '@/utils/emailRecipients'
import modal from '@/plugins/modal'
import type { FormRules } from 'element-plus'

const props = defineProps<{ report: SysReport }>()

// 对话框开关由父组件控制（工具栏按钮打开）；report 为订阅目标报表
const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()

/**
 * 列表拉齐与行内详情各一枚守卫（b144）：两者的"最后一次"不是同一个问题——
 * 前者问"这一页该显示哪些订阅"，后者问"这个编辑弹窗该填谁"。共用一枚会让
 * 打开编辑弹窗把在飞的列表判成过期（列表于是停在 loading 或旧值上）。
 */
const subListGuard = createLatestGuard()
const subDetailGuard = createLatestGuard()

const subLoading = ref(false)
const subList = ref<SysReportSub[]>([])
const subLoadError = ref(false)
const subTotal = ref(0)
const subTruncated = ref(false)
/** 立即推送的互斥与 loading（连点不得重复投递，见 useRowActionGuard） */
const { runningIds, guarded } = useRowActionGuard<number>((id, e) => {
  if (import.meta.env.DEV) console.error('[report] run sub failed:', id, e)
})
const subFormOpen = ref(false)
const subSubmitLoading = ref(false)
const subTitle = ref('')
const subFormRef = useTemplateRef('subFormRef')

const subChannels = ref<string[]>([])
const subForm = ref<SysReportSub>({})
const subRules: FormRules = {
  subName: [{ required: true, message: t('report.sub.validate.subNameRequired'), trigger: 'blur' }],
  cron: [{ required: true, message: t('report.sub.validate.cronRequired'), trigger: 'blur' }],
  // b144：与服务端 `split_emails` + `is_valid_email` 同源（既不加严也不放宽）。
  // 此前这一项**没有任何规则**：填错要跑一趟网络才拿到 400，而拦截器只会给一句
  // 「收件邮箱格式不正确」——不点名是哪几个；反过来若按通用邮箱正则收紧，
  // `ops@mail` / `root@localhost` 这类自托管合法值会在本地就被挡死。
  receiveEmail: recipientRule(() => subChannels.value.includes('email'), {
    empty: t('report.sub.validate.emailRequired'),
    invalid: (bad) => t('report.sub.validate.emailInvalidItems', { items: bad.join(', ') })
  })
}

// 打开订阅管理对话框时重置列表并拉取（对应原 openSubDialog 的加载逻辑）
watch(open, (val: boolean) => {
  if (val) {
    subList.value = []
    subLoadError.value = false
    subTotal.value = 0
    subTruncated.value = false
    getSubList()
  }
})

function getSubList() {
  const reportId = props.report.reportId
  if (!reportId) return
  const ticket = subListGuard.begin()
  subLoading.value = true
  subLoadError.value = false
  // b134：按 total 拉齐并如实标注截断；失败必须与"这报表没有订阅"可区分
  fetchAllPages((pageNum, pageSize) => listSub({ pageNum, pageSize, reportId }))
    .then((res) => {
      // 快速开关对话框 / 切换报表时，旧一次拉齐（分页串）后到会把上一个报表的订阅
      // 画在当前报表名下——而"删除/停用"按的是当前行的 subId，跨报表误操作就来自这里。
      if (!subListGuard.isCurrent(ticket)) return
      subList.value = res.rows
      subTotal.value = res.total
      subTruncated.value = res.truncated
    })
    .catch(() => {
      if (!subListGuard.isCurrent(ticket)) return
      subList.value = []
      subTotal.value = 0
      subTruncated.value = false
      subLoadError.value = true
    })
    .finally(() => {
      if (subListGuard.isCurrent(ticket)) subLoading.value = false
    })
}

/** 关闭语义（b135）：订阅名/cron/收件人填一半按 Esc 原先会静默丢弃（含独立的推送渠道勾选） */
const {
  beforeClose: beforeSubClose,
  cancel: cancelSub,
  markSaved: markSubSaved,
  snapshot: snapshotSub
} = useDialogDirtyGuard(subFormOpen, () => ({ ...subForm.value, channels: subChannels.value }))

function handleSubAdd() {
  const reportId = props.report.reportId
  if (!reportId) return
  subForm.value = {
    subId: undefined,
    reportId,
    subName: undefined,
    cron: '0 0 9 * * *',
    pushEmail: '1',
    receiveEmail: undefined,
    pushSysMsg: '0',
    receiveUserIds: undefined,
    status: '0',
    lastRunTime: undefined
  }
  subChannels.value = ['email']
  subTitle.value = t('common.add') + t('report.sub.title')
  subFormOpen.value = true
}

function handleSubEdit(row: SysReportSub) {
  const ticket = subDetailGuard.begin()
  getSub(row.subId!)
    .then((res) => {
      // 连点两行的「编辑」：先发的响应后到会把 A 订阅（含 subId）整份填进表单，
      // 而用户以为在改刚点的 B ⇒ 保存写的仍是 A（`submitSubForm` 用的就是表单里的
      // subId）。这是"写错对象"而不是"显示错位"，所以每个落地处都必须判票。
      if (!subDetailGuard.isCurrent(ticket)) return
      subForm.value = res.data ?? row
      subChannels.value = [
        ...(subForm.value.pushEmail === '1' ? ['email' as const] : []),
        ...(subForm.value.pushSysMsg === '1' ? ['site' as const] : [])
      ]
      subTitle.value = t('common.edit') + t('report.sub.title')
      subFormOpen.value = true
      snapshotSub()
    })
    .catch((e) => {
      // 失败不开弹窗（表单还是上一次的值，开着就是骗人）；提示由请求层统一出口负责。
      if (import.meta.env.DEV) console.error('[report/sub] 订阅详情读取失败:', e)
    })
}

function submitSubForm() {
  subFormRef.value?.validate((valid: boolean) => {
    if (!valid) return
    subSubmitLoading.value = true
    const payload: SysReportSub = {
      ...subForm.value,
      pushEmail: subChannels.value.includes('email') ? '1' : '0',
      pushSysMsg: subChannels.value.includes('site') ? '1' : '0'
    }
    if (payload.pushEmail !== '1') payload.receiveEmail = undefined
    if (payload.pushSysMsg !== '1') payload.receiveUserIds = undefined
    const isUpdate = payload.subId != null
    const api = isUpdate ? updateSub(payload) : addSub(payload)
    api
      .then(() => {
        modal.msgSuccess(isUpdate ? t('common.editSuccess') : t('common.addSuccess'))
        markSubSaved()
        subFormOpen.value = false
        getSubList()
      })
      .catch(() => {})
      .finally(() => {
        subSubmitLoading.value = false
      })
  })
}

function handleSubDelete(row: SysReportSub) {
  modal
    .confirm(t('report.sub.tip.confirmDelete', { name: row.subName }))
    .then(() => delSub(row.subId!))
    .then(() => {
      modal.msgSuccess(t('common.deleteSuccess'))
      getSubList()
    })
    .catch(() => {})
}

/**
 * 启停切换（**行级**互斥 + 在途态 + 确认，b106）——与 `sub/index.vue` 同一口径，
 * 两个入口改的是同一条订阅记录，重入语义必须一致。
 */
const { runningIds: subStatusLoadingIds, guarded: subStatusGuarded } = useRowActionGuard<number>()

async function handleSubStatusChange(row: SysReportSub): Promise<void> {
  const oldVal = row.status === '0' ? '1' : '0'
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  const executed = await subStatusGuarded(
    row.subId!,
    () => modal.confirm(t('report.sub.tip.confirmStatusChange', { text, name: row.subName })),
    async () => {
      try {
        await changeSubStatus(row.subId!, row.status!)
        modal.msgSuccess(t('common.success'))
      } catch (e) {
        row.status = oldVal
        throw e
      }
    }
  )
  if (!executed) row.status = oldVal
}

async function handleSubRun(row: SysReportSub) {
  await guarded(
    row.subId!,
    () => modal.confirm(t('report.sub.tip.confirmRun', { name: row.subName })),
    async () => {
      await runSub(row.subId!)
      modal.msgSuccess(t('report.sub.tip.runSuccess'))
      getSubList()
    }
  )
}
</script>

<style lang="scss" scoped>
.font-mono :deep(textarea),
.font-mono :deep(.el-textarea__inner),
.font-mono :deep(.el-input__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
</style>
