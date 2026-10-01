<template>
  <div class="top-right-btn" :style="style">
    <el-row>
      <el-tooltip
        class="item"
        effect="dark"
        :content="showSearch ? t('rightToolbar.hideSearch') : t('rightToolbar.showSearch')"
        placement="top"
        v-if="search" >
        <!-- search 为 prop 名（是否显示检索图标），此前误写为 "searc" 导致按钮永不渲染 -->
        <el-button
          circle
          icon="Search"
          :aria-label="showSearch ? t('rightToolbar.hideSearch') : t('rightToolbar.showSearch')"
          @click="toggleSearch()"
        />
      </el-tooltip>
      <el-tooltip class="item" effect="dark" :content="t('rightToolbar.refresh')" placement="top">
        <el-button circle icon="Refresh" :aria-label="t('rightToolbar.refresh')" @click="refresh()" />
      </el-tooltip>
      <!-- TierA-6: 表格打印 -->
      <el-tooltip class="item" effect="dark" :content="t('printTable.print')" placement="top" v-if="showPrint">
        <el-button circle icon="Printer" :aria-label="t('printTable.print')" @click="handlePrint()" />
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        :content="t('rightToolbar.columns')"
        placement="top"
        v-if="Object.keys(columns).length > 0" >
        <el-button
          circle
          icon="Menu"
          :aria-label="t('rightToolbar.columns')"
          @click="showColumn()"
          v-if="showColumnsType === 'transfer'"
        />
        <el-dropdown
          trigger="click"
          :hide-on-click="false"
          class="pl-3"
          v-if="showColumnsType === 'checkbox'" >
          <el-button circle icon="Menu" :aria-label="t('rightToolbar.columns')" />
          <template #dropdown>
            <el-dropdown-menu>
              <!-- 全选/反选 按钮 -->
              <el-dropdown-item>
                <el-checkbox :indeterminate="isIndeterminate" :model-value="isChecked" @change="toggleCheckAll">
                  {{ t('rightToolbar.columnDisplay') }}
                </el-checkbox>
              </el-dropdown-item>
              <div class="check-line w-[90%] h-px bg-border my-[3px] mx-auto"></div>
              <template v-for="(item, key) in columns" :key="item.key">
                <el-dropdown-item>
                  <el-checkbox v-model="item.visible" @change="checkboxChange($event, key)" :label="item.label" />
                </el-dropdown-item>
              </template>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-tooltip>
    </el-row>
    <el-dialog :title="t('rightToolbar.showHideTitle')" v-model="open" append-to-body destroy-on-close>
      <el-transfer
        :titles="[t('rightToolbar.show'), t('rightToolbar.hide')]"
        v-model="value"
        :data="transferData"
        @change="dataChang" ></el-transfer>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import cache from '@/plugins/cache'
import { printTable, type PrintColumn } from '@/utils/printTable'
import type { TableShowColumns } from '@/types/api/common'

/** 列项（扩展 TableShowColumns，增加 key/prop 用于打印与筛选） */
interface TableColumnItem extends TableShowColumns {
  key?: string | number
  prop?: string
}
/** columns 可能是数组或对象 */
type ColumnsProp = TableColumnItem[] | Record<string, TableColumnItem>

const { t } = useI18n()

const props = defineProps({
  /* 是否显示检索条件 */
  showSearch: {
    type: Boolean,
    default: true
  },
  /* 显隐列信息（数组格式、对象格式） */
  columns: {
    type: [Array, Object],
    default: () => ({})
  },
  /* 是否显示检索图标 */
  search: {
    type: Boolean,
    default: true
  },
  /* 显隐列类型（transfer穿梭框、checkbox复选框） */
  showColumnsType: {
    type: String,
    default: 'checkbox'
  },
  /* 右外边距 */
  gutter: {
    type: Number,
    default: 10
  },
  /* 列显隐状态记忆的 localStorage key（传入则启用记忆，不传则不记忆） */
  storageKey: {
    type: String,
    default: ''
  },
  /* TierA-6: 是否显示打印按钮 */
  showPrint: {
    type: Boolean,
    default: false
  },
  /* TierA-6: 打印的表格数据（rows） */
  printData: {
    type: Array,
    default: () => []
  },
  /* TierA-6: 打印的表格标题 */
  printTitle: {
    type: String,
    default: ''
  },
  /* TierA-6: 是否由父组件自定义打印逻辑（true 时仅触发 print 事件，不走默认打印） */
  customPrint: {
    type: Boolean,
    default: false
  }
})

const emits = defineEmits(['update:showSearch', 'queryTable', 'print'])

// 显隐数据
const value = ref<number[]>([])
// 是否显示弹出层
const open = ref(false)

const style = computed(() => {
  const ret: Record<string, string> = {}
  if (props.gutter) {
    ret.marginRight = `${props.gutter / 2}px`
  }
  return ret
})

