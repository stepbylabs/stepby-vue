<template>
  <div
    class="editable-cell inline-flex items-center gap-1 cursor-pointer min-h-[24px] py-0.5 px-1 rounded-[3px] w-full"
    @dblclick="startEdit"
  >
    <Transition name="fade" mode="out-in">
      <!-- 编辑状态 -->
      <div v-if="editing" key="edit" class="flex-1 min-w-0">
        <el-input
          v-if="type === 'text'"
          v-model="localValue"
          :maxlength="maxlength"
          size="small"
          ref="inputRef"
          @blur="commit"
          @keyup.enter="commit"
          @keyup.esc="cancel"
        />
        <el-input-number
          v-else-if="type === 'number'"
          v-model="localValue"
          size="small"
          :min="min"
          :max="max"
          :step="step"
          ref="inputRef"
          @blur="commit"
          @keyup.enter="commit"
          @keyup.esc="cancel"
        />
        <el-select
          v-else-if="type === 'select'"
          v-model="localValue"
          size="small"
          ref="inputRef"
          :filterable="filterable"
          @blur="commit"
          @change="commit"
        >
          <el-option v-for="opt in options" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-date-picker
          v-else-if="type === 'date'"
          v-model="localValue"
          size="small"
          type="date"
          value-format="YYYY-MM-DD"
          ref="inputRef"
          @blur="commit"
          @change="commit"
        />
        <el-switch
          v-else-if="type === 'switch'"
          v-model="localValue"
          :active-value="activeValue"
          :inactive-value="inactiveValue"
          @change="commit"
        />
      </div>
      <!-- 显示状态 -->
      <div v-else key="view" class="flex items-center gap-1 flex-1 min-w-0">
        <span class="cell-display flex-1 min-w-0 truncate" :class="{ 'cell-empty': isEmpty }">
          {{ displayText }}
        </span>
        <el-icon v-if="!readonly" class="cell-edit-icon text-xs text-text-secondary opacity-0 shrink-0">
          <Edit />
        </el-icon>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts" generic="TValue">
// EditableCell 是可复用行内编辑组件，通过泛型 TValue 由调用方决定值类型，
// 避免内部使用 any 导致类型信息丢失；value/activeValue 等默认宽松约束为 unknown。
import { ref, computed, watch, nextTick } from 'vue'
import { Edit } from '@element-plus/icons-vue'
import modal from '@/plugins/modal'

const { t } = useI18n()

interface Option {
  label: string
  value: unknown
}

const props = withDefaults(
  defineProps<{
    modelValue: TValue
    type?: 'text' | 'number' | 'select' | 'date' | 'switch'
    readonly?: boolean
    options?: Option[]
    filterable?: boolean
    min?: number
    max?: number
    step?: number
    /** 文本输入最大长度（默认 100；后端无上限的字段应由调用方显式放宽，避免静默截断致数据损坏） */
    maxlength?: number
    activeValue?: TValue
    inactiveValue?: TValue
    /** 显示值格式化函数 */
    formatter?: (val: TValue) => string
    /** 提交前校验函数，返回 string(错误信息) 或 true(通过) */
    validate?: (val: TValue) => string | true
  }>(),
  {
    type: 'text',
    readonly: false,
    options: () => [],
    filterable: false,
    maxlength: 100,
    activeValue: true as TValue,
    inactiveValue: false as TValue
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: TValue): void
  (e: 'commit', newVal: TValue, oldVal: TValue): void
}>()

const editing = ref(false)
const localValue = ref<TValue>(props.modelValue)
const inputRef = ref<{ focus?: () => void } | null>(null)

watch(
  () => props.modelValue,
  (v: TValue) => {
    if (!editing.value) localValue.value = v
  }
)

const isEmpty = computed(() => {
  return localValue.value === null || localValue.value === undefined || localValue.value === ''
})

const displayText = computed(() => {
  const val = props.modelValue
  if (props.formatter) return props.formatter(val)
  if (isEmpty.value) return t('editableCell.empty')
  if (props.type === 'select' && props.options.length > 0) {
    const opt = props.options.find((o: Option) => o.value === val)
    return opt ? opt.label : String(val)
  }
  if (props.type === 'switch') {
    return val === props.activeValue ? t('common.yes') : t('common.no')
  }
  return String(val)
})

async function startEdit() {
  if (props.readonly || editing.value) return
  editing.value = true
  localValue.value = props.modelValue
  await nextTick()
  // 让子组件获取焦点
  inputRef.value?.focus?.()
}

async function commit() {
  if (!editing.value) return
  const oldVal = props.modelValue
  const newVal = localValue.value
  // 校验
  if (props.validate) {
    const result = props.validate(newVal)
    if (result !== true) {
      modal.msgError(result || t('editableCell.validateFailed'))
      // 校验失败时恢复 localValue，避免下次进入编辑显示非法值
      localValue.value = props.modelValue
      editing.value = false
      return
    }
  }
  // 值未变化
  if (newVal === oldVal) {
    editing.value = false
    return
  }
  emit('update:modelValue', newVal)
  emit('commit', newVal, oldVal)
  editing.value = false
}

function cancel() {
  editing.value = false
  localValue.value = props.modelValue
}

// 暴露方法
defineExpose({
  startEdit,
  cancel
})
</script>

<style lang="scss" scoped>
.editable-cell {
  transition: background 0.15s;

  &:hover {
    background: var(--el-fill-color-light, #f5f7fa);

    .cell-edit-icon {
      opacity: 1;
    }
  }
}

.cell-display {
  &.cell-empty {
    color: var(--el-text-color-placeholder, #c0c4cc);
    font-style: italic;
  }
}

.cell-edit-icon {
  transition: opacity 0.15s;
}

.editable-cell :deep(.el-input),
.editable-cell :deep(.el-input-number),
.editable-cell :deep(.el-select),
.editable-cell :deep(.el-date-editor) {
  width: 100%;
}
</style>
