const fs = require('fs');

let content = fs.readFileSync('server.main.ts', 'utf8');

// 1. Add dashboardv2 to FRONTEND_PAGES
const oldPages = "  { paths: ['/', '/dashboard'], file: 'dashboard.html' },";
const newPages = "  { paths: ['/dashboardv2', '/dashboard-v2', '/v2'], file: 'dashboardv2.html' },\n  { paths: ['/', '/dashboard'], file: 'dashboard.html' },";
if (!content.includes('dashboardv2.html')) {
  content = content.replace(oldPages, newPages);
}

// 2. Remove /v2, /dashboardv2 from redirect
const oldRedirect = "if (['/v2','/dashboardv2','/dashboard-v2','/cockpit','/outlets-v2','/dashboardv3','/dashboard-v3'].includes(reqPath)) {";
const newRedirect = "if (['/cockpit','/outlets-v2','/dashboardv3','/dashboard-v3'].includes(reqPath)) {";
content = content.replace(oldRedirect, newRedirect);

// 3. In sendStitchPage, check project root if not in stitch_pages
const oldCheck = "if (altPath) {";
const newCheck = `const pRoot = path.resolve(__dirname, '..', subPath);
          if (fs.existsSync(pRoot)) return res.sendFile(pRoot);
          if (altPath) {
            const pRootAlt = path.resolve(__dirname, '..', altPath);
            if (fs.existsSync(pRootAlt)) return res.sendFile(pRootAlt);`;
if (!content.includes('pRootAlt')) {
  content = content.replace(oldCheck, newCheck);
}

fs.writeFileSync('server.main.ts', content, 'utf8');
console.log('server.main.ts updated successfully.');

