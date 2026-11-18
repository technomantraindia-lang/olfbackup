import fs from 'fs';
import vm from 'vm';

console.log('Testing vendors-directory.js syntax...');
const js = fs.readFileSync('frontend/assets/vendors-directory.js', 'utf8');
try {
  new vm.Script(js);
  console.log('vendors-directory.js: SYNTAX VALID!');
} catch (e) {
  console.error('vendors-directory.js ERROR:', e);
}

console.log('Testing vendors.html inline scripts...');
const html = fs.readFileSync('frontend/stitch_pages/vendors.html', 'utf8');
const scriptRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  const code = match[1];
  if (!code.trim()) continue;
  try {
    new vm.Script(code);
    console.log('vendors.html inline script: SYNTAX VALID!');
  } catch (e) {
    console.error('vendors.html inline script ERROR:', e);
  }
}

