<template>
  <div class="container">
    <!-- D8 真机核查修复：三栏设计工具（组件面板/画布/属性面板）在手机档无降级空间，
         逐层叠压不可用——明确告知用户使用平板横屏或桌面端（能力不砍，体验如实提示） -->
    <el-alert
      v-if="device === 'mobile'"
      class="build-mobile-tip m-3"
      type="warning"
      :closable="false"
      show-icon
      :title="t('build.mobileTip')"
    />
    <div class="left-board">
      <div class="logo-wrapper">
        <div class="logo">
          <img :src="logo" alt="logo" loading="lazy" />
          Form Generator
        </div>
      </div>
      <el-scrollbar class="left-scrollbar">
        <div class="components-list">
          <div class="components-title">
            <svg-icon icon-class="component" />
            {{ t('build.rightPanel.tagGroup.input') }}
          </div>
          <draggable
            class="components-draggable"
            :list="inputComponents"
            :group="{ name: 'componentsGroup', pull: 'clone', put: false }"
            :clone="cloneComponent"
            draggable=".components-item"
            :sort="false"
            @end="onEnd"
            item-key="label"
          >
            <template #item="{ element }">
              <div :key="element.label" class="components-item" @click="addComponent(element)">
                <div class="components-body">
                  <svg-icon :icon-class="element.tagIcon" />
                  {{ element.label }}
                </div>
              </div>
            </template>
          </draggable>
          <div class="components-title">
            <svg-icon icon-class="component" />
            {{ t('build.rightPanel.tagGroup.select') }}
          </div>
          <draggable
            class="components-draggable"
            :list="selectComponents"
            :group="{ name: 'componentsGroup', pull: 'clone', put: false }"
            :clone="cloneComponent"
            draggable=".components-item"
            :sort="false"
            @end="onEnd"
            item-key="label"
          >
            <template #item="{ element }">
              <div :key="element.label" class="components-item" @click="addComponent(element)">
                <div class="components-body">
                  <svg-icon :icon-class="element.tagIcon" />
                  {{ element.label }}
                </div>
              </div>
            </template>
          </draggable>
          <div class="components-title">
            <svg-icon icon-class="component" />
            {{ t('build.layoutComponents') }}
          </div>
          <draggable
            class="components-draggable"
            :list="layoutComponents"
            :group="{ name: 'componentsGroup', pull: 'clone', put: false }"
            :clone="cloneComponent"
            draggable=".components-item"
            :sort="false"
            @end="onEnd"
            item-key="label"
          >
            <template #item="{ element }">
              <div :key="element.label" class="components-item" @click="addComponent(element)">
                <div class="components-body">
                  <svg-icon :icon-class="element.tagIcon" />
                  {{ element.label }}
                </div>
              </div>
            </template>
          </draggable>
        </div>
      </el-scrollbar>
    </div>
    <div class="center-board">
      <div class="action-bar">
        <el-button v-hasPermi="['tool:build:export']" icon="Download" type="primary" text @click="download">
          {{ t('build.exportVue') }}
        </el-button>
        <el-button
          v-hasPermi="['tool:build:copy']"
          class="copy-btn-main"
          icon="DocumentCopy"
          type="primary"
          text
          @click="copy"
        >
          {{ t('build.copyCode') }}
        </el-button>
        <el-button v-hasPermi="['tool:build:clear']" class="delete-btn" icon="Delete" text @click="empty" type="danger">
          {{ t('common.clear') }}
        </el-button>
      </div>
      <el-scrollbar class="center-scrollbar">
        <el-row class="center-board-row" :gutter="formConf.gutter">
          <el-form
            :size="formConf.size"
            :label-position="formConf.labelPosition"
            :disabled="formConf.disabled"
            :label-width="formConf.labelWidth + 'px'"
          >
            <draggable
              class="drawing-board"
              :list="drawingList"
              :animation="340"
              group="componentsGroup"
              item-key="label"
            >
              <template #item="{ element, index }">
                <draggable-item
                  :key="element.renderKey"
                  :drawing-list="drawingList"
                  :element="element"
                  :index="index"
                  :active-id="activeId"
                  :form-conf="formConf"
                  @activeItem="activeFormItem"
                  @copyItem="drawingItemCopy"
                  @deleteItem="drawingItemDelete"
                />
              </template>
            </draggable>
            <Transition name="fade">
              <div v-if="!drawingList.length" class="empty-info">
                {{ t('build.emptyTip') }}
              </div>
            </Transition>
          </el-form>
        </el-row>
      </el-scrollbar>
    </div>
    <right-panel
      v-model:id-global="idGlobal"
      :active-data="activeData"
      :form-conf="formConf"
      :show-field="!!drawingList.length"
      @tag-change="tagChange"
    />

    <code-type-dialog
      v-model="dialogVisible"
      :title="t('build.codeTypeDialog.title')"
      :showFileName="showFileName"
      @confirm="generate"
    />
  </div>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
