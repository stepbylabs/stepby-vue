<template>
  <el-form>
    <!-- 空值（年字段专用）：canonical radio = 10 -->
    <el-form-item v-if="c.allowEmpty">
      <el-radio v-model="radioValue" :value="10">
        {{ t(c.i18n.empty ?? '') }}
      </el-radio>
    </el-form-item>

    <!-- 通配符：canonical radio = 1 -->
    <el-form-item>
      <el-radio v-model="radioValue" :value="1">
        {{ t(c.i18n.wildcard) }}
      </el-radio>
    </el-form-item>

    <!-- 不指定 "?"（日/周字段专用）：canonical radio = 2 -->
    <el-form-item v-if="c.allowUnspecified">
      <el-radio v-model="radioValue" :value="2">
        {{ t(c.i18n.unspecified ?? '') }}
      </el-radio>
    </el-form-item>

    <!-- 周期：canonical radio = 3 -->
    <el-form-item>
      <el-radio v-model="radioValue" :value="3">
        {{ t(c.i18n.cycleFrom) }}
        <template v-if="c.cycleUseSelect">
          <el-select clearable v-model="cycle01">
            <el-option
              v-for="item of namedOptions"
              :key="item.key"
              :label="item.value"
              :value="item.key"
              :disabled="item.key === 7"
            />
          </el-select>
          -
          <el-select clearable v-model="cycle02">
            <el-option
              v-for="item of namedOptions"
              :key="item.key"
              :label="item.value"
              :value="item.key"
              :disabled="item.key <= cycle01"
            />
          </el-select>
        </template>
        <template v-else>
          <el-input-number v-model="cycle01" :min="c.cycleMin" :max="c.cycleMax1" />
          -
          <el-input-number v-model="cycle02" :min="cycle01 + 1" :max="c.cycleMax2" />
        </template>
        <span v-if="c.i18n.cycleUnit">{{ t(c.i18n.cycleUnit) }}</span>
      </el-radio>
    </el-form-item>

    <!-- 步长：canonical radio = 4 -->
    <el-form-item v-if="c.allowAverage">
      <el-radio v-model="radioValue" :value="4">
        {{ t(c.i18n.rangeFrom) }}
        <el-input-number v-model="average01" :min="c.cycleMin" :max="c.avgMax1" />
        {{ t(c.i18n.avgStart ?? '') }}
        <el-select v-if="c.avgSecondUseSelect" clearable v-model="average02">
          <el-option v-for="item in namedOptions" :key="item.key" :label="item.value" :value="item.key" />
        </el-select>
        <el-input-number v-else v-model="average02" :min="1" :max="c.cycleMax2 - average01" />
        {{ t(c.i18n.avgExecute ?? '') }}
      </el-radio>
    </el-form-item>

    <!-- 工作日 "W"（日字段专用）：canonical radio = 5 -->
    <el-form-item v-if="c.allowWorkday">
      <el-radio v-model="radioValue" :value="5">
        {{ t(c.i18n.monthlyPrefix ?? '') }}
        <el-input-number v-model="workday" :min="c.cycleMin" :max="c.cycleMax2" />
        {{ t(c.i18n.nearestWorkday ?? '') }}
      </el-radio>
    </el-form-item>

    <!-- 本月最后一天 "L"（日字段专用）：canonical radio = 6 -->
    <el-form-item v-if="c.allowLastDay">
      <el-radio v-model="radioValue" :value="6">
        {{ t(c.i18n.lastDayOfMonth ?? '') }}
      </el-radio>
    </el-form-item>

    <!-- 第几周 "#"（周字段专用）：canonical radio = 7 -->
    <el-form-item v-if="c.allowNthWeek">
      <el-radio v-model="radioValue" :value="7">
        {{ t(c.i18n.nthWeekPrefix ?? '') }}
        <el-input-number v-model="average01" :min="1" :max="4" />
        {{ t(c.i18n.nthWeekSuffix ?? '') }}
        <el-select clearable v-model="average02">
          <el-option v-for="item in namedOptions" :key="item.key" :label="item.value" :value="item.key" />
        </el-select>
      </el-radio>
    </el-form-item>

    <!-- 最后一周 "L"（周字段专用）：canonical radio = 8 -->
    <el-form-item v-if="c.allowLastWeek">
      <el-radio v-model="radioValue" :value="8">
        {{ t(c.i18n.lastWeekOfMonth ?? '') }}
        <el-select clearable v-model="weekday">
          <el-option v-for="item in namedOptions" :key="item.key" :label="item.value" :value="item.key" />
        </el-select>
      </el-radio>
    </el-form-item>

    <!-- 指定（多选）：canonical radio = 9 -->
    <el-form-item>
      <el-radio v-model="radioValue" :value="9">
        {{ t(c.i18n.specify) }}
        <el-select
          clearable
          v-model="checkboxList"
          :placeholder="t(c.i18n.multiPlaceholder)"
          multiple
          :multiple-limit="c.multipleLimit"
        >
          <el-option
            v-for="item in specifyOptions"
            :key="item.key"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-radio>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import {
  isWildcard,
  isUnspecified,
  isEmpty,
  isCycle,
  isAverage,
  isWorkday,
  isLastDay,
  isWeekHash,
  isLastWeek,
  parseCycle,
  parseAverage,
  parseList
} from '@/composables/useCron'
import type { CronValue, CronFieldName, CronCheckFn, CronFieldConfig } from '@/types/cron'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'update', name: CronFieldName, value: string, from: string): void
}>()

