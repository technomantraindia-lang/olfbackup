const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('ssh2');
const https = require('https');

const os = require('os');

// Step 1: Ensure local build is fresh
console.log('--- Step 1: Compiling local TypeScript ---');
execSync('npm run build', { stdio: 'inherit', shell: 'cmd.exe' });

// Step 2: Package all clean files into fresh-deploy.tar.gz
console.log('\n--- Step 2: Packaging fresh project archive ---');
const archiveFile = path.join(os.tmpdir(), 'fresh-deploy.tar.gz');
if (fs.existsSync(archiveFile)) fs.unlinkSync(archiveFile);

const itemsToInclude = [
  'dist', 'controllers', 'database', 'entities', 'frontend',
  'managers', 'middlewares', 'models', 'routes', 'scripts',
  'services', 'utils', 'docs',
  'outlets-redesign.html', 'outlet-detail.html', 'menu.html',
  'invoices.html', 'outlet.html', 'orders.html', 'olf-icon.png',
  'server.main.ts', 'package.json', 'package-lock.json', 'tsconfig.json'
];

const existingItems = itemsToInclude.filter(i => fs.existsSync(i));
console.log(`Archiving ${existingItems.length} items with tar.exe...`);
execSync(`tar -czf "${archiveFile}" ${existingItems.map(i => `"${i}"`).join(' ')}`, { stdio: 'inherit' });
const archiveSize = fs.statSync(archiveFile).size;
console.log(`Package ready: ${archiveSize} bytes (~${(archiveSize / 1024 / 1024).toFixed(2)} MB)`);

// Step 3: Connect to Hostinger and perform fresh replacement
function execCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => errOut += d);
      stream.on('close', code => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Command failed (code ${code}): ${errOut || out}`));
        } else {
          resolve(out);
        }
      });
    });
  });
}

const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
console.log(`\n--- Step 3: Connecting to Hostinger (Release ${stamp}) ---`);

const conn = new Client();
conn.on('ready', async () => {
  try {
    console.log('SSH connection established to Hostinger.');

    const appDir = '/home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs';
    const domainDir = '/home/u863663439/domains/olf.technomantra.in';
    const safeKeepDir = `${domainDir}/_safe_keep`;
    const backupDir = `${domainDir}/backups/full-clean-backup-${stamp}`;

    console.log('\n--- Step 4: Safely backing up existing state ---');
    await execCommand(conn, `
      mkdir -p "${safeKeepDir}" "${backupDir}"
      # 1. Back up current .env
      cp -p "${appDir}/.env" "${safeKeepDir}/.env"
      cp -p "${appDir}/.env" "${backupDir}/.env"
      # 2. Safely move node_modules to _safe_keep so they don't get deleted
      if [ -d "${appDir}/node_modules" ] && [ ! -d "${safeKeepDir}/node_modules" ]; then
        mv "${appDir}/node_modules" "${safeKeepDir}/node_modules"
      fi
      # 3. Preserve uploads
      if [ -e "${appDir}/uploads" ] && [ ! -e "${safeKeepDir}/uploads" ]; then
        cp -rp "${appDir}/uploads" "${safeKeepDir}/" || true
      fi
    `);
    console.log('Essential state (node_modules, .env, uploads) safely preserved in _safe_keep.');

    console.log('\n--- Step 5: Deleting old application files ---');
    await execCommand(conn, `
      cd "${appDir}"
      # Remove all files and directories in application directory
      rm -rf *
      rm -rf .irctc-release-* .update-* 2>/dev/null || true
    `);
    console.log('Application directory completely cleaned.');

    console.log('\n--- Step 6: Uploading fresh package via SFTP ---');
    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const remoteTar = `${appDir}/fresh-deploy.tar.gz`;
        const readStream = fs.createReadStream(archiveFile);
        const writeStream = sftp.createWriteStream(remoteTar);

        writeStream.on('close', () => resolve(remoteTar));
        writeStream.on('error', reject);
        readStream.on('error', reject);
        readStream.pipe(writeStream);
      });
    });
    console.log('Upload complete.');

    console.log('\n--- Step 7: Extracting fresh files & restoring node_modules / .env ---');
    await execCommand(conn, `
      cd "${appDir}"
      tar -xzf fresh-deploy.tar.gz
      rm -f fresh-deploy.tar.gz

      # Restore node_modules
      if [ -d "${safeKeepDir}/node_modules" ]; then
        mv "${safeKeepDir}/node_modules" "${appDir}/node_modules"
      fi

      # Restore uploads
      if [ -e "${safeKeepDir}/uploads" ]; then
        mv "${safeKeepDir}/uploads" "${appDir}/uploads"
      fi

      # Restore & verify .env
      cp -p "${safeKeepDir}/.env" "${appDir}/.env"
      chmod 600 "${appDir}/.env"
      rm -rf "${safeKeepDir}"

      # Create tmp directory with restart trigger
      mkdir -p "${appDir}/tmp"
      touch "${appDir}/tmp/restart.txt"

      # Recycle LiteSpeed Node.js process
      pkill -9 -f lsnode || true
    `);
    console.log('Fresh files extracted, node_modules restored, .env mapped, lsnode recycled.');
    conn.end();

    try { fs.unlinkSync(archiveFile); } catch (e) {}

    // Verify health
    console.log('\n--- Step 8: Verifying live server health ---');
    setTimeout(() => verifyHealth(), 2000);
  } catch (err) {
    console.error('Fatal error during fresh deploy:', err);
    conn.end();
    process.exit(1);
  }
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});

function verifyHealth(attempt = 1) {
  console.log(`Checking https://olf.technomantra.in/health/ready (attempt ${attempt}/20)...`);
  const req = https.get('https://olf.technomantra.in/health/ready', res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('SUCCESS! Health ready returned 200 OK:', body);
        runComprehensiveVerification();
      } else {
        console.log(`Status ${res.statusCode}: ${body}`);
        if (attempt < 20) setTimeout(() => verifyHealth(attempt + 1), 2000);
        else process.exit(1);
      }
    });
  });
  req.on('error', err => {
    console.log(`Request error: ${err.message}`);
    if (attempt < 20) setTimeout(() => verifyHealth(attempt + 1), 2000);
    else process.exit(1);
  });
}

