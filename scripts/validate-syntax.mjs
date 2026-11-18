import fs from 'fs';
import vm from 'vm';

function validateScripts(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const scriptRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  console.log(`Checking scripts in ${filepath}...`);
  while ((match = scriptRegex.exec(content)) !== null) {
    index++;
    const code = match[1];
    // Skip empty or comment-only scripts
    if (!code.trim()) continue;
    try {
      new vm.Script(code);
      console.log(`  Script #${index}: VALID JS`);
    } catch (e) {
      console.error(`  Script #${index} ERROR:`, e.message);
    }
  }
}

validateScripts('frontend/stitch_pages/orders.html');
validateScripts('frontend/stitch_pages/outlet-detail.html');

