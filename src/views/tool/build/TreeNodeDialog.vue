<template>
  <div>
    <el-dialog
      :title="t('build.treeNodeDialog.title')"
      v-model="open"
      width="800px"
      :close-on-click-modal="false"
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
            >
              <template #append>
                <el-select v-model="dataType" :style="{ width: '100px' }">
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
          <el-button @click="onClose">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
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
        // P2 修复: parseFloat 对非法字符串返回 NaN，需校验
        const parsed = parseFloat(String(formData.value.value))
        if (Number.isNaN(parsed)) {
          submitLoading.value = false
          return
        }
        formData.value.value = parsed
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