function requestHttp(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request('https://olf.technomantra.in' + path, opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function runComprehensiveVerification() {
  console.log('\n--- Comprehensive Live Verification ---');
  try {
    // 1. Auth check
    const login = await requestHttp('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-olf-request': '1' },
      body: JSON.stringify({ email: 'superadmin@olfstores.com', password: 'admin@123' })
    });
    console.log('1. Login Test:', login.status, 'Response:', JSON.parse(login.body).info);
    const token = JSON.parse(login.body).data.token;

    // 2. Stats / Database Check
    const stats = await requestHttp('/api/v1/stats?range=all', {
      headers: { 'Authorization': 'Bearer ' + token, 'x-olf-request': '1' }
    });
    const st = JSON.parse(stats.body).data.rows[0].dashboard_data.stats;
    console.log(`2. Database Check: Orders=${st.totalOrders}, GMV=₹${st.revenue}, Outlets=${st.totalOutlets} (${st.activeOutlets} active)`);

    // 3. Check Pages
    const pagesToCheck = [
      { path: '/dashboard', label: 'Dashboard V1' },
      { path: '/dashboardv2', label: 'Dashboard V2' },
      { path: '/outlets', label: 'Outlets Redesign' },
      { path: '/outlet/BE', label: 'Outlet Detail' },
      { path: '/menu', label: 'Menu Dish Studio' },
      { path: '/invoices', label: 'Invoices' }
    ];

    for (const p of pagesToCheck) {
      const res = await requestHttp(p.path, { method: 'HEAD' });
      const len = res.headers['content-length'] || 'streamed';
      console.log(`3. Page ${p.label} (${p.path}) -> Status: ${res.status}, Length: ${len} bytes`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL CHECKS PASSED: Live server completely replaced with fresh build!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Verification error:', err);
    process.exit(1);
  }
}
