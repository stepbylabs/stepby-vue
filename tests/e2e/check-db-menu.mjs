// 查询数据库 sys_menu 表中 dashboard/workbench 相关记录
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('d:/桌面/stepby/stepby-axum/data/stepby.db');

const rows = db.prepare(`
  SELECT menu_id, menu_name, parent_id, order_num, path, component, menu_type, perms, icon, i18n_key, visible, status, del_flag
  FROM sys_menu
  WHERE menu_id IN (127, 130, 132) OR path IN ('dashboard', 'workbench') OR component IN ('dashboard/index', 'workbench/index')
  ORDER BY parent_id, order_num
`).all();

console.log('=== sys_menu 相关记录 ===');
console.log(JSON.stringify(rows, null, 2));

// 也查询所有顶级菜单看顺序
const topMenus = db.prepare(`
  SELECT menu_id, menu_name, parent_id, order_num, path, component, menu_type, icon
  FROM sys_menu
  WHERE parent_id = 0 AND del_flag = '0' AND menu_type IN ('M', 'C')
  ORDER BY order_num, menu_id
`).all();

console.log('\n=== 顶级菜单（parent_id=0）===');
console.log(JSON.stringify(topMenus, null, 2));

db.close();