const props = defineProps<{
  cron: CronValue
  check: CronCheckFn
  config: CronFieldConfig
}>()

// c 为静态配置（每实例固定），直接解引用，避免重复 props.config
const c = props.config

const radioValue = ref<number>(c.defaultRadio)
const cycle01 = ref<number>(c.init.cycle01)
const cycle02 = ref<number>(c.init.cycle02)
const average01 = ref<number>(c.init.average01)
const average02 = ref<number>(c.init.average02)
const workday = ref<number>(c.init.workday)
const weekday = ref<number>(c.init.weekday)
const checkboxList = ref<number[]>([])
const checkCopy = ref<number[]>([c.checkCopyDefault])

// 命名列表（月/周），值来自 i18n
const namedOptions = computed<{ key: number; value: string }[]>(() => {
  if (c.namedList === 'week') {
    return [
      { key: 1, value: t('crontab.weeks.sunday') },
      { key: 2, value: t('crontab.weeks.monday') },
      { key: 3, value: t('crontab.weeks.tuesday') },
      { key: 4, value: t('crontab.weeks.wednesday') },
      { key: 5, value: t('crontab.weeks.thursday') },
      { key: 6, value: t('crontab.weeks.friday') },
      { key: 7, value: t('crontab.weeks.saturday') }
    ]
  }
  if (c.namedList === 'month') {
    return [
      { key: 1, value: t('crontab.months.jan') },
      { key: 2, value: t('crontab.months.feb') },
      { key: 3, value: t('crontab.months.mar') },
      { key: 4, value: t('crontab.months.apr') },
      { key: 5, value: t('crontab.months.may') },
      { key: 6, value: t('crontab.months.jun') },
      { key: 7, value: t('crontab.months.jul') },
      { key: 8, value: t('crontab.months.aug') },
      { key: 9, value: t('crontab.months.sep') },
      { key: 10, value: t('crontab.months.oct') },
      { key: 11, value: t('crontab.months.nov') },
      { key: 12, value: t('crontab.months.dec') }
    ]
  }
  return []
})

// 指定多选的选项（range / list 统一成 { key, label, value }）
const specifyOptions = computed<{ key: number; label: string; value: number }[]>(() => {
  if (c.optionMode === 'range') {
    const off = c.optionValueOffset ?? 0
    const count = c.optionCount ?? 0
    const arr: { key: number; label: string; value: number }[] = []
    for (let i = 1; i <= count; i++) {
      const v = i + off
      arr.push({ key: v, label: String(v), value: v })
    }
    return arr
  }
  return namedOptions.value.map((o: { key: number; value: string }) => ({
    key: o.key,
    label: o.value,
    value: o.key
  }))
})

// computed 仅返回计算值，数值校正放在 watch（与原组件一致，P0-69）
const cycleTotal = computed(() => cycle01.value + '-' + cycle02.value)
const averageTotal = computed(() =>
  c.averageUseHash ? average02.value + '#' + average01.value : average01.value + '/' + average02.value
)
const workdayTotal = computed(() => workday.value + 'W')
const weekdayTotal = computed(() => weekday.value + 'L')
const checkboxString = computed(() => checkboxList.value.join(','))

// 周期输入校正
watch(
  [cycle01, cycle02],
  () => {
    const newCycle01 = props.check(cycle01.value, c.cycleMin, c.cycleMax1)
    if (newCycle01 !== cycle01.value) cycle01.value = newCycle01
    const newCycle02 = props.check(cycle02.value, cycle01.value + 1, c.cycleMax2)
    if (newCycle02 !== cycle02.value) cycle02.value = newCycle02
  },
  { flush: 'sync' }
)

// 步长输入校正
watch(
  [average01, average02],
  () => {
    const newAverage01 = props.check(average01.value, c.cycleMin, c.avgMax1)
    if (newAverage01 !== average01.value) average01.value = newAverage01
    const avg2Max = c.averageSecondMaxFixed ? c.cycleMax2 : c.cycleMax2 - average01.value
    const newAverage02 = props.check(average02.value, 1, avg2Max)
    if (newAverage02 !== average02.value) average02.value = newAverage02
  },
  { flush: 'sync' }
)

