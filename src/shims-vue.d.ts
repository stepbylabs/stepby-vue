/**
 * vue-tsc 类型解析补丁
 *
 * 问题：vue-tsc 对 vue 模块的 export * 链式解析存在限制。
 * vue/dist/vue.d.ts 通过 `export * from '@vue/runtime-dom'` 重新导出，
 * @vue/runtime-dom 又通过 `export * from '@vue/runtime-core'` 重新导出。
 * vue-tsc 在处理多层 export * 时无法正确传递类型，导致
 * `import { App, createApp, getCurrentInstance } from 'vue'` 报 TS2305 错误。
 *
 * 解决方案：通过 module augmentation 显式补充这些导出，
 * 显式 export 优先于 export *，不会产生重复声明。
 */
export {}

declare module 'vue' {
  // 值导出（运行时 API）
  export {
    createApp,
    getCurrentInstance,
    defineComponent,
    defineAsyncComponent,
    h,
    nextTick,
    onBeforeMount,
    onBeforeUnmount,
    onBeforeUpdate,
    onErrorCaptured,
    onMounted,
    onUnmounted,
    onUpdated,
    onActivated,
    onDeactivated,
    provide,
    inject,
    ref,
    shallowRef,
    triggerRef,
    toRef,
    toValue,
    toRefs,
    unref,
    isRef,
    isProxy,
    isReactive,
    isReadonly,
    isShallow,
    markRaw,
    toRaw,
    reactive,
    shallowReactive,
    readonly,
    shallowReadonly,
    computed,
    customRef,
    watch,
    watchEffect,
    watchPostEffect,
    watchSyncEffect,
    defineExpose,
    defineEmits,
    defineProps,
    defineModel,
    defineOptions,
    defineSlots,
    withDefaults,
    useAttrs,
    useSlots,
    mergeDefaults,
    mergeModels,
    withDirectives,
    resolveComponent,
    resolveDirective,
    getCurrentScope,
    onScopeDispose,
    effectScope,
    effect,
    stop,
    toHandlers,
    warn,
    set,
    del
    // eslint-disable-next-line vue/prefer-import-from-vue
  } from '@vue/runtime-dom'

  // 类型导出
  export type {
    App,
    AppContext,
    Component,
    ComponentPublicInstance,
    ComputedRef,
    Directive,
    DirectiveBinding,
    FunctionalComponent,
    InjectionKey,
    MaybeRef,
    MaybeRefOrGetter,
    Plugin,
    PropType,
    Ref,
    ShallowRef,
    Slots,
    Slot,
    SlotsType,
    UnwrapRef,
    VNode,
    VNodeArrayChildren,
    VNodeProps,
    WatchCallback,
    WatchOptions,
    WatchSource,
    WatchStopHandle,
    WritableComputedRef,
    ComponentOptions,
    ComponentOptionsMixin,
    ComponentProvideOptions,
    ComputedOptions,
    EmitsOptions,
    EmitsToProps,
    ExtractPropTypes,
    ExtractDefaultPropTypes,
    ExtractPublicPropTypes,
    MethodOptions,
    RawSlots,
    SetupContext,
    ShallowUnwrapRef,
    ComponentObjectPropsOptions,
    ConcreteComponent,
    CreateComponentPublicInstance,
    DefineComponent
    // eslint-disable-next-line vue/prefer-import-from-vue
  } from '@vue/runtime-dom'
}
