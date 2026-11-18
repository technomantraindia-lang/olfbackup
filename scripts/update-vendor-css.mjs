import fs from 'fs';

let css = fs.readFileSync('frontend/assets/vendors-directory.css', 'utf8');

const extraCss = `
/* =========================================================================
   OLF VENDOR CARDS & DETAILED VENDOR VIEW STYLES
   ========================================================================= */
.vendor-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 20px 24px;
}
@media (min-width: 1200px) {
  .vendor-cards-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 640px) {
  .vendor-cards-grid {
    grid-template-columns: 1fr;
    padding: 16px;
  }
}

.vd-card {
  background: var(--vd-panel);
  border: 1px solid var(--vd-line);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.vd-card:hover {
  border-color: #FF7A00;
  transform: translateY(-2px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.35);
}
html.light .vd-card:hover {
  box-shadow: 0 10px 25px -5px rgba(255, 122, 0, 0.15);
}

.vd-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.vd-card-avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: rgba(255, 122, 0, 0.12);
  border: 1px solid rgba(255, 122, 0, 0.25);
  color: #FF7A00;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}
.vd-card-title-wrap {
  min-width: 0;
  flex: 1;
}
.vd-card-id-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-data-mono, monospace);
  font-size: 10.5px;
  font-weight: 700;
  color: #FF7A00;
  background: rgba(255, 122, 0, 0.1);
  border: 1px solid rgba(255, 122, 0, 0.22);
  padding: 2px 7px;
  border-radius: 6px;
  margin-bottom: 4px;
}
.vd-card-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--vd-text);
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vd-card:hover .vd-card-name {
  color: #FF7A00;
}

.vd-card-body {
  background: var(--vd-bg);
  border: 1px solid var(--vd-line);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vd-card-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--vd-text);
  overflow: hidden;
}
.vd-card-field .material-symbols-outlined {
  font-size: 15px;
  flex-shrink: 0;
}
.vd-card-field-phone .material-symbols-outlined {
  color: #10B981;
}
.vd-card-field-email .material-symbols-outlined {
  color: #38BDF8;
}
.vd-card-field-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vd-card-field-empty {
  color: var(--vd-muted);
  font-style: italic;
}

.vd-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--vd-line);
}
.vd-card-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #FF7A00;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(255, 122, 0, 0.08);
  border: 1px solid rgba(255, 122, 0, 0.2);
  transition: all 0.15s ease;
}
.vd-card:hover .vd-card-action-btn {
  background: #FF7A00;
  color: #FFFFFF;
}

/* Detailed Vendor View */
.vd-detail-shell {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
`;

if (!css.includes('.vendor-cards-grid')) {
  css += '\n' + extraCss;
  fs.writeFileSync('frontend/assets/vendors-directory.css', css, 'utf8');
  console.log('Appended card styles to vendors-directory.css');
} else {
  console.log('Styles already present in vendors-directory.css');
}

