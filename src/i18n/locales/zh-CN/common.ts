// zh-CN · 分类：common（通用基础）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

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
    // 多租户 Phase 3：平台租户展示名（tenant_id = 0）
    platformTenant: '平台',
    // 多租户 Phase 3：业务列表页「所属租户」归属列标题（[ui].show_tenant_column）
    tenantColumn: '所属租户',
    // 业务列表页「按租户筛选」输入框占位文案（[ui].tenant_filter）
    tenantFilterPlaceholder: '租户号',
    detail: '详细',
    download: '下载',
    upload: '上传文件',
    batchDelete: '批量删除',
    copy: '复制',
    copyLink: '复制链接',
    create: '创建',
    viewAll: '查看全部',
    all: '全部',
    inputText: '请输入',
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
    unsavedConfirm: '当前表单内容尚未保存，确定要离开吗？',
    leaveWithoutSaving: '不保存并离开',
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
    operationSuccess: '操作成功',
    importSuccess: '导入成功',
    exportSuccess: '导出成功',
    exporting: '正在导出，数据量较大时请稍候…',
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
  layout: {
    tabbar: {
      mine: '我的'
    },
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
  headerSearch: {
    placeholder: '菜单搜索，支持标题、URL模糊查询',
    resultCount: '找到 {count} 个结果',
    noResult: '未找到 "{keyword}" 相关菜单',
    noResultTip: '试试其他关键词或路径',
    switchShortcut: '切换',
    selectShortcut: '选择',
    closeShortcut: '关闭',
    menuAriaLabel: '菜单：{title}',
    placeholderWithData: '搜索菜单、用户、角色、字典（2 个字以上自动搜索数据）',
    group: {
      menu: '菜单',
      user: '用户',
      role: '角色',
      dict: '字典'
    }
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
  editableCell: {
    empty: '（空）',
    validateFailed: '校验失败'
  },
  breadcrumb: {
    home: '首页'
  },
  hamburger: {
    collapseSidebar: '折叠侧边栏',
    expandSidebar: '展开侧边栏'
  },
  iconSelect: {
    placeholder: '请输入图标名称',
    selectIcon: '选择图标 {name}'
  }
}
