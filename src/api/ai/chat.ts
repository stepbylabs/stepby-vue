import request from '@/utils/request'

/** AI 助手（NL2SQL）对话：返回 { code, msg, data: { answer, sql, tables, columns, rows, rowCount } } */
export function aiChat(data: { question: string }) {
  return request({
    url: '/ai/chat',
    method: 'post',
    data,
    timeout: 60000
  })
}

/** 可查询的白名单表 schema（供"查询范围"展示） */
export function aiTables() {
  return request({
    url: '/ai/tables',
    method: 'get',
    timeout: 30000
  })
}
