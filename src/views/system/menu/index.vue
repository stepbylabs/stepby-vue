<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('menuModule.search.menuName')" prop="menuName">
          <el-input
            v-model="queryParams.menuName"
            :placeholder="t('menuModule.search.phMenuName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('menuModule.search.status')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('menuModule.search.phStatus')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="dict in sys_normal_disable" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:menu:add']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Check"
          :loading="sortLoading"
          @click="handleSaveSort"
          v-hasPermi="['system:menu:edit']"
        >
          {{ t('common.save') }}{{ t('menuModule.column.sort') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Sort" @click="toggleExpandAll">
          {{ t('common.expand') }}/{{ t('common.collapse') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      ref="tableRef"
      v-if="refreshTable"
      v-loading="loading"
      :data="menuList"
      row-key="menuId"
      :default-expand-all="isExpandAll"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    >
      <el-table-column prop="menuName" :label="t('menuModule.column.name')" show-overflow-tooltip width="240">
        <template #default="scope">
          <span class="inline-flex items-center gap-1">
            <svg-icon v-if="scope.row.icon" :icon-class="scope.row.icon" />
            <span class="truncate">
              {{ translateTitle({ title: scope.row.menuName, i18nKey: scope.row.i18nKey }) }}
            </span>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="menuName" :label="t('common.column.type')" show-overflow-tooltip width="100">
        <template #default="scope">
          <el-tag v-if="scope.row.menuType === 'M' && scope.row.isFrame === '0'" type="danger" size="small">
            {{ t('menuModule.tip.link') }}
          </el-tag>
          <el-tag v-else-if="scope.row.menuType === 'M'" type="primary" size="small">
            {{ t('menuModule.tip.menuTypeDir') }}
          </el-tag>
          <el-tag v-else-if="scope.row.menuType === 'C' && scope.row.isFrame === '0'" type="danger" size="small">
            {{ t('menuModule.tip.link') }}
          </el-tag>
          <el-tag v-else-if="scope.row.menuType === 'C'" type="success" size="small">
            {{ t('menuModule.tip.menuTypeMenu') }}
          </el-tag>
          <el-tag v-else-if="scope.row.menuType === 'F'" type="warning" size="small">
            {{ t('menuModule.tip.menuTypeButton') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="orderNum" :label="t('menuModule.column.sort')" width="120">
        <template #default="scope">
          <el-input-number v-model="scope.row.orderNum" controls-position="right" :min="0" class="w-[88px]" />
        </template>
      </el-table-column>
      <el-table-column prop="perms" :label="t('menuModule.column.perms')" show-overflow-tooltip width="180" />
      <el-table-column prop="component" :label="t('menuModule.column.path')" show-overflow-tooltip width="200" />
      <el-table-column prop="status" :label="t('common.column.status')" width="80">
        <template #default="scope">
          <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="210"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['system:menu:edit']">
            {{ t('common.edit') }}
          </el-button>
          <el-button link type="primary" icon="Plus" @click="handleAdd(scope.row)" v-hasPermi="['system:menu:add']">
            {{ t('common.add') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:menu:remove']"
          >
            {{ t('common.delete') }}
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('common.empty')" />
      </template>
    </el-table>

    <!-- 添加或修改菜单对话框 -->
    <el-dialog :title="title" v-model="open" width="min(90%, 680px)" append-to-body destroy-on-close>
      <el-form ref="menuRef" :model="form" :rules="rules" label-width="100px">
        <el-row>
          <el-col :span="24">
            <el-form-item :label="t('menuModule.form.parentMenu')">
              <el-tree-select
                v-model="form.parentId"
                :data="translatedMenuOptions"
                :props="{ value: 'menuId', label: 'menuName', children: 'children' }"
                value-key="menuId"
                :placeholder="t('menuModule.form.phParentMenu')"
                check-strictly
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('menuModule.form.menuType')" prop="menuType">
              <el-radio-group v-model="form.menuType">
                <el-radio value="M">{{ t('menuModule.tip.menuTypeDir') }}</el-radio>
                <el-radio value="C">{{ t('menuModule.tip.menuTypeMenu') }}</el-radio>
                <el-radio value="F">{{ t('menuModule.tip.menuTypeButton') }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType != 'F'">
              <el-form-item :label="t('menuModule.form.icon')" prop="icon">
                <el-popover placement="bottom-start" :width="540" trigger="click">
                  <template #reference>
                    <el-input
                      v-model="form.icon"
                      :placeholder="t('menuModule.form.phIcon')"
                      @blur="showSelectIcon"
                      readonly
                    >
                      <template #prefix>
                        <svg-icon v-if="form.icon" :icon-class="form.icon" class="el-input__icon h-8 w-4" />
                        <el-icon v-else class="h-8 w-4"><search /></el-icon>
                      </template>
                    </el-input>
                  </template>
                  <icon-select ref="iconSelectRef" @selected="selected" :active-icon="form.icon" />
                </el-popover>
              </el-form-item>
            </el-col>
          </Transition>
          <el-col :span="12">
            <el-form-item :label="t('menuModule.form.order')" prop="orderNum">
              <el-input-number v-model="form.orderNum" controls-position="right" :min="0" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('menuModule.form.menuName')" prop="menuName">
              <el-input v-model="form.menuName" :placeholder="t('menuModule.form.phMenuName')" />
            </el-form-item>
          </el-col>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType == 'C'">
              <el-form-item prop="routeName">
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.routeNameHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.routeName') }}
                  </span>
                </template>
                <el-input
                  v-model="form.routeName"
                  :placeholder="t('menuModule.form.phRouteName')"
                  :maxlength="50"
                  show-word-limit
                />
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType != 'F'">
              <el-form-item>
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.i18nKeyHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.i18nKey') }}
                  </span>
                </template>
                <el-input
                  v-model.trim="form.i18nKey"
                  :placeholder="t('menuModule.form.phI18nKey')"
                  maxlength="100"
                  show-word-limit
                />
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType != 'F'">
              <el-form-item>
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.isFrameHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.isFrame') }}
                  </span>
                </template>
                <el-radio-group v-model="form.isFrame">
                  <el-radio value="0">{{ t('common.yes') }}</el-radio>
                  <el-radio value="1">{{ t('common.no') }}</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType != 'F'">
              <el-form-item prop="path">
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.pathHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.path') }}
                  </span>
                </template>
                <el-input v-model="form.path" :placeholder="t('menuModule.form.phPath')" />
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType == 'C'">
              <el-form-item prop="component">
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.componentHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.component') }}
                  </span>
                </template>
                <el-input
                  v-model="form.component"
                  :placeholder="t('menuModule.form.phComponent')"
                  :maxlength="255"
                  show-word-limit
                />
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType != 'M'">
              <el-form-item>
                <el-input v-model.trim="form.perms" :placeholder="t('menuModule.form.phPerms')" maxlength="100" />
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.permsHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.perms') }}
                  </span>
                </template>
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType == 'C'">
              <el-form-item>
                <el-input v-model="form.query" :placeholder="t('menuModule.form.phQuery')" maxlength="255" />
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.queryHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.query') }}
                  </span>
                </template>
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType == 'C'">
              <el-form-item>
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.cacheHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.cache') }}
                  </span>
                </template>
                <el-radio-group v-model="form.isCache">
                  <el-radio value="0">{{ t('menuModule.tip.cache') }}</el-radio>
                  <el-radio value="1">{{ t('menuModule.tip.noCache') }}</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </Transition>
          <Transition name="expand-fade">
            <el-col :span="12" v-if="form.menuType != 'F'">
              <el-form-item>
                <template #label>
                  <span>
                    <el-tooltip :content="t('menuModule.tip.visibleHelp')" placement="top">
                      <el-icon><question-filled /></el-icon>
                    </el-tooltip>
                    {{ t('menuModule.form.visible') }}
                  </span>
                </template>
                <el-radio-group v-model="form.visible">
                  <el-radio v-for="dict in sys_show_hide" :key="dict.value" :value="dict.value">
                    {{ dict.label }}
                  </el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </Transition>
          <el-col :span="12">
            <el-form-item>
              <template #label>
                <span>
                  <el-tooltip :content="t('menuModule.tip.statusHelp')" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  {{ t('menuModule.form.status') }}
                </span>
              </template>
              <el-radio-group v-model="form.status">
                <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
                  {{ dict.label }}
                </el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="Menu">
import {
  addMenu,
  delMenu,
  getMenu,
  listMenu,
  updateMenu,
  updateMenuSort,
  refreshMenuTreeselect
} from '@/api/system/menu'
import SvgIcon from '@/components/SvgIcon/index.vue'
import IconSelect from '@/components/IconSelect/index.vue'
import type { SysMenu, MenuQueryParams } from '@/types/api/system/menu'
import modal from '@/plugins/modal'
import { handleTree } from '@/utils/stepby'
import { useMenuTitle } from '@/composables/useMenuTitle'
import { useTreeTableSort } from '@/composables/useTreeTableSort'

const { t } = useI18n()
const { translateTitle } = useMenuTitle()
const menuRefRef = useTemplateRef('menuRef')
const queryRefRef = useTemplateRef('queryRef')
const tableRef = useTemplateRef('tableRef')
const { sys_show_hide, sys_normal_disable } = useDict('sys_show_hide', 'sys_normal_disable')

const menuList = ref<SysMenu[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
const submitLoading = ref<boolean>(false)
const showSearch = ref<boolean>(true)
const title = ref<string>('')
const menuOptions = ref<SysMenu[]>([])
const iconSelectRef = useTemplateRef<InstanceType<typeof IconSelect>>('iconSelectRef')

const { isExpandAll, refreshTable, toggleExpandAll, recordOriginalOrders, sortLoading, handleSaveSort } =
  useTreeTableSort<SysMenu>({
    listRef: menuList,
    idField: 'menuId',
    sortApi: (p) => updateMenuSort({ menuIds: p.ids, orderNums: p.orderNums }),
    noSortChangeKey: 'menuModule.tip.noSortChange',
    sortSavedKey: 'menuModule.tip.sortSaved',
    defaultExpand: false
  })

const data = reactive({
  form: {} as SysMenu,
  queryParams: {
    menuName: undefined,
    visible: undefined
  } as MenuQueryParams,
  rules: {
    menuName: [{ required: true, message: t('menuModule.validate.menuNameRequired'), trigger: 'blur' }],
    orderNum: [{ required: true, message: t('menuModule.validate.orderNumRequired'), trigger: 'blur' }],
    path: [{ required: true, message: t('menuModule.validate.pathRequired'), trigger: 'blur' }]
  }
})

const { queryParams, form, rules } = toRefs(data)

/** 查询菜单列表 */
function getList() {
  loading.value = true
  listMenu(queryParams.value)
    .then((response) => {
      menuList.value = handleTree(response.data!, 'menuId')
      recordOriginalOrders(menuList.value)
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

/** 查询菜单下拉树结构 */
function getTreeselect() {
  menuOptions.value = []
  return listMenu()
    .then((response) => {
      const menu = { menuId: 0, menuName: t('menuModule.tip.menuTypeDir'), children: [] as SysMenu[] }
      menu.children = handleTree(response.data!, 'menuId')
      menuOptions.value.push(menu)
    })
    .catch(() => {})
}

/** 翻译菜单树（响应式跟随 locale，用于父菜单选择器显示当前语言的菜单名） */
const translatedMenuOptions = computed(() => {
  const translateNode = (node: SysMenu): SysMenu => {
    // 无需翻译且无子节点时直接返回原节点，避免不必要的对象拷贝
    if (!node.i18nKey && (!node.children || !node.children.length)) {
      return node
    }
    const translated: SysMenu = { ...node }
    if (node.i18nKey) {
      translated.menuName = translateTitle({ title: node.menuName, i18nKey: node.i18nKey })
    }
    if (node.children && node.children.length) {
      translated.children = node.children.map(translateNode)
    }
    return translated
  }
  return menuOptions.value.map(translateNode)
})

/** 取消按钮 */
function cancel() {
  open.value = false
  reset()
}

/** 表单重置 */
function reset() {
  form.value = {
    menuId: undefined,
    parentId: 0,
    menuName: undefined,
    icon: undefined,
    menuType: 'M',
    orderNum: undefined,
    isFrame: '1',
    isCache: '0',
    visible: '0',
    status: '0',
    i18nKey: undefined
  }
  menuRefRef.value?.resetFields()
}

/** 展示下拉图标 */
function showSelectIcon() {
  iconSelectRef.value?.reset()
}

/** 选择图标 */
function selected(name: string) {
  form.value.icon = name
}

/** 搜索按钮操作 */
function handleQuery() {
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 新增按钮操作 */
function handleAdd(row?: SysMenu) {
  reset()
  getTreeselect()
  if (row != null && row.menuId) {
    form.value.parentId = row.menuId
  } else {
    form.value.parentId = 0
  }
  open.value = true
  title.value = t('common.add') + t('menuModule.title')
}

/** 展开/折叠操作（由 useTreeTableSort 提供 toggleExpandAll） */

/** 修改按钮操作 */
async function handleUpdate(row: SysMenu) {
  reset()
  await getTreeselect()
  getMenu(row.menuId!)
    .then((response) => {
      form.value = response.data!
      open.value = true
      title.value = t('common.edit') + t('menuModule.title')
    })
    .catch(() => {})
}

/** 提交按钮 */
function submitForm() {
  menuRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.menuId != undefined) {
        updateMenu(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
            open.value = false
            getList()
            // V-1 修复: 菜单变更后失效下拉树缓存，确保用户管理/角色管理等页面拿到最新菜单树
            refreshMenuTreeselect()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        addMenu(form.value)
          .then(() => {
            modal.msgSuccess(t('common.addSuccess'))
            open.value = false
            getList()
            // V-1 修复: 菜单变更后失效下拉树缓存
            refreshMenuTreeselect()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      }
    }
  })
}

/** recordOriginalOrders / handleSaveSort 由 useTreeTableSort 提供 */

/** 删除按钮操作 */
function handleDelete(row: SysMenu) {
  modal
    .confirm(t('menuModule.tip.confirmDelete', { name: row.menuName }))
    .then(function () {
      return delMenu(row.menuId!)
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
      // V-1 修复: 菜单删除后失效下拉树缓存
      refreshMenuTreeselect()
    })
    .catch(() => {})
}

getList()
</script>

<style scoped>
:deep(.el-table__row) {
  transition: background-color 0.2s ease;
}
:deep(.el-tag) {
  transition: all 0.2s ease;
}
</style>
