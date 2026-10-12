<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <el-form ref="basicInfoForm" :model="info" :rules="rules" label-width="150px">
    <el-row>
      <el-col :span="12">
        <el-form-item :label="t('gen.basicInfo.tableName')" prop="tableName">
          <el-input
            :placeholder="t('gen.basicInfo.phTableName')"
            v-model="info.tableName"
            :maxlength="64"
            show-word-limit
          />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item :label="t('gen.basicInfo.tableComment')" prop="tableComment">
          <el-input
            :placeholder="t('common.form.inputPlaceholder')"
            v-model="info.tableComment"
            :maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item :label="t('gen.basicInfo.className')" prop="className">
          <el-input
            :placeholder="t('common.form.inputPlaceholder')"
            v-model="info.className"
            :maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item :label="t('gen.basicInfo.functionAuthor')" prop="functionAuthor">
          <el-input
            :placeholder="t('common.form.inputPlaceholder')"
            v-model="info.functionAuthor"
            :maxlength="50"
            show-word-limit
          />
        </el-form-item>
      </el-col>
      <el-col :span="24">
        <el-form-item :label="t('common.column.remark')" prop="remark">
          <el-input type="textarea" :rows="3" v-model="info.remark" :maxlength="500" show-word-limit></el-input>
        </el-form-item>
      </el-col>
    </el-row>
  </el-form>
</template>

<script setup lang="ts">
const { t } = useI18n()
defineProps({
  info: {
    type: Object,
    default: null
  }
})

// FE-003：通过 useTemplateRef + defineExpose 暴露表单 ref，替代父组件 .$refs 访问
const basicInfoFormRef = useTemplateRef('basicInfoForm')

// 表单校验
const rules = ref({
  tableName: [{ required: true, message: t('gen.basicInfo.validate.tableNameRequired'), trigger: 'blur' }],
  tableComment: [{ required: true, message: t('gen.basicInfo.validate.tableCommentRequired'), trigger: 'blur' }],
  className: [{ required: true, message: t('gen.basicInfo.validate.classNameRequired'), trigger: 'blur' }],
  functionAuthor: [{ required: true, message: t('gen.basicInfo.validate.functionAuthorRequired'), trigger: 'blur' }]
})

defineExpose({ basicInfoFormRef })
</script>
