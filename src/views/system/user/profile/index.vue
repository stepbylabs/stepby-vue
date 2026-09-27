<template>
  <div class="app-container">
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
            <ul class="list-group list-group-striped">
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
          <el-tabs v-model="selectedTab">
            <el-tab-pane :label="t('profile.basicInfo')" name="userinfo">
              <userInfo v-model:user="state.user" />
            </el-tab-pane>
            <el-tab-pane :label="t('profile.modifyPwd')" name="resetPwd">
              <resetPwd />
            </el-tab-pane>
            <el-tab-pane :label="t('profile.mfaSetting')" name="totp">
              <totp />
            </el-tab-pane>
            <el-tab-pane :label="t('profile.passkey.title')" name="passkeys">
              <passkeys />
            </el-tab-pane>
            <el-tab-pane :label="t('oauth.bindings')" name="oauth">
              <oauth />
            </el-tab-pane>
            <el-tab-pane :label="t('sso.grants.title')" name="ssoGrants">
              <sso-grants />
            </el-tab-pane>
            <el-tab-pane :label="t('profile.msgPref')" name="pref">
              <msg-pref />
            </el-tab-pane>
            <el-tab-pane :label="t('pat.tab')" name="pat">
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

const route = useRoute()
const { t } = useI18n()
const selectedTab = ref<string>('userinfo')

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

function getUser() {
  getUserProfile()
    .then((response) => {
      state.user = response.data
      state.roleGroup = response.roleGroup
      state.postGroup = response.postGroup
    })
    .catch(() => {})
}

onMounted(() => {
  const activeTab = route.params && route.params.activeTab
  if (activeTab) {
    selectedTab.value = activeTab as string
  }
  getUser()
})
</script>
