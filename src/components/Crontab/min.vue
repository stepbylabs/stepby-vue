<template>
  <el-form>
    <el-form-item>
      <el-radio v-model="radioValue" :value="1">
        {{ t('crontab.radio.wildcardMin') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="2">
        {{ t('crontab.radio.cycleFrom') }}
        <el-input-number v-model="cycle01" :min="0" :max="58" />
        -
        <el-input-number v-model="cycle02" :min="cycle01 + 1" :max="59" />
        {{ t('crontab.radio.cycleUnitMin') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="3">
        {{ t('crontab.radio.rangeFrom') }}
        <el-input-number v-model="average01" :min="0" :max="58" />
        {{ t('crontab.radio.avgStartMin') }}
        <el-input-number v-model="average02" :min="1" :max="59 - average01" />
        {{ t('crontab.radio.avgExecuteMin') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="4">
        {{ t('crontab.radio.specify') }}
        <el-select
          clearable
          v-model="checkboxList"
          :placeholder="t('crontab.multiSelectPlaceholder')"
          multiple
          :multiple-limit="10"
        >
          <el-option v-for="item in 60" :key="item" :label="item - 1" :value="item - 1" />
        </el-select>
      </el-radio>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { CronValue, CronFieldName, CronCheckFn } from '@/types/cron'
import {
  isWildcard,
  isCycle,
  isAverage,
  parseCycle,
  parseAverage,
  parseList,
  DEFAULT_CRON_VALUE
} from '@/composables/useCron'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'update', name: CronFieldName, value: string, from: string): void
}>()
const props = defineProps({
  cron: {
    type: Object as PropType<CronValue>,
    default: () => ({ ...DEFAULT_CRON_VALUE })
  },
  check: {
    type: Function as PropType<CronCheckFn>,
    default: () => () => 0
  }
})
const radioValue = ref<number>(1)
const cycle01 = ref<number>(0)
const cycle02 = ref<number>(1)
const average01 = ref<number>(0)
const average02 = ref<number>(1)
const checkboxList = ref<number[]>([])
const checkCopy = ref<number[]>([0])
// computed 仅返回计算值，副作用（数值校正）移到 watch（P0-69）
const cycleTotal = computed(() => {
  return cycle01.value + '-' + cycle02.value
})
const averageTotal = computed(() => {
  return average01.value + '/' + average02.value
})
const checkboxString = computed(() => {
  return checkboxList.value.join(',')
})
watch(
  [cycle01, cycle02],
  () => {
    const newCycle01 = props.check(cycle01.value, 0, 58)
    if (newCycle01 !== cycle01.value) cycle01.value = newCycle01
    const newCycle02 = props.check(cycle02.value, cycle01.value + 1, 59)
    if (newCycle02 !== cycle02.value) cycle02.value = newCycle02
  },
  { flush: 'sync' }
)
watch(
  [average01, average02],
  () => {
    const newAverage01 = props.check(average01.value, 0, 58)
    if (newAverage01 !== average01.value) average01.value = newAverage01
    const newAverage02 = props.check(average02.value, 1, 59 - average01.value)
    if (newAverage02 !== average02.value) average02.value = newAverage02
  },
  { flush: 'sync' }
)
watch(
  () => props.cron.min,
  (value: string) => changeRadioValue(value),
  { immediate: true }
)
watch([radioValue, cycleTotal, averageTotal, checkboxString], () => onRadioChange())
function changeRadioValue(value: string): void {
  if (isWildcard(value)) {
    radioValue.value = 1
  } else if (isCycle(value)) {
    const [start, end] = parseCycle(value)
    cycle01.value = start
    cycle02.value = end
    radioValue.value = 2
  } else if (isAverage(value)) {
    const [start, step] = parseAverage(value)
    average01.value = start
    average02.value = step
    radioValue.value = 3
  } else {
    checkboxList.value = parseList(value)
    radioValue.value = 4
  }
}
function onRadioChange(): void {
  switch (radioValue.value) {
    case 1:
      emit('update', 'min', '*', 'min')
      break
    case 2:
      emit('update', 'min', cycleTotal.value, 'min')
      break
    case 3:
      emit('update', 'min', averageTotal.value, 'min')
      break
    case 4:
      if (checkboxList.value.length === 0) {
        checkboxList.value.push(checkCopy.value[0])
      } else {
        checkCopy.value = checkboxList.value
      }
      emit('update', 'min', checkboxString.value, 'min')
      break
  }
}
</script>

<style lang="scss" scoped>
.el-input-number--small,
.el-select,
.el-select--small {
  margin: 0 0.2rem;
}
.el-select,
.el-select--small {
  width: 19.8rem;
}
</style>
