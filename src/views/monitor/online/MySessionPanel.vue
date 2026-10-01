<template>
  <div class="my-session-panel">
    <!-- 顶部信息卡片 -->
    <el-row :gutter="16" class="summary-cards mb-4">
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="summary-card summary-active flex items-center p-5 rounded-lg">
          <div class="summary-icon w-14 h-14 rounded-full flex items-center justify-center mr-4">
            <svg-icon icon-class="online" />
          </div>
          <div class="summary-meta flex-1">
            <div class="summary-label text-text-secondary mb-1.5">{{ t('mySession.activeCount') }}</div>
            <div class="summary-value font-semibold text-text-primary leading-tight">{{ sessionList.length }}</div>
            <div class="summary-sub text-xs text-text-placeholder mt-1 break-all">{{ t('mySession.activeTip') }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="summary-card summary-current flex items-center p-5 rounded-lg">
          <div class="summary-icon w-14 h-14 rounded-full flex items-center justify-center mr-4">
            <svg-icon icon-class="user" />
          </div>
          <div class="summary-meta flex-1">
            <div class="summary-label text-text-secondary mb-1.5">{{ t('mySession.currentSession') }}</div>
            <div class="summary-value font-semibold text-text-primary leading-tight">{{ userStore.name }}</div>
            <div class="summary-sub text-xs text-text-placeholder mt-1 break-all">{{ currentSessionInfo }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="summary-card summary-security flex items-center p-5 rounded-lg">
          <div class="summary-icon w-14 h-14 rounded-full flex items-center justify-center mr-4">
            <svg-icon icon-class="bug" />
          </div>
          <div class="summary-meta flex-1">
            <div class="summary-label text-text-secondary mb-1.5">{{ t('mySession.securityStatus') }}</div>
            <div class="summary-value font-semibold text-text-primary leading-tight">{{ securityStatus }}</div>
            <div class="summary-sub text-xs text-text-placeholder mt-1 break-all">{{ securityTip }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 安全提醒 -->
    <Transition mode="out-in" name="fade">
      <el-alert
        v-if="hasOtherSession"
        key="other-session"
        :title="t('mySession.otherSessionAlert')"
        :description="t('mySession.otherSessionAlertDesc')"
        type="warning"
        show-icon
        :closable="false"
        class="security-banner mb-4"
      />
      <el-alert
        v-else
        key="only-session"
        :title="t('mySession.onlySessionAlert')"
        type="success"
        show-icon
        :closable="false"
        class="security-banner mb-4"
      />
    </Transition>

    <!-- 操作工具栏 -->
    <el-card shadow="never" class="toolbar-card mb-4">
      <div class="toolbar flex justify-between items-center flex-wrap gap-3">
        <div class="toolbar-left flex items-center gap-2 flex-wrap">
          <el-input
            v-model="queryParams.ipaddr"
            :placeholder="t('mySession.searchIp')"
            :maxlength="50"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
            @clear="handleQuery"
          />
          <el-button @click="handleQuery">
            <svg-icon icon-class="search" />
            {{ t('common.search') }}
          </el-button>
          <el-button @click="resetQuery">
            <svg-icon icon-class="refresh" />
            {{ t('common.reset') }}
          </el-button>
        </div>
        <div class="toolbar-right flex items-center gap-2 flex-wrap">
          <el-button type="primary" @click="getList">
            <svg-icon icon-class="refresh" />
            {{ t('common.refresh') }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 会话列表 -->
    <el-alert
      v-if="degradedIdentification"
      type="warning"
      :closable="true"
      show-icon
      class="mb10"
      :title="t('mySession.degradedHint')"
    />
    <el-card shadow="never" class="list-card" v-loading="loading">
      <el-table :data="filteredSessions" :empty-text="t('common.noData')">
        <el-table-column :label="t('mySession.colStatus')" width="120">
          <template #default="{ row }">
            <el-tag v-if="isCurrentSession(row)" type="success" size="small" effect="dark">
              {{ t('mySession.currentTag') }}
            </el-tag>
            <el-tag v-else type="info" size="small">
              {{ t('mySession.otherTag') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ipaddr" :label="t('mySession.colIp')" width="140" />
        <el-table-column prop="loginLocation" :label="t('mySession.colLocation')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.loginLocation || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="browser" :label="t('mySession.colBrowser')" min-width="140" show-overflow-tooltip />
        <el-table-column prop="os" :label="t('mySession.colOs')" min-width="160" show-overflow-tooltip />
        <el-table-column :label="t('mySession.colLoginTime')" width="170">
          <template #default="{ row }">
            {{ formatTime(row.loginTime) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" width="120" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!isCurrentSession(row)"
              type="danger"
              link
              size="small"
              :loading="logoutTokenId === row.tokenId"
              @click="handleForceLogout(row)"
            >
              {{ t('mySession.logout') }}
            </el-button>
            <span v-else class="current-text text-xs text-text-secondary">{{ t('mySession.currentTag') }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import useUserStore from '@/store/modules/user'
import { listMySessions as listOnline, logoutMySession as forceLogout } from '@/api/monitor/online'
import { getToken } from '@/utils/auth'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import modal from '@/plugins/modal'

const { t } = useI18n()
const userStore = useUserStore()

interface SessionRow {
  tokenId: string
  deptName: string
  userName: string
  ipaddr: string
  loginLocation: string
  browser: string
  os: string
  loginTime: number
}

const loading = ref(false)
const sessionList = shallowRef<SessionRow[]>([])
const currentTokenHash = ref<string>('')

const queryParams = reactive({
  ipaddr: undefined as string | undefined,
  userName: undefined as string | undefined
})

// 获取当前用户的 token 哈希（从 cookie 中的 token 计算 SHA-256）
// 降级：在不支持 crypto.subtle 的环境（如非 https）下取 token 末 8 位作为标识。
// v5-E7：降级标识为弱匹配（两个 token 末 8 位理论上可碰撞），置 degraded 标志，
// 模板展示提示条——建议在 https 环境使用以获得精确的当前会话识别。
const degradedIdentification = ref(false)

async function computeTokenHash(token: string): Promise<string> {
  if (!window.crypto?.subtle) {
    degradedIdentification.value = true
    return token.slice(-8)
  }
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 判断是否为当前会话
function isCurrentSession(row: SessionRow): boolean {
  return row.tokenId === currentTokenHash.value
}

// 当前会话信息
const currentSessionInfo = computed(() => {
  const current = sessionList.value.find((s: SessionRow) => isCurrentSession(s))
  if (!current) return '-'
  return `${current.browser} · ${current.ipaddr}`
})

// 是否有其他会话
const hasOtherSession = computed(() => {
  return sessionList.value.filter((s: SessionRow) => !isCurrentSession(s)).length > 0
})

// 安全状态
const securityStatus = computed(() => {
  const others = sessionList.value.filter((s: SessionRow) => !isCurrentSession(s))
  if (others.length === 0) return t('mySession.secureGood')
  if (others.length <= 1) return t('mySession.secureNormal')
  return t('mySession.secureWarn')
})

const securityTip = computed(() => {
  const others = sessionList.value.filter((s: SessionRow) => !isCurrentSession(s))
  if (others.length === 0) return t('mySession.secureGoodTip')
  if (others.length <= 1) return t('mySession.secureNormalTip')
  return t('mySession.secureWarnTip', { count: others.length })
})

// 过滤后的会话列表（接口已按 userName 过滤，前端只处理 IP 搜索）
const filteredSessions = computed(() => {
  let list = sessionList.value
  if (queryParams.ipaddr) {
    list = list.filter((s: SessionRow) => s.ipaddr.includes(queryParams.ipaddr!))
  }
  return list
})

// 格式化时间
function formatTime(timestamp: number): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 获取会话列表
// P1 修复: 使用请求序号防止竞态——silentRefresh 与手动刷新并发时，旧请求结果不覆盖新请求结果
let requestSeq = 0
async function getList() {
  loading.value = true
  const seq = ++requestSeq
  try {
    const token = getToken() as string
    if (token && !currentTokenHash.value) {
      currentTokenHash.value = await computeTokenHash(token)
    }
    const res = await listOnline({ ipaddr: undefined, userName: userStore.name })
    // 仅当本次请求是最新的才更新结果，避免旧请求覆盖新请求
    if (seq === requestSeq) {
      sessionList.value = res.rows || []
    }
  } catch {
    // 静默处理错误
  } finally {
    if (seq === requestSeq) {
      loading.value = false
    }
  }
}

// P1-5：接入 useAutoRefresh（读取用户偏好 autoRefreshInterval，标签页隐藏时自动暂停）
// 静默刷新：不显示 loading，避免周期性闪烁
async function silentRefresh() {
  const seq = ++requestSeq
  try {
    const res = await listOnline({ ipaddr: undefined, userName: userStore.name })
    if (seq === requestSeq) {
      sessionList.value = res.rows || []
    }
  } catch {
    // 静默刷新失败不打扰用户
  }
}

// 查询
function handleQuery() {
  getList()
}

// 重置
function resetQuery() {
  queryParams.ipaddr = undefined
  getList()
}

// 强退其他会话
const logoutTokenId = ref<string | null>(null)

async function handleForceLogout(row: SessionRow) {
  try {
    await modal.confirm(t('mySession.logoutConfirm', { ip: row.ipaddr, browser: row.browser }))
    logoutTokenId.value = row.tokenId
    await forceLogout(row.tokenId)
    modal.msgSuccess(t('mySession.logoutSuccess'))
    await getList()
  } catch (e) {
    if (e !== 'cancel') {
      modal.msgError(t('mySession.logoutFail'))
    }
  } finally {
    logoutTokenId.value = null
  }
}

onMounted(() => {
  getList()
})

// P1-5：自动刷新由 useAutoRefresh 统一管理（用户偏好 + 可见性暂停 + 自动清理）
useAutoRefresh(() => silentRefresh())
</script>

<style lang="scss" scoped>
.summary-card {
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
  }

  .summary-icon {
    font-size: 28px;
    color: var(--el-color-white);
  }

  .summary-label {
    font-size: 13px;
  }

  .summary-value {
    font-size: 22px;
  }

  &.summary-active .summary-icon {
    background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
  }

  &.summary-current .summary-icon {
    background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-3));
  }

  &.summary-security .summary-icon {
    background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-light-3));
  }
}

@media screen and (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch !important;
  }
}

// 暗色模式适配
:deep(html.dark) .summary-value {
  color: var(--el-text-color-primary);
}

:deep(html.dark) .summary-label,
:deep(html.dark) .summary-sub {
  color: var(--el-text-color-secondary);
}

:deep(html.dark) .current-text {
  color: var(--el-text-color-secondary);
}
</style>
