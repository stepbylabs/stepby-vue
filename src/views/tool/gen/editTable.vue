<template>
  <el-card>
    <el-tabs v-model="activeName">
      <el-tab-pane :label="t('gen.editTable.tabBasic')" name="basic">
        <Transition mode="out-in" name="fade-slide">
          <div :key="activeName">
            <basic-info-form ref="basicInfo" :info="info" />
          </div>
        </Transition>
      </el-tab-pane>
      <el-tab-pane :label="t('gen.editTable.tabField')" name="columnInfo">
        <Transition mode="out-in" name="fade-slide">
          <div :key="activeName">
            <el-table ref="dragTable" :data="columns" row-key="columnId" :max-height="tableHeight">
              <el-table-column :label="t('common.column.sort')" type="index" min-width="5%" class-name="allowDrag" />
              <el-table-column
                :label="t('gen.editTable.column.columnName')"
                prop="columnName"
                min-width="10%"
                show-overflow-tooltip
                class-name="allowDrag"
              />
              <el-table-column :label="t('gen.editTable.column.columnComment')" min-width="10%">
                <template #default="scope">
                  <el-input v-model="scope.row.columnComment"></el-input>
                </template>
              </el-table-column>
              <el-table-column
                :label="t('gen.editTable.column.columnType')"
                prop="columnType"
                min-width="10%"
                show-overflow-tooltip
              />
              <el-table-column :label="t('gen.editTable.column.rustType')" min-width="14%">
                <template #default="scope">
                  <!-- 值必须是**后端 `column_type_to_rust_type` 实际产出的 Rust 类型**：
                       模板会把该值原样写进实体/DTO 字段声明，填 Java 类型（Long/BigDecimal/Date）
                       会生成无法编译的 Rust。下拉项与 gen_table_service.rs 的映射逐一对应。 -->
                  <el-select v-model="scope.row.rustType">
                    <el-option label="i64" value="i64" />
                    <el-option label="i8" value="i8" />
                    <el-option label="i16" value="i16" />
                    <el-option label="f32" value="f32" />
                    <el-option label="f64" value="f64" />
                    <el-option label="bool" value="bool" />
                    <el-option label="String" value="String" />
                    <el-option label="chrono::NaiveDateTime" value="chrono::NaiveDateTime" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.rustField')" min-width="10%">
                <template #default="scope">
                  <el-input v-model="scope.row.rustField" :maxlength="64"></el-input>
                </template>
              </el-table-column>

              <el-table-column :label="t('gen.editTable.column.isInsert')" min-width="5%">
                <template #default="scope">
                  <el-checkbox true-value="1" false-value="0" v-model="scope.row.isInsert"></el-checkbox>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.isEdit')" min-width="5%">
                <template #default="scope">
                  <el-checkbox true-value="1" false-value="0" v-model="scope.row.isEdit"></el-checkbox>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.isList')" min-width="5%">
                <template #default="scope">
                  <el-checkbox true-value="1" false-value="0" v-model="scope.row.isList"></el-checkbox>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.isQuery')" min-width="5%">
                <template #default="scope">
                  <el-checkbox true-value="1" false-value="0" v-model="scope.row.isQuery"></el-checkbox>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.queryType')" min-width="10%">
                <template #default="scope">
                  <el-select v-model="scope.row.queryType">
                    <el-option label="=" value="EQ" />
                    <el-option label="!=" value="NE" />
                    <el-option label=">" value="GT" />
                    <el-option label=">=" value="GTE" />
                    <el-option label="<" value="LT" />
                    <el-option label="<=" value="LTE" />
                    <el-option label="LIKE" value="LIKE" />
                    <el-option label="BETWEEN" value="BETWEEN" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.isRequired')" min-width="5%">
                <template #default="scope">
                  <el-checkbox true-value="1" false-value="0" v-model="scope.row.isRequired"></el-checkbox>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.htmlType')" min-width="12%">
                <template #default="scope">
                  <el-select v-model="scope.row.htmlType">
                    <el-option :label="t('gen.editTable.htmlType.input')" value="input" />
                    <el-option :label="t('gen.editTable.htmlType.textarea')" value="textarea" />
                    <el-option :label="t('gen.editTable.htmlType.select')" value="select" />
                    <el-option :label="t('gen.editTable.htmlType.radio')" value="radio" />
                    <el-option :label="t('gen.editTable.htmlType.checkbox')" value="checkbox" />
                    <el-option :label="t('gen.editTable.htmlType.datetime')" value="datetime" />
                    <el-option :label="t('gen.editTable.htmlType.imageUpload')" value="imageUpload" />
                    <el-option :label="t('gen.editTable.htmlType.fileUpload')" value="fileUpload" />
                    <el-option :label="t('gen.editTable.htmlType.editor')" value="editor" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('gen.editTable.column.dictType')" min-width="12%">
                <template #default="scope">
                  <el-select
                    v-model="scope.row.dictType"
                    clearable
                    filterable
                    :placeholder="t('common.form.selectPlaceholder')"
                  >
                    <el-option
                      v-for="dict in dictOptions"
                      :key="dict.dictType"
                      :label="dict.dictName"
                      :value="dict.dictType"
                    >
                      <div class="flex w-full items-center justify-between gap-3">
                        <span>{{ dict.dictName }}</span>
                        <span class="shrink-0 text-[13px] text-[var(--el-text-color-secondary)]">
                          {{ dict.dictType }}
                        </span>
                      </div>
                    </el-option>
                  </el-select>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty :description="t('common.empty')" />
              </template>
            </el-table>
          </div>
        </Transition>
      </el-tab-pane>
      <el-tab-pane :label="t('gen.editTable.tabGenInfo')" name="genInfo">
        <Transition mode="out-in" name="fade-slide">
          <div :key="activeName">
            <gen-info-form ref="genInfo" :info="info" :tables="tables" />
          </div>
        </Transition>
      </el-tab-pane>
    </el-tabs>
    <el-form label-width="100px">
      <div style="text-align: center; margin-left: -100px; margin-top: 10px">
        <el-button type="primary" :loading="submitLoading" @click="submitForm()">{{ t('common.submit') }}</el-button>
        <el-button @click="close()">{{ t('common.back') }}</el-button>
      </div>
    </el-form>
  </el-card>
