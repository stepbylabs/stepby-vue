<template>
  <el-dialog
    v-model="visible"
    :title="t('notice.readUsers.dialogTitle', { title: noticeTitle })"
    width="min(80%, 760px)"
    top="6vh"
    append-to-body
    @close="handleClose"
    destroy-on-close
  >
    <el-form ref="queryRef" :model="queryParams" size="small" :inline="true" class="mb-1">
      <el-form-item prop="searchValue">
        <el-input
          v-model="queryParams.searchValue"
          :placeholder="t('notice.readUsers.phSearch')"
          :maxlength="50"
          clearable
          :prefix-icon="Search"
          class="w-[220px]"
          @keyup.enter="handleQuery"
          @clear="handleQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" size="small" @click="handleQuery">{{ t('common.search') }}</el-button>
        <el-button icon="Refresh" size="small" @click="resetQuery">{{ t('common.reset') }}</el-button>
      </el-form-item>
      <el-form-item class="ml-auto">
        <span class="read-stat">
          {{ t('notice.readUsers.totalReaders', { count: total }) }}
        </span>
      </el-form-item>
    </el-form>
    <el-table v-loading="loading" :data="userList" size="small" stripe height="340px">
      <el-table-column type="index" :label="t('notice.readUsers.column.id')" width="55" align="center" />
      <el-table-column
        :label="t('notice.readUsers.column.loginName')"
        prop="userName"
        align="center"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('notice.readUsers.column.userName')"
        prop="nickName"
        align="center"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('notice.readUsers.column.dept')"
        prop="deptName"
        align="center"
        show-overflow-tooltip
      />
      <el-table-column :label="t('notice.readUsers.column.phone')" prop="phonenumber" align="center" width="120" />
      <el-table-column :label="t('notice.readUsers.column.readTime')" prop="readTime" align="center" width="160">
        <template #default="scope">
          <span>{{ parseTime(scope.row.readTime) }}</span>
        </template>
      </el-table-column>
    </el-table>
    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
      class="py-1.5"
    />
  </el-dialog>
</template>

<script setup lang="ts" name="ReadUsers">
import { Search } from '@element-plus/icons-vue'
import { listNoticeReadUsers } from '@/api/system/notice'
import type { NoticeReadUser, NoticeReadUserQueryParams, SysNotice } from '@/types/api/system/notice'

const { t } = useI18n()
const queryRefRef = useTemplateRef('queryRef')

const visible = ref(false)
const loading = ref(false)
const noticeTitle = ref('')
const total = ref(0)
const userList = ref<NoticeReadUser[]>([])

const queryParams = reactive<NoticeReadUserQueryParams>({
  pageNum: 1,
  pageSize: 10,
  noticeId: undefined,
  searchValue: undefined
})

function open(row: SysNotice) {
  queryParams.noticeId = row.noticeId
  noticeTitle.value = row.noticeTitle ?? ''
  queryParams.searchValue = undefined
  queryParams.pageNum = 1
  visible.value = true
  getList()
}

function getList() {
  loading.value = true
  listNoticeReadUsers(queryParams)
    .then((res) => {
      userList.value = res.rows
      total.value = res.total
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

function handleQuery() {
  queryParams.pageNum = 1
  getList()
}

function resetQuery() {
  queryRefRef.value?.resetFields()
  handleQuery()
}

function handleClose() {
  userList.value = []
  total.value = 0
  queryParams.searchValue = undefined
}

defineExpose({
  open
})
</script>

<style scoped>
.read-stat {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 28px;
}
.read-stat strong {
  color: var(--el-color-primary);
  font-size: 15px;
  margin: 0 2px;
}
</style>
