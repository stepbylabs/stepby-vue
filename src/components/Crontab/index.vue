<template>
  <div>
    <el-tabs type="border-card">
      <el-tab-pane :label="t('crontab.tabs.second')" v-if="shouldHide('second')">
        <CronField
          :config="secondConfig"
          :check="checkNumber"
          :cron="crontabValueObj"
          @update="updateCrontabValue"
        />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.min')" v-if="shouldHide('min')">
        <CronField
          :config="minConfig"
          :check="checkNumber"
          :cron="crontabValueObj"
          @update="updateCrontabValue"
        />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.hour')" v-if="shouldHide('hour')">
        <CronField
          :config="hourConfig"
          :check="checkNumber"
          :cron="crontabValueObj"
          @update="updateCrontabValue"
        />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.day')" v-if="shouldHide('day')">
        <CronField
          :config="dayConfig"
          :check="checkNumber"
          :cron="crontabValueObj"
          @update="updateCrontabValue"
        />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.month')" v-if="shouldHide('month')">
        <CronField
          :config="monthConfig"
          :check="checkNumber"
          :cron="crontabValueObj"
          @update="updateCrontabValue"
        />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.week')" v-if="shouldHide('week')">
        <CronField
          :config="weekConfig"
          :check="checkNumber"
          :cron="crontabValueObj"
          @update="updateCrontabValue"
        />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.year')" v-if="shouldHide('year')">
        <CronField
          :config="yearConfig"
          :check="checkNumber"
          :cron="crontabValueObj"
          @update="updateCrontabValue"
        />
      </el-tab-pane>
    </el-tabs>

    <div class="popup-main relative mx-auto my-2.5 rounded-[5px] text-xs overflow-hidden">
      <div
        class="popup-result box-border leading-[24px] my-[25px] mx-auto pt-[15px] px-2.5 pb-2.5 border border-border relative"
      >
        <p class="title">{{ t('crontab.expression') }}</p>
        <table>
          <thead>
            <tr>
              <th v-for="item of tabTitles" :key="item" scope="col">{{ item }}</th>
              <th scope="col">{{ t('crontab.cron') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span v-if="crontabValueObj.second.length < 10">{{ crontabValueObj.second }}</span>
                <el-tooltip v-else :content="crontabValueObj.second" placement="top">
                  <span>{{ crontabValueObj.second }}</span>
                </el-tooltip>
              </td>
              <td>
                <span v-if="crontabValueObj.min.length < 10">{{ crontabValueObj.min }}</span>
                <el-tooltip v-else :content="crontabValueObj.min" placement="top">
                  <span>{{ crontabValueObj.min }}</span>
                </el-tooltip>
              </td>
              <td>
                <span v-if="crontabValueObj.hour.length < 10">{{ crontabValueObj.hour }}</span>
                <el-tooltip v-else :content="crontabValueObj.hour" placement="top">
                  <span>{{ crontabValueObj.hour }}</span>
                </el-tooltip>
              </td>
              <td>
                <span v-if="crontabValueObj.day.length < 10">{{ crontabValueObj.day }}</span>
                <el-tooltip v-else :content="crontabValueObj.day" placement="top">
                  <span>{{ crontabValueObj.day }}</span>
                </el-tooltip>
              </td>
              <td>
                <span v-if="crontabValueObj.month.length < 10">{{ crontabValueObj.month }}</span>
                <el-tooltip v-else :content="crontabValueObj.month" placement="top">
                  <span>{{ crontabValueObj.month }}</span>
                </el-tooltip>
              </td>
              <td>
                <span v-if="crontabValueObj.week.length < 10">{{ crontabValueObj.week }}</span>
                <el-tooltip v-else :content="crontabValueObj.week" placement="top">
                  <span>{{ crontabValueObj.week }}</span>
                </el-tooltip>
              </td>
              <td>
                <span v-if="crontabValueObj.year.length < 10">{{ crontabValueObj.year }}</span>
                <el-tooltip v-else :content="crontabValueObj.year" placement="top">
                  <span>{{ crontabValueObj.year }}</span>
                </el-tooltip>
              </td>
              <td class="result">
                <span v-if="crontabValueString.length < 90">{{ crontabValueString }}</span>
                <el-tooltip v-else :content="crontabValueString" placement="top">
                  <span>{{ crontabValueString }}</span>
                </el-tooltip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <CrontabResult :ex="crontabValueString"></CrontabResult>

      <div class="pop_btn text-center mt-5">
        <el-button type="primary" @click="submitFill">{{ t('crontab.btn.confirm') }}</el-button>
        <el-button type="warning" @click="clearCron">{{ t('crontab.btn.reset') }}</el-button>
        <el-button @click="hidePopup">{{ t('crontab.btn.cancel') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { CronValue, CronFieldName } from '@/types/cron'
import { checkNumber, parseCronExpression, stringifyCronValue, DEFAULT_CRON_VALUE } from '@/composables/useCron'
import CrontabResult from './result.vue'
import CronField from './CronField.vue'
import type { CronFieldConfig } from '@/types/cron'

const fullYear = Number(new Date().getFullYear())
const maxFullYear = fullYear + 10

// 各 Cron 字段的通用配置（替代原 7 个逐字重复的子组件，逻辑见 CronField.vue）
const secondConfig: CronFieldConfig = {
  field: 'second',
  i18n: {
    wildcard: 'crontab.radio.wildcardSecond',
    cycleFrom: 'crontab.radio.cycleFrom',
    cycleUnit: 'crontab.radio.cycleUnitSecond',
    rangeFrom: 'crontab.radio.rangeFrom',
    avgStart: 'crontab.radio.avgStartSecond',
    avgExecute: 'crontab.radio.avgExecuteSecond',
    specify: 'crontab.radio.specify',
    multiPlaceholder: 'crontab.multiSelectPlaceholder'
  },
  optionMode: 'range',
  optionCount: 60,
  optionValueOffset: -1,
  multipleLimit: 10,
  cycleMin: 0,
  cycleMax1: 58,
  cycleMax2: 59,
  avgMax1: 58,
  defaultRadio: 1,
  checkCopyDefault: 0,
  init: { cycle01: 0, cycle02: 1, average01: 0, average02: 1, weekday: 2, workday: 0 },
  allowAverage: true
}

const minConfig: CronFieldConfig = {
  field: 'min',
  i18n: {
    wildcard: 'crontab.radio.wildcardMin',
    cycleFrom: 'crontab.radio.cycleFrom',
    cycleUnit: 'crontab.radio.cycleUnitMin',
    rangeFrom: 'crontab.radio.rangeFrom',
    avgStart: 'crontab.radio.avgStartMin',
    avgExecute: 'crontab.radio.avgExecuteMin',
    specify: 'crontab.radio.specify',
    multiPlaceholder: 'crontab.multiSelectPlaceholder'
  },
  optionMode: 'range',
  optionCount: 60,
  optionValueOffset: -1,
  multipleLimit: 10,
  cycleMin: 0,
  cycleMax1: 58,
  cycleMax2: 59,
  avgMax1: 58,
  defaultRadio: 1,
  checkCopyDefault: 0,
  init: { cycle01: 0, cycle02: 1, average01: 0, average02: 1, weekday: 2, workday: 0 },
  allowAverage: true
}

const hourConfig: CronFieldConfig = {
  field: 'hour',
  i18n: {
    wildcard: 'crontab.radio.wildcardHour',
    cycleFrom: 'crontab.radio.cycleFrom',
    cycleUnit: 'crontab.radio.cycleUnitHour',
    rangeFrom: 'crontab.radio.rangeFrom',
    avgStart: 'crontab.radio.avgStartHour',
    avgExecute: 'crontab.radio.avgExecuteHour',
    specify: 'crontab.radio.specify',
    multiPlaceholder: 'crontab.multiSelectPlaceholder'
  },
  optionMode: 'range',
  optionCount: 24,
  optionValueOffset: -1,
  multipleLimit: 10,
  cycleMin: 0,
  cycleMax1: 22,
  cycleMax2: 23,
  avgMax1: 22,
  defaultRadio: 1,
  checkCopyDefault: 0,
  init: { cycle01: 0, cycle02: 1, average01: 0, average02: 1, weekday: 2, workday: 0 },
  allowAverage: true,
  emitSiblingZeroOnParse: true
}

const dayConfig: CronFieldConfig = {
  field: 'day',
  i18n: {
    wildcard: 'crontab.radio.wildcardDay',
    unspecified: 'crontab.radio.unspecified',
    cycleFrom: 'crontab.radio.cycleFrom',
    cycleUnit: 'crontab.radio.cycleUnitDay',
    rangeFrom: 'crontab.radio.rangeFrom',
    avgStart: 'crontab.radio.avgStartDay',
    avgExecute: 'crontab.radio.avgExecuteDay',
    monthlyPrefix: 'crontab.radio.monthlyPrefix',
    nearestWorkday: 'crontab.radio.nearestWorkday',
    lastDayOfMonth: 'crontab.radio.lastDayOfMonth',
    specify: 'crontab.radio.specify',
    multiPlaceholder: 'crontab.multiSelectPlaceholder'
  },
  optionMode: 'range',
  optionCount: 31,
  optionValueOffset: 0,
  multipleLimit: 10,
  cycleMin: 1,
  cycleMax1: 30,
  cycleMax2: 31,
  avgMax1: 30,
  defaultRadio: 1,
  checkCopyDefault: 1,
  init: { cycle01: 1, cycle02: 2, average01: 1, average02: 1, weekday: 2, workday: 1 },
  allowUnspecified: true,
  allowAverage: true,
  allowWorkday: true,
  allowLastDay: true,
  siblingField: 'week'
}

const monthConfig: CronFieldConfig = {
  field: 'month',
  i18n: {
    wildcard: 'crontab.radio.wildcardMonth',
    cycleFrom: 'crontab.radio.cycleFrom',
    cycleUnit: 'crontab.radio.cycleUnitMonth',
    rangeFrom: 'crontab.radio.rangeFrom',
    avgStart: 'crontab.radio.avgStartMonth',
    avgExecute: 'crontab.radio.avgExecuteMonth',
    specify: 'crontab.radio.specify',
    multiPlaceholder: 'crontab.multiSelectPlaceholder'
  },
  optionMode: 'list',
  namedList: 'month',
  multipleLimit: 8,
  cycleMin: 1,
  cycleMax1: 11,
  cycleMax2: 12,
  avgMax1: 11,
  defaultRadio: 1,
  checkCopyDefault: 1,
  init: { cycle01: 1, cycle02: 2, average01: 1, average02: 1, weekday: 2, workday: 1 },
  allowAverage: true
}

const weekConfig: CronFieldConfig = {
  field: 'week',
  i18n: {
    wildcard: 'crontab.radio.wildcardWeek',
    unspecified: 'crontab.radio.unspecified',
    cycleFrom: 'crontab.radio.cycleFrom',
    rangeFrom: 'crontab.radio.rangeFrom',
    nthWeekPrefix: 'crontab.radio.nthWeekPrefix',
    nthWeekSuffix: 'crontab.radio.nthWeekSuffix',
    lastWeekOfMonth: 'crontab.radio.lastWeekOfMonth',
    specify: 'crontab.radio.specify',
    multiPlaceholder: 'crontab.multiSelectPlaceholder'
  },
  optionMode: 'list',
  namedList: 'week',
  multipleLimit: 6,
  cycleMin: 1,
  cycleMax1: 6,
  cycleMax2: 7,
  avgMax1: 4,
  defaultRadio: 2,
  checkCopyDefault: 2,
  init: { cycle01: 2, cycle02: 3, average01: 1, average02: 2, weekday: 2, workday: 1 },
  allowUnspecified: true,
  allowNthWeek: true,
  allowLastWeek: true,
  cycleUseSelect: true,
  avgSecondUseSelect: true,
  averageUseHash: true,
  averageSecondMaxFixed: true,
  siblingField: 'day'
}

const yearConfig: CronFieldConfig = {
  field: 'year',
  i18n: {
    // 注意：原 year.vue 中 radio1（空值）文案为 wildcardYear，radio2（"*"）文案为 everyYear
    empty: 'crontab.radio.wildcardYear',
    wildcard: 'crontab.radio.everyYear',
    cycleFrom: 'crontab.radio.cycleFrom',
    rangeFrom: 'crontab.radio.rangeFrom',
    avgStart: 'crontab.radio.avgStartYear',
    avgExecute: 'crontab.radio.avgExecuteYear',
    specify: 'crontab.radio.specify',
    multiPlaceholder: 'crontab.multiSelectPlaceholder'
  },
  optionMode: 'range',
  optionCount: maxFullYear - fullYear + 1,
  optionValueOffset: fullYear - 1,
  multipleLimit: 8,
  cycleMin: fullYear,
  cycleMax1: maxFullYear - 1,
  cycleMax2: maxFullYear,
  avgMax1: maxFullYear - 1,
  defaultRadio: 10,
  checkCopyDefault: fullYear,
  init: { cycle01: fullYear, cycle02: fullYear + 1, average01: fullYear, average02: 1, weekday: 2, workday: fullYear },
  allowEmpty: true,
  allowAverage: true
}
const emit = defineEmits(['hide', 'fill'])
const { t } = useI18n()
const props = defineProps({
  hideComponent: {
    type: Array as PropType<CronFieldName[]>,
    default: () => []
  },
  expression: {
    type: String,
    default: ''
  }
})
const tabTitles = computed<string[]>(() => [
  t('crontab.tabs.second'),
  t('crontab.tabs.min'),
  t('crontab.tabs.hour'),
  t('crontab.tabs.day'),
  t('crontab.tabs.month'),
  t('crontab.tabs.week'),
  t('crontab.tabs.year')
])
const hideComponentRef = ref<CronFieldName[]>([])
const expressionRef = ref<string>('')
const crontabValueObj = ref<CronValue>({ ...DEFAULT_CRON_VALUE })
const crontabValueString = computed(() => stringifyCronValue(crontabValueObj.value))
watch(expressionRef, () => resolveExp())
function shouldHide(key: string): boolean {
  return !(hideComponentRef.value && hideComponentRef.value.includes(key as CronFieldName))
}
function resolveExp(): void {
  // 反解析 表达式
  const parsed = parseCronExpression(expressionRef.value)
  if (parsed) {
    //6 位以上是合法表达式
    crontabValueObj.value = { ...parsed }
  } else if (!expressionRef.value) {
    // 没有传入的表达式 则还原
    clearCron()
  }
}
// 由子组件触发，更改表达式组成的字段值
function updateCrontabValue(name: CronFieldName, value: string, _from: string): void {
  crontabValueObj.value[name] = value
}
// 隐藏弹窗
function hidePopup(): void {
  emit('hide')
}
// 填充表达式
function submitFill(): void {
  emit('fill', crontabValueString.value)
  hidePopup()
}
function clearCron(): void {
  // 还原选择项
  crontabValueObj.value = { ...DEFAULT_CRON_VALUE }
}
onMounted(() => {
  expressionRef.value = props.expression
  hideComponentRef.value = props.hideComponent
})

// P2 修复：props 响应式。原实现仅在 onMounted 一次性赋值，父组件
// 动态修改 expression/hideComponent 时组件不更新（如弹窗复用时传入新表达式）。
watch(
  () => props.expression,
  (val: string) => {
    if (val !== expressionRef.value) {
      expressionRef.value = val
    }
  }
)
watch(
  () => props.hideComponent,
  (val: CronFieldName[]) => {
    hideComponentRef.value = val
  },
  { deep: true }
)
</script>

<style lang="scss" scoped>
.popup-title {
  overflow: hidden;
  line-height: 34px;
  padding-top: 6px;
  background: var(--el-fill-color);
}
.popup-result .title {
  position: absolute;
  top: -28px;
  left: 50%;
  width: 140px;
  font-size: 14px;
  margin-left: -70px;
  text-align: center;
  line-height: 30px;
  background: var(--el-bg-overlay);
}
.popup-result table {
  text-align: center;
  width: 100%;
  margin: 0 auto;
}
.popup-result table td:not(.result) {
  width: 3.5rem;
  min-width: 3.5rem;
  max-width: 3.5rem;
}
.popup-result table span {
  display: block;
  width: 100%;
  font-family: arial;
  line-height: 30px;
  height: 30px;
  white-space: nowrap;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
}
.popup-result-scroll {
  font-size: 12px;
  line-height: 24px;
  height: 10em;
  overflow-y: auto;
}
</style>
