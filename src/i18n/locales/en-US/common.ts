// en-US · 分类：common（通用基础）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

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
    // Multi-tenant Phase 3: platform tenant display name (tenant_id = 0)
    platformTenant: 'Platform',
    // Multi-tenant Phase 3: header of the "tenant ownership" column ([ui].show_tenant_column)
    tenantColumn: 'Tenant',
    // Placeholder of the "filter by tenant" input ([ui].tenant_filter)
    tenantFilterPlaceholder: 'Tenant ID',
    detail: 'Detail',
    download: 'Download',
    upload: 'Upload',
    batchDelete: 'Batch Delete',
    copy: 'Copy',
    copyLink: 'Copy Link',
    create: 'Create',
    viewAll: 'View All',
    all: 'All',
    inputText: 'Please enter',
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
    unsavedConfirm: 'The form has unsaved changes. Leave without saving?',
    leaveWithoutSaving: 'Leave without saving',
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
    exporting: 'Exporting, this may take a while for large datasets…',
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
  layout: {
    tabbar: {
      mine: 'Mine'
    },
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
  headerSearch: {
    placeholder: 'Menu search, supports title and URL fuzzy query',
    resultCount: 'Found {count} results',
    noResult: 'No menu found for "{keyword}"',
    noResultTip: 'Try other keywords or paths',
    switchShortcut: 'Switch',
    selectShortcut: 'Select',
    closeShortcut: 'Close',
    menuAriaLabel: 'Menu: {title}',
    placeholderWithData: 'Search menus, users, roles, dictionaries (2+ chars triggers data search)',
    group: {
      menu: 'Menu',
      user: 'User',
      role: 'Role',
      dict: 'Dict'
    }
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
  editableCell: {
    empty: '(empty)',
    validateFailed: 'Validation failed'
  },
  breadcrumb: {
    home: 'Home'
  },
  hamburger: {
    collapseSidebar: 'Collapse Sidebar',
    expandSidebar: 'Expand Sidebar'
  },
  iconSelect: {
    placeholder: 'Enter icon name',
    selectIcon: 'Select icon {name}'
  }
}
