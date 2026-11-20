const fs = require('fs');
let html = fs.readFileSync('frontend/stitch_pages/outlet-detail.html', 'utf8');

// 1. Replace Hero Stat FSSAI card
const oldHeroFssai = `<div class="p-3 bg-[#111318] rounded-xl border border-white/5 flex items-center justify-between">
            <div>
              <div class="text-[11px] text-slate-400 uppercase font-semibold">FSSAI Status</div>
              <div id="hero-stat-fssai" class="text-xs font-bold font-mono text-emerald-400 mt-1">Verified</div>
            </div>
            <span class="material-symbols-outlined text-emerald-400 opacity-80 text-xl">verified</span>
          </div>`;

const newHeroFssai = `<div class="p-3 bg-[#111318] rounded-xl border border-white/5 flex flex-col justify-between">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-[11px] text-slate-400 uppercase font-semibold">FSSAI Expiry</div>
                <div id="hero-stat-fssai" class="text-xs font-bold font-mono text-emerald-400 mt-1">Verified</div>
              </div>
              <span id="hero-stat-fssai-icon" class="material-symbols-outlined text-emerald-400 opacity-80 text-xl">verified</span>
            </div>
            <div class="mt-2 pt-1 border-t border-white/5 flex items-center justify-between">
              <span id="fssai-badge-days" class="text-[10px] text-amber-400 font-medium">Auto-Alert (60d)</span>
              <button type="button" id="btn-fssai-remind" onclick="sendFssaiReminderManual()" title="Send WhatsApp & Email Renewal Alert" class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 inline-flex items-center gap-1 transition-all">
                <span class="material-symbols-outlined text-[12px]">notifications_active</span> Remind Owner
              </button>
            </div>
          </div>`;

if (html.includes(oldHeroFssai)) {
  html = html.replace(oldHeroFssai, newHeroFssai);
  console.log('✓ Replaced hero FSSAI card');
} else {
  console.log('Hero FSSAI card pattern not exact, searching line by line...');
  // Find lines
  const lines = html.split(/\r?\n/);
  const idx = lines.findIndex(l => l.includes('id="hero-stat-fssai"'));
  if (idx !== -1) {
    let start = idx;
    while (start > 0 && !lines[start].includes('<div class="p-3 bg-[#111318]')) start--;
    let end = idx;
    while (end < lines.length && !lines[end].includes('</div>') && !lines[end+1]?.includes('<div class="p-3 bg-[#111318]')) end++;
    end++; // include the closing </div>
    lines.splice(start, end - start + 1, newHeroFssai);
    html = lines.join('\r\n');
    console.log('✓ Replaced hero FSSAI card via index matching');
  }
}

// 2. Add button in Overview Tab next to info-fssai-expiry
const oldOverviewFssai = `<span class="font-mono font-semibold text-emerald-400 text-right"
                  id="info-fssai-expiry">--/--/----</span>`;

const newOverviewFssai = `<div class="flex items-center gap-2">
                  <span class="font-mono font-semibold text-emerald-400 text-right" id="info-fssai-expiry">--/--/----</span>
                  <button type="button" onclick="sendFssaiReminderManual()" title="Send FSSAI renewal notification" class="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/30 flex items-center gap-1 transition-all">
                    <span class="material-symbols-outlined text-[12px]">send</span> Alert Owner
                  </button>
                </div>`;

if (html.includes(oldOverviewFssai)) {
  html = html.replace(oldOverviewFssai, newOverviewFssai);
  console.log('✓ Added reminder button in Overview tab');
} else {
  console.log('Overview FSSAI pattern search...');
  html = html.replace(/<span[^>]*id="info-fssai-expiry"[^>]*>.*?<\/span>/s, newOverviewFssai);
  console.log('✓ Added reminder button in Overview tab via regex');
}

// 3. Add sendFssaiReminderManual JS function
if (!html.includes('function sendFssaiReminderManual')) {
  const jsFunction = `
    // FSSAI 60-Day Renewal Reminder Manual Trigger
    async function sendFssaiReminderManual() {
      const btn = document.getElementById('btn-fssai-remind');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined text-[12px] animate-spin">refresh</span> Sending…';
      }
      try {
        const res = await fetch('/api/v1/outlets/' + encodeURIComponent(currentOutletId) + '/fssai-reminder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OLF-Request': '1'
          }
        });
        const json = await res.json();
        if (!res.ok || json.status !== 1) throw new Error(json.info || 'Failed to send FSSAI reminder');

        const d = json.data;
        let msg = '✅ FSSAI Renewal Reminder Triggered!\\n\\n' +
                  'Restaurant: ' + d.outletName + '\\n' +
                  'FSSAI No: ' + d.fssaiNo + '\\n' +
                  'Expiry: ' + d.expiryStr + ' (' + (d.daysLeft < 0 ? Math.abs(d.daysLeft) + ' days ago EXPIRED' : d.daysLeft + ' days left') + ')\\n';

        if (d.emailSent) {
          msg += '📧 Email delivered to: ' + d.recipientEmail + '\\n';
        } else if (d.emailError) {
          msg += '⚠️ Email status: ' + d.emailError + '\\n';
        }

        if (d.whatsappUrl) {
          if (confirm(msg + '\\nClick OK to open WhatsApp and send the pre-composed reminder to owner (' + d.recipientPhone + ')')) {
            window.open(d.whatsappUrl, '_blank');
          }
        } else {
          alert(msg);
        }
      } catch (e) {
        alert('❌ Error: ' + e.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText || '<span class="material-symbols-outlined text-[12px]">notifications_active</span> Remind Owner';
        }
      }
    }
  `;

  // Insert before closing </script>
  const scriptEnd = html.lastIndexOf('</script>');
  if (scriptEnd !== -1) {
    html = html.slice(0, scriptEnd) + jsFunction + '\n  ' + html.slice(scriptEnd);
    console.log('✓ Added sendFssaiReminderManual JavaScript logic');
  }
}

fs.writeFileSync('frontend/stitch_pages/outlet-detail.html', html, 'utf8');
console.log('Done updating outlet-detail.html');
