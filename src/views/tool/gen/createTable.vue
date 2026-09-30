<template>
  <!-- 创建表（结构化表单，方案 A：消除 SQL 注入） -->
  <el-dialog
    :title="t('gen.createTable.title')"
    v-model="visible"
    width="1100px"
    top="3vh"
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-row :gutter="20">
        <el-col :span="8">
          <el-form-item :label="t('gen.createTable.tableName')" prop="tableName">
            <el-input
              v-model="form.tableName"
              :placeholder="t('gen.createTable.phTableName')"
              maxlength="64"
              show-word-limit
            />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item :label="t('gen.createTable.tableComment')" prop="tableComment">
            <el-input
              v-model="form.tableComment"
              :placeholder="t('gen.createTable.phTableComment')"
              maxlength="200"
              show-word-limit
            />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item :label="t('gen.createTable.importToGen')">
            <el-switch
              v-model="form.importToGen"
              :active-text="t('gen.createTable.importToGenAuto')"
              :inactive-text="t('gen.createTable.importToGenOnly')"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider content-position="left">
        <span class="font-semibold">{{ t('gen.createTable.fieldDef') }}</span>
        <el-button type="primary" link icon="Plus" class="ml-[12px]" @click="handleAddColumn">
          {{ t('gen.createTable.addField') }}
        </el-button>
      </el-divider>

      <el-table :data="form.columns" border class="w-full" max-height="420">
        <el-table-column :label="t('common.column.sort')" type="index" width="55" align="center" />
        <el-table-column :label="t('gen.createTable.column.columnName')" width="160" align="center">
          <template #default="scope">
            <el-input
              v-model="scope.row.columnName"
              :placeholder="t('gen.createTable.column.phColumnName')"
              maxlength="64"
              size="small"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.type')" width="140" align="center">
          <template #default="scope">
            <el-select
              v-model="scope.row.dataType"
              :placeholder="t('gen.createTable.column.phDataType')"
              size="small"
              @change="handleTypeChange(scope.row)"
            >
              <el-option-group :label="t('gen.createTable.typeGroup.string')">
                <el-option label="VARCHAR" value="varchar" />
                <el-option label="CHAR" value="char" />
                <el-option label="TEXT" value="text" />
                <el-option label="LONGTEXT" value="longText" />
              </el-option-group>
              <el-option-group :label="t('gen.createTable.typeGroup.integer')">
                <el-option label="TINYINT" value="tinyint" />
                <el-option label="SMALLINT" value="smallint" />
                <el-option label="INT" value="int" />
                <el-option label="BIGINT" value="bigint" />
              </el-option-group>
              <el-option-group :label="t('gen.createTable.typeGroup.decimal')">
                <el-option label="DECIMAL" value="decimal" />
                <el-option label="DOUBLE" value="double" />
              </el-option-group>
              <el-option-group :label="t('gen.createTable.typeGroup.datetime')">
                <el-option label="DATE" value="date" />
                <el-option label="DATETIME" value="datetime" />
                <el-option label="TIMESTAMP" value="timestamp" />
              </el-option-group>
              <el-option-group :label="t('gen.createTable.typeGroup.other')">
                <el-option label="BOOLEAN" value="boolean" />
              </el-option-group>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.length')" width="90" align="center">
          <template #default="scope">
            <Transition name="fade" mode="out-in">
              <el-input-number
                v-if="needsLength(scope.row.dataType)"
                key="input"
                v-model="scope.row.length"
                :min="1"
                :max="65535"
                size="small"
                controls-position="right"
                class="w-[80px]"
              />
              <span v-else key="dash" class="text-text-placeholder">-</span>
            </Transition>
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.precision')" width="90" align="center">
          <template #default="scope">
            <Transition name="fade" mode="out-in">
              <el-input-number
                v-if="scope.row.dataType === 'decimal'"
                key="input"
                v-model="scope.row.precision"
                :min="0"
                :max="30"
                size="small"
                controls-position="right"
                class="w-[80px]"
              />
              <span v-else key="dash" class="text-text-placeholder">-</span>
            </Transition>
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.isPrimaryKey')" width="60" align="center">
          <template #default="scope">
            <el-checkbox v-model="scope.row.isPrimaryKey" @change="handlePrimaryKeyChange(scope.row)" />
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.isAutoIncrement')" width="60" align="center">
          <template #default="scope">
            <el-checkbox
              v-model="scope.row.isAutoIncrement"
              :disabled="!canAutoIncrement(scope.row)"
              @change="handleAutoIncrementChange(scope.row)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.isNotNull')" width="60" align="center">
          <template #default="scope">
            <el-checkbox v-model="scope.row.isNotNull" :disabled="scope.row.isPrimaryKey" />
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.isUnique')" width="60" align="center">
          <template #default="scope">
            <el-checkbox v-model="scope.row.isUnique" :disabled="scope.row.isPrimaryKey" />
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.defaultValue')" width="120" align="center">
          <template #default="scope">
            <el-input
              v-model="scope.row.defaultValue"
              :placeholder="t('gen.createTable.column.phDefaultValue')"
              size="small"
              maxlength="100"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('gen.createTable.column.columnComment')" min-width="140" align="center">
          <template #default="scope">
            <el-input
              v-model="scope.row.columnComment"
              :placeholder="t('gen.createTable.column.phColumnComment')"
              size="small"
              maxlength="200"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" width="80" align="center" fixed="right">
          <template #default="scope">
            <el-button
              type="danger"
              link
              icon="Delete"
              :disabled="form.columns.length <= 1"
              @click="handleRemoveColumn(scope.$index)"
            />
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="t('common.empty')" />
        </template>
      </el-table>

      <div class="mt-[16px]">
        <el-alert :title="t('common.tip')" type="info" :closable="false" show-icon>
          <template #default>
            {{ t('gen.createTable.tip') }}
          </template>
        </el-alert>
      </div>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ t('common.confirm') }}</el-button>
        <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="CreateTable">