// 工作日输入校正（日字段）
if (c.allowWorkday) {
  watch(
    workday,
    () => {
      const newWorkday = props.check(workday.value, c.cycleMin, c.cycleMax2)
      if (newWorkday !== workday.value) workday.value = newWorkday
    },
    { flush: 'sync' }
  )
}

// 最后一周输入校正（周字段）
if (c.allowLastWeek) {
  watch(
    weekday,
    () => {
      const newWeekday = props.check(weekday.value, c.cycleMin, c.cycleMax2)
      if (newWeekday !== weekday.value) weekday.value = newWeekday
    },
    { flush: 'sync' }
  )
}

// 外部 cron[field] 变化 -> 重新解析单选值
watch(
  () => props.cron[c.field],
  (value: string | undefined, old: string | undefined) => {
    if (value === old) return
    changeRadioValue(value ?? '')
  },
  { immediate: true }
)

watch([radioValue, cycleTotal, averageTotal, workdayTotal, weekdayTotal, checkboxString], () => onRadioChange())

// 将父组件传入的 cron 字符串解析为对应的单选值
function changeRadioValue(value: string): void {
  // 时字段专用：解析时若 min/second 为 "*" 则归零（与原 hour.vue 一致）
  if (c.emitSiblingZeroOnParse) {
    if (props.cron.min === '*') emit('update', 'min', '0', c.field)
    if (props.cron.second === '*') emit('update', 'second', '0', c.field)
  }
  if (c.allowEmpty && isEmpty(value)) {
    radioValue.value = 10
    return
  }
  if (isWildcard(value)) {
    radioValue.value = 1
    return
  }
  if (c.allowUnspecified && isUnspecified(value)) {
    radioValue.value = 2
    return
  }
  if (isCycle(value)) {
    const [start, end] = parseCycle(value)
    cycle01.value = start
    cycle02.value = end
    radioValue.value = 3
    return
  }
  if (c.allowAverage && isAverage(value)) {
    const [start, step] = parseAverage(value)
    average01.value = start
    average02.value = step
    radioValue.value = 4
    return
  }
  if (c.allowWorkday && isWorkday(value)) {
    const indexArr = value.split('W')
    workday.value = Number(indexArr[0])
    radioValue.value = 5
    return
  }
  if (c.allowLastDay && isLastDay(value)) {
    radioValue.value = 6
    return
  }
  if (c.allowNthWeek && isWeekHash(value)) {
    const indexArr = value.split('#')
    average02.value = Number(indexArr[0]) || 0
    average01.value = indexArr[1] !== undefined ? Number(indexArr[1]) : 0
    radioValue.value = 7
    return
  }
  if (c.allowLastWeek && isLastWeek(value)) {
    const indexArr = value.split('L')
    weekday.value = Number(indexArr[0])
    radioValue.value = 8
    return
  }
  // 其余情况（含指定列表）视为 specify
  checkboxList.value = parseList(value)
  radioValue.value = 9
}

// 单选值/输入变化 -> 向父组件 emit 对应字段值
function onRadioChange(): void {
  // 日↔周跨字段联动（与原 day.vue / week.vue 一致）
  if (c.siblingField) {
    if (radioValue.value === 2 && props.cron[c.siblingField] === '?') {
      emit('update', c.siblingField, '*', c.field)
    }
    if (radioValue.value !== 2 && props.cron[c.siblingField] !== '?') {
      emit('update', c.siblingField, '?', c.field)
    }
  }
  switch (radioValue.value) {
    case 10:
      emit('update', c.field, '', c.field)
      break
    case 1:
      emit('update', c.field, '*', c.field)
      break
    case 2:
      emit('update', c.field, '?', c.field)
      break
    case 3:
      emit('update', c.field, cycleTotal.value, c.field)
      break
    case 4:
      emit('update', c.field, averageTotal.value, c.field)
      break
    case 5:
      emit('update', c.field, workdayTotal.value, c.field)
      break
    case 6:
      emit('update', c.field, 'L', c.field)
      break
    case 7:
      emit('update', c.field, averageTotal.value, c.field)
      break
    case 8:
      emit('update', c.field, weekdayTotal.value, c.field)
      break
    case 9:
      if (checkboxList.value.length === 0) {
        checkboxList.value.push(checkCopy.value[0])
      } else {
        checkCopy.value = checkboxList.value
      }
      emit('update', c.field, checkboxString.value, c.field)
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
.el-select.multiselect,
.el-select--small.multiselect {
  width: 17.8rem;
}
</style>
