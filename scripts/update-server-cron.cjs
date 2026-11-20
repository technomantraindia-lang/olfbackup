const fs = require('fs');
let content = fs.readFileSync('server.main.ts', 'utf8');

// 1. Add import
if (!content.includes('fssaiReminderService')) {
  const importTarget = "import { runComplaintReminders } from './utils/complaint-reminders';";
  content = content.replace(importTarget, `${importTarget}\nimport { fssaiReminderService } from './services/fssai-reminder.service';`);
}

// 2. Add cron schedule
if (!content.includes('FSSAI 60-Day Expiry Auto-Alert')) {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex(l => l.includes('runComplaintReminders().catch'));
  if (idx !== -1) {
    // Find the closing }); of that cron
    let closeIdx = idx;
    while (closeIdx < lines.length && !lines[closeIdx].includes('});')) {
      closeIdx++;
    }
    lines.splice(closeIdx + 1, 0,
      '',
      '    // FSSAI 60-Day Expiry Auto-Alert: Runs daily at 09:00 AM IST.',
      '    cron.schedule(\'0 9 * * *\', () => {',
      '      fssaiReminderService.runDailyFssaiCheck().catch(error => console.error(\'[FSSAI cron] failed:\', error?.message || error));',
      '    }, {',
      '      scheduled: true,',
      '      timezone: "Asia/Kolkata"',
      '    });'
    );
    content = lines.join('\r\n');
  }
}

fs.writeFileSync('server.main.ts', content, 'utf8');
console.log('Successfully updated server.main.ts with FSSAI cron');