// 表单构建器主页面：drawingList/activeData 等结构由用户拖拽配置动态决定，类型无法静态约束
const { t } = useI18n()
import useAppStore from '@/store/modules/app'
import draggable from 'vuedraggable'

const appStore = useAppStore()
const device = computed(() => appStore.device)
//@ts-expect-error js-beautify 默认导出类型缺失
import beautifier from 'js-beautify'
import logo from '@/assets/logo/logo.svg'
import { inputComponents, selectComponents, layoutComponents, formConf as formConfData } from '@/utils/generator/config'
import { beautifierConf } from '@/utils/index'
import {
  drawingDefaultValue,
  initDrawingDefaultValue,
  cleanDrawingDefaultValue
} from '@/utils/generator/drawingDefault'
import { makeUpHtml, vueTemplate, vueScript, cssStyle } from '@/utils/generator/html'
import { makeUpJs } from '@/utils/generator/js'
import { makeUpCss } from '@/utils/generator/css'
import Download from '@/plugins/download'
import modal from '@/plugins/modal'
import { ElNotification } from 'element-plus'
import DraggableItem from './DraggableItem.vue'
import RightPanel from './RightPanel.vue'
import CodeTypeDialog from './CodeTypeDialog.vue'

initDrawingDefaultValue()

const drawingList = ref<any[]>(drawingDefaultValue)
const dialogVisible = ref<boolean>(false)
const showFileName = ref<boolean>(false)
const operationType = ref<string>('')
const idGlobal = ref<number>(100)
const activeData = ref<any>(drawingDefaultValue[0])
const activeId = ref<number>(drawingDefaultValue[0].formId)
const generateConf = ref<any | null>(null)
const formData = ref<FormData>({} as FormData)
const formConf = ref<any>(formConfData)
let oldActiveId: number | undefined
let tempActiveData: any = undefined

function activeFormItem(element: any): void {
  activeData.value = element
  activeId.value = element.formId
}
function copy(): void {
  dialogVisible.value = true
  showFileName.value = false
  operationType.value = 'copy'
}
function download(): void {
  dialogVisible.value = true
  showFileName.value = true
  operationType.value = 'download'
}
function empty(): void {
  modal
    .confirm(t('build.confirmClear'))
    .then(() => {
      idGlobal.value = 100
      drawingList.value = []
      cleanDrawingDefaultValue()
    })
    .catch((e: unknown) => {
      // P2 修复: 仅忽略用户取消，其他异常打印日志避免静默吞错
      if (e !== 'cancel' && e !== 'close') {
        if (import.meta.env.DEV) console.error('[build/empty]', e)
      }
    })
}

function onEnd(obj: any): void {
  if (obj.from !== obj.to) {
    activeData.value = tempActiveData
    activeId.value = idGlobal.value
  }
}

function addComponent(item: any): void {
  const clone = cloneComponent(item)
  drawingList.value.push(clone)
  activeFormItem(clone)
}

