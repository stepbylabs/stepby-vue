<template>
  <el-dialog :title="title" v-model="open" width="min(90%, 600px)" append-to-body destroy-on-close>
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
                :label="item.roleName"
                :value="item.roleId"
                :disabled="item.status == 1"
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
  roleIds: []
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
    roleIds: []
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
})

/** 取消按钮 */
function cancel() {
  open.value = false
  emit('cancel')
}

/** 提交按钮 */
function submitForm() {
  userRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.userId != undefined) {
        updateUser(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
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
