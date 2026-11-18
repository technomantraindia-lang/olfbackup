const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const { Client } = require('ssh2');
const https = require('https');

// 1. First, compile TypeScript locally to ensure dist is 100% fresh
console.log('Compiling TypeScript locally...');
execSync('npm run build', { stdio: 'inherit', shell: 'cmd.exe' });
console.log('TypeScript compilation finished.');

// 2. Create tar.gz using native Windows tar
const tarGzPath = path.join(__dirname, 'latest-backend.tar.gz');
if (fs.existsSync(tarGzPath)) fs.unlinkSync(tarGzPath);

const dirsToAdd = ['dist', 'controllers', 'routes', 'models', 'middlewares', 'services', 'utils', 'database/migrations', 'server.main.ts', 'frontend'];
const existingDirs = dirsToAdd.filter(d => fs.existsSync(d));

console.log('Archiving with tar.exe...');
execSync(`tar -czf "${tarGzPath}" ${existingDirs.map(d => `"${d}"`).join(' ')}`, { stdio: 'inherit' });
console.log(`Archive created at: ${tarGzPath} (${fs.statSync(tarGzPath).size} bytes)`);

deploy(tarGzPath);

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

async function deploy(archiveFile) {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  console.log(`Starting deployment ${stamp} to Hostinger...`);

  const conn = new Client();
  conn.on('ready', async () => {
    try {
      console.log('SSH connection established.');

      const appDir = '/home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs';
      const backupDir = `/home/u863663439/domains/olf.technomantra.in/backups/backend-${stamp}`;

      console.log('Creating remote backup at:', backupDir);
      await execCommand(conn, `mkdir -p "${backupDir}" && cp -rp "${appDir}/dist" "${backupDir}/dist" && cp -rp "${appDir}/server.main.ts" "${backupDir}/server.main.ts" 2>/dev/null || true`);
      console.log('Backup created successfully. Uploading package via SFTP...');

      await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          const remoteTar = `${appDir}/.update-${stamp}.tar.gz`;
          const readStream = fs.createReadStream(archiveFile);
          const writeStream = sftp.createWriteStream(remoteTar);

          writeStream.on('close', () => resolve(remoteTar));
          writeStream.on('error', reject);
          readStream.on('error', reject);
          readStream.pipe(writeStream);
        });
      });

      console.log('Upload complete. Extracting package on remote...');
      const remoteTar = `${appDir}/.update-${stamp}.tar.gz`;
      await execCommand(conn, `cd "${appDir}" && tar -xzf "${remoteTar}" && rm -f "${remoteTar}" && touch "${appDir}/tmp/restart.txt" && pkill -9 -f lsnode || true`);
      console.log('Extracted & restart triggered.');
      conn.end();

      try { fs.unlinkSync(archiveFile); } catch (e) {}

      // Verify health
      setTimeout(() => verifyHealth(), 2000);
    } catch (err) {
      console.error('Deployment error:', err);
      conn.end();
      process.exit(1);
    }
  }).connect({
    host: '145.79.210.68',
    port: 65002,
    username: 'u863663439',
    password: 'Rashmi@saha1988'
  });
}

function verifyHealth(attempt = 1) {
  console.log(`Checking https://olf.technomantra.in/health/ready (attempt ${attempt}/20)...`);
  const req = https.get('https://olf.technomantra.in/health/ready', res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('SUCCESS! Health ready returned 200 OK:', body);
        console.log('Deployment completed successfully!');
        process.exit(0);
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
