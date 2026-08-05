<template>
  <el-form>
    <el-form-item>
      <el-radio v-model="radioValue" :value="1">
        {{ t('crontab.radio.wildcardDay') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="2">
        {{ t('crontab.radio.unspecified') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="3">
        {{ t('crontab.radio.cycleFrom') }}
        <el-input-number v-model="cycle01" :min="1" :max="30" />
        -
        <el-input-number v-model="cycle02" :min="cycle01 + 1" :max="31" />
        {{ t('crontab.radio.cycleUnitDay') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="4">
        {{ t('crontab.radio.rangeFrom') }}
        <el-input-number v-model="average01" :min="1" :max="30" />
        {{ t('crontab.radio.avgStartDay') }}
        <el-input-number v-model="average02" :min="1" :max="31 - average01" />
        {{ t('crontab.radio.avgExecuteDay') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="5">
        {{ t('crontab.radio.monthlyPrefix') }}
        <el-input-number v-model="workday" :min="1" :max="31" />
        {{ t('crontab.radio.nearestWorkday') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="6">
        {{ t('crontab.radio.lastDayOfMonth') }}
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="7">
        {{ t('crontab.radio.specify') }}
        <el-select
          clearable
          v-model="checkboxList"
          :placeholder="t('crontab.multiSelectPlaceholder')"
          multiple
          :multiple-limit="10"
        >
          <el-option v-for="item in 31" :key="item" :label="item" :value="item" />
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
  isUnspecified,
  isCycle,
  isAverage,
  isWorkday,
  isLastDay,
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
const cycle01 = ref<number>(1)
const cycle02 = ref<number>(2)
const average01 = ref<number>(1)
const average02 = ref<number>(1)
const workday = ref<number>(1)
const checkboxList = ref<number[]>([])
const checkCopy = ref<number[]>([1])
// computed 仅返回计算值，副作用（数值校正）移到 watch（P0-69）
const cycleTotal = computed(() => {
  return cycle01.value + '-' + cycle02.value
})
const averageTotal = computed(() => {
  return average01.value + '/' + average02.value
})
const workdayTotal = computed(() => {
  return workday.value + 'W'
})
const checkboxString = computed(() => {
  return checkboxList.value.join(',')
})
// 同步校正输入数值，避免在 computed 中产生副作用
watch(
  [cycle01, cycle02],
  () => {
    const newCycle01 = props.check(cycle01.value, 1, 30)
    if (newCycle01 !== cycle01.value) cycle01.value = newCycle01
    const newCycle02 = props.check(cycle02.value, cycle01.value + 1, 31)
    if (newCycle02 !== cycle02.value) cycle02.value = newCycle02
  },
  { flush: 'sync' }
)
watch(
  [average01, average02],
  () => {
    const newAverage01 = props.check(average01.value, 1, 30)
    if (newAverage01 !== average01.value) average01.value = newAverage01
    const newAverage02 = props.check(average02.value, 1, 31 - average01.value)
    if (newAverage02 !== average02.value) average02.value = newAverage02
  },
  { flush: 'sync' }
)
watch(
  workday,
  () => {
    const newWorkday = props.check(workday.value, 1, 31)
    if (newWorkday !== workday.value) workday.value = newWorkday
  },
  { flush: 'sync' }
)
watch(
  () => props.cron.day,
  (value: string) => changeRadioValue(value),
  { immediate: true }
)
watch([radioValue, cycleTotal, averageTotal, workdayTotal, checkboxString], () => onRadioChange())
function changeRadioValue(value: string): void {
  if (isWildcard(value)) {
    radioValue.value = 1
  } else if (isUnspecified(value)) {
    radioValue.value = 2
  } else if (isCycle(value)) {
    const [start, end] = parseCycle(value)
    cycle01.value = start
    cycle02.value = end
    radioValue.value = 3
  } else if (isAverage(value)) {
    const [start, step] = parseAverage(value)
    average01.value = start
    average02.value = step
    radioValue.value = 4
  } else if (isWorkday(value)) {
    const indexArr = value.split('W')
    workday.value = Number(indexArr[0])
    radioValue.value = 5
  } else if (isLastDay(value)) {
    radioValue.value = 6
  } else {
    checkboxList.value = parseList(value)
    radioValue.value = 7
  }
}
// 单选按钮值变化时
function onRadioChange(): void {
  if (radioValue.value === 2 && props.cron.week === '?') {
    emit('update', 'week', '*', 'day')
  }
  if (radioValue.value !== 2 && props.cron.week !== '?') {
    emit('update', 'week', '?', 'day')
  }
  switch (radioValue.value) {
    case 1:
      emit('update', 'day', '*', 'day')
      break
    case 2:
      emit('update', 'day', '?', 'day')
      break
    case 3:
      emit('update', 'day', cycleTotal.value, 'day')
      break
    case 4:
      emit('update', 'day', averageTotal.value, 'day')
      break
    case 5:
      emit('update', 'day', workdayTotal.value, 'day')
      break
    case 6:
      emit('update', 'day', 'L', 'day')
      break
    case 7:
      if (checkboxList.value.length === 0) {
        checkboxList.value.push(checkCopy.value[0])
      } else {
        checkCopy.value = checkboxList.value
      }
      emit('update', 'day', checkboxString.value, 'day')
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
  width: 18.8rem;
}
</style>
