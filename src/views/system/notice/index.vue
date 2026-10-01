<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('notice.search.title')" prop="noticeTitle">
          <el-input
            v-model="queryParams.noticeTitle"
            :placeholder="t('notice.search.phTitle')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('notice.search.createBy')" prop="createBy">
          <el-input
            v-model="queryParams.createBy"
            :placeholder="t('notice.search.phCreateBy')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('notice.search.type')" prop="noticeType">
          <el-select
            v-model="queryParams.noticeType"
            :placeholder="t('notice.column.type')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="dict in sys_notice_type" :key="dict.value" :label="dict.label" :value="dict.value" />
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:notice:add']">
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
          v-hasPermi="['system:notice:edit']"
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
          v-hasPermi="['system:notice:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar
        v-model:showSearch="showSearch"
        @queryTable="getList"
        :show-print="true"
        :print-data="dataList"
        :print-title="t('notice.title')"
      ></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="8" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="dataList"
        :row-key="(row: SysNotice) => row.noticeId"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('notice.readUsers.column.id')" align="center" prop="noticeId" width="100" />
        <el-table-column :label="t('notice.column.title')" align="center" show-overflow-tooltip min-width="200">
          <template #default="scope">
            <el-link type="primary" underline="never" @click="handleViewData(scope.row)">
              {{ scope.row.noticeTitle }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column :label="t('notice.column.type')" align="center" prop="noticeType" width="100">
          <template #default="scope">
            <dict-tag :options="sys_notice_type" :value="scope.row.noticeType" />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.status')" align="center" prop="status" width="100">
          <template #default="scope">
            <dict-tag :options="sys_notice_status" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column :label="t('notice.column.createBy')" align="center" prop="createBy" width="100" />
        <el-table-column :label="t('notice.column.createTime')" align="center" prop="createTime" width="100">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime, '{y}-{m}-{d}') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" align="center" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button
              link
              type="primary"
              icon="User"
              @click="handleReadUsers(scope.row)"
              v-hasPermi="['system:notice:list']"
            >
              {{ t('notice.btn.readUsers') }}
            </el-button>
            <el-button
              link
              type="primary"
              icon="Edit"
              @click="handleUpdate(scope.row)"
              v-hasPermi="['system:notice:edit']"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              link
              type="primary"
              icon="Delete"
              @click="handleDelete(scope.row)"
              v-hasPermi="['system:notice:remove']"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            :description="t('common.noData')"
            :action-text="hasQueryFilter ? t('common.emptyActionReset') : t('common.emptyActionCreate')"
            :action-icon="hasQueryFilter ? 'RefreshLeft' : 'Plus'"
            :show-reset="hasQueryFilter"
            :reset-text="t('common.emptyActionReset')"
            @action="hasQueryFilter ? resetQuery() : handleAdd()"
            @reset="resetQuery"
          />
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

    <!-- 添加或修改公告对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(80%, 780px)" append-to-body destroy-on-close>
      <el-form ref="noticeRef" :model="form" :rules="rules" label-width="80px">
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('notice.form.title')" prop="noticeTitle">
              <el-input
                v-model.trim="form.noticeTitle"
                :placeholder="t('notice.search.phTitle')"
                :maxlength="50"
                show-word-limit
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('notice.form.type')" prop="noticeType">
              <el-select v-model="form.noticeType" :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="dict in sys_notice_type"
                  :key="dict.value"
                  :label="dict.label"
                  :value="dict.value"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('notice.form.status')">
              <el-radio-group v-model="form.status">
                <el-radio v-for="dict in sys_notice_status" :key="dict.value" :value="dict.value">
                  {{ dict.label }}
                </el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('notice.form.emailNotify')">
              <el-switch
                v-model="form.notifyEmail"
                :active-text="t('notice.form.emailTip')"
                :inactive-text="t('notice.form.emailInactive')"
              />
              <span class="ml-3 text-text-secondary text-xs">{{ t('notice.form.emailOnlyEnabled') }}</span>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('notice.form.content')">
              <editor v-model="form.noticeContent" :min-height="192" />
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
    <notice-detail-view ref="noticeViewRef" />
    <read-users-dialog ref="readUsersRef" />
  </div>