// 是否全选/半选 状态（只读 computed，实际变更由 toggleCheckAll 处理）
const isChecked = computed(() =>
  Array.isArray(props.columns)
    ? props.columns.every((col: TableShowColumns) => col.visible)
    : Object.values(props.columns).every((col) => (col as TableShowColumns).visible)
)
const isIndeterminate = computed(() =>
  Array.isArray(props.columns)
    ? props.columns.some((col: TableShowColumns) => col.visible) && !isChecked.value
    : Object.values(props.columns).some((col) => (col as TableShowColumns).visible) && !isChecked.value
)
const transferData = computed(() =>
  Array.isArray(props.columns)
    ? props.columns.map((item: TableShowColumns, index: number) => ({ key: index, label: item.label }))
    : Object.keys(props.columns).map((key, index) => ({ key: index, label: props.columns[key].label }))
)

// 搜索切换：动画由父组件的 <Transition name="expand-fade"> 接管
function toggleSearch(): void {
  emits('update:showSearch', !props.showSearch)
}

// 刷新
function refresh(): void {
  emits('queryTable')
}

// TierA-6: 表格打印
function handlePrint(): void {
  // 始终触发 print 事件（父组件未监听则无副作用）
  emits('print')
  // 若父组件自定义打印逻辑，则跳过默认打印
  if (props.customPrint) {
    return
  }
  // 默认行为：使用 printData + columns 构建打印内容
  const printColumns: PrintColumn[] = []
  const columns = props.columns as ColumnsProp
  if (Array.isArray(columns)) {
    columns.forEach((col: TableColumnItem) => {
      if (col.visible !== false) {
        printColumns.push({ label: col.label, prop: col.prop || String(col.key ?? '') })
      }
    })
  } else {
    Object.keys(columns).forEach((key) => {
      const col = columns[key]
      if (col && col.visible !== false) {
        printColumns.push({ label: col.label, prop: col.prop || key })
      }
    })
  }
  printTable({
    title: props.printTitle || document.title,
    columns: printColumns,
    data: props.printData
  })
}

// 右侧列表元素变化
function dataChange(data: number[]): void {
  if (Array.isArray(props.columns)) {
    for (const item in props.columns) {
      const key = props.columns[item].key
      props.columns[item].visible = !data.includes(parseInt(key))
    }
  } else {
    Object.keys(props.columns).forEach((key, index) => {
      props.columns[key].visible = !data.includes(index)
    })
  }
  saveStorage()
}

// 打开显隐列dialog
function showColumn(): void {
  open.value = true
}

// 如果传入了 storageKey，从 localStorage 恢复列显隐状态
if (props.storageKey) {
  try {
    const saved = cache.local.getJSON(props.storageKey) as Record<string, unknown> | null
    if (saved && typeof saved === 'object') {
      const columns = props.columns as ColumnsProp
      if (Array.isArray(columns)) {
        columns.forEach((col: TableColumnItem, index: number) => {
          if (saved[index] !== undefined) col.visible = saved[index] as boolean
        })
      } else {
        Object.keys(columns).forEach((key) => {
          if (saved[key] !== undefined) columns[key].visible = saved[key] as boolean
        })
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Failed to read column visibility config:', e)
  }
}
if (props.showColumnsType === 'transfer') {
  // transfer穿梭显隐列初始默认隐藏列
  if (Array.isArray(props.columns)) {
    for (const item in props.columns) {
      if (props.columns[item].visible === false) {
        value.value.push(parseInt(item))
      }
    }
  } else {
    Object.keys(props.columns).forEach((key, index) => {
      if (props.columns[key].visible === false) {
        value.value.push(index)
      }
    })
  }
}

// 单勾选
function checkboxChange(event: boolean, key: string): void {
  const columns = props.columns as ColumnsProp
  if (Array.isArray(columns)) {
    const col = columns.filter((item: TableColumnItem) => String(item.key) === key)[0]
    if (col) {
      col.visible = event
    }
  } else {
    columns[key].visible = event
  }
  saveStorage()
}

// 切换全选/反选
function toggleCheckAll(): void {
  const newValue = !isChecked.value
  if (Array.isArray(props.columns)) {
    props.columns.forEach((col: TableShowColumns) => (col.visible = newValue))
  } else {
    Object.values(props.columns).forEach((col) => ((col as TableShowColumns).visible = newValue))
  }
  saveStorage()
}

// 将当前列显隐状态持久化到 localStorage
function saveStorage(): void {
  if (!props.storageKey) return
  try {
    const state: { [key: string]: boolean } = {}
    if (Array.isArray(props.columns)) {
      props.columns.forEach((col: TableShowColumns, index: number) => {
        state[index] = col.visible
      })
    } else {
      Object.keys(props.columns).forEach((key) => {
        state[key] = props.columns[key].visible
      })
    }
    cache.local.setJSON(props.storageKey, state)
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Failed to save column visibility config:', e)
  }
}
</script>

<style lang="scss" scoped>
:deep(.el-transfer__button) {
  border-radius: 50%;
  display: block;
  margin-left: 0px;
}
:deep(.el-transfer__button:first-child) {
  margin-bottom: 10px;
}
:deep(.el-dropdown-menu__item) {
  line-height: 30px;
  padding: 0 17px;
}
</style>
