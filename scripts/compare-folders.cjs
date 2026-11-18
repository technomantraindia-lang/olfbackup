const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dirA = 'c:/Users/TM Universe/Desktop/ols';
const dirB = 'e:/backend_staging';

const diffFiles = [
  '.env',
  '.gitignore',
  'controllers/v1/api/hr/hrms.controller.ts',
  'controllers/v1/api/invoices/invoices.controller.ts',
  'dist/controllers/v1/api/hr/hrms.controller.js',
  'dist/controllers/v1/api/invoices/invoices.controller.js',
  'dist/middlewares/access.middleware.js',
  'dist/models/v1/hr/employee.model.js',
  'dist/models/v1/hr/hrms.model.js',
  'dist/models/v1/invoices/invoices.model.js',
  'dist/models/v1/wallet/dashboard.model.js',
  'dist/routes/hr.routes.js',
  'dist/server.main.js',
  'invoices.html',
  'menu.html',
  'middlewares/access.middleware.ts',
  'models/v1/hr/employee.model.ts',
  'models/v1/hr/hrms.model.ts',
  'models/v1/invoices/invoices.model.ts',
  'models/v1/wallet/dashboard.model.ts',
  'outlet-detail.html',
  'outlet.html',
  'outlets-redesign.html',
  'routes/hr.routes.ts',
  'server.main.ts'
];

for (const f of diffFiles) {
  const pA = path.join(dirA, f);
  const pB = path.join(dirB, f);
  const sA = fs.statSync(pA);
  const sB = fs.statSync(pB);
  console.log('\n============================================================');
  console.log(`FILE: ${f}`);
  console.log(`  Current (ols):     size=${sA.size} bytes, modified=${sA.mtime.toISOString()}`);
  console.log(`  E:/backend_staging: size=${sB.size} bytes, modified=${sB.mtime.toISOString()}`);
  try {
    const diff = execSync(`git diff --no-index "${pB}" "${pA}"`, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
    console.log('  No textual diff (identical content)');
  } catch (err) {
    if (err.stdout) {
      const lines = err.stdout.split('\n');
      console.log(`  Diff: ${lines.length} lines total`);
      // Print first 20 lines of diff
      console.log(lines.slice(4, 25).join('\n'));
    }
  }
}

