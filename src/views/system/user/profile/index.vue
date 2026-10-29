<template>
  <div class="app-container" v-loading="loading">
    <!-- b133：读失败不再伪装成「暂无数据」——失败态必须与空态可区分，且给重试入口 -->
    <el-alert v-if="loadError" type="error" :closable="false" show-icon class="mb-4" data-test="profile-load-error">
      <div class="flex items-center gap-3">
        <span>{{ t('profile.loadFailed') }}</span>
        <el-button link type="primary" @click="getUser">{{ t('common.retry') }}</el-button>
      </div>
    </el-alert>
    <el-row :gutter="20">
      <el-col :span="6" :xs="24">
        <el-card class="box-card">
          <template v-slot:header>
            <div class="clearfix">
              <span>{{ t('profile.title') }}</span>
            </div>
          </template>
          <div>
            <div class="text-center">
              <userAvatar />
            </div>
            <ul v-if="state.user.userName" class="list-group list-group-striped">
              <li class="list-group-item">
                <svg-icon icon-class="user" />
                {{ t('profile.label.userName') }}
                <div class="pull-right">{{ state.user.userName }}</div>
              </li>
              <li class="list-group-item">
                <svg-icon icon-class="phone" />
                {{ t('profile.label.phone') }}
                <div class="pull-right">{{ state.user.phonenumber }}</div>
              </li>
              <li class="list-group-item">
                <svg-icon icon-class="email" />
                {{ t('profile.label.email') }}
                <div class="pull-right">{{ state.user.email }}</div>
              </li>
              <li class="list-group-item">
                <svg-icon icon-class="tree" />
                {{ t('profile.label.dept') }}
                <div class="pull-right" v-if="state.user.dept">
                  {{ state.user.dept.deptName }} / {{ state.postGroup }}
                </div>
              </li>
              <li class="list-group-item">
                <svg-icon icon-class="peoples" />
                {{ t('profile.label.role') }}
                <div class="pull-right">{{ state.roleGroup }}</div>
              </li>
              <li class="list-group-item">
                <svg-icon icon-class="date" />
                {{ t('profile.label.createTime') }}
                <div class="pull-right">{{ state.user.createTime }}</div>
              </li>
            </ul>
            <el-empty v-else-if="!loading && !loadError" :description="t('common.noData')" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="18" :xs="24">
        <el-card>
          <template v-slot:header>
            <div class="clearfix">
              <span>{{ t('profile.basicInfo') }}</span>
            </div>
          </template>
          <el-tabs ref="tabsRef" v-model="selectedTab">
            <el-tab-pane :label="t('profile.basicInfo')" name="userinfo">
              <userInfo v-model:user="state.user" />
            </el-tab-pane>
            <el-tab-pane :label="t('profile.modifyPwd')" name="resetPwd">
              <resetPwd />
            </el-tab-pane>
            <el-tab-pane :label="t('profile.mfaSetting')" name="totp">
              <totp />
            </el-tab-pane>
            <!-- 通行密钥页签：**能力位 auth.webauthn 关闭时不渲染**（关闭态端点一律 404）。
                 用 `v-if` 而非 `v-show`：Element Plus 会渲染页签内容 ⇒ `passkeys.vue` 的
                 `onMounted` 会去探测凭据接口，能力位关闭时即产生 404 控制台错误与假入口。 -->
            <el-tab-pane v-if="isTabVisible('passkeys')" :label="t('profile.passkey.title')" name="passkeys">
              <passkeys />
            </el-tab-pane>
            <el-tab-pane :label="t('oauth.bindings')" name="oauth">
              <oauth />
            </el-tab-pane>
            <!-- 已授权应用页签：**[sso].enabled 关闭时不渲染**（关闭态 OIDC 端点不注册，
                 onMounted 即请求必然失败）。用 v-if 同 passkeys 页签口径（防 EP 渲染触发请求）。 -->
            <el-tab-pane v-if="isTabVisible('ssoGrants')" :label="t('sso.grants.title')" name="ssoGrants">
              <sso-grants />
            </el-tab-pane>
            <el-tab-pane :label="t('profile.msgPref')" name="pref">
              <msg-pref />
            </el-tab-pane>
            <!-- API 访问令牌页签：**[pat].enabled 关闭时不渲染**（关闭态鉴权层对 ybt_
                 令牌一律 401，自助端点失去意义）。用 v-if 同 passkeys 页签口径。 -->
            <el-tab-pane v-if="isTabVisible('pat')" :label="t('pat.tab')" name="pat">
              <pat-token />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="Profile">
