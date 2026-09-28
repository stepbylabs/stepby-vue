// zh-CN · 分类：error（错误与反馈）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

export default {
  errorCode: {
    '400': '请求参数错误',
    '401': '认证失败，无法访问系统资源',
    '403': '当前操作没有权限',
    '404': '访问资源不存在',
    '409': '数据已存在，请勿重复操作',
    '422': '请求数据格式错误，请检查输入',
    '429': '请求过于频繁，请稍后再试',
    '500': '系统内部错误',
    '503': '服务暂时不可用，请稍后重试',
    default: '系统未知错误，请反馈给管理员'
  },
  error: {
    e401: {
      title: '您没有访问权限！',
      errorTitle: '401错误!',
      message: '对不起，您没有访问权限，请不要进行非法操作！您可以返回主页面',
      backHome: '返回首页',
      alt: '女孩掉了她的冰淇淋。'
    },
    e403: {
      title: '403',
      message: '抱歉，您没有权限访问此页面',
      backHome: '返回首页',
      backPrev: '返回上一页',
      ariaLabel: '403 无权限页面，当前路径 {path}'
    },
    e404: {
      title: '404错误!',
      message:
        '对不起，您正在寻找的页面不存在。尝试检查URL的错误，然后按浏览器上的刷新按钮或尝试在我们的应用程序中找到其他内容。',
      notFound: '找不到网页！',
      backHome: '返回首页',
      autoBack: '{seconds} 秒后将自动返回首页'
    },
    e500: {
      title: '500',
      message: '服务器开小差了，请稍后再试',
      refresh: '刷新页面',
      backHome: '返回首页',
      ariaLabel: '500 服务器错误页面，当前路径 {path}'
    },
    network: {
      title: '网络异常',
      message: '网络异常，请检查您的网络连接',
      retry: '重试',
      backHome: '返回首页',
      ariaLabel: '网络错误页面，当前路径 {path}'
    },
    monitor: {
      title: '问题监控',
      empty: '暂无错误或警告',
      clear: '清空',
      viewAll: '查看全部前端异常',
      ariaWithCount: '有 {count} 个错误或警告',
      ariaNoIssue: '暂无错误或警告',
      multi: ' (×{count})',
      aggregated: '发现 {total} 个问题：{errors} 个错误，{warnings} 个警告',
      source: '来源：{source}',
      levels: {
        error: '错误',
        warning: '警告',
        info: '提示'
      },
      sources: {
        api: '接口',
        download: '下载',
        vue: 'Vue',
        global: '全局',
        unhandledrejection: '未处理Promise',
        resource: '资源加载',
        other: '其他'
      }
    }
  },
  about: {
    title: '关于系统',
    projectInfo: '项目信息',
    projectName: 'Stepby 管理系统',
    projectDesc: '基于 Axum 0.8 + SeaORM 1.1 + Vue3 + Element Plus 的企业级后台管理系统',
    frontendVersion: '前端版本',
    backendVersion: '后端版本',
    buildMode: '构建模式',
    buildTime: '构建时间',
    vueVersion: 'Vue 版本',
    epVersion: 'Element Plus 版本',
    viteVersion: 'Vite 版本',
    nodeVersion: 'Node.js 版本',
    repoButton: '源码仓库',
    apiButton: 'API 文档',
    refreshButton: '刷新信息',
    copyButton: '复制信息',
    techStack: '技术栈',
    techStackItem: {
      rust: 'Rust (后端)',
      axum: 'Axum',
      seaorm: 'SeaORM',
      vue3: 'Vue 3',
      ep: 'Element Plus',
      ts: 'TypeScript',
      vite: 'Vite',
      tailwind: 'Tailwind CSS',
      pinia: 'Pinia',
      redis: 'Redis',
      db: 'SQLite/MySQL/PG'
    },
    mainDeps: '主要依赖',
    frontendTab: '前端',
    backendTab: '后端',
    features: '系统特性',
    feature: {
      f1: 'Rust + Vue3 现代全栈架构',
      f2: '单文件部署（前端内嵌）',
      f3: 'Argon2id 密码哈希 + TOTP 双因素认证',
      f4: 'JWT + Redis 会话管理',
      f5: 'RBAC 权限模型 + 数据权限',
      f6: 'API 限流 + 幂等性 + 操作日志',
      f7: '审计追踪 + 合规报告 PDF',
      f8: 'IP 定位库 + 异常登录检测',
      f9: 'i18n 国际化（中/英）',
      f10: '暗色模式 + 主题色定制',
      f11: 'Ctrl+K 命令面板 + 9 组快捷键',
      f12: 'WebSocket 实时通信'
    },
    refreshSuccess: '信息已刷新',
    copySuccess: '系统信息已复制到剪贴板',
    copyFail: '复制失败,请手动选择文本'
  },
  changelog: {
    title: '更新日志',
    desc: '查看项目的版本更新记录',
    searchPlaceholder: '搜索更新内容...',
    latest: '最新',
    noResult: '未找到匹配的更新记录'
  },
  errorBoundary: {
    title: '页面加载失败',
    desc: '页面渲染过程中出现错误，您可以尝试重新加载或返回首页。',
    retry: '重试',
    goHome: '返回首页',
    details: '错误详情'
  },
  help: {
    title: '帮助中心',
    desc: '快速上手、功能说明、常见问题与联系方式',
    toc: '目录',
    searchPlaceholder: '搜索章节标题...',
    noResult: '未找到匹配的章节',
    sections: {
      quickStart: {
        title: '快速上手',
        intro: '欢迎使用 Stepby 后台管理系统，以下几步帮您快速开始：',
        step1Title: '1. 登录系统',
        step1Desc: '使用管理员分配的账号密码登录，首次登录建议立即修改密码并绑定 TOTP。',
        step2Title: '2. 浏览菜单',
        step2Desc: '左侧菜单按功能模块分组，可通过 Ctrl+K 唤出命令面板快速跳转。',
        step3Title: '3. 个性化设置',
        step3Desc: '在右上角「设置」中调整布局、主题色、暗黑模式等偏好。',
        step4Title: '4. 收藏常用功能',
        step4Desc: '在侧边栏右键菜单中收藏常用菜单，便于快速访问。'
      },
      permissions: {
        title: '权限说明',
        intro: '系统采用 RBAC 角色权限模型，不同角色可访问的功能不同：',
        roles: {
          admin: '超级管理员',
          manager: '部门管理员',
          common: '普通用户'
        },
        roleDesc: {
          admin: '拥有全部权限，可管理用户、角色、菜单、字典等所有资源，不可被删除。',
          manager: '可管理部门内用户、查看审计日志、管理部分配置，无系统级管理权限。',
          common: '可查看个人信息、通知、登录历史，无任何管理权限。'
        }
      },
      shortcuts: {
        title: '常用快捷键',
        intro: '以下为高频快捷键，完整列表请访问快捷键中心：',
        viewAll: '查看全部快捷键'
      },
      customization: {
        title: '个性化设置',
        intro: '系统支持丰富的个性化定制，让您的使用更舒适：',
        feature1Title: '布局切换',
        feature1Desc: '左侧菜单 / 顶部菜单 / 顶侧混合三种布局模式。',
        feature2Title: '主题色',
        feature2Desc: '8 种预设主题色，支持自定义颜色。',
        feature3Title: '暗黑模式',
        feature3Desc: '手动或跟随系统切换暗黑模式，护眼。',
        feature4Title: '多语言',
        feature4Desc: '支持简体中文与英文，可在右上角切换。',
        feature5Title: '快捷键自定义',
        feature5Desc: '在偏好设置中可自定义全部全局快捷键。'
      },
      security: {
        title: '数据安全',
        intro: '系统从多个层面保障您的数据安全：',
        feature1Title: '密码加密',
        feature1Desc: '使用 Argon2id + 随机盐值加密存储，永不存储明文。',
        feature2Title: 'TOTP 二次验证',
        feature2Desc: '支持 Google Authenticator 等 TOTP 应用绑定，提升账户安全。',
        feature3Title: '会话管理',
        feature3Desc: '可查看并远程注销自己的活跃会话，发现异常立即处理。',
        feature4Title: '操作审计',
        feature4Desc: '所有写操作（增删改）均记录到操作日志，可追溯。'
      },
      faq: {
        title: '常见问题',
        q1: '忘记密码怎么办？',
        a1: '请联系管理员在「用户管理」中重置您的密码，重置后请尽快登录并修改为新密码。',
        q2: 'TOTP 验证码失效怎么办？',
        a2: '若手机丢失或 TOTP 应用重置，请联系管理员在「用户管理」中清空您的 TOTP 绑定，然后重新绑定。',
        q3: '为什么有些菜单看不到？',
        a3: '菜单可见性由您的角色权限决定。请联系管理员在「角色管理」中分配相应权限。',
        q4: '登录后被异常退出？',
        a4: '可能是其他设备登录了同账号（单点登录），或管理员强制下线了您的会话。可在「会话管理」中查看活跃会话。',
        q5: '如何切换语言？',
        a5: '点击右上角地球图标即可在简体中文与英文之间切换，选择会持久化到本地。',
        q6: '如何反馈问题或建议？',
        a6: '可通过下方联系方式中的 GitHub Issue 或邮件反馈，我们会尽快处理。'
      },
      contact: {
        title: '联系方式',
        intro: '如有问题或建议，欢迎通过以下渠道联系我们：',
        github: 'GitHub',
        githubDesc: '提交 Issue 或 Pull Request',
        website: '官方网站',
        websiteDesc: 'stepby.tzkj.net',
        email: '邮件支持',
        emailDesc: "support{'@'}stepby.tzkj.net"
      }
    }
  },
  commandPalette: {
    placeholder: '输入命令或菜单名称，按 Enter 执行',
    noMatch: '没有匹配的命令',
    category: {
      navigation: '导航',
      action: '执行',
      menuJump: '菜单跳转',
      systemAction: '系统操作'
    },
    cmd: {
      toggleDark: '切换暗黑模式',
      toggleFullscreen: '切换全屏',
      toggleSidebar: '折叠/展开侧边栏',
      refreshPage: '刷新当前页面',
      lockScreen: '锁定屏幕',
      profile: '打开个人中心',
      logout: '退出登录'
    },
    close: '关闭',
    confirmLogout: '确定退出登录吗？',
    executeFail: '命令执行失败',
    ariaLabel: '命令面板'
  },
  tour: {
    prev: '上一步',
    next: '下一步',
    finish: '完成',
    skip: '跳过引导',
    ariaLabel: '新手引导'
  },
  notification: {
    newNotice: '新通知',
    operLogTitle: '操作日志',
    systemTitle: '系统消息',
    systemMessageTitle: '系统消息',
    wsConnected: 'WebSocket 连接成功',
    forceLogoutMessage: '您的账号已被管理员强制下线。',
    forceLogoutMsg: '您的账号已被管理员强制下线'
  }
}
