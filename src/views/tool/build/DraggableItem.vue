<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <el-col :span="element.span" :class="className" @click.stop="activeItem(element)">
    <Transition mode="out-in" name="fade">
      <el-form-item
        :label="element.label"
        :label-width="element.labelWidth ? element.labelWidth + 'px' : null"
        :required="element.required"
        v-if="element.layout === 'colFormItem'"
        key="col"
      >
        <render :key="element.tag" :conf="element" v-model="element.defaultValue" />
      </el-form-item>
      <el-row :gutter="element.gutter" :class="element.class" @click.stop="activeItem(element)" v-else key="row">
        <span class="component-name">{{ element.componentName }}</span>
        <draggable
          group="componentsGroup"
          :animation="340"
          :list="element.children"
          class="drag-wrapper"
          item-key="label"
          ref="draggableItemRef"
          :component-data="getComponentData()"
        >
          <template #item="scoped">
            <draggable-item
              :key="scoped.element.renderKey"
              :drawing-list="element.children"
              :element="scoped.element"
              :index="scoped.index"
              :active-id="activeId"
              :form-conf="formConf"
              @activeItem="activeItem(scoped.element)"
              @copyItem="copyItem(scoped.element, element.children)"
              @deleteItem="deleteItem(scoped.index, element.children)"
            />
          </template>
        </draggable>
      </el-row>
    </Transition>
    <span
      class="drawing-item-copy"
      role="button"
      tabindex="0"
      :aria-label="t('common.copy')"
      :title="t('common.copy')"
      @click.stop="copyItem(element)"
      @keydown.enter.stop.prevent="copyItem(element)"
      @keydown.space.stop.prevent="copyItem(element)"
    >
      <el-icon><CopyDocument /></el-icon>
    </span>
    <span
      class="drawing-item-delete"
      role="button"
      tabindex="0"
      :aria-label="t('common.delete')"
      :title="t('common.delete')"
      @click.stop="deleteItem(index)"
      @keydown.enter.stop.prevent="deleteItem(index)"
      @keydown.space.stop.prevent="deleteItem(index)"
    >
      <el-icon><Delete /></el-icon>
    </span>
  </el-col>
</template>
<script setup lang="ts" name="DraggableItem">
// 表单构建器拖拽项：element/children 用 BuildNodeData 最小约束（动态字段经索引签名放行）
const { t } = useI18n()
import draggable from 'vuedraggable'
import render from '@/utils/generator/render'
import type { BuildFormConf, BuildNodeData } from './types'

const props = defineProps<{
  element: BuildNodeData
  index: number
  drawingList: BuildNodeData[]
  activeId: string | number
  formConf: BuildFormConf
}>()
const className = ref('')
const draggableItemRef = useTemplateRef('draggableItemRef')
const emits = defineEmits(['activeItem', 'copyItem', 'deleteItem'])

function activeItem(item: BuildNodeData): void {
  emits('activeItem', item)
}
function copyItem(item: BuildNodeData, parent?: BuildNodeData[]): void {
  emits('copyItem', item, parent ?? props.drawingList)
}
function deleteItem(item: number, parent?: BuildNodeData[]): void {
  emits('deleteItem', item, parent ?? props.drawingList)
}

function getComponentData(): Record<string, unknown> {
  return {
    gutter: props.element.gutter,
    justify: props.element.justify,
    align: props.element.align
  }
}

watch(
  () => props.activeId,
  (val: string | number) => {
    className.value =
      (props.element.layout === 'rowFormItem' ? 'drawing-row-item' : 'drawing-item') +
      (val === props.element.formId ? ' active-from-item' : '')
    if (props.formConf.unFocusedComponentBorder) {
      className.value += ' unfocus-bordered'
    }
  },
  { immediate: true }
)
</script>