</template>

<script setup lang="ts" name="GenEdit">
const { t } = useI18n()
import { getGenTable, updateGenTable } from '@/api/tool/gen'
import { optionselect as getDictOptionselect } from '@/api/system/dict/type'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import type { FormInstance } from 'element-plus'
import type { GenTable, GenTableColumn, GenTableInfoResult } from '@/types/api/tool/gen'
import type { SysDictType } from '@/types/api/system/dict'
import BasicInfoForm from './basicInfoForm.vue'
import GenInfoForm from './genInfoForm.vue'
import Sortable from 'sortablejs'

const route = useRoute()
const basicInfoRef = useTemplateRef('basicInfo')
const genInfoRef = useTemplateRef('genInfo')
const dragTableRef = useTemplateRef('dragTable')

const activeName = ref<string>('columnInfo')
const submitLoading = ref(false)
// H3: 使用 window.innerHeight（视口高度）而非 document.documentElement.scrollHeight（文档总高度），
// 后者在内容超出视口时会随内容增长，导致表格高度异常膨胀
const calcTableHeight = (): string => window.innerHeight - 245 + 'px'
const tableHeight = ref<string>(calcTableHeight())
function handleResize(): void {
  tableHeight.value = calcTableHeight()
}
const tables = ref<GenTable[]>([])
const columns = ref<GenTableColumn[]>([])
const dictOptions = ref<SysDictType[]>([])
const info = ref<Record<string, unknown>>({})

