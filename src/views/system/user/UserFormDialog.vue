<template>
  <el-dialog :title="title" v-model="open" width="min(90%, 600px)" append-to-body destroy-on-close :before-close="beforeClose">
    <el-form :model="form" :rules="rules" ref="userRef" label-width="80px">
      <el-row>
        <el-col :span="12">
          <el-form-item :label="t('user.form.nickName')" prop="nickName">
            <el-input v-model="form.nickName" :placeholder="t('common.form.inputPlaceholder')" maxlength="30" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('user.form.dept')" prop="deptId">
            <el-tree-select
              v-model="form.deptId"
              :data="enabledDeptOptions"
              :props="{ value: 'id', label: 'label', children: 'children' }"
              value-key="id"
              :placeholder="t('common.form.selectPlaceholder')"
              clearable
              check-strictly
            />
            <div class="el-form-item__tip">{{ t('user.form.deptPrimaryTip') }}</div>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="24">
          <el-form-item :label="t('user.form.deptSecondary')">
            <el-tree-select
              v-model="form.deptIds"
              :data="secondaryDeptOptions"
              :props="{ value: 'id', label: 'label', children: 'children' }"
              value-key="id"
              :placeholder="t('common.form.selectPlaceholder')"
              multiple
              clearable
              check-strictly
              style="width: 100%"
            />
            <div v-if="scimDeptTags.length" class="el-form-item__tip">
              {{ t('user.form.scimDeptTags') }}：
              <el-tag
                v-for="d in scimDeptTags"
                :key="d.id"
                size="small"
                type="warning"
                class="mr-1"
              >
                {{ d.label }}
              </el-tag>
            </div>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <el-form-item :label="t('user.form.phone')" prop="phonenumber">
            <el-input v-model.trim="form.phonenumber" :placeholder="t('common.form.inputPlaceholder')" maxlength="11" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('user.form.email')" prop="email">
            <el-input v-model.trim="form.email" :placeholder="t('common.form.inputPlaceholder')" maxlength="50" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <Transition name="expand-fade">
            <el-form-item v-if="form.userId == undefined" :label="t('user.form.username')" prop="userName">
              <el-input v-model="form.userName" :placeholder="t('common.form.inputPlaceholder')" maxlength="30" />
            </el-form-item>
          </Transition>
        </el-col>
        <el-col :span="12">
          <Transition name="expand-fade">
            <el-form-item
              v-if="form.userId == undefined"
              :label="t('user.form.password')"
              prop="password"
              :rules="pwdValidator"
            >
              <el-input
                v-model.trim="form.password"
                :placeholder="t('user.form.phPassword')"
                type="password"
                maxlength="20"
                show-password
              />
            </el-form-item>
          </Transition>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <el-form-item :label="t('user.form.sex')">
            <el-select v-model="form.sex" :placeholder="t('common.form.selectPlaceholder')">
              <el-option
                v-for="dict in sys_user_sex"
                :key="dict.value"
                :label="dict.label"
                :value="dict.value"
              ></el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('user.form.status')">
            <el-radio-group v-model="form.status">
              <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
                {{ dict.label }}
              </el-radio>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <el-form-item :label="t('user.form.post')">
            <el-select v-model="form.postIds" multiple :placeholder="t('common.form.selectPlaceholder')">
              <el-option
                v-for="item in postOptions"
                :key="item.postId"
                :label="item.postName"
                :value="item.postId"
                :disabled="item.status == 1"
              ></el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('user.form.role')">
            <el-select v-model="form.roleIds" multiple :placeholder="t('common.form.selectPlaceholder')">
              <el-option
                v-for="item in roleOptions"
                :key="item.roleId"
                :label="scimRoleIds.includes(item.roleId) ? item.roleName + '（' + t('user.form.scimRoleSuffix') + '）' : item.roleName"
                :value="item.roleId"
                :disabled="item.status == 1 || scimRoleIds.includes(item.roleId)"
              ></el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="24">
          <el-form-item :label="t('user.form.remark')">
            <el-input
              v-model="form.remark"
              type="textarea"
              :placeholder="t('common.form.inputPlaceholder')"
              :maxlength="500"
              show-word-limit
            ></el-input>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
        <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="UserFormDialog">
import { addUser, updateUser } from '@/api/system/user'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import type { SysUser } from '@/types/api/system/user'
import type { SysRole } from '@/types/api/system/role'
import type { SysPost } from '@/types/api/system/post'
import type { TreeSelect } from '@/types/api/common'
import modal from '@/plugins/modal'
import { usePasswordRule } from '@/utils/passwordRule'

const { t } = useI18n()

const props = defineProps<{
  /** 对话框标题（新增/修改） */
  title: string
  /** 部门树（含禁用，供父级侧边树使用，此处仅透传保留） */
  deptOptions?: TreeSelect[]
  /** 启用的部门树（新增/修改用户时选择部门） */
  enabledDeptOptions?: TreeSelect[]
  /** 岗位选项 */
  postOptions?: SysPost[]
  /** 角色选项 */
  roleOptions?: SysRole[]
  /** v5-D12 Group：SCIM 组联动角色 id 集合（角色树禁选 + "来自组"标记） */
  scimRoleIds?: number[]
  /** v5-D12 Group：SCIM 组同步兼职部门 id 集合（只读 tags 展示） */
  scimDeptIds?: number[]
  /** 编辑场景回填的用户数据（含 postIds/roleIds），新增场景不传 */
  editUser?: SysUser
  /** 新增用户初始密码（取自 sys.user.initPassword 配置） */
  initPassword?: string
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  (e: 'submit-success'): void
  (e: 'cancel'): void
}>()

