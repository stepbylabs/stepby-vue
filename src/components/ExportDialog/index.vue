<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="min(90%, 480px)"
    append-to-body
    :close-on-click-modal="false"
    @close="handleClose"
    destroy-on-close
  >
    <el-form label-width="80px" label-position="left">
      <el-form-item :label="t('exportDialog.range')">
        <el-radio-group v-model="exportRange" @change="handleRangeChange">
          <el-radio-button value="all">{{ t('exportDialog.allFields') }}</el-radio-button>
          <el-radio-button value="selected">{{ t('exportDialog.selectedFields') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <Transition name="expand-fade">
        <div v-if="exportRange === 'selected'">
          <el-form-item :label="t('exportDialog.selectField')">
            <el-checkbox-group v-model="selectedFields">
              <el-checkbox v-for="col in columns" :key="col.field" :value="col.field" class="w-[140px] mb-2">
                {{ col.label }}
              </el-checkbox>
            </el-checkbox-group>
            <div class="mt-2">
              <el-button link type="primary" size="small" @click="selectAll">
                {{ t('exportDialog.selectAll') }}
              </el-button>
              <el-button link type="info" size="small" @click="selectNone">{{ t('exportDialog.clear') }}</el-button>
            </div>
          </el-form-item>
          <el-form-item>
            <el-alert
              :title="t('exportDialog.selectedCount', { selected: selectedFields.length, total: columns.length })"
              type="info"
              :closable="false"
              show-icon
            />
          </el-form-item>
        </div>
      </Transition>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('exportDialog.cancel') }}</el-button>
      <el-button type="primary" :loading="exporting" @click="handleConfirm">
        {{ t('exportDialog.confirmExport') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { errorHub } from '@/utils/errorHub'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** 字段定义 */
export interface ExportField {
  /** 字段标识（传给后端的字段名，这里使用表头名称） */
  field: string
  /** 字段显示名称（表头） */
  label: string
}

interface Props {
  modelValue: boolean
  /** 字段列表 */
  columns: ExportField[]
  /** 对话框标题 */
  title?: string
}

interface Emits {
  (e: 'update:modelValue', v: boolean): void
  (e: 'export', fields: string[] | null): void
}

const props = withDefaults(defineProps<Props>(), {
  title: ''
})
const emit = defineEmits<Emits>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const exportRange = ref<'all' | 'selected'>('all')
const selectedFields = ref<string[]>([])
const exporting = ref(false)

watch(visible, (v: boolean) => {
  if (v) {
    exportRange.value = 'all'
    selectedFields.value = props.columns.map((c: ExportField) => c.field)
    exporting.value = false
  }
})

function handleRangeChange(val: 'all' | 'selected') {
  if (val === 'all') {
    selectedFields.value = props.columns.map((c: ExportField) => c.field)
  }
}

function selectAll() {
  selectedFields.value = props.columns.map((c: ExportField) => c.field)
}

function selectNone() {
  selectedFields.value = []
}

function handleConfirm() {
  if (exportRange.value === 'selected' && selectedFields.value.length === 0) {
    errorHub.report('warning', 'other', t('exportDialog.pleaseSelectField'))
    return
  }
  exporting.value = true
  // 调用方负责实际下载，下载完成后通过 v-model 控制关闭对话框
  // 不再使用硬编码 timeout，避免与调用方 loading 状态竞争
  const fields = exportRange.value === 'all' ? null : [...selectedFields.value]
  emit('export', fields)
}

function handleClose() {
  exporting.value = false
  selectedFields.value = []
  exportRange.value = 'all'
}
</script>
