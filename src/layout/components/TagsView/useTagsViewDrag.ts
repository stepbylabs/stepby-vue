import type { ComputedRef } from 'vue'
import type { View } from '@/store/modules/tagsView'
import useTagsViewStore from '@/store/modules/tagsView'

interface UseTagsViewDragOptions {
  isAffix: (tag: View | Record<string, never>) => boolean
  visitedViews: ComputedRef<View[]>
}

export default function useTagsViewDrag({ isAffix, visitedViews }: UseTagsViewDragOptions) {
  // 拖拽排序状态
  const draggingIdx = ref<number>(-1)
  const dragOverIdx = ref<number>(-1)

  const tagsViewStore = useTagsViewStore()

  function onDragStart(e: DragEvent, idx: number) {
    if (isAffix(visitedViews.value[idx])) {
      e.preventDefault()
      return
    }
    draggingIdx.value = idx
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(idx))
    }
  }

  function onDragOver(e: DragEvent, idx: number) {
    if (draggingIdx.value === -1) return
    if (isAffix(visitedViews.value[idx])) return
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    dragOverIdx.value = idx
  }

  function onDragLeave(idx: number) {
    if (dragOverIdx.value === idx) dragOverIdx.value = -1
  }

  function onDrop(targetIdx: number) {
    if (draggingIdx.value === -1 || draggingIdx.value === targetIdx) {
      onDragEnd()
      return
    }
    if (isAffix(visitedViews.value[targetIdx])) {
      onDragEnd()
      return
    }
    // 调用 store 排序
    tagsViewStore.sortViews(draggingIdx.value, targetIdx)
    onDragEnd()
  }

  function onDragEnd() {
    draggingIdx.value = -1
    dragOverIdx.value = -1
  }

  return {
    draggingIdx,
    dragOverIdx,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd
  }
}