import userAvatar from './userAvatar.vue'
import userInfo from './userInfo.vue'
import resetPwd from './resetPwd.vue'
import totp from './totp.vue'
import passkeys from './passkeys.vue'
import oauth from './oauth.vue'
import ssoGrants from './ssoGrants.vue'
import msgPref from './msgPref.vue'
import patToken from './patToken.vue'
import { getUserProfile } from '@/api/system/user'
import type { SysUser } from '@/types/api/system/user'
import useUserStore from '@/store/modules/user'

const route = useRoute()
const { t } = useI18n()
// 「通行密钥」页签是否可见由后端能力位判定（getInfo 下发 showPasskey），前端只消费不推断
const userStore = useUserStore()
const selectedTab = ref<string>('userinfo')

interface ProfileTab {
  name: string
  visible: boolean
}

/**
 * 受能力位控制的页签清单——模板 `v-if` 与深链回落判据的**单一事实源**。
 *
 * 只登记"可能不渲染"的页签：**不在本表里的名字一律视为恒可见**，因此新增不受门控的
 * 页签不必（也不得）再来这里补一份白名单——那等于把判据散落两处（必然漂移）。
 */
const gatedTabs = computed<ProfileTab[]>(() => [
  { name: 'passkeys', visible: userStore.showPasskey },
  { name: 'ssoGrants', visible: userStore.showSsoGrants },
  { name: 'pat', visible: userStore.showPat }
])
/** 模板 `v-if` 出口：能力位关闭时对应 pane 根本不渲染（防"菜单可见请求 404"假入口） */
const isTabVisible = (name: string): boolean => {
  const gated = gatedTabs.value.find((tab: ProfileTab) => tab.name === name)
  return gated ? gated.visible : true
}
const tabsRef = ref<{ $el?: HTMLElement } | undefined>()
/**
 * 深链回落判据取自**已渲染的页签导航**（Element Plus 给每个 tab 挂 `id="tab-<name>"`）。
 * 判"现实"而不是判"配置" ⇒ 同时覆盖两种空白面板：能力位关闭导致的未渲染，
 * 以及 URL 里写了本页根本不存在的页签名。新增页签也无需回来改白名单。
 */
function renderedTabNames(): string[] {
  const root = tabsRef.value?.$el ?? undefined
  if (!root) return []
  return Array.from(root.querySelectorAll('[role="tab"]'))
    .map((el) => (el as HTMLElement).id ?? '')
    .filter((id) => id.startsWith('tab-'))
    .map((id) => id.slice(4))
}

interface UserProfileState {
  user: SysUser
  roleGroup: string
  postGroup: string
}

const state = reactive<UserProfileState>({
  user: {} as SysUser,
  roleGroup: '',
  postGroup: ''
})

const loading = ref(false)
// 读失败态（b133）：失败时页面必须说明"没读到"，而不是渲染成"这个用户什么都没有"
const loadError = ref(false)

function getUser() {
  loading.value = true
  loadError.value = false
  getUserProfile()
    .then((response) => {
      state.user = response.data
      state.roleGroup = response.roleGroup
      state.postGroup = response.postGroup
    })
    .catch(() => {
      // 拦截器已提示；这里保留上一次成功的数据（若有），并让失败态可见
      loadError.value = true
    })
    .finally(() => {
      loading.value = false
    })
}

onMounted(() => {
  const activeTab = route.params && route.params.activeTab
  if (activeTab) {
    // 深链页签必须在**当前渲染集合**内，否则回落基本信息页：
    // 能力位（passkeys / ssoGrants / pat）关闭时对应 pane 根本不渲染，写入选中值即空白面板；
    // URL 写了不存在的页签名同样空白。判据取自已渲染的页签导航（renderedTabNames），
    // 而不是在脚本里另抄一份白名单——那会把判据散落两处（必然漂移）。
    const target = String(activeTab)
    selectedTab.value = renderedTabNames().includes(target) ? target : 'userinfo'
  }
  getUser()
})
</script>