</template>

<script setup lang="ts" name="Notice">
import NoticeDetailView from '@/layout/components/HeaderNotice/DetailView.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import ReadUsersDialog from './ReadUsers.vue'
import { listNotice, getNotice, delNotice, addNotice, updateNotice } from '@/api/system/notice'
import type { SysNotice, NoticeQueryParams } from '@/types/api/system/notice'
import { useCrudTable } from '@/composables/useCrudTable'
import useNoticeStore from '@/store/modules/notice'

const { t } = useI18n()
const noticeRefRef = useTemplateRef('noticeRef')
const queryRefRef = useTemplateRef('queryRef')
const noticeViewRefRef = useTemplateRef('noticeViewRef')
const readUsersRefRef = useTemplateRef('readUsersRef')
const { sys_notice_status, sys_notice_type } = useDict('sys_notice_status', 'sys_notice_type')
// P1 修复: 公告 CRUD 后同步刷新 HeaderNotice 铃铛未读数
// 否则新增/修改/删除公告后，顶部铃铛列表和未读数不会更新
const noticeStore = useNoticeStore()

const data = reactive({
  form: {} as SysNotice,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    noticeTitle: undefined,
    createBy: undefined,
    status: undefined
  } as NoticeQueryParams,
  rules: {
    noticeTitle: [{ required: true, message: t('notice.validate.noticeTitleRequired'), trigger: 'blur' }],
    noticeType: [{ required: true, message: t('notice.validate.noticeTypeRequired'), trigger: 'change' }]
  }
})

const { queryParams, form, rules } = toRefs(data)

// TierA-4: 是否有查询条件（用于空状态 CTA 切换文案）
const hasQueryFilter = computed(() => {
  const q = queryParams.value
  return !!(q.noticeTitle || q.noticeType || q.createBy || q.status)
})

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
  handleDelete
} = useCrudTable<SysNotice, NoticeQueryParams>({
  listApi: listNotice,
  getApi: getNotice,
  addApi: addNotice,
  updateApi: updateNotice,
  deleteApi: delNotice,
  idField: 'noticeId',
  defaultForm: () => ({
    noticeId: undefined,
    noticeTitle: undefined,
    noticeType: undefined,
    noticeContent: undefined,
    status: '0',
    isRead: false,
    notifyEmail: false
  }),
  titleKey: 'notice.title',
  deleteTipKey: 'notice.tip.confirmDelete',
  queryParams,
  form,
  formRef: noticeRefRef,
  queryRef: queryRefRef,
  onAfterSubmit: () => {
    // P1 修复: 公告新增/修改后同步刷新 HeaderNotice 铃铛列表和未读数
    // 否则顶部铃铛仍显示旧列表，用户新建的公告不会出现在通知列表中
    noticeStore.refreshTopNotices().catch(() => {})
  },
  onAfterDelete: () => {
    // P1 修复: 公告删除后同步刷新 HeaderNotice 铃铛列表和未读数
    // 否则已删除的公告仍留在铃铛列表中，且未读数不会减少
    noticeStore.refreshTopNotices().catch(() => {})
  }
})

/** 查看公告详情 */
function handleViewData(row: SysNotice) {
  noticeViewRefRef.value?.open(row)
}

/** 查看已读用户 */
function handleReadUsers(row: SysNotice) {
  readUsersRefRef.value?.open(row)
}

getList()
</script>

<style lang="scss" scoped>
/* 表格行 hover 上浮过渡 */
:deep(.el-table__row) {
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

/* 类型/状态标签切换平滑过渡 */
:deep(.el-tag) {
  transition: all 0.2s ease;
}

/* 操作按钮点击反馈 */
:deep(.el-button) {
  transition: all 0.15s ease;
}
</style>