function cloneComponent(origin: any): any {
  const clone = JSON.parse(JSON.stringify(origin)) as any
  clone.formId = ++idGlobal.value
  clone.span = formConf.value.span
  clone.renderKey = +new Date() // 改变renderKey后可以实现强制更新组件
  if (!clone.layout) clone.layout = 'colFormItem'
  if (clone.layout === 'colFormItem') {
    clone.vModel = `field${idGlobal.value}`
    if (clone.placeholder !== undefined) {
      clone.placeholder += clone.label
    }
    tempActiveData = clone
  } else if (clone.layout === 'rowFormItem') {
    delete clone.label
    clone.componentName = `row${idGlobal.value}`
    clone.gutter = formConf.value.gutter
    tempActiveData = clone
  }
  return tempActiveData
}

function drawingItemCopy(item: any, parent: any[]): void {
  let clone = JSON.parse(JSON.stringify(item))
  clone = createIdAndKey(clone)
  parent.push(clone)
  activeFormItem(clone)
}

function createIdAndKey(item: any): any {
  item.formId = ++idGlobal.value
  item.renderKey = +new Date()
  if (item.layout === 'colFormItem') {
    item.vModel = `field${idGlobal.value}`
  } else if (item.layout === 'rowFormItem') {
    item.componentName = `row${idGlobal.value}`
  }
  if (Array.isArray(item.children)) {
    item.children = item.children.map((childItem: any) => createIdAndKey(childItem))
  }
  return item
}

function drawingItemDelete(index: number, parent: any[]): void {
  parent.splice(index, 1)
  nextTick(() => {
    const len = drawingList.value.length
    if (len) {
      // 删除中间项时选中前一项；删除首项时选中新的首项；删除末项时选中新的末项
      const newIdx = Math.max(0, Math.min(index - 1, len - 1))
      activeFormItem(drawingList.value[newIdx])
    }
  })
}

function tagChange(newTag: any): void {
  const clonedTag = cloneComponent(newTag)
  clonedTag.vModel = activeData.value.vModel
  clonedTag.formId = activeId.value
  clonedTag.span = activeData.value.span
  delete activeData.value.tag
  delete activeData.value.tagIcon
  delete activeData.value.document
  Object.keys(clonedTag).forEach((key) => {
    if (activeData.value[key] !== undefined && typeof activeData.value[key] === typeof clonedTag[key]) {
      clonedTag[key] = activeData.value[key]
    }
  })
  activeData.value = clonedTag
  updateDrawingList(clonedTag, drawingList.value)
}

function updateDrawingList(newTag: any, list: any[]): void {
  const index = list.findIndex((item) => item.formId === activeId.value)
  if (index > -1) {
    list.splice(index, 1, newTag)
  } else {
    list.forEach((item) => {
      if (Array.isArray(item.children)) updateDrawingList(newTag, item.children)
    })
  }
}
function generate(data: any): void {
  generateConf.value = data
  nextTick(() => {
    switch (operationType.value) {
      case 'copy':
        execCopy()
        break
      case 'download':
        execDownload(data)
        break
      default:
        break
    }
  })
}

function execDownload(data: any): void {
  const codeStr = generateCode()
  const blob = new Blob([codeStr], { type: 'text/plain;charset=utf-8' })
  Download.saveAs(blob, data.fileName!)
}

async function execCopy(): Promise<void> {
  const codeStr = generateCode()
  try {
    await navigator.clipboard.writeText(codeStr)
    ElNotification({ title: t('common.successStatus'), message: t('build.copyCodeSuccess'), type: 'success' })
  } catch {
    modal.msgError(t('build.copyCodeFail'))
  }
}
function AssembleFormData(): void {
  formData.value = { fields: JSON.parse(JSON.stringify(drawingList.value)), ...formConf.value }
}
function generateCode(): string {
  if (!generateConf.value) return ''
  const { type } = generateConf.value
  AssembleFormData()
  const script = vueScript(makeUpJs(formData.value, type))
  const html = vueTemplate(makeUpHtml(formData.value, type))
  const css = cssStyle(makeUpCss(formData.value))
  // P2 修复: beautifier 调用包裹 try/catch，避免模板渲染失败导致 copy/download 无反馈
  try {
    return beautifier.html(html + script + css, beautifierConf.html)
  } catch (e) {
    if (import.meta.env.DEV) console.error('[build/generateCode] beautifier failed:', e)
    return html + script + css
  }
}
watch(
  () => activeData.value.label,
  (val: string, oldVal: string) => {
    if (activeData.value.placeholder === undefined || !activeData.value.tag || oldActiveId !== activeId.value) {
      return
    }
    activeData.value.placeholder = activeData.value.placeholder.replace(oldVal, '') + val
  }
)
watch(
  activeId,
  (val: number) => {
    oldActiveId = val
  },
  { immediate: true }
)
</script>

