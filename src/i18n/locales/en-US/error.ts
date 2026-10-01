// en-US · 分类：error（错误与反馈）
// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块

export default {
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
      backHome: 'Back to Home',
      autoBack: 'Returning to home in {seconds} second(s)'
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
    },
    monitor: {
      title: 'Issue Monitor',
      empty: 'No errors or warnings',
      clear: 'Clear',
      viewAll: 'View all frontend errors',
      ariaWithCount: '{count} errors or warnings',
      ariaNoIssue: 'No errors or warnings',
      multi: ' (×{count})',
      aggregated: 'Found {total} issue(s): {errors} error(s), {warnings} warning(s)',
      source: 'Source: {source}',
      levels: {
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
      },
      sources: {
        api: 'API',
        download: 'Download',
        vue: 'Vue',
        global: 'Global',
        unhandledrejection: 'Unhandled Promise',
        resource: 'Resource',
        other: 'Other'
      }
    }
  },
  about: {
    title: 'About',
    projectInfo: 'Project Info',
    projectName: 'Stepby Admin',
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
        intro: 'Welcome to Stepby admin system. Follow these steps to get started:',
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
        websiteDesc: 'stepby.tzkj.net',
        email: 'Email Support',
        emailDesc: "support{'@'}stepby.tzkj.net"
      }
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
  tour: {
    prev: 'Previous',
    next: 'Next',
    finish: 'Finish',
    skip: 'Skip Guide',
    ariaLabel: 'Tour Guide'
  },
  notification: {
    newNotice: 'New Notice',
    operLogTitle: 'Operation Log',
    systemTitle: 'System Message',
    systemMessageTitle: 'System Message',
    wsConnected: 'WebSocket connected',
    forceLogoutMessage: 'Your account has been forcibly logged out by the administrator.',
    forceLogoutMsg: 'Your account has been forcibly logged out by the administrator'
  }
}
