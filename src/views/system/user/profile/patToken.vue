<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center justify-between">
        <span>
          <el-icon><Key /></el-icon>
          {{ t('pat.title') }}
        </span>
        <el-button type="primary" icon="Plus" @click="openCreate">
          {{ t('pat.btn.create') }}
        </el-button>
      </div>
    </template>

    <el-alert :title="t('pat.tip')" type="info" :closable="false" show-icon class="mb15" />

    <el-table v-loading="loading" :data="tokenList" :row-key="(row: SysPat) => row.patId">
      <el-table-column :label="t('pat.column.name')" prop="name" min-width="120" show-overflow-tooltip />
      <el-table-column :label="t('pat.column.token')" prop="tokenPrefix" width="130">
        <template #default="scope">
          <code class="token-prefix">{{ scope.row.tokenPrefix }}…</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.scopes')" min-width="200">
        <template #default="scope">
          <el-tag
            v-for="s in displayScopes(scope.row.scopes)"
            :key="s"
            size="small"
            class="scope-tag"
            :type="s === '*:*:*' ? 'danger' : 'info'"
          >
            {{ scopeLabel(s) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.status')" width="90" align="center">
        <template #default="scope">
          <el-tag v-if="isRevoked(scope.row.status)" type="info" size="small">{{ t('pat.status.revoked') }}</el-tag>
          <el-tag v-else type="success" size="small">{{ t('pat.status.active') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.expiresAt')" width="140" align="center">
        <template #default="scope">
          <el-tag v-if="!isRevoked(scope.row.status)" :type="expiryTagType(expiryInfo(scope.row).status)" size="small">
            {{ expiryText(scope.row) }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.lastUsedAt')" width="170" align="center">
        <template #default="scope">
          <span>{{ scope.row.lastUsedAt ? parseTime(scope.row.lastUsedAt) : t('pat.neverUsed') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('pat.column.createTime')" width="170" align="center">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('pat.column.operation')"
        width="260"
        align="center"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <template v-if="!isRevoked(scope.row.status)">
            <el-button
              link
              type="primary"
              icon="RefreshLeft"
              :loading="akLoadingIds.includes(scope.row.patId)"
              @click="handleRotateAk(scope.row)"
            >
              {{ t('pat.btn.rotateAk') }}
            </el-button>
            <el-button
              link
              type="danger"
              icon="Delete"
              :loading="akLoadingIds.includes(scope.row.patId)"
              @click="handleRevokeAk(scope.row)"
            >
              {{ t('pat.btn.revokeAk') }}
            </el-button>
            <el-button
              link
              type="danger"
              icon="Delete"
              :loading="revokeLoadingIds.includes(scope.row.patId)"
              @click="handleRevoke(scope.row)"
            >
              {{ t('pat.btn.revoke') }}
            </el-button>
          </template>
        </template>
      </el-table-column>
      <template #empty>
        <ListEmpty :load-error="loadError" @retry="getList">
          <el-empty :description="t('common.empty')" />
        </ListEmpty>
      </template>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 新建令牌对话框 -->
    <el-dialog
      v-model="createVisible"
      :title="t('pat.create.title')"
      width="min(90%, 560px)"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
      :before-close="beforeCreateClose"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item :label="t('pat.form.name')" prop="name">
          <el-input
            v-model="form.name"
            :placeholder="t('pat.form.namePh')"
            :maxlength="100"
            :aria-label="t('pat.form.namePh')"
          />
        </el-form-item>
        <el-form-item :label="t('pat.form.scopes')" prop="scopes">
          <el-select
            :aria-label="t('pat.form.scopes')"
            v-model="form.scopes"
            multiple
            filterable
            :loading="scopesLoading"
            :placeholder="t('pat.form.scopesPh')"
            class="w-full"
          >
            <el-option v-for="opt in scopeOptions" :key="opt" :label="scopeLabel(opt)" :value="opt" />
          </el-select>
          <!-- 读失败必须与"系统里没有可选权限"可分（b133 ③）：给原因 + 重试入口 -->
          <el-alert
            v-if="scopesError"
            data-testid="pat-scope-error"
            type="error"
            :closable="false"
            show-icon
            class="mt-2 w-full"
          >
            <template #title>
              <span>{{ t('pat.form.scopeLoadFailed') }}</span>
              <el-button link type="primary" @click="loadScopes">{{ t('common.retry') }}</el-button>
            </template>
          </el-alert>
        </el-form-item>
        <el-form-item :label="t('pat.form.expireDays')" prop="expireDays">
          <el-input-number v-model="form.expireDays" :min="0" :max="3650" controls-position="right" />
          <span class="form-tip">{{ t('pat.form.expireDaysTip') }}</span>
        </el-form-item>
        <el-form-item :label="t('pat.form.withAk')" prop="withAk">
          <div class="w-full">
            <el-switch v-model="form.withAk" />
            <div class="form-tip-block">{{ t('pat.form.withAkTip') }}</div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelCreate">{{ t('common.cancel') }}</el-button>
        <!-- 目录没读到就 disable 创建：这一项是必填，空目录下的"成功"只能是零权限令牌 -->
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!scopesReady"
          data-testid="pat-create-confirm"
          @click="submitCreate"
        >
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 一次性明文令牌展示对话框（含开通 AK/SK 时的 AK/SK 明文，均仅展示一次） -->
    <el-dialog
      v-model="revealVisible"
      :title="t('pat.token.title')"
      width="560px"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-alert :title="t('pat.token.warning')" type="warning" :closable="false" show-icon class="mb15" />
      <div class="token-reveal">
        <code class="token-plain">{{ plainToken }}</code>
        <el-button type="primary" link icon="DocumentCopy" @click="copyToken">{{ t('pat.btn.copy') }}</el-button>
      </div>
      <template v-if="plainAccessKey || plainSecretKey">
        <el-alert :title="t('pat.akSk.warning')" type="warning" :closable="false" show-icon class="mt-3 mb15" />
        <div class="token-reveal">
          <span class="ak-label">{{ t('pat.akSk.accessKey') }}</span>
          <code class="token-plain">{{ plainAccessKey }}</code>
          <el-button type="primary" link icon="DocumentCopy" @click="copyText(plainAccessKey)">
            {{ t('pat.btn.copy') }}
          </el-button>
        </div>
        <div class="token-reveal mt-2">
          <span class="ak-label">{{ t('pat.akSk.secretKey') }}</span>
          <code class="token-plain">{{ plainSecretKey }}</code>
          <el-button type="primary" link icon="DocumentCopy" @click="copyText(plainSecretKey)">
            {{ t('pat.btn.copy') }}
          </el-button>
        </div>
      </template>
      <template #footer>
        <el-button type="primary" @click="finishReveal">{{ t('pat.btn.done') }}</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts" name="PatToken">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { listMyTokens, getScopeOptions, createToken, revokeMyToken, rotateAk, revokeAk } from '@/api/system/patToken'
import type { SysPat } from '@/types/api/monitor/pat'
import { isRevoked, computeExpiryInfo, expiryTagType, summarizeScopes, type ExpiryStatus } from '@/utils/patUtils'
import { copyText as writeClipboard } from '@/utils/clipboard'
import { createLatestGuard } from '@/composables/latestRequest'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { useRowActionGuard } from '@/composables/useRowActionGuard'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'

const { t } = useI18n()

const loading = ref(false)
/** 列表请求守卫：连点搜索/翻页时只让最后一次请求的结局生效（b119） */
const listGuard = createLatestGuard()
// b102：失败态与"尚未创建令牌"必须可分
const loadError = ref(false)
const tokenList = ref<SysPat[]>([])
const total = ref(0)
const queryParams = reactive({ pageNum: 1, pageSize: 10 })

const scopeOptions = ref<string[]>([])
/**
 * 权限目录（作用域候选）的三条状态（b144，与 b133 的「读成功才能写」同源）。
 *
 * 立的案：`loadScopes` 原先是 `.catch(() => {})` ——目录读不到时下拉是**空的**，
 * 而 `scopes` 是必填项 ⇒ 用户看到的是「至少选择一项权限」，一个服务端问题被报成
 * 用户填错；而创建按钮照常可点。现在失败必须可见、可重试，并且**挡住写**：
 * 按钮禁用是 UI 约定，`submitCreate` 首行的判定才是安全边界（两处都要有）。
 */
const scopeGuard = createLatestGuard()
const scopesLoading = ref(false)
const scopesError = ref(false)
const scopesReady = ref(false)

const createVisible = ref(false)
const creating = ref(false)
const formRef = useTemplateRef<FormInstance>('formRef')
const form = reactive<{ name: string; scopes: string[]; expireDays: number; withAk: boolean }>({
  name: '',
  scopes: [],
  expireDays: 90,
  withAk: false
})
const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('pat.rule.nameRequired'), trigger: 'blur' }],
  scopes: [{ required: true, type: 'array', min: 1, message: t('pat.rule.scopesRequired'), trigger: 'change' }]
}))

const revealVisible = ref(false)
const plainToken = ref('')
// 开通 AK/SK 时的一次性明文（仅创建响应返回，展示一次）
const plainAccessKey = ref('')
const plainSecretKey = ref('')

async function getList(): Promise<void> {
  const ticket = listGuard.begin()
  loading.value = true
  loadError.value = false
  try {
    const res = await listMyTokens(queryParams)
    // 旧响应（期间又发起了新的查询）不得覆盖新请求的数据与结局
    if (!listGuard.isCurrent(ticket)) return
    // 删掉末页最后一条后页码越界：有数据但本页为空 ⇒ 回退一页重取（b119）
    const nextPage = pageAfterEmptyResult(queryParams.pageNum, res.rows?.length ?? 0, res.total ?? 0)
    if (nextPage !== queryParams.pageNum) {
      queryParams.pageNum = nextPage
      await getList()
      return
    }
    tokenList.value = res.rows || []
    total.value = res.total || 0
  } catch {
    if (!listGuard.isCurrent(ticket)) return
    // 拦截器已弹提示；失败必须在列表区可见（否则"没有令牌"与"取不到"同形）
    loadError.value = true
  } finally {
    if (listGuard.isCurrent(ticket)) loading.value = false
  }
}

function loadScopes(): void {
  const ticket = scopeGuard.begin()
  scopesLoading.value = true
  getScopeOptions()
    .then((res) => {
      if (!scopeGuard.isCurrent(ticket)) return
      scopeOptions.value = res.data || []
      // 就绪只能由"真的读到了"决定：200 但空数组同样不能开创建闸（目录空 = 没有任何可选权限，
      // 而 `scopes` 是必填项 ⇒ 用户只会看到"至少选择一项权限"，把一个服务端问题报成用户填错）
      scopesReady.value = true
      scopesError.value = false
    })
    .catch(() => {
      if (!scopeGuard.isCurrent(ticket)) return
      scopesReady.value = false
      scopesError.value = true
      scopeOptions.value = []
    })
    .finally(() => {
      if (scopeGuard.isCurrent(ticket)) scopesLoading.value = false
    })
}

function scopeLabel(scope: string): string {
  return scope === '*:*:*' ? t('pat.scopeAll') : scope
}
function displayScopes(scopes: string[]): string[] {
  return summarizeScopes(scopes || []).list
}
function expiryInfo(row: SysPat): { status: ExpiryStatus; days: number | null } {
  return computeExpiryInfo(row.expiresAt)
}
function expiryText(row: SysPat): string {
  const { status, days } = expiryInfo(row)
  if (status === 'never') return t('pat.expiry.never')
  if (status === 'expired') return t('pat.expiry.expired')
  if (status === 'soon') return t('pat.expiry.soon', { days })
  return t('pat.expiry.active', { days })
}

function openCreate(): void {
  form.name = ''
  form.scopes = []
  form.expireDays = 90
  form.withAk = false
  formRef.value?.clearValidate()
  loadScopes()
  createVisible.value = true
}

/** 关闭语义（b135）：填好名称/作用域后按 Esc 原先会静默丢弃整张表单 */
const {
  beforeClose: beforeCreateClose,
  cancel: cancelCreate,
  markSaved: markCreateSaved
} = useDialogDirtyGuard(createVisible, form)

function submitCreate(): void {
  // 写侧安全边界（b133 ①）：按钮的 :disabled 只是 UI 约定，函数首行必须自己判「读成功」——
  // 目录没读到时提交，得到的是**零权限令牌**（`scopes` 为空），而用户以为是自己没选。
  if (!scopesReady.value) {
    ElMessage.warning(t('pat.form.scopeLoadFailed'))
    return
  }
  formRef.value?.validate((valid: boolean) => {
    if (!valid) return
    creating.value = true
    createToken({
      name: form.name.trim(),
      scopes: form.scopes,
      expireDays: form.expireDays,
      // 同时开通开放 API AK/SK：响应携带 accessKey/secretKey 明文（仅此一次）
      withAk: form.withAk
    })
      .then((res) => {
        plainToken.value = res.data?.token || ''
        plainAccessKey.value = res.data?.accessKey || ''
        plainSecretKey.value = res.data?.secretKey || ''
        // 创建成功后必须先关掉本对话框：原先只开明文框，用户点「完成」后落在
        // 仍开着、值还在的创建表单上，看起来像没成功 ⇒ 再点一次就是重复令牌。
        markCreateSaved()
        createVisible.value = false
        revealVisible.value = true
        getList()
      })
      .catch(() => {})
      .finally(() => {
        creating.value = false
      })
  })
}

async function copyText(text: string): Promise<void> {
  // 统一走 utils/clipboard（b111）：现代 API → 降级通道，返回真实结果
  const ok = await writeClipboard(text)
  if (ok) ElMessage.success(t('pat.msg.copied'))
  else ElMessage.error(t('pat.msg.copyFailed'))
}

function copyToken(): void {
  copyText(plainToken.value)
}

function finishReveal(): void {
  revealVisible.value = false
  plainToken.value = ''
  plainAccessKey.value = ''
  plainSecretKey.value = ''
}

/**
 * 令牌/AK 的行级互斥与在途 loading（b140）。
 *
 * 三个动作原先都是"`ElMessageBox.confirm(...).then(() => api())` + 全程无状态"：
 * 确认框在飞时按钮毫无指示，连点会弹出第二个确认框，用户依次确认就执行两次。
 * 对**轮换 SK** 这不是"多做一次幂等操作"而是数据丢失——一次性明文弹窗只保留最后一次
 * 的 SK，前一份明文关掉即永久不可再见（它是唯一副本）。
 * 轮换与吊销共用一把闸：两者改的是同一条 AK/SK 记录，并发会让刚下发的新 AK 立刻被作废。
 */
const { runningIds: akLoadingIds, guarded: guardAk } = useRowActionGuard<string>()
const { runningIds: revokeLoadingIds, guarded: guardRevoke } = useRowActionGuard<string>()

async function handleRevoke(row: SysPat): Promise<void> {
  await guardRevoke(
    row.patId,
    () =>
      ElMessageBox.confirm(t('pat.msg.revokeConfirm', { name: row.name }), t('common.warning'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }),
    async () => {
      await revokeMyToken(row.patId)
      ElMessage.success(t('pat.msg.revoked'))
      getList()
    }
  )
}

// ==================== 开放 API AK/SK ====================

/** 轮换 SK：二次确认后调用，新 AK/SK 明文弹窗展示（仅此一次） */
async function handleRotateAk(row: SysPat): Promise<void> {
  await guardAk(
    row.patId,
    () =>
      ElMessageBox.confirm(t('pat.akSk.rotateConfirm', { name: row.name }), t('common.warning'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }),
    async () => {
      const res = await rotateAk(row.patId)
      const data = res.data
      // 明文缺失时不得打开"一次性明文"弹窗：两个空字段会让用户以为拿到了新密钥，
      // 复制走的却是空串，而旧 SK 此刻已在服务端失效。
      if (!data?.accessKey || !data?.secretKey) {
        ElMessage.error(t('pat.akSk.rotateFailed'))
        getList()
        return
      }
      plainToken.value = ''
      plainAccessKey.value = data.accessKey
      plainSecretKey.value = data.secretKey
      revealVisible.value = true
      getList()
    }
  )
}

/** 吊销 AK：二次确认（后端幂等，重复吊销安全） */
async function handleRevokeAk(row: SysPat): Promise<void> {
  await guardAk(
    row.patId,
    () =>
      ElMessageBox.confirm(t('pat.akSk.revokeConfirm', { name: row.name }), t('common.warning'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }),
    async () => {
      await revokeAk(row.patId)
      ElMessage.success(t('pat.akSk.revoked'))
      getList()
    }
  )
}

onMounted(getList)
</script>

<style lang="scss" scoped>
.token-prefix {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
}
.scope-tag {
  margin: 2px 4px 2px 0;
}
.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.token-reveal {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.token-plain {
  flex: 1;
  font-family: var(--el-font-family-mono, monospace);
  font-size: 13px;
  word-break: break-all;
}
/* SCSS 豁免：AK/SK 明文行的标签宽度对齐，限定本组件作用域 */
.ak-label {
  width: 72px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.form-tip-block {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
</style>