const { t } = useI18n()
import { createTable, type CreateTableDto, type CreateTableColumnDto, type ColumnDataType } from '@/api/tool/gen'
import modal from '@/plugins/modal'

interface CreateTableForm {
  tableName: string
  tableComment: string
  importToGen: boolean
  columns: CreateTableColumnDto[]
}

const visible = ref<boolean>(false)
const submitting = ref<boolean>(false)
const formRef = useTemplateRef('formRef')

const form = ref<CreateTableForm>({
  tableName: '',
  tableComment: '',
  importToGen: true,
  columns: []
})

const rules = {
  tableName: [
    { required: true, message: t('gen.createTable.validate.tableNameRequired'), trigger: 'blur' },
    {
      pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/,
      message: t('gen.createTable.validate.tableNamePattern'),
      trigger: 'blur'
    }
  ]
}

// 需要长度参数的类型
function needsLength(dataType: ColumnDataType): boolean {
  return dataType === 'varchar' || dataType === 'char' || dataType === 'decimal'
}

// 可自增的类型（仅整数类型）
function canAutoIncrement(row: CreateTableColumnDto): boolean {
  return row.dataType === 'int' || row.dataType === 'bigint'
}

// 类型变更时重置相关字段
function handleTypeChange(row: CreateTableColumnDto): void {
  if (!needsLength(row.dataType)) {
    row.length = undefined
  } else if (row.length === undefined) {
    row.length = row.dataType === 'varchar' ? 255 : row.dataType === 'char' ? 1 : 10
  }
  if (row.dataType !== 'decimal') {
    row.precision = undefined
  } else if (row.precision === undefined) {
    row.precision = 0
  }
  // 自增类型不匹配时取消勾选
  if (row.isAutoIncrement && !canAutoIncrement(row)) {
    row.isAutoIncrement = false
  }
}

// 主键变更联动
function handlePrimaryKeyChange(row: CreateTableColumnDto): void {
  if (row.isPrimaryKey) {
    row.isNotNull = true
    row.isUnique = false
  } else {
    row.isAutoIncrement = false
  }
}

// 自增变更联动
function handleAutoIncrementChange(row: CreateTableColumnDto): void {
  if (row.isAutoIncrement) {
    row.isPrimaryKey = true
    row.isNotNull = true
  }
}

// 新增字段（默认值）
function handleAddColumn(): void {
  form.value.columns.push({
    columnName: '',
    dataType: 'varchar',
    length: 255,
    precision: undefined,
    isPrimaryKey: false,
    isAutoIncrement: false,
    isNotNull: false,
    isUnique: false,
    defaultValue: '',
    columnComment: ''
  })
}

// 移除字段
function handleRemoveColumn(index: number): void {
  form.value.columns.splice(index, 1)
}

// 初始化默认列（id 主键自增 + create_by/update_by/create_time/update_time/remark）
function initDefaultColumns(): void {
  form.value.columns = [
    {
      columnName: 'id',
      dataType: 'bigint',
      length: undefined,
      precision: undefined,
      isPrimaryKey: true,
      isAutoIncrement: true,
      isNotNull: true,
      isUnique: false,
      defaultValue: '',
      columnComment: t('gen.createTable.defaultColumn.id')
    },
    {
      columnName: 'create_by',
      dataType: 'varchar',
      length: 64,
      precision: undefined,
      isPrimaryKey: false,
      isAutoIncrement: false,
      isNotNull: false,
      isUnique: false,
      defaultValue: '',
      columnComment: t('gen.createTable.defaultColumn.createBy')
    },
    {
      columnName: 'create_time',
      dataType: 'datetime',
      length: undefined,
      precision: undefined,
      isPrimaryKey: false,
      isAutoIncrement: false,
      isNotNull: false,
      isUnique: false,
      defaultValue: '',
      columnComment: t('gen.createTable.defaultColumn.createTime')
    },
    {
      columnName: 'update_by',
      dataType: 'varchar',
      length: 64,
      precision: undefined,
      isPrimaryKey: false,
      isAutoIncrement: false,
      isNotNull: false,
      isUnique: false,
      defaultValue: '',
      columnComment: t('gen.createTable.defaultColumn.updateBy')
    },
    {
      columnName: 'update_time',
      dataType: 'datetime',
      length: undefined,
      precision: undefined,
      isPrimaryKey: false,
      isAutoIncrement: false,
      isNotNull: false,
      isUnique: false,
      defaultValue: '',
      columnComment: t('gen.createTable.defaultColumn.updateTime')
    },
    {
      columnName: 'remark',
      dataType: 'varchar',
      length: 500,
      precision: undefined,
      isPrimaryKey: false,
      isAutoIncrement: false,
      isNotNull: false,
      isUnique: false,
      defaultValue: '',
      columnComment: t('gen.createTable.defaultColumn.remark')
    }
  ]
}

