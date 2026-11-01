<template>
  <el-drawer
    :title="t('userView.title')"
    v-model="visible"
    direction="rtl"
    size="min(80%, 700px)"
    append-to-body
    :before-close="handleClose"
    class="detail-drawer"
  >
    <div v-loading="loading" class="drawer-content">
      <!-- 读失败不得显示成"这个人没有资料"，更不得留着上一个人的资料（b146 / ㊷）：
           改造前 `info` 是永不复位的 reactive，看 A 成功后看 B 失败 ⇒ 屏上是 A 的账号、
           部门与状态标签，而徽标只说"没加载出来"。失败态与数据体互斥渲染，并给重试入口。 -->
      <el-alert v-if="loadError" type="error" :closable="false" show-icon :title="t('common.loadFailed')">
        <el-button link type="primary" :disabled="loading" @click="load">{{ t('common.retry') }}</el-button>
      </el-alert>
      <template v-if="hasData">
        <!-- 基本信息 -->
        <h4 class="section-header">{{ t('userView.basicInfo') }}</h4>
        <el-row :gutter="20" class="mb8">
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.userName') }}</label>
              <span class="info-value plaintext">{{ info.nickName }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.dept') }}</label>
              <span class="info-value plaintext">{{ info.dept && info.dept.deptName }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" class="mb8">
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.phone') }}</label>
              <span class="info-value plaintext">{{ info.phonenumber }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.email') }}</label>
              <span class="info-value plaintext">{{ info.email }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" class="mb8">
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.loginAccount') }}</label>
              <span class="info-value plaintext">{{ info.userName }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.status') }}</label>
              <span class="info-value plaintext">
                <el-tag size="small" :type="info.status === '0' ? 'success' : 'danger'">
                  {{ info.status === '0' ? t('common.normal') : t('common.disabled') }}
                </el-tag>
              </span>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" class="mb8">
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.post') }}</label>
              <span class="info-value plaintext">{{ postNames || t('userView.placeholder.noPost') }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.sex') }}</label>
              <span class="info-value plaintext">{{ sexLabel }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" class="mb8">
          <el-col :span="24">
            <div class="info-item full-width">
              <label class="info-label">{{ t('userView.label.role') }}</label>
              <span class="info-value plaintext">{{ roleNames || t('userView.placeholder.noRole') }}</span>
            </div>
          </el-col>
        </el-row>
        <!-- 其他信息 -->
        <h4 class="section-header">{{ t('userView.otherInfo') }}</h4>
        <el-row :gutter="20" class="mb8">
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.createBy') }}</label>
              <span class="info-value plaintext">{{ info.createBy }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.createTime') }}</label>
              <span class="info-value plaintext">{{ info.createTime }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" class="mb8">
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.updateBy') }}</label>
              <span class="info-value plaintext">{{ info.updateBy }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.updateTime') }}</label>
              <span class="info-value plaintext">{{ info.updateTime }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" class="mb8">
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.lastLoginIp') }}</label>
              <span class="info-value plaintext">{{ info.loginIp }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <label class="info-label">{{ t('userView.label.lastLoginTime') }}</label>
              <span class="info-value plaintext">{{ info.loginDate }}</span>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" class="mb8">
          <el-col :span="24">
            <div class="info-item full-width">
              <label class="info-label">{{ t('userView.label.remark') }}</label>
              <span class="info-value plaintext">{{ info.remark }}</span>
            </div>
          </el-col>
        </el-row>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { getUser } from '@/api/system/user'
import type { SysUser } from '@/types/api/system/user'
import type { SysRole } from '@/types/api/system/role'
import type { SysPost } from '@/types/api/system/post'

const { t } = useI18n()

const visible = ref<boolean>(false)
const loading = ref<boolean>(false)
const info = reactive<SysUser>({})
const postOptions = ref<SysPost[]>([])
const roleOptions = ref<SysRole[]>([])
/** 读失败标记：与"这个用户本来就没有这些字段"必须是两屏（㊷ ①） */
const loadError = ref<boolean>(false)
/** 当前抽屉问的是谁 —— 重试必须重问同一个人，不能靠闭包里的旧参数 */
const currentUserId = ref<number>(0)

/** 有数据才渲染明细体：`userName` 是主键列、成功响应必然带 */
const hasData = computed<boolean>(() => !!info.userName)

/**
 * 换查询身份 = 先丢快照。
 *
 * 只清 `info` 不够：岗位/角色两张清单同样属于上一个人，`postNames` 会把 A 的岗位
 * 配着 B 的 `postIds` 去过滤 ⇒ 显示成一串与 B 无关的岗位名。
 */
function resetSnapshot(): void {
  for (const key of Object.keys(info)) delete (info as Record<string, unknown>)[key]
  postOptions.value = []
  roleOptions.value = []
  loadError.value = false
}

const { sys_user_sex } = useDict('sys_user_sex')

const sexLabel = computed(() => selectDictLabel(sys_user_sex.value, info.sex) || '-')

const postNames = computed<string>(() => {
  if (!postOptions.value.length || !info.postIds) return ''
  return (
    postOptions.value
      .filter((p: SysPost) => info.postIds?.includes(p.postId))
      .map((p: SysPost) => p.postName)
      .join('、') || ''
  )
})

const roleNames = computed<string>(() => {
  if (!roleOptions.value.length || !info.roleIds) return ''
  return (
    roleOptions.value
      .filter((r: SysRole) => info.roleIds?.includes(r.roleId))
      .map((r: SysRole) => r.roleName)
      .join('、') || ''
  )
})

const open = async (userId: number): Promise<void> => {
  currentUserId.value = userId
  visible.value = true
  await load()
}

/**
 * 取数：先丢快照再问，结局分三态（在途 / 有数据 / 读失败）。
 *
 * 两条口径来自既有纪律：① 200 但 `data` 为空也算"没读到"（b133 ②，拿空对象冒充资料
 * 与拿上一个人的资料冒充是同一种骗法）；② 拒绝不得逸出，否则 ErrorBoundary 会把这个
 * 抽屉连同父页面一起卸载（b103/b110）。失败提示走屏上的告警 + 重试，不另弹一条 toast。
 */
const load = async (): Promise<void> => {
  resetSnapshot()
  loading.value = true
  try {
    const res = await getUser(currentUserId.value)
    if (!res.data) {
      loadError.value = true
      return
    }
    Object.assign(info, res.data)
    postOptions.value = res.posts || []
    roleOptions.value = res.roles || []
    info.postIds = res.postIds || []
    info.roleIds = res.roleIds || []
  } catch (error) {
    loadError.value = true
    if (import.meta.env.DEV) console.error('[userView] 详情读取失败:', error)
  } finally {
    loading.value = false
  }
}

const handleClose = (): void => {
  visible.value = false
}

defineExpose({
  open
})
</script>
