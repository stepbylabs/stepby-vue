<template>
  <el-form>
    <el-form-item>
      <el-radio v-model="radioValue" :value="1">
        {{ t('crontab.radio.wildcardWeek') }}
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
        <el-select clearable v-model="cycle01">
          <el-option
            v-for="item of weekList"
            :key="item.key"
            :label="item.value"
            :value="item.key"
            :disabled="item.key === 7"
          >
            {{ item.value }}
          </el-option>
        </el-select>
        -
        <el-select clearable v-model="cycle02">
          <el-option
            v-for="item of weekList"
            :key="item.key"
            :label="item.value"
            :value="item.key"
            :disabled="item.key <= cycle01"
          >
            {{ item.value }}
          </el-option>
        </el-select>
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="4">
        {{ t('crontab.radio.nthWeekPrefix') }}
        <el-input-number v-model="average01" :min="1" :max="4" />
        {{ t('crontab.radio.nthWeekSuffix') }}
        <el-select clearable v-model="average02">
          <el-option v-for="item in weekList" :key="item.key" :label="item.value" :value="item.key" />
        </el-select>
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="5">
        {{ t('crontab.radio.lastWeekOfMonth') }}
        <el-select clearable v-model="weekday">
          <el-option v-for="item in weekList" :key="item.key" :label="item.value" :value="item.key" />
        </el-select>
      </el-radio>
    </el-form-item>

    <el-form-item>
      <el-radio v-model="radioValue" :value="6">
        {{ t('crontab.radio.specify') }}
        <el-select
          class="multiselect"
          clearable
          v-model="checkboxList"
          :placeholder="t('crontab.multiSelectPlaceholder')"
          multiple
          :multiple-limit="6"
        >
          <el-option v-for="item in weekList" :key="item.key" :label="item.value" :value="item.key" />
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
  isWeekHash,
  isLastWeek,
  parseCycle,
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
const radioValue = ref<number>(2)
const cycle01 = ref<number>(2)
const cycle02 = ref<number>(3)
const average01 = ref<number>(1)
const average02 = ref<number>(2)
const weekday = ref<number>(2)
const checkboxList = ref<number[]>([])
const checkCopy = ref<number[]>([2])
const weekList = computed<{ key: number; value: string }[]>(() => [
  { key: 1, value: t('crontab.weeks.sunday') },
  { key: 2, value: t('crontab.weeks.monday') },
  { key: 3, value: t('crontab.weeks.tuesday') },
  { key: 4, value: t('crontab.weeks.wednesday') },
  { key: 5, value: t('crontab.weeks.thursday') },
  { key: 6, value: t('crontab.weeks.friday') },
  { key: 7, value: t('crontab.weeks.saturday') }
])
// computed 仅返回计算值，副作用（数值校正）移到 watch（P0-69）
const cycleTotal = computed(() => {
  return cycle01.value + '-' + cycle02.value
})
const averageTotal = computed(() => {
  return average02.value + '#' + average01.value
})
const weekdayTotal = computed(() => {
  return weekday.value + 'L'
})
const checkboxString = computed(() => {
  return checkboxList.value.join(',')
})
watch(
  [cycle01, cycle02],
  () => {
    const newCycle01 = props.check(cycle01.value, 1, 6)
    if (newCycle01 !== cycle01.value) cycle01.value = newCycle01
    const newCycle02 = props.check(cycle02.value, cycle01.value + 1, 7)
    if (newCycle02 !== cycle02.value) cycle02.value = newCycle02
  },
  { flush: 'sync' }
)
watch(
  [average01, average02],
  () => {
    const newAverage01 = props.check(average01.value, 1, 4)
    if (newAverage01 !== average01.value) average01.value = newAverage01
    const newAverage02 = props.check(average02.value, 1, 7)
    if (newAverage02 !== average02.value) average02.value = newAverage02
  },
  { flush: 'sync' }
)
watch(
  weekday,
  () => {
    const newWeekday = props.check(weekday.value, 1, 7)
    if (newWeekday !== weekday.value) weekday.value = newWeekday
  },
  { flush: 'sync' }
)
watch(
  () => props.cron.week,
  (value: string) => changeRadioValue(value),
  { immediate: true }
)
watch([radioValue, cycleTotal, averageTotal, weekdayTotal, checkboxString], () => onRadioChange())
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
  } else if (isWeekHash(value)) {
    const indexArr = value.split('#')
    average02.value = Number(indexArr[0]) || 0
    average01.value = indexArr[1] !== undefined ? Number(indexArr[1]) : 0
    radioValue.value = 4
  } else if (isLastWeek(value)) {
    const indexArr = value.split('L')
    weekday.value = Number(indexArr[0])
    radioValue.value = 5
  } else {
    checkboxList.value = parseList(value)
    radioValue.value = 6
  }
}
function onRadioChange(): void {
  if (radioValue.value === 2 && props.cron.day === '?') {
    emit('update', 'day', '*', 'week')
  }
  if (radioValue.value !== 2 && props.cron.day !== '?') {
    emit('update', 'day', '?', 'week')
  }
  switch (radioValue.value) {
    case 1:
      emit('update', 'week', '*', 'week')
      break
    case 2:
      emit('update', 'week', '?', 'week')
      break
    case 3:
      emit('update', 'week', cycleTotal.value, 'week')
      break
    case 4:
      emit('update', 'week', averageTotal.value, 'week')
      break
    case 5:
      emit('update', 'week', weekdayTotal.value, 'week')
      break
    case 6:
      if (checkboxList.value.length === 0) {
        checkboxList.value.push(checkCopy.value[0])
      } else {
        checkCopy.value = checkboxList.value
      }
      emit('update', 'week', checkboxString.value, 'week')
      break
  }
}
</script>

<style lang="scss" scoped>
.el-input-number--small,
.el-select,
.el-select--small {
  margin: 0 0.5rem;
}
.el-select,
.el-select--small {
  width: 8rem;
}
.el-select.multiselect,
.el-select--small.multiselect {
  width: 17.8rem;
}
</style>
