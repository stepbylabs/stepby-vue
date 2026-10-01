<template>
  <el-dialog
    v-model="open"
    width="500px"
    :title="t('build.codeTypeDialog.title')"
    @open="onOpen"
    @close="onClose"
    destroy-on-close
  >
    <el-form ref="codeTypeForm" :model="formData" :rules="rules" label-width="100px">
      <el-form-item :label="t('build.codeTypeDialog.type')" prop="type">
        <el-radio-group v-model="formData.type">
          <el-radio-button v-for="item in typeOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <Transition name="expand-fade" appear>
        <el-form-item v-if="showFileName" :label="t('build.codeTypeDialog.fileName')" prop="fileName">
          <el-input
            v-model="formData.fileName"
            :placeholder="t('build.codeTypeDialog.phFileName')"
            :maxlength="100"
            clearable
          />
        </el-form-item>
      </Transition>
    </el-form>

    <template #footer>
      <el-button @click="onClose">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleConfirm">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
const { t } = useI18n()
const open = defineModel()
const props = defineProps({
  showFileName: Boolean
})
const emit = defineEmits(['confirm'])
const formData = ref({
  fileName: undefined,
  type: 'file'
})
// P1 修复: 添加 submitLoading 防止重复提交
const submitLoading = ref(false)
const codeTypeForm = useTemplateRef('codeTypeForm')
const rules = {
  fileName: [
    {
      required: true,
      message: t('build.codeTypeDialog.validate.fileNameRequired'),
      trigger: 'blur'
    }
  ],
  type: [
    {
      required: true,
      message: t('build.codeTypeDialog.validate.typeRequired'),
      trigger: 'change'
    }
  ]
}
const typeOptions = ref([
  {
    label: t('build.codeTypeDialog.typeFile'),
    value: 'file'
  },
  {
    label: t('build.codeTypeDialog.typeDialog'),
    value: 'dialog'
  }
])
function onOpen(): void {
  if (props.showFileName) {
    formData.value.fileName = `${+new Date()}.vue`
  }
}
function onClose(): void {
  open.value = false
}
function handleConfirm(): void {
  submitLoading.value = true
  codeTypeForm.value?.validate((valid: boolean) => {
    if (!valid) {
      submitLoading.value = false
      return
    }
    try {
      emit('confirm', { ...formData.value })
      onClose()
    } finally {
      submitLoading.value = false
    }
  })
}
</script>