/** 提交按钮 */
async function submitForm(): Promise<void> {
  // FE-003：通过 defineExpose 暴露的 ref 直接访问，替代 .$refs 中转
  // G7 ②：切换 tab 后对应子表单的 ref 可能尚未挂载，先 nextTick 确保已激活 tab 的 ref 就绪
  await nextTick()
  const basicForm = basicInfoRef.value?.basicInfoFormRef
  const genForm = genInfoRef.value?.genInfoFormRef
  submitLoading.value = true
  Promise.all([basicForm, genForm].map(getFormPromise))
    .then((res) => {
      const validateResult = res.every((item) => !!item)
      if (validateResult) {
        const genTable = structuredClone(info.value) as unknown as GenTable
        genTable.columns = columns.value
        genTable.params = {
          genView: info.value.view ? '1' : '0',
          treeCode: info.value.treeCode,
          treeName: info.value.treeName,
          treeParentCode: info.value.treeParentCode,
          parentMenuId: info.value.parentMenuId
        }
        updateGenTable(genTable)
          .then((res) => {
            if (res.code === 200) {
              modal.msgSuccess(res.msg)
              close()
            } else {
              modal.msgError(res.msg)
            }
          })
          // M3: 明确提示用户保存失败，避免静默吞错
          .catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to save table config:', e)
            modal.msgError(t('common.failed'))
          })
      } else {
        modal.msgError(t('common.formValidationFailed'))
      }
    })
    // M3: 表单校验异常不应静默
    .catch((e) => {
      if (import.meta.env.DEV) console.error('Form validation error:', e)
    })
    .finally(() => {
      submitLoading.value = false
    })
}

function getFormPromise(form: FormInstance | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    if (!form) {
      resolve(false)
      return
    }
    form.validate((res: boolean) => {
      resolve(res)
    })
  })
}

function close(): void {
  const obj = { path: '/tool/gen', query: { t: Date.now(), pageNum: route.query.pageNum } }
  tab.closeOpenPage(obj)
}

// M5: 改用 onMounted 确保在组件挂载生命周期内执行，而非 setup 同步阶段
onMounted(() => {
  const tableId = route.params && route.params.tableId
  if (tableId) {
    // 获取表详细信息
    getGenTable(Number(tableId))
      .then((res) => {
        const data = res.data as GenTableInfoResult
        columns.value = data.rows
        info.value = data.info as unknown as Record<string, unknown>
        tables.value = data.tables
      })
      // M3: 加载表信息失败需提示用户，否则页面空白无反馈
      .catch((e) => {
        if (import.meta.env.DEV) console.error('Failed to load table detail:', e)
        modal.msgError(t('common.failed'))
      })
    /** 查询字典下拉列表 */
    getDictOptionselect()
      .then((response) => {
        dictOptions.value = response.data
      })
      // M3: 字典选项加载失败不影响主流程，仅记录日志
      .catch((e) => {
        if (import.meta.env.DEV) console.error('Failed to load dict options:', e)
      })
  }
})

// 拖动排序
let sortableInstance: InstanceType<typeof Sortable> | null = null

/** 在 el-table tbody 上创建 Sortable 实例（activeName 切换后 el-table 重新挂载，需重新创建） */
function createSortable(): void {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
  const element = (dragTableRef.value?.$el as HTMLElement | undefined)?.querySelector('.el-table__body > tbody')
  if (element) {
    sortableInstance = Sortable.create(element as HTMLElement, {
      //@ts-expect-error Sortable options type is incomplete
      handle: '.allowDrag',
      animation: 200,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      ghostClass: 'sortable-ghost-class',
      chosenClass: 'sortable-chosen-class',
      onEnd: (evt) => {
        const targetRow = columns.value.splice(evt.oldIndex!, 1)[0]
        columns.value.splice(evt.newIndex!, 0, targetRow)
        for (const [index, col] of columns.value.entries()) {
          col.sort = index + 1
        }
      }
    })
  }
}

// activeName 切换回 columnInfo 时 el-table 重新挂载，需重新绑定 Sortable 实例
watch(activeName, (val: string) => {
  if (val === 'columnInfo') {
    nextTick(createSortable)
  }
})

onMounted(() => {
  createSortable()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
:deep(.sortable-ghost-class) {
  opacity: 0.5;
  background: var(--el-color-primary-light-9);
}

:deep(.sortable-chosen-class) {
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

/* 修复 el-table 内 el-select / el-input 在窄列下文本溢出（el-select__placeholder 文本超出列宽） */
:deep(.el-table) {
  .el-select,
  .el-input,
  .el-date-editor {
    width: 100%;
  }

  .el-select__placeholder {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .el-select__selected-item,
  .el-select__placeholder {
    span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
      vertical-align: middle;
    }
  }

  /* el-input 内容溢出 */
  .el-input__inner {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
