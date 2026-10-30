<template>
  <div>
    <el-dialog
      :close-on-click-modal="false"
      :before-close="beforeClose"
      :title="t('build.treeNodeDialog.title')"
      v-model="open"
      width="800px"
      append-to-body
      destroy-on-close
      @open="onOpen"
      @close="onClose"
    >
      <el-form ref="treeNodeForm" :model="formData" :rules="rules" label-width="100px">
        <el-col :span="24">
          <el-form-item :label="t('build.treeNodeDialog.label')" prop="label">
            <el-input
              v-model="formData.label"
              :placeholder="t('build.treeNodeDialog.phOptionName')"
              :maxlength="50"
              clearable
              :aria-label="t('build.treeNodeDialog.phOptionName')"
            />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item :label="t('build.treeNodeDialog.value')" prop="value">
            <el-input
              v-model="formData.value"
              :placeholder="t('build.treeNodeDialog.phOptionValue')"
              :maxlength="100"
              clearable
              :aria-label="t('build.treeNodeDialog.phOptionValue')"
            >
              <template #append>
                <el-select
                  :aria-label="t('build.treeNodeDialog.valueType')"
                  v-model="dataType"
                  :style="{ width: '100px' }"
                >
                  <el-option
                    v-for="item in dataTypeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                    :disabled="item.disabled"
                  />
                </el-select>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="handleConfirm">
            {{ t('common.confirm') }}
          </el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import modal from '@/plugins/modal'
/* eslint-disable @typescript-eslint/no-explicit-any */
// 表单构建器树节点对话框：节点数据结构由配置决定，类型无法静态约束
const { t } = useI18n()
const open = defineModel()
// P1 修复: emit 声明与实际 emit('commit') 不一致，修正为 'commit'
const emit = defineEmits(['commit'])
const formData = ref({
  label: undefined,
  value: undefined
})
/** 关闭语义（b135）：配置项填一半按 Esc / 点遮罩原先会静默丢弃 */
const { beforeClose, cancel, snapshot } = useDialogDirtyGuard(open, formData)
// P1 修复: 添加 submitLoading 防止重复提交
const submitLoading = ref(false)
const rules = {
  label: [
    {
      required: true,
      message: t('build.treeNodeDialog.validate.labelRequired'),
      trigger: 'blur'
    }
  ],
  value: [
    {
      required: true,
      message: t('build.treeNodeDialog.validate.valueRequired'),
      trigger: 'blur'
    }
  ]
}
const dataType = ref<string>('string')
const dataTypeOptions = ref<any[]>([
  {
    label: t('build.treeNodeDialog.dataType.string'),
    value: 'string'
  },
  {
    label: t('build.treeNodeDialog.dataType.number'),
    value: 'number'
  }
])
const id = ref<number>(100)
const treeNodeForm = useTemplateRef<any>('treeNodeForm')

function onOpen(): void {
  formData.value = {
    label: undefined,
    value: undefined
  }
  // 类型必须随开窗复位：上一次选了「数字」后，下一次输入 "001" 会被 parseFloat 静默改成 1
  // （值类型由用户在该行单选组里选，但残留选择极易漏看，生成配置就此损坏）
  dataType.value = 'string'
  // 每开窗都重置：重置发生在开窗基准之后，不重拍就会拿上一次的残值当基准（开窗即判脏）
  snapshot()
}

function onClose(): void {
  open.value = false
}

function handleConfirm(): void {
  submitLoading.value = true
  treeNodeForm.value?.validate((valid: boolean) => {
    if (!valid) {
      submitLoading.value = false
      return
    }
    try {
      if (dataType.value === 'number') {
        const raw = String(formData.value.value).trim()
        // 严格十进制（可选负号与小数位）：`parseFloat` 会把 "12abc" 读成 12、把 "0x10" 读成 0，
        // 用户以为存的是自己写的那串，生成配置里却是另一个值
        if (!/^-?\d+(\.\d+)?$/.test(raw)) {
          submitLoading.value = false
          // 原实现直接 return：点「确定」什么都没发生，用户以为按钮坏了
          modal.msgError(t('build.treeNodeDialog.validate.valueMustBeNumber'))
          return
        }
        formData.value.value = Number(raw)
      }
      formData.value.id = id.value++
      emit('commit', formData.value)
      onClose()
    } finally {
      submitLoading.value = false
    }
  })
}
</script>
