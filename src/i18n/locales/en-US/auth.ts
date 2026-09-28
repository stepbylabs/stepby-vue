// en-US · 分类：auth（认证会话）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

export default {
  login: {
    title: 'Stepby Admin System',
    username: 'Username',
    password: 'Password',
    capsLockOn: 'Caps Lock is on',
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
    oauthGoLogin: 'Go to login',
    passkeyLogin: 'Sign in with a passkey',
    passkeyDivider: 'or sign in with a passkey',
    passkeyUsernameRequired: 'Enter your username first to sign in with a passkey'
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
    ownership: 'Ownership',
    ownershipPlatform: 'Platform',
    ownershipTenant: 'Tenant',
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
  sso: {
    title: 'SSO Client',
    tip: 'This system acts as an OIDC authorization server: register third-party applications (Relying Parties) here and configure their redirect URIs, scopes and grant types.',
    clientName: 'Client Name',
    clientId: 'Client ID',
    clientSecret: 'Client Secret',
    clientIdAuto: 'Leave blank to auto-generate',
    logoUri: 'Logo URL',
    redirectUris: 'Redirect URIs',
    redirectUrisPh: 'One https redirect URI per line',
    scopes: 'Scopes',
    grantTypes: 'Grant Types',
    grantTypesTip: 'authorization_code is required and always enabled',
    idTokenAlg: 'Signing Alg',
    idTokenAlgTip: 'RS256 (recommended, public keys via /sso/jwks); HS256 uses a symmetric secret',
    subjectType: 'Subject Type',
    subjectTypeTip: 'Switching to pairwise changes the sub in issued tokens; RPs will see a new user',
    sectorIdentifier: 'Sector Identifier',
    sectorIdentifierTip: 'https URL; pairwise RPs sharing a sector receive the same sub (org-level account linking); empty = clientId as salt',
    consentRequired: 'Consent Required',
    enabled: 'Status',
    remark: 'Remark',
    createTime: 'Created At',
    deleteTip: 'Are you sure you want to delete SSO client "{ids}"?',
    rotateSecret: 'Rotate Secret',
    clearPrevSecret: 'End Grace Period',
    rotateTip:
      'Rotate the secret of "{client}"? The new secret takes effect immediately, while the old one keeps working during the dual-key grace period (so RPs can switch without downtime).',
    clearPrevTip:
      'End the dual-key grace period for "{client}"? The old secret will be invalidated immediately (idempotent).',
    rotateDone: 'Secret rotated — copy the new secret now',
    clearDone: 'Dual-key grace period ended',
    rule: {
      nameRequired: 'Please enter the client name',
      redirectRequired: 'Please enter at least one redirect URI',
      scopeRequired: 'Please select at least one scope'
    },
    secret: {
      title: 'Client Secret',
      warning: 'Copy and store the client secret now. It cannot be viewed again after this dialog is closed.',
      done: 'I have saved it',
      copied: 'Copied {label}',
      copyFailed: 'Copy failed, please select and copy manually'
    },
    consent: {
      title: 'Authorize "{client}"',
      subtitle: 'Current user: {user}',
      willAllow: 'This application will be granted the following:',
      redirectHost: 'You will be redirected to:',
      approve: 'Authorize',
      deny: 'Deny',
      invalidTitle: 'Invalid authorization request',
      invalidTip: 'Required authorization parameters are missing, please go back and retry',
      backHome: 'Back to Home',
      noRedirect: 'No redirect URL returned, please go back and retry',
      scope: {
        openid: 'View your basic identity information',
        profile: 'View your profile',
        email: 'View your email address'
      }
    },
    grants: {
      title: 'Authorized Apps',
      tip: 'Third-party applications you have granted access via SSO. Revoking removes their access immediately (issued access tokens are revoked at the same time).',
      column: {
        app: 'Application',
        scopes: 'Granted Scopes',
        consentedAt: 'Consented At',
        action: 'Actions'
      },
      scopeAll: 'Full access',
      revoke: 'Revoke',
      revokeConfirm: 'Revoke access for "{name}"? The application loses access to your data immediately.',
      revoked: 'Access revoked',
      empty: 'No authorized third-party applications yet'
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
    loadFail: 'Failed to load session list',
    degradedHint: 'Non-HTTPS environment: session identification uses weak matching (last 8 chars of token) and may be inaccurate; use HTTPS for precise identification'
  },
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
  cookieConsent: {
    ariaLabel: 'Cookie Consent Notice',
    title: 'Cookie Privacy Preferences',
    text: 'This website uses cookies to improve your experience. By continuing to use this website, you agree to our cookie policy.',
    learnMore: 'Learn More',
    accept: 'Accept All',
    reject: 'Necessary Only'
  },
  session: {
    timeoutWarning:
      'You have been inactive. The system will automatically log out in {seconds} seconds. Continue operating?',
    timeoutWarningTitle: 'Session Timeout Warning',
    continueOperation: 'Continue',
    logoutNow: 'Log Out Now'
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
  legal: {
    privacy: {
      title: 'Privacy Policy',
      lastUpdated: 'Last updated: {date}',
      intro1:
        'This Privacy Policy (hereinafter "this Policy") describes how Stepby (hereinafter "we") collects, uses, stores, and protects your personal information when you use our website and services, as well as the rights you enjoy. This Policy is formulated in accordance with the Personal Information Protection Law of the People\'s Republic of China (hereinafter "PIPL"), the Cybersecurity Law of the People\'s Republic of China, the Data Security Law of the People\'s Republic of China, and other relevant laws and regulations.',
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
      section6Email: 'Email: privacy＠stepby.tzkj.net',
      section6Channel: 'Submit your questions through the feedback channel provided on this website.',
      section6Conclusion: 'We will process and respond to your feedback as soon as possible after receipt.',
      footer1:
        'This Policy is formulated and interpreted by Stepby. We reserve the right of final interpretation of this Policy.',
      footer2:
        'If this Policy changes, we will update it on this page in a timely manner and indicate the last update date.'
    }
  }
}
