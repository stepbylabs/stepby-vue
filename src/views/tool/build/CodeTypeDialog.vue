<template>
  <el-dialog
    :close-on-click-modal="false"
    :before-close="beforeClose"
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
            :aria-label="t('build.codeTypeDialog.phFileName')"
          />
        </el-form-item>
      </Transition>
    </el-form>

    <template #footer>
      <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleConfirm">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
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
/** 关闭语义（b135）：配置项填一半按 Esc / 点遮罩原先会静默丢弃 */
const { beforeClose, cancel, snapshot } = useDialogDirtyGuard(open, formData)
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
  // 每次开窗都把「代码形态」复位到默认的整页文件：上次选了「弹窗(dialog)」后，
  // 下一次点「复制代码 / 下载文件」仍会按 dialog 生成——用户拿到的产物与本次意图不符，
  // 而对话框里只有一个小单选提示，极易漏看（b136 实测）
  formData.value = { fileName: undefined, type: 'file' }
  if (props.showFileName) {
    formData.value.fileName = `${+new Date()}.vue`
  }
  // 自动填的文件名 / 复位都发生在开窗基准之后，不重拍就会「一开窗即判脏」：Esc 变成弹确认
  snapshot()
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
