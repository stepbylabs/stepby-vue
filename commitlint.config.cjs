// commitlint 配置（P2-17）
// 基于 @commitlint/config-conventional，扩展中文友好提示
// 规范：<type>(<scope>): <subject>
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 枚举（对齐项目实际使用场景）
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // 修复 Bug
        'docs', // 文档变更
        'style', // 代码格式（不影响功能）
        'refactor', // 重构（既不是 feat 也不是 fix）
        'perf', // 性能优化
        'test', // 测试相关
        'build', // 构建系统或外部依赖变更
        'ci', // CI 配置
        'chore', // 杂项（不修改 src 或 test）
        'revert', // 回滚 commit
        'security' // 安全修复
      ]
    ],
    // subject 不允许句号结尾
    'subject-full-stop': [2, 'never', '.'],
    // subject 最小长度（中文 2 字符起步）
    'subject-min-length': [2, 'always', 2],
    // subject 最大长度（中文友好，放宽至 100）
    'subject-max-length': [2, 'always', 100],
    // body 每行最大长度（放宽至 200，适配中文）
    'body-max-line-length': [1, 'always', 200],
    // footer 每行最大长度
    'footer-max-line-length': [1, 'always', 200]
  }
}
