export default {
  common: {
    // 按钮文本
    confirm: '确 定',
    cancel: '取 消',
    save: '保存',
    edit: '修改',
    delete: '删除',
    add: '新增',
    search: '搜索',
    reset: '重置',
    export: '导出',
    import: '导入',
    refresh: '刷新',
    close: '关 闭',
    clear: '清空',
    submit: '提交',
    back: '返回',
    expand: '展开',
    collapse: '收起',
    yes: '是',
    no: '否',
    detail: '详细',
    download: '下载',
    upload: '上传文件',
    batchDelete: '批量删除',
    copy: '复制',
    copyLink: '复制链接',
    create: '创建',
    viewAll: '查看全部',
    preview: '预览',
    sync: '同步',
    // TierS-6: 图表下载
    downloadChart: '下载为图片',
    chartDownloaded: '图表已下载',
    chartDownloadFail: '图表下载失败',
    chartNotReady: '图表尚未加载，请稍后再试',
    // 状态文本
    loading: '加载中...',
    success: '操作成功',
    failed: '操作失败',
    noData: '暂无数据',
    empty: '暂无数据',
    // TierA-4: 空状态 CTA
    emptyActionCreate: '立即创建',
    emptyActionReset: '重置筛选',
    tip: '提示',
    warning: '警告',
    error: '错误',
    other: '其他',
    status: '状态',
    enabled: '启用',
    disabled: '停用',
    normal: '正常',
    stop: '停用',
    fail: '失败',
    successStatus: '成功',
    waiting: '等待中',
    running: '进行中',
    completed: '已完成',
    // 登录注册
    login: '登 录',
    logging: '登 录 中...',
    logout: '退出登录',
    logoutConfirm: '确定注销并退出系统吗？',
    relogin: '重新登录',
    reloginConfirm: '登录状态已过期，您可以继续留在该页面，或者重新登录',
    register: '注 册',
    registering: '注 册 中...',
    profile: '个人中心',
    // 操作成功提示
    addSuccess: '新增成功',
    editSuccess: '修改成功',
    deleteSuccess: '删除成功',
    importSuccess: '导入成功',
    exportSuccess: '导出成功',
    copySuccess: '复制成功',
    copyFail: '复制失败',
    saveSuccess: '保存成功',
    refreshSuccess: '刷新成功',
    clearSuccess: '清空成功',
    batchDeleteSuccess: '批量删除成功',
    uploadSuccess: '上传成功',
    restoreSuccess: '恢复成功',
    // 确认提示模板
    confirmDelete: '是否确认删除编号为 "{ids}" 的数据项？',
    confirmDeleteName: '是否确认删除名称为 "{name}" 的数据项？',
    confirmClear: '是否确认清空所有数据项？',
    confirmBatchDelete: '确认删除选中的 {count} 条数据？',
    confirmCancelAuth: '是否取消选中用户授权数据项？',
    confirmForceLogout: '是否确认强退名称为 "{name}" 的用户？',
    // 错误提示
    selectToDelete: '请选择要删除的数据',
    selectToImport: '请选择要导入的数据',
    selectToExport: '请选择要导出的数据',
    selectToEdit: '请选择要修改的数据',
    selectOneToUnlock: '请选择一条要解锁的记录',
    selectUser: '请选择要分配的用户',
    fileTooLarge: '文件大小不能超过 10MB',
    formValidationFailed: '表单校验未通过，请重新检查提交内容',
    // 系统提示
    systemTip: '系统提示',
    gotIt: '我知道了',
    downloading: '正在下载数据，请稍候',
    routeLoadFailed: '路由加载失败',
    loginExpired: '登录已过期，请重新登录',
    downloadError: '下载文件出现错误，请联系管理员！',
    // P2/N5：导出截断提示
    exportTruncated: '导出数据已达上限，仅导出部分记录（如需全量请缩小查询范围）',
    // request.ts 错误消息
    repeatSubmitWarning: '数据正在处理，请勿重复提交',
    requestSizeExceeded: '请求数据大小超出允许的5M限制，无法进行防重复提交验证。',
    sessionExpired: '无效的会话，或者会话已过期，请重新登录。',
    reloginCanceled: '用户取消重新登录。',
    usernameOrPasswordError: '用户名或密码错误',
    passwordError: '密码错误',
    requestParamError: '请求参数错误',
    noPermission: '当前操作没有权限',
    tooManyRequests: '请求过于频繁，请稍后再试',
    serviceUnavailable: '服务暂时不可用，请稍后重试',
    backendConnectionError: '后端接口连接异常',
    requestTimeout: '系统接口请求超时',
    requestError: '系统接口{code}异常',
    retryHint: '{message}，点击此处重试',
    // 通用加载/刷新失败提示（用于 catch 块向用户反馈）
    loadFailed: '数据加载失败，请刷新重试',
    loadDetailFailed: '详情加载失败，请稍后重试',
    submitFailed: '提交失败，请稍后重试',
    cacheRefreshFailed: '缓存刷新失败，前端可能显示脏数据',
    treeLoadFailed: '树结构加载失败',
    // G17：列表/请求类接口失败的统一反馈
    requestFailed: '请求失败，请稍后重试',
    // 通用列
    column: {
      id: '编号',
      name: '名称',
      status: '状态',
      createTime: '创建时间',
      updateTime: '更新时间',
      createBy: '创建者',
      updateBy: '更新者',
      remark: '备注',
      operation: '操作',
      sort: '序号',
      type: '类型',
      description: '描述',
      size: '大小',
      duration: '耗时',
      progress: '进度',
      message: '消息',
      operator: '操作者',
      result: '结果'
    },
    form: {
      startDate: '开始日期',
      endDate: '结束日期',
      keyword: '请输入关键词',
      selectPlaceholder: '请选择',
      inputPlaceholder: '请输入'
    },
    formDraft: {
      confirmRestore: '检测到未提交的草稿，是否恢复？',
      restoreSuccess: '草稿已恢复',
      restoreFailed: '草稿恢复失败'
    }
  },
  menu: {
    // 菜单 i18n key 翻译表：后端 sys_menu.i18n_key 存储key（如 "menu.user"），
    // 前端 useMenuTitle.translateTitle() 通过 t(i18nKey) 翻译，未匹配时回退到 menu_name
    system: '系统管理',
    monitor: '系统监控',
    tool: '系统工具',
    user: '用户管理',
    role: '角色管理',
    menu: '菜单管理',
    dept: '部门管理',
    post: '岗位管理',
    dict: '字典管理',
    config: '参数设置',
    notice: '通知公告',
    log: '日志管理',
    operlog: '操作日志',
    logininfor: '登录日志',
    online: '在线会话',
    job: '定时任务',
    druid: '数据监控',
    cache: '缓存管理',
    health: '健康检查',
    gen: '代码生成',
    build: '表单构建',
    swagger: '接口文档',
    file: '文件管理',
    rateLimit: '限流配置',
    backup: '备份管理',
    task: '任务进度',
    auditDashboard: '审计大屏',
    ipLocation: 'IP 库管理',
    myLogin: '我的登录',
    about: '关于系统',
    noticeCenter: '通知中心',
    mySession: '会话管理',
    workbench: '个人工作台',
    workbenchIndex: '工作台首页',
    shortcuts: '快捷键中心',
    help: '帮助中心',
    helpCenter: '帮助中心',
    changelog: '更新日志',
    dashboard: '数据看板',
    website: 'Yebot官网',
    componentNotFound: '组件「{view}」不存在，请检查菜单配置'
  },
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
  login: {
    title: 'Yebot 后台管理系统',
    username: '账号',
    password: '密码',
    code: '验证码',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
    remember: '记住用户名',
    welcome: '欢迎回来',
    registerNow: '立即注册',
    signIn: '立即登录',
    registerDisabled: '系统未开放注册，如有需要请联系管理员',
    logout: '退出重新登录',
    clickRefreshCaptcha: '点击刷新验证码',
    totpCode: '动态验证码（6 位）',
    captchaLoadFailed: '验证码加载失败，请点击重试'
  },
  register: {
    title: '注册',
    username: '账号',
    password: '密码',
    confirmPassword: '确认密码',
    code: '验证码',
    submit: '注 册',
    clickRefreshCaptcha: '点击刷新验证码',
    passwordMismatch: '两次输入的密码不一致',
    successTitle: '恭喜你，您的账号 {username} 注册成功！',
    successMessage: '请使用新账号登录系统'
  },
  lock: {
    title: '系统已锁定',
    tip: '系统已锁定，请输入密码解锁',
    passwordPlaceholder: '请输入登录密码',
    passwordRequired: '请输入登录密码',
    unlock: '点击解锁',
    unlocking: '正在解锁',
    logout: '退出重新登录',
    // 日期单位
    year: '年',
    month: '月',
    day: '日',
    // 周几本地化
    weekdays: {
      sun: '星期日',
      mon: '星期一',
      tue: '星期二',
      wed: '星期三',
      thu: '星期四',
      fri: '星期五',
      sat: '星期六'
    }
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
      backHome: '返回首页'
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
    }
  },
  layout: {
    forceLogoutMessage: '您已被管理员强制下线，请重新登录',
    tour: {
      sidebarTitle: '侧边栏菜单',
      sidebarContent: '点击菜单项导航到对应页面。可点击折叠按钮收起侧边栏。',
      navbarTitle: '顶部导航栏',
      navbarContent: '包含面包屑、菜单搜索（Ctrl+K）、全屏切换、主题切换、通知铃铛、用户菜单等。',
      tagsViewTitle: '标签页',
      tagsViewContent: '已访问的页面会以标签页形式展示，右键标签可关闭/刷新/关闭其他。',
      appMainTitle: '主内容区',
      appMainContent: '当前页面的内容会在此区域显示。'
    },
    navbar: {
      skipToContent: '跳转到主内容',
      enterFullscreen: '进入全屏',
      exitFullscreen: '退出全屏',
      commandPalette: '命令面板 (Ctrl+K)',
      favorites: '收藏菜单',
      favEmpty: '暂无收藏菜单',
      favTip: '在侧边栏右键菜单添加收藏',
      clearFavorites: '清空收藏',
      recent: '最近访问',
      recentEmpty: '暂无访问记录',
      sourceCode: '源码地址',
      docs: '文档地址',
      themeMode: '主题模式',
      language: '多语言',
      layoutSize: '布局大小',
      preferences: '偏好设置',
      notifications: '消息通知',
      avatarAlt: '{name}的头像',
      layoutSettings: '布局设置',
      lockScreen: '锁定屏幕'
    },
    tagsView: {
      scrollLeft: '向左滚动标签',
      scrollRight: '向右滚动标签',
      closeTag: '关闭标签 {title}',
      closeCurrent: '关闭当前',
      closeOthers: '关闭其他',
      closeLeft: '关闭左侧',
      closeRight: '关闭右侧',
      closeAll: '全部关闭',
      fullscreen: '全屏显示',
      exitFullscreen: '退出全屏',
      refreshCurrent: '刷新当前页面',
      refreshPage: '刷新页面'
    },
    settings: {
      menuNavSetting: '菜单导航设置',
      leftMenu: '左侧菜单',
      mixedMenu: '混合菜单',
      topMenu: '顶部菜单',
      themeStyleSetting: '主题风格设置',
      autoThemeStyle: '跟随主题（自动）',
      autoThemePreview: '跟随主题风格预览',
      darkThemeStyle: '深色主题风格',
      darkThemePreview: '深色主题风格预览',
      lightThemeStyle: '浅色主题风格',
      lightThemePreview: '浅色主题风格预览',
      iconCheck: '图标: check',
      themeColor: '主题颜色',
      systemLayoutConfig: '系统布局配置',
      enableTagsView: '开启页签',
      persistTagsView: '持久化标签页',
      showTagsIcon: '显示页签图标',
      tagsViewStyle: '标签页样式',
      styleCard: '卡片',
      styleChrome: '谷歌',
      fixedHeader: '固定 Header',
      showLogo: '显示 Logo',
      dynamicTitle: '动态标题',
      footerCopyright: '底部版权',
      advancedThemeEditor: '高级主题编辑器',
      saveConfig: '保存配置',
      resetConfig: '重置配置',
      savingTip: '正在保存到本地，请稍候...',
      resettingTip: '正在清除设置并刷新，请稍候...'
    },
    headerNotice: {
      detailTitle: '公告详情',
      empty: '暂无公告',
      statusClosed: '已关闭',
      ariaWithUnread: '消息通知，{count} 条未读',
      ariaNoUnread: '消息通知，无未读消息'
    },
    topNav: {
      moreMenus: '更多菜单'
    },
    innerLink: {
      loading: '正在加载页面，请稍候！'
    }
  },
  dashboard: {
    totalUsers: '用户总数',
    activeRoles: '角色数量',
    activeRolesSuffix: '个启用',
    todayLogin: '今日登录',
    onlineUsers: '在线用户',
    realtime: '实时',
    todayAnomaly: '今日异常登录 IP',
    loginTrend: '登录趋势（最近 14 天）',
    operTypeDist: '操作类型分布',
    userCreateTrend: '用户创建趋势（最近 30 天）',
    recentOperLog: '最近操作日志',
    loginStatTitle: '登录统计（最近 7 天）',
    loginStatSummary: '成功 {success} / 失败 {fail}',
    chartLoadFail: '图表加载失败，请重试',
    loginTrendLoadFail: '登录趋势加载失败',
    operDistLoadFail: '操作分布加载失败',
    userTrendLoadFail: '用户创建趋势加载失败',
    buttonSuccess: '成功',
    buttonFail: '失败',
    buttonAll: '全部',
    operTypeAdd: '新增',
    operTypeUpdate: '修改',
    operTypeDelete: '删除',
    operTypeOther: '其他',
    versionTitle: '当前版本:',
    visitRepo: '访问仓库',
    visitHome: '访问主页',
    welcomeTitle: 'Yebot后台管理框架',
    welcomeDesc:
      'Yebot管理系统可以用于所有的Web应用程序，如网站管理后台，网站会员中心，CMS，CRM，OA等等，您也可以对她进行深度定制，以做出更强系统。所有前端后台代码封装过后十分精简易上手，出错概率低。同时支持移动客户端访问。系统会陆续更新一些实用功能。',
    freeOpenSource: '免费开源',
    techStack: '技术选型',
    backendTech: '后端技术',
    frontendTech: '前端技术',
    contactInfo: '联系信息',
    officialSite: '官网：',
    wechat: '微信：',
    alipay: '支付宝：',
    changelog: '更新日志',
    donate: '捐赠支持',
    donateTip: '你可以请作者喝杯咖啡表示鼓励',
    weekNew: '本周新增',
    failIpCount: '失败 IP 数',
    quickEntry: {
      title: '快捷入口',
      tip: '点击下方按钮可快速跳转到对应功能页面',
      userManage: '用户管理',
      userManageDesc: '管理后台用户账号',
      roleManage: '角色管理',
      roleManageDesc: '配置角色与权限',
      notice: '发布公告',
      noticeDesc: '发布系统公告通知',
      backup: '数据备份',
      backupDesc: '数据库备份与恢复',
      operLog: '操作日志',
      operLogDesc: '查看系统操作记录',
      myLogin: '我的登录',
      myLoginDesc: '查看个人登录历史',
      config: '系统配置',
      configDesc: '参数与全局设置',
      about: '关于系统',
      aboutDesc: '版本与技术栈信息'
    }
  },
  myLogin: {
    title: '我的登录',
    currentUser: '当前登录用户',
    recentCount: '最近 30 天登录次数',
    successFail: '成功 {success} / 失败 {fail}',
    commonIps: '常用登录 IP',
    anomaly: '异常登录检测',
    anomalyYes: '有异常',
    anomalyNo: '正常',
    anomalyBannerTitle: '检测到异常登录行为',
    anomalyBannerDetail:
      '最近 30 天共检测到 {total} 次登录尝试，其中失败 {fail} 次，来自 {ips} 个不同 IP。如发现非本人操作，请立即修改密码并检查 TOTP 设置。',
    anomalyTextWarn: '失败 {fail} 次 / 不同 IP {ips} 个',
    anomalyTextOk: '未发现异常',
    currentSession: '本次登录',
    searchStatus: '登录状态',
    allStatus: '全部状态',
    searchTime: '登录时间',
    startDate: '开始日期',
    endDate: '结束日期',
    reanalyze: '重新分析异常',
    columnTime: '登录时间',
    columnStatus: '状态',
    columnIp: 'IP 地址',
    columnLocation: '登录地点',
    columnBrowser: '浏览器',
    columnOs: '操作系统',
    columnMsg: '提示消息',
    columnSession: '当前会话',
    sessionTag: '本次',
    success: '成功',
    failed: '失败',
    reanalyzeSuccess: '已重新分析最近登录记录'
  },
  about: {
    title: '关于系统',
    projectInfo: '项目信息',
    projectName: 'Yebot 管理系统',
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
  noticeCenter: {
    title: '通知中心',
    unread: '未读通知',
    unreadTip: '尚未阅读的通知',
    total: '通知总数',
    totalTip: '所有通知公告',
    read: '已读通知',
    readTip: '已阅读的通知',
    filterAll: '全部',
    filterUnread: '未读',
    filterNotice: '通知',
    filterAnnouncement: '公告',
    searchPlaceholder: '搜索通知标题',
    markAllRead: '全部已读',
    markAllReadSuccess: '已全部标记为已读',
    markAllReadSuccessCount: '已标记 {count} 条通知为已读',
    markReadFail: '标记已读失败，请稍后重试',
    batchRead: '批量已读',
    colStatus: '状态',
    colType: '类型',
    colTitle: '标题',
    colCreateBy: '创建者',
    colCreateTime: '创建时间',
    unreadTag: '未读',
    readTag: '已读',
    typeNotice: '通知',
    typeAnnouncement: '公告',
    typeMessage: '消息',
    markRead: '标记已读',
    detailTitle: '通知详情',
    noContent: '暂无内容',
    batchReadConfirm: '将选中的 {count} 条通知标记为已读？',
    markAllReadConfirm: '将所有未读通知标记为已读？',
    loadFail: '加载通知失败',
    syncReadFail: '同步已读状态失败',
    noUnreadTip: '所有通知均已阅读'
  },
  mySession: {
    title: '会话管理',
    activeCount: '活跃会话数',
    activeTip: '当前在线会话总数',
    currentSession: '当前会话',
    securityStatus: '安全状态',
    otherSessionAlert: '检测到其他活跃会话',
    otherSessionAlertDesc: '如果您不认识其中的某些会话，请立即注销它们并修改密码。',
    onlySessionAlert: '仅有当前会话，账号安全',
    searchIp: '搜索 IP 地址',
    colStatus: '状态',
    colIp: 'IP 地址',
    colLocation: '归属地',
    colBrowser: '浏览器',
    colOs: '操作系统',
    colLoginTime: '登录时间',
    currentTag: '当前',
    otherTag: '其他',
    logout: '注销',
    logoutConfirm: '确认注销来自 {ip}（{browser}）的会话？',
    logoutSuccess: '会话已注销',
    logoutFail: '注销失败',
    secureGood: '安全',
    secureNormal: '注意',
    secureWarn: '风险',
    secureGoodTip: '仅有当前会话',
    secureNormalTip: '有 1 个其他会话',
    secureWarnTip: '有 {count} 个其他会话',
    loadFail: '加载会话列表失败'
  },
  theme: {
    modeTitle: '外观模式',
    light: '亮色',
    dark: '暗色',
    auto: '跟随系统',
    lightDesc: '始终使用亮色主题',
    darkDesc: '始终使用暗色主题',
    autoDesc: '跟随系统主题自动切换',
    applied: '主题已切换'
  },
  workbench: {
    profile: '个人中心',
    notices: '通知中心',
    weekLogins: '本周登录',
    unreadNotices: '未读通知',
    activeSessions: '活跃会话',
    favorites: '我的收藏',
    recentTitle: '最近访问',
    recentEmpty: '暂无访问记录',
    favTitle: '我的收藏',
    favEmpty: '暂无收藏菜单',
    unreadTitle: '未读通知',
    noUnread: '所有通知均已阅读',
    viewAll: '查看全部',
    typeNotice: '通知',
    typeAnnouncement: '公告',
    shortcutTitle: '快捷入口',
    greetingNight: '深夜好',
    greetingMorning: '早上好',
    greetingForenoon: '上午好',
    greetingNoon: '中午好',
    greetingAfternoon: '下午好',
    greetingEvening: '晚上好',
    justNow: '刚刚',
    minutesAgo: '分钟前',
    hoursAgo: '小时前',
    daysAgo: '天前',
    shortcutProfile: '个人中心',
    shortcutNotice: '通知中心',
    shortcutLogin: '我的登录',
    shortcutSession: '会话管理',
    shortcutHotkey: '快捷键',
    shortcutHelp: '帮助中心',
    shortcutAbout: '关于系统',
    shortcutLock: '锁屏',
    noRole: '未分配角色',
    noDept: '未分配部门',
    clearRecentConfirm: '确认清空所有最近访问记录？',
    clearFavConfirm: '确认清空所有收藏菜单？'
  },
  shortcuts: {
    title: '快捷键中心',
    desc: '查看系统全部快捷键，支持搜索过滤。可在偏好设置中自定义快捷键。',
    searchPlaceholder: '搜索快捷键或功能名称...',
    groups: {
      global: '全局操作',
      personal: '个人操作',
      navigation: '页面导航'
    },
    actions: {
      search: '命令面板',
      help: '显示快捷键帮助',
      fullscreen: '切换全屏',
      toggleSidebar: '折叠/展开侧边栏',
      lockScreen: '锁屏',
      toggleDark: '切换暗黑模式',
      settings: '打开设置面板',
      cycleTheme: '循环切换主题色',
      goBack: '后退',
      goForward: '前进',
      closeTab: '关闭当前标签',
      refreshTab: '刷新当前页'
    },
    descriptions: {
      search: '快速跳转菜单、执行命令或查找功能',
      help: '弹出本帮助面板',
      fullscreen: '在全屏和窗口模式间切换',
      toggleSidebar: '折叠或展开左侧菜单',
      lockScreen: '锁定屏幕，需要密码解锁',
      toggleDark: '在亮色和暗色主题间切换',
      settings: '打开布局与偏好设置抽屉',
      cycleTheme: '在预设主题色间循环切换',
      goBack: '返回上一个访问的页面',
      goForward: '前进到下一个访问的页面',
      closeTab: '关闭当前多标签页',
      refreshTab: '刷新当前页面内容'
    },
    tipTitle: '使用提示',
    tipCustomize: '在「偏好设置 > 快捷键」中可自定义全部快捷键组合。',
    tipConflicts: '若与浏览器快捷键冲突，请在偏好设置中改为不冲突的组合。',
    tipBrowser: '部分快捷键在浏览器中已被占用（如 Ctrl+N），无法被网页拦截。',
    noResult: '未找到匹配的快捷键',
    copySuccess: '快捷键组合已复制到剪贴板',
    copyFail: '复制失败，请手动选择文本',
    keyboardShortcuts: '键盘快捷键',
    settingsPanelTip: '已打开设置面板',
    openSettingsTip: '点击右上角设置图标打开设置面板',
    // 帮助面板条目（与 shortcuts.actions 对应，但带按键说明）
    helpItem: {
      help: '显示本帮助面板',
      search: '打开命令面板',
      fullscreen: '切换全屏',
      lockScreen: '锁屏',
      toggleDark: '切换暗黑模式',
      settings: '打开设置面板',
      toggleSidebar: '折叠/展开侧边栏',
      cycleTheme: '循环切换主题色'
    }
  },
  // TierA-5: 密码强度指示器
  passwordStrength: {
    weak: '弱',
    medium: '中',
    strong: '强',
    veryStrong: '非常强',
    tipLength: '建议使用 9 位以上密码',
    tipUpper: '建议包含大写字母',
    tipNumber: '建议包含数字',
    tipSpecial: '建议包含特殊字符'
  },
  // TierA-6: 表格打印
  printTable: {
    title: '数据打印',
    print: '打 印',
    printed: '打印窗口已打开',
    printFail: '打印失败，请重试',
    noData: '没有可打印的数据'
  },
  // TierB-1: 错误边界
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
        intro: '欢迎使用 Yebot 后台管理系统，以下几步帮您快速开始：',
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
        websiteDesc: 'yebot.dev',
        email: '邮件支持',
        emailDesc: "support{'@'}yebot.dev"
      }
    }
  },
  user: {
    title: '用户管理',
    search: {
      username: '用户名称',
      phUsername: '请输入用户名称',
      phone: '手机号码',
      phPhone: '请输入手机号码',
      status: '状态',
      phStatus: '用户状态',
      dept: '部门',
      phDept: '请输入部门名称',
      createTime: '创建时间'
    },
    column: {
      id: '用户编号',
      username: '用户名称',
      nickName: '用户昵称',
      dept: '部门',
      phone: '手机号码',
      status: '状态',
      createTime: '创建时间'
    },
    form: {
      username: '用户名称',
      nickName: '用户昵称',
      dept: '归属部门',
      phone: '手机号码',
      email: '邮箱',
      status: '状态',
      password: '用户密码',
      phPassword: '请输入用户密码',
      sex: '性别',
      role: '角色',
      remark: '备注',
      post: '岗位'
    },
    tip: {
      editPwd: '请输入新密码',
      resetPwdTitle: '重置密码',
      oldPwd: '旧密码',
      importUser: '导入用户',
      confirmStatusChange: '确认要"{text}""{name}"用户吗?',
      resetPwdSuccess: '修改成功，新密码是：{password}'
    },
    validate: {
      userNameRequired: '用户名称不能为空',
      userNameLength: '用户名称长度必须介于 2 和 20 之间',
      nickNameRequired: '用户昵称不能为空',
      emailRequired: '邮箱地址不能为空',
      emailFormat: '请输入正确的邮箱地址',
      phoneRequired: '手机号码不能为空',
      phoneFormat: '请输入正确的手机号码',
      phoneRegion: '手机号与所选国家/地区不匹配',
      oldPasswordRequired: '旧密码不能为空',
      confirmPasswordRequired: '确认密码不能为空',
      passwordNotMatch: '两次输入的密码不一致'
    },
    authRole: {
      title: '角色信息'
    },
    resetPwd: '重置密码',
    assignRoles: '分配角色',
    initialPasswordWarning: '您的密码还是初始密码，请修改密码！',
    passwordExpiredWarning: '您的密码已过期，请尽快修改密码！',
    securityTip: '安全提示'
  },
  role: {
    title: '角色管理',
    search: {
      roleName: '角色名称',
      phRoleName: '请输入角色名称',
      roleKey: '权限字符',
      phRoleKey: '请输入权限字符',
      status: '状态',
      phStatus: '角色状态',
      createTime: '创建时间'
    },
    column: {
      id: '角色编号',
      roleName: '角色名称',
      roleKey: '权限字符',
      sort: '显示顺序',
      status: '状态',
      createTime: '创建时间'
    },
    form: {
      roleName: '角色名称',
      roleKey: '权限字符',
      roleSort: '显示顺序',
      status: '状态',
      dataScope: '数据范围',
      menuTree: '菜单权限',
      deptTree: '数据权限',
      remark: '备注'
    },
    authUser: {
      batchCancel: '批量取消授权',
      cancel: '取消授权',
      confirmCancelAuth: '确认要取消该用户"{name}"角色吗？',
      cancelAuthSuccess: '取消授权成功',
      confirmBatchCancel: '是否取消选中用户授权数据项？'
    },
    label: {
      selectAll: '全选/全不选',
      linkage: '父子联动'
    },
    selectUser: {
      title: '选择用户',
      selectUser: '请选择要分配的用户'
    },
    dataScope: '数据权限',
    tip: {
      roleKeyHelp: "控制器中定义的权限字符，如：＠PreAuthorize(`＠ss.hasRole('admin')`)",
      confirmStatusChange: '确认要"{text}""{name}"角色吗?'
    },
    dataScopeOptions: {
      all: '全部数据权限',
      custom: '自定数据权限',
      dept: '本部门数据权限',
      deptAndBelow: '本部门及以下数据权限',
      self: '仅本人数据权限'
    },
    validate: {
      roleNameRequired: '角色名称不能为空',
      roleKeyRequired: '权限字符不能为空',
      roleSortRequired: '角色顺序不能为空'
    }
  },
  userAuthRole: {
    submit: '提交',
    back: '返回',
    authSuccess: '授权成功'
  },
  dict: {
    title: '字典管理',
    search: {
      dictName: '字典名称',
      phDictName: '请输入字典名称',
      dictType: '字典类型',
      phDictType: '请输入字典类型',
      status: '状态',
      phStatus: '字典状态',
      createTime: '创建时间'
    },
    column: {
      id: '字典编号',
      dictName: '字典名称',
      dictType: '字典类型',
      status: '状态',
      remark: '备注',
      createTime: '创建时间'
    },
    form: {
      dictName: '字典名称',
      dictType: '字典类型',
      status: '状态',
      remark: '备注'
    },
    data: {
      title: '字典数据',
      label: '数据标签',
      labelEn: '英文标签',
      value: '数据键值',
      sort: '显示排序',
      listClass: '回显样式',
      cssClass: '样式属性',
      status: '状态',
      remark: '备注',
      listClassOptions: {
        default: '默认',
        primary: '主要',
        success: '成功',
        info: '信息',
        warning: '警告',
        danger: '危险'
      }
    },
    detail: {
      loading: '加载中...',
      noData: '暂无字典数据',
      total: '共计条目',
      normal: '正常',
      disabled: '停用',
      label: '标签',
      value: '键值',
      status: '状态'
    },
    tip: {
      dictTypeHelp: '数据存储中的Key值，如：sys_user_sex'
    },
    validate: {
      dictNameRequired: '字典名称不能为空',
      dictTypeRequired: '字典类型不能为空',
      dataLabelRequired: '数据标签不能为空',
      dataValueRequired: '数据键值不能为空',
      dataSortRequired: '数据顺序不能为空'
    }
  },
  config: {
    title: '参数设置',
    search: {
      configName: '参数名称',
      phConfigName: '请输入参数名称',
      configKey: '参数键名',
      phConfigKey: '请输入参数键名',
      configType: '系统内置',
      phConfigType: '系统内置',
      createTime: '创建时间'
    },
    column: {
      id: '参数主键',
      configName: '参数名称',
      configKey: '参数键名',
      configValue: '参数键值',
      configType: '系统内置',
      remark: '备注',
      createTime: '创建时间'
    },
    form: {
      configName: '参数名称',
      configKey: '参数键名',
      configValue: '参数键值',
      configType: '系统内置',
      remark: '备注'
    },
    validate: {
      configNameRequired: '参数名称不能为空',
      configKeyRequired: '参数键名不能为空',
      configValueRequired: '参数键值不能为空'
    }
  },
  rateLimit: {
    title: '限流配置',
    titleAdd: '添加限流配置',
    titleEdit: '修改限流配置',
    search: {
      routePattern: '路由前缀',
      phRoutePattern: '请输入路由前缀',
      enabled: '启用状态'
    },
    column: {
      id: 'ID',
      routePattern: '路由前缀',
      capacity: '桶容量',
      refillPerSecond: '补充速率(/秒)',
      enabled: '启用状态',
      description: '描述',
      createTime: '创建时间'
    },
    form: {
      routePattern: '路由前缀',
      phRoutePattern: '请输入路由前缀，如 /system/user、/login、*',
      capacity: '桶容量',
      capacityTip: '突发请求上限',
      phCapacity: '1-10000',
      refillPerSecond: '补充速率',
      refillTip: '每秒补充令牌数',
      phRefillPerSecond: '0.1-1000',
      enabled: '启用状态',
      description: '描述',
      phDescription: '请输入描述'
    },
    validate: {
      routePatternRequired: '路由前缀不能为空',
      capacityRequired: '桶容量不能为空',
      capacityRange: '桶容量范围为 1-10000',
      refillRequired: '补充速率不能为空',
      refillRange: '补充速率范围为 0.1-1000'
    },
    buttons: {
      add: '新增',
      edit: '修改',
      delete: '删除',
      export: '导出',
      search: '搜索',
      reset: '重置',
      confirm: '确 定',
      cancel: '取 消',
      globalDefault: '全局默认'
    },
    tip: {
      confirmDelete: '是否确认删除限流配置编号为"{ids}"的数据项？',
      confirmStatusChange: '确认要"{text}""{name}"限流配置吗？',
      statusChangeSuccess: '{text}成功'
    }
  },
  auditDashboard: {
    title: '审计大屏',
    stat: {
      totalOps: '操作总数',
      successOps: '成功操作',
      failOps: '失败操作',
      activeUsers: '活跃用户数'
    },
    chart: {
      trend: '操作趋势',
      trendRange: '操作趋势（最近 {days} 天）',
      businessDist: '业务类型分布',
      topUsers: 'Top 10 活跃用户',
      failTrend: '异常操作时序',
      failCount: '失败次数'
    },
    btn: {
      exportPdf: '导出合规报告',
      days7: '7天',
      days14: '14天',
      days30: '30天'
    },
    tip: {
      clickToViewOperlog: '点击饼图扇区可跳转到操作日志并按业务类型筛选'
    },
    businessType: {
      other: '其他',
      insert: '新增',
      update: '修改',
      delete: '删除',
      grant: '授权',
      export: '导出',
      import: '导入',
      forceLogout: '强退',
      genCode: '生成代码',
      clean: '清空数据'
    },
    report: {
      title: '审计合规报告',
      period: '报告周期',
      totalOps: '操作总数',
      successOps: '成功操作',
      failOps: '失败操作',
      successRate: '成功率',
      businessType: '业务类型',
      operCount: '操作次数',
      username: '用户名',
      time: '时间',
      module: '模块',
      operator: '操作人',
      ip: 'IP',
      errorMsg: '错误信息',
      noData: '暂无报告数据',
      exportSuccess: '合规报告导出成功',
      exportFail: '导出 PDF 失败',
      sectionOverview: '一、操作总览',
      section2: '二、业务类型分布',
      section3: '三、Top 10 活跃用户',
      sectionAnomalies: '四、异常操作列表（最近 {count} 条）',
      unknownBusinessType: '类型{type}',
      periodConnector: '至',
      generatedAt: '生成时间',
      footerDisclaimer: '本报告由 yebot 系统自动生成 | 仅供审计合规用途'
    }
  },
  dept: {
    title: '部门管理',
    search: {
      deptName: '部门名称',
      phDeptName: '请输入部门名称',
      status: '状态'
    },
    column: {
      name: '部门名称',
      order: '显示顺序',
      status: '状态',
      createTime: '创建时间'
    },
    form: {
      parentDept: '上级部门',
      deptName: '部门名称',
      order: '显示顺序',
      leader: '负责人',
      phone: '联系电话',
      email: '邮箱',
      status: '状态'
    },
    tip: {
      noSortChange: '未检测到排序修改',
      sortSaved: '排序保存成功',
      confirmDelete: '是否确认删除名称为"{name}"的数据项？'
    },
    validate: {
      parentDeptRequired: '上级部门不能为空',
      deptNameRequired: '部门名称不能为空',
      orderNumRequired: '显示排序不能为空',
      emailFormat: '请输入正确的邮箱地址',
      phoneFormat: '请输入正确的手机号码'
    }
  },
  post: {
    title: '岗位管理',
    search: {
      postCode: '岗位编码',
      phPostCode: '请输入岗位编码',
      postName: '岗位名称',
      phPostName: '请输入岗位名称',
      status: '状态'
    },
    column: {
      id: '岗位编号',
      postCode: '岗位编码',
      postName: '岗位名称',
      sort: '显示顺序',
      status: '状态',
      createTime: '创建时间'
    },
    form: {
      postName: '岗位名称',
      postCode: '岗位编码',
      postSort: '显示顺序',
      status: '状态',
      remark: '备注'
    },
    tip: {
      confirmDelete: '是否确认删除岗位编号为"{ids}"的数据项？'
    },
    validate: {
      postNameRequired: '岗位名称不能为空',
      postCodeRequired: '岗位编码不能为空',
      postSortRequired: '岗位顺序不能为空'
    }
  },
  menuModule: {
    title: '菜单管理',
    search: {
      menuName: '菜单名称',
      phMenuName: '请输入菜单名称',
      status: '状态',
      phStatus: '菜单状态'
    },
    column: {
      name: '菜单名称',
      icon: '图标',
      sort: '排序',
      perms: '权限标识',
      path: '组件路径',
      status: '状态'
    },
    form: {
      parentMenu: '上级菜单',
      phParentMenu: '选择上级菜单',
      menuType: '菜单类型',
      menuName: '菜单名称',
      phMenuName: '请输入菜单名称',
      order: '显示排序',
      icon: '菜单图标',
      phIcon: '点击选择图标',
      perms: '权限标识',
      phPerms: '请输入权限标识',
      path: '路由地址',
      phPath: '请输入路由地址',
      component: '组件路径',
      phComponent: '请输入组件路径',
      query: '路由参数',
      phQuery: '请输入路由参数',
      isFrame: '是否外链',
      cache: '是否缓存',
      visible: '显示状态',
      status: '菜单状态',
      routeName: '路由名称',
      phRouteName: '请输入路由名称',
      i18nKey: '国际化 key',
      phI18nKey: '请输入国际化 key，如 menu.user',
      i18nKeyColumn: '国际化 Key'
    },
    tip: {
      menuTypeDir: '目录',
      menuTypeMenu: '菜单',
      menuTypeButton: '按钮',
      link: '外链',
      cache: '缓存',
      noCache: '不缓存',
      noSortChange: '未检测到排序修改',
      sortSaved: '排序保存成功',
      confirmDelete: '是否确认删除名称为"{name}"的数据项？',
      routeNameHelp:
        '默认不填则和路由地址相同：如地址为：`user`，则名称为`User`（注意：因为router会删除名称相同路由，为避免名字的冲突，特殊情况下请自定义，保证唯一性）',
      isFrameHelp: '选择是外链则路由地址需要以`http(s)://`开头',
      pathHelp: '访问的路由地址，如：`user`，如外网地址需内链访问则以`http(s)://`开头',
      componentHelp: '访问的组件路径，如：`system/user/index`，默认在`views`目录下',
      permsHelp: "控制器中定义的权限字符，如：＠PreAuthorize(`＠ss.hasPermi('system:user:list')`)",
      queryHelp: '访问路由的默认传递参数，如：`｛"id": 1, "name": "ry"｝`',
      cacheHelp: '选择是则会被`keep-alive`缓存，需要匹配组件的`name`和地址保持一致',
      visibleHelp: '选择隐藏则路由将不会出现在侧边栏，但仍然可以访问',
      statusHelp: '选择停用则路由将不会出现在侧边栏，也不能被访问',
      i18nKeyHelp:
        '可选。填写后，前端会优先按此 key 翻译菜单标题（如 `menu.user`），未匹配时回退到菜单名称原文。留空则直接显示菜单名称。'
    },
    validate: {
      menuNameRequired: '菜单名称不能为空',
      orderNumRequired: '菜单顺序不能为空',
      pathRequired: '路由地址不能为空'
    }
  },
  notice: {
    title: '通知公告',
    search: {
      title: '公告标题',
      phTitle: '请输入公告标题',
      createBy: '创建者',
      phCreateBy: '请输入创建者',
      type: '公告类型'
    },
    column: {
      id: '公告编号',
      title: '公告标题',
      type: '公告类型',
      createBy: '创建者',
      createTime: '创建时间'
    },
    form: {
      title: '公告标题',
      type: '公告类型',
      content: '公告内容',
      status: '状态',
      emailNotify: '邮件通知',
      emailTip: '同时通过邮件通知所有启用状态用户',
      emailInactive: '否',
      emailOnlyEnabled: '仅在系统邮件配置启用时生效'
    },
    btn: {
      readUsers: '阅读用户'
    },
    readUsers: {
      dialogTitle: '「{title}」已读用户',
      totalReaders: '共 {count} 人已读',
      phSearch: '登录名称 / 用户名称',
      column: {
        id: '序号',
        loginName: '登录名称',
        userName: '用户名称',
        dept: '所属部门',
        phone: '手机号码',
        readTime: '阅读时间'
      }
    },
    tip: {
      confirmDelete: '是否确认删除公告编号为"{ids}"的数据项？'
    },
    validate: {
      noticeTitleRequired: '公告标题不能为空',
      noticeTypeRequired: '公告类型不能为空'
    }
  },
  task: {
    title: '任务进度中心',
    search: {
      taskType: '任务类型',
      phTaskType: '任务类型',
      status: '状态',
      phStatus: '状态',
      operator: '操作者',
      phOperator: '请输入操作者',
      createTime: '创建时间'
    },
    column: {
      id: '任务ID',
      name: '任务名称',
      type: '任务类型',
      status: '状态',
      progress: '进度',
      currentTotal: '当前/总量',
      operator: '操作者',
      resultMsg: '结果消息',
      createTime: '创建时间'
    },
    form: {
      taskTypeOperLog: '操作日志导出',
      taskTypeBackup: '数据备份',
      taskTypeOther: '其他',
      statusWaiting: '等待中',
      statusRunning: '进行中',
      statusCompleted: '已完成',
      statusFailed: '失败'
    },
    tip: {
      confirmDelete: '确认删除选中的 {count} 条任务记录？'
    },
    btn: {
      viewBackups: '查看备份'
    }
  },
  backup: {
    title: '备份管理',
    search: {
      type: '备份类型',
      phType: '备份类型',
      status: '状态',
      phStatus: '状态',
      createTime: '备份时间'
    },
    column: {
      id: '备份ID',
      fileName: '文件名',
      size: '文件大小',
      type: '备份类型',
      status: '状态',
      createBy: '创建者',
      createTime: '创建时间'
    },
    form: {
      manual: '手动备份',
      auto: '自动备份',
      success: '成功',
      fail: '失败'
    },
    btn: {
      create: '创建备份',
      download: '下载',
      restore: '恢复'
    },
    tip: {
      backupSuccess: '备份成功',
      restoreSuccess: '恢复成功',
      downloadFail: '下载失败',
      confirmDelete: '确认删除选中的 {count} 条备份记录及文件？',
      confirmCreate: '确认立即创建一个数据库备份？该操作可能耗时数秒至数分钟。',
      confirmRestore: '确认从备份 "{name}" 恢复数据库？此操作将覆盖当前数据库所有数据，不可撤销！'
    }
  },
  file: {
    title: '文件管理',
    search: {
      fileName: '文件名',
      phFileName: '文件名前缀',
      type: '类型',
      phType: '全部'
    },
    column: {
      fileName: '文件名',
      preview: '预览',
      type: '类型',
      size: '大小',
      updateTime: '修改时间'
    },
    btn: {
      upload: '上传文件',
      download: '下载',
      copyLink: '复制链接'
    },
    tip: {
      confirmDelete: '确认删除文件 "{name}" ？',
      confirmBatchDelete: '确认删除选中的 {count} 个文件？',
      linkCopied: '链接已复制',
      unsupportedType: '不支持的文件类型',
      externalLinkBlocked: '不支持下载外部链接，存在安全风险',
      batchDeletePartial: '共 {total} 个，成功 {success} 个，失败 {fail} 个'
    },
    unknownType: '未知',
    ariaLabel: {
      download: '下载',
      copyLink: '复制链接',
      preview: '预览图片'
    }
  },
  online: {
    title: '在线用户',
    tab: {
      allOnline: '全部在线',
      mySession: '我的会话'
    },
    search: {
      ipaddr: '登录地址',
      phIpaddr: '请输入登录地址',
      userName: '用户名称',
      phUserName: '请输入用户名称'
    },
    btn: {
      forceLogout: '强退'
    },
    tip: {
      confirmForceLogout: '是否确认强退名称为"{name}"的用户？'
    },
    column: {
      tokenId: '会话编号',
      userName: '登录名称',
      deptName: '所属部门',
      ipaddr: '主机',
      loginLocation: '登录地点',
      os: '操作系统',
      browser: '浏览器',
      loginTime: '登录时间'
    }
  },
  job: {
    title: '定时任务',
    search: {
      jobName: '任务名称',
      jobGroup: '任务组名',
      status: '任务状态',
      phJobName: '请输入任务名称',
      phJobGroup: '请选择任务组名',
      phStatus: '请选择任务状态'
    },
    column: {
      id: '任务编号',
      name: '任务名称',
      group: '任务组名',
      target: '调用目标字符串',
      cron: 'cron执行表达式',
      status: '状态',
      nextTime: '下次执行时间',
      createTime: '创建时间'
    },
    form: {
      jobName: '任务名称',
      jobGroup: '任务组名',
      invokeTarget: '调用目标字符串',
      cronExpression: 'cron执行表达式',
      misfirePolicy: '执行策略',
      concurrent: '是否并发',
      status: '状态',
      remark: '备注',
      phJobName: '请输入任务名称',
      invokeTargetLabel: '调用方法',
      invokeTargetTip:
        "Bean调用示例：ryTask.ryParams('ry')<br />Class类调用示例：com.yebot.quartz.task.RyTask.ryParams('ry')<br />参数说明：支持字符串，布尔类型，长整型，浮点型，整型",
      phInvokeTarget: '请输入调用目标字符串',
      cronExpressionLabel: 'cron表达式',
      phCronExpression: '请输入cron执行表达式',
      genExpression: '生成表达式'
    },
    btn: {
      log: '日志'
    },
    runOnce: '执行一次',
    jobLog: '调度日志',
    tip: {
      normal: '正常',
      fail: '失败',
      paused: '暂停',
      defaultPolicy: '默认策略',
      executeImmediate: '立即执行',
      executeOnce: '执行一次',
      abandon: '放弃执行',
      allowConcurrent: '允许',
      forbidConcurrent: '禁止',
      confirmChange: '确认要"{text}""{name}"任务吗？',
      confirmRunOnce: '确认要立即执行一次"{name}"任务吗？',
      runOnceSuccess: '执行成功',
      confirmDelete: '是否确认删除定时任务编号为"{ids}"的数据项？'
    },
    cronTitle: 'Cron表达式生成器',
    titleAdd: '添加任务',
    titleEdit: '修改任务',
    validate: {
      jobNameRequired: '任务名称不能为空',
      invokeTargetRequired: '调用目标字符串不能为空',
      cronExpressionRequired: 'cron执行表达式不能为空'
    }
  },
  jobLog: {
    title: '调度日志',
    tip: {
      confirmDelete: '是否确认删除调度日志编号为"{ids}"的数据项？',
      confirmClear: '是否确认清空所有调度日志数据项？'
    },
    search: {
      phJobName: '请输入任务名称',
      phJobGroup: '请选择任务组名',
      execStatus: '执行状态',
      phExecStatus: '请选择执行状态',
      execTime: '执行时间'
    },
    column: {
      jobLogId: '日志编号',
      jobMessage: '日志信息',
      status: '执行状态',
      createTime: '执行时间'
    },
    detail: {
      titleLog: '调度日志详细',
      titleJob: '任务详细',
      basicInfo: '基本信息',
      jobLogId: '日志编号',
      execStatus: '执行状态',
      startTime: '开始时间',
      endTime: '结束时间',
      recordTime: '记录时间',
      costTime: '执行耗时',
      millisecond: '毫秒',
      taskInfo: '任务信息',
      jobGroup: '任务分组',
      jobMessage: '日志信息',
      invokeTarget: '调用目标',
      exceptionInfo: '异常信息',
      taskConfig: '任务配置',
      scheduleInfo: '调度信息',
      cronExpression: 'cron 表达式',
      concurrent: '并发执行',
      execMethod: '执行方法',
      metaInfo: '元信息',
      empty: '（无）'
    }
  },
  cache: {
    title: '缓存监控',
    list: {
      title: '缓存列表',
      keyListTitle: '键名列表',
      contentTitle: '缓存内容',
      column: {
        id: '序号',
        name: '缓存名称',
        remark: '备注',
        operation: '操作'
      },
      keyColumn: {
        id: '序号',
        key: '缓存键名',
        operation: '操作'
      },
      form: {
        name: '缓存名称:',
        key: '缓存键名:',
        content: '缓存内容:'
      },
      tip: {
        refreshSuccess: '刷新缓存列表成功',
        clearNameSuccess: '清理缓存名称[{name}]成功',
        refreshKeySuccess: '刷新键名列表成功',
        clearKeySuccess: '清理缓存键名[{key}]成功',
        selectCacheFirst: '请先在左侧选择缓存名称',
        selectKeyFirst: '请选择缓存键查看内容',
        confirmClearName: '是否确认清空缓存名称 "{name}" 的所有数据？',
        confirmClearKey: '是否确认清空缓存键 "{key}"？'
      }
    },
    info: {
      basicInfo: '基本信息',
      redisVersion: 'Redis版本',
      runMode: '运行模式',
      port: '端口',
      clients: '客户端数',
      uptimeDays: '运行时间(天)',
      usedMemory: '使用内存',
      usedCpu: '使用CPU',
      maxMemory: '内存配置',
      aofEnabled: 'AOF是否开启',
      rdbStatus: 'RDB是否成功',
      keyCount: 'Key数量',
      network: '网络入口/出口',
      commandStats: '命令统计',
      memoryInfo: '内存信息',
      standalone: '单机',
      cluster: '集群',
      memoryConsume: '内存消耗',
      peak: '峰值',
      command: '命令'
    },
    tip: {
      loading: '正在加载缓存监控数据，请稍候！',
      loadFailed: '加载缓存数据失败',
      notConnected: 'Redis 未连接，请检查缓存服务状态'
    }
  },
  // server 模块已合并到 health（P0-1），i18n 键已迁移到 health.column
  health: {
    title: '系统健康状态',
    btn: {
      refresh: '刷新'
    },
    column: {
      totalMemory: '总内存',
      usedMemory: '已用内存',
      freeMemory: '空闲内存',
      memoryUsage: '内存使用率',
      drivePath: '盘符路径',
      fileSystem: '文件系统',
      type: '类型',
      total: '总容量',
      used: '已用',
      free: '空闲',
      usage: '使用率',
      // 合并自 server 模块
      cpu: 'CPU',
      cpuNum: '核心数',
      cpuUsage: '使用率',
      sysUsage: '系统使用率',
      freeUsage: '空闲率',
      serverInfo: '运行环境',
      serverName: '服务器名称',
      os: '操作系统',
      serverIp: '服务器IP',
      osArch: '系统架构',
      projectPath: '项目路径',
      startTime: '启动时间',
      runTime: '运行时长'
    },
    form: {
      autoRefresh: '自动刷新（10秒）',
      lastUpdate: '最后更新：'
    },
    loading: '加载中',
    uptime: '运行时长：',
    database: '数据库',
    redis: 'Redis 缓存',
    cpuUsage: 'CPU 使用率',
    cpuNum: '核心数：',
    memUsage: '内存使用率',
    memDetail: '内存详情',
    diskInfo: '磁盘信息',
    serverInfo: '运行环境',
    unknown: '未知',
    systemNormal: '系统运行正常',
    systemDegraded: '系统部分功能降级',
    systemDown: '系统不可用',
    dbOk: '数据库连接正常',
    dbFail: '数据库连接失败',
    redisOk: '缓存连接正常',
    redisFail: '缓存连接失败',
    version: '版本 v',
    uptimeFormat: '{days}天 {hours}时 {minutes}分 {secs}秒'
  },
  operlog: {
    title: '操作日志',
    detail: {
      title: '操作日志详细',
      normal: '正常',
      abnormal: '异常',
      copy: '复制',
      diffCompare: '变更对比',
      diffTip: '对比请求参数（新值）与返回结果（修改后）中的字段差异，便于审计追踪',
      basicInfo: '基本信息',
      operModule: '操作模块',
      businessType: '业务类型',
      operTime: '操作时间',
      execStatus: '执行状态',
      operUser: '操作人员',
      dept: '所属部门',
      operAddress: '操作地址',
      requestInfo: '请求信息',
      operUrl: '请求地址',
      operMethod: '操作方法',
      costTime: '消耗时间',
      requestParam: '请求参数',
      responseParam: '返回参数',
      oldValue: '原值',
      newValue: '新值',
      errorMsg: '异常信息',
      noDiff: '无字段差异（请求参数与响应数据无重叠字段，或仅新增/删除操作）',
      empty: '（空）',
      noData: '（无数据）',
      millisecond: '毫秒'
    },
    column: {
      operId: '日志编号',
      title: '系统模块',
      businessType: '操作类型',
      operName: '操作人员',
      operIp: '操作地址',
      status: '操作状态',
      operTime: '操作日期',
      millisecond: '毫秒'
    },
    btn: {
      detail: '详细',
      exportPdf: '导出 PDF',
      exportFieldSelect: '选择导出字段'
    },
    tip: {
      confirmDelete: '是否确认删除日志编号为"{ids}"的数据项？',
      confirmClear: '是否确认清空所有操作日志数据项？',
      pdfExportSuccess: 'PDF 导出成功',
      pdfExportFail: 'PDF 导出失败，请重试'
    },
    search: {
      operIp: '操作地址',
      phOperIp: '请输入操作地址',
      title: '系统模块',
      phTitle: '请输入系统模块',
      operName: '操作人员',
      phOperName: '请输入操作人员',
      phBusinessType: '操作类型',
      phStatus: '操作状态',
      operTime: '操作时间'
    },
    exportField: {
      logId: '日志编号',
      moduleTitle: '模块标题',
      businessType: '业务类型',
      requestMethod: '请求方式',
      operName: '操作人员',
      requestUrl: '请求URL',
      operIp: '主机地址',
      status: '操作状态',
      errorMsg: '错误消息',
      operTime: '操作时间',
      costTime: '消耗时间(ms)'
    },
    // T-11：oper_log.title 存 i18n key（module.*），与后端 infer_module_title 对应
    module: {
      user: '用户管理',
      profile: '个人中心',
      role: '角色管理',
      menu: '菜单管理',
      dict: '字典管理',
      dept: '部门管理',
      post: '岗位管理',
      config: '参数设置',
      notice: '通知公告',
      job: '定时任务',
      operlog: '操作日志',
      logininfor: '登录日志',
      online: '在线会话',
      gen: '代码生成',
      common: '通用接口',
      auth: '认证管理',
      other: '其他'
    },
    pdfFilename: '操作日志'
  },
  logininfor: {
    title: '登录日志',
    tab: {
      allLog: '全部日志',
      myLogin: '我的登录'
    },
    btn: {
      unlock: '解锁'
    },
    column: {
      infoId: '访问编号',
      userName: '用户名称',
      ipaddr: '地址',
      loginLocation: '登录地点',
      os: '操作系统',
      browser: '浏览器',
      status: '登录状态',
      loginTime: '访问时间'
    },
    tip: {
      confirmDelete: '是否确认删除访问编号为"{ids}"的数据项？',
      confirmClear: '是否确认清空所有登录日志数据项？',
      confirmUnlock: '是否确认解锁用户"{name}"数据项？',
      unlockSuccess: '用户{name}解锁成功'
    },
    search: {
      ipaddr: '登录地址',
      phIpaddr: '请输入登录地址',
      userName: '用户名称',
      phUserName: '请输入用户名称',
      phStatus: '登录状态',
      loginTime: '登录时间'
    }
  },
  userView: {
    title: '用户信息详情',
    basicInfo: '基本信息',
    otherInfo: '其他信息',
    label: {
      userName: '用户名称：',
      dept: '归属部门：',
      phone: '手机号码：',
      email: '邮箱：',
      loginAccount: '登录账号：',
      status: '用户状态：',
      post: '岗位：',
      sex: '用户性别：',
      role: '角色：',
      createBy: '创建者：',
      createTime: '创建时间：',
      updateBy: '更新者：',
      updateTime: '更新时间：',
      lastLoginIp: '最后登录IP：',
      lastLoginTime: '最后登录时间：',
      remark: '备注：'
    },
    placeholder: {
      noPost: '无岗位',
      noRole: '无角色'
    }
  },
  profile: {
    title: '个人中心',
    basicInfo: '基本资料',
    modifyPwd: '修改密码',
    mfaSetting: '安全设置 (MFA)',
    label: {
      userName: '用户名称',
      phone: '手机号码',
      country: '国家/地区',
      email: '用户邮箱',
      dept: '所属部门',
      role: '所属角色',
      createTime: '创建日期'
    },
    sex: {
      male: '男',
      female: '女'
    },
    tip: {
      modifyPwdSuccess: '修改成功，请重新登录'
    },
    totp: {
      enabled: '已启用',
      disabled: '未启用',
      enabledTip: '您的账户已启用 TOTP 多因子认证',
      enabledDesc: '登录时需要输入 Google Authenticator 等认证器中显示的 6 位验证码。',
      step1: '生成密钥',
      step2: '扫码绑定',
      step3: '验证启用',
      setupIntro: '点击下方按钮生成 TOTP 密钥和二维码',
      scanQrTip: '使用 Google Authenticator / Microsoft Authenticator 扫描二维码：',
      manualInputTip: '无法扫码？手动输入密钥：',
      manualStep1: '打开认证器 App，选择"手动输入"',
      manualStep2: '账户名随意，密钥填入上方字符串',
      manualStep3: '类型选择"基于时间"（TOTP）',
      manualStep4: '位数 6 位，间隔 30 秒',
      codePlaceholder: '请输入认证器中的 6 位验证码',
      codeRequired: '请输入验证码',
      codeRule: '验证码必须是 6 位数字',
      passwordRequired: '请输入密码',
      keyGenSuccess: '密钥生成成功',
      keyGenFail: '生成密钥失败',
      enableSuccess: 'TOTP 启用成功',
      disableSuccess: 'TOTP 已关闭',
      keyCopied: '密钥已复制'
    },
    avatar: {
      uploadTip: '点击上传头像',
      currentAvatar: '当前头像，点击修改',
      previewAlt: '头像预览',
      formatError: '文件格式错误，请上传图片类型,如：JPG，PNG后缀的文件。',
      modifyTitle: '修改头像',
      zoomIn: '放大',
      zoomOut: '缩小',
      rotateLeft: '向左旋转',
      rotateRight: '向右旋转'
    }
  },
  ipLocation: {
    title: {
      detail: 'IP 库详细信息',
      config: 'IP 库管理配置',
      updateNow: '立即更新 IP 库'
    },
    stat: {
      mmdbStatus: 'mmdb 加载状态',
      mmdbDesc: 'GeoLite2-City 数据库',
      currentSource: '当前更新源',
      sourceDesc: 'P3TERX=镜像 / MaxMind=官方',
      fileSize: '文件大小',
      sizeDesc: 'mmdb 文件实际大小',
      lastModified: '最后修改时间',
      modifiedDesc: 'mmdb 文件最后更新时间',
      notLoaded: '未加载'
    },
    field: {
      mmdbPath: 'mmdb 文件路径',
      mmdbSize: 'mmdb 文件大小',
      mmdbModified: 'mmdb 最后修改',
      currentSource: '当前更新源',
      maxmindAccountId: 'MaxMind Account ID',
      maxmindLicenseKey: 'MaxMind License Key',
      autoUpdateCron: '自动更新 Cron',
      xdbStatus: 'ip2region xdb 状态',
      updateSource: '更新源',
      accountId: 'Account ID',
      licenseKey: 'License Key',
      autoUpdateEnabled: '启用定时自动更新',
      clearCredentials: '清空已存储的 MaxMind 凭据'
    },
    btn: {
      reload: '热加载',
      updateNow: '立即更新',
      config: '配置',
      confirmUpdate: '开始更新'
    },
    source: {
      mirror: '镜像',
      official: '官方',
      maxmindOfficial: 'MaxMind 官方',
      p3terxMirror: 'P3TERX 镜像'
    },
    hint: {
      cronFormat: '6 字段 cron 含秒，如 0 0 4 * * 2 = 每周二 04:00',
      xdbEnabled: '双库模式已启用，国内 IP 优先查 xdb',
      sourceP3terx:
        'P3TERX 镜像免凭据，从 GitHub 下载 GeoLite2-City.mmdb；MaxMind 官方需配置 Account ID 和 License Key',
      phAccountId: '请输入 MaxMind Account ID',
      phLicenseKey: '请输入 MaxMind License Key',
      credentialsConfigured: '已配置（留空表示保留原值）',
      autoUpdateTip: '启用后将按 cron 表达式自动更新：{cron}',
      clearCredentialsTip: '勾选后将清空已存储的凭据（适合切换到 P3TERX 源）',
      updateAlert: '更新操作将从远程下载 mmdb 文件（约 60-100 MB），下载完成后自动热加载，无需重启服务。'
    },
    validate: {
      sourceRequired: '请选择更新源',
      maxmindCredentialsRequired: '切换到 MaxMind 源需配置 Account ID 和 License Key'
    },
    tip: {
      confirmReload: '确认重新加载 mmdb 文件？适用于手动替换文件后触发。',
      reloadSuccess: '热加载成功',
      updateSuccess: '更新成功，新文件大小 {size}，耗时 {elapsed} 秒'
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
  crontab: {
    expression: '时间表达式',
    cron: 'Cron 表达式',
    btn: {
      confirm: '确定',
      reset: '重置',
      cancel: '取消'
    },
    tabs: {
      second: '秒',
      min: '分钟',
      hour: '小时',
      day: '日',
      month: '月',
      week: '周',
      year: '年'
    },
    multiSelectPlaceholder: '可多选',
    radio: {
      wildcardSecond: '秒，允许的通配符[, - * /]',
      wildcardMin: '分钟，允许的通配符[, - * /]',
      wildcardHour: '小时，允许的通配符[, - * /]',
      wildcardDay: '日，允许的通配符[, - * ? / L W]',
      wildcardMonth: '月，允许的通配符[, - * /]',
      wildcardWeek: '周，允许的通配符[, - * ? / L #]',
      wildcardYear: '不填，允许的通配符[, - * /]',
      unspecified: '不指定',
      everyYear: '每年',
      cycleFrom: '周期从',
      rangeFrom: '从',
      specify: '指定',
      cycleUnitSecond: '秒',
      cycleUnitMin: '分钟',
      cycleUnitHour: '时',
      cycleUnitDay: '日',
      cycleUnitMonth: '月',
      avgStartSecond: '秒开始，每',
      avgStartMin: '分钟开始， 每',
      avgStartHour: '时开始，每',
      avgStartDay: '号开始，每',
      avgStartMonth: '月开始，每',
      avgStartYear: '年开始，每',
      avgExecuteSecond: '秒执行一次',
      avgExecuteMin: '分钟执行一次',
      avgExecuteHour: '小时执行一次',
      avgExecuteDay: '日执行一次',
      avgExecuteMonth: '月月执行一次',
      avgExecuteYear: '年执行一次',
      monthlyPrefix: '每月',
      nearestWorkday: '号最近的那个工作日',
      lastDayOfMonth: '本月最后一天',
      nthWeekPrefix: '第',
      nthWeekSuffix: '周的',
      lastWeekOfMonth: '本月最后一个'
    },
    weeks: {
      sunday: '星期日',
      monday: '星期一',
      tuesday: '星期二',
      wednesday: '星期三',
      thursday: '星期四',
      friday: '星期五',
      saturday: '星期六'
    },
    months: {
      jan: '一月',
      feb: '二月',
      mar: '三月',
      apr: '四月',
      may: '五月',
      jun: '六月',
      jul: '七月',
      aug: '八月',
      sep: '九月',
      oct: '十月',
      nov: '十一月',
      dec: '十二月'
    },
    result: {
      recent: '最近5次运行时间',
      calculating: '计算结果中...',
      noResult: '没有达到条件的结果！',
      partialResult: '最近100年内只有上面{count}条结果！'
    }
  },
  editor: {
    placeholder: '请输入内容',
    imageFormatError: '图片格式错误!',
    fileSizeExceeded: '上传文件大小不能超过 {size} MB!',
    imageInsertFailed: '图片插入失败',
    uploadFail: '{n} 张图片上传失败',
    uploadSuccess: '{n} 张图片上传成功',
    linkPlaceholder: '请输入链接地址:',
    save: '保存',
    videoPlaceholder: '请输入视频地址:',
    textNormal: '文本',
    heading1: '标题1',
    heading2: '标题2',
    heading3: '标题3',
    heading4: '标题4',
    heading5: '标题5',
    heading6: '标题6',
    fontStandard: '标准字体',
    fontSerif: '衬线字体',
    fontMonospace: '等宽字体'
  },
  excelImport: {
    dragText: '将文件拖到此处，或',
    clickUpload: '点击上传',
    tip: '仅允许导入xls、xlsx格式文件。',
    downloadTemplate: '下载模板',
    confirm: '确 定',
    cancel: '取 消',
    title: '数据导入',
    updateSupportLabel: '是否更新已经存在的数据',
    importResult: '导入结果',
    fileTypeError: '请选择后缀为 "xls"或"xlsx"的文件。'
  },
  exportDialog: {
    title: '选择导出字段',
    range: '导出范围',
    allFields: '全部字段',
    selectedFields: '自选字段',
    selectField: '选择字段',
    selectAll: '全选',
    clear: '清空',
    selectedCount: '已选 {selected} / {total} 个字段',
    cancel: '取消',
    confirmExport: '确定导出',
    pleaseSelectField: '请至少选择一个字段'
  },
  fileUpload: {
    selectFile: '选取文件',
    uploadTip: '请上传',
    maxSize: '大小不超过',
    format: '格式为',
    fileSuffix: '的文件',
    delete: '删除',
    fileFormatError: '文件格式不正确，请上传{types}格式文件!',
    fileNameError: '文件名不正确，不能包含英文逗号!',
    fileSizeExceeded: '上传文件大小不能超过 {size} MB!',
    uploadingFile: '正在上传文件，请稍候...',
    fileCountExceed: '上传文件数量不能超过 {limit} 个!',
    uploadFailed: '上传文件失败'
  },
  headerSearch: {
    placeholder: '菜单搜索，支持标题、URL模糊查询',
    resultCount: '找到 {count} 个结果',
    noResult: '未找到 "{keyword}" 相关菜单',
    noResultTip: '试试其他关键词或路径',
    switchShortcut: '切换',
    selectShortcut: '选择',
    closeShortcut: '关闭',
    menuAriaLabel: '菜单：{title}'
  },
  rightToolbar: {
    hideSearch: '隐藏搜索',
    showSearch: '显示搜索',
    refresh: '刷新',
    columns: '显隐列',
    columnDisplay: '列展示',
    showHideTitle: '显示/隐藏',
    show: '显示',
    hide: '隐藏'
  },
  tour: {
    prev: '上一步',
    next: '下一步',
    finish: '完成',
    skip: '跳过引导',
    ariaLabel: '新手引导'
  },
  themeEditor: {
    themeColor: '主题色',
    custom: '自定义',
    customTip: '点击选择任意颜色',
    sideTheme: '侧边栏主题',
    sideAuto: '跟随主题',
    sideDark: '深色',
    sideLight: '浅色',
    darkMode: '暗黑模式',
    darkModeTip: '或按 Ctrl+Shift+D 切换',
    followSystem: '跟随系统',
    followSystemTip: '自动跟随操作系统的暗色模式',
    reset: '恢复默认',
    followSystemEnabled: '已开启跟随系统暗色模式',
    resetSuccess: '已恢复默认主题'
  },
  userPrefs: {
    title: '用户偏好设置',
    listDisplay: '列表显示',
    defaultPageSize: '默认每页条数',
    pageSizeUnit: '条',
    defaultSort: '默认排序',
    sortAsc: '升序',
    sortDesc: '降序',
    tableDensity: '表格密度',
    densityComfortable: '宽松',
    densityDefault: '默认',
    densityCompact: '紧凑',
    autoRefreshInterval: '自动刷新间隔',
    autoRefreshTip: '秒（0 表示禁用）',
    appearance: '外观',
    followSystemDark: '跟随系统暗色模式',
    followSystemDarkTip: '开启后自动跟随系统主题切换',
    security: '安全',
    watermark: '页面水印',
    watermarkTip: '在所有页面叠加用户名水印，防止截图泄露',
    sessionTimeout: '会话超时',
    sessionTimeoutTip: '分钟（0 表示禁用，无操作自动登出）',
    timezone: '时区',
    timezoneSection: '时区',
    tzShanghai: '北京/上海',
    tzTokyo: '东京',
    tzSingapore: '新加坡',
    tzNewYork: '纽约',
    tzLosAngeles: '洛杉矶',
    tzLondon: '伦敦',
    tzParis: '巴黎',
    tzSydney: '悉尼',
    tzUTC: '协调世界时',
    cancel: '取消',
    save: '保存',
    saveSuccess: '偏好设置已保存'
  },
  cookieConsent: {
    ariaLabel: 'Cookie 同意提示',
    title: 'Cookie 隐私偏好',
    text: '本网站使用 Cookie 以提升您的使用体验。继续使用本网站即表示您同意我们的 Cookie 政策。',
    learnMore: '了解详情',
    accept: '全部接受',
    reject: '仅必要'
  },
  batchActions: {
    selected: '已选择',
    items: '项',
    clear: '清空'
  },
  gen: {
    title: '代码生成',
    btn: {
      generate: '生成',
      import: '导入',
      preview: '预览',
      edit: '修改',
      delete: '删除',
      refresh: '刷新',
      download: '下载',
      sync: '同步',
      generateCode: '生成代码'
    },
    column: {
      tableName: '表名称',
      tableComment: '表描述',
      className: '实体',
      createTime: '创建时间',
      updateTime: '更新时间'
    },
    search: {
      tableName: '表名称',
      phTableName: '请输入表名称',
      tableComment: '表描述',
      phTableComment: '请输入表描述'
    },
    editTable: {
      tabBasic: '基本信息',
      tabField: '字段信息',
      tabGenInfo: '生成信息',
      column: {
        sort: '序号',
        columnName: '字段列名',
        columnComment: '字段描述',
        columnType: '物理类型',
        javaType: 'Java类型',
        javaField: 'java属性',
        isInsert: '插入',
        isEdit: '编辑',
        isList: '列表',
        isQuery: '查询',
        queryType: '查询方式',
        isRequired: '必填',
        htmlType: '显示类型',
        dictType: '字典类型'
      },
      htmlType: {
        input: '文本框',
        textarea: '文本域',
        select: '下拉框',
        radio: '单选框',
        checkbox: '复选框',
        datetime: '日期控件',
        imageUpload: '图片上传',
        fileUpload: '文件上传',
        editor: '富文本控件'
      }
    },
    basicInfo: {
      tableName: '表名称',
      phTableName: '请输入仓库名称',
      tableComment: '表描述',
      className: '实体类名称',
      functionAuthor: '作者',
      validate: {
        tableNameRequired: '请输入表名称',
        tableCommentRequired: '请输入表描述',
        classNameRequired: '请输入实体类名称',
        functionAuthorRequired: '请输入作者'
      }
    },
    createTable: {
      title: '创建表',
      tableName: '表名称',
      phTableName: '如 sys_example',
      tableComment: '表注释',
      phTableComment: '表的业务说明',
      importToGen: '导入代码生成',
      importToGenAuto: '建表后自动导入',
      importToGenOnly: '仅建表',
      fieldDef: '字段定义',
      addField: '新增字段',
      column: {
        sort: '序号',
        columnName: '字段名',
        phColumnName: '如 user_id',
        dataType: '类型',
        phDataType: '选择类型',
        length: '长度',
        precision: '小数位',
        isPrimaryKey: '主键',
        isAutoIncrement: '自增',
        isNotNull: '非空',
        isUnique: '唯一',
        defaultValue: '默认值',
        phDefaultValue: '可选',
        columnComment: '注释',
        phColumnComment: '字段说明'
      },
      typeGroup: {
        string: '字符串',
        integer: '整数',
        decimal: '小数',
        datetime: '日期时间',
        other: '其他'
      },
      tip: '通过结构化表单建表，后端使用 sea-query 声明式构造 DDL，自动适配 PostgreSQL/MySQL/SQLite 方言，完全消除 SQL 注入风险。',
      validate: {
        tableNameRequired: '请输入表名称',
        tableNamePattern: '表名必须以字母开头，只能包含字母、数字、下划线，长度1-64',
        formError: '请修正表单错误后再提交',
        columnRequired: '至少需要定义1个字段',
        columnNameRequired: '字段名不能为空',
        columnNameInvalid: '字段名 "{name}" 不合法（必须以字母/下划线开头，只能包含字母、数字、下划线，长度1-64）',
        columnNameDuplicate: '字段名 "{name}" 重复',
        lengthRequired: '字段 "{name}" 需要指定长度',
        precisionRequired: '字段 "{name}" (DECIMAL) 需要指定小数位',
        precisionRange: '字段 "{name}" 的小数位必须小于长度',
        autoIncrementType: '字段 "{name}" 设置自增但类型不是 INT/BIGINT',
        autoIncrementPk: '字段 "{name}" 设置自增但未设置主键',
        defaultValueNumeric: '字段 "{name}" 的默认值 "{value}" 不是有效数字',
        defaultValueBoolean: '字段 "{name}" (BOOLEAN) 的默认值必须是 true/false/0/1',
        noPrimaryKey: '表未定义主键，可能影响后续代码生成。是否继续？'
      },
      msg: {
        createSuccess: '表 {name} 创建成功{imported}',
        createSuccessImported: '，已导入代码生成',
        createFail: '建表失败'
      },
      defaultColumn: {
        id: '主键ID',
        createBy: '创建者',
        createTime: '创建时间',
        updateBy: '更新者',
        updateTime: '更新时间',
        remark: '备注'
      }
    },
    genInfo: {
      tplCategory: '生成模板',
      tplCrud: '单表（增删改查）',
      tplTree: '树表（增删改查）',
      tplSub: '主子表（增删改查）',
      tplWebType: '前端类型',
      tplWebVue2: 'Vue2 Element UI 模版',
      tplWebVue3: 'Vue3 Element Plus 模版',
      tplWebVue3Ts: 'Vue3 Element Plus TypeScript 模版',
      packageName: '生成包路径',
      packageNameTip: '生成在哪个java包下，例如 com.yebot.system',
      moduleName: '生成模块名',
      moduleNameTip: '可理解为子系统名，例如 system',
      businessName: '生成业务名',
      businessNameTip: '可理解为功能英文名，例如 user',
      functionName: '生成功能名',
      functionNameTip: '用作类描述，例如 用户',
      formColNum: '表单布局',
      formColNumTip: '选择表单的栅格布局方式',
      formColNumOne: '单列',
      formColNumTwo: '双列',
      formColNumThree: '三列',
      genView: '扩展功能',
      genViewDetail: '生成详情页',
      genType: '生成代码方式',
      genTypeTip: '默认为zip压缩包下载，也可以自定义生成路径',
      genTypeZip: 'zip压缩包',
      genTypeCustom: '自定义路径',
      parentMenu: '上级菜单',
      parentMenuTip: '分配到指定菜单下，例如 系统管理',
      phParentMenu: '请选择系统菜单',
      genPath: '自定义路径',
      genPathTip: '填写磁盘绝对路径，若不填写，则生成到当前Web项目下',
      genPathRecent: '最近路径快速选择',
      genPathReset: '恢复默认的生成基础路径',
      otherInfo: '其他信息',
      treeCode: '树编码字段',
      treeCodeTip: '树显示的编码字段名， 如：dept_id',
      treeParentCode: '树父编码字段',
      treeParentCodeTip: '树显示的父编码字段名， 如：parent_Id',
      treeName: '树名称字段',
      treeNameTip: '树节点的显示名称字段名， 如：dept_name',
      subInfo: '关联信息',
      subTableName: '关联子表的表名',
      subTableNameTip: '关联子表的表名， 如：sys_user',
      subTableFkName: '子表关联的外键名',
      subTableFkNameTip: '子表关联的外键名， 如：user_id',
      validate: {
        tplCategoryRequired: '请选择生成模板',
        packageNameRequired: '请输入生成包路径',
        moduleNameRequired: '请输入生成模块名',
        businessNameRequired: '请输入生成业务名',
        functionNameRequired: '请输入生成功能名'
      }
    },
    importTable: {
      title: '导入表',
      tableName: '表名称',
      phTableName: '请输入表名称',
      tableComment: '表描述',
      phTableComment: '请输入表描述',
      tipSelectTable: '请选择要导入的表'
    },
    msg: {
      selectToGen: '请选择要生成的数据',
      genCustomSuccess: '成功生成到自定义路径：{path}',
      syncConfirm: '确认要强制同步"{name}"表结构吗？',
      syncSuccess: '同步成功',
      editTitle: '修改[{name}]生成配置',
      previewTitle: '代码预览'
    }
  },
  build: {
    layoutComponents: '布局型组件',
    exportVue: '导出vue文件',
    copyCode: '复制代码',
    emptyTip: '从左侧拖入或点选组件进行表单设计',
    confirmClear: '确定要清空所有组件吗？',
    copyCodeSuccess: '代码已复制到剪切板，可粘贴。',
    copyCodeFail: '代码复制失败',
    uploadTip: '只能上传不超过 {size}{unit} 的{type}文件',
    rightPanel: {
      tabField: '组件属性',
      tabForm: '表单属性',
      docLink: '查看组件文档',
      label: {
        componentType: '组件类型',
        fieldName: '字段名',
        componentName: '组件名',
        title: '标题',
        placeholder: '占位提示',
        startPlaceholder: '开始占位',
        endPlaceholder: '结束占位',
        span: '表单栅格',
        gutter: '栅格间隔',
        justify: '水平排列',
        align: '垂直排列',
        labelWidth: '标签宽度',
        componentWidth: '组件宽度',
        defaultValue: '默认值',
        minChecked: '至少应选',
        maxChecked: '最多可选',
        prepend: '前缀',
        append: '后缀',
        prefixIcon: '前图标',
        suffixIcon: '后图标',
        separator: '选项分隔符',
        minRows: '最小行数',
        maxRows: '最大行数',
        minValue: '最小值',
        maxValue: '最大值',
        step: '步长',
        precision: '精度',
        controlsPosition: '按钮位置',
        maxLength: '最多输入',
        activeText: '开启提示',
        inactiveText: '关闭提示',
        activeValue: '开启值',
        inactiveValue: '关闭值',
        dateType: '时间类型',
        fileName: '文件字段名',
        fileType: '文件类型',
        fileSize: '文件大小',
        action: '上传地址',
        listType: '列表类型',
        buttonText: '按钮文字',
        rangeSeparator: '分隔符',
        pickerOptions: '时间段',
        format: '时间格式',
        dataType: '数据类型',
        labelKey: '标签键名',
        valueKey: '值键名',
        childrenKey: '子级键名',
        optionType: '选项样式',
        activeColor: '开启颜色',
        inactiveColor: '关闭颜色',
        allowHalf: '允许半选',
        showText: '辅助文字',
        showScore: '显示分数',
        showStops: '显示间断点',
        range: '范围选择',
        border: '是否带边框',
        colorFormat: '颜色格式',
        size: '选项尺寸',
        showWordLimit: '输入统计',
        stepStrictly: '严格步数',
        multipleCascade: '是否多选',
        showAllLevels: '展示全路径',
        filterable: '可否筛选',
        clearable: '能否清空',
        showTip: '显示提示',
        multiple: '多选文件',
        autoUpload: '自动上传',
        readonly: '是否只读',
        disabled: '是否禁用',
        filterableSelect: '是否可搜索',
        multipleSelect: '是否多选',
        required: '是否必填',
        expression: '表达式',
        errorTip: '错误提示',
        formRef: '表单名',
        formModel: '表单模型',
        formRules: '校验模型',
        formSize: '表单尺寸',
        labelPosition: '标签对齐',
        formLabelWidth: '标签宽度',
        formGutter: '栅格间隔',
        formDisabled: '禁用表单',
        formBtns: '表单按钮',
        formUnFocusedBorder: '显示未选中组件边框'
      },
      ph: {
        componentType: '请选择组件类型',
        fieldName: '请输入字段名（v-model）',
        title: '请输入标题',
        placeholder: '请输入占位提示',
        gutter: '栅格间隔',
        justify: '请选择水平排列',
        labelWidth: '请输入标签宽度',
        componentWidth: '请输入组件宽度',
        defaultValue: '请输入默认值',
        minChecked: '至少应选',
        maxChecked: '最多可选',
        prepend: '请输入前缀',
        append: '请输入后缀',
        prefixIcon: '请输入前图标名称',
        suffixIcon: '请输入后图标名称',
        separator: '请输入选项分隔符',
        minRows: '最小行数',
        maxRows: '最大行数',
        minValue: '最小值',
        maxValue: '最大值',
        step: '步数',
        precision: '精度',
        maxLength: '请输入字符长度',
        activeText: '请输入开启提示',
        inactiveText: '请输入关闭提示',
        activeValue: '请输入开启值',
        inactiveValue: '请输入关闭值',
        dateType: '请选择时间类型',
        fileName: '请输入上传文件字段名',
        fileType: '请选择文件类型',
        fileSize: '请输入文件大小',
        action: '请输入上传地址',
        buttonText: '请输入按钮文字',
        rangeSeparator: '请输入分隔符',
        pickerOptions: '请输入时间段',
        format: '请输入时间格式',
        labelKey: '请输入标签键名',
        valueKey: '请输入值键名',
        childrenKey: '请输入子级键名',
        colorFormat: '请选择颜色格式',
        formRef: '请输入表单名（ref）',
        formModel: '请输入数据模型',
        formRules: '请输入校验模型',
        formLabelWidth: '标签宽度',
        formGutter: '栅格间隔',
        pattern: '请输入正则',
        errorTip: '请输入错误提示',
        optionName: '选项名',
        optionValue: '选项值'
      },
      options: '选项',
      layoutTree: '布局结构树',
      regexValidate: '正则校验',
      chars: '个字符',
      btn: {
        select: '选择',
        addOption: '添加选项',
        addParent: '添加父级',
        addRule: '添加规则'
      },
      radio: {
        alignTop: 'top',
        alignMiddle: 'middle',
        alignBottom: 'bottom',
        controlsDefault: '默认',
        controlsRight: '右侧',
        dataTypeDynamic: '动态数据',
        dataTypeStatic: '静态数据',
        optionDefault: '默认',
        optionButton: '按钮',
        sizeLarge: '较大',
        sizeDefault: '默认',
        sizeSmall: '较小',
        labelLeft: '左对齐',
        labelRight: '右对齐',
        labelTop: '顶部对齐'
      },
      fileType: {
        image: '图片',
        video: '视频',
        audio: '音频'
      },
      tagGroup: {
        input: '输入型组件',
        select: '选择型组件'
      },
      weekFormat: 'YYYY 第 ww 周',
      dateType: {
        date: '日(date)',
        week: '周(week)',
        month: '月(month)',
        year: '年(year)',
        datetime: '日期时间(datetime)',
        daterange: '日期范围(daterange)',
        monthrange: '月范围(monthrange)',
        datetimerange: '日期时间范围(datetimerange)'
      }
    },
    codeTypeDialog: {
      title: '选择生成类型',
      type: '生成类型',
      fileName: '文件名',
      phFileName: '请输入文件名',
      typeFile: '页面',
      typeDialog: '弹窗',
      validate: {
        fileNameRequired: '请输入文件名',
        typeRequired: '生成类型不能为空'
      }
    },
    iconsDialog: {
      title: '选择图标',
      phIconName: '请输入图标名称'
    },
    treeNodeDialog: {
      title: '添加选项',
      label: '选项名',
      value: '选项值',
      phOptionName: '请输入选项名',
      phOptionValue: '请输入选项值',
      validate: {
        labelRequired: '请输入选项名',
        valueRequired: '请输入选项值'
      },
      dataType: {
        string: '字符串',
        number: '数字'
      }
    }
  },
  treePanel: {
    collapseAll: '收起全部',
    expandAll: '展开全部',
    refresh: '刷新',
    expand: '展开',
    collapse: '收起',
    title: '树形结构',
    searchPlaceholder: '请输入名称'
  },
  imageUpload: {
    preview: '预览',
    imagePreview: '图片预览',
    fileFormatError: '文件格式不正确，请上传{types}图片格式文件!',
    fileNameError: '文件名不正确，不能包含英文逗号!',
    fileSizeExceeded: '上传头像图片大小不能超过 {size} MB!',
    uploadingImage: '正在上传图片，请稍候...',
    fileCountExceed: '上传文件数量不能超过 {limit} 个!',
    uploadFailed: '上传图片失败'
  },
  langSelect: {
    simplifiedChinese: '简体中文',
    english: 'English',
    switchingLanguage: '正在切换语言，请稍候...',
    switchSuccess: '语言切换成功'
  },
  sizeSelect: {
    large: '较大',
    default: '默认',
    small: '稍小',
    settingLayoutSize: '正在设置布局大小，请稍候...'
  },
  taskProgress: {
    title: '任务进度',
    clearCompleted: '清空已完成',
    statusWaiting: '等待中',
    statusRunning: '进行中',
    statusCompleted: '已完成',
    statusFailed: '失败'
  },
  editableCell: {
    empty: '（空）',
    validateFailed: '校验失败'
  },
  announcementBanner: {
    viewDetails: '查看详情'
  },
  breadcrumb: {
    home: '首页'
  },
  yebot: {
    gitAriaLabel: '源码地址，新窗口打开',
    docAriaLabel: '文档地址，新窗口打开'
  },
  hamburger: {
    collapseSidebar: '折叠侧边栏',
    expandSidebar: '展开侧边栏'
  },
  iconSelect: {
    placeholder: '请输入图标名称',
    selectIcon: '选择图标 {name}'
  },
  route: {
    login: '登录',
    register: '注册',
    privacy: '隐私政策',
    networkError: '网络异常',
    lockScreen: '锁屏',
    home: '首页',
    profile: '个人中心',
    assignRole: '分配角色',
    assignUser: '分配用户',
    dictData: '字典数据',
    jobLog: '调度日志',
    editGenConfig: '修改生成配置'
  },
  session: {
    timeoutWarning: '您已长时间未操作，系统将在 {seconds} 秒后自动退出，是否继续操作？',
    timeoutWarningTitle: '会话超时提醒',
    continueOperation: '继续操作',
    logoutNow: '立即退出'
  },
  notification: {
    newNotice: '新通知',
    operLogTitle: '操作日志',
    systemTitle: '系统消息',
    systemMessageTitle: '系统消息',
    wsConnected: 'WebSocket 连接成功',
    forceLogoutMessage: '您的账号已被管理员强制下线。',
    forceLogoutMsg: '您的账号已被管理员强制下线'
  },
  passwordRule: {
    illegalChars: '密码不能包含非法字符（尖括号、引号、反斜杠、竖线等）',
    digitsOnly: '密码只能为数字(0-9)',
    lettersOnly: '密码只能为英文字母(a-z, A-Z)',
    lettersAndDigits: '密码必须包含字母和数字',
    lettersDigitsSpecial: '密码必须包含字母、数字和特殊字符(~!＠#$%^&*()-=_+)',
    required: '密码不能为空',
    lengthRange: '密码长度必须介于 6 和 20 之间',
    newRequired: '新密码不能为空',
    newLengthRange: '新密码长度必须介于 6 和 20 之间',
    pleaseEnter: '请输入密码',
    userLengthRange: '用户密码长度必须介于 6 和 20 之间'
  },
  time: {
    justNow: '刚刚',
    minutesAgo: '{n}分钟前',
    hoursAgo: '{n}小时前',
    dayAgo: '1天前',
    dateTimeFormat: '{month}月{day}日 {hour}时{minute}分',
    fullDateFormat: '{date} 星期{weekday} {time}',
    weekdays: {
      sun: '日',
      mon: '一',
      tue: '二',
      wed: '三',
      thu: '四',
      fri: '五',
      sat: '六'
    }
  },
  pdf: {
    defaultFilename: '导出文件',
    printPreview: '打印预览'
  },
  legal: {
    privacy: {
      title: '隐私政策',
      lastUpdated: '最后更新时间：{date}',
      intro1:
        '本隐私政策（以下简称"本政策"）说明 Yebot（以下简称"我们"）在您使用我们的网站及服务时，如何收集、使用、存储、保护您的个人信息，以及您所享有的相关权利。本政策依据《中华人民共和国个人信息保护法》（以下简称"PIPL"）、《中华人民共和国网络安全法》、《中华人民共和国数据安全法》等法律法规制定。',
      intro2:
        '请您在使用本网站前，仔细阅读并充分理解本政策的全部内容。继续使用本网站即表示您已同意本政策所述的各项条款。',
      section1Title: '一、信息收集',
      section1Intro: '为了向您提供服务，我们可能收集以下类型的信息：',
      section1AccountInfo: '账号信息：您注册时提交的用户名、密码（加密存储）等标识信息。',
      section1AuthInfo: '认证信息：您登录时输入的凭证、验证码等用于身份验证的信息。',
      section1UsageData:
        '使用记录：您的登录时间、IP 地址、浏览器类型、操作系统、访问日志、操作日志等用于安全审计的信息。',
      section1Profile: '个人资料：您主动填写的昵称、头像、联系方式等个人资料信息。',
      section1Cookie: 'Cookie 信息：通过 Cookie 技术收集的偏好设置、会话状态等信息。',
      section1Conclusion: '我们仅收集为提供服务所必需的最少信息，不会收集与提供服务无关的个人信息。',
      section2Title: '二、信息使用',
      section2Intro: '我们收集的信息将用于以下目的：',
      section2Item1: '向您提供账号注册、登录、身份验证及基本业务服务；',
      section2Item2: '维护系统的安全稳定运行，防范欺诈、攻击等安全风险；',
      section2Item3: '记录操作日志与登录日志，用于安全审计与问题排查；',
      section2Item4: '根据法律法规要求，配合监管部门的合规检查；',
      section2Item5: '改进产品功能与用户体验（使用去标识化后的数据）。',
      section2Conclusion:
        '除上述目的外，我们不会将您的个人信息用于其他用途。如需变更使用目的，我们将再次征得您的同意。',
      section3Title: '三、Cookie 使用',
      section3Intro:
        '本网站使用 Cookie 及类似技术来记录您的登录状态、偏好设置，以提升您的使用体验。Cookie 是存储在您本地设备上的小型文本文件。',
      section3Categories: '我们使用的 Cookie 主要分为以下两类：',
      section3Necessary: '必要 Cookie：用于实现登录认证、会话保持等核心功能，关闭后部分功能将无法正常使用。',
      section3Preference: '偏好 Cookie：用于记住您的界面偏好（如主题、语言、布局尺寸等），提升使用体验。',
      section3Conclusion:
        '您可以通过浏览器设置管理或删除 Cookie。但请注意，禁用必要 Cookie 可能影响本网站的正常使用。首次访问时，我们会通过提示征求您对 Cookie 政策的同意。',
      section4Title: '四、信息保护',
      section4Intro: '我们采取以下措施保护您的个人信息安全：',
      section4Item1: '密码采用不可逆加密算法存储，不以明文形式保存；',
      section4Item2: '登录凭证采用 JWT 令牌机制，设置合理的过期时间；',
      section4Item3: '对敏感操作进行权限控制与审计记录；',
      section4Item4: '通过 HTTPS 等加密传输协议保护数据传输安全；',
      section4Item5: '定期进行安全评估，及时修复潜在漏洞。',
      section4Conclusion:
        '尽管我们采取了合理的安全措施，但互联网环境并非绝对安全。如发生个人信息泄露事件，我们将依法及时告知您并采取补救措施。',
      section5Title: '五、用户权利',
      section5Intro: '依据 PIPL 等法律法规，您对个人信息享有以下权利：',
      section5Item1: '知情权与决定权：您有权了解我们处理您个人信息的目的、方式与范围，并作出决定。',
      section5Item2: '查阅与复制权：您有权查阅、复制您的个人信息，我们将在合理期限内提供。',
      section5Item3: '更正与补充权：当您的个人信息有误或不完整时，您有权要求更正或补充。',
      section5Item4: '删除权：在法定情形下，您有权要求我们删除您的个人信息。',
      section5Item5: '撤回同意权：您有权随时撤回此前对本政策的同意，但不影响撤回前的处理行为。',
      section5Item6: '投诉举报权：您有权向有关部门投诉或举报我们处理个人信息的行为。',
      section5Conclusion: '如需行使上述权利，请通过本政策末尾的联系方式与我们取得联系。我们将在收到请求后依法处理。',
      section6Title: '六、联系我们',
      section6Intro: '如果您对本政策有任何疑问、建议或投诉，可通过以下方式与我们联系：',
      section6Email: '电子邮箱：privacy＠yebot.dev',
      section6Channel: '通过本网站提供的反馈渠道提交您的问题。',
      section6Conclusion: '我们将在收到您的反馈后尽快处理并回复。',
      footer1: '本政策由 Yebot 制定并解释，我们保留对本政策的最终解释权。',
      footer2: '如本政策发生变更，我们将在本页面及时更新并注明最后更新时间。'
    }
  },
  desensitize: {
    maskedData: '已脱敏数据'
  }
}