// 显示弹框
function show(): void {
  visible.value = true
  form.value = {
    tableName: '',
    tableComment: '',
    importToGen: true,
    columns: []
  }
  initDefaultColumns()
}

// 提交建表
async function handleSubmit(): Promise<void> {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    modal.msgError(t('gen.createTable.validate.formError'))
    return
  }

  // 校验列定义
  if (form.value.columns.length === 0) {
    modal.msgError(t('gen.createTable.validate.columnRequired'))
    return
  }

  const columnNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/
  const seenNames = new Set<string>()
  let hasPk = false

  for (const col of form.value.columns) {
    if (!col.columnName) {
      modal.msgError(t('gen.createTable.validate.columnNameRequired'))
      return
    }
    if (!columnNamePattern.test(col.columnName)) {
      modal.msgError(t('gen.createTable.validate.columnNameInvalid', { name: col.columnName }))
      return
    }
    if (seenNames.has(col.columnName)) {
      modal.msgError(t('gen.createTable.validate.columnNameDuplicate', { name: col.columnName }))
      return
    }
    seenNames.add(col.columnName)

    if (needsLength(col.dataType) && !col.length) {
      modal.msgError(t('gen.createTable.validate.lengthRequired', { name: col.columnName }))
      return
    }
    if (col.dataType === 'decimal' && col.precision === undefined) {
      modal.msgError(t('gen.createTable.validate.precisionRequired', { name: col.columnName }))
      return
    }
    if (col.dataType === 'decimal' && col.length && col.precision && col.precision >= col.length) {
      modal.msgError(t('gen.createTable.validate.precisionRange', { name: col.columnName }))
      return
    }
    if (col.isAutoIncrement && !canAutoIncrement(col)) {
      modal.msgError(t('gen.createTable.validate.autoIncrementType', { name: col.columnName }))
      return
    }
    if (col.isAutoIncrement && !col.isPrimaryKey) {
      modal.msgError(t('gen.createTable.validate.autoIncrementPk', { name: col.columnName }))
      return
    }
    if (col.isPrimaryKey) {
      hasPk = true
    }

    // 数值类型默认值校验
    if (col.defaultValue != null && col.defaultValue !== '') {
      const numericTypes: ColumnDataType[] = ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'double']
      if (numericTypes.includes(col.dataType) && isNaN(Number(col.defaultValue))) {
        modal.msgError(
          t('gen.createTable.validate.defaultValueNumeric', { name: col.columnName, value: col.defaultValue })
        )
        return
      }
      if (col.dataType === 'boolean' && !['true', 'false', '0', '1'].includes(col.defaultValue.toLowerCase())) {
        modal.msgError(t('gen.createTable.validate.defaultValueBoolean', { name: col.columnName }))
        return
      }
    }
  }

  if (!hasPk) {
    try {
      await modal.confirm(t('gen.createTable.validate.noPrimaryKey'))
    } catch {
      return // 用户取消，直接退出
    }
  }

  // 构造提交数据（清理空值）
  const submitData: CreateTableDto = {
    tableName: form.value.tableName,
    tableComment: form.value.tableComment || undefined,
    importToGen: form.value.importToGen,
    columns: form.value.columns.map((col: CreateTableColumnDto) => ({
      columnName: col.columnName,
      dataType: col.dataType,
      length: col.length,
      precision: col.precision,
      isPrimaryKey: col.isPrimaryKey,
      isAutoIncrement: col.isAutoIncrement,
      isNotNull: col.isNotNull,
      isUnique: col.isUnique,
      defaultValue: col.defaultValue || undefined,
      columnComment: col.columnComment || undefined
    }))
  }

  submitting.value = true
  try {
    const res = await createTable(submitData)
    if (res.code === 200) {
      modal.msgSuccess(
        t('gen.createTable.msg.createSuccess', {
          name: submitData.tableName,
          imported: res.data?.importedToGen ? t('gen.createTable.msg.createSuccessImported') : ''
        })
      )
      visible.value = false
      emit('ok')
    } else {
      modal.msgError(res.msg || t('gen.createTable.msg.createFail'))
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    modal.msgError(message || t('gen.createTable.msg.createFail'))
  } finally {
    submitting.value = false
  }
}

const emit = defineEmits(['ok'])

defineExpose({
  show
})
</script>
