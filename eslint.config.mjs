// eslint.config.mjs
// ESLint 9 Flat Config（P1-22）
// 配合 Prettier 使用，ESLint 负责代码质量/语法检查，Prettier 负责代码格式化
import js from '@eslint/js'
import vuePlugin from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

// unplugin-auto-import 注入的全局符号（仅声明常用部分，避免 no-undef 误报）
const autoImportGlobals = {
  globals: {
    // Vue Composition API
    ref: 'readonly',
    shallowRef: 'readonly',
    triggerRef: 'readonly',
    customRef: 'readonly',
    reactive: 'readonly',
    readonly: 'readonly',
    computed: 'readonly',
    watch: 'readonly',
    watchEffect: 'readonly',
    watchPostEffect: 'readonly',
    watchSyncEffect: 'readonly',
    isRef: 'readonly',
    unref: 'readonly',
    toRef: 'readonly',
    toRefs: 'readonly',
    toValue: 'readonly',
    isReactive: 'readonly',
    isReadonly: 'readonly',
    isProxy: 'readonly',
    markRaw: 'readonly',
    nextTick: 'readonly',
    onMounted: 'readonly',
    onUpdated: 'readonly',
    onUnmounted: 'readonly',
    onBeforeMount: 'readonly',
    onBeforeUpdate: 'readonly',
    onBeforeUnmount: 'readonly',
    onErrorCaptured: 'readonly',
    onActivated: 'readonly',
    onDeactivated: 'readonly',
    onScopeDispose: 'readonly',
    // Vue Router
    useRoute: 'readonly',
    useRouter: 'readonly',
    // Vue component instance helpers
    resolveComponent: 'readonly',
    resolveDirective: 'readonly',
    getCurrentInstance: 'readonly',
    h: 'readonly',
    // Pinia
    defineStore: 'readonly',
    storeToRefs: 'readonly',
    // Vue 3.5 useTemplateRef
    useTemplateRef: 'readonly',
    // Vue 3.5 reactive destructuring helpers
    useId: 'readonly',
    useModel: 'readonly',
    useSlots: 'readonly',
    useAttrs: 'readonly',
    useCssModule: 'readonly',
    // Vue Compiler Macros
    defineProps: 'readonly',
    defineEmits: 'readonly',
    defineExpose: 'readonly',
    defineOptions: 'readonly',
    defineSlots: 'readonly',
    withDefaults: 'readonly'
  }
}

export default [
  // 全局忽略
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'src/types/api/generated/**', '*.config.{js,ts,mjs,cjs}']
  },

  // JS 基础规则
  js.configs.recommended,

  // TypeScript 规则
  ...tseslint.configs.recommended,

  // Vue 3 规则（flat/essential 仅启用错误级别规则，不含格式化规则，避免与 Prettier 冲突）
  ...vuePlugin.configs['flat/essential'],

  // Vue + TypeScript 文件：解析器配置 + auto-import 全局符号
  {
    files: ['**/*.vue', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      },
      ...autoImportGlobals
    }
  },

  // JS 文件：仅声明 auto-import 全局符号（不强制 TS 解析器）
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ...autoImportGlobals
    }
  },

  // 全 JS/TS/Vue 文件：TypeScript 已通过类型检查处理未定义变量，no-undef 会误报 auto-import
  {
    files: ['**/*.{ts,tsx,vue,js,mjs,cjs}'],
    rules: {
      'no-undef': 'off'
    }
  },

  // 项目自定义规则
  {
    files: ['**/*.{ts,tsx,vue,js,mjs,cjs}'],
    rules: {
      // 与 Prettier 冲突的格式化规则关闭
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 允许 console.warn/console.error（生产环境需要）
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Vue 3 相关
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/require-default-prop': 'off',
      'vue/no-mutating-props': 'warn',
      // 以下规则在既有代码库存在历史遗留问题，降级为 warn 以便渐进式修复，
      // 同时在 IDE 中保留可见性，避免新代码引入同样问题
      'vue/require-valid-default-prop': 'warn',
      'vue/valid-define-emits': 'warn',
      'vue/no-dupe-keys': 'warn',
      'vue/no-ref-as-operand': 'warn',
      'vue/prefer-import-from-vue': 'warn',
      'vue/no-unused-vars': 'warn',
      'vue/no-async-in-computed-properties': 'warn',
      // TypeScript 相关
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // 既有代码遗留的 ts-comment/no-unused-labels/no-prototype-builtins 降级为 warn
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-unused-labels': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn'
    }
  },

  // E2E 测试脚本专用规则：测试工具场景下的合法模式
  // - no-console：脚本需打印进度/结果，使用 console 是合理的
  // - no-empty allowEmptyCatch：catch(//) 忽略预期异常（控件未出现等）用于重试
  // - no-constant-condition checkLoops:false：允许 while(true)/do-while 轮询等待
  // - @typescript-eslint/no-unused-vars = off：运行脚本含大量"声明后等待/断言用"的辅助
  //   与调试变量（如点击返回值、临时 token、page 参数等），维护价值低且逐处加 `_` 会
  //   降低可读性；同时该规则为 warn 时会把注意力从真实问题引开，故对测试脚本整体关闭。
  {
    files: ['tests/e2e/**/*.mjs'],
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },

  // Prettier 兼容层（必须放在最后）：关闭所有与 Prettier 冲突的格式化规则
  prettierConfig
]
