import fs from 'fs';

const c = fs.readFileSync('frontend/stitch_pages/outlets-redesign.html', 'utf8');
const lines = c.split('\n');
console.log('Total lines:', lines.length);

lines.forEach((l, i) => {
  if (l.includes('grid-cols') || l.includes('outlet-card') || l.includes('card') && l.includes('rounded')) {
    console.log(`L${i+1}: ${l.trim().slice(0, 120)}`);
  }
});

