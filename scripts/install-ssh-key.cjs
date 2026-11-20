const fs = require('fs');
const { spawnSync } = require('child_process');

const pubKey = fs.readFileSync('C:/Users/techn/.ssh/id_rsa.pub', 'utf8').trim();
const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "${pubKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo "KEY_INSTALLED"`;

const res = spawnSync('node', ['scripts/remote-exec.cjs', cmd], { encoding: 'utf8' });
console.log('Result:', res.stdout);
if (res.stderr) console.error('Stderr:', res.stderr);