const { pwdValidator } = usePasswordRule()
/** 未保存离开确认（UX-5）：弹窗打开时快照，× / ESC / 遮罩 / 取消 关闭前若脏则确认 */
const { snapshotForm, markSaved, confirmLeave } = useUnsavedGuard()

const scimRoleIds = computed(() => props.scimRoleIds ?? [])
const scimDeptIds = computed(() => props.scimDeptIds ?? [])

/** SCIM 兼职只读 tags 的名称解析（从部门树查找 label） */
const scimDeptTags = computed(() => {
  const out: { id: number; label: string }[] = []
  const walk = (nodes: TreeSelect[]) => {
    for (const n of nodes) {
      if (n.id != null && n.label != null && scimDeptIds.value.includes(n.id)) out.push({ id: n.id, label: n.label })
      if (n.children?.length) walk(n.children)
    }
  }
  walk(props.enabledDeptOptions ?? [])
  return out
})

/** 兼职部门树：排除当前主部门（主部门唯一事实源 = deptId，防重复归属） */
const secondaryDeptOptions = computed<TreeSelect[]>(() => {
  const clone = JSON.parse(JSON.stringify(props.enabledDeptOptions ?? [])) as TreeSelect[]
  const prune = (nodes: TreeSelect[]): TreeSelect[] =>
    nodes
      .filter((n) => n.id !== form.value.deptId)
      .map((n) => ({ ...n, children: n.children?.length ? prune(n.children) : n.children }))
  return prune(clone)
})
const { sys_normal_disable, sys_user_sex } = useDict('sys_normal_disable', 'sys_user_sex')

const userRef = useTemplateRef('userRef')
const submitLoading = ref<boolean>(false)

const form = ref<SysUser>({
  userId: undefined,
  deptId: undefined,
  userName: undefined,
  nickName: undefined,
  password: undefined,
  phonenumber: undefined,
  email: undefined,
  sex: undefined,
  status: '0',
  remark: undefined,
  postIds: [],
  roleIds: [],
  deptIds: []
})

// M1: rules 改为 computed 以响应语言切换；el-form 通过 :rules 绑定读取最新值，validate 仍可正常工作
const rules = computed(() => ({
  userName: [
    { required: true, message: t('user.validate.userNameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('user.validate.userNameLength'), trigger: 'blur' }
  ],
  nickName: [{ required: true, message: t('user.validate.nickNameRequired'), trigger: 'blur' }],
  email: [{ type: 'email', message: t('user.validate.emailFormat'), trigger: ['blur', 'change'] }],
  phonenumber: [{ pattern: /^1[3|4|5|6|7|8|9][0-9]\d{8}$/, message: t('user.validate.phoneFormat'), trigger: 'blur' }]
}))

/** 重置操作表单 */
function reset() {
  form.value = {
    userId: undefined,
    deptId: undefined,
    userName: undefined,
    nickName: undefined,
    password: undefined,
    phonenumber: undefined,
    email: undefined,
    sex: undefined,
    status: '0',
    remark: undefined,
    postIds: [],
    roleIds: [],
    deptIds: []
  }
  userRef.value?.resetFields()
}

// 弹窗打开时：先重置表单，再按场景回填（编辑回填用户数据，新增填充初始密码）
// 注意：destroy-on-close 下对话框内容在关闭时已销毁，此处 userRef 尚未挂载，resetFields 为空操作，
// 与原有实现行为一致；真正回填通过下方直接赋值 form 完成。
watch(open, (val: boolean) => {
  if (!val) return
  reset()
  if (props.editUser) {
    Object.assign(form.value, props.editUser, { password: '' })
  } else {
    form.value.password = props.initPassword
  }
  // 回填完成后快照为"已保存"基准（before-close 脏检查依据）
  snapshotForm(form.value)
})

/** × / ESC / 遮罩关闭前确认（UX-5）：脏表单需用户显式确认放弃 */
async function beforeClose(done: () => void): Promise<void> {
  if (await confirmLeave(form.value)) done()
}

/** 取消按钮（显式取消同样走未保存确认） */
async function cancel(): Promise<void> {
  if (await confirmLeave(form.value)) {
    open.value = false
    emit('cancel')
  }
}

/** 提交按钮 */
function submitForm() {
  userRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      // 兼职部门：提交前排除与主部门重复项（主部门唯一事实源 = deptId）
      if (form.value.deptIds?.length && form.value.deptId != null) {
        form.value.deptIds = form.value.deptIds.filter((d: number) => d !== form.value.deptId)
      }
      if (form.value.userId != undefined) {
        updateUser(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
            markSaved(form.value)
            open.value = false
            emit('submit-success')
          })
          // M4: 更新失败由 request 拦截器提示，此处记录日志
          .catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to update user:', e)
          })
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        addUser(form.value)
          .then(() => {
            modal.msgSuccess(t('common.addSuccess'))
            markSaved(form.value)
            open.value = false
            emit('submit-success')
          })
          // M4: 新增失败由 request 拦截器提示，此处记录日志
          .catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to add user:', e)
          })
          .finally(() => {
            submitLoading.value = false
          })
      }
    }
  })
}
</script>
