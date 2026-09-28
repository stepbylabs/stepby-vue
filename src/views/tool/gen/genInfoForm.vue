<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <el-form ref="genInfoForm" :model="info" :rules="rules" label-width="150px">
    <el-row>
      <el-col :span="12">
        <el-form-item prop="tplCategory">
          <template #label>{{ t('gen.genInfo.tplCategory') }}</template>
          <el-select v-model="info.tplCategory" @change="tplSelectChange">
            <el-option :label="t('gen.genInfo.tplCrud')" value="crud" />
            <el-option :label="t('gen.genInfo.tplTree')" value="tree" />
            <el-option :label="t('gen.genInfo.tplSub')" value="sub" />
            <el-option :label="t('gen.genInfo.tplFlow')" value="flow" />
          </el-select>
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="tplWebType">
          <template #label>{{ t('gen.genInfo.tplWebType') }}</template>
          <el-select v-model="info.tplWebType">
            <el-option :label="t('gen.genInfo.tplWebVue2')" value="element-ui" />
            <el-option :label="t('gen.genInfo.tplWebVue3')" value="element-plus" />
            <el-option :label="t('gen.genInfo.tplWebVue3Ts')" value="element-plus-typescript" />
          </el-select>
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="packageName">
          <template #label>
            {{ t('gen.genInfo.packageName') }}
            <el-tooltip :content="t('gen.genInfo.packageNameTip')" placement="top">
              <el-icon><question-filled /></el-icon>
            </el-tooltip>
          </template>
          <el-input v-model="info.packageName" />
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="moduleName">
          <template #label>
            {{ t('gen.genInfo.moduleName') }}
            <el-tooltip :content="t('gen.genInfo.moduleNameTip')" placement="top">
              <el-icon><question-filled /></el-icon>
            </el-tooltip>
          </template>
          <el-input v-model="info.moduleName" :maxlength="64" show-word-limit />
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="businessName">
          <template #label>
            {{ t('gen.genInfo.businessName') }}
            <el-tooltip :content="t('gen.genInfo.businessNameTip')" placement="top">
              <el-icon><question-filled /></el-icon>
            </el-tooltip>
          </template>
          <el-input v-model="info.businessName" />
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="functionName">
          <template #label>
            {{ t('gen.genInfo.functionName') }}
            <el-tooltip :content="t('gen.genInfo.functionNameTip')" placement="top">
              <el-icon><question-filled /></el-icon>
            </el-tooltip>
          </template>
          <el-input v-model="info.functionName" />
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="formColNum">
          <template #label>
            {{ t('gen.genInfo.formColNum') }}
            <el-tooltip :content="t('gen.genInfo.formColNumTip')" placement="top">
              <el-icon><question-filled /></el-icon>
            </el-tooltip>
          </template>
          <el-select v-model="info.formColNum">
            <el-option :label="t('gen.genInfo.formColNumOne')" :value="1" />
            <el-option :label="t('gen.genInfo.formColNumTwo')" :value="2" />
            <el-option :label="t('gen.genInfo.formColNumThree')" :value="3" />
          </el-select>
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="genView">
          <template #label>{{ t('gen.genInfo.genView') }}</template>
          <el-checkbox v-model="info.view">{{ t('gen.genInfo.genViewDetail') }}</el-checkbox>
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item prop="genType">
          <template #label>
            {{ t('gen.genInfo.genType') }}
            <el-tooltip :content="t('gen.genInfo.genTypeTip')" placement="top">
              <el-icon><question-filled /></el-icon>
            </el-tooltip>
          </template>
          <el-radio v-model="info.genType" value="0">{{ t('gen.genInfo.genTypeZip') }}</el-radio>
          <el-radio v-model="info.genType" value="1">{{ t('gen.genInfo.genTypeCustom') }}</el-radio>
        </el-form-item>
      </el-col>

      <el-col :span="12">
        <el-form-item>
          <template #label>
            {{ t('gen.genInfo.parentMenu') }}
            <el-tooltip :content="t('gen.genInfo.parentMenuTip')" placement="top">
              <el-icon><question-filled /></el-icon>
            </el-tooltip>
          </template>
          <el-tree-select
            v-model="info.parentMenuId"
            :data="menuOptions"
            :props="{ value: 'menuId', label: 'menuName', children: 'children' }"
            :placeholder="t('gen.genInfo.phParentMenu')"
            check-strictly
          />
        </el-form-item>
      </el-col>

      <Transition name="expand-fade">
        <el-col :span="24" v-if="info.genType == '1'">
          <el-form-item prop="genPath">
            <template #label>
              {{ t('gen.genInfo.genPath') }}
              <el-tooltip :content="t('gen.genInfo.genPathTip')" placement="top">
                <el-icon><question-filled /></el-icon>
              </el-tooltip>
            </template>
            <el-input v-model="info.genPath" :maxlength="200" show-word-limit>
              <template #append>
                <el-dropdown>
                  <el-button type="primary">
                    {{ t('gen.genInfo.genPathRecent') }}
                    <i class="el-icon-arrow-down el-icon--right"></i>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="info.genPath = '/'">
                        {{ t('gen.genInfo.genPathReset') }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </Transition>
    </el-row>

    <Transition name="expand-fade">
      <div v-if="info.tplCategory == 'tree'">
        <h4 class="form-header">{{ t('gen.genInfo.otherInfo') }}</h4>
        <el-row>
          <el-col :span="12">
            <el-form-item>
              <template #label>
                {{ t('gen.genInfo.treeCode') }}
                <el-tooltip :content="t('gen.genInfo.treeCodeTip')" placement="top">
                  <el-icon><question-filled /></el-icon>
                </el-tooltip>
              </template>
              <el-select v-model="info.treeCode" :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="column in info.columns"
                  :key="column.columnName"
                  :label="column.columnName + '：' + column.columnComment"
                  :value="column.columnName"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <template #label>
                {{ t('gen.genInfo.treeParentCode') }}
                <el-tooltip :content="t('gen.genInfo.treeParentCodeTip')" placement="top">
                  <el-icon><question-filled /></el-icon>
                </el-tooltip>
              </template>
              <el-select v-model="info.treeParentCode" :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="column in info.columns"
                  :key="column.columnName"
                  :label="column.columnName + '：' + column.columnComment"
                  :value="column.columnName"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <template #label>
                {{ t('gen.genInfo.treeName') }}
                <el-tooltip :content="t('gen.genInfo.treeNameTip')" placement="top">
                  <el-icon><question-filled /></el-icon>
                </el-tooltip>
              </template>
              <el-select v-model="info.treeName" :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="column in info.columns"
                  :key="column.columnName"
                  :label="column.columnName + '：' + column.columnComment"
                  :value="column.columnName"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </div>
    </Transition>

    <Transition name="expand-fade">
      <div v-if="info.tplCategory == 'sub'">
        <h4 class="form-header">{{ t('gen.genInfo.subInfo') }}</h4>
        <el-row>
          <el-col :span="12">
            <el-form-item>
              <template #label>
                {{ t('gen.genInfo.subTableName') }}
                <el-tooltip :content="t('gen.genInfo.subTableNameTip')" placement="top">
                  <el-icon><question-filled /></el-icon>
                </el-tooltip>
              </template>
              <el-select
                v-model="info.subTableName"
                :placeholder="t('common.form.selectPlaceholder')"
                @change="subSelectChange"
              >
                <el-option
                  v-for="table in tables"
                  :key="table.tableName"
                  :label="table.tableName + '：' + table.tableComment"
                  :value="table.tableName"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <template #label>
                {{ t('gen.genInfo.subTableFkName') }}
                <el-tooltip :content="t('gen.genInfo.subTableFkNameTip')" placement="top">
                  <el-icon><question-filled /></el-icon>
                </el-tooltip>
              </template>
              <el-select v-model="info.subTableFkName" :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="column in subColumns"
                  :key="column.columnName"
                  :label="column.columnName + '：' + column.columnComment"
                  :value="column.columnName"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </div>
    </Transition>
  </el-form>
</template>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
const { t } = useI18n()
import { listMenu } from '@/api/system/menu'
import { handleTree } from '@/utils/stepby'

const subColumns = ref([])
const menuOptions = ref([])

// FE-003：通过 useTemplateRef + defineExpose 暴露表单 ref，替代父组件 .$refs 访问
const genInfoFormRef = useTemplateRef('genInfoForm')

const props = defineProps({
  info: {
    type: Object,
    default: null
  },
  tables: {
    type: Array,
    default: null
  }
})

// 表单校验
const rules = ref({
  tplCategory: [{ required: true, message: t('gen.genInfo.validate.tplCategoryRequired'), trigger: 'blur' }],
  packageName: [{ required: true, message: t('gen.genInfo.validate.packageNameRequired'), trigger: 'blur' }],
  moduleName: [{ required: true, message: t('gen.genInfo.validate.moduleNameRequired'), trigger: 'blur' }],
  businessName: [{ required: true, message: t('gen.genInfo.validate.businessNameRequired'), trigger: 'blur' }],
  functionName: [{ required: true, message: t('gen.genInfo.validate.functionNameRequired'), trigger: 'blur' }]
})

function subSelectChange(_value: string): void {
  if (props.info) {
    props.info.subTableFkName = ''
  }
}

function tplSelectChange(value: string): void {
  if (value !== 'sub' && props.info) {
    props.info.subTableName = ''
    props.info.subTableFkName = ''
  }
}

function setSubTableColumns(value: string): void {
  for (const item of props.tables || []) {
    const name = item.tableName
    if (value === name) {
      subColumns.value = item.columns || []
      break
    }
  }
}

/** 查询菜单下拉树结构 */
function getMenuTreeselect(): void {
  listMenu()
    .then((response) => {
      menuOptions.value = handleTree(response.data || [], 'menuId')
    })
    .catch(() => {})
}

onMounted(() => {
  getMenuTreeselect()
})

watch(
  () => props.info?.subTableName,
  (val: string) => {
    if (val) {
      setSubTableColumns(val)
    }
  },
  { immediate: true }
)

defineExpose({ genInfoFormRef })

watch(
  () => props.info?.tplWebType,
  (val: string) => {
    if (val === '' && props.info) {
      props.info.tplWebType = 'element-plus-typescript'
    }
  },
  { immediate: true }
)
</script>
