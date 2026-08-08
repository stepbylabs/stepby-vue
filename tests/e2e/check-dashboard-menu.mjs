// 调试 dashboard 菜单结构
import http from 'http';
import { TEST_USER, TEST_PASS } from './test-config.mjs';

const loginBody = JSON.stringify({ username: TEST_USER, password: TEST_PASS, code: '', uuid: '' });

const req = http.request('http://127.0.0.1:8080/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
}, (res) => {
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => {
    const token = JSON.parse(d).token;
    http.get('http://127.0.0.1:8080/getRouters', {
      headers: { Authorization: 'Bearer ' + token }
    }, (r) => {
      let x = '';
      r.on('data', (c) => { x += c; });
      r.on('end', () => {
        const data = JSON.parse(x).data;
        const dashboards = [];
        const scan = (menus, parentPath = '') => menus.forEach((m) => {
          const fullPath = parentPath + '/' + m.path;
          if (m.path === 'dashboard' || m.path === '/dashboard' ||
              m.component === 'dashboard/index' || m.component === 'workbench/index' ||
              m.path === 'workbench' || m.path === '/workbench') {
            dashboards.push({ ...m, _fullPath: fullPath });
          }
          if (m.children) scan(m.children, fullPath);
        });
        scan(data);
        console.log('=== Dashboard/Workbench 菜单 ===');
        console.log(JSON.stringify(dashboards, null, 2));

        // 也检查 sys_menu 表中的相关记录
        http.get('http://127.0.0.1:8080/system/menu/list?pageSize=1000', {
          headers: { Authorization: 'Bearer ' + token }
        }, (r2) => {
          let y = '';
          r2.on('data', (c) => { y += c; });
          r2.on('end', () => {
            try {
              const menusData = JSON.parse(y);
              const allMenus = menusData.data?.rows || menusData.rows || [];
              const related = allMenus.filter((m) =>
                m.path === 'dashboard' || m.path === 'workbench' ||
                m.component === 'dashboard/index' || m.component === 'workbench/index' ||
                [127, 130, 132].includes(m.menuId)
              );
              console.log('\n=== sys_menu 表中相关记录 ===');
              console.log(JSON.stringify(related, null, 2));
            } catch (e) {
              console.log('解析菜单列表失败:', e.message);
            }
          });
        }).on('error', (e) => console.log('menu list error:', e.message));
      });
    }).on('error', (e) => console.log('getRouters error:', e.message));
  });
});

req.write(loginBody);
req.end();
