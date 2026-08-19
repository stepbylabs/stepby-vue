export default {
  common: {
    // Button text
    confirm: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    search: 'Search',
    reset: 'Reset',
    export: 'Export',
    import: 'Import',
    refresh: 'Refresh',
    close: 'Close',
    clear: 'Clear',
    submit: 'Submit',
    back: 'Back',
    expand: 'Expand',
    collapse: 'Collapse',
    yes: 'Yes',
    no: 'No',
    detail: 'Detail',
    download: 'Download',
    upload: 'Upload',
    batchDelete: 'Batch Delete',
    copy: 'Copy',
    copyLink: 'Copy Link',
    create: 'Create',
    viewAll: 'View All',
    preview: 'Preview',
    sync: 'Sync',
    // TierS-6: Chart download
    downloadChart: 'Download as image',
    chartDownloaded: 'Chart downloaded',
    chartDownloadFail: 'Chart download failed',
    chartNotReady: 'Chart not ready, please try again later',
    // Status text
    loading: 'Loading...',
    success: 'Operation succeeded',
    failed: 'Operation failed',
    noData: 'No data',
    empty: 'No data',
    // TierA-4: Empty state CTA
    emptyActionCreate: 'Create Now',
    emptyActionReset: 'Reset Filter',
    tip: 'Tip',
    warning: 'Warning',
    error: 'Error',
    other: 'Other',
    status: 'Status',
    enabled: 'Enabled',
    disabled: 'Disabled',
    normal: 'Normal',
    stop: 'Stopped',
    fail: 'Failed',
    successStatus: 'Success',
    waiting: 'Waiting',
    running: 'Running',
    completed: 'Completed',
    // Login & Register
    login: 'Login',
    logging: 'Logging in...',
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to logout?',
    relogin: 'Re-login',
    reloginConfirm: 'Your session has expired. You can stay on the current page or re-login.',
    register: 'Register',
    registering: 'Registering...',
    profile: 'Profile',
    // Operation success messages
    addSuccess: 'Added successfully',
    editSuccess: 'Updated successfully',
    deleteSuccess: 'Deleted successfully',
    operationSuccess: 'Operation successful',
    importSuccess: 'Imported successfully',
    exportSuccess: 'Exported successfully',
    copySuccess: 'Copied successfully',
    copyFail: 'Copy failed',
    saveSuccess: 'Saved successfully',
    refreshSuccess: 'Refreshed successfully',
    clearSuccess: 'Cleared successfully',
    batchDeleteSuccess: 'Batch deleted successfully',
    uploadSuccess: 'Uploaded successfully',
    restoreSuccess: 'Restored successfully',
    // Confirmation templates
    confirmDelete: 'Are you sure to delete the data with ID "{ids}"?',
    confirmDeleteName: 'Are you sure to delete the data named "{name}"?',
    confirmClear: 'Are you sure to clear all data?',
    confirmBatchDelete: 'Confirm to delete {count} selected items?',
    confirmCancelAuth: 'Are you sure to cancel the authorization for the selected users?',
    confirmForceLogout: 'Are you sure to force logout user "{name}"?',
    // Error messages
    selectToDelete: 'Please select data to delete',
    selectToImport: 'Please select data to import',
    selectToExport: 'Please select data to export',
    selectToEdit: 'Please select data to edit',
    selectOneToUnlock: 'Please select one record to unlock',
    selectUser: 'Please select users to assign',
    fileTooLarge: 'File size cannot exceed 10MB',
    formValidationFailed: 'Form validation failed, please check and resubmit',
    // System tips
    systemTip: 'System Tip',
    gotIt: 'Got it',
    downloading: 'Downloading data, please wait...',
    routeLoadFailed: 'Route loading failed',
    loginExpired: 'Login expired, please log in again',
    downloadError: 'Download error, please contact the administrator!',
    exportTruncated:
      'Export reached the row limit; only partial records were exported (narrow your query for full export)',
    // request.ts error messages
    repeatSubmitWarning: 'Data is being processed, please do not submit repeatedly',
    requestSizeExceeded: 'Request data size exceeds the 5M limit, duplicate submission check is skipped.',
    sessionExpired: 'Invalid session or session has expired, please log in again.',
    reloginCanceled: 'User canceled re-login.',
    usernameOrPasswordError: 'Username or password is incorrect',
    passwordError: 'Password is incorrect',
    requestParamError: 'Request parameter error',
    noPermission: 'You do not have permission for this operation',
    tooManyRequests: 'Too many requests, please try again later',
    serviceUnavailable: 'Service is temporarily unavailable, please try again later',
    backendConnectionError: 'Backend API connection failed',
    requestTimeout: 'System API request timed out',
    requestError: 'System API {code} error',
    retryHint: '{message}, click here to retry',
    // Generic load/refresh failure messages (for catch blocks to feedback users)
    loadFailed: 'Failed to load data, please refresh and retry',
    loadDetailFailed: 'Failed to load detail, please retry later',
    submitFailed: 'Submit failed, please retry later',
    cacheRefreshFailed: 'Cache refresh failed, frontend may show stale data',
    treeLoadFailed: 'Failed to load tree structure',
    // G17: unified feedback for list/request failures
    requestFailed: 'Request failed, please try again later',
    // Common columns
    column: {
      id: 'ID',
      name: 'Name',
      status: 'Status',
      createTime: 'Created Time',
      updateTime: 'Updated Time',
      createBy: 'Created By',
      updateBy: 'Updated By',
      remark: 'Remark',
      operation: 'Operation',
      sort: 'Sort',
      type: 'Type',
      description: 'Description',
      size: 'Size',
      duration: 'Duration',
      progress: 'Progress',
      message: 'Message',
      operator: 'Operator',
      result: 'Result'
    },
    form: {
      startDate: 'Start Date',
      endDate: 'End Date',
      keyword: 'Enter keyword',
      selectPlaceholder: 'Please select',
      inputPlaceholder: 'Please input'
    },
    formDraft: {
      confirmRestore: 'Unsaved draft detected. Restore it?',
      restoreSuccess: 'Draft restored',
      restoreFailed: 'Failed to restore draft'
    }
  },
  menu: {
    // Menu i18n key translation table: backend sys_menu.i18n_key stores the key (e.g. "menu.user"),
    // frontend useMenuTitle.translateTitle() translates via t(i18nKey), falling back to menu_name if unmatched
    system: 'System',
    monitor: 'Monitor',
    tool: 'Tools',
    user: 'Users',
    role: 'Roles',
    menu: 'Menus',
    dept: 'Departments',
    post: 'Positions',
    dict: 'Dictionaries',
    config: 'Config',
    notice: 'Announcements',
    msg: 'Message Management',
    msgChannel: 'Message Channels',
    msgTemplate: 'Message Templates',
    msgLog: 'Send Logs',
    log: 'Log Management',
    operlog: 'Operation Log',
    logininfor: 'Login Log',
    online: 'Online Users',
    job: 'Scheduled Jobs',
    druid: 'Druid Monitor',
    cache: 'Cache',
    health: 'Health Check',
    gen: 'Code Generator',
    build: 'Form Builder',
    swagger: 'API Docs',
    file: 'File Manager',
    rateLimit: 'Rate Limit',
    backup: 'Backup',
    task: 'Background Tasks',
    auditDashboard: 'Audit Dashboard',
    ipLocation: 'IP Location',
    myLogin: 'My Logins',
    about: 'About',
    noticeCenter: 'My Notifications',
    mySession: 'Sessions',
    workbench: 'Workbench',
    workbenchIndex: 'Workbench Home',
    shortcuts: 'Shortcuts',
    help: 'Usage Help',
    helpCenter: 'Help Center',
    changelog: 'Changelog',
    dashboard: 'Dashboard',
    website: 'Yebot Website',
    componentNotFound: 'Component "{view}" does not exist, please check menu configuration'
  },
  errorCode: {
    '400': 'Request parameter error',
    '401': 'Authentication failed, unable to access system resources',
    '403': 'No permission for the current operation',
    '404': 'The requested resource does not exist',
    '409': 'Data already exists, please do not repeat the operation',
    '422': 'Request data format error, please check input',
    '429': 'Too many requests, please try again later',
    '500': 'Internal system error',
    '503': 'Service is temporarily unavailable, please try again later',
    default: 'Unknown system error, please report to administrator'
  },
  login: {
    title: 'Yebot Admin System',
    username: 'Username',
    password: 'Password',
    code: 'Captcha',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    remember: 'Remember me',
    welcome: 'Welcome back',
    registerNow: 'Register now',
    signIn: 'Sign in now',
    registerDisabled: 'Registration is disabled. Please contact the administrator if needed.',
    logout: 'Logout and re-login',
    clickRefreshCaptcha: 'Click to refresh captcha',
    totpCode: 'TOTP code (6 digits)',
    captchaLoadFailed: 'Failed to load captcha, please click to retry',
    oauthDivider: 'or login with a third-party account',
    oauthTitle: 'Third-party login',
    oauthBindRequired:
      'This third-party account has not been linked to a system account. Please log in with username/password first.',
    oauthGoLogin: 'Go to login'
  },
  register: {
    title: 'Register',
    username: 'Username',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    code: 'Captcha',
    submit: 'Register',
    clickRefreshCaptcha: 'Click to refresh captcha',
    passwordMismatch: 'The two passwords do not match',
    successTitle: 'Congratulations, your account {username} has been registered successfully!',
    successMessage: 'Please login with the new account'
  },
  oauth: {
    title: 'Third-party login',
    directory: 'Single Sign-On',
    provider: 'Login Config',
    providerList: 'Login Provider Management',
    add: 'Add Provider',
    edit: 'Edit Provider',
    delete: 'Delete Provider',
    toggle: 'Toggle Provider',
    bindings: 'My Third-party Bindings',
    bindManagement: 'Binding Management',
    providerName: 'Provider Name',
    providerCode: 'Provider Code',
    providerType: 'Provider Type',
    clientId: 'Client ID',
    clientSecret: 'Client Secret',
    authorizeUrl: 'Authorize Endpoint',
    tokenUrl: 'Token Endpoint',
    userInfoUrl: 'User Info Endpoint',
    scope: 'Scope',
    redirectUri: 'Redirect URI',
    redirectUriPlaceholder: 'Leave blank to auto-generate callback from request Host',
    scopePlaceholder: 'e.g. read:user user:email, space-separated',
    autoCreateUser: 'Auto-create account on first login',
    enabled: 'Enabled',
    displayOrder: 'Display Order',
    remark: 'Remark',
    createTime: 'Create Time',
    status: {
      enabled: 'Enabled',
      disabled: 'Disabled',
      enabledTip: 'Disabled providers are not shown on the login page.'
    },
    type: {
      github: 'GitHub',
      gitee: 'Gitee',
      wecom: 'WeCom',
      oidc: 'Generic OIDC'
    },
    search: {
      providerName: 'Provider Name',
      providerCode: 'Provider Code',
      providerType: 'Provider Type',
      enabled: 'Status'
    },
    column: {
      operation: 'Operation',
      nickname: 'Third-party Nickname',
      email: 'Third-party Email',
      providerUserId: 'Third-party User ID',
      lastLoginTime: 'Last Login'
    },
    action: {
      bind: 'Bind',
      unbind: 'Unbind',
      edit: 'Edit',
      delete: 'Delete',
      add: 'Add',
      refresh: 'Refresh'
    },
    tip: {
      secretMasked: 'Secret is masked; leave blank to keep unchanged',
      secretRequired: 'Client Secret is required when adding',
      codeRequired: 'Provider code is required',
      nameRequired: 'Provider name is required',
      typeRequired: 'Please select a provider type',
      empty: 'No third-party bindings yet',
      myBindings: 'Manage the third-party identities bound to your account',
      bindSuccess: 'Bound successfully',
      unbindSuccess: 'Unbound successfully',
      unbindConfirm: 'Are you sure you want to unbind this third-party login?',
      unbindSelfLast:
        'This is your only third-party login binding. After unbinding you will not be able to log in via third-party. Continue?',
      pendingHandoff: 'A pending third-party identity was detected and has been bound for you.'
    },
    error: {
      loadFailed: 'Failed to load login provider list',
      authorizeFailed: 'Failed to generate authorization link, please retry',
      callbackError: 'Third-party login failed: {msg}',
      noProvider: 'Third-party login is not available yet'
    }
  },
  httpDebug: {
    title: 'Online HTTP Debugger',
    ssrfTag: 'Server-side proxy · SSRF protected',
    urlPlaceholder: 'Enter target URL (http/https), e.g. https://httpbin.org/get',
    send: 'Send',
    headers: 'Request Headers',
    key: 'Header Name',
    value: 'Header Value',
    keyPlaceholder: 'e.g. Authorization',
    valuePlaceholder: 'e.g. Bearer eyJ...',
    action: 'Action',
    addHeader: 'Add Header',
    body: 'Request Body',
    bodyPlaceholder: 'Enter request body (ignored for GET/HEAD/OPTIONS)',
    bodyHint: 'GET/HEAD/OPTIONS request body is ignored by the server',
    response: 'Response',
    copy: 'Copy Response',
    copied: 'Copied to clipboard',
    copyFail: 'Copy failed',
    redirects: 'Followed {n} redirects',
    emptyBody: 'Empty response body',
    transportError: 'Request transport failed: {detail}',
    urlRequired: 'Please enter a target URL',
    urlSchemeInvalid: 'Only http/https schemes are allowed'
  },
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
  lock: {
    title: 'System Locked',
    tip: 'System is locked, please enter password to unlock',
    passwordPlaceholder: 'Enter login password',
    passwordRequired: 'Please enter login password',
    unlock: 'Click to unlock',
    unlocking: 'Unlocking',
    logout: 'Logout and re-login',
    // Date units
    year: '-',
    month: '-',
    day: ', ',
    // Weekday localization
    weekdays: {
      sun: 'Sunday',
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday'
    }
  },
  error: {
    e401: {
      title: 'No Access Permission!',
      errorTitle: '401 Error!',
      message:
        'Sorry, you do not have access permission. Please do not perform illegal operations! You can return to the home page',
      backHome: 'Back to Home',
      alt: 'Girl has dropped her ice cream.'
    },
    e403: {
      title: '403',
      message: 'Sorry, you do not have permission to access this page',
      backHome: 'Back to Home',
      backPrev: 'Back to Previous',
      ariaLabel: '403 Forbidden page, current path {path}'
    },
    e404: {
      title: '404 Error!',
      message:
        'Sorry, the page you are looking for does not exist. Try checking the URL for errors, then press the refresh button in your browser or try to find something else in our application.',
      notFound: 'Page not found!',
      backHome: 'Back to Home'
    },
    e500: {
      title: '500',
      message: 'The server is temporarily unavailable, please try again later',
      refresh: 'Refresh Page',
      backHome: 'Back to Home',
      ariaLabel: '500 Server error page, current path {path}'
    },
    network: {
      title: 'Network Error',
      message: 'Network error, please check your network connection',
      retry: 'Retry',
      backHome: 'Back to Home',
      ariaLabel: 'Network error page, current path {path}'
    }
  },
  layout: {
    forceLogoutMessage: 'You have been forced offline by an administrator. Please log in again.',
    tour: {
      sidebarTitle: 'Sidebar Menu',
      sidebarContent: 'Click menu items to navigate to pages. Click the collapse button to fold the sidebar.',
      navbarTitle: 'Top Navigation Bar',
      navbarContent:
        'Contains breadcrumb, menu search (Ctrl+K), fullscreen toggle, theme switch, notification bell, user menu, etc.',
      tagsViewTitle: 'Tabs',
      tagsViewContent: 'Visited pages are displayed as tabs. Right-click a tab to close/refresh/close others.',
      appMainTitle: 'Main Content Area',
      appMainContent: 'The current page content is displayed in this area.'
    },
    navbar: {
      skipToContent: 'Skip to main content',
      enterFullscreen: 'Enter Fullscreen',
      exitFullscreen: 'Exit Fullscreen',
      commandPalette: 'Command Palette (Ctrl+K)',
      favorites: 'Favorite Menus',
      favEmpty: 'No favorite menus yet',
      favTip: 'Add favorites via the sidebar right-click menu',
      clearFavorites: 'Clear Favorites',
      recent: 'Recent Views',
      recentEmpty: 'No recent views yet',
      sourceCode: 'Source Code',
      docs: 'Documentation',
      themeMode: 'Theme Mode',
      language: 'Language',
      layoutSize: 'Layout Size',
      preferences: 'Preferences',
      notifications: 'Notifications',
      avatarAlt: "{name}'s avatar",
      layoutSettings: 'Layout Settings',
      lockScreen: 'Lock Screen'
    },
    tagsView: {
      scrollLeft: 'Scroll tabs left',
      scrollRight: 'Scroll tabs right',
      closeTag: 'Close tab {title}',
      closeCurrent: 'Close Current',
      closeOthers: 'Close Others',
      closeLeft: 'Close Left',
      closeRight: 'Close Right',
      closeAll: 'Close All',
      fullscreen: 'Fullscreen',
      exitFullscreen: 'Exit Fullscreen',
      refreshCurrent: 'Refresh current page',
      refreshPage: 'Refresh Page'
    },
    settings: {
      menuNavSetting: 'Menu Navigation Settings',
      leftMenu: 'Left Menu',
      mixedMenu: 'Mixed Menu',
      topMenu: 'Top Menu',
      themeStyleSetting: 'Theme Style Settings',
      autoThemeStyle: 'Follow Theme (Auto)',
      autoThemePreview: 'Follow theme style preview',
      darkThemeStyle: 'Dark theme style',
      darkThemePreview: 'Dark theme style preview',
      lightThemeStyle: 'Light theme style',
      lightThemePreview: 'Light theme style preview',
      iconCheck: 'Icon: check',
      themeColor: 'Theme Color',
      systemLayoutConfig: 'System Layout Config',
      enableTagsView: 'Enable Tags View',
      persistTagsView: 'Persist Tabs',
      showTagsIcon: 'Show Tab Icons',
      tagsViewStyle: 'Tab Style',
      styleCard: 'Card',
      styleChrome: 'Chrome',
      fixedHeader: 'Fixed Header',
      showLogo: 'Show Logo',
      dynamicTitle: 'Dynamic Title',
      footerCopyright: 'Footer Copyright',
      advancedThemeEditor: 'Advanced Theme Editor',
      saveConfig: 'Save Config',
      resetConfig: 'Reset Config',
      savingTip: 'Saving to local, please wait...',
      resettingTip: 'Clearing settings and refreshing, please wait...'
    },
    headerNotice: {
      detailTitle: 'Notice Details',
      empty: 'No notices',
      statusClosed: 'Closed',
      ariaWithUnread: 'Notifications, {count} unread',
      ariaNoUnread: 'Notifications, no unread messages'
    },
    topNav: {
      moreMenus: 'More Menus'
    },
    innerLink: {
      loading: 'Loading page, please wait...'
    }
  },
  dashboard: {
    totalUsers: 'Total Users',
    activeRoles: 'Active Roles',
    activeRolesSuffix: 'enabled',
    todayLogin: 'Today Login',
    onlineUsers: 'Online Users',
    realtime: 'Realtime',
    todayAnomaly: 'Today Anomaly Login IPs',
    loginTrend: 'Login Trend (Last 14 days)',
    operTypeDist: 'Operation Type Distribution',
    userCreateTrend: 'User Creation Trend (Last 30 days)',
    recentOperLog: 'Recent Operation Log',
    loginStatTitle: 'Login Stats (Last 7 days)',
    loginStatSummary: 'Success {success} / Failed {fail}',
    chartLoadFail: 'Chart load failed, please retry',
    loginTrendLoadFail: 'Login trend load failed',
    operDistLoadFail: 'Operation distribution load failed',
    userTrendLoadFail: 'User creation trend load failed',
    buttonSuccess: 'Success',
    buttonFail: 'Failed',
    buttonAll: 'All',
    operTypeAdd: 'Add',
    operTypeUpdate: 'Update',
    operTypeDelete: 'Delete',
    operTypeOther: 'Other',
    versionTitle: 'Current Version:',
    visitRepo: 'Visit Repository',
    visitHome: 'Visit Homepage',
    welcomeTitle: 'Yebot Admin Framework',
    welcomeDesc:
      'Yebot management system can be used for all web applications, such as website admin backend, website member center, CMS, CRM, OA, etc. You can also deeply customize it to build a more powerful system. All frontend and backend code is encapsulated to be concise and easy to get started, with low error rate. It also supports mobile client access. The system will continue to update practical features.',
    freeOpenSource: 'Free & Open Source',
    techStack: 'Tech Stack',
    backendTech: 'Backend Tech',
    frontendTech: 'Frontend Tech',
    contactInfo: 'Contact Info',
    officialSite: 'Website:',
    wechat: 'WeChat:',
    alipay: 'Alipay:',
    changelog: 'Changelog',
    donate: 'Donate',
    donateTip: 'You can buy the author a coffee to show support',
    weekNew: 'New this week',
    failIpCount: 'Failed IPs',
    quickEntry: {
      title: 'Quick Entry',
      tip: 'Click the buttons below to quickly navigate to the corresponding feature page',
      userManage: 'User Management',
      userManageDesc: 'Manage backend user accounts',
      roleManage: 'Role Management',
      roleManageDesc: 'Configure roles and permissions',
      notice: 'Notice',
      noticeDesc: 'Publish system announcements',
      backup: 'Data Backup',
      backupDesc: 'Database backup and restore',
      operLog: 'Operation Log',
      operLogDesc: 'View system operation records',
      myLogin: 'My Login',
      myLoginDesc: 'View personal login history',
      config: 'System Config',
      configDesc: 'Parameters and global settings',
      about: 'About',
      aboutDesc: 'Version and tech stack info'
    }
  },
  myLogin: {
    title: 'My Login',
    currentUser: 'Current User',
    recentCount: 'Login count (last 30 days)',
    successFail: 'Success {success} / Failed {fail}',
    commonIps: 'Common Login IPs',
    anomaly: 'Anomaly Detection',
    anomalyYes: 'Anomaly',
    anomalyNo: 'Normal',
    anomalyBannerTitle: 'Anomalous login behavior detected',
    anomalyBannerDetail:
      'In the last 30 days, {total} login attempts were detected, of which {fail} failed, from {ips} different IPs. If you find any non-self operation, please change your password immediately and check TOTP settings.',
    anomalyTextWarn: 'Failed {fail} / IPs {ips}',
    anomalyTextOk: 'No anomaly detected',
    currentSession: 'This session',
    searchStatus: 'Status',
    allStatus: 'All status',
    searchTime: 'Login Time',
    startDate: 'Start date',
    endDate: 'End date',
    reanalyze: 'Re-analyze',
    columnTime: 'Login Time',
    columnStatus: 'Status',
    columnIp: 'IP Address',
    columnLocation: 'Location',
    columnBrowser: 'Browser',
    columnOs: 'OS',
    columnMsg: 'Message',
    columnSession: 'Current Session',
    sessionTag: 'This',
    success: 'Success',
    failed: 'Failed',
    reanalyzeSuccess: 'Re-analyzed recent login records'
  },
  about: {
    title: 'About',
    projectInfo: 'Project Info',
    projectName: 'Yebot Admin',
    projectDesc: 'Enterprise backend management system based on Axum 0.8 + SeaORM 1.1 + Vue3 + Element Plus',
    frontendVersion: 'Frontend Version',
    backendVersion: 'Backend Version',
    buildMode: 'Build Mode',
    buildTime: 'Build Time',
    vueVersion: 'Vue Version',
    epVersion: 'Element Plus Version',
    viteVersion: 'Vite Version',
    nodeVersion: 'Node.js Version',
    repoButton: 'Repository',
    apiButton: 'API Docs',
    refreshButton: 'Refresh',
    copyButton: 'Copy Info',
    techStack: 'Tech Stack',
    techStackItem: {
      rust: 'Rust (Backend)',
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
    mainDeps: 'Main Dependencies',
    frontendTab: 'Frontend',
    backendTab: 'Backend',
    features: 'System Features',
    feature: {
      f1: 'Rust + Vue3 modern full-stack architecture',
      f2: 'Single executable deployment (frontend embedded)',
      f3: 'Argon2id password hashing + TOTP 2FA',
      f4: 'JWT + Redis session management',
      f5: 'RBAC permission model + data permission',
      f6: 'API rate limit + idempotency + operation log',
      f7: 'Audit trail + compliance report PDF',
      f8: 'IP location library + anomaly login detection',
      f9: 'i18n internationalization (zh/en)',
      f10: 'Dark mode + theme color customization',
      f11: 'Ctrl+K command palette + 9 shortcut groups',
      f12: 'WebSocket real-time communication'
    },
    refreshSuccess: 'Info refreshed',
    copySuccess: 'System info copied to clipboard',
    copyFail: 'Copy failed, please manually select text'
  },
  changelog: {
    title: 'Changelog',
    desc: 'View project version update history',
    searchPlaceholder: 'Search updates...',
    latest: 'Latest',
    noResult: 'No matching update records found'
  },
  noticeCenter: {
    title: 'My Notifications',
    unread: 'Unread',
    unreadTip: 'Notices not yet read',
    total: 'Total',
    totalTip: 'All notices and announcements',
    read: 'Read',
    readTip: 'Notices already read',
    filterAll: 'All',
    filterUnread: 'Unread',
    filterNotice: 'Notices',
    filterAnnouncement: 'Announcements',
    searchPlaceholder: 'Search notice title',
    markAllRead: 'Mark All Read',
    markAllReadSuccess: 'All notices marked as read',
    markAllReadSuccessCount: 'Marked {count} notices as read',
    markReadFail: 'Mark as read failed, please retry later',
    batchRead: 'Batch Read',
    colStatus: 'Status',
    colType: 'Type',
    colTitle: 'Title',
    colCreateBy: 'Created By',
    colCreateTime: 'Created Time',
    unreadTag: 'Unread',
    readTag: 'Read',
    typeNotice: 'Notice',
    typeAnnouncement: 'Announcement',
    typeMessage: 'Message',
    markRead: 'Mark Read',
    detailTitle: 'Notice Details',
    noContent: 'No content',
    batchReadConfirm: 'Mark {count} selected notices as read?',
    markAllReadConfirm: 'Mark all unread notices as read?',
    loadFail: 'Failed to load notices',
    syncReadFail: 'Failed to sync read status',
    noUnreadTip: 'All notices have been read'
  },
  mySession: {
    title: 'My Sessions',
    activeCount: 'Active Sessions',
    activeTip: 'Total active online sessions',
    currentSession: 'Current Session',
    securityStatus: 'Security Status',
    otherSessionAlert: 'Other active sessions detected',
    otherSessionAlertDesc:
      'If you do not recognize any of these sessions, please log them out immediately and change your password.',
    onlySessionAlert: 'Only the current session is active, account is secure',
    searchIp: 'Search IP address',
    colStatus: 'Status',
    colIp: 'IP Address',
    colLocation: 'Location',
    colBrowser: 'Browser',
    colOs: 'OS',
    colLoginTime: 'Login Time',
    currentTag: 'Current',
    otherTag: 'Other',
    logout: 'Logout',
    logoutConfirm: 'Confirm logout session from {ip} ({browser})?',
    logoutSuccess: 'Session logged out',
    logoutFail: 'Logout failed',
    secureGood: 'Secure',
    secureNormal: 'Caution',
    secureWarn: 'At Risk',
    secureGoodTip: 'Only the current session',
    secureNormalTip: '1 other session active',
    secureWarnTip: '{count} other sessions active',
    loadFail: 'Failed to load session list'
  },
  theme: {
    modeTitle: 'Appearance Mode',
    light: 'Light',
    dark: 'Dark',
    auto: 'Follow System',
    lightDesc: 'Always use light theme',
    darkDesc: 'Always use dark theme',
    autoDesc: 'Follow system theme automatically',
    applied: 'Theme switched'
  },
  workbench: {
    profile: 'Profile',
    notices: 'Notices',
    weekLogins: 'Week Logins',
    unreadNotices: 'Unread',
    activeSessions: 'Active Sessions',
    favorites: 'Favorites',
    recentTitle: 'Recent Views',
    recentEmpty: 'No recent views yet',
    favTitle: 'My Favorites',
    favEmpty: 'No favorite menus yet',
    unreadTitle: 'Unread Notices',
    noUnread: 'All notices have been read',
    viewAll: 'View All',
    typeNotice: 'Notice',
    typeAnnouncement: 'Announcement',
    shortcutTitle: 'Shortcuts',
    greetingNight: 'Good Night',
    greetingMorning: 'Good Morning',
    greetingForenoon: 'Good Forenoon',
    greetingNoon: 'Good Noon',
    greetingAfternoon: 'Good Afternoon',
    greetingEvening: 'Good Evening',
    justNow: 'just now',
    minutesAgo: 'm ago',
    hoursAgo: 'h ago',
    daysAgo: 'd ago',
    shortcutProfile: 'Profile',
    shortcutNotice: 'Notices',
    shortcutLogin: 'My Logins',
    shortcutSession: 'Sessions',
    shortcutHotkey: 'Shortcuts',
    shortcutHelp: 'Help',
    shortcutAbout: 'About',
    shortcutLock: 'Lock',
    noRole: 'No role assigned',
    noDept: 'No department assigned',
    clearRecentConfirm: 'Clear all recent views?',
    clearFavConfirm: 'Clear all favorite menus?'
  },
  shortcuts: {
    title: 'Shortcuts Center',
    desc: 'View all keyboard shortcuts with search support. Customizable in preferences.',
    searchPlaceholder: 'Search shortcuts or actions...',
    groups: {
      global: 'Global Actions',
      personal: 'Personal Actions',
      navigation: 'Navigation'
    },
    actions: {
      search: 'Command Palette',
      help: 'Show Shortcut Help',
      fullscreen: 'Toggle Fullscreen',
      toggleSidebar: 'Toggle Sidebar',
      lockScreen: 'Lock Screen',
      toggleDark: 'Toggle Dark Mode',
      settings: 'Open Settings',
      cycleTheme: 'Cycle Theme Color',
      goBack: 'Go Back',
      goForward: 'Go Forward',
      closeTab: 'Close Current Tab',
      refreshTab: 'Refresh Page'
    },
    descriptions: {
      search: 'Quickly navigate menus, run commands or find features',
      help: 'Show this help dialog',
      fullscreen: 'Toggle between fullscreen and windowed mode',
      toggleSidebar: 'Collapse or expand the left menu',
      lockScreen: 'Lock the screen, requires password to unlock',
      toggleDark: 'Toggle between light and dark theme',
      settings: 'Open layout and preferences drawer',
      cycleTheme: 'Cycle through preset theme colors',
      goBack: 'Navigate to the previously visited page',
      goForward: 'Navigate to the next visited page',
      closeTab: 'Close the current tab in multi-tab view',
      refreshTab: 'Refresh the current page content'
    },
    tipTitle: 'Usage Tips',
    tipCustomize: 'All shortcuts can be customized in Preferences > Shortcuts.',
    tipConflicts: 'If conflicts with browser shortcuts occur, change to a non-conflicting combination in preferences.',
    tipBrowser: 'Some shortcuts (e.g. Ctrl+N) are reserved by the browser and cannot be intercepted by web pages.',
    noResult: 'No matching shortcuts found',
    copySuccess: 'Shortcut combination copied to clipboard',
    copyFail: 'Copy failed, please select text manually',
    keyboardShortcuts: 'Keyboard Shortcuts',
    settingsPanelTip: 'Settings panel opened',
    openSettingsTip: 'Click the settings icon in the top-right corner to open',
    helpItem: {
      help: 'Show this help panel',
      search: 'Open command palette',
      fullscreen: 'Toggle fullscreen',
      lockScreen: 'Lock screen',
      toggleDark: 'Toggle dark mode',
      settings: 'Open settings panel',
      toggleSidebar: 'Collapse/expand sidebar',
      cycleTheme: 'Cycle theme color'
    }
  },
  // TierA-5: Password strength indicator
  passwordStrength: {
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
    veryStrong: 'Very Strong',
    tipLength: 'Use at least 9 characters',
    tipUpper: 'Add uppercase letters',
    tipNumber: 'Add numbers',
    tipSpecial: 'Add special characters'
  },
  // TierA-6: Table print
  printTable: {
    title: 'Data Print',
    print: 'Print',
    printed: 'Print window opened',
    printFail: 'Print failed, please retry',
    noData: 'No data to print'
  },
  // TierB-1: Error boundary
  errorBoundary: {
    title: 'Page Load Failed',
    desc: 'An error occurred during page rendering. You can try reloading or return to the home page.',
    retry: 'Retry',
    goHome: 'Go Home',
    details: 'Error Details'
  },
  help: {
    title: 'Help Center',
    desc: 'Quick start, feature guide, FAQ and contacts',
    toc: 'Table of Contents',
    searchPlaceholder: 'Search section titles...',
    noResult: 'No matching sections found',
    sections: {
      quickStart: {
        title: 'Quick Start',
        intro: 'Welcome to Yebot admin system. Follow these steps to get started:',
        step1Title: '1. Login',
        step1Desc:
          'Login with the credentials provided by your administrator. Change your password and bind TOTP immediately after first login.',
        step2Title: '2. Browse Menus',
        step2Desc:
          'The left sidebar groups features by module. Press Ctrl+K to open the command palette for quick navigation.',
        step3Title: '3. Personalize',
        step3Desc: 'Adjust layout, theme color, dark mode and other preferences in the top-right Settings drawer.',
        step4Title: '4. Bookmark Frequently Used Features',
        step4Desc: 'Right-click on sidebar menus to bookmark them for quick access.'
      },
      permissions: {
        title: 'Permissions',
        intro: 'The system uses an RBAC permission model. Different roles have access to different features:',
        roles: {
          admin: 'Super Admin',
          manager: 'Department Manager',
          common: 'Regular User'
        },
        roleDesc: {
          admin: 'Full permissions to manage users, roles, menus, dictionaries and all resources. Cannot be deleted.',
          manager: 'Can manage department users, view audit logs and partial configs. No system-level permissions.',
          common: 'Can view personal info, notices, login history. No admin permissions.'
        }
      },
      shortcuts: {
        title: 'Common Shortcuts',
        intro: 'Below are high-frequency shortcuts. Visit the Shortcuts Center for the full list:',
        viewAll: 'View All Shortcuts'
      },
      customization: {
        title: 'Personalization',
        intro: 'The system supports rich personalization to make your experience more comfortable:',
        feature1Title: 'Layout Switching',
        feature1Desc: 'Three layout modes: sidebar / top-nav / mixed.',
        feature2Title: 'Theme Color',
        feature2Desc: '8 preset theme colors with custom color support.',
        feature3Title: 'Dark Mode',
        feature3Desc: 'Toggle manually or follow system setting, eye-friendly.',
        feature4Title: 'Multi-language',
        feature4Desc: 'Supports Simplified Chinese and English, switchable from the top-right.',
        feature5Title: 'Custom Shortcuts',
        feature5Desc: 'All global shortcuts can be customized in preferences.'
      },
      security: {
        title: 'Data Security',
        intro: 'The system protects your data from multiple layers:',
        feature1Title: 'Password Encryption',
        feature1Desc: 'Uses Argon2id + random salt for password hashing. Plaintext is never stored.',
        feature2Title: 'TOTP 2FA',
        feature2Desc: 'Supports Google Authenticator and other TOTP apps to enhance account security.',
        feature3Title: 'Session Management',
        feature3Desc: 'View and remotely log out your active sessions. Handle anomalies immediately.',
        feature4Title: 'Operation Audit',
        feature4Desc: 'All write operations (create/update/delete) are logged for traceability.'
      },
      faq: {
        title: 'FAQ',
        q1: 'What if I forget my password?',
        a1: 'Please contact the administrator to reset your password in User Management. Change to a new password immediately after login.',
        q2: 'What if TOTP verification fails?',
        a2: 'If your phone is lost or TOTP app is reset, contact the administrator to clear your TOTP binding in User Management, then re-bind.',
        q3: 'Why are some menus not visible?',
        a3: 'Menu visibility is determined by your role permissions. Contact the administrator to assign appropriate permissions in Role Management.',
        q4: 'Why was I logged out unexpectedly?',
        a4: 'Another device may have logged in with the same account (SSO), or the administrator forced your session offline. Check active sessions in Session Management.',
        q5: 'How to switch language?',
        a5: 'Click the globe icon in the top-right corner to switch between Simplified Chinese and English. Your choice is persisted locally.',
        q6: 'How to report issues or suggestions?',
        a6: 'You can submit feedback via GitHub Issue or email through the contact channels below. We will process them as soon as possible.'
      },
      contact: {
        title: 'Contact',
        intro: 'If you have questions or suggestions, feel free to reach us through the following channels:',
        github: 'GitHub',
        githubDesc: 'Submit Issue or Pull Request',
        website: 'Website',
        websiteDesc: 'yebot.dev',
        email: 'Email Support',
        emailDesc: "support{'@'}yebot.dev"
      }
    }
  },
  user: {
    title: 'User Management',
    search: {
      username: 'Username',
      phUsername: 'Enter username',
      phone: 'Phone',
      phPhone: 'Enter phone',
      status: 'Status',
      phStatus: 'User status',
      dept: 'Department',
      phDept: 'Enter dept name',
      createTime: 'Created Time'
    },
    column: {
      id: 'User ID',
      username: 'Username',
      nickName: 'Nickname',
      dept: 'Department',
      phone: 'Phone',
      status: 'Status',
      createTime: 'Created Time'
    },
    form: {
      username: 'Username',
      nickName: 'Nickname',
      dept: 'Department',
      phone: 'Phone',
      email: 'Email',
      status: 'Status',
      password: 'Password',
      phPassword: 'Enter password',
      sex: 'Gender',
      role: 'Role',
      remark: 'Remark',
      post: 'Position'
    },
    tip: {
      editPwd: 'Enter new password',
      resetPwdTitle: 'Reset Password',
      oldPwd: 'Old Password',
      importUser: 'Import Users',
      confirmStatusChange: 'Are you sure to "{text}" user "{name}"?',
      resetPwdSuccess: 'Password changed successfully, the new password is: {password}'
    },
    validate: {
      userNameRequired: 'Username is required',
      userNameLength: 'Username length must be between 2 and 20',
      nickNameRequired: 'Nickname is required',
      emailRequired: 'Email is required',
      emailFormat: 'Please enter a valid email address',
      phoneRequired: 'Phone number is required',
      phoneFormat: 'Please enter a valid phone number',
      phoneRegion: 'Phone number does not match the selected country/region',
      oldPasswordRequired: 'Old password is required',
      confirmPasswordRequired: 'Confirm password is required',
      passwordNotMatch: 'The two passwords do not match'
    },
    import: {
      title: 'Import Users',
      tip: 'Download the template first, fill in the data following its format, then upload an .xlsx file (only .xlsx is supported). Rows are validated one by one; a failing row does not abort the whole import, and errors are echoed below.',
      downloadTemplate: 'Download Import Template',
      uploadTip: 'Click or drag a file here to upload. Only .xlsx is supported',
      uploadSuccess: 'File uploaded successfully',
      uploadEmptyFile: 'Cannot upload an empty file',
      notXlsx: 'Only .xlsx files are supported',
      updateSupport: 'Update the user profile if the login name already exists',
      importBtn: 'Start Import',
      importing: 'Importing...',
      successCount: 'Successfully imported {n} users',
      errorTotal: '{n} rows failed validation',
      noError: 'All data passed validation',
      column: {
        rowNum: 'Row Number',
        error: 'Error Reason'
      }
    },
    authRole: {
      title: 'Role Information'
    },
    resetPwd: 'Reset Password',
    assignRoles: 'Assign Roles',
    initialPasswordWarning: 'Your password is still the initial password. Please change it!',
    passwordExpiredWarning: 'Your password has expired. Please change it as soon as possible!',
    securityTip: 'Security Tip'
  },
  role: {
    title: 'Role Management',
    search: {
      roleName: 'Role Name',
      phRoleName: 'Enter role name',
      roleKey: 'Role Key',
      phRoleKey: 'Enter role key',
      status: 'Status',
      phStatus: 'Role status',
      createTime: 'Created Time'
    },
    column: {
      id: 'Role ID',
      roleName: 'Role Name',
      roleKey: 'Role Key',
      sort: 'Sort',
      status: 'Status',
      createTime: 'Created Time'
    },
    form: {
      roleName: 'Role Name',
      roleKey: 'Role Key',
      roleSort: 'Sort',
      status: 'Status',
      dataScope: 'Data Scope',
      menuTree: 'Menu Permission',
      deptTree: 'Data Permission',
      remark: 'Remark'
    },
    authUser: {
      batchCancel: 'Batch Cancel Authorization',
      cancel: 'Cancel Authorization',
      confirmCancelAuth: 'Are you sure to cancel the role for user "{name}"?',
      cancelAuthSuccess: 'Authorization cancelled successfully',
      confirmBatchCancel: 'Are you sure to cancel the authorization for the selected users?'
    },
    label: {
      selectAll: 'Select All/None',
      linkage: 'Parent-Child Linkage'
    },
    selectUser: {
      title: 'Select User',
      selectUser: 'Please select users to assign'
    },
    dataScope: 'Data Permission',
    tip: {
      roleKeyHelp: "Permission key defined in the controller, e.g.: ＠PreAuthorize(`＠ss.hasRole('admin')`)",
      confirmStatusChange: 'Are you sure to "{text}" role "{name}"?'
    },
    dataScopeOptions: {
      all: 'All data permissions',
      custom: 'Custom data permissions',
      dept: 'Current department data permissions',
      deptAndBelow: 'Current department and below data permissions',
      self: 'Self data permissions only'
    },
    validate: {
      roleNameRequired: 'Role name is required',
      roleKeyRequired: 'Role key is required',
      roleSortRequired: 'Role sort is required'
    }
  },
  userAuthRole: {
    submit: 'Submit',
    back: 'Back',
    authSuccess: 'Authorization succeeded'
  },
  dict: {
    title: 'Dict Management',
    search: {
      dictName: 'Dict Name',
      phDictName: 'Enter dict name',
      dictType: 'Dict Type',
      phDictType: 'Enter dict type',
      status: 'Status',
      phStatus: 'Dict status',
      createTime: 'Created Time'
    },
    column: {
      id: 'Dict ID',
      dictName: 'Dict Name',
      dictType: 'Dict Type',
      status: 'Status',
      remark: 'Remark',
      createTime: 'Created Time'
    },
    form: {
      dictName: 'Dict Name',
      dictType: 'Dict Type',
      status: 'Status',
      remark: 'Remark'
    },
    data: {
      title: 'Dict Data',
      label: 'Label',
      labelEn: 'Label (EN)',
      value: 'Value',
      sort: 'Sort',
      listClass: 'Tag Style',
      cssClass: 'CSS Class',
      status: 'Status',
      remark: 'Remark',
      listClassOptions: {
        default: 'Default',
        primary: 'Primary',
        success: 'Success',
        info: 'Info',
        warning: 'Warning',
        danger: 'Danger'
      }
    },
    detail: {
      loading: 'Loading...',
      noData: 'No dict data',
      total: 'Total',
      normal: 'Normal',
      disabled: 'Disabled',
      label: 'Label',
      value: 'Value',
      status: 'Status'
    },
    tip: {
      dictTypeHelp: 'The Key value in the data store, e.g.: sys_user_sex'
    },
    validate: {
      dictNameRequired: 'Dict name is required',
      dictTypeRequired: 'Dict type is required',
      dataLabelRequired: 'Data label is required',
      dataValueRequired: 'Data value is required',
      dataSortRequired: 'Data sort is required'
    }
  },
  config: {
    title: 'Config',
    search: {
      configName: 'Config Name',
      phConfigName: 'Enter config name',
      configKey: 'Config Key',
      phConfigKey: 'Enter config key',
      configType: 'System Built-in',
      phConfigType: 'Built-in',
      createTime: 'Created Time'
    },
    column: {
      id: 'Config ID',
      configName: 'Config Name',
      configKey: 'Config Key',
      configValue: 'Config Value',
      configType: 'Built-in',
      remark: 'Remark',
      createTime: 'Created Time'
    },
    form: {
      configName: 'Config Name',
      configKey: 'Config Key',
      configValue: 'Config Value',
      configType: 'Built-in',
      remark: 'Remark'
    },
    validate: {
      configNameRequired: 'Config name is required',
      configKeyRequired: 'Config key is required',
      configValueRequired: 'Config value is required'
    }
  },
  rateLimit: {
    title: 'Rate Limit',
    titleAdd: 'Add Rate Limit',
    titleEdit: 'Edit Rate Limit',
    search: {
      routePattern: 'Route Pattern',
      phRoutePattern: 'Enter route pattern',
      enabled: 'Enabled'
    },
    column: {
      id: 'ID',
      routePattern: 'Route Pattern',
      capacity: 'Capacity',
      refillPerSecond: 'Refill/s',
      enabled: 'Enabled',
      description: 'Description',
      createTime: 'Created Time'
    },
    form: {
      routePattern: 'Route Pattern',
      phRoutePattern: 'e.g. /system/user, /login, *',
      capacity: 'Capacity',
      capacityTip: 'Burst request limit',
      phCapacity: '1-10000',
      refillPerSecond: 'Refill/s',
      refillTip: 'Tokens refilled per second',
      phRefillPerSecond: '0.1-1000',
      enabled: 'Enabled',
      description: 'Description',
      phDescription: 'Enter description'
    },
    validate: {
      routePatternRequired: 'Route pattern is required',
      capacityRequired: 'Capacity is required',
      capacityRange: 'Capacity must be 1-10000',
      refillRequired: 'Refill rate is required',
      refillRange: 'Refill rate must be 0.1-1000'
    },
    buttons: {
      add: 'Add',
      edit: 'Edit',
      delete: 'Delete',
      export: 'Export',
      search: 'Search',
      reset: 'Reset',
      confirm: 'OK',
      cancel: 'Cancel',
      globalDefault: 'Global Default'
    },
    tip: {
      confirmDelete: 'Are you sure to delete the rate limit with ID "{ids}"?',
      confirmStatusChange: 'Are you sure to "{text}" rate limit "{name}"?',
      statusChangeSuccess: '{text} succeeded'
    }
  },
  auditDashboard: {
    title: 'Audit Dashboard',
    stat: {
      totalOps: 'Total Ops',
      successOps: 'Success',
      failOps: 'Failed',
      activeUsers: 'Active Users'
    },
    chart: {
      trend: 'Operation Trend',
      trendRange: 'Operation Trend (last {days} days)',
      businessDist: 'Business Type',
      topUsers: 'Top 10 Active Users',
      topModules: 'Top 10 Active Modules',
      failTrend: 'Anomaly Trend',
      failCount: 'Fail Count'
    },
    alarm: {
      title: 'Abnormal Alarm',
      normal: 'Healthy, no abnormal alarm',
      triggered: 'Abnormal operations detected, please review',
      totalInWindow: 'Ops in window',
      failInWindow: 'Fails in window',
      failRate: 'Fail rate',
      burstOperators: 'High-fail operators',
      burstModules: 'High-fail modules',
      times: '{count} times',
      thresholdSet: 'Threshold ({window}min, fail>{count}, or rate>{rate}%)'
    },
    btn: {
      exportPdf: 'Export Report',
      days7: '7d',
      days14: '14d',
      days30: '30d'
    },
    tip: {
      clickToViewOperlog: 'Click a pie slice to jump to the operation log filtered by business type'
    },
    businessType: {
      other: 'Other',
      insert: 'Insert',
      update: 'Update',
      delete: 'Delete',
      grant: 'Grant',
      export: 'Export',
      import: 'Import',
      forceLogout: 'Force Logout',
      genCode: 'Generate Code',
      clean: 'Clean Data'
    },
    report: {
      title: 'Audit Compliance Report',
      period: 'Period',
      totalOps: 'Total Ops',
      successOps: 'Success Ops',
      failOps: 'Failed Ops',
      successRate: 'Success Rate',
      businessType: 'Business Type',
      operCount: 'Operation Count',
      username: 'Username',
      time: 'Time',
      module: 'Module',
      operator: 'Operator',
      ip: 'IP',
      errorMsg: 'Error Message',
      noData: 'No report data',
      exportSuccess: 'Compliance report exported successfully',
      exportFail: 'Failed to export PDF',
      sectionOverview: 'I. Operation Overview',
      section2: 'II. Business Type Distribution',
      section3: 'III. Top 10 Active Users',
      sectionAnomalies: 'IV. Anomaly Operation List (Recent {count} records)',
      unknownBusinessType: 'Type {type}',
      periodConnector: 'to',
      generatedAt: 'Generated at',
      footerDisclaimer: 'This report is auto-generated by the yebot system | For audit compliance purposes only'
    }
  },
  dept: {
    title: 'Department Management',
    search: {
      deptName: 'Dept Name',
      phDeptName: 'Enter dept name',
      status: 'Status'
    },
    column: {
      name: 'Dept Name',
      order: 'Sort',
      status: 'Status',
      createTime: 'Created Time'
    },
    form: {
      parentDept: 'Parent Dept',
      deptName: 'Dept Name',
      order: 'Sort',
      leader: 'Leader',
      phone: 'Phone',
      email: 'Email',
      status: 'Status'
    },
    tip: {
      noSortChange: 'No sort changes detected',
      sortSaved: 'Sort saved successfully',
      confirmDelete: 'Are you sure to delete the data named "{name}"?'
    },
    validate: {
      parentDeptRequired: 'Parent department is required',
      deptNameRequired: 'Department name is required',
      orderNumRequired: 'Display order is required',
      emailFormat: 'Please enter a valid email address',
      phoneFormat: 'Please enter a valid phone number'
    }
  },
  post: {
    title: 'Position Management',
    search: {
      postCode: 'Post Code',
      phPostCode: 'Enter post code',
      postName: 'Post Name',
      phPostName: 'Enter post name',
      status: 'Status'
    },
    column: {
      id: 'Post ID',
      postCode: 'Post Code',
      postName: 'Post Name',
      sort: 'Sort',
      status: 'Status',
      createTime: 'Created Time'
    },
    form: {
      postName: 'Post Name',
      postCode: 'Post Code',
      postSort: 'Sort',
      status: 'Status',
      remark: 'Remark'
    },
    tip: {
      confirmDelete: 'Are you sure to delete the post with ID "{ids}"?'
    },
    validate: {
      postNameRequired: 'Post name is required',
      postCodeRequired: 'Post code is required',
      postSortRequired: 'Post sort is required'
    }
  },
  menuModule: {
    title: 'Menu Management',
    search: {
      menuName: 'Menu Name',
      phMenuName: 'Enter menu name',
      status: 'Status',
      phStatus: 'Menu status'
    },
    column: {
      name: 'Menu Name',
      icon: 'Icon',
      sort: 'Sort',
      perms: 'Permission',
      path: 'Component Path',
      status: 'Status'
    },
    form: {
      parentMenu: 'Parent Menu',
      phParentMenu: 'Select parent menu',
      menuType: 'Menu Type',
      menuName: 'Menu Name',
      phMenuName: 'Enter menu name',
      order: 'Sort',
      icon: 'Menu Icon',
      phIcon: 'Click to select icon',
      perms: 'Permission Key',
      phPerms: 'Enter permission key',
      path: 'Route Path',
      phPath: 'Enter route path',
      component: 'Component Path',
      phComponent: 'Enter component path',
      query: 'Route Query',
      phQuery: 'Enter route query',
      isFrame: 'External Link',
      cache: 'Cache',
      visible: 'Visible',
      status: 'Menu Status',
      routeName: 'Route Name',
      phRouteName: 'Enter route name',
      i18nKey: 'i18n Key',
      phI18nKey: 'Enter i18n key, e.g. menu.user',
      i18nKeyColumn: 'i18n Key'
    },
    tip: {
      menuTypeDir: 'Directory',
      menuTypeMenu: 'Menu',
      menuTypeButton: 'Button',
      link: 'External',
      cache: 'Cached',
      noCache: 'Not Cached',
      noSortChange: 'No sort changes detected',
      sortSaved: 'Sort saved successfully',
      confirmDelete: 'Are you sure to delete the data named "{name}"?',
      routeNameHelp:
        'Defaults to the same as the route path, e.g.: if path is `user`, name is `User` (Note: since router deletes routes with duplicate names, please customize to ensure uniqueness in special cases)',
      isFrameHelp: 'If set to external link, the route path must start with `http(s)://`',
      pathHelp:
        'The route path to access, e.g.: `user`. For external links that need internal access, start with `http(s)://`',
      componentHelp: 'The component path to access, e.g.: `system/user/index`, under the `views` directory by default',
      permsHelp: "Permission key defined in the controller, e.g.: ＠PreAuthorize(`＠ss.hasPermi('system:user:list')`)",
      queryHelp: 'Default parameters for the route, e.g.: `｛"id": 1, "name": "ry"｝`',
      cacheHelp: 'If set to yes, it will be cached by `keep-alive`. The component `name` must match the route path',
      visibleHelp: 'If set to hidden, the route will not appear in the sidebar but can still be accessed',
      statusHelp: 'If set to disabled, the route will not appear in the sidebar and cannot be accessed',
      i18nKeyHelp:
        'Optional. When set, the frontend will translate the menu title by this key first (e.g. `menu.user`); falls back to the menu name if not matched. Leave empty to display the menu name directly.'
    },
    validate: {
      menuNameRequired: 'Menu name is required',
      orderNumRequired: 'Menu sort is required',
      pathRequired: 'Route path is required'
    }
  },
  notice: {
    title: 'Announcements',
    search: {
      title: 'Notice Title',
      phTitle: 'Enter notice title',
      createBy: 'Created By',
      phCreateBy: 'Enter creator',
      type: 'Notice Type'
    },
    column: {
      id: 'Notice ID',
      title: 'Title',
      type: 'Type',
      createBy: 'Created By',
      createTime: 'Created Time'
    },
    form: {
      title: 'Notice Title',
      type: 'Notice Type',
      content: 'Content',
      status: 'Status',
      emailNotify: 'Email Notification',
      emailTip: 'Notify all enabled users via email at the same time',
      emailInactive: 'No',
      emailOnlyEnabled: 'Only effective when system email is configured'
    },
    btn: {
      readUsers: 'Read Users'
    },
    readUsers: {
      dialogTitle: 'Read Users of "{title}"',
      totalReaders: '{count} readers in total',
      phSearch: 'Login Name / Username',
      column: {
        id: 'ID',
        loginName: 'Login Name',
        userName: 'Username',
        dept: 'Department',
        phone: 'Phone',
        readTime: 'Read Time'
      }
    },
    tip: {
      confirmDelete: 'Are you sure to delete the notice with ID "{ids}"?'
    },
    validate: {
      noticeTitleRequired: 'Notice title is required',
      noticeTypeRequired: 'Notice type is required'
    }
  },
  msg: {
    title: 'Message Management',
    channel: {
      title: 'Message Channels',
      type: {
        email: 'Email',
        sms: 'SMS',
        site: 'Site'
      },
      search: {
        channelName: 'Channel Name',
        phChannelName: 'Enter channel name',
        phStatus: 'Status'
      },
      column: {
        channelName: 'Channel Name',
        channelCode: 'Channel Code',
        channelType: 'Channel Type',
        remark: 'Remark'
      },
      form: {
        channelName: 'Channel Name',
        channelType: 'Channel Type',
        status: 'Status',
        statusNormal: 'Normal',
        statusDisabled: 'Disabled',
        configJson: 'Channel Config',
        phConfigJson:
          '{ "smtp_host": "smtp.qq.com", "smtp_port": 465, "smtp_user": "xxx@qq.com", "smtp_password": "xxx" }',
        phConfigGeneric: 'Enter the config JSON for this channel type',
        configSecretTip:
          'Tip: sensitive fields such as smtp_password / password are masked as ******. Leave blank when editing to keep unchanged.',
        remark: 'Remark',
        phRemark: 'Enter remark'
      },
      btn: {
        test: 'Test'
      },
      test: {
        title: 'Channel Connectivity Test',
        tip: 'Click "Start Test" to run a connectivity test with this channel config. Make sure the config is correct.',
        start: 'Start Test'
      },
      testSuccess: 'Channel test passed',
      tip: {
        confirmDelete: 'Are you sure to delete the channel with ID "{ids}"?'
      },
      validate: {
        channelNameRequired: 'Channel name is required',
        channelTypeRequired: 'Channel type is required'
      }
    },
    template: {
      title: 'Message Templates',
      search: {
        templateName: 'Template Name',
        phTemplateName: 'Enter template name',
        templateCode: 'Template Code',
        phTemplateCode: 'Enter template code',
        phStatus: 'Status'
      },
      column: {
        templateName: 'Template Name',
        templateCode: 'Template Code',
        channelCode: 'Channel Code',
        templateSubject: 'Template Subject'
      },
      form: {
        templateName: 'Template Name',
        templateCode: 'Template Code',
        channelCode: 'Channel Code',
        status: 'Status',
        statusNormal: 'Normal',
        statusDisabled: 'Disabled',
        templateSubject: 'Template Subject',
        phTemplateSubject: 'Enter template subject',
        templateContent: 'Template Content',
        phTemplateContent: 'Enter template content',
        remark: 'Remark',
        phRemark: 'Enter remark'
      },
      var: {
        label: 'Variable Placeholder',
        hint: 'Supports {{variable}} placeholders, replaced with actual values when sending. Click to insert:',
        previewSubject: 'Subject Preview',
        previewContent: 'Content Preview',
        sampleName: 'John',
        sampleContent: 'Sample content after variable substitution'
      },
      tip: {
        confirmDelete: 'Are you sure to delete the template with ID "{ids}"?'
      },
      validate: {
        templateNameRequired: 'Template name is required',
        templateCodeRequired: 'Template code is required',
        templateSubjectRequired: 'Template subject is required',
        templateContentRequired: 'Template content is required'
      }
    },
    log: {
      title: 'Send Logs',
      search: {
        toAddr: 'Recipient',
        phToAddr: 'Enter recipient',
        templateCode: 'Template Code',
        phTemplateCode: 'Template Code',
        channelCode: 'Channel Code',
        phChannelCode: 'Channel Code',
        phStatus: 'Status'
      },
      column: {
        templateCode: 'Template Code',
        channelCode: 'Channel Code',
        toAddr: 'Recipient',
        subject: 'Subject',
        status: 'Status',
        retry: 'Retry Count',
        lastError: 'Last Error',
        sendTime: 'Send Time'
      },
      btn: {
        clean: 'Clean',
        retry: 'Retry'
      },
      status: {
        success: 'Success',
        fail: 'Failed',
        pending: 'Pending Retry'
      },
      tip: {
        confirmDelete: 'Are you sure to delete the send log with ID "{ids}"?',
        confirmClean: 'Are you sure you want to clear all send logs? This action cannot be undone!',
        confirmRetry: 'Are you sure you want to retry send log "{logId}"?'
      },
      cleanSuccess: 'Send logs cleared',
      retrySuccess: 'Retry succeeded'
    }
  },
  task: {
    title: 'Background Tasks Center',
    search: {
      taskType: 'Task Type',
      phTaskType: 'Task type',
      status: 'Status',
      phStatus: 'Status',
      operator: 'Operator',
      phOperator: 'Enter operator',
      createTime: 'Created Time'
    },
    column: {
      id: 'Task ID',
      name: 'Task Name',
      type: 'Type',
      status: 'Status',
      progress: 'Progress',
      currentTotal: 'Current/Total',
      operator: 'Operator',
      resultMsg: 'Result Message',
      createTime: 'Created Time'
    },
    form: {
      taskTypeOperLog: 'Operation Log Export',
      taskTypeBackup: 'Data Backup',
      taskTypeOther: 'Other',
      statusWaiting: 'Waiting',
      statusRunning: 'Running',
      statusCompleted: 'Completed',
      statusFailed: 'Failed'
    },
    tip: {
      confirmDelete: 'Are you sure to delete {count} selected task records?'
    },
    btn: {
      viewBackups: 'View Backups'
    }
  },
  backup: {
    title: 'Backup Management',
    search: {
      type: 'Backup Type',
      phType: 'Backup type',
      status: 'Status',
      phStatus: 'Status',
      createTime: 'Backup Time'
    },
    column: {
      id: 'Backup ID',
      fileName: 'File Name',
      size: 'File Size',
      type: 'Type',
      status: 'Status',
      createBy: 'Created By',
      createTime: 'Created Time'
    },
    form: {
      manual: 'Manual Backup',
      auto: 'Auto Backup',
      success: 'Success',
      fail: 'Failed'
    },
    btn: {
      create: 'Create Backup',
      download: 'Download',
      restore: 'Restore'
    },
    tip: {
      backupSuccess: 'Backup succeeded',
      restoreSuccess: 'Restore succeeded',
      downloadFail: 'Download failed',
      confirmDelete: 'Are you sure to delete {count} selected backup records and files?',
      confirmCreate:
        'Are you sure to create a database backup now? This operation may take a few seconds to several minutes.',
      confirmRestore:
        'Are you sure to restore the database from backup "{name}"? This will overwrite all current database data and cannot be undone!'
    }
  },
  file: {
    title: 'File Manager',
    search: {
      fileName: 'File Name',
      phFileName: 'File name prefix',
      type: 'Type',
      phType: 'All'
    },
    column: {
      fileName: 'File Name',
      preview: 'Preview',
      type: 'Type',
      size: 'Size',
      updateTime: 'Updated Time'
    },
    btn: {
      upload: 'Upload File',
      download: 'Download',
      copyLink: 'Copy Link'
    },
    tip: {
      confirmDelete: 'Are you sure to delete file "{name}"?',
      confirmBatchDelete: 'Are you sure to delete {count} selected files?',
      linkCopied: 'Link copied',
      unsupportedType: 'Unsupported file type',
      externalLinkBlocked: 'External links are not allowed to download due to security risk',
      batchDeletePartial: '{success}/{total} deleted, {fail} failed'
    },
    unknownType: 'Unknown',
    ariaLabel: {
      download: 'Download',
      copyLink: 'Copy Link',
      preview: 'Preview image'
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
      phUserName: 'Enter username'
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
        "Bean example: ryTask.ryParams('ry')<br />Class example: com.yebot.quartz.task.RyTask.ryParams('ry')<br />Parameter description: supports string, boolean, long, float, integer",
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
  // server module merged into health (P0-1), i18n keys migrated to health.column
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
        'Compare field differences between request params (new value) and response (after modification) for audit tracking',
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
        'No field differences (no overlapping fields between request params and response data, or only add/delete operations)',
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
  userView: {
    title: 'User Detail',
    basicInfo: 'Basic Info',
    otherInfo: 'Other Info',
    label: {
      userName: 'Username:',
      dept: 'Department:',
      phone: 'Phone:',
      email: 'Email:',
      loginAccount: 'Login Account:',
      status: 'Status:',
      post: 'Position:',
      sex: 'Gender:',
      role: 'Role:',
      createBy: 'Created By:',
      createTime: 'Created Time:',
      updateBy: 'Updated By:',
      updateTime: 'Updated Time:',
      lastLoginIp: 'Last Login IP:',
      lastLoginTime: 'Last Login Time:',
      remark: 'Remark:'
    },
    placeholder: {
      noPost: 'No Position',
      noRole: 'No Role'
    }
  },
  report: {
    title: 'Report Definition',
    search: {
      reportName: 'Report Name',
      phReportName: 'Enter report name',
      phReportType: 'Report Type',
      phStatus: 'Status'
    },
    column: {
      reportCode: 'Report Code',
      reportName: 'Report Name',
      reportType: 'Report Type',
      createBy: 'Created By',
      createTime: 'Create Time'
    },
    btn: {
      subscription: 'Subscription',
      preview: 'Preview'
    },
    form: {
      reportCode: 'Report Code',
      phReportCode: 'Enter report code',
      reportName: 'Report Name',
      phReportName: 'Enter report name',
      reportType: 'Report Type',
      config: 'Report Config',
      phConfig: 'Enter report config JSON, e.g. {"days":7}',
      configTip: 'Note: custom type passes this JSON through as-is; login_stats supports config days.',
      status: 'Status',
      remark: 'Remark',
      phRemark: 'Enter remark'
    },
    type: {
      login_stats: 'Login Stats',
      user_stats: 'User Stats',
      msg_stats: 'Message Stats',
      custom: 'Custom'
    },
    validate: {
      reportCodeRequired: 'Report code is required',
      reportNameRequired: 'Report name is required',
      reportTypeRequired: 'Report type is required',
      configRequired: 'Report config is required'
    },
    tip: {
      confirmDelete: 'Are you sure to delete report #{ids}?',
      confirmChange: 'Are you sure to set report "{name}" {text}?'
    },
    preview: {
      title: 'Report Preview',
      generatedAt: 'Generated At',
      data: 'Snapshot Data',
      summary: 'Summary'
    },
    sub: {
      title: 'Report Subscription',
      target: 'Subscriptions of report "{name}"',
      search: {
        subName: 'Subscription Name',
        phSubName: 'Enter subscription name',
        phStatus: 'Status'
      },
      column: {
        subName: 'Subscription Name',
        reportId: 'Report ID',
        cron: 'Schedule (cron)',
        channels: 'Channels',
        receivers: 'Receivers',
        status: 'Status',
        lastRunTime: 'Last Run'
      },
      channel: {
        email: 'Email',
        site: 'Site Message'
      },
      btn: {
        run: 'Push Now'
      },
      form: {
        subName: 'Subscription Name',
        phSubName: 'Enter subscription name',
        report: 'Report',
        cron: 'Schedule (cron)',
        phCron: 'e.g. 0 0 9 * * * (6 fields, with seconds)',
        cronTip: 'Six-field cron (sec min hour day month weekday), e.g. daily push at 09:00: 0 0 9 * * *.',
        channels: 'Channels',
        receiveEmail: 'Receiver Emails',
        phReceiveEmail: 'Separate multiple emails with comma',
        receiveUserIds: 'Target User IDs',
        phReceiveUserIds: 'Separate multiple user IDs with comma',
        status: 'Status',
        lastRunTime: 'Last Run'
      },
      validate: {
        subNameRequired: 'Subscription name is required',
        reportRequired: 'Please select a report',
        cronRequired: 'Cron expression is required',
        channelRequired: 'Please select at least one channel'
      },
      tip: {
        confirmDelete: 'Delete subscription "{name}"?',
        confirmDeleteBatch: 'Are you sure to delete subscription #{ids}?',
        confirmRun: 'Push subscription "{name}" now?',
        runSuccess: 'Push triggered'
      }
    }
  },
  profile: {
    title: 'Profile',
    basicInfo: 'Basic Info',
    modifyPwd: 'Change Password',
    mfaSetting: 'Security Settings (MFA)',
    label: {
      userName: 'Username',
      phone: 'Phone',
      country: 'Country/Region',
      email: 'Email',
      dept: 'Department',
      role: 'Role',
      createTime: 'Created Date'
    },
    sex: {
      male: 'Male',
      female: 'Female'
    },
    tip: {
      modifyPwdSuccess: 'Password changed, please login again'
    },
    totp: {
      enabled: 'Enabled',
      disabled: 'Not Enabled',
      enabledTip: 'TOTP multi-factor authentication is enabled for your account',
      enabledDesc: 'A 6-digit code from Google Authenticator or similar is required at login.',
      step1: 'Generate Secret',
      step2: 'Scan QR Code',
      step3: 'Verify & Enable',
      setupIntro: 'Click the button below to generate a TOTP secret and QR code',
      scanQrTip: 'Scan with Google Authenticator / Microsoft Authenticator:',
      manualInputTip: 'Cannot scan? Enter the secret manually:',
      manualStep1: 'Open the authenticator app and choose "Manual entry"',
      manualStep2: 'Account name is arbitrary, paste the secret above',
      manualStep3: 'Choose "Time-based" (TOTP)',
      manualStep4: '6 digits, 30-second interval',
      codePlaceholder: 'Enter the 6-digit code from the authenticator',
      codeRequired: 'Please enter the code',
      codeRule: 'The code must be 6 digits',
      passwordRequired: 'Please enter the password',
      keyGenSuccess: 'Secret generated successfully',
      keyGenFail: 'Failed to generate secret',
      enableSuccess: 'TOTP enabled successfully',
      disableSuccess: 'TOTP disabled',
      keyCopied: 'Secret copied'
    },
    avatar: {
      uploadTip: 'Click to upload avatar',
      currentAvatar: 'Current avatar, click to change',
      previewAlt: 'Avatar preview',
      formatError: 'Invalid file format, please upload image files like JPG, PNG.',
      modifyTitle: 'Modify Avatar',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      rotateLeft: 'Rotate Left',
      rotateRight: 'Rotate Right'
    },
    msgPref: 'Message Preferences / Do Not Disturb',
    pref: {
      title: 'Message Preferences / Do Not Disturb',
      tip: 'Choose which notifications to receive and your quiet hours. Changes take effect immediately.',
      notifyLabel: 'Notification Types',
      email: 'Receive announcement emails',
      sysmsg: 'Receive in-app messages',
      announce: 'Receive notice announcements',
      dndTitle: 'Quiet Hours',
      dnd: 'Enable Do Not Disturb',
      dndStart: 'Start Time',
      dndEnd: 'End Time',
      dndTip: 'New message pushes are blocked during quiet hours. Can span midnight (e.g. 22:00 → 06:00).',
      timeRequired: 'Please set start and end time when quiet hours are enabled',
      save: 'Save',
      saveSuccess: 'Saved successfully',
      saveError: 'Save failed'
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
  commandPalette: {
    placeholder: 'Enter command or menu name, press Enter to execute',
    noMatch: 'No matching commands',
    category: {
      navigation: 'Navigation',
      action: 'Action',
      menuJump: 'Menu Jump',
      systemAction: 'System Action'
    },
    cmd: {
      toggleDark: 'Toggle Dark Mode',
      toggleFullscreen: 'Toggle Fullscreen',
      toggleSidebar: 'Collapse/Expand Sidebar',
      refreshPage: 'Refresh Current Page',
      lockScreen: 'Lock Screen',
      profile: 'Open Profile',
      logout: 'Log Out'
    },
    close: 'Close',
    confirmLogout: 'Are you sure you want to log out?',
    executeFail: 'Command execution failed',
    ariaLabel: 'Command Palette'
  },
  crontab: {
    expression: 'Time Expression',
    cron: 'Cron Expression',
    btn: {
      confirm: 'Confirm',
      reset: 'Reset',
      cancel: 'Cancel'
    },
    tabs: {
      second: 'Second',
      min: 'Minute',
      hour: 'Hour',
      day: 'Day',
      month: 'Month',
      week: 'Week',
      year: 'Year'
    },
    multiSelectPlaceholder: 'Multiple select',
    radio: {
      wildcardSecond: 'Second, allowed wildcards [, - * /]',
      wildcardMin: 'Minute, allowed wildcards [, - * /]',
      wildcardHour: 'Hour, allowed wildcards [, - * /]',
      wildcardDay: 'Day, allowed wildcards [, - * ? / L W]',
      wildcardMonth: 'Month, allowed wildcards [, - * /]',
      wildcardWeek: 'Week, allowed wildcards [, - * ? / L #]',
      wildcardYear: 'Empty, allowed wildcards [, - * /]',
      unspecified: 'Not specified',
      everyYear: 'Every year',
      cycleFrom: 'Cycle from',
      rangeFrom: 'From',
      specify: 'Specify',
      cycleUnitSecond: 'second',
      cycleUnitMin: 'minute',
      cycleUnitHour: 'hour',
      cycleUnitDay: 'day',
      cycleUnitMonth: 'month',
      avgStartSecond: 'second(s) start, every',
      avgStartMin: 'minute(s) start, every',
      avgStartHour: 'hour(s) start, every',
      avgStartDay: 'th start, every',
      avgStartMonth: 'month(s) start, every',
      avgStartYear: 'year(s) start, every',
      avgExecuteSecond: 'second(s) execute once',
      avgExecuteMin: 'minute(s) execute once',
      avgExecuteHour: 'hour(s) execute once',
      avgExecuteDay: 'day(s) execute once',
      avgExecuteMonth: 'month(s) execute once',
      avgExecuteYear: 'year(s) execute once',
      monthlyPrefix: 'Every month',
      nearestWorkday: 'th nearest working day',
      lastDayOfMonth: 'Last day of this month',
      nthWeekPrefix: 'The ',
      nthWeekSuffix: 'th week of',
      lastWeekOfMonth: 'Last of this month'
    },
    weeks: {
      sunday: 'Sunday',
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday'
    },
    months: {
      jan: 'January',
      feb: 'February',
      mar: 'March',
      apr: 'April',
      may: 'May',
      jun: 'June',
      jul: 'July',
      aug: 'August',
      sep: 'September',
      oct: 'October',
      nov: 'November',
      dec: 'December'
    },
    result: {
      recent: 'Recent 5 run times',
      calculating: 'Calculating...',
      noResult: 'No results meet the conditions!',
      partialResult: 'Only {count} results within the recent 100 years!'
    }
  },
  editor: {
    placeholder: 'Please enter content',
    imageFormatError: 'Invalid image format!',
    fileSizeExceeded: 'Upload file size cannot exceed {size} MB!',
    imageInsertFailed: 'Image insert failed',
    uploadFail: '{n} image(s) failed to upload',
    uploadSuccess: '{n} image(s) uploaded successfully',
    linkPlaceholder: 'Please enter the link URL:',
    save: 'Save',
    videoPlaceholder: 'Please enter the video URL:',
    textNormal: 'Normal',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    heading4: 'Heading 4',
    heading5: 'Heading 5',
    heading6: 'Heading 6',
    fontStandard: 'Standard',
    fontSerif: 'Serif',
    fontMonospace: 'Monospace'
  },
  excelImport: {
    dragText: 'Drag file here, or',
    clickUpload: 'click to upload',
    tip: 'Only xls, xlsx format files are allowed.',
    downloadTemplate: 'Download Template',
    confirm: 'OK',
    cancel: 'Cancel',
    title: 'Data Import',
    updateSupportLabel: 'Whether to update existing data',
    importResult: 'Import Result',
    fileTypeError: 'Please select a file with "xls" or "xlsx" extension.',
    successCount: '{success} imported, {error} failed validation',
    allSuccess: 'All data imported successfully',
    errorTitle: 'Validation errors',
    noError: 'All data passed validation',
    column: {
      rowNum: 'Row',
      error: 'Error'
    }
  },
  exportDialog: {
    title: 'Select Export Fields',
    range: 'Export Range',
    allFields: 'All Fields',
    selectedFields: 'Selected Fields',
    selectField: 'Select Field',
    selectAll: 'Select All',
    clear: 'Clear',
    selectedCount: '{selected} / {total} fields selected',
    cancel: 'Cancel',
    confirmExport: 'Confirm Export',
    pleaseSelectField: 'Please select at least one field'
  },
  fileUpload: {
    selectFile: 'Select File',
    uploadTip: 'Please upload',
    maxSize: 'no larger than',
    format: 'format',
    fileSuffix: 'file',
    delete: 'Delete',
    fileFormatError: 'Invalid file format, please upload {types} format file!',
    fileNameError: 'Invalid file name, cannot contain English comma!',
    fileSizeExceeded: 'Upload file size cannot exceed {size} MB!',
    uploadingFile: 'Uploading file, please wait...',
    fileCountExceed: 'Upload file count cannot exceed {limit}!',
    uploadFailed: 'Upload file failed'
  },
  headerSearch: {
    placeholder: 'Menu search, supports title and URL fuzzy query',
    resultCount: 'Found {count} results',
    noResult: 'No menu found for "{keyword}"',
    noResultTip: 'Try other keywords or paths',
    switchShortcut: 'Switch',
    selectShortcut: 'Select',
    closeShortcut: 'Close',
    menuAriaLabel: 'Menu: {title}'
  },
  rightToolbar: {
    hideSearch: 'Hide Search',
    showSearch: 'Show Search',
    refresh: 'Refresh',
    columns: 'Columns',
    columnDisplay: 'Column Display',
    showHideTitle: 'Show/Hide',
    show: 'Show',
    hide: 'Hide'
  },
  tour: {
    prev: 'Previous',
    next: 'Next',
    finish: 'Finish',
    skip: 'Skip Guide',
    ariaLabel: 'Tour Guide'
  },
  themeEditor: {
    themeColor: 'Theme Color',
    custom: 'Custom',
    customTip: 'Click to select any color',
    sideTheme: 'Sidebar Theme',
    sideAuto: 'Follow Theme',
    sideDark: 'Dark',
    sideLight: 'Light',
    darkMode: 'Dark Mode',
    darkModeTip: 'Or press Ctrl+Shift+D to toggle',
    followSystem: 'Follow System',
    followSystemTip: 'Automatically follow OS dark mode',
    reset: 'Reset to Default',
    followSystemEnabled: 'Follow system dark mode enabled',
    resetSuccess: 'Theme reset to default'
  },
  userPrefs: {
    title: 'User Preferences',
    listDisplay: 'List Display',
    defaultPageSize: 'Default Page Size',
    pageSizeUnit: 'items',
    defaultSort: 'Default Sort',
    sortAsc: 'Ascending',
    sortDesc: 'Descending',
    tableDensity: 'Table Density',
    densityComfortable: 'Comfortable',
    densityDefault: 'Default',
    densityCompact: 'Compact',
    autoRefreshInterval: 'Auto Refresh Interval',
    autoRefreshTip: 'seconds (0 means disabled)',
    appearance: 'Appearance',
    followSystemDark: 'Follow System Dark Mode',
    followSystemDarkTip: 'Automatically follow system theme when enabled',
    security: 'Security',
    watermark: 'Page Watermark',
    watermarkTip: 'Overlay username watermark on all pages to prevent screenshot leaks',
    sessionTimeout: 'Session Timeout',
    sessionTimeoutTip: 'minutes (0 means disabled, auto logout when idle)',
    timezone: 'Timezone',
    timezoneSection: 'Timezone',
    tzShanghai: 'Beijing/Shanghai',
    tzTokyo: 'Tokyo',
    tzSingapore: 'Singapore',
    tzNewYork: 'New York',
    tzLosAngeles: 'Los Angeles',
    tzLondon: 'London',
    tzParis: 'Paris',
    tzSydney: 'Sydney',
    tzUTC: 'Coordinated Universal Time',
    cancel: 'Cancel',
    save: 'Save',
    saveSuccess: 'Preferences saved'
  },
  cookieConsent: {
    ariaLabel: 'Cookie Consent Notice',
    title: 'Cookie Privacy Preferences',
    text: 'This website uses cookies to improve your experience. By continuing to use this website, you agree to our cookie policy.',
    learnMore: 'Learn More',
    accept: 'Accept All',
    reject: 'Necessary Only'
  },
  batchActions: {
    selected: 'Selected',
    items: 'items',
    clear: 'Clear'
  },
  gen: {
    title: 'Code Generator',
    btn: {
      generate: 'Generate',
      import: 'Import',
      preview: 'Preview',
      edit: 'Edit',
      delete: 'Delete',
      refresh: 'Refresh',
      download: 'Download',
      sync: 'Sync',
      generateCode: 'Generate Code'
    },
    column: {
      tableName: 'Table Name',
      tableComment: 'Table Comment',
      className: 'Entity',
      createTime: 'Created Time',
      updateTime: 'Updated Time'
    },
    search: {
      tableName: 'Table Name',
      phTableName: 'Enter table name',
      tableComment: 'Table Comment',
      phTableComment: 'Enter table comment'
    },
    editTable: {
      tabBasic: 'Basic Info',
      tabField: 'Field Info',
      tabGenInfo: 'Generate Info',
      column: {
        sort: 'Sort',
        columnName: 'Column Name',
        columnComment: 'Column Comment',
        columnType: 'Physical Type',
        javaType: 'Java Type',
        javaField: 'Java Field',
        isInsert: 'Insert',
        isEdit: 'Edit',
        isList: 'List',
        isQuery: 'Query',
        queryType: 'Query Type',
        isRequired: 'Required',
        htmlType: 'Display Type',
        dictType: 'Dict Type'
      },
      htmlType: {
        input: 'Text Input',
        textarea: 'Textarea',
        select: 'Dropdown',
        radio: 'Radio',
        checkbox: 'Checkbox',
        datetime: 'Date Picker',
        imageUpload: 'Image Upload',
        fileUpload: 'File Upload',
        editor: 'Rich Text Editor'
      }
    },
    basicInfo: {
      tableName: 'Table Name',
      phTableName: 'Enter repository name',
      tableComment: 'Table Comment',
      className: 'Entity Class Name',
      functionAuthor: 'Author',
      validate: {
        tableNameRequired: 'Please enter table name',
        tableCommentRequired: 'Please enter table comment',
        classNameRequired: 'Please enter entity class name',
        functionAuthorRequired: 'Please enter author'
      }
    },
    createTable: {
      title: 'Create Table',
      tableName: 'Table Name',
      phTableName: 'e.g. sys_example',
      tableComment: 'Table Comment',
      phTableComment: 'Business description of the table',
      importToGen: 'Import to Code Generator',
      importToGenAuto: 'Auto-import after creation',
      importToGenOnly: 'Create only',
      fieldDef: 'Field Definition',
      addField: 'Add Field',
      column: {
        sort: 'Sort',
        columnName: 'Column Name',
        phColumnName: 'e.g. user_id',
        dataType: 'Type',
        phDataType: 'Select type',
        length: 'Length',
        precision: 'Precision',
        isPrimaryKey: 'Primary',
        isAutoIncrement: 'Auto Incr',
        isNotNull: 'Not Null',
        isUnique: 'Unique',
        defaultValue: 'Default',
        phDefaultValue: 'Optional',
        columnComment: 'Comment',
        phColumnComment: 'Field description'
      },
      typeGroup: {
        string: 'String',
        integer: 'Integer',
        decimal: 'Decimal',
        datetime: 'Date/Time',
        other: 'Other'
      },
      tip: 'Create tables via structured form. The backend uses sea-query to build DDL declaratively, auto-adapts to PostgreSQL/MySQL/SQLite dialects, and completely eliminates SQL injection risks.',
      validate: {
        tableNameRequired: 'Please enter table name',
        tableNamePattern:
          'Table name must start with a letter, only contain letters, numbers, underscores, length 1-64',
        formError: 'Please fix form errors before submitting',
        columnRequired: 'At least one field must be defined',
        columnNameRequired: 'Column name cannot be empty',
        columnNameInvalid:
          'Column name "{name}" is invalid (must start with letter/underscore, only contain letters, numbers, underscore, length 1-64)',
        columnNameDuplicate: 'Column name "{name}" is duplicated',
        lengthRequired: 'Column "{name}" requires a length',
        precisionRequired: 'Column "{name}" (DECIMAL) requires precision',
        precisionRange: 'Precision of column "{name}" must be less than length',
        autoIncrementType: 'Column "{name}" is set to auto-increment but type is not INT/BIGINT',
        autoIncrementPk: 'Column "{name}" is set to auto-increment but primary key is not set',
        defaultValueNumeric: 'Default value "{value}" of column "{name}" is not a valid number',
        defaultValueBoolean: 'Default value of column "{name}" (BOOLEAN) must be true/false/0/1',
        noPrimaryKey: 'The table has no primary key, which may affect code generation. Continue?'
      },
      msg: {
        createSuccess: 'Table {name} created successfully{imported}',
        createSuccessImported: ', imported to code generator',
        createFail: 'Failed to create table'
      },
      defaultColumn: {
        id: 'Primary Key ID',
        createBy: 'Created By',
        createTime: 'Created Time',
        updateBy: 'Updated By',
        updateTime: 'Updated Time',
        remark: 'Remark'
      }
    },
    genInfo: {
      tplCategory: 'Template Category',
      tplCrud: 'Single Table (CRUD)',
      tplTree: 'Tree Table (CRUD)',
      tplSub: 'Master-Detail (CRUD)',
      tplWebType: 'Frontend Type',
      tplWebVue2: 'Vue2 Element UI Template',
      tplWebVue3: 'Vue3 Element Plus Template',
      tplWebVue3Ts: 'Vue3 Element Plus TypeScript Template',
      packageName: 'Package Path',
      packageNameTip: 'Which Java package to generate under, e.g. com.yebot.system',
      moduleName: 'Module Name',
      moduleNameTip: 'Can be seen as subsystem name, e.g. system',
      businessName: 'Business Name',
      businessNameTip: 'English function name, e.g. user',
      functionName: 'Function Name',
      functionNameTip: 'Used as class description, e.g. User',
      formColNum: 'Form Layout',
      formColNumTip: 'Choose the grid layout of the form',
      formColNumOne: '1 Column',
      formColNumTwo: '2 Columns',
      formColNumThree: '3 Columns',
      genView: 'Extended Features',
      genViewDetail: 'Generate Detail Page',
      genType: 'Generate Code Method',
      genTypeTip: 'Defaults to zip download, custom path is also supported',
      genTypeZip: 'Zip archive',
      genTypeCustom: 'Custom path',
      parentMenu: 'Parent Menu',
      parentMenuTip: 'Assign to specified menu, e.g. System',
      phParentMenu: 'Select system menu',
      genPath: 'Custom Path',
      genPathTip: 'Absolute disk path; if empty, generate under current web project',
      genPathRecent: 'Recent path quick select',
      genPathReset: 'Restore default base path',
      otherInfo: 'Other Info',
      treeCode: 'Tree Code Field',
      treeCodeTip: 'Code field name for tree display, e.g. dept_id',
      treeParentCode: 'Tree Parent Code Field',
      treeParentCodeTip: 'Parent code field name for tree display, e.g. parent_Id',
      treeName: 'Tree Name Field',
      treeNameTip: 'Display name field for tree nodes, e.g. dept_name',
      subInfo: 'Association Info',
      subTableName: 'Sub Table Name',
      subTableNameTip: 'Associated sub table name, e.g. sys_user',
      subTableFkName: 'Sub Table Foreign Key',
      subTableFkNameTip: 'Sub table foreign key name, e.g. user_id',
      validate: {
        tplCategoryRequired: 'Please select template',
        packageNameRequired: 'Please enter package path',
        moduleNameRequired: 'Please enter module name',
        businessNameRequired: 'Please enter business name',
        functionNameRequired: 'Please enter function name'
      }
    },
    importTable: {
      title: 'Import Table',
      tableName: 'Table Name',
      phTableName: 'Enter table name',
      tableComment: 'Table Comment',
      phTableComment: 'Enter table comment',
      tipSelectTable: 'Please select tables to import'
    },
    msg: {
      selectToGen: 'Please select data to generate',
      genCustomSuccess: 'Successfully generated to custom path: {path}',
      syncConfirm: 'Are you sure to force sync the structure of "{name}"?',
      syncSuccess: 'Synced successfully',
      editTitle: 'Edit [{name}] Generate Config',
      previewTitle: 'Code Preview'
    }
  },
  build: {
    layoutComponents: 'Layout Components',
    exportVue: 'Export Vue File',
    copyCode: 'Copy Code',
    emptyTip: 'Drag or click components from the left to design the form',
    confirmClear: 'Are you sure to clear all components?',
    copyCodeSuccess: 'Code has been copied to the clipboard, ready to paste.',
    copyCodeFail: 'Code copy failed',
    uploadTip: 'Only {type} files up to {size}{unit} can be uploaded',
    rightPanel: {
      tabField: 'Field Properties',
      tabForm: 'Form Properties',
      docLink: 'View component docs',
      label: {
        componentType: 'Component Type',
        fieldName: 'Field Name',
        componentName: 'Component Name',
        title: 'Title',
        placeholder: 'Placeholder',
        startPlaceholder: 'Start Placeholder',
        endPlaceholder: 'End Placeholder',
        span: 'Form Grid',
        gutter: 'Gutter',
        justify: 'Justify',
        align: 'Align',
        labelWidth: 'Label Width',
        componentWidth: 'Component Width',
        defaultValue: 'Default Value',
        minChecked: 'Min Checked',
        maxChecked: 'Max Checked',
        prepend: 'Prepend',
        append: 'Append',
        prefixIcon: 'Prefix Icon',
        suffixIcon: 'Suffix Icon',
        separator: 'Separator',
        minRows: 'Min Rows',
        maxRows: 'Max Rows',
        minValue: 'Min Value',
        maxValue: 'Max Value',
        step: 'Step',
        precision: 'Precision',
        controlsPosition: 'Controls Position',
        maxLength: 'Max Length',
        activeText: 'Active Text',
        inactiveText: 'Inactive Text',
        activeValue: 'Active Value',
        inactiveValue: 'Inactive Value',
        dateType: 'Date Type',
        fileName: 'File Field Name',
        fileType: 'File Type',
        fileSize: 'File Size',
        action: 'Upload URL',
        listType: 'List Type',
        buttonText: 'Button Text',
        rangeSeparator: 'Range Separator',
        pickerOptions: 'Picker Options',
        format: 'Format',
        dataType: 'Data Type',
        labelKey: 'Label Key',
        valueKey: 'Value Key',
        childrenKey: 'Children Key',
        optionType: 'Option Type',
        activeColor: 'Active Color',
        inactiveColor: 'Inactive Color',
        allowHalf: 'Allow Half',
        showText: 'Show Text',
        showScore: 'Show Score',
        showStops: 'Show Stops',
        range: 'Range',
        border: 'Border',
        colorFormat: 'Color Format',
        size: 'Size',
        showWordLimit: 'Show Word Limit',
        stepStrictly: 'Step Strictly',
        multipleCascade: 'Multiple',
        showAllLevels: 'Show All Levels',
        filterable: 'Filterable',
        clearable: 'Clearable',
        showTip: 'Show Tip',
        multiple: 'Multiple Files',
        autoUpload: 'Auto Upload',
        readonly: 'Readonly',
        disabled: 'Disabled',
        filterableSelect: 'Filterable',
        multipleSelect: 'Multiple',
        required: 'Required',
        expression: 'Expression',
        errorTip: 'Error Tip',
        formRef: 'Form Ref',
        formModel: 'Form Model',
        formRules: 'Form Rules',
        formSize: 'Form Size',
        labelPosition: 'Label Position',
        formLabelWidth: 'Label Width',
        formGutter: 'Gutter',
        formDisabled: 'Disable Form',
        formBtns: 'Form Buttons',
        formUnFocusedBorder: 'Show Unfocused Component Border'
      },
      ph: {
        componentType: 'Select component type',
        fieldName: 'Enter field name (v-model)',
        title: 'Enter title',
        placeholder: 'Enter placeholder',
        gutter: 'Gutter',
        justify: 'Select justify',
        labelWidth: 'Enter label width',
        componentWidth: 'Enter component width',
        defaultValue: 'Enter default value',
        minChecked: 'Min checked',
        maxChecked: 'Max checked',
        prepend: 'Enter prepend',
        append: 'Enter append',
        prefixIcon: 'Enter prefix icon name',
        suffixIcon: 'Enter suffix icon name',
        separator: 'Enter separator',
        minRows: 'Min rows',
        maxRows: 'Max rows',
        minValue: 'Min value',
        maxValue: 'Max value',
        step: 'Step',
        precision: 'Precision',
        maxLength: 'Enter character length',
        activeText: 'Enter active text',
        inactiveText: 'Enter inactive text',
        activeValue: 'Enter active value',
        inactiveValue: 'Enter inactive value',
        dateType: 'Select date type',
        fileName: 'Enter upload file field name',
        fileType: 'Select file type',
        fileSize: 'Enter file size',
        action: 'Enter upload URL',
        buttonText: 'Enter button text',
        rangeSeparator: 'Enter separator',
        pickerOptions: 'Enter time range',
        format: 'Enter time format',
        labelKey: 'Enter label key',
        valueKey: 'Enter value key',
        childrenKey: 'Enter children key',
        colorFormat: 'Select color format',
        formRef: 'Enter form name (ref)',
        formModel: 'Enter data model',
        formRules: 'Enter validation model',
        formLabelWidth: 'Label width',
        formGutter: 'Gutter',
        pattern: 'Enter regex',
        errorTip: 'Enter error tip',
        optionName: 'Option name',
        optionValue: 'Option value'
      },
      options: 'Options',
      layoutTree: 'Layout Tree',
      regexValidate: 'Regex Validation',
      chars: 'chars',
      btn: {
        select: 'Select',
        addOption: 'Add Option',
        addParent: 'Add Parent',
        addRule: 'Add Rule'
      },
      radio: {
        alignTop: 'top',
        alignMiddle: 'middle',
        alignBottom: 'bottom',
        controlsDefault: 'Default',
        controlsRight: 'Right',
        dataTypeDynamic: 'Dynamic',
        dataTypeStatic: 'Static',
        optionDefault: 'Default',
        optionButton: 'Button',
        sizeLarge: 'Large',
        sizeDefault: 'Default',
        sizeSmall: 'Small',
        labelLeft: 'Left',
        labelRight: 'Right',
        labelTop: 'Top'
      },
      fileType: {
        image: 'Image',
        video: 'Video',
        audio: 'Audio'
      },
      tagGroup: {
        input: 'Input Components',
        select: 'Select Components'
      },
      weekFormat: 'YYYY Week ww',
      dateType: {
        date: 'Date (date)',
        week: 'Week (week)',
        month: 'Month (month)',
        year: 'Year (year)',
        datetime: 'Datetime (datetime)',
        daterange: 'Date Range (daterange)',
        monthrange: 'Month Range (monthrange)',
        datetimerange: 'Datetime Range (datetimerange)'
      }
    },
    codeTypeDialog: {
      title: 'Select Generate Type',
      type: 'Generate Type',
      fileName: 'File Name',
      phFileName: 'Enter file name',
      typeFile: 'Page',
      typeDialog: 'Dialog',
      validate: {
        fileNameRequired: 'Please enter file name',
        typeRequired: 'Generate type cannot be empty'
      }
    },
    iconsDialog: {
      title: 'Select Icon',
      phIconName: 'Enter icon name'
    },
    treeNodeDialog: {
      title: 'Add Option',
      label: 'Option Name',
      value: 'Option Value',
      phOptionName: 'Enter option name',
      phOptionValue: 'Enter option value',
      validate: {
        labelRequired: 'Please enter option name',
        valueRequired: 'Please enter option value'
      },
      dataType: {
        string: 'String',
        number: 'Number'
      }
    }
  },
  route: {
    login: 'Login',
    register: 'Register',
    privacy: 'Privacy Policy',
    networkError: 'Network Error',
    lockScreen: 'Lock Screen',
    home: 'Home',
    profile: 'Profile',
    assignRole: 'Assign Role',
    assignUser: 'Assign Users',
    dictData: 'Dict Data',
    jobLog: 'Job Log',
    editGenConfig: 'Edit Gen Config'
  },
  session: {
    timeoutWarning:
      'You have been inactive. The system will automatically log out in {seconds} seconds. Continue operating?',
    timeoutWarningTitle: 'Session Timeout Warning',
    continueOperation: 'Continue',
    logoutNow: 'Log Out Now'
  },
  notification: {
    newNotice: 'New Notice',
    operLogTitle: 'Operation Log',
    systemTitle: 'System Message',
    systemMessageTitle: 'System Message',
    wsConnected: 'WebSocket connected',
    forceLogoutMessage: 'Your account has been forcibly logged out by the administrator.',
    forceLogoutMsg: 'Your account has been forcibly logged out by the administrator'
  },
  passwordRule: {
    illegalChars: 'Password cannot contain illegal characters (angle brackets, quotes, backslash, vertical bar, etc.)',
    digitsOnly: 'Password can only contain digits (0-9)',
    lettersOnly: 'Password can only contain English letters (a-z, A-Z)',
    lettersAndDigits: 'Password must contain both letters and digits',
    lettersDigitsSpecial: 'Password must contain letters, digits, and special characters (~!＠#$%^&*()-=_+)',
    required: 'Password cannot be empty',
    lengthRange: 'Password length must be between 6 and 20',
    newRequired: 'New password cannot be empty',
    newLengthRange: 'New password length must be between 6 and 20',
    pleaseEnter: 'Please enter your password',
    userLengthRange: 'User password length must be between 6 and 20'
  },
  time: {
    justNow: 'just now',
    minutesAgo: '{n} minutes ago',
    hoursAgo: '{n} hours ago',
    dayAgo: '1 day ago',
    dateTimeFormat: '{month}/{day} {hour}:{minute}',
    fullDateFormat: '{date} {weekday} {time}',
    weekdays: {
      sun: 'Sun',
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat'
    }
  },
  pdf: {
    defaultFilename: 'Exported File',
    printPreview: 'Print Preview'
  },
  treePanel: {
    collapseAll: 'Collapse All',
    expandAll: 'Expand All',
    refresh: 'Refresh',
    expand: 'Expand',
    collapse: 'Collapse',
    title: 'Tree Structure',
    searchPlaceholder: 'Enter name'
  },
  imageUpload: {
    preview: 'Preview',
    imagePreview: 'Image Preview',
    fileFormatError: 'Invalid file format, please upload {types} image format file!',
    fileNameError: 'Invalid file name, cannot contain English comma!',
    fileSizeExceeded: 'Avatar image size cannot exceed {size} MB!',
    uploadingImage: 'Uploading image, please wait...',
    fileCountExceed: 'Upload file count cannot exceed {limit}!',
    uploadFailed: 'Upload image failed'
  },
  langSelect: {
    simplifiedChinese: 'Simplified Chinese',
    english: 'English',
    switchingLanguage: 'Switching language, please wait...',
    switchSuccess: 'Language switched successfully'
  },
  sizeSelect: {
    large: 'Large',
    default: 'Default',
    small: 'Small',
    settingLayoutSize: 'Setting layout size, please wait...'
  },
  taskProgress: {
    title: 'Background Tasks',
    clearCompleted: 'Clear Completed',
    statusWaiting: 'Waiting',
    statusRunning: 'Running',
    statusCompleted: 'Completed',
    statusFailed: 'Failed'
  },
  editableCell: {
    empty: '(empty)',
    validateFailed: 'Validation failed'
  },
  announcementBanner: {
    viewDetails: 'View Details'
  },
  breadcrumb: {
    home: 'Home'
  },
  yebot: {
    gitAriaLabel: 'Source code, open in new window',
    docAriaLabel: 'Documentation, open in new window'
  },
  hamburger: {
    collapseSidebar: 'Collapse Sidebar',
    expandSidebar: 'Expand Sidebar'
  },
  iconSelect: {
    placeholder: 'Enter icon name',
    selectIcon: 'Select icon {name}'
  },
  legal: {
    privacy: {
      title: 'Privacy Policy',
      lastUpdated: 'Last updated: {date}',
      intro1:
        'This Privacy Policy (hereinafter "this Policy") describes how Yebot (hereinafter "we") collects, uses, stores, and protects your personal information when you use our website and services, as well as the rights you enjoy. This Policy is formulated in accordance with the Personal Information Protection Law of the People\'s Republic of China (hereinafter "PIPL"), the Cybersecurity Law of the People\'s Republic of China, the Data Security Law of the People\'s Republic of China, and other relevant laws and regulations.',
      intro2:
        'Please read and fully understand all the contents of this Policy before using this website. Continued use of this website indicates that you have agreed to the terms set forth in this Policy.',
      section1Title: '1. Information Collection',
      section1Intro: 'To provide our services, we may collect the following types of information:',
      section1AccountInfo:
        'Account Information: Username, password (stored encrypted), and other identifying information you provide during registration.',
      section1AuthInfo:
        'Authentication Information: Credentials, verification codes, and other information used for identity verification during login.',
      section1UsageData:
        'Usage Data: Login time, IP address, browser type, operating system, access logs, operation logs, and other information for security auditing.',
      section1Profile:
        'Personal Profile: Nickname, avatar, contact information, and other personal profile information you actively provide.',
      section1Cookie:
        'Cookie Information: Preference settings, session state, and other information collected through Cookie technology.',
      section1Conclusion:
        'We only collect the minimum information necessary to provide our services and will not collect personal information unrelated to the services.',
      section2Title: '2. Information Use',
      section2Intro: 'The information we collect will be used for the following purposes:',
      section2Item1:
        'To provide you with account registration, login, identity verification, and basic business services;',
      section2Item2:
        'To maintain the safe and stable operation of the system and prevent fraud, attacks, and other security risks;',
      section2Item3: 'To record operation logs and login logs for security auditing and troubleshooting;',
      section2Item4: 'To cooperate with regulatory compliance inspections as required by laws and regulations;',
      section2Item5: 'To improve product features and user experience (using de-identified data).',
      section2Conclusion:
        'We will not use your personal information for purposes other than those described above. If we need to change the purpose of use, we will obtain your consent again.',
      section3Title: '3. Cookie Usage',
      section3Intro:
        'This website uses Cookies and similar technologies to record your login status and preferences to enhance your experience. Cookies are small text files stored on your local device.',
      section3Categories: 'The Cookies we use are mainly divided into two categories:',
      section3Necessary:
        'Necessary Cookies: Used to implement core functions such as login authentication and session maintenance. Some features may not work properly if disabled.',
      section3Preference:
        'Preference Cookies: Used to remember your interface preferences (such as theme, language, layout size, etc.) to enhance your experience.',
      section3Conclusion:
        'You can manage or delete Cookies through your browser settings. Please note that disabling necessary Cookies may affect the normal use of this website. On your first visit, we will prompt you to consent to our Cookie policy.',
      section4Title: '4. Information Protection',
      section4Intro: 'We take the following measures to protect your personal information security:',
      section4Item1: 'Passwords are stored using irreversible encryption algorithms, not in plaintext;',
      section4Item2: 'Login credentials use JWT token mechanism with reasonable expiration times;',
      section4Item3: 'Permission control and audit logging for sensitive operations;',
      section4Item4: 'Data transmission security is protected through HTTPS and other encrypted transport protocols;',
      section4Item5: 'Regular security assessments to promptly fix potential vulnerabilities.',
      section4Conclusion:
        'Although we have taken reasonable security measures, the Internet environment is not absolutely secure. In the event of a personal information breach, we will promptly notify you and take remedial measures in accordance with the law.',
      section5Title: '5. User Rights',
      section5Intro:
        'In accordance with PIPL and other laws and regulations, you have the following rights regarding your personal information:',
      section5Item1:
        'Right to Know and Decide: You have the right to know the purpose, method, and scope of our processing of your personal information and make decisions.',
      section5Item2:
        'Right to Access and Copy: You have the right to access and copy your personal information, which we will provide within a reasonable period.',
      section5Item3:
        'Right to Correct and Supplement: When your personal information is inaccurate or incomplete, you have the right to request correction or supplementation.',
      section5Item4:
        'Right to Delete: Under statutory circumstances, you have the right to request deletion of your personal information.',
      section5Item5:
        'Right to Withdraw Consent: You have the right to withdraw your previous consent to this Policy at any time, without affecting the processing prior to withdrawal.',
      section5Item6:
        'Right to Complain and Report: You have the right to complain to or report to relevant authorities about our processing of your personal information.',
      section5Conclusion:
        'To exercise the above rights, please contact us through the contact information at the end of this Policy. We will process your request in accordance with the law after receipt.',
      section6Title: '6. Contact Us',
      section6Intro:
        'If you have any questions, suggestions, or complaints about this Policy, you can contact us through the following methods:',
      section6Email: 'Email: privacy＠yebot.dev',
      section6Channel: 'Submit your questions through the feedback channel provided on this website.',
      section6Conclusion: 'We will process and respond to your feedback as soon as possible after receipt.',
      footer1:
        'This Policy is formulated and interpreted by Yebot. We reserve the right of final interpretation of this Policy.',
      footer2:
        'If this Policy changes, we will update it on this page in a timely manner and indicate the last update date.'
    }
  },
  desensitize: {
    maskedData: 'Masked data'
  }
}
