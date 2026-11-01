// en-US · 分类：system（系统管理）
// split_i18n.py 为一次性迁移脚本（旧单文件 locales/zh-CN.ts|en-US.ts 已删除），本文件即事实源，新增/修改文案直接改这里

export default {
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
    tenant: 'Tenant Management',
    ai: 'AI Assistant',
    myDomain: 'Domain Management',
    myNav: 'My Navigation',
    dict: 'Dictionaries',
    opRecording: 'Operation Recording',
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
    reportBoard: 'Report Board',
    dashboard: 'Dashboard',
    tenantSpace: 'Tenant Services',
    website: 'Stepby Website',
    pat: 'API Tokens',
    componentNotFound: 'Component "{view}" does not exist, please check menu configuration'
  },
  pat: {
    title: 'API Access Tokens',
    tab: 'API Tokens',
    tip: 'Personal access tokens let scripts or third-party apps call the API as you. The plaintext token is shown only once at creation — store it safely; revoking takes effect immediately.',
    neverUsed: 'Never used',
    scopeAll: 'All permissions',
    btn: {
      create: 'New Token',
      revoke: 'Revoke',
      copy: 'Copy',
      done: 'I have saved it',
      rotateAk: 'Rotate SK',
      revokeAk: 'Revoke AK'
    },
    column: {
      name: 'Name',
      token: 'Token',
      scopes: 'Scopes',
      status: 'Status',
      expiresAt: 'Expiry',
      lastUsedAt: 'Last Used',
      createTime: 'Created',
      operation: 'Operation'
    },
    status: {
      active: 'Active',
      revoked: 'Revoked'
    },
    expiry: {
      never: 'Never expires',
      expired: 'Expired',
      soon: 'Expires in {days} days',
      active: '{days} days left'
    },
    create: {
      title: 'New Access Token'
    },
    form: {
      name: 'Token name',
      namePh: 'e.g. CI deploy',
      scopes: 'Scopes',
      scopesPh: 'Select permissions to grant',
      scopeLoadFailed: 'Failed to load the scope catalog; retry before creating',
      expireDays: 'Validity',
      expireDaysTip: 'Days; 0 means never expires',
      withAk: 'Enable AK/SK',
      withAkTip:
        'Also issue open API access keys (AK/SK) for signed open API calls; the SK plaintext is shown only once'
    },
    rule: {
      nameRequired: 'Please enter a token name',
      scopesRequired: 'Select at least one permission'
    },
    token: {
      title: 'Token created',
      warning: 'Copy and store it now. This token is shown only once and cannot be viewed again after closing.'
    },
    msg: {
      copied: 'Copied to clipboard',
      copyFailed: 'Copy failed, please copy manually',
      revokeConfirm: 'Revoke token "{name}"? Requests using it will stop working immediately.',
      revoked: 'Token revoked'
    },
    akSk: {
      accessKey: 'Access Key',
      secretKey: 'Secret Key',
      warning:
        'Open API AK/SK generated. Copy and store them now; the SK plaintext is shown only once and cannot be viewed again after closing.',
      rotateConfirm:
        'Rotate the open API SK of token "{name}"? The old SK stops working immediately and all requests signed with it will be rejected.',
      revokeConfirm:
        'Revoke the open API AK/SK of token "{name}"? AK/SK signed requests will stop working immediately.',
      revoked: 'AK/SK revoked',
      rotateFailed:
        'Rotation failed: the server returned no new AK/SK and the old secret is already invalid. Re-enable AK/SK before updating your configuration.'
    },
    admin: {
      tip: 'This page manages personal access tokens for all users. Admins may revoke any token, but a token itself cannot manage tokens (prevents self-escalation).',
      phUserId: 'Filter by user ID',
      column: {
        userName: 'Owner'
      }
    }
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
  dataRule: {
    title: 'Data Permission Rules',
    loadFailed: 'Failed to load rules; an empty table does not mean there are no rules',
    rolesLoadFailed: 'Failed to load role options; role bindings cannot be adjusted for now',
    name: 'Rule Name',
    table: 'Target Table',
    field: 'Target Column',
    op: 'Operator',
    valueType: 'Value Type',
    value: 'Rule Value',
    status: 'Status',
    role: 'Effective Roles',
    ph: { roles: 'Select effective roles', confirmRemove: 'Remove this rule? Bindings take effect immediately' }
  },
  aiHistory: {
    title: 'AI Query History',
    time: 'Time',
    tenant: 'Tenant',
    user: 'User',
    question: 'Question',
    sql: 'SQL',
    rows: 'Rows',
    duration: 'Duration(ms)',
    status: 'Status',
    ok: 'OK',
    failed: 'Failed',
    error: 'Error',
    exportBtn: 'Export',
    exportFailed: 'Export failed, please retry later',
    exportStarted: 'Download started — check your browser downloads',
    tenantInvalid: 'Tenant ID must be an integer greater than or equal to 0',
    ph: { tenantFilter: 'Tenant ID filter (platform)' }
  },
  aiConfig: {
    title: 'AI Assistant Config',
    loadFailed: 'Failed to load configuration; the form is locked so defaults cannot overwrite the server config',
    provider: {
      openai: 'OpenAI Compatible',
      custom: 'Custom'
    },
    btn: {
      test: 'Test Connection'
    },
    field: {
      enabled: 'Enable AI Assistant',
      provider: 'LLM Provider',
      baseUrl: 'Base URL',
      apiKey: 'API Key',
      model: 'Model',
      allowedTables: 'Allowed Tables Whitelist'
    },
    ph: {
      baseUrl: 'https://api.openai.com/v1 or http://localhost:11434/v1',
      apiKeyKeep: 'Leave empty to keep the saved key',
      apiKeyNew: 'Enter API Key',
      allowedTables: 'Select or type a table name, press Enter'
    },
    tip: {
      dualSource:
        'Hot-applied: sys.ai.* takes precedence over the config.toml [ai] factory defaults. Changes affect the AI panel immediately without restart.',
      apiKeyMasked: 'Current key: {masked}',
      testOk: 'Connection OK'
    }
  },
  uploadConfig: {
    title: 'OSS Storage Config',
    loadFailed: 'Failed to load configuration; the form is locked so empty defaults cannot overwrite the server config',
    btn: {
      test: 'Test Connection'
    },
    field: {
      accessKey: 'Access Key',
      secretKey: 'Secret Key',
      endpoint: 'Endpoint',
      region: 'Region',
      bucket: 'Bucket',
      pathStyle: 'Path-style Addressing',
      publicEndpoint: 'Public Endpoint'
    },
    ph: {
      keyKeep: 'Leave empty to keep the saved value',
      keyNew: 'Enter value',
      endpoint: 'https://s3.example.com or http://127.0.0.1:9000',
      publicEndpoint: 'Optional, CDN / public domain; falls back to endpoint'
    },
    tip: {
      dualSource:
        'Hot reload: sys.upload.s3.* overrides config.toml [upload.s3] (factory defaults). Applies to uploads immediately, no restart needed.',
      mode: 'Current storage mode: {mode} (runtime override only applies in s3 mode; switching mode requires config.toml + restart)',
      keyMasked: 'Current value: {masked}',
      pathStyle: 'On = /{bucket}/{key} (MinIO/Aliyun OSS/Tencent COS); Off = {bucket}.{host} (recommended for AWS S3)',
      testOk: 'Connection OK'
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
      deptSecondaryTip: '{count} more secondary departments',
      phone: 'Phone',
      status: 'Status',
      oauthBound: '3rd-party',
      oauthBoundTag: 'Bound',
      loginIp: 'Last Login IP',
      loginDate: 'Last Login Time',
      createTime: 'Created Time'
    },
    form: {
      username: 'Username',
      nickName: 'Nickname',
      dept: 'Department',
      deptPrimaryTip: 'Primary department: determines data scope. Only one can be selected',
      deptSecondary: 'Secondary Departments',
      phone: 'Phone',
      email: 'Email',
      status: 'Status',
      password: 'Password',
      phPassword: 'Enter password',
      sex: 'Gender',
      role: 'Role',
      remark: 'Remark',
      post: 'Position',
      scimRoleSuffix: 'from group',
      scimDeptTags: 'Secondary departments from groups'
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
    erasure: {
      button: 'Anonymize (GDPR)',
      title: 'Anonymize user (irreversible)',
      confirm:
        'About to anonymize user "{user}". This action is IRREVERSIBLE:\n' +
        '· {fields} fields will be replaced (login name → deleted_id; nickname/email/phone/gender/avatar/remark/login IP cleared);\n' +
        '· the password will be cleared — the user can no longer sign in — and the account will be disabled and soft-deleted;\n' +
        '· all credentials are revoked immediately: {pat} PAT(s), {sso} third-party binding(s), {sessions} online session(s);\n' +
        '· audit trails (operation / login logs) are RETAINED.\n\nContinue?',
      confirmBtn: 'Anonymize',
      done: 'User "{user}" has been anonymized (irreversible)'
    },
    initialPasswordWarning: 'Your password is still the initial password. Please change it!',
    forcePasswordChangeWarning:
      'Force password change policy is enabled: you are using the initial password or your password has expired. You must change your password before accessing other features.',
    passwordExpiredWarning: 'Your password has expired. Please change it as soon as possible!',
    securityTip: 'Security Tip'
  },
  scimGroup: {
    displayName: 'Group Name',
    externalId: 'External ID',
    mappingType: 'Mapping Type',
    memberCount: 'Members',
    bindingCount: 'Bindings',
    sourceTip:
      'Group data is synced via SCIM (managed on the IdP side). Member and binding sync is maintained automatically; only binding targets can be adjusted here',
    editTitle: 'Group Binding Configuration',
    typeRole: 'Map to Roles',
    typeDept: 'Map to Secondary Departments',
    mappingLocked: 'Bindings exist; mapping type cannot be changed (clear bindings first)',
    mappingTip:
      'After binding, group members will be granted automatically; the mapping type cannot be changed arbitrarily once set',
    bindRoles: 'Bound Roles',
    bindRoleTip:
      'Group members will automatically be granted the selected roles (sourced from this group, independent of admin manual grants)',
    bindDept: 'Bound Secondary Departments',
    bindDeptTip:
      'Group members will automatically join the selected departments as secondary membership (primary department unaffected)',
    members: 'Group Members',
    userName: 'Username',
    nickName: 'Nickname',
    memberReadonly:
      'Group members are managed on the SCIM IdP side and are read-only here; remove members on the IdP side to sync',
    deleteConfirm: 'Delete group "{0}"? Its role/department grants will be revoked and the group will be soft-deleted',
    batchDeleteConfirm:
      'Delete the {0} selected groups? Their role/department grants will be revoked and the groups will be soft-deleted'
  },
  tenant: {
    tenantId: 'Tenant ID',
    tenantName: 'Tenant Name',
    tenantCode: 'Tenant Code',
    codePlaceholder: 'Exact match by code',
    codeAutoTip: 'Leave empty to auto-generate (t + random)',
    codeRule: 'Code must be 2-32 letters, digits, underscores or hyphens',
    lifecycle: 'Lifecycle',
    inRegister: 'Active',
    recycleBin: 'Recycle Bin',
    recycleTip:
      'Tenants in the recycle bin are soft-deleted (excluded from login and the org tree). A restored tenant is set to Disabled and must be enabled explicitly; sessions are not restored.',
    baseSection: 'Basic Info',
    contactSection: 'Contact & Remark',
    contactName: 'Contact',
    contactPhone: 'Phone',
    contactEmail: 'Email',
    emailRule: 'Invalid email format',
    package: 'Tenant Package',
    packagePlaceholder: 'Select a package (default package if empty)',
    packageOptionsFailed:
      'Failed to load package options: an empty dropdown does not mean there are no packages — retry before selecting',
    domain: 'Primary Domain',
    domainEmpty: 'Not bound',
    accountCount: 'Account Limit',
    accountUnlimited: 'Unlimited',
    accountUnlimitedTip: '0 means unlimited; bulk import is truncated at the limit',
    accountUsage: 'Used / Limit',
    expireTime: 'Expire Time',
    expireForever: 'Never expires',
    expiredTip: 'Expired: this tenant is read-only in grace period or already disabled',
    remark: 'Remark',
    restore: 'Restore',
    restoreConfirm:
      'Restore tenant "{0}" from the recycle bin? It will be set to Disabled and must be enabled explicitly',
    exportPackage: 'Export package',
    exportConfirm:
      'Export the data package of tenant "{0}"? All data of this tenant will be exported as a JSON file (other tenants excluded); download it under Data Backup',
    exportSuccess: 'Tenant package exported and download started (see Data Backup)',
    modelTip:
      'Tenant model: the dedicated tenant table is the source of truth (independent tenant_id space); the package whitelist caps menus; disabling/deleting/expiring a tenant revokes all its sessions immediately.',
    addTitle: 'Add Tenant',
    editTitle: 'Edit Tenant',
    nameRequired: 'Tenant name is required',
    enableConfirm: 'Enable tenant "{0}"? Its users will be able to log in again',
    disableConfirm: 'Disable tenant "{0}"? All its sessions will be revoked immediately',
    deleteConfirm:
      'Delete tenant "{0}"? All tenant users must be removed first; the tenant goes to the recycle bin (restorable)',
    adminInitTip:
      'Tenant admin created: username {0} / initial password {1} (shown only once — hand it over and require a password change on first login)',
    capability: 'Capabilities',
    capabilityTitle: 'Package Capabilities — {0}',
    capabilityTip:
      'Three-layer switches: platform config [features] (what may be enabled) → package capabilities (what this tenant may enable) → role grants (what this person may use). A capability marked "platform off" cannot be enabled here; disabling one also revokes the menu grants it previously unlocked (prevents "menu visible but request 403" fake entries).',
    capabilityKey: 'Capability',
    capabilityMode: 'Mode',
    capabilityPlatformOff: 'Platform off',
    capabilitySave: 'Save',
    capabilitySaved: 'Capabilities saved; role menu grants have been reconciled',
    capabilityLoadFailed:
      "Failed to load the capability registry: saving now would clear this package's capabilities — retry the load first",
    exportUnknown: 'Export result unknown: the server returned no backup record; check Data Backup before retrying',
    capabilityNoPackage: 'This tenant has no package assigned. Assign one via "Edit" before configuring capabilities.',
    capabilityModeOffTip: 'off = disabled (identical to the behavior before this feature existed)',
    capabilityPlatformCeiling:
      'Package capabilities can only narrow the platform layer (the platform is the ceiling): capabilities the platform has not enabled cannot take effect regardless of the package setting'
  },
  tenantDomain: {
    manage: 'Domains',
    title: 'Domain Management — {0}',
    tip: 'Domain routing: the gateway proxy injects the X-Tenant-Code header from Host (trusted only when the peer matches server.trusted_proxies); a custom domain must pass DNS TXT verification first, and unverified domains cannot be set as primary.',
    add: 'Add Domain',
    addTitle: 'Add Domain Binding',
    domain: 'Domain',
    domainPlaceholder: 'e.g. tenant.example.com (no port or path)',
    domainRule: 'Invalid domain format (lowercase letters, digits, dots and hyphens only, at least one dot)',
    domainType: 'Domain Type',
    typeSub: 'Subdomain',
    typeCustom: 'Custom Domain',
    isPrimary: 'Set as primary',
    isPrimaryTip:
      'The first domain of a tenant becomes primary automatically; the primary domain is mirrored into the tenant table',
    primary: 'Primary',
    secondary: 'Additional',
    verifyStatus: 'Verification',
    pendingVerify: 'Pending',
    verified: 'Verified',
    verifyFailed: 'Failed',
    verify: 'Verify',
    verifyTitle: 'DNS TXT Verification',
    verifyHint:
      'Add the following TXT record at your DNS provider, then click "Verify" again (propagation may be delayed by TTL):',
    txtRecord: 'Record Name',
    txtValue: 'Record Value',
    copy: 'Copy',
    copyOk: 'Copied to clipboard',
    verifyOk: 'Verified: this domain can now be used for tenant resolution',
    verifyFail: 'Not verified: no matching TXT record found (confirm the record has propagated)',
    verifiedAt: 'Verified At',
    setPrimary: 'Set Primary',
    setPrimaryConfirm: 'Set "{0}" as the primary domain of this tenant?',
    setPrimaryTip: 'Only verified and enabled domains can be set as primary',
    deleteConfirm: 'Delete domain binding "{0}"? It will no longer participate in tenant resolution',
    statusTip:
      'Once disabled, this domain no longer participates in tenant resolution (Host → tenant mapping disabled)',
    empty: 'No domain bound yet',
    myTitle: 'Domain Management',
    selfServiceTip:
      'This page is tenant self-service binding: only custom domains with DNS TXT verification can be added. Subdomains are allocated by the platform under Tenant Management (no verification needed).',
    targetTenant: 'Target Tenant',
    targetTenantPlaceholder: 'Select a tenant to manage (platform operator)',
    platformPickTenant:
      'This page is a tenant self-service feature. Platform operators must select a target tenant above to manage its domain bindings; tenant admins are automatically scoped to their own tenant.',
    subdomainPlatformTip:
      'Subdomains are allocated by the platform. On the tenant side you can only add custom domains, and a custom domain must pass DNS TXT verification before it can be set as primary.',
    tenantListFailed: 'Failed to load the tenant list; retry before selecting a target tenant'
  },
  tenantNav: {
    myTitle: 'My Navigation',
    targetTenant: 'Target Tenant',
    targetTenantPlaceholder: 'Select a tenant to manage (platform operator)',
    platformPickTenant:
      'This page is a tenant self-service feature. Platform operators must select a target tenant above to manage its navigation; tenant admins are automatically scoped to their own tenant.',
    tip: 'Tenant-built navigation only re-arranges already authorized menus (parent, order, visibility). It never adds pages or permission codes, so it cannot expand any privilege. Unresolvable parents, cycles or excessive depth fall back to the platform default layout automatically.',
    add: 'Add Navigation Item',
    addTitle: 'Add Navigation Item',
    editTitle: 'Edit Navigation Item',
    refMenu: 'Referenced Menu',
    refMenuPlaceholder: 'Select a menu to add to the navigation',
    refMenuTip:
      'Only directories/pages granted by both the tenant package and the role are selectable; buttons cannot be navigation nodes',
    refMenuType: 'Type',
    typeDir: 'Directory',
    typePage: 'Page',
    parent: 'Parent Navigation',
    parentTop: 'Top level',
    orderNum: 'Order',
    orderNumTip: 'Ascending within the same parent',
    visible: 'Visibility',
    show: 'Visible',
    hide: 'Hidden',
    status: 'Status',
    statusNormal: 'Normal',
    statusDisabled: 'Disabled',
    statusDisabledTip:
      'When disabled the whole row is ignored and the node falls back to its platform default position',
    perms: 'Permission',
    selected: 'Added',
    empty: 'No tenant navigation configured (the navigation fully follows the platform default)',
    deleteConfirm: 'Delete navigation item "{0}"? The node will fall back to its platform default position',
    duplicate: 'This menu is already in the navigation',
    readonlyTip: 'The capability is in view-only mode (nav.l3 = view_only); navigation settings are read-only.',
    tenantListFailed: 'Failed to load the tenant list. Retry before picking a target tenant.',
    disabledTip:
      'The "tenant-built navigation" capability (nav.l3) is not enabled; please ask a platform administrator to enable it.'
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
    // M3 field-level permission: role field authorization matrix
    fieldPerm: {
      title: 'Field Permission',
      colFieldName: 'Field Name',
      colFieldKey: 'Field Key',
      colHidden: 'Hidden',
      fields: {
        phonenumber: 'Phone Number',
        email: 'Email'
      },
      tipHidden:
        'Once checked as "Hidden", the field will be hidden on the {table} list page for all users of this role',
      confirmSave:
        'Saving will fully overwrite the field hidden config of this role and affect list visibility for all its users. Continue?',
      saveSuccess: 'Saved successfully'
    },
    dataScope: 'Data Permission',
    tip: {
      roleKeyHelp: "Permission key defined in the controller, e.g.: ＠PreAuthorize(`＠ss.hasRole('admin')`)",
      confirmStatusChange: 'Are you sure to "{text}" role "{name}"?',
      treeNotLoaded: 'The permission tree failed to load, so saving is blocked. Close the dialog and try again.'
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
      loadFailed: 'Failed to load dict data, please retry',
      statsTruncated: 'This dict has {total} entries; the stats below cover only the first {count}',
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
    configTomlTip:
      'Some system parameters are persisted in config.toml (e.g. database and Redis connections). Such parameters require a service restart after modification; parameters edited in the UI take effect immediately.',
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
      governance: 'Governance',
      governanceTip:
        'platform_only = platform-exclusive; values hidden from tenants are not delivered. Edit safety is enforced by backend Locked guard.',
      hiddenToTenant: 'Hidden',
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
    governance: {
      section: 'Multi-tenant Governance (platform only)',
      scope: 'Governance Scope',
      scopePlaceholder: 'Select governance scope',
      scopePlatformOnly: 'Platform Only (hidden from tenants)',
      scopePlatformDefault: 'Platform Default (visible & overridable)',
      scopeTenantPrivate: 'Tenant Private (tenant-created key)',
      tenantEditable: 'Tenant Overridable',
      tenantEditableTip: 'When on, tenant admins can modify this value for their own tenant',
      visibleToTenant: 'Tenant Visible',
      visibleToTenantTip: 'When on, this config appears in the tenant config list',
      lockedTip: 'This config is platform-locked (Coverage::Locked); governance attributes cannot be edited',
      lockedListUnknown:
        'Cannot confirm whether this config is platform-locked (the locked-key list failed to load). The form stays enabled, but the server still rejects governed fields per the registry',
      confirmChange:
        'Governance attributes changed: this affects visibility and overridability of this config for ALL tenants. Save anyway?'
    },
    validate: {
      configNameRequired: 'Config name is required',
      configKeyRequired: 'Config key is required',
      configValueRequired: 'Config value is required'
    },
    inlineEdit: {
      saveSuccess: 'Config value saved',
      saveFailed: 'Save failed, reverted to original value'
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
      parentTreeLoadFailed:
        'Failed to load the parent department tree; the form was not opened so the department cannot be created at the wrong level',
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
      parentTreeLoadFailed:
        'Failed to load the parent menu tree; the form was not opened so the menu cannot be created at the wrong level',
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
      queryHelp: 'Default parameters for the route, e.g.: `｛"id": 1, "name": "stepby"｝`',
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
      type: 'Notice Type',
      status: 'Status',
      phStatus: 'Notice status'
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
        site: 'Site',
        wecomRobot: 'WeCom Bot',
        dingtalkRobot: 'DingTalk Bot'
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
        phConfigJson: `{'{ "smtp_host": "smtp.qq.com", "smtp_port": 465, "smtp_user": "xxx@qq.com", "smtp_password": "xxx" }'}`,
        phConfigGeneric: 'Enter the config JSON for this channel type',
        configSecretTip:
          'Tip: sensitive fields such as smtp_password / password are masked as ******. Leave blank when editing to keep unchanged.',
        clearConfig: 'Clear channel config (including secrets)',
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
        hint: `{'Supports {{variable}} placeholders, replaced with actual values when sending. Click to insert:'}`,
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
        phStatus: 'Status',
        sendTime: 'Send Time'
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
        retry: 'Retry',
        markPending: 'Mark Pending'
      },
      status: {
        success: 'Success',
        fail: 'Failed',
        pending: 'Pending Retry'
      },
      tip: {
        confirmDelete: 'Are you sure to delete the send log with ID "{ids}"?',
        confirmClean: 'Are you sure you want to clear all send logs? This action cannot be undone!',
        confirmRetry: 'Are you sure you want to retry send log "{logId}"?',
        confirmMarkPending:
          '{count} selected: only terminally failed rows are requeued (successful rows are skipped, so nothing is delivered twice). Continue?'
      },
      cleanSuccess: 'Send logs cleared',
      retrySuccess: 'Retry succeeded',
      markPendingSuccess: '{count} row(s) requeued for retry'
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
      taskTypeReplay: 'Replay',
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
      tenantExport: 'Tenant Package',
      success: 'Success',
      fail: 'Failed'
    },
    btn: {
      create: 'Create Backup',
      download: 'Download',
      restore: 'Restore',
      exportSelf: 'Export Tenant Package'
    },
    tip: {
      backupSuccess: 'Backup succeeded',
      restoreSuccess: 'Restore succeeded',
      selfExportTooltip: 'Export the data package of the tenant that the current account belongs to',
      selfExportSuccess: 'Tenant data package exported and download started (see the Data Backup list)',
      selfExportUnknown:
        'Export result unknown: the server returned no backup record. Check the Data Backup list and retry.',
      confirmDelete: 'Are you sure to delete {count} selected backup records and files?',
      confirmCreate:
        'Are you sure to create a database backup now? This operation may take a few seconds to several minutes.',
      confirmRestore:
        'Are you sure to restore the database from backup "{name}"? This will overwrite all current database data and cannot be undone!',
      restoring: 'Restoring the database, please do not close or refresh the page…',
      restoreRelogin: 'Database restored. Signing out to reload your permissions…'
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
      phConfig: `{'Enter report config JSON, e.g. {"days":7}'}`,
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
      reportOptionsFailed: 'Failed to load report candidates; a report cannot be selected for now',
      listLoadFailed: "Failed to load subscriptions; cannot confirm this report's subscriptions",
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
        channelRequired: 'Please select at least one channel',
        emailRequired: 'Please fill recipients (separate multiple addresses with commas)',
        emailInvalidItems: 'Invalid recipient address(es): {items}'
      },
      tip: {
        confirmDelete: 'Delete subscription "{name}"?',
        confirmDeleteBatch: 'Are you sure to delete subscription #{ids}?',
        confirmRun: 'Push subscription "{name}" now?',
        confirmStatusChange: 'Are you sure you want to {text} the subscription "{name}"?',
        runSuccess: 'Push triggered'
      }
    }
  },
  webHook: {
    title: 'WebHook Configuration',
    search: {
      hookName: 'Hook Name',
      phHookName: 'Enter hook name',
      eventTypes: 'Event Types',
      phEventTypes: 'Select event types',
      status: 'Status',
      phStatus: 'Status'
    },
    column: {
      id: 'Hook ID',
      hookName: 'Hook Name',
      eventTypes: 'Event Types',
      targetUrl: 'Target URL',
      contentType: 'Content Type',
      timeoutSecs: 'Timeout (s)',
      status: 'Status',
      createBy: 'Created By',
      createTime: 'Create Time'
    },
    form: {
      hookName: 'Hook Name',
      phHookName: 'Enter hook name',
      eventTypes: 'Event Types',
      phEventTypes: 'Select event types',
      eventTypesTip: 'Leave empty to subscribe to all events',
      subscribedEvents: 'Subscribed Events',
      phSubscribedEvents: 'Select events to subscribe',
      subscribedEventsTip: 'Options come from the event catalog; leave empty to subscribe to all events',
      targetUrl: 'Target URL',
      phTargetUrl: 'Enter outbound target URL, e.g. https://example.com/hook',
      secret: 'Signing Secret',
      phSecret: 'Enter signing secret',
      phSecretKeep: 'Secret configured; leave empty to keep it',
      secretTip: 'Leave empty on edit to keep unchanged; optional on add',
      contentType: 'Content Type',
      timeoutSecs: 'Timeout (seconds)',
      timeoutSecsUnit: 'seconds',
      status: 'Status',
      remark: 'Remark',
      phRemark: 'Enter remark'
    },
    btn: {
      log: 'Logs',
      test: 'Test Push',
      export: 'Export',
      eventCatalog: 'Event Catalog',
      testSend: 'Test Send'
    },
    tip: {
      confirmDelete: 'Are you sure to delete webhook #{ids}?',
      confirmChange: 'Are you sure to set webhook "{name}" {text}?',
      testTitle: 'Test Push',
      testSuccess: 'Push succeeded',
      testFail: 'Push failed',
      testSendSuccess: 'Test push sent for event "{event}"',
      testSendFail: 'Test push failed for event "{event}"'
    },
    validate: {
      hookNameRequired: 'Hook name is required',
      targetUrlRequired: 'Target URL is required',
      targetUrlFormat: 'Target URL must start with http(s)://'
    },
    eventType: {
      all: 'All',
      login_success: 'Login Success',
      login_failure: 'Login Failure',
      scim_user_provisioned: 'SCIM User Provisioned',
      scim_user_deactivated: 'SCIM User Deactivated',
      user_created: 'User Created',
      scim_group_provisioned: 'SCIM Group Provisioned',
      scim_group_deleted: 'SCIM Group Deleted'
    },
    test: {
      eventType: 'Event Type',
      phEventType: 'Select event type to simulate',
      payload: 'Event Payload',
      phPayload: 'Optional, leave empty to use default payload',
      result: 'Push Result',
      ok: 'Success',
      fail: 'Failed',
      statusCode: 'Status Code',
      response: 'Response',
      error: 'Error',
      costMs: 'Cost (ms)',
      send: 'Start Test'
    },
    status: {
      all: 'All',
      success: 'Success',
      fail: 'Failed'
    },
    log: {
      title: 'Push Records',
      search: {
        eventType: 'Event Type',
        phEventType: 'Enter event type',
        status: 'Status',
        phStatus: 'Status',
        createTime: 'Create Time'
      },
      column: {
        id: 'Record ID',
        hookName: 'Hook Name',
        eventType: 'Event Type',
        targetUrl: 'Target URL',
        statusCode: 'Status Code',
        costMs: 'Cost (ms)',
        status: 'Status',
        createTime: 'Create Time'
      },
      btn: {
        clean: 'Clean',
        retry: 'Retry',
        delete: 'Delete',
        export: 'Export',
        view: 'View'
      },
      tip: {
        confirmDelete: 'Are you sure to delete push record #{ids}?',
        confirmClean: 'Are you sure to clean all push records? This cannot be undone!',
        confirmRetry: 'Are you sure to retry push record #{ids}?'
      },
      detail: {
        title: 'Push Record Detail',
        payload: 'Event Payload',
        response: 'Response',
        errorMsg: 'Error Message'
      },
      status: {
        success: 'Success',
        fail: 'Failed'
      },
      cleanSuccess: 'Push records cleaned',
      retrySuccess: 'Retry succeeded'
    },
    eventCatalog: {
      title: 'Webhook Event Catalog',
      eventKey: 'Event Key',
      name: 'Event Name',
      description: 'Description',
      payloadExample: 'Payload Example',
      empty: 'No events',
      loadFail: 'Failed to load the event catalog; subscription options may be empty'
    }
  },
  auditChange: {
    title: 'Change Audit Trail',
    search: {
      tableName: 'Table Name',
      phTableName: 'Enter the changed table name',
      rowPk: 'Row PK',
      phRowPk: 'Enter the row primary key',
      action: 'Action',
      phAction: 'Select change action',
      operatorName: 'Operator',
      phOperatorName: 'Enter operator name',
      operatedAt: 'Operated At'
    },
    column: {
      id: 'Record ID',
      tableName: 'Table Name',
      rowPk: 'Row PK',
      action: 'Action',
      changedFields: 'Changed Fields',
      operatorName: 'Operator',
      operatedAt: 'Operated At'
    },
    diff: {
      before: 'Before',
      after: 'After',
      changedFields: 'Changed fields',
      noChangedField: 'This record carries no field diff info'
    }
  },
  profile: {
    title: 'Profile',
    basicInfo: 'Basic Info',
    loadFailed: 'Failed to load profile',
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
    placeholder: {
      areaCode: 'Area code'
    },
    // Phone country/region dropdown (labelKey targets in utils/phone.ts REGION_OPTIONS)
    region: {
      cn: 'China (+86)',
      hk: 'Hong Kong, China (+852)',
      us: 'US / Canada (+1)',
      mo: 'Macao, China (+853)',
      tw: 'Taiwan, China (+886)',
      gb: 'United Kingdom (+44)',
      jp: 'Japan (+81)'
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
      keyCopied: 'Secret copied',
      retryIn: 'Too many failed attempts, try again in {seconds}s'
    },
    passkey: {
      title: 'Passkeys',
      tip: 'Passkeys let you sign in securely without a password, using the fingerprint, face recognition or security key of this device.',
      add: 'Add a passkey',
      dialogTitle: 'Add a passkey',
      nameLabel: 'Name',
      namePlaceholder: 'Give this passkey a name (e.g. My laptop)',
      nameRequired: 'Please enter a name',
      column: {
        name: 'Name',
        createTime: 'Created At',
        lastUsedAt: 'Last Used',
        signCount: 'Sign Count',
        action: 'Actions'
      },
      delete: 'Delete',
      deleteConfirm: 'Delete the passkey "{name}"? This device will no longer be able to sign in with it.',
      deleteSuccess: 'Deleted',
      addSuccess: 'Passkey added successfully',
      empty: 'No passkeys added yet',
      neverUsed: 'Never used',
      unsupported: 'This browser does not support passkeys (WebAuthn). Please use another browser or device.'
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
      rotateRight: 'Rotate Right',
      refreshFailed: 'Avatar uploaded, but the account info refresh failed. Reload the page to see the new avatar.'
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
      saveError: 'Save failed',
      loadFailed: 'Failed to load message preferences, saving is disabled'
    }
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
    mobileTableCards: 'Mobile Table Cards',
    mobileTableCardsTip:
      'Render tables as stacked cards (labels first) on phones; default off keeps horizontal scrolling',
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
    saveSuccess: 'Preferences saved',
    saveNotPersisted:
      'Preferences applied for this session but could not be saved locally (the old values will return on next launch)'
  },
  rp: {
    searchByName: 'Search by name',
    datasetCode: 'Dataset Code',
    datasetName: 'Dataset Name',
    sqlTemplate: 'SQL Template',
    sqlPlaceholder: 'SELECT id, name, cnt FROM ... WHERE day <= :days',
    sqlRuleHint:
      'Single parameterized SELECT only (:param placeholders); DML/DDL/comments/multi-statement/subquery/UNION rejected',
    paramsSchema: 'Params Schema',
    sqlLoadFailed: 'Failed to load the plaintext SQL; type the full SQL before saving',
    paramsSchemaInvalid: 'Params schema is not valid JSON',
    preview: 'Preview',
    previewTitle: 'Dataset Preview (LIMIT 100)',
    queryParams: 'Query params',
    runQuery: 'Run query',
    previewFailed: 'Query failed: check the params and retry (see the error notice for details)',
    fieldOptionsFailed:
      'Failed to load field options: an empty dropdown does not mean the dataset has no fields — retry',
    truncatedHint: 'Result truncated at 100 rows',
    removeDatasetConfirm: 'Charts bound to this dataset will break. Delete anyway?',
    formRequired: 'Code / Name / SQL template are required',
    chartEmptyHint: 'Nothing to render: check field bindings or dataset config',
    chartLoadFail: 'Failed to load data, please retry',
    pickDashboard: 'Pick dashboard',
    pickDataset: 'Pick dataset',
    newDashboard: 'New dashboard',
    newChartDefaultName: 'New chart',
    newDashboardDefaultName: 'Untitled dashboard',
    dashboardCode: 'Dashboard Code',
    dashboardName: 'Dashboard Name',
    codeNameRequired: 'Code and name are required',
    removeDashboardConfirm: 'Delete this dashboard?',
    unsavedSwitchConfirm: 'This dashboard has unsaved changes that will be lost if you switch. Continue?',
    unsavedLeaveConfirm: 'This dashboard has unsaved changes that will be lost if you leave this page. Leave anyway?',
    unsavedDiscardConfirm:
      'This dashboard has unsaved changes that will be lost when switching to view mode. Switch anyway?',
    addChart: 'Add chart',
    chartType: 'Chart type',
    canvasEmpty: 'Canvas is empty: pick a dataset and add charts',
    chartProps: 'Chart properties',
    chartTitle: 'Title',
    span: 'Width',
    nameField: 'Name field',
    valueField: 'Value field',
    modeView: 'View',
    modeDesign: 'Design',
    refreshOff: 'Off',
    refresh10s: 'Every 10s',
    refresh30s: 'Every 30s',
    refresh60s: 'Every 60s',
    exportPdf: 'Export PDF',
    fullscreen: 'Fullscreen',
    boardEmpty: 'No charts yet — switch to Design mode to add',
    pickDashboardFirst: 'Pick a dashboard first',
    moveUp: 'Move up',
    moveDown: 'Move down',
    chartSetting: 'Chart settings'
  },
  flowDef: {
    searchByCode: 'Search by code',
    colCode: 'Flow Code',
    colName: 'Flow Name',
    colVersion: 'Version',
    colLatest: 'State',
    docTitle: 'Document title',
    submitTest: 'Submit Test Doc',
    submitTitleDefault: 'Test doc - {code}',
    submitTitlePh: 'Enter document title',
    submitTitleRequired: 'Document title is required',
    fieldsJson: 'Fields snapshot',
    fieldsJsonTip: 'JSON object; condition edges are evaluated against these fields (e.g. days/leaveType)',
    fieldsJsonInvalid: 'Fields snapshot must be a valid JSON object',
    submitOk: 'Submitted; approver todos generated',
    latestTag: 'Latest',
    historyTag: 'History',
    publish: 'Publish',
    publishConfirm: 'Publishing creates a new version and marks it latest. Continue?',
    publishDone: 'Published v{version}',
    removeConfirm: 'Delete this flow definition?',
    diffVsLatest: 'Diff vs latest',
    diffTitle: 'Version diff: {code} (current vs latest)',
    diffNodes: 'Node changes',
    diffEdges: 'Edge changes',
    diffNoChange: 'No changes',
    diffNoOlderVersion: 'This is the latest version (or no same-code version); nothing to compare',
    newDefinition: 'New flow definition',
    newDefinitionDefaultName: 'Untitled flow',
    addNode: 'Add approval node',
    addEnd: 'Add end node',
    addEdge: 'Add edge',
    nodes: 'Nodes',
    edges: 'Edges',
    nodeId: 'Node ID',
    nodeName: 'Node name',
    assignees: 'Approvers',
    assigneeDeptLeader: 'Dept leader',
    assigneeRoleAdmin: 'Administrator role (role:admin)',
    multiMode: 'Multi-approval mode',
    threshold: 'Threshold',
    actions: 'Actions',
    edgeFrom: 'From',
    edgeTo: 'To',
    hasCondition: 'Condition',
    condField: 'Field',
    condOp: 'Operator',
    condValue: 'Value',
    graphInvalid: 'Graph validation failed — fix items in the error list',
    codeNameRequired: 'Code and name are required',
    // Flow graph validation messages: flowGraph.ts is a pure module (no i18n context),
    // it emits key + params only and the render site translates with t()
    validate: {
      nodesEmpty: 'nodes must not be empty',
      nodesOverLimit: 'Node count exceeds the limit (≤{max})',
      edgesOverLimit: 'Edge count exceeds the limit (≤{max})',
      nodeIdInvalid: 'Invalid node id (1-{max} chars): {id}',
      nodeIdDuplicated: 'Duplicate node id: {id}',
      nodeTypeNotAllowed: 'Node type not in whitelist: {type}',
      approveNodeMissingAssignees: 'Approval node {id} is missing assignees',
      assigneeInvalid: 'Invalid assignee format on node {id}: {assignee} (only dept_leader / role:<key>)',
      multiModeInvalid: 'Invalid multi-approval mode on node {id}: {mode}',
      thresholdNotPositiveInt: 'threshold on node {id} must be a positive integer',
      thresholdOutOfRange: 'threshold out of range on node {id}: {threshold}',
      weightedMissingThreshold: 'Weighted node {id} is missing threshold',
      actionNotAllowed: 'Action not in whitelist on node {id}: {action}',
      startCountMustBeOne: 'Exactly one start node is required, found {count}',
      endCountMustBeOne: 'Exactly one end node is required, found {count}',
      edgeFromMissing: 'Edge source does not exist: {from}',
      edgeToMissing: 'Edge target does not exist: {to}',
      selfLoop: 'Self loop: {id}',
      duplicateEdge: 'Duplicate edge: {from} → {to}',
      conditionFieldInvalid: 'Edge {from} → {to}: invalid condition field name: {field}',
      conditionOpNotAllowed: 'Edge {from} → {to}: comparison operator not in whitelist: {op}',
      conditionValueInvalid: 'Edge {from} → {to}: condition value must be a string or a number',
      endUnreachable: 'end is unreachable from start (the flow has no exit)',
      approveNodeUnreachable: 'Approval node {id} is unreachable (orphan node)',
      cycleDetected: 'Cycle detected: {from} → {to}'
    }
  },
  flow: {
    pendingAlert: 'You have {count} approval task(s) to handle',
    tabTodo: 'My Approvals',
    tabMine: 'My Documents',
    tabDone: 'Processed',
    tabAll: 'All Documents',
    colTitle: 'Title',
    colApplicant: 'Applicant',
    colNode: 'Current Node',
    colType: 'Mode',
    colDue: 'Due',
    colLeaveType: 'Leave Type',
    colDays: 'Days',
    colMode: 'Approval Mode',
    colStatus: 'Status',
    colRound: 'Round',
    colBizId: 'Document ID',
    colAction: 'Action',
    colComment: 'Comment',
    colActedAt: 'Acted At',
    typeSingle: 'Single',
    typeCountersign: 'Countersign',
    typeOrSign: 'Any-of',
    typeWeighted: 'Weighted',
    actApprove: 'Approve',
    actReject: 'Reject',
    actApproveShort: 'Approve',
    actRejectShort: 'Reject',
    btnExport: 'Export',
    exportNoData: 'No data to export',
    cardMyTodo: 'My Pending Approvals',
    cardMyTodoDesc: 'Pending approval tasks',
    cardTodoEmpty: 'No pending approvals',
    actTransfer: 'Transfer',
    actCountersign: 'Add Approver',
    actCountersignDel: 'Remove Approver',
    actWithdraw: 'Withdraw',
    confirmWithdraw: 'Withdraw "{title}"? The approver\'s pending task will disappear immediately.',
    confirmResubmit: 'Resubmit "{title}"? It re-enters the approval flow and the approver receives a new pending task.',
    actResubmit: 'Resubmit',
    btnSubmit: 'Submit Leave Request',
    submitTitle: 'Submit Leave Request',
    detailTitle: 'Approval Detail',
    timeline: 'Approval Timeline',
    formTitle: 'Title',
    formLeaveType: 'Leave Type',
    formDays: 'Days',
    formMode: 'Approval Mode',
    formReason: 'Reason',
    formComment: 'Comment',
    formToUser: 'Target user (User ID)',
    phToUser: 'Type a username to search remotely',
    userOptionsFailed: 'Failed to load user candidates; target user cannot be selected',
    phToUserDel: 'Pick another approver of this node (at least one must remain)',
    actTitle: {
      approve: 'Approve',
      reject: 'Reject',
      transfer: 'Transfer',
      countersign: 'Add Approver',
      countersignDel: 'Remove Approver'
    },
    rules: {
      title: 'Please enter the title',
      days: 'Please enter the days',
      toUserRequired: 'Please select a target user'
    },
    leave: {
      annual: 'Annual Leave',
      sick: 'Sick Leave',
      personal: 'Personal Leave'
    },
    status: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      transferred: 'Transferred',
      withdrawn: 'Withdrawn',
      draft: 'Draft'
    },
    action: {
      submit: 'Submit',
      approve: 'Approve',
      reject: 'Reject',
      withdraw: 'Withdraw',
      transfer: 'Transfer',
      delegate: 'Delegate',
      countersign_add: 'Approver Added',
      countersign_del: 'Approver Removed',
      timeout_remind: 'Timeout Remind'
    },
    msgSubmitted: 'Submitted and entered the approval flow',
    msgNoTaskFound: 'No pending task found for this document'
  },
  aiPanel: {
    historyTitle: 'Query History',
    history: {
      time: 'Time',
      question: 'Question',
      rows: 'Rows',
      status: 'Status',
      ok: 'OK',
      failed: 'Failed',
      empty: 'No query history yet',
      loadFail: 'Failed to load query history',
      replay: 'Replay',
      replayFailed: 'Replay failed',
      remove: 'Delete',
      confirmRemove: 'Delete this query history entry? This cannot be undone.'
    },
    title: 'AI Data Assistant (natural language queries)',
    toggleTables: 'Queryable scope',
    tablesTitle: 'Whitelisted tables',
    noTables: 'No whitelisted tables fetched',
    tablesLoadFail: 'Failed to load whitelisted tables',
    placeholder: 'Describe the data you want in natural language, e.g. new users per day for the last 7 days',
    ask: 'Ask',
    hint: 'The AI generates SQL which is security-checked then executed (read-only, tenant-isolated)',
    resultTitle: 'Query result',
    rowCount: '{n} rows',
    tokenUsage: '{promptTokens}+{completionTokens} tokens (total {totalTokens})',
    exportCsv: 'Export CSV',
    generatedSql: 'Generated SQL (tables referenced):',
    emptyResult: 'Query succeeded but returned no rows',
    askFailed: 'AI query failed, please try again later',
    tpl1: 'How many enabled users are in the system?',
    tpl2: 'Show the latest 10 login logs',
    tpl3: 'How many users does each department have?'
  }
}
