const fs = require('fs');
const path = require('path');

const adminJsPath = path.join(__dirname, 'public/admin/admin.js');
let code = fs.readFileSync(adminJsPath, 'utf8');

// 1. Remove duplicate maintenance chunk (which was causing double emails!)
const dupStart = code.indexOf('window.loadMaintenanceStats = async () => {');
if (dupStart > -1) {
    code = code.substring(0, dupStart);
}

// 2. Add Globals
const globals = `
window.showCustomAlert = (title, msg, isError = false, onDismiss = null) => {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); z-index:10000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); opacity:0; transition:opacity 0.2s ease-out;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#ffffff; padding:24px; border-radius:12px; max-width:400px; width:90%; box-shadow:0 20px 40px rgba(0,0,0,0.2); transform:translateY(20px); transition:transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); display:flex; flex-direction:column; align-items:center; text-align:center;';
  const iconColor = isError ? '#ef4444' : '#10b981';
  const iconBg = isError ? '#fee2e2' : '#d1fae5';
  const svgIcon = isError 
    ? \`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>\`
    : \`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>\`;
  box.innerHTML = \`<div style="width:48px; height:48px; border-radius:50%; background:\${iconBg}; color:\${iconColor}; display:flex; align-items:center; justify-content:center; margin-bottom:16px;">\${svgIcon}</div><h3 style="margin:0 0 8px 0; color:#0f172a; font-size:1.15rem; font-weight:600; font-family:Inter, sans-serif;">\${title}</h3><p style="margin:0 0 24px 0; color:#64748b; font-size:0.9rem; line-height:1.5; font-family:Inter, sans-serif;">\${msg}</p><button id="customAlertBtn" style="width:100%; padding:10px 0; border:none; background:\${iconColor}; color:white; border-radius:8px; cursor:pointer; font-weight:500; font-family:Inter, sans-serif; transition:all 0.15s; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">OK</button>\`;
  overlay.appendChild(box); document.body.appendChild(overlay);
  setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'translateY(0)'; }, 10);
  box.querySelector('#customAlertBtn').onclick = () => { overlay.style.opacity = '0'; box.style.transform = 'translateY(10px)'; setTimeout(() => overlay.remove(), 200); if (onDismiss) onDismiss(); };
};

window.showCustomConfirm = (title, msg, onConfirm, onCancel) => {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); opacity:0; transition:opacity 0.2s ease-out;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#ffffff; padding:24px; border-radius:12px; max-width:400px; width:90%; box-shadow:0 20px 40px rgba(0,0,0,0.2); transform:translateY(20px); transition:transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); display:flex; flex-direction:column; align-items:center; text-align:center;';
  box.innerHTML = \`<div style="width:48px; height:48px; border-radius:50%; background:#fee2e2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin-bottom:16px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><h3 style="margin:0 0 8px 0; color:#0f172a; font-size:1.15rem; font-weight:600; font-family:Inter, sans-serif;">\${title}</h3><p style="margin:0 0 24px 0; color:#64748b; font-size:0.9rem; line-height:1.5; font-family:Inter, sans-serif;">\${msg}</p><div style="display:flex; gap:12px; width:100%;"><button id="customCancelBtn" style="flex:1; padding:10px 0; border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:8px; cursor:pointer; font-weight:500; font-family:Inter, sans-serif; transition:all 0.15s;">Cancel</button><button id="customOkBtn" style="flex:1; padding:10px 0; border:none; background:#ef4444; color:white; border-radius:8px; cursor:pointer; font-weight:500; font-family:Inter, sans-serif; transition:all 0.15s; box-shadow:0 4px 6px -1px rgba(239,68,68,0.2);">Confirm</button></div>\`;
  overlay.appendChild(box); document.body.appendChild(overlay);
  setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'translateY(0)'; }, 10);
  const close = () => { overlay.style.opacity = '0'; box.style.transform = 'translateY(10px)'; setTimeout(() => overlay.remove(), 200); };
  box.querySelector('#customCancelBtn').onclick = () => { close(); if(onCancel) onCancel(); };
  box.querySelector('#customOkBtn').onclick = () => { close(); if(onConfirm) onConfirm(); };
};

window.customConfirmAsync = (title, msg) => {
  return new Promise(resolve => {
    window.showCustomConfirm(title, msg, () => resolve(true), () => resolve(false));
  });
};

window.alert = (msg) => {
  if (msg && (msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error'))) {
     window.showCustomAlert('Error', msg, true);
  } else {
     window.showCustomAlert('Notice', msg, false);
  }
};
\n`;

const insertIdx = code.indexOf('// ─── Auth Check ───');
if (insertIdx > -1) {
    code = code.slice(0, insertIdx) + globals + code.slice(insertIdx);
}

// 3. Make handleRestoreFileChange async
code = code.replace(/function handleRestoreFileChange\(e\)/g, 'async function handleRestoreFileChange(e)');

// 4. Overwrite ALL confirms globally with our async promise!
//   confirm(...)   ===>   (await window.customConfirmAsync('Confirmation required', ...))
code = code.replace(/confirm\(/g, "await window.customConfirmAsync('System Confirmation', ");

fs.writeFileSync(adminJsPath, code, 'utf8');
console.log('Refactor completely finished!');
