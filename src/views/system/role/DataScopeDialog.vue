<template>
  <!-- 分配角色数据权限对话框 -->
  <el-dialog :title="title" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close>
    <el-form :model="form" label-width="80px">
      <el-form-item :label="t('role.form.roleName')">
        <el-input v-model="form.roleName" :disabled="true" />
      </el-form-item>
      <el-form-item :label="t('role.form.roleKey')">
        <el-input v-model="form.roleKey" :disabled="true" />
      </el-form-item>
      <el-form-item :label="t('role.form.dataScope')">
        <el-select :aria-label="t('role.form.dataScope')" v-model="form.dataScope" @change="dataScopeSelectChange">
          <el-option
            v-for="item in dataScopeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          ></el-option>
        </el-select>
      </el-form-item>
      <Transition name="expand-fade">
        <el-form-item :label="t('role.form.deptTree')" v-show="form.dataScope == 2">
          <el-checkbox v-model="deptExpand" @change="handleCheckedTreeExpand($event, 'dept')">
            {{ t('common.expand') }}/{{ t('common.collapse') }}
          </el-checkbox>
          <el-checkbox v-model="deptNodeAll" @change="handleCheckedTreeNodeAll($event, 'dept')">
            {{ t('role.label.selectAll') }}
          </el-checkbox>
          <el-checkbox v-model="form.deptCheckStrictly" @change="handleCheckedTreeConnect($event, 'dept')">
            {{ t('role.label.linkage') }}
          </el-checkbox>
          <el-tree
            class="tree-border"
            :data="deptOptions"
            show-checkbox
            default-expand-all
            ref="deptRef"
            node-key="id"
            :check-strictly="!form.deptCheckStrictly"
            :empty-text="t('common.loading')"
            :props="{ label: 'label', children: 'children' }"
          ></el-tree>
        </el-form-item>
      </Transition>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" :loading="dataScopeLoading" @click="submitDataScope">
          {{ t('common.confirm') }}
        </el-button>
        <el-button @click="cancelDataScope">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="DataScopeDialog">
import { dataScope } from '@/api/system/role'
import type { SysRole } from '@/types/api/system/role'
import type { TreeSelect } from '@/types/api/common'
import type { TreeInstance } from 'element-plus'
import modal from '@/plugins/modal'

const props = defineProps<{
  /** 对话框标题（父级 handleDataScope 设为 t('role.form.deptTree')） */
  title: string
  /** 部门树数据（父级 getDeptTree 加载） */
  deptOptions: TreeSelect[]
}>()

/** 角色表单对象（父级持有；就地读写 roleName/roleKey/dataScope/deptCheckStrictly/deptIds，与拆分前共享同一 reactive 对象） */
const form = defineModel<SysRole>('form')

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  (e: 'success'): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()
const deptRef = useTemplateRef<TreeInstance>('deptRef')
const deptExpand = ref<boolean>(true)
const deptNodeAll = ref<boolean>(false)
// P1 修复: 数据权限提交按钮独立 loading，避免与 submitLoading（角色 CRUD）混淆
// 防止用户重复点击导致重复提交
const dataScopeLoading = ref<boolean>(false)

/** 数据范围选项 - M1: 使用 computed 响应语言切换 */
const dataScopeOptions = computed(() => [
  { value: '1', label: t('role.dataScopeOptions.all') },
  { value: '2', label: t('role.dataScopeOptions.custom') },
  { value: '3', label: t('role.dataScopeOptions.dept') },
  { value: '4', label: t('role.dataScopeOptions.deptAndBelow') },
  { value: '5', label: t('role.dataScopeOptions.self') }
])

// 打开时重置树快捷操作状态（原父级 reset() 的 dept 部分，随块迁入；行为等价：
// 父级每次打开本对话框前必先调用 reset()，此处于 open=true 时重置效果一致）
watch(
  open,
  (v: boolean) => {
    if (v) {
      deptExpand.value = true
      deptNodeAll.value = false
    }
  },
  { immediate: true }
)

/** 树权限（展开/折叠）*/
function handleCheckedTreeExpand(value: boolean, type: string) {
  if (type == 'dept') {
    // H4: 改用公共 getNode API 替代 store.nodesMap 私有 API，避免依赖内部实现
    for (const node of props.deptOptions) {
      const treeNode = deptRef.value?.getNode(node.id)
      if (treeNode) {
        treeNode.expanded = value
      }
    }
  }
}

/** 树权限（全选/全不选） */
function handleCheckedTreeNodeAll(value: boolean, type: string) {
  if (type == 'dept') {
    deptRef.value?.setCheckedNodes(value ? props.deptOptions : [])
  }
}

/** 树权限（父子联动） */
function handleCheckedTreeConnect(value: boolean, type: string) {
  if (type == 'dept') {
    form.value!.deptCheckStrictly = value
  }
}

/** 所有部门节点数据 */
function getDeptAllCheckedKeys(): number[] {
  // 目前被选中的部门节点
  const checkedKeys = deptRef.value?.getCheckedKeys() ?? []
  // 半选中的部门节点
  const halfCheckedKeys = deptRef.value?.getHalfCheckedKeys() ?? []
  // L3: 使用 spread 替代 unshift.apply 老式写法
  checkedKeys.unshift(...halfCheckedKeys)
  return checkedKeys
}

/** 选择角色权限范围触发 */
// L9: 移除未使用的 value 参数，直接读取 v-model 绑定的 form.dataScope
function dataScopeSelectChange() {
  if (form.value!.dataScope !== '2') {
    deptRef.value?.setCheckedKeys([])
  }
}

/** 提交按钮（数据权限） */
function submitDataScope() {
  if (form.value!.roleId != undefined) {
    dataScopeLoading.value = true
    form.value!.deptIds = getDeptAllCheckedKeys()
    // P1 修复: 增加 loading 绑定 + catch 错误处理 + finally 重置 loading
    // 避免重复提交，且 API 失败时不关闭对话框（让用户能修改后重试）
    dataScope(form.value)
      .then(() => {
        modal.msgSuccess(t('common.editSuccess'))
        open.value = false
        emit('success')
      })
      .catch(() => {})
      .finally(() => {
        dataScopeLoading.value = false
      })
  }
}

/** 取消按钮（数据权限）*/
function cancelDataScope() {
  open.value = false
  emit('cancel')
}

/** 父级在对话框渲染完成后回填该角色的已选部门（原 deptRef 直连的等价入口） */
function setCheckedKeys(keys: number[]) {
  if (deptRef.value) {
    deptRef.value?.setCheckedKeys(keys)
  }
}

defineExpose({ setCheckedKeys })
</script>