<style lang="scss">
$lighterBlue: var(--el-color-primary);

.container {
  position: relative;
  width: 100%;
  background-color: var(--el-bg-color-overlay);
  height: calc(100vh - 50px - 40px);
  overflow: hidden;

  .left-board {
    width: 260px;
    position: absolute;
    left: 0;
    top: 0;
    height: calc(100vh - 50px - 40px);

    .logo-wrapper {
      position: relative;
      height: 42px;
      border-bottom: 1px solid var(--el-border-color-extra-light);
      box-sizing: border-box;

      .logo {
        position: absolute;
        left: 12px;
        top: 6px;
        line-height: 30px;
        color: var(--el-color-primary);
        font-weight: 600;
        font-size: 17px;
        white-space: nowrap;

        > img {
          width: 30px;
          height: 30px;
          vertical-align: top;
        }

        .github {
          display: inline-block;
          vertical-align: sub;
          margin-left: 15px;

          > img {
            height: 22px;
          }
        }
      }
    }

    .left-scrollbar {
      .el-scrollbar__wrap {
        box-sizing: border-box;
        overflow-x: hidden !important;
        margin-bottom: 0 !important;

        .components-list {
          padding: 8px;
          box-sizing: border-box;
          height: 100%;

          .components-title {
            font-size: 14px;
            // color: #222;
            margin: 6px 2px;

            .svg-icon {
              // color: #666;
              font-size: 18px;
              margin-right: 5px;
            }
          }

          .components-draggable {
            padding-bottom: 20px;

            .components-item {
              display: inline-block;
              width: 48%;
              margin: 1%;

              .components-body {
                padding: 8px 10px;
                background: var(--el-border-color-extra-light);
                font-size: 12px;
                cursor: move;
                border: 1px dashed var(--el-border-color-extra-light);
                border-radius: 3px;

                .svg-icon {
                  // color: #777;
                  font-size: 15px;
                  margin-right: 5px;
                }

                &:hover {
                  border: 1px dashed var(--el-color-primary);
                  color: var(--el-color-primary);

                  .svg-icon {
                    color: var(--el-color-primary);
                  }
                }
              }
            }

            .components-item.sortable-ghost,
            .components-item.sortable-chosen {
              transition: transform 0ms !important;
            }
          }
        }
      }
    }
  }

  .center-board {
    height: calc(100vh - 50px - 40px);
    width: auto;
    margin: 0 350px 0 260px;
    box-sizing: border-box;

    .action-bar {
      position: relative;
      height: 42px;
      padding: 0 15px;
      box-sizing: border-box;
      border: 1px solid var(--el-border-color-extra-light);
      border-top: none;
      border-left: none;
      display: flex;
      align-items: center;
      justify-content: flex-end;

      .delete-btn {
        color: var(--el-color-danger);
      }
    }

    .center-scrollbar {
      height: calc(100vh - 50px - 40px - 42px);
      overflow: hidden;
      border-left: 1px solid var(--el-border-color-extra-light);
      border-right: 1px solid var(--el-border-color-extra-light);
      box-sizing: border-box;

      .el-scrollbar__view {
        overflow-x: hidden;
      }

      .center-board-row {
        padding: 12px 12px 15px 12px;
        box-sizing: border-box;

        & > .el-form {
          // 69 = 12+15+42
          height: calc(100vh - 50px - 40px - 69px);
          flex: 1;

          .drawing-board {
            height: 100%;
            position: relative;

            .components-body {
              padding: 0;
              margin: 0;
              font-size: 0;
            }

            .sortable-ghost {
              position: relative;
              display: block;
              overflow: hidden;

              &::before {
                content: ' ';
                position: absolute;
                left: 0;
                right: 0;
                top: 0;
                height: 3px;
                background: var(--el-color-primary);
                z-index: 2;
              }
            }

            .components-item.sortable-ghost {
              width: 100%;
              height: 60px;
              background: var(--el-border-color-extra-light);
            }

            .active-from-item {
              & > .el-form-item {
                background: var(--el-border-color-extra-light);
                border-radius: 6px;
                transition:
                  background-color 0.25s ease,
                  border-color 0.25s ease,
                  box-shadow 0.25s ease;
              }

              & > .drawing-item-copy,
              & > .drawing-item-delete {
                opacity: 1;
                visibility: visible;
                transform: scale(1);
              }

              & > .component-name {
                color: $lighterBlue;
              }

              .el-input__wrapper {
                box-shadow: 0 0 0 1px var(--el-input-hover-border-color) inset;
              }
            }

            .el-form-item {
              margin-bottom: 15px;
            }
          }

          .drawing-item {
            position: relative;
            cursor: move;

            &.unfocus-bordered:not(.activeFromItem) > div:first-child {
              border: 1px dashed var(--el-border-color);
            }

            .el-form-item {
              padding: 12px 10px;
            }
          }

          .drawing-row-item {
            position: relative;
            cursor: move;
            box-sizing: border-box;
            border: 1px dashed var(--el-border-color);
            border-radius: 3px;
            padding: 0 2px;
            margin-bottom: 15px;

            .drawing-row-item {
              margin-bottom: 2px;
            }

            .el-col {
              margin-top: 22px;
            }

            .el-form-item {
              margin-bottom: 0;
            }

            .drag-wrapper {
              min-height: 80px;
              flex: 1;
              display: flex;
              flex-wrap: wrap;
            }

            &.active-from-item {
              border: 1px dashed $lighterBlue;
            }

            .component-name {
              position: absolute;
              top: 0;
              left: 0;
              font-size: 12px;
              color: var(--el-text-color-placeholder);
              display: inline-block;
              padding: 0 6px;
            }
          }

          .drawing-item,
          .drawing-row-item {
            &:hover {
              & > .el-form-item {
                background: var(--el-border-color-extra-light);
                border-radius: 6px;
              }

              & > .drawing-item-copy,
              & > .drawing-item-delete {
                opacity: 1;
                visibility: visible;
                transform: scale(1);
              }
            }

            & > .drawing-item-copy,
            & > .drawing-item-delete {
              opacity: 0;
              visibility: hidden;
              transform: scale(0.8);
              transition:
                opacity 0.2s ease,
                transform 0.2s ease,
                background-color 0.2s ease,
                color 0.2s ease;
              position: absolute;
              top: -10px;
              width: 22px;
              height: 22px;
              line-height: 22px;
              text-align: center;
              border-radius: 50%;
              font-size: 12px;
              border: 1px solid;
              cursor: pointer;
              z-index: 1;
            }

            & > .drawing-item-copy {
              right: 56px;
              border-color: $lighterBlue;
              color: $lighterBlue;
              background: var(--el-bg-color);

              &:hover {
                background: $lighterBlue;
                color: var(--el-color-white);
                transform: scale(1.1);
              }
            }

            & > .drawing-item-delete {
              right: 24px;
              border-color: var(--el-color-danger);
              color: var(--el-color-danger);
              background: var(--el-bg-color);

              &:hover {
                background: var(--el-color-danger);
                color: var(--el-color-white);
                transform: scale(1.1);
              }
            }
          }

          .empty-info {
            position: absolute;
            top: 46%;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 18px;
            color: var(--el-color-primary-light-5);
            letter-spacing: 4px;
          }
        }
      }
    }
  }
}
</style>
