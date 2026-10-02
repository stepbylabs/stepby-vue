<template>
  <el-form label-width="90px" label-position="top">
    <el-form-item :label="t('build.rightPanel.label.formRef')">
      <el-input v-model="formConf.formRef" :placeholder="t('build.rightPanel.ph.formRef')" :maxlength="50" />
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formModel')">
      <el-input v-model="formConf.formModel" :placeholder="t('build.rightPanel.ph.formModel')" />
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formRules')">
      <el-input v-model="formConf.formRules" :placeholder="t('build.rightPanel.ph.formRules')" />
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formSize')">
      <el-radio-group v-model="formConf.size">
        <el-radio-button value="large">
          {{ t('build.rightPanel.radio.sizeLarge') }}
        </el-radio-button>
        <el-radio-button value="default">
          {{ t('build.rightPanel.radio.sizeDefault') }}
        </el-radio-button>
        <el-radio-button value="small">
          {{ t('build.rightPanel.radio.sizeSmall') }}
        </el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.labelPosition')">
      <el-radio-group v-model="formConf.labelPosition">
        <el-radio-button value="left">
          {{ t('build.rightPanel.radio.labelLeft') }}
        </el-radio-button>
        <el-radio-button value="right">
          {{ t('build.rightPanel.radio.labelRight') }}
        </el-radio-button>
        <el-radio-button value="top">
          {{ t('build.rightPanel.radio.labelTop') }}
        </el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formLabelWidth')">
      <el-input-number v-model="formConf.labelWidth" :placeholder="t('build.rightPanel.ph.formLabelWidth')" />
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formGutter')">
      <el-input-number v-model="formConf.gutter" :min="0" :placeholder="t('build.rightPanel.ph.formGutter')" />
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formDisabled')">
      <el-switch v-model="formConf.disabled" />
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formBtns')">
      <el-switch v-model="formConf.formBtns" />
    </el-form-item>
    <el-form-item :label="t('build.rightPanel.label.formUnFocusedBorder')">
      <el-switch v-model="formConf.unFocusedComponentBorder" />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
// 表单构建器右侧面板：表单属性 tab（仅依赖 formConf，字段结构由用户配置动态决定）
const props = defineProps<{
  formConf: any
}>()

const { t } = useI18n()

const formConf = computed(() => props.formConf)
</script>
