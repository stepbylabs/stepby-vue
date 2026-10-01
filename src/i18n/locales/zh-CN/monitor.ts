// zh-CN · 分类：monitor（系统监控）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

export default {
  observability: {
    title: '运行监控',
    loading: '加载中',
    refresh: '刷新',
    refreshSuccess: '刷新成功',
    clearSuccess: '清空成功',
    search: '搜索',
    reset: '重置',
    empty: '暂无数据',
    tab: {
      slow: '慢请求',
      error: '错误聚合'
    },
    stat: {
      slowCount: '慢请求数',
      avgMs: '平均耗时',
      maxMs: '最大耗时',
      over1s: '超 1s 请求',
      thresholdMs: '阈值 (ms)',
      errorTotal: '错误总数',
      uptime: '运行时长',
      usedMemory: '已用内存',
      connectedClients: '连接客户端',
      hitRate: '键命中率'
    },
    slow: {
      clear: '清空慢请求',
      ms: 'ms',
      topTitle: 'Top 慢接口',
      confirmClear: '确认清空所有慢请求记录？',
      column: {
        method: '方法',
        path: '路径',
        status: '状态',
        duration: '耗时',
        at: '时间',
        count: '次数',
        avg: '平均耗时',
        max: '最大耗时'
      }
    },
    error: {
      clear: '清空错误日志',
      confirmClear: '确认清空所有错误日志？',
      searchModule: '模块',
      phModule: '请输入模块',
      level: '级别',
      phLevel: '请选择级别',
      byModuleTitle: '按模块聚合',
      byLevelTitle: '按级别聚合',
      column: {
        at: '时间',
        level: '级别',
        module: '模块',
        requestId: '请求 ID',
        path: '路径',
        message: '错误信息'
      }
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
      phUserName: '请输入用户名称',
      tenantId: '租户 ID',
      phTenantId: '租户 ID（0=平台）'
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
      tenantName: '所属租户',
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
        "Bean调用示例：demoTask.demoParams('demo')<br />Class类调用示例：com.stepby.quartz.task.DemoTask.demoParams('demo')<br />参数说明：支持字符串，布尔类型，长整型，浮点型，整型",
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
    prefix: {
      title: '前缀内存统计',
      refresh: '刷新统计',
      column: {
        cacheName: '缓存前缀',
        keyCount: '键数量',
        memory: '内存占用'
      },
      empty: '暂无前缀统计'
    },
    hot: {
      title: '热 Key 提示',
      refresh: '刷新热 Key',
      column: {
        key: 'Key',
        type: '类型',
        memory: '内存',
        hotspot: '状态'
      },
      hotspot: '热点',
      tip: {
        selectKeyFirst: '请选择热 Key',
        confirmClearKey: '热 Key 属于业务缓存。是否确认清理 "{key}"？清理后该键数据将被删除。',
        clearKeySuccess: '清理热 Key [{key}] 成功'
      }
    },
    tip: {
      loading: '正在加载缓存监控数据，请稍候！',
      loadFailed: '加载缓存数据失败',
      notConnected: 'Redis 未连接，请检查缓存服务状态'
    }
  },
  // server 模块已合并到 health（P0-1），i18n 键已迁移到 health.column；
  // 下方 server 命名空间为 P3-16 独立服务器监控页（实时图表）专用
  server: {
    title: '服务器监控',
    btn: {
      refresh: '刷新'
    },
    stat: {
      cpuUsage: 'CPU 使用率',
      memUsage: '内存使用率',
      cpuNum: '核心数',
      runTime: '运行时长',
      startTime: '启动时间',
      runtime: '运行时'
    },
    chart: {
      title: '资源使用率趋势',
      autoRefresh: '自动刷新',
      lastUpdate: '最后更新：',
      cpu: 'CPU 使用率',
      mem: '内存使用率'
    },
    diskInfo: '磁盘分区',
    runtimeInfo: '服务器与运行时信息',
    column: {
      dirName: '盘符路径',
      sysTypeName: '文件系统',
      total: '总容量(G)',
      used: '已用(G)',
      free: '可用(G)',
      usage: '使用率',
      computerName: '服务器名称',
      computerIp: '服务器IP',
      osName: '操作系统',
      osArch: '系统架构',
      runtimeName: '运行时名称',
      version: '运行时版本',
      startTime: '启动时间',
      runTime: '运行时长',
      userDir: '项目路径',
      home: '安装路径',
      inputArgs: '运行参数'
    }
  },
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
  logTail: {
    title: '实时日志',
    subtitle: '在线查看应用日志，支持级别/关键字过滤与自动刷新',
    file: '日志文件',
    selectFile: '请选择日志文件',
    level: '日志级别',
    keyword: '关键字',
    lineCount: '显示行数',
    filter: '过滤',
    refresh: '刷新',
    autoRefresh: '自动刷新',
    empty: '暂无日志内容',
    noFile: '请先在上方选择日志文件',
    total: '共 {total} 条',
    fileSize: '大小',
    modified: '修改时间',
    lines: {
      '500': '500',
      '1000': '1000',
      '2000': '2000',
      all: '全部'
    },
    levels: {
      all: '全部级别',
      debug: 'DEBUG+',
      info: 'INFO+',
      warn: 'WARN+',
      error: 'ERROR+'
    }
  },
  operlog: {
    title: '操作日志',
    detail: {
      title: '操作日志详细',
      normal: '正常',
      abnormal: '异常',
      copy: '复制',
      diffCompare: '变更对比',
      diffTip:
        '优先展示后端记录的逐字段变更差异（变更前 → 变更后）；无该数据的历史日志回退到请求参数与返回结果的字段对比',
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
      noDiff: '本次修改未检测到字段级差异（数据未变化），或历史日志缺少字段级差异记录',
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
      notice: '公告管理',
      backup: '备份管理',
      job: '定时任务',
      operlog: '操作日志',
      logininfor: '登录日志',
      online: '在线用户',
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
  desensitize: {
    maskedData: '已脱敏数据'
  },
  frontendError: {
    title: '前端异常监控',
    search: {
      level: '级别',
      source: '来源',
      name: '名称',
      createTime: '发生时间',
      phLevel: '请选择级别',
      phSource: '请选择来源',
      phName: '请输入错误名或指标名',
      deviceType: '设备类型',
      phDeviceType: '请选择设备类型'
    },
    column: {
      id: '编号',
      level: '级别',
      source: '来源',
      name: '名称',
      message: '信息',
      pageUrl: '页面',
      value: '指标值',
      userName: '上报用户',
      createTime: '发生时间',
      operation: '操作'
    },
    level: {
      error: '错误',
      warning: '警告',
      info: '信息'
    },
    source: {
      vue: 'Vue',
      global: '全局',
      unhandledrejection: 'Promise拒绝',
      resource: '资源',
      api: '接口',
      download: '下载',
      vital: '性能指标',
      other: '其他'
    },
    deviceType: {
      mobile: '移动端',
      tablet: '平板',
      desktop: '桌面端'
    },
    btn: {
      detail: '详情',
      clean: '清空',
      delete: '删除'
    },
    detail: {
      title: '异常详情',
      basicInfo: '基本信息',
      level: '级别',
      source: '来源',
      name: '名称',
      message: '信息',
      stack: '堆栈',
      pageUrl: '页面地址',
      userAgent: '浏览器',
      viewport: '视口',
      value: '指标值',
      userName: '上报用户',
      createTime: '发生时间',
      vitalInfo: '性能指标',
      copy: '复制',
      noData: '无数据'
    },
    stats: {
      title: '概览统计',
      bySource: '来源分布',
      daily: '每日异常趋势',
      total: '总计',
      days: '近{days}天'
    },
    tip: {
      confirmDelete: '确认删除选中的前端异常记录？',
      confirmClear: '确认清空前端异常记录？将删除保留期之外的全部记录。',
      clearSuccess: '清空成功',
      noSelection: '请先选择要删除的记录'
    }
  }
}
