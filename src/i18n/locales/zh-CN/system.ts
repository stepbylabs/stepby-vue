// zh-CN · 分类：system（系统管理）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

export default {
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
    notice: '公告管理',
    msg: '消息管理',
    msgChannel: '消息渠道',
    msgTemplate: '消息模板',
    msgLog: '发送记录',
    log: '日志管理',
    operlog: '操作日志',
    logininfor: '登录日志',
    online: '在线用户',
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
    task: '后台任务',
    auditDashboard: '审计大屏',
    ipLocation: 'IP 库管理',
    myLogin: '我的登录',
    about: '关于系统',
    noticeCenter: '我的通知',
    mySession: '会话管理',
    workbench: '工作台',
    workbenchIndex: '工作台首页',
    shortcuts: '快捷键中心',
    help: '使用帮助',
    helpCenter: '帮助中心',
    changelog: '更新日志',
    dashboard: '数据看板',
    website: 'Yebot官网',
    componentNotFound: '组件「{view}」不存在，请检查菜单配置'
  },
  noticeCenter: {
    title: '我的通知',
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
    import: {
      title: '导入用户',
      tip: '请先在下方下载模板，按模板格式填写数据后上传 xlsx 文件（仅支持 .xlsx）。逐行校验，错误行不会中断整批导入，结果在下方回显。',
      downloadTemplate: '下载导入模板',
      uploadTip: '点击或将文件拖拽到此处上传，仅支持 .xlsx 格式',
      uploadSuccess: '文件上传成功',
      uploadEmptyFile: '不能上传空文件',
      notXlsx: '仅支持 .xlsx 格式文件',
      updateSupport: '若登录名称已存在则更新该用户资料',
      importBtn: '开始导入',
      importing: '导入中...',
      successCount: '成功导入 {n} 个用户',
      errorTotal: '共 {n} 行校验失败',
      noError: '所有数据均校验通过',
      column: {
        rowNum: '错误行号',
        error: '错误原因'
      }
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
    title: '公告管理',
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
  msg: {
    title: '消息管理',
    channel: {
      title: '消息渠道',
      type: {
        email: '邮件',
        sms: '短信',
        site: '站内'
      },
      search: {
        channelName: '渠道名称',
        phChannelName: '请输入渠道名称',
        phStatus: '状态'
      },
      column: {
        channelName: '渠道名称',
        channelCode: '渠道编码',
        channelType: '渠道类型',
        remark: '备注'
      },
      form: {
        channelName: '渠道名称',
        channelType: '渠道类型',
        status: '状态',
        statusNormal: '正常',
        statusDisabled: '停用',
        configJson: '渠道配置',
        phConfigJson: `{'{ "smtp_host": "smtp.qq.com", "smtp_port": 465, "smtp_user": "xxx@qq.com", "smtp_password": "xxx" }'}`,
        phConfigGeneric: '请输入该渠道类型对应的配置 JSON',
        configSecretTip:
          '提示：包含 smtp_password / password 等敏感字段时，后端会以 ****** 脱敏保存，修改时可留空表示不更改。',
        remark: '备注',
        phRemark: '请输入备注'
      },
      btn: {
        test: '测试'
      },
      test: {
        title: '渠道连通性测试',
        tip: '点击「开始测试」将使用该渠道配置进行连通性测试，请确保配置正确。',
        start: '开始测试'
      },
      testSuccess: '渠道测试通过',
      tip: {
        confirmDelete: '是否确认删除渠道编号为"{ids}"的数据项？'
      },
      validate: {
        channelNameRequired: '渠道名称不能为空',
        channelTypeRequired: '渠道类型不能为空'
      }
    },
    template: {
      title: '消息模板',
      search: {
        templateName: '模板名称',
        phTemplateName: '请输入模板名称',
        templateCode: '模板编码',
        phTemplateCode: '请输入模板编码',
        phStatus: '状态'
      },
      column: {
        templateName: '模板名称',
        templateCode: '模板编码',
        channelCode: '渠道编码',
        templateSubject: '模板主题'
      },
      form: {
        templateName: '模板名称',
        templateCode: '模板编码',
        channelCode: '渠道编码',
        status: '状态',
        statusNormal: '正常',
        statusDisabled: '停用',
        templateSubject: '模板主题',
        phTemplateSubject: '请输入模板主题',
        templateContent: '模板内容',
        phTemplateContent: '请输入模板内容',
        remark: '备注',
        phRemark: '请输入备注'
      },
      var: {
        label: '变量占位',
        hint: `{'支持 {{变量名}} 占位，发送时替换为实际值，点击插入：'}`,
        previewSubject: '主题预览',
        previewContent: '内容预览',
        sampleName: '张三',
        sampleContent: '这是变量替换后的示例内容'
      },
      tip: {
        confirmDelete: '是否确认删除模板编号为"{ids}"的数据项？'
      },
      validate: {
        templateNameRequired: '模板名称不能为空',
        templateCodeRequired: '模板编码不能为空',
        templateSubjectRequired: '模板主题不能为空',
        templateContentRequired: '模板内容不能为空'
      }
    },
    log: {
      title: '发送记录',
      search: {
        toAddr: '收件地址',
        phToAddr: '请输入收件地址',
        templateCode: '模板编码',
        phTemplateCode: '模板编码',
        channelCode: '渠道编码',
        phChannelCode: '渠道编码',
        phStatus: '状态'
      },
      column: {
        templateCode: '模板编码',
        channelCode: '渠道编码',
        toAddr: '收件地址',
        subject: '主题',
        status: '状态',
        retry: '重试次数',
        lastError: '最后错误',
        sendTime: '发送时间'
      },
      btn: {
        clean: '清空',
        retry: '重试'
      },
      status: {
        success: '成功',
        fail: '失败',
        pending: '待重试'
      },
      tip: {
        confirmDelete: '是否确认删除发送记录编号为"{ids}"的数据项？',
        confirmClean: '是否确认清空全部发送记录？此操作不可恢复！',
        confirmRetry: '是否确认重试发送记录"{logId}"？'
      },
      cleanSuccess: '发送记录已清空',
      retrySuccess: '重试成功'
    }
  },
  task: {
    title: '后台任务中心',
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
  report: {
    title: '报表定义',
    search: {
      reportName: '报表名称',
      phReportName: '请输入报表名称',
      phReportType: '报表类型',
      phStatus: '状态'
    },
    column: {
      reportCode: '报表编码',
      reportName: '报表名称',
      reportType: '报表类型',
      createBy: '创建者',
      createTime: '创建时间'
    },
    btn: {
      subscription: '订阅',
      preview: '预览'
    },
    form: {
      reportCode: '报表编码',
      phReportCode: '请输入报表编码',
      reportName: '报表名称',
      phReportName: '请输入报表名称',
      reportType: '报表类型',
      config: '报表配置',
      phConfig: `{'请输入报表配置 JSON，如 {"days":7}'}`,
      configTip: '提示：custom 类型将原样透传该 JSON；login_stats 可配置 days 天数。',
      status: '状态',
      remark: '备注',
      phRemark: '请输入备注'
    },
    type: {
      login_stats: '登录统计',
      user_stats: '用户统计',
      msg_stats: '消息统计',
      custom: '自定义'
    },
    validate: {
      reportCodeRequired: '报表编码不能为空',
      reportNameRequired: '报表名称不能为空',
      reportTypeRequired: '报表类型不能为空',
      configRequired: '报表配置不能为空'
    },
    tip: {
      confirmDelete: '是否确认删除报表编号为"{ids}"的数据项？',
      confirmChange: '是否确认将报表「{name}」{text}？'
    },
    preview: {
      title: '报表预览',
      generatedAt: '生成时间',
      data: '快照数据',
      summary: '统计摘要'
    },
    sub: {
      title: '报表订阅',
      target: '报表「{name}」的订阅',
      search: {
        subName: '订阅名称',
        phSubName: '请输入订阅名称',
        phStatus: '状态'
      },
      column: {
        subName: '订阅名称',
        reportId: '报表ID',
        cron: '周期 (cron)',
        channels: '推送渠道',
        receivers: '接收人',
        status: '状态',
        lastRunTime: '上次执行'
      },
      channel: {
        email: '邮件',
        site: '站内信'
      },
      btn: {
        run: '立即推送'
      },
      form: {
        subName: '订阅名称',
        phSubName: '请输入订阅名称',
        report: '关联报表',
        cron: '周期 (cron)',
        phCron: '如 0 0 9 * * *（6 字段，含秒）',
        cronTip: '六字段 cron 表达式（秒 分 时 日 月 周），例如每天 09:00 推送：0 0 9 * * *。',
        channels: '推送渠道',
        receiveEmail: '收件邮箱',
        phReceiveEmail: '多个邮箱用英文逗号分隔',
        receiveUserIds: '目标用户ID',
        phReceiveUserIds: '多个用户ID用英文逗号分隔',
        status: '状态',
        lastRunTime: '上次执行'
      },
      validate: {
        subNameRequired: '订阅名称不能为空',
        reportRequired: '请选择关联报表',
        cronRequired: '请填写 cron 表达式',
        channelRequired: '请至少选择一种推送渠道'
      },
      tip: {
        confirmDelete: '是否确认删除订阅「{name}」？',
        confirmDeleteBatch: '是否确认删除订阅编号为"{ids}"的数据项？',
        confirmRun: '是否立即推送订阅「{name}」？',
        runSuccess: '已触发推送'
      }
    }
  },
  webHook: {
    title: '回调配置',
    search: {
      hookName: '回调名称',
      phHookName: '请输入回调名称',
      eventTypes: '事件类型',
      phEventTypes: '请选择事件类型',
      status: '状态',
      phStatus: '状态'
    },
    column: {
      id: '回调编号',
      hookName: '回调名称',
      eventTypes: '事件类型',
      targetUrl: '目标 URL',
      contentType: '内容类型',
      timeoutSecs: '超时(秒)',
      createBy: '创建者',
      createTime: '创建时间'
    },
    form: {
      hookName: '回调名称',
      phHookName: '请输入回调名称',
      eventTypes: '事件类型',
      phEventTypes: '请选择事件类型',
      eventTypesTip: '留空表示订阅全部事件',
      targetUrl: '目标 URL',
      phTargetUrl: '请输入出站目标 URL，如 https://example.com/hook',
      secret: '签名密钥',
      phSecret: '请输入签名密钥',
      secretTip: '编辑时留空表示不改变；新增时可选',
      contentType: '请求体格式',
      timeoutSecs: '超时秒数',
      timeoutSecsUnit: '秒',
      status: '状态',
      remark: '备注',
      phRemark: '请输入备注'
    },
    btn: {
      log: '日志',
      test: '测试推送',
      export: '导出'
    },
    tip: {
      confirmDelete: '是否确认删除回调编号为"{ids}"的数据项？',
      confirmChange: '是否将该回调"{name}"{text}？',
      testTitle: '测试推送',
      testSuccess: '推送成功',
      testFail: '推送失败'
    },
    validate: {
      hookNameRequired: '回调名称不能为空',
      targetUrlRequired: '目标 URL 不能为空',
      targetUrlFormat: '目标 URL 必须以 http(s):// 开头'
    },
    eventType: {
      all: '全部',
      login_success: '登录成功',
      login_failure: '登录失败'
    },
    test: {
      eventType: '事件类型',
      phEventType: '请选择要模拟的事件类型',
      payload: '事件载荷',
      phPayload: '可选，留空使用默认载荷',
      result: '推送结果',
      ok: '成功',
      fail: '失败',
      statusCode: '状态码',
      response: '响应体',
      error: '错误信息',
      costMs: '耗时(ms)',
      send: '开始测试'
    },
    status: {
      all: '全部',
      success: '成功',
      fail: '失败'
    },
    log: {
      title: '推送记录',
      search: {
        eventType: '事件类型',
        phEventType: '请输入事件类型',
        status: '状态',
        phStatus: '状态'
      },
      column: {
        id: '记录ID',
        hookName: '回调名称',
        eventType: '事件类型',
        targetUrl: '目标 URL',
        statusCode: '状态码',
        costMs: '耗时(ms)',
        status: '状态',
        createTime: '创建时间'
      },
      btn: {
        clean: '清空',
        retry: '重试',
        delete: '删除',
        export: '导出',
        view: '查看'
      },
      tip: {
        confirmDelete: '是否确认删除推送记录编号为"{ids}"的数据项？',
        confirmClean: '是否确认清空全部推送记录？此操作不可恢复！',
        confirmRetry: '是否确认重试推送记录编号为"{ids}"？'
      },
      detail: {
        title: '推送记录详情',
        payload: '事件载荷',
        response: '响应体',
        errorMsg: '错误信息'
      },
      status: {
        success: '成功',
        fail: '失败'
      },
      cleanSuccess: '推送记录已清空',
      retrySuccess: '重试成功'
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
    },
    msgPref: '消息偏好 / 免打扰',
    pref: {
      title: '消息偏好 / 免打扰',
      tip: '设置您希望接收的通知类型与免打扰时段，保存后即时生效。',
      notifyLabel: '通知类型',
      email: '接收公告邮件',
      sysmsg: '接收站内信通知',
      announce: '接收通知公告',
      dndTitle: '免打扰时段',
      dnd: '开启免打扰',
      dndStart: '开始时间',
      dndEnd: '结束时间',
      dndTip: '在免打扰时段内将屏蔽以上类型的新消息推送，可跨天（如 22:00 → 06:00）。',
      timeRequired: '开启免打扰后请设置开始与结束时间',
      save: '保存',
      saveSuccess: '保存成功',
      saveError: '保存失败'
    }
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
  }
}
