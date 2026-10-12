<template>
  <div>
    <template v-for="(item, index) in options" :key="item.value">
      <template v-if="isValueMatch(item.value)">
        <span
          v-if="
            (item.elTagType === 'default' || item.elTagType === '') &&
            (item.elTagClass === '' || item.elTagClass == null)
          "
          :index="index"
          :class="item.elTagClass"
        >
          {{ item.label + ' ' }}
        </span>
        <el-tag v-else :index="index" :type="item.elTagType" :class="item.elTagClass">{{ item.label + ' ' }}</el-tag>
      </template>
    </template>
    <template v-if="unmatch && showValue">
      {{ handleArray(unmatchArray) }}
    </template>
  </div>
</template>

<script setup lang="ts">
interface DictOption {
  label: string
  value: string | number
  elTagType?: string
  elTagClass?: string
}

interface Props {
  options?: DictOption[] | null
  value?: number | string | (number | string)[]
  showValue?: boolean
  separator?: string
}

// Vue 3.5 响应式解构默认值：编译器自动保持解构变量的响应性
const { options = null, value, showValue = true, separator = ',' } = defineProps<Props>()

// 记录未匹配的项（派生 computed，避免在 computed 中产生副作用）
const values = computed<(string | number)[]>(() => {
  if (value === null || typeof value === 'undefined' || value === '') return []
  if (typeof value === 'number' || typeof value === 'boolean') return [value]
  return Array.isArray(value) ? value.map((item: string | number) => '' + item) : String(value).split(separator)
})

const unmatchArray = computed<(string | number)[]>(() => {
  if (value === null || typeof value === 'undefined' || value === '' || !Array.isArray(options) || options.length === 0)
    return []
  const result: (string | number)[] = []
  values.value.forEach((item: string | number) => {
    if (!options?.some((v: DictOption) => String(v.value) === String(item))) {
      result.push(item)
    }
  })
  return result
})

const unmatch = computed(() => unmatchArray.value.length > 0)

function handleArray(array: (string | number)[]): string {
  if (array.length === 0) return ''
  return array.reduce<string>((pre, cur) => {
    return pre + ' ' + cur
  }, '')
}

function isValueMatch(itemValue: string | number): boolean {
  return values.value.some((val: string | number) => String(val) === String(itemValue))
}
</script>

<style scoped>
.el-tag + .el-tag {
  margin-left: 10px;
}
</style>
