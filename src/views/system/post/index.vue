<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('post.search.postCode')" prop="postCode">
          <el-input
            v-model="queryParams.postCode"
            :placeholder="t('post.search.phPostCode')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('post.search.postName')" prop="postName">
          <el-input
            v-model="queryParams.postName"
            :placeholder="t('post.search.phPostName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('post.search.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('post.search.status')" clearable class="w-[200px]">
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:post:add']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['system:post:edit']"
        >
          {{ t('common.edit') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['system:post:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:post:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="8" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="dataList"
        :row-key="(row: SysPost) => row.postId"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('post.column.id')" align="center" prop="postId" />
        <el-table-column :label="t('post.column.postCode')" align="center" prop="postCode" />
        <el-table-column :label="t('post.column.postName')" align="center" prop="postName" />
        <el-table-column :label="t('post.column.sort')" align="center" prop="postSort" />
        <el-table-column :label="t('common.column.status')" align="center" prop="status">
          <template #default="scope">
            <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.createTime')" align="center" prop="createTime" width="180">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.operation')"
          width="180"
          align="center"
          class-name="small-padding fixed-width"
        >
          <template #default="scope">
            <el-button
              link
              type="primary"
              icon="Edit"
              @click="handleUpdate(scope.row)"
              v-hasPermi="['system:post:edit']"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              link
              type="primary"
              icon="Delete"
              @click="handleDelete(scope.row)"
              v-hasPermi="['system:post:remove']"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="t('common.empty')" />
        </template>
      </el-table>
    </Transition>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加或修改岗位对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close>
      <el-form ref="postRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('post.form.postName')" prop="postName">
          <el-input v-model.trim="form.postName" :placeholder="t('post.search.phPostName')" />
        </el-form-item>
        <el-form-item :label="t('post.form.postCode')" prop="postCode">
          <el-input v-model.trim="form.postCode" :placeholder="t('post.search.phPostCode')" />
        </el-form-item>
        <el-form-item :label="t('post.form.postSort')" prop="postSort">
          <el-input-number v-model="form.postSort" controls-position="right" :min="0" />
        </el-form-item>
        <el-form-item :label="t('post.form.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
              {{ dict.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('post.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :placeholder="t('common.form.inputPlaceholder')"
            :maxlength="500"
            show-word-limit
          />
        </el-form-item>
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

<script setup lang="ts" name="Post">
import { listPost, addPost, delPost, getPost, updatePost } from '@/api/system/post'
import type { SysPost, PostQueryParams } from '@/types/api/system/post'
import { useCrudTable } from '@/composables/useCrudTable'
import SkeletonTable from '@/components/SkeletonTable/index.vue'

const { t } = useI18n()
const postRefRef = useTemplateRef('postRef')
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

const data = reactive({
  form: {} as SysPost,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    postCode: undefined,
    postName: undefined,
    status: undefined
  } as PostQueryParams,
  rules: {
    postName: [{ required: true, message: t('post.validate.postNameRequired'), trigger: 'blur' }],
    postCode: [{ required: true, message: t('post.validate.postCodeRequired'), trigger: 'blur' }],
    postSort: [{ required: true, message: t('post.validate.postSortRequired'), trigger: 'blur' }]
  }
})
const { queryParams, form, rules } = toRefs(data)

const {
  dataList,
  open,
  loading,
  submitLoading,
  showSearch,
  single,
  multiple,
  total,
  title,
  getList,
  beforeDialogClose,
  cancel,
  handleQuery,
  resetQuery,
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  submitForm,
  handleDelete,
  handleExport
} = useCrudTable<SysPost, PostQueryParams>({
  listApi: listPost,
  getApi: getPost,
  addApi: addPost,
  updateApi: updatePost,
  deleteApi: delPost,
  idField: 'postId',
  exportUrl: '/system/post/export',
  defaultForm: () => ({
    postId: undefined,
    postCode: undefined,
    postName: undefined,
    postSort: 0,
    status: '0',
    remark: undefined
  }),
  titleKey: 'post.title',
  deleteTipKey: 'post.tip.confirmDelete',
  queryParams,
  form,
  formRef: postRefRef,
  queryRef: queryRefRef
})

getList()
</script>

<style scoped>
:deep(.el-table__row) {
  transition: background-color 0.2s ease;
}
</style>
