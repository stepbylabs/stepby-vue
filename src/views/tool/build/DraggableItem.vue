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
    <span class="drawing-item-copy" :title="t('common.copy')" @click.stop="copyItem(element)">
      <el-icon><CopyDocument /></el-icon>
    </span>
    <span class="drawing-item-delete" :title="t('common.delete')" @click.stop="deleteItem(index)">
      <el-icon><Delete /></el-icon>
    </span>
  </el-col>
</template>
<script setup lang="ts" name="DraggableItem">
/* eslint-disable @typescript-eslint/no-explicit-any */
// 表单构建器拖拽项：动态组件渲染，element/clonedData 等结构由配置决定，类型无法静态约束
const { t } = useI18n()
import draggable from 'vuedraggable'
import render from '@/utils/generator/render'

const props = defineProps({
  element: Object,
  index: Number,
  drawingList: Array,
  activeId: {
    type: [String, Number]
  },
  formConf: Object
})
const className = ref('')
const draggableItemRef = useTemplateRef('draggableItemRef')
const emits = defineEmits(['activeItem', 'copyItem', 'deleteItem'])

function activeItem(item: any): void {
  emits('activeItem', item)
}
function copyItem(item: any, parent?: any[]): void {
  emits('copyItem', item, parent ?? props.drawingList)
}
function deleteItem(item: number | any, parent?: any[]): void {
  emits('deleteItem', item, parent ?? props.drawingList)
}

function getComponentData(): Record<string, any> {
  return {
    gutter: props.element.gutter,
    justify: props.element.justify,
    align: props.element.align
  }
}

watch(
  () => props.activeId,
  (val: string) => {
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
