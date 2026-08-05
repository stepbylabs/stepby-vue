<template>
  <div>
    <el-tabs type="border-card">
      <el-tab-pane :label="t('crontab.tabs.second')" v-if="shouldHide('second')">
        <CrontabSecond @update="updateCrontabValue" :check="checkNumber" :cron="crontabValueObj" ref="cronsecond" />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.min')" v-if="shouldHide('min')">
        <CrontabMin @update="updateCrontabValue" :check="checkNumber" :cron="crontabValueObj" ref="cronmin" />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.hour')" v-if="shouldHide('hour')">
        <CrontabHour @update="updateCrontabValue" :check="checkNumber" :cron="crontabValueObj" ref="cronhour" />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.day')" v-if="shouldHide('day')">
        <CrontabDay @update="updateCrontabValue" :check="checkNumber" :cron="crontabValueObj" ref="cronday" />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.month')" v-if="shouldHide('month')">
        <CrontabMonth @update="updateCrontabValue" :check="checkNumber" :cron="crontabValueObj" ref="cronmonth" />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.week')" v-if="shouldHide('week')">
        <CrontabWeek @update="updateCrontabValue" :check="checkNumber" :cron="crontabValueObj" ref="cronweek" />
      </el-tab-pane>

      <el-tab-pane :label="t('crontab.tabs.year')" v-if="shouldHide('year')">
        <CrontabYear @update="updateCrontabValue" :check="checkNumber" :cron="crontabValueObj" ref="cronyear" />
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
import CrontabSecond from './second.vue'
import CrontabMin from './min.vue'
import CrontabHour from './hour.vue'
import CrontabDay from './day.vue'
import CrontabMonth from './month.vue'
import CrontabWeek from './week.vue'
import CrontabYear from './year.vue'
import CrontabResult from './result.vue'
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
