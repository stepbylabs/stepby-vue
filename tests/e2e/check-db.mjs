import Database from 'better-sqlite3'

const db = new Database('d:/桌面/stepby/stepby-axum/data/stepby.db', { readonly: true })

// Check migrations
const migrations = db.prepare('SELECT * FROM seaql_migrations ORDER BY version').all()
console.log('Migrations:', migrations.map(m => m.version).join(', '))

// Check if menu 1211 exists
const menu = db.prepare('SELECT menu_id, menu_name, perms FROM sys_menu WHERE menu_id = 1211').get()
console.log('Menu 1211:', menu)

// Check if role_menu (2, 1211) exists
const roleMenu = db.prepare('SELECT * FROM sys_role_menu WHERE role_id = 2 AND menu_id = 1211').get()
console.log('Role menu (2, 1211):', roleMenu)

// Check all backup permissions for role 2
const perms = db.prepare(`
  SELECT m.menu_id, m.menu_name, m.perms
  FROM sys_menu m
  JOIN sys_role_menu rm ON m.menu_id = rm.menu_id
  WHERE rm.role_id = 2 AND m.perms LIKE '%backup%'
`).all()
console.log('Role 2 backup perms:', perms)

// Check all backup menus
const allBackupMenus = db.prepare("SELECT menu_id, menu_name, perms FROM sys_menu WHERE perms LIKE '%backup%'").all()
console.log('All backup menus:', allBackupMenus)

db.close()
