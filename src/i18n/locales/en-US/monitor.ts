// en-US · 分类：monitor（系统监控）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

export default {
  observability: {
    title: 'Observability',
    loading: 'Loading',
    refresh: 'Refresh',
    refreshSuccess: 'Refreshed',
    clearSuccess: 'Cleared',
    search: 'Search',
    reset: 'Reset',
    empty: 'No data',
    tab: {
      slow: 'Slow Requests',
      error: 'Error Aggregation'
    },
    stat: {
      slowCount: 'Slow Requests',
      avgMs: 'Avg Duration',
      maxMs: 'Max Duration',
      over1s: 'Over 1s',
      thresholdMs: 'Threshold (ms)',
      errorTotal: 'Error Total',
      uptime: 'Uptime',
      usedMemory: 'Used Memory',
      connectedClients: 'Clients',
      hitRate: 'Hit Rate'
    },
    slow: {
      clear: 'Clear Slow Requests',
      ms: 'ms',
      topTitle: 'Top Slow Endpoints',
      confirmClear: 'Clear all slow request records？',
      column: {
        method: 'Method',
        path: 'Path',
        status: 'Status',
        duration: 'Duration',
        at: 'Time',
        count: 'Count',
        avg: 'Avg Duration',
        max: 'Max Duration'
      }
    },
    error: {
      clear: 'Clear Error Logs',
      confirmClear: 'Clear all error logs？',
      searchModule: 'Module',
      phModule: 'Enter module',
      level: 'Level',
      phLevel: 'Select level',
      byModuleTitle: 'By Module',
      byLevelTitle: 'By Level',
      column: {
        at: 'Time',
        level: 'Level',
        module: 'Module',
        requestId: 'Request ID',
        path: 'Path',
        message: 'Message'
      }
    }
  },
  online: {
    title: 'Online Users',
    tab: {
      allOnline: 'All Online',
      mySession: 'My Sessions'
    },
    search: {
      ipaddr: 'Login IP',
      phIpaddr: 'Enter login IP',
      userName: 'Username',
      phUserName: 'Enter username',
      tenantId: 'Tenant ID',
      phTenantId: 'Tenant ID (0 = platform)'
    },
    btn: {
      forceLogout: 'Force Logout'
    },
    tip: {
      confirmForceLogout: 'Are you sure to force logout user "{name}"?'
    },
    column: {
      tokenId: 'Session ID',
      userName: 'Username',
      tenantName: 'Tenant',
      deptName: 'Department',
      ipaddr: 'Host',
      loginLocation: 'Login Location',
      os: 'OS',
      browser: 'Browser',
      loginTime: 'Login Time'
    }
  },
  job: {
    title: 'Scheduled Jobs',
    search: {
      jobName: 'Job Name',
      jobGroup: 'Job Group',
      status: 'Job Status',
      phJobName: 'Enter job name',
      phJobGroup: 'Select job group',
      phStatus: 'Select job status'
    },
    column: {
      id: 'Job ID',
      name: 'Job Name',
      group: 'Job Group',
      target: 'Invoke Target',
      cron: 'Cron Expression',
      status: 'Status',
      nextTime: 'Next Run Time',
      createTime: 'Created Time'
    },
    form: {
      jobName: 'Job Name',
      jobGroup: 'Job Group',
      invokeTarget: 'Invoke Target String',
      cronExpression: 'Cron Expression',
      misfirePolicy: 'Misfire Policy',
      concurrent: 'Concurrent',
      status: 'Status',
      remark: 'Remark',
      phJobName: 'Enter job name',
      invokeTargetLabel: 'Invoke Method',
      invokeTargetTip:
        "Bean example: demoTask.demoParams('demo')<br />Class example: com.stepby.quartz.task.DemoTask.demoParams('demo')<br />Parameter description: supports string, boolean, long, float, integer",
      phInvokeTarget: 'Enter invoke target string',
      cronExpressionLabel: 'Cron Expression',
      phCronExpression: 'Enter cron expression',
      genExpression: 'Generate Expression'
    },
    btn: {
      log: 'Log'
    },
    runOnce: 'Run Once',
    jobLog: 'Job Log',
    tip: {
      normal: 'Normal',
      fail: 'Failed',
      paused: 'Paused',
      defaultPolicy: 'Default',
      executeImmediate: 'Execute Immediately',
      executeOnce: 'Execute Once',
      abandon: 'Abandon',
      allowConcurrent: 'Allow',
      forbidConcurrent: 'Forbid',
      confirmChange: 'Are you sure to "{text}" job "{name}"?',
      confirmRunOnce: 'Are you sure to run job "{name}" once immediately?',
      runOnceSuccess: 'Execution succeeded',
      confirmDelete: 'Are you sure to delete the scheduled job with ID "{ids}"?'
    },
    cronTitle: 'Cron Expression Generator',
    titleAdd: 'Add Job',
    titleEdit: 'Edit Job',
    validate: {
      jobNameRequired: 'Job name cannot be empty',
      invokeTargetRequired: 'Invoke target string cannot be empty',
      cronExpressionRequired: 'Cron expression cannot be empty'
    }
  },
  jobLog: {
    title: 'Job Log',
    tip: {
      confirmDelete: 'Are you sure to delete the job log with ID "{ids}"?',
      confirmClear: 'Are you sure to clear all job logs?'
    },
    search: {
      phJobName: 'Enter job name',
      phJobGroup: 'Select job group',
      execStatus: 'Execution Status',
      phExecStatus: 'Select execution status',
      execTime: 'Execution Time'
    },
    column: {
      jobLogId: 'Log ID',
      jobMessage: 'Message',
      status: 'Status',
      createTime: 'Execution Time'
    },
    detail: {
      titleLog: 'Job Log Detail',
      titleJob: 'Job Detail',
      basicInfo: 'Basic Info',
      jobLogId: 'Log ID',
      execStatus: 'Status',
      startTime: 'Start Time',
      endTime: 'End Time',
      recordTime: 'Record Time',
      costTime: 'Cost Time',
      millisecond: 'ms',
      taskInfo: 'Task Info',
      jobGroup: 'Job Group',
      jobMessage: 'Message',
      invokeTarget: 'Invoke Target',
      exceptionInfo: 'Exception Info',
      taskConfig: 'Task Config',
      scheduleInfo: 'Schedule Info',
      cronExpression: 'Cron Expression',
      concurrent: 'Concurrent',
      execMethod: 'Exec Method',
      metaInfo: 'Meta Info',
      empty: '(None)'
    }
  },
  cache: {
    title: 'Cache Monitor',
    list: {
      title: 'Cache List',
      keyListTitle: 'Key List',
      contentTitle: 'Cache Content',
      column: {
        id: 'ID',
        name: 'Cache Name',
        remark: 'Remark',
        operation: 'Operation'
      },
      keyColumn: {
        id: 'ID',
        key: 'Cache Key',
        operation: 'Operation'
      },
      form: {
        name: 'Cache Name:',
        key: 'Cache Key:',
        content: 'Cache Content:'
      },
      tip: {
        refreshSuccess: 'Cache list refreshed successfully',
        clearNameSuccess: 'Cache name [{name}] cleared successfully',
        refreshKeySuccess: 'Cache keys refreshed successfully',
        clearKeySuccess: 'Cache key [{key}] cleared successfully',
        selectCacheFirst: 'Please select a cache name from the left panel first',
        selectKeyFirst: 'Select a cache key to view its content',
        confirmClearName: 'Are you sure to clear all data for cache name "{name}"?',
        confirmClearKey: 'Are you sure to clear cache key "{key}"?'
      }
    },
    info: {
      basicInfo: 'Basic Info',
      redisVersion: 'Redis Version',
      runMode: 'Run Mode',
      port: 'Port',
      clients: 'Clients',
      uptimeDays: 'Uptime (days)',
      usedMemory: 'Used Memory',
      usedCpu: 'Used CPU',
      maxMemory: 'Max Memory',
      aofEnabled: 'AOF Enabled',
      rdbStatus: 'RDB Status',
      keyCount: 'Key Count',
      network: 'Network In/Out',
      commandStats: 'Command Stats',
      memoryInfo: 'Memory Info',
      standalone: 'Standalone',
      cluster: 'Cluster',
      memoryConsume: 'Memory Consumption',
      peak: 'Peak',
      command: 'Command'
    },
    prefix: {
      title: 'Prefix Memory Stats',
      refresh: 'Refresh Stats',
      column: {
        cacheName: 'Cache Prefix',
        keyCount: 'Key Count',
        memory: 'Memory'
      },
      empty: 'No prefix stats'
    },
    hot: {
      title: 'Hot Key Alerts',
      refresh: 'Refresh Hot Keys',
      column: {
        key: 'Key',
        type: 'Type',
        memory: 'Memory',
        hotspot: 'Status'
      },
      hotspot: 'Hotspot',
      tip: {
        selectKeyFirst: 'Please select a hot key',
        confirmClearKey: 'Hot keys belong to business cache. Are you sure to clear "{key}"? The data will be deleted.',
        clearKeySuccess: 'Hot key [{key}] cleared successfully'
      }
    },
    tip: {
      loading: 'Loading cache monitor data, please wait...',
      loadFailed: 'Failed to load cache data',
      notConnected: 'Redis not connected, please check cache service status'
    }
  },
  // server module merged into health (P0-1), i18n keys migrated to health.column;
  // the server namespace below is dedicated to the P3-16 standalone server monitor page (realtime charts)
  server: {
    title: 'Server Monitor',
    btn: {
      refresh: 'Refresh'
    },
    stat: {
      cpuUsage: 'CPU Usage',
      memUsage: 'Memory Usage',
      cpuNum: 'Cores',
      runTime: 'Uptime',
      startTime: 'Started At',
      runtime: 'Runtime'
    },
    chart: {
      title: 'Resource Usage Trend',
      autoRefresh: 'Auto Refresh',
      lastUpdate: 'Last Updated:',
      cpu: 'CPU Usage',
      mem: 'Memory Usage'
    },
    diskInfo: 'Disk Partitions',
    runtimeInfo: 'Server & Runtime Info',
    column: {
      dirName: 'Drive Path',
      sysTypeName: 'File System',
      total: 'Total (G)',
      used: 'Used (G)',
      free: 'Free (G)',
      usage: 'Usage',
      computerName: 'Server Name',
      computerIp: 'Server IP',
      osName: 'OS',
      osArch: 'Architecture',
      runtimeName: 'Runtime Name',
      version: 'Runtime Version',
      startTime: 'Start Time',
      runTime: 'Uptime',
      userDir: 'Project Path',
      home: 'Home Path',
      inputArgs: 'Input Args'
    }
  },
  health: {
    title: 'System Health Status',
    btn: {
      refresh: 'Refresh'
    },
    column: {
      totalMemory: 'Total Memory',
      usedMemory: 'Used Memory',
      freeMemory: 'Free Memory',
      memoryUsage: 'Memory Usage',
      drivePath: 'Drive Path',
      fileSystem: 'File System',
      type: 'Type',
      total: 'Total',
      used: 'Used',
      free: 'Free',
      usage: 'Usage',
      // Merged from server module
      cpu: 'CPU',
      cpuNum: 'Cores',
      cpuUsage: 'Usage',
      sysUsage: 'System Usage',
      freeUsage: 'Free',
      serverInfo: 'Runtime Environment',
      serverName: 'Server Name',
      os: 'OS',
      serverIp: 'Server IP',
      osArch: 'Arch',
      projectPath: 'Project Path',
      startTime: 'Start Time',
      runTime: 'Uptime'
    },
    form: {
      autoRefresh: 'Auto Refresh (10s)',
      lastUpdate: 'Last Update:'
    },
    loading: 'Loading',
    uptime: 'Uptime:',
    database: 'Database',
    redis: 'Redis Cache',
    cpuUsage: 'CPU Usage',
    cpuNum: 'Cores:',
    memUsage: 'Memory Usage',
    memDetail: 'Memory Details',
    diskInfo: 'Disk Info',
    serverInfo: 'Runtime Environment',
    unknown: 'Unknown',
    systemNormal: 'System is running normally',
    systemDegraded: 'Some features are degraded',
    systemDown: 'System unavailable',
    dbOk: 'Database connection normal',
    dbFail: 'Database connection failed',
    redisOk: 'Cache connection normal',
    redisFail: 'Cache connection failed',
    version: 'Version v',
    uptimeFormat: '{days}d {hours}h {minutes}m {secs}s'
  },
  logTail: {
    title: 'Real-time Logs',
    subtitle: 'View application logs online, supporting level/keyword filtering and auto-refresh',
    file: 'Log File',
    selectFile: 'Please select a log file',
    level: 'Log Level',
    keyword: 'Keyword',
    lineCount: 'Lines',
    filter: 'Filter',
    refresh: 'Refresh',
    autoRefresh: 'Auto Refresh',
    empty: 'No log content',
    noFile: 'Please select a log file above first',
    total: '{total} entries',
    fileSize: 'Size',
    modified: 'Modified',
    lines: {
      '500': '500',
      '1000': '1000',
      '2000': '2000',
      all: 'All'
    },
    levels: {
      all: 'All Levels',
      debug: 'DEBUG+',
      info: 'INFO+',
      warn: 'WARN+',
      error: 'ERROR+'
    }
  },
  operlog: {
    title: 'Operation Log',
    detail: {
      title: 'Operation Log Detail',
      normal: 'Normal',
      abnormal: 'Abnormal',
      copy: 'Copy',
      diffCompare: 'Diff Compare',
      diffTip:
        'Prioritizes the backend-computed per-field changes (before → after); historical logs without this data fall back to comparing request params against the response',
      basicInfo: 'Basic Info',
      operModule: 'Module',
      businessType: 'Business Type',
      operTime: 'Operation Time',
      execStatus: 'Status',
      operUser: 'Operator',
      dept: 'Department',
      operAddress: 'Operation Address',
      requestInfo: 'Request Info',
      operUrl: 'Request URL',
      operMethod: 'Method',
      costTime: 'Cost Time',
      requestParam: 'Request Params',
      responseParam: 'Response Params',
      oldValue: 'Old Value',
      newValue: 'New Value',
      errorMsg: 'Error Message',
      noDiff:
        'No field-level changes detected for this edit (data unchanged), or the historical log lacks field-level diff data',
      empty: '(Empty)',
      noData: '(No data)',
      millisecond: 'ms'
    },
    column: {
      operId: 'Log ID',
      title: 'Module',
      businessType: 'Business Type',
      operName: 'Operator',
      operIp: 'Operation Address',
      status: 'Status',
      operTime: 'Operation Time',
      millisecond: 'ms'
    },
    btn: {
      detail: 'Detail',
      exportPdf: 'Export PDF',
      exportFieldSelect: 'Select Export Fields'
    },
    tip: {
      confirmDelete: 'Are you sure to delete the log with ID "{ids}"?',
      confirmClear: 'Are you sure to clear all operation logs?',
      pdfExportSuccess: 'PDF exported successfully',
      pdfExportFail: 'PDF export failed, please try again'
    },
    search: {
      operIp: 'Operation Address',
      phOperIp: 'Enter operation address',
      title: 'Module',
      phTitle: 'Enter module',
      operName: 'Operator',
      phOperName: 'Enter operator',
      phBusinessType: 'Business Type',
      phStatus: 'Status',
      operTime: 'Operation Time'
    },
    exportField: {
      logId: 'Log ID',
      moduleTitle: 'Module Title',
      businessType: 'Business Type',
      requestMethod: 'Request Method',
      operName: 'Operator',
      requestUrl: 'Request URL',
      operIp: 'Host Address',
      status: 'Status',
      errorMsg: 'Error Message',
      operTime: 'Operation Time',
      costTime: 'Cost Time (ms)'
    },
    // T-11: oper_log.title stores i18n keys (module.*), matching backend infer_module_title
    module: {
      user: 'User Management',
      profile: 'Profile Center',
      role: 'Role Management',
      menu: 'Menu Management',
      dict: 'Dict Management',
      dept: 'Dept Management',
      post: 'Post Management',
      config: 'Parameter Settings',
      notice: 'Announcements',
      backup: 'Backup Management',
      job: 'Scheduled Tasks',
      operlog: 'Operation Log',
      logininfor: 'Login Log',
      online: 'Online Users',
      gen: 'Code Generation',
      common: 'Common APIs',
      auth: 'Authentication',
      other: 'Other'
    },
    pdfFilename: 'Operation Log'
  },
  logininfor: {
    title: 'Login Log',
    tab: {
      allLog: 'All Logs',
      myLogin: 'My Logins'
    },
    btn: {
      unlock: 'Unlock'
    },
    column: {
      infoId: 'Access ID',
      userName: 'Username',
      ipaddr: 'Address',
      loginLocation: 'Login Location',
      os: 'OS',
      browser: 'Browser',
      status: 'Login Status',
      loginTime: 'Access Time'
    },
    tip: {
      confirmDelete: 'Are you sure to delete the login log with ID "{ids}"?',
      confirmClear: 'Are you sure to clear all login logs?',
      confirmUnlock: 'Are you sure to unlock user "{name}"?',
      unlockSuccess: 'User {name} unlocked successfully'
    },
    search: {
      ipaddr: 'Login Address',
      phIpaddr: 'Enter login address',
      userName: 'Username',
      phUserName: 'Enter username',
      phStatus: 'Login Status',
      loginTime: 'Login Time'
    }
  },
  ipLocation: {
    title: {
      detail: 'IP Library Details',
      config: 'IP Library Configuration',
      updateNow: 'Update IP Library Now'
    },
    stat: {
      mmdbStatus: 'mmdb Load Status',
      mmdbDesc: 'GeoLite2-City database',
      currentSource: 'Current Source',
      sourceDesc: 'P3TERX=mirror / MaxMind=official',
      fileSize: 'File Size',
      sizeDesc: 'Actual size of mmdb file',
      lastModified: 'Last Modified',
      modifiedDesc: 'Last update time of mmdb file',
      notLoaded: 'Not Loaded'
    },
    field: {
      mmdbPath: 'mmdb File Path',
      mmdbSize: 'mmdb File Size',
      mmdbModified: 'mmdb Last Modified',
      currentSource: 'Current Source',
      maxmindAccountId: 'MaxMind Account ID',
      maxmindLicenseKey: 'MaxMind License Key',
      autoUpdateCron: 'Auto Update Cron',
      xdbStatus: 'ip2region xdb Status',
      updateSource: 'Update Source',
      accountId: 'Account ID',
      licenseKey: 'License Key',
      autoUpdateEnabled: 'Enable Scheduled Auto Update',
      clearCredentials: 'Clear stored MaxMind credentials'
    },
    btn: {
      reload: 'Hot Reload',
      updateNow: 'Update Now',
      config: 'Config',
      confirmUpdate: 'Start Update'
    },
    source: {
      mirror: 'Mirror',
      official: 'Official',
      maxmindOfficial: 'MaxMind Official',
      p3terxMirror: 'P3TERX Mirror'
    },
    hint: {
      cronFormat: '6-field cron with seconds, e.g. 0 0 4 * * 2 = every Tuesday 04:00',
      xdbEnabled: 'Dual-library mode enabled, xdb takes priority for domestic IPs',
      sourceP3terx:
        'P3TERX mirror requires no credentials, downloads GeoLite2-City.mmdb from GitHub; MaxMind official requires Account ID and License Key',
      phAccountId: 'Enter MaxMind Account ID',
      phLicenseKey: 'Enter MaxMind License Key',
      credentialsConfigured: 'Configured (leave blank to keep current value)',
      autoUpdateTip: 'When enabled, will auto-update according to cron: {cron}',
      clearCredentialsTip: 'Check this to clear stored credentials (suitable when switching to P3TERX source)',
      updateAlert:
        'Update will download mmdb file (about 60-100 MB) from remote, then hot-reload automatically, no service restart required.'
    },
    validate: {
      sourceRequired: 'Please select update source',
      maxmindCredentialsRequired: 'Switching to MaxMind source requires Account ID and License Key'
    },
    tip: {
      confirmReload: 'Confirm to reload mmdb file? Useful after manually replacing the file.',
      reloadSuccess: 'Hot reload successful',
      updateSuccess: 'Update successful, new file size {size}, elapsed {elapsed} seconds'
    }
  },
  desensitize: {
    maskedData: 'Masked data'
  },
  frontendError: {
    title: 'Frontend Error Monitoring',
    search: {
      level: 'Level',
      source: 'Source',
      name: 'Name',
      createTime: 'Occurred At',
      phLevel: 'Select level',
      phSource: 'Select source',
      phName: 'Enter error or metric name',
      deviceType: 'Device',
      phDeviceType: 'Select device type'
    },
    column: {
      id: 'ID',
      level: 'Level',
      source: 'Source',
      name: 'Name',
      message: 'Message',
      pageUrl: 'Page',
      value: 'Metric',
      userName: 'Reported By',
      createTime: 'Occurred At',
      operation: 'Operation'
    },
    level: {
      error: 'Error',
      warning: 'Warning',
      info: 'Info'
    },
    source: {
      vue: 'Vue',
      global: 'Global',
      unhandledrejection: 'Rejection',
      resource: 'Resource',
      api: 'API',
      download: 'Download',
      vital: 'Web Vital',
      other: 'Other'
    },
    deviceType: {
      mobile: 'Mobile',
      tablet: 'Tablet',
      desktop: 'Desktop'
    },
    btn: {
      detail: 'Detail',
      clean: 'Clean',
      delete: 'Delete'
    },
    detail: {
      title: 'Error Detail',
      basicInfo: 'Basic Info',
      level: 'Level',
      source: 'Source',
      name: 'Name',
      message: 'Message',
      stack: 'Stack',
      pageUrl: 'Page URL',
      userAgent: 'User Agent',
      viewport: 'Viewport',
      value: 'Metric Value',
      userName: 'Reported By',
      createTime: 'Occurred At',
      vitalInfo: 'Web Vital',
      copy: 'Copy',
      noData: 'No data'
    },
    stats: {
      title: 'Overview',
      bySource: 'By Source',
      daily: 'Daily Error Trend',
      total: 'Total',
      days: 'Last {days} days'
    },
    tip: {
      confirmDelete: 'Confirm to delete the selected frontend error records?',
      confirmClear: 'Confirm to clean frontend error records? All records beyond the retention period will be deleted.',
      clearSuccess: 'Clean successful',
      noSelection: 'Please select records to delete first'
    }
  }
}
