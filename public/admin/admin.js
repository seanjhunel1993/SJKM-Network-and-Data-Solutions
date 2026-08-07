// ─── GLOBAL AUTH INTERCEPTOR (Session Expiry Handler) ───
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch(...args);
            if (response.status === 401 && !window.location.pathname.endsWith('login.html')) {
                localStorage.clear();
                window.location.replace('login.html');
                return new Promise(() => {}); // Halt downstream execution during redirect
            }
            return response;
        } catch (error) {
            throw error;
        }
    };
})();

// ─── PREMIUM MODAL INJECTOR (Auto-Availability) ───
(function() {
    function injectModal() {
        if (document.getElementById('premiumModalOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'premiumModalOverlay';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="premium-modal">
                <div class="modal-icon-circle" id="modalIcon"></div>
                <h2 class="modal-title" id="modalTitle"></h2>
                <p class="modal-text" id="modalText"></p>
                <div class="modal-footer" id="modalFooter"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectModal);
    } else {
        injectModal();
    }
})();

// ─── COMPONENT LOADER ───
window.loadSidebar = async () => {
    const placeholder = document.getElementById('sidebar-placeholder');
    if (!placeholder) return;

    try {
        const res = await fetch('components/sidebar.html');
        if (!res.ok) throw new Error('Sidebar component not found');
        placeholder.innerHTML = await res.text();
        
        // 1. Re-apply Branding (Dynamic)
        const brand = localStorage.getItem('isp_brand_name');
        const logo = localStorage.getItem('isp_brand_logo');
        if (brand) {
            if (typeof window.applyBranding === 'function') {
                window.applyBranding(brand, logo);
            } else if (typeof applyBranding === 'function') {
                applyBranding(brand, logo);
            }
        }
        document.querySelectorAll('.logo-flicker-fix').forEach(el => el.classList.add('branding-ready'));

        // 2. Set Active State
        const pageName = window.location.pathname.split('/').pop() || 'network-map.html';
        document.querySelectorAll('.nav-item').forEach(link => {
            const href = link.getAttribute('href');
            if (href === pageName || (pageName === 'sales.html' && href === 'dashboard.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // 3. Dispatch Ready Event
        window.dispatchEvent(new Event('sidebarLoaded'));

    } catch (e) {
        console.error('UI Refactor Error:', e);
    }
};

// ─── GLOBAL LOGOUT HANDLER (Delegated) ───
document.addEventListener('click', async (e) => {
    const logoutBtn = e.target.closest('#logoutBtn');
    if (logoutBtn) {
        console.log('ðŸšª [LOGOUT] Sign out initiated...');
        try {
            await fetch('/api/admin/logout', { method: 'POST' });
            localStorage.clear(); // Clear branding cache to force refresh on next login
            window.location.replace('login.html');
        } catch (err) {
            console.error('Logout failed:', err);
            window.location.replace('login.html'); // Force redirect anyway
        }
    }
});

// ─── UNIFIED DISPATCH CONSOLE ───
window.switchBroadcastTab = (view) => {
    document.querySelectorAll('.broadcast-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.tab-scroller .tab-btn').forEach(b => b.classList.remove('active'));
    
    const viewEl = document.getElementById('viewBroadcast' + view.charAt(0).toUpperCase() + view.slice(1));
    if (viewEl) viewEl.style.display = 'block';
    
    const tabIdMap = { 'new': 'tabBtnNew', 'history': 'tabBtnHistory', 'logs': 'tabBtnLogs' };
    document.getElementById(tabIdMap[view])?.classList.add('active');
    
    if (view === 'logs') window.loadDispatchFeed();
    if (view === 'history') window.loadBroadcastHistory();
};
window.getLocalDateStr = (date = new Date()) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
};

window.safeParseDate = (str) => {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
};

// ─── LIVE DATA SYNCHRONIZATION (Cross-Tab Updates) ───
window.broadcastUpdate = (type) => {
    localStorage.setItem('sys_sync_trigger', JSON.stringify({ type, ts: Date.now() }));
};

window.addEventListener('storage', (e) => {
    if (e.key === 'sys_sync_trigger') {
        try {
            const update = JSON.parse(e.newValue);
            if (window.loadDashboard) window.loadDashboard();
            if (window.loadClientsTable) window.loadClientsTable();
            if (window.loadSales) window.loadSales();
            if (window.loadSOA) window.loadSOA();
            if (window.loadSalesSummary) window.loadSalesSummary();
            if (window.loadSalesOverview) window.loadSalesOverview();
        } catch (err) {}
    }
});

window.loadDispatchFeed = async () => {
  const tbody = document.getElementById('dispatchFeedTbody');
  if (!tbody) return;
  
  try {
    const res = await fetch('/api/admin/]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]maintenance/sms/logs');
    if (!res.ok) throw new Error('Logs not found');
    const logs = await res.json();
    
    if (!Array.isArray(logs)) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim)">No active dispatch records</td></tr>';
      return;
    }
    tbody.innerHTML = logs.slice(0, 50).map(l => {
      let statusClass = 'pending';
      if (l.status === 'SENT' || l.status === 'DELIVERED') statusClass = 'sent';
      if (l.status && (l.status.includes('ERROR') || l.status === 'FAILED')) statusClass = 'error';
      
      return `
        <tr class="feed-item">
          <td style="padding:12px;"><strong>${l.recipient}</strong></td>
          <td style="padding:12px;"><span style="font-size:0.7rem; color:var(--text-dim)">SMS</span></td>
          <td style="padding:12px;"><span class="badge-status badge-${statusClass}">${l.status}</span></td>
          <td style="padding:12px; text-align:right; color:var(--text-dim)">${new Date(l.created_at).toLocaleTimeString()}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim)">No active dispatch records</td></tr>';
  } catch (e) {
    console.warn('Feed load failed', e);
  }
};

window.formatDate = (dateStr) => {
  const notSetLabel = `<span style="color:var(--text-dim); font-style:italic">NOT SET</span>`;
  if (!dateStr || dateStr === "" || dateStr === "null" || dateStr.includes("NaN")) return notSetLabel;
  
  const d = window.safeParseDate(dateStr);
  if (!d || isNaN(d.getTime())) return notSetLabel;
  
  // Live Calendar Display (e.g. Apr 4, 2026)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

window.formatDateTime = (dateStr) => {
  const notSetLabel = `<span style="color:var(--text-dim); font-style:italic">NOT SET</span>`;
  if (!dateStr || dateStr === "" || dateStr === "null" || dateStr.includes("NaN")) return notSetLabel;
  
  const d = window.safeParseDate(dateStr);
  if (!d || isNaN(d.getTime())) return notSetLabel;
  
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
};

// 🛡️ Robust Date Parser: Handles ISO, MM/DD/YYYY, and YYYY-MM-DD
window.safeParseDate = (dateStr) => {
  if (!dateStr) return null;
  let d;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts[2].length === 4) { // MM/DD/YYYY
       d = new Date(parts[2], parts[0]-1, parts[1], 12, 0, 0);
    } else { // YYYY/MM/DD
       d = new Date(parts[0], parts[1]-1, parts[2], 12, 0, 0);
    }
  } else if (dateStr.includes('T')) {
    d = new Date(dateStr);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, day] = dateStr.split('-');
    d = new Date(y, m-1, day, 12, 0, 0);
  } else {
    d = new Date(dateStr);
  }
  return isNaN(d.getTime()) ? null : d;
};


window.showCustomAlert = (title, msg, isError = false, onDismiss = null) => {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); z-index:10000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); opacity:0; transition:opacity 0.2s ease-out;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#ffffff; padding:24px; border-radius:12px; max-width:400px; width:90%; box-shadow:0 20px 40px rgba(0,0,0,0.2); transform:translateY(20px); transition:transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); display:flex; flex-direction:column; align-items:center; text-align:center;';
  const iconColor = isError ? '#ef4444' : '#10b981';
  const iconBg = isError ? '#fee2e2' : '#d1fae5';
  const svgIcon = isError 
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  box.innerHTML = `<div style="width:48px; height:48px; border-radius:50%; background:${iconBg}; color:${iconColor}; display:flex; align-items:center; justify-content:center; margin-bottom:16px;">${svgIcon}</div><h3 style="margin:0 0 8px 0; color:#0f172a; font-size:1.15rem; font-weight:600; font-family:Inter, sans-serif;">${title}</h3><p style="margin:0 0 24px 0; color:#64748b; font-size:0.9rem; line-height:1.5; font-family:Inter, sans-serif;">${msg}</p><button id="customAlertBtn" style="width:100%; padding:10px 0; border:none; background:${iconColor}; color:white; border-radius:8px; cursor:pointer; font-weight:500; font-family:Inter, sans-serif; transition:all 0.15s; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">OK</button>`;
  overlay.appendChild(box); document.body.appendChild(overlay);
  setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'translateY(0)'; }, 10);
  box.querySelector('#customAlertBtn').onclick = () => { overlay.style.opacity = '0'; box.style.transform = 'translateY(10px)'; setTimeout(() => overlay.remove(), 200); if (onDismiss) onDismiss(); };
};

window.showCustomConfirm = (title, msg, onConfirm, onCancel) => {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); opacity:0; transition:opacity 0.2s ease-out;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#ffffff; padding:24px; border-radius:12px; max-width:400px; width:90%; box-shadow:0 20px 40px rgba(0,0,0,0.2); transform:translateY(20px); transition:transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); display:flex; flex-direction:column; align-items:center; text-align:center;';
  box.innerHTML = `<div style="width:48px; height:48px; border-radius:50%; background:#fee2e2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin-bottom:16px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><h3 style="margin:0 0 8px 0; color:#0f172a; font-size:1.15rem; font-weight:600; font-family:Inter, sans-serif;">${title}</h3><p style="margin:0 0 24px 0; color:#64748b; font-size:0.9rem; line-height:1.5; font-family:Inter, sans-serif;">${msg}</p><div style="display:flex; gap:12px; width:100%;"><button id="customCancelBtn" style="flex:1; padding:10px 0; border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:8px; cursor:pointer; font-weight:500; font-family:Inter, sans-serif; transition:all 0.15s;">Cancel</button><button id="customOkBtn" style="flex:1; padding:10px 0; border:none; background:#ef4444; color:white; border-radius:8px; cursor:pointer; font-weight:500; font-family:Inter, sans-serif; transition:all 0.15s; box-shadow:0 4px 6px -1px rgba(239,68,68,0.2);">Confirm</button></div>`;
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

// ─── Auth Check & Live Calendar Sync ───
(async () => {
  try {
    // Sync with Live Calendar (Server Time)
    const timeRes = await fetch('/api/admin/system/time').catch(() => null);
    if (timeRes && timeRes.ok) {
        const timeData = await timeRes.json();
        window.serverToday = timeData.today; // YYYY-MM-DD
        window.serverDisplay = timeData.display;
        console.log(`🕒 Live Calendar Synced: ${window.serverDisplay}`);
    } else {
        window.serverToday = new Date().toISOString().split('T')[0];
    }

    // Global Admin Branding - with instant zero-flash caching
    const applyBranding = (name, logoUrl) => {
      if (document.title.includes('|')) {
        document.title = document.title.split('|')[0] + '| ' + name + ' Admin';
      }
      
      const mainEl = document.getElementById('sidebarBrandName');
      if (mainEl) {
        mainEl.textContent = name;
        if (name.length > 20) {
          mainEl.style.fontSize = '1.05rem';
        } else if (name.length > 15) {
          mainEl.style.fontSize = '1.18rem';
        } else {
          mainEl.style.fontSize = '1.35rem';
        }
      }

      const brandSubEl = document.getElementById('sidebarBrandSub');
      if (brandSubEl) {
        if (name && name.toUpperCase().includes('SJKM NETWORK DATA LINK')) {
          brandSubEl.textContent = 'NETWORK AND DATA SOLUTION';
          brandSubEl.style.display = 'block';
        } else {
          brandSubEl.textContent = '';
          brandSubEl.style.display = 'none';
        }
      } else {
        const brandEls = document.querySelectorAll('#sidebarBrandName, #brandText, .sidebar-brand h2');
        brandEls.forEach(el => el.textContent = name);
      }

      // Dynamically update print layout headers if present
      const printBrandName = document.getElementById('printBrandName');
      if (printBrandName) printBrandName.textContent = name;

      const printBrandSub = document.getElementById('printBrandSub');
      if (printBrandSub) {
        if (name && name.toUpperCase().includes('SJKM NETWORK DATA LINK')) {
          printBrandSub.textContent = 'NETWORK AND DATA SOLUTION';
          printBrandSub.style.display = 'block';
        } else {
          printBrandSub.textContent = '';
          printBrandSub.style.display = 'none';
        }
      }
      
      const mobileHeader = document.querySelector('.mobile-header h1 .brand-text');
      if (mobileHeader) {
        mobileHeader.textContent = name + ' ';
      }

      if (logoUrl) {
        const logoContainers = document.querySelectorAll('.login-logo, .sidebar-logo');
        logoContainers.forEach(container => {
          container.innerHTML = `<img src="${logoUrl}" alt="Logo">`;
        });
      }

      // Reveal branding with transition
      document.querySelectorAll('.logo-flicker-fix').forEach(el => el.classList.add('branding-ready'));
    };
    window.applyBranding = applyBranding;

    const cachedBrand = localStorage.getItem('isp_brand_name');
    const cachedLogo = localStorage.getItem('isp_brand_logo');
    if (cachedBrand) applyBranding(cachedBrand, cachedLogo);

    const brandRes = await fetch('/api/public/branding').catch(() => null);
    if (brandRes && brandRes.ok) {
      const b = await brandRes.json();
        if (b.company_name) {
          localStorage.setItem('isp_brand_name', b.company_name);
          localStorage.setItem('isp_brand_logo', b.hero_logo_url || '');
          if (b.company_name !== cachedBrand || b.hero_logo_url !== cachedLogo) {
            applyBranding(b.company_name, b.hero_logo_url);
          }
        }
    } else {
        // Safety reveal if fetch fails and no cache
        document.querySelectorAll('.logo-flicker-fix').forEach(el => el.classList.add('branding-ready'));
    }

    const res = await fetch('/api/admin/session');
    const data = await res.json();
    if (!data.loggedIn && !window.location.pathname.includes('login')) {
      window.location.href = 'login.html';
      return;
    }
    if (data.loggedIn && document.getElementById('adminName')) {
      const fullName = data.user.fullName;
      localStorage.setItem('isp_admin_name', fullName);
      document.getElementById('adminName').textContent = fullName;
      
      // Inject Version Badge
      const meta = document.getElementById('adminName').parentElement;
      if (meta && !document.getElementById('systemVersion')) {
        meta.insertAdjacentHTML('beforeend', `<span id="systemVersion" class="version-badge">v4.5.1 PRO</span>`);
      }
      
      const avatar = document.getElementById('adminName').closest('.admin-info')?.querySelector('.admin-avatar');
      if (avatar) avatar.textContent = fullName.charAt(0).toUpperCase();
      
      // Initial global badge sync
      window.syncGlobalBadges();
      // Periodic update every 60 seconds
      setInterval(window.syncGlobalBadges, 60000);
    }
  } catch (e) {
    if (!window.location.pathname.includes('login')) {
      window.location.href = 'login.html';
    }
  }
})();

// Global Sidebar Badge Sync
window.syncGlobalBadges = async function() {
  try {
    const res = await fetch('/api/admin/dashboard?badge_only=1&_t=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    
    // Updates global badges provided in any page including admin.js
    if (typeof updateBadge === 'function') {
      updateBadge('navAppBadge', data.stats?.pendingApps || 0);
      updateBadge('navTicketBadge', data.stats?.openTickets || 0);
      updateBadge('navProofBadge', data.stats?.pendingProofsCount || 0);
    }
  } catch (err) {
    console.warn('Silent badge sync failure');
  }
};

// ─── Sidebar Toggle (Mobile) ───
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });
}

if (overlay) {
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });
}

// ─── Logout logic moved to loadSidebar component loader ───
// ─── System Heartbeat & Recovery Management ───
let isRecoveryModalOpen = false;
let discoveryInterval = null;

async function checkMikrotikHeartbeat() {
  try {
    const res = await fetch('/api/admin/system/status');
    if (!res.ok) return;
    const data = await res.json();
    
    const alertBanner = document.getElementById('connAlert');
    if (data.mikrotikDisabled) {
      if (alertBanner) alertBanner.style.display = 'none';
      const syncBtn = document.getElementById('syncMikrotikBtn');
      if (syncBtn) syncBtn.style.display = 'none';
      const navDash = document.getElementById('navDashboard');
      if (navDash) navDash.style.display = 'none';
    } else if (data.mikrotik && data.mikrotik.connected === false) {
      if (alertBanner) alertBanner.style.display = 'flex';
      document.getElementById('currentHost').textContent = data.mikrotik.host || 'Unknown';
      const syncBtn = document.getElementById('syncMikrotikBtn');
      if (syncBtn) syncBtn.style.display = 'inline-flex';
      const navDash = document.getElementById('navDashboard');
      if (navDash) navDash.style.display = 'flex';
    } else {
      if (alertBanner) alertBanner.style.display = 'none';
      const syncBtn = document.getElementById('syncMikrotikBtn');
      if (syncBtn) syncBtn.style.display = 'inline-flex';
      const navDash = document.getElementById('navDashboard');
      if (navDash) navDash.style.display = 'flex';
    }
  } catch (err) {
    console.warn('Heartbeat check failed');
  }
}

// Start polling every 10 seconds
// setInterval(checkMikrotikHeartbeat, 10000);
// checkMikrotikHeartbeat(); // Initial check

window.openRecoveryModal = function() {
  document.getElementById('recoveryModal').style.display = 'flex';
  isRecoveryModalOpen = true;
  startRecoveryDiscovery();
};

window.closeRecoveryModal = function() {
  document.getElementById('recoveryModal').style.display = 'none';
  isRecoveryModalOpen = false;
  if (discoveryInterval) clearInterval(discoveryInterval);
};

async function startRecoveryDiscovery() {
  const container = document.getElementById('recoveryDiscoveryList');
  container.innerHTML = '<div style="padding: 1rem; text-align:center; color: var(--text-muted);"><div class="spinner" style="display:inline-block; margin-right:8px;"></div>Scanning for neighbors...</div>';

  // Proactively trigger a "Hey, who is there?" signal on the network
  fetch('/api/admin/system/mikrotik/discover-trigger', { method: 'POST' }).catch(() => {});

  const fetchNeighbors = async () => {
    try {
      const res = await fetch('/api/setup/discover');
      const neighbors = await res.json();
      
      if (!isRecoveryModalOpen) return;
      
      if (neighbors.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; text-align:center; color: var(--text-muted);">No routers detected. Make sure the router is on the same network.</div>';
        return;
      }

      container.innerHTML = neighbors.map(n => `
        <div class="neighbor-item" onclick="selectNeighbor('${n.ip}')">
          <div class="neighbor-info">
            <h4>${n.identity || 'MikroTik'}</h4>
            <span>${n.ip} • ${n.model || n.platform || ''} • ${n.version || ''}</span>
          </div>
          <button class="btn-select-mini">Select</button>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<div style="padding: 1rem; text-align:center; color: var(--danger);">Discovery failed. Check server logs.</div>';
    }
  };

  fetchNeighbors();
  discoveryInterval = setInterval(fetchNeighbors, 5000);
}

window.selectNeighbor = function(ip) {
  document.getElementById('recoverHost').value = ip;
};

window.submitRecovery = async function() {
  const btn = document.getElementById('btnRecoverSave');
  const payload = {
    host: document.getElementById('recoverHost').value.trim(),
    user: document.getElementById('recoverUser').value.trim(),
    pass: document.getElementById('recoverPass').value
  };

  if (!payload.host || !payload.user) {
    window.showCustomAlert('Missing Fields', 'Router IP Address and API User are required.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connecting...';

  try {
    const res = await fetch('/api/admin/system/mikrotik/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok) {
      closeRecoveryModal();
      checkMikrotikHeartbeat();
      window.showCustomAlert('Connected!', '✅ MikroTik reconnection successful. Real-time monitoring is now active.', false);
    } else {
      const script = `/ip service enable api\n/ip service set api port=8728\n/user add name=${payload.user} password=${payload.pass || 'your_password'} group=full comment="ISP Monitor Recovery"`;

      window.showCustomConfirm(
        'Connection Failed',
        'Settings were saved, but the connection failed. This usually means the MikroTik API is disabled or the password is wrong.\n\nCopy a "Self-Heal" script to fix it? (Paste into WinBox Terminal)',
        () => {
          navigator.clipboard.writeText(script).then(() => {
            window.showCustomAlert('Script Copied!', '✅ Paste it into WinBox → New Terminal to enable the API.', false);
          }).catch(() => {
            window.showCustomAlert('Copy Failed', 'Could not copy to clipboard. Please copy manually:\n\n' + script, true);
          });
        },
        null
      );
    }
  } catch (err) {
    window.showCustomAlert('Server Error', '❌ Could not reach the server. Please check that the system is running.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update & Reconnect';
  }
};

// ─── Global UI Initialization ───
document.addEventListener('DOMContentLoaded', async () => {
  if (window.location.pathname.includes('login')) return;

  // 1. Load Components (Non-blocking)
  window.loadSidebar();

  const settingsHtml = `
  <div class="modal" id="globalSettingsModal" style="display:none; z-index:9999;">
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0;">System Settings</h2>
        <button class="btn-icon" id="closeSettingsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div style="padding: 24px;">
        <div style="display:flex; gap:16px; margin-bottom:24px; border-bottom:1px solid var(--border);">
          <button id="tabProfile" style="background:none; border:none; color:var(--text); padding-bottom:8px; border-bottom:2px solid var(--primary); cursor:pointer; font-weight:600;">Admin Profile</button>
          <button id="tabSecurity" style="background:none; border:none; color:var(--text-muted); padding-bottom:8px; border-bottom:2px solid transparent; cursor:pointer;">Security</button>
        </div>
        
        <div id="settingsProfileView">
           <form id="formProfile" autocomplete="off">
             <div class="form-group">
               <label>Full Name</label>
               <input type="text" id="profName" class="form-control" required/>
             </div>
             <div class="form-group" style="margin-top:16px;">
               <label>Recovery Email <small style="color:var(--text-muted)">(Used for OTPs)</small></label>
               <div style="display:flex; gap:8px;">
                 <input type="email" id="profEmail" class="form-control" readonly title="Click 'Change Email' to modify" style="background:var(--bg-main); color:var(--text-muted); cursor:not-allowed;" required/>
                 <button type="button" id="btnChangeEmailFlow" class="btn btn-secondary" style="white-space:nowrap;">Change Email</button>
               </div>
             </div>
             <button type="submit" class="btn btn-primary" style="width:100%; margin-top:24px;">Save Profile</button>
           </form>
           
           <div id="settingsEmailChangeView" style="display:none; margin-top: 16px;">
             <h3 style="margin-top:0; margin-bottom:12px;">Change Recovery Email</h3>
             
             <!-- Step 1 -->
             <div id="emailStep1">
               <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">Confirm your current registered email to receive an authorization OTP.</p>
               <div class="form-group">
                 <label>Current Registered Email</label>
                 <input type="email" id="emCurrentEmail" class="form-control" />
               </div>
               <button id="btnEmReqCurrentOtp" class="btn btn-primary" style="width:100%; margin-top:16px;">Send OTP to Current Email</button>
             </div>

             <!-- Step 2 -->
             <div id="emailStep2" style="display:none;">
               <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">An OTP was sent to your current email (Check terminal if DEV MODE). Expires in 5 mins.</p>
               <div class="form-group">
                 <label>6-Digit OTP</label>
                 <input type="text" id="emCurrentOtp" class="form-control" placeholder="123456" />
               </div>
               <button id="btnEmVerifyCurrent" class="btn btn-primary" style="width:100%; margin-top:16px;">Verify OTP</button>
             </div>

             <!-- Step 3 -->
             <div id="emailStep3" style="display:none;">
               <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">Authorization successful. Enter your new recovery email address.</p>
               <div class="form-group">
                 <label>New Recovery Email</label>
                 <input type="email" id="emNewEmail" class="form-control" />
               </div>
               <button id="btnEmReqNewOtp" class="btn btn-primary" style="width:100%; margin-top:16px;">Send OTP to New Email</button>
             </div>

             <!-- Step 4 -->
             <div id="emailStep4" style="display:none;">
               <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">An OTP was sent to your new email. Enter it below to finalize the change.</p>
               <div class="form-group">
                 <label>6-Digit OTP</label>
                 <input type="text" id="emNewOtp" class="form-control" placeholder="123456" />
               </div>
               <button id="btnEmVerifyNew" class="btn btn-primary" style="width:100%; margin-top:16px;">Verify & Confirm New Email</button>
             </div>

             <button id="btnCancelEmailFlow" class="btn btn-secondary" style="width:100%; margin-top:8px;">Cancel Process</button>
           </div>
        </div>

        <div id="settingsSecurityView" style="display:none;">
          <div id="secStep1">
            <h3 style="margin-top:0; margin-bottom:8px;">Change Password</h3>
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">Enter your current password to receive a 6-digit OTP via email.</p>
            <div class="form-group">
              <label>Current Password</label>
              <input type="text" id="secCurrentPass" class="form-control" />
            </div>
            <button id="btnRequestOtp" class="btn btn-primary" style="width:100%; margin-top:16px;">Send OTP to Email</button>
          </div>

          <div id="secStep2" style="display:none;">
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">An OTP was sent to your email. It expires in 5 minutes.</p>
            <div class="form-group">
              <label>6-Digit OTP</label>
              <input type="text" id="secOtp" class="form-control" placeholder="123456" />
            </div>
            <div class="form-group" style="margin-top:16px">
              <label>New Password</label>
              <input type="text" id="secNewPass" class="form-control" />
            </div>
            <div class="form-group" style="margin-top:16px">
              <label>Confirm New Password</label>
              <input type="text" id="secConfirmPass" class="form-control" />
            </div>
            <button id="btnVerifyOtp" class="btn btn-primary" style="width:100%; margin-top:24px;">Verify & Change Password</button>
            <button id="btnCancelOtp" class="btn btn-secondary" style="width:100%; margin-top:8px;">Cancel</button>
          </div>
        </div>

        </div>

        </div>
      </div>
    </div>
  </div>`;
  
  document.body.insertAdjacentHTML('beforeend', settingsHtml);

  const setModal = document.getElementById('globalSettingsModal');
  const tProf = document.getElementById('tabProfile');
  const tSec = document.getElementById('tabSecurity');
  const vProf = document.getElementById('settingsProfileView');
  const vSec = document.getElementById('settingsSecurityView');

  // Attach Settings listener (Wait for Sidebar to load)
  // Attach Admin Profile listener to the admin-info footer card
  window.addEventListener('sidebarLoaded', () => {
    const adminInfo = document.querySelector('.admin-info');
    if (adminInfo) {
      adminInfo.style.cursor = 'pointer';
      adminInfo.setAttribute('title', 'Admin Profile & Security');
      
      // Add a hover background color class dynamically or inline styles for UX feedback
      adminInfo.addEventListener('mouseenter', () => {
        adminInfo.style.background = 'rgba(255, 255, 255, 0.08)';
      });
      adminInfo.addEventListener('mouseleave', () => {
        adminInfo.style.background = 'rgba(255, 255, 255, 0.03)';
      });

      adminInfo.addEventListener('click', async (e) => {
        e.preventDefault();
        setModal.style.display = 'flex';
        // Convert input types to password
        const cPass = document.getElementById('secCurrentPass');
        const nPass = document.getElementById('secNewPass');
        const cfPass = document.getElementById('secConfirmPass');
        if (cPass) cPass.type = 'password';
        if (nPass) nPass.type = 'password';
        if (cfPass) cfPass.type = 'password';
        try {
          const rp = await fetch('/api/admin/profile');
          const dp = await rp.json();
          if(dp.success) {
            document.getElementById('profName').value = dp.profile.full_name || '';
            document.getElementById('profEmail').value = dp.profile.email || '';
          }
        } catch(err){}
      });
    }
  });

  // Helper to fetch actual profiles from MikroTik
  window.fetchMikrotikProfiles = async (targetSelectId, btnEl) => {
      const select = document.getElementById(targetSelectId);
      const btn = btnEl || document.querySelector(`button[onclick*="${targetSelectId}"]`);
      const originalHtml = btn ? btn.innerHTML : null;
      
      try {
          if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
          }
          
          const res = await fetch('/api/admin/mikrotik/profiles');
          if (!res.ok) throw new Error('Router unreachable');
          const data = await res.json();
          
          if (data && data.profiles) {
              console.log('Router Profiles:', data.profiles);
              
              // Get the value that SHOULD be selected (from attribute or current selection)
              const savedValue = select.getAttribute('data-saved-val');
              const currentValue = select.value;
              const targetValue = savedValue || currentValue;
              
              // Clear and rebuild
              while (select.firstChild) select.removeChild(select.firstChild);
              
              data.profiles.forEach(p => {
                  const pName = typeof p === 'string' ? p : p.name;
                  if (pName) {
                      const opt = document.createElement('option');
                      opt.value = pName;
                      opt.textContent = pName;
                      select.appendChild(opt);
                  }
              });
              
              // Force selection of the target value
              if (targetValue) {
                  select.value = targetValue;
                  console.log(`Force set profile to: ${targetValue}`);
              }
              
              // No more blocky popups.
              console.log(`✅ Success: ${data.profiles.length} profiles synchronized.`);
          }
      } catch (err) {
          if (btn) window.showError('Fetch Failed', 'Ensure your MikroTik is connected and the API is enabled.');
      } finally {
          if (btn && originalHtml) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
          }
      }
  };

  document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
    setModal.style.display = 'none';
    const cPass = document.getElementById('secCurrentPass');
    const nPass = document.getElementById('secNewPass');
    const cfPass = document.getElementById('secConfirmPass');
    if (cPass) cPass.type = 'text';
    if (nPass) nPass.type = 'text';
    if (cfPass) cfPass.type = 'text';
  });

  const tPlans = document.getElementById('tabPlans');
  const vPlans = document.getElementById('settingsPlansView');

  const resetTabs = () => {
    [tProf, tSec].forEach(t => {
      if(!t) return;
      t.style.borderBottomColor = 'transparent';
      t.style.color = 'var(--text-muted)';
      t.style.fontWeight = 'normal';
    });
    [vProf, vSec].forEach(v => { if(v) v.style.display = 'none'; });
  };

  tProf?.addEventListener('click', () => {
    resetTabs();
    tProf.style.borderBottomColor = 'var(--primary)'; tProf.style.color = 'var(--text)'; tProf.style.fontWeight = '600';
    vProf.style.display = 'block';
  });

  tSec?.addEventListener('click', () => {
    resetTabs();
    tSec.style.borderBottomColor = 'var(--primary)'; tSec.style.color = 'var(--text)'; tSec.style.fontWeight = '600';
    vSec.style.display = 'block';
  });

  // ─── Manual Billing Demonstration Trigger ───
  document.getElementById('btnRunBillingScan')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!await window.customConfirmAsync('System Confirmation', 'Are you sure you want to run the Billing Scanner now? This will send professional emails to all clients due in 15, 3, or 0 days.')) return;
    
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:8px;animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Processing Checks...`;
    
    try {
      const res = await fetch('/api/admin/system/run-billing-checks', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        window.showCustomAlert('Automation Success', 'Daily Billing Checks completed! Emails have been sent to eligible clients and logged in Event History.', false);
        if (window.loadDashboard) window.loadDashboard();
      } else {
        window.showCustomAlert('Automation Failed', data.error || 'Server error during billing scan.', true);
      }
    } catch (err) {
      window.showCustomAlert('Error', 'Could not reach server to trigger billing scan.', true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  // ─── Backup & Restore Logic ───
  document.getElementById('btnMainBackup')?.addEventListener('click', () => {
    window.location.href = '/api/admin/backup';
  });

  document.getElementById('btnDownloadBackup')?.addEventListener('click', () => {
    window.location.href = '/api/admin/backup';
  });

  const restoreInput = document.getElementById('mainRestoreInput') || document.getElementById('restoreFileInput');
  const btnRestore = document.getElementById('btnMainRestore') || document.getElementById('btnTriggerRestore');
  
  if (btnRestore && restoreInput) {
    btnRestore.addEventListener('click', () => {
      restoreInput.click();
    });
  }

  async function executeRestore(backupData) {
    try {
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      });
      const data = await res.json();
      if (data.success) {
        window.showCustomAlert('System Restored', 'Database restored successfully! Keep up the good work. The system will now reload.', false, () => {
          window.location.reload();
        });
      } else {
        window.showCustomAlert('Restore Failed', data.error, true);
      }
    } catch (err) { window.showCustomAlert('Error', err.message, true); }
  }

  async function handleRestoreFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!await window.customConfirmAsync('System Confirmation', 'Are you sure you want to RESTORE from this file? This will overwrite ALL current data!')) {
      e.target.value = '';
      return;
    }

    const fileName = file.name.toLowerCase();

    // ─── Case 1: SQLite Database File (.sqlite) ───
    if (fileName.endsWith('.sqlite')) {
      const formData = new FormData();
      formData.append('backupFile', file);

      try {
        const res = await fetch('/api/admin/restore-sqlite', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          window.showCustomAlert('System Restored', 'SQLite Database replaced successfully! The system will now reload.', false, () => {
            window.location.reload();
          });
        } else {
          window.showCustomAlert('Restore Failed', data.error, true);
        }
      } catch (err) { window.showCustomAlert('Error', err.message, true); }
      e.target.value = '';
      return;
    }

    // ─── Case 2: Legacy JSON Backup (.json) ───
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target.result);
        if (!backupData.clients && !backupData.payments) throw new Error('Invalid JSON backup file');
        await executeRestore(backupData);
      } catch (err) {
        window.showCustomAlert('Parse Error', 'Error parsing backup file: ' + err.message, true);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  if (restoreInput) {
    restoreInput.addEventListener('change', handleRestoreFileChange);
  }

  // Support stats loading
  const hasMaintenanceStats = document.getElementById('statDbSize') || document.getElementById('statNodeVersion');
  if (hasMaintenanceStats) {
     fetch('/api/admin/maintenance/stats')
      .then(r => r.json())
      .then(d => {
         if (document.getElementById('statNodeVersion')) document.getElementById('statNodeVersion').textContent = d.nodeVersion;
         if (document.getElementById('statDbSize')) document.getElementById('statDbSize').textContent = d.dbSize;
         if (document.getElementById('statLastBackup')) document.getElementById('statLastBackup').textContent = d.lastBackup;
         if (document.getElementById('statRamUsage')) document.getElementById('statRamUsage').textContent = d.ramUsage;
         if (document.getElementById('statUptime')) document.getElementById('statUptime').textContent = d.uptime;
      })
      .catch(err => console.log('Could not load stats', err));
  }

  // ─── Change Email Flow ───
  const viewFormProf = document.getElementById('formProfile');
  const viewEmChange = document.getElementById('settingsEmailChangeView');
  const step1 = document.getElementById('emailStep1');
  const step2 = document.getElementById('emailStep2');
  const step3 = document.getElementById('emailStep3');
  const step4 = document.getElementById('emailStep4');

  document.getElementById('btnChangeEmailFlow')?.addEventListener('click', () => {
    viewFormProf.style.display = 'none';
    viewEmChange.style.display = 'block';
    step1.style.display = 'block'; step2.style.display = 'none';
    step3.style.display = 'none'; step4.style.display = 'none';
    document.getElementById('emCurrentEmail').value = document.getElementById('profEmail').value;
  });

  document.getElementById('btnCancelEmailFlow')?.addEventListener('click', () => {
    viewEmChange.style.display = 'none';
    viewFormProf.style.display = 'block';
  });

  const safeFetch = async (url, options) => {
    try {
      const res = await fetch(url, options);
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : null;
      
      if (!res.ok) {
        throw new Error(data?.error || `Server error (${res.status}). Please check terminal.`);
      }
      return data;
    } catch (err) {
      console.error(`[Fetch Error] ${url}:`, err);
      throw err;
    }
  };

  document.getElementById('btnEmReqCurrentOtp')?.addEventListener('click', async (e) => {
    const btn = e.target; btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const data = await safeFetch('/api/admin/change-email/request-current', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ current_email: document.getElementById('emCurrentEmail').value })
      });
      step1.style.display = 'none'; step2.style.display = 'block';
      if (data.devMode) {
        const p = step2.querySelector('p');
        if(p) { p.textContent = 'DEV MODE: Check your terminal for OTP code!'; p.style.color = '#f59e0b'; }
      }
    } catch(err){ alert('Error: ' + err.message); }
    btn.disabled = false; btn.textContent = 'Send OTP to Current Email';
  });

  document.getElementById('btnEmVerifyCurrent')?.addEventListener('click', async (e) => {
    const btn = e.target; btn.textContent = 'Verifying...';
    try {
      await safeFetch('/api/admin/change-email/verify-current', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ otp: document.getElementById('emCurrentOtp').value })
      });
      step2.style.display = 'none'; step3.style.display = 'block';
    } catch(err){ alert('Error: ' + err.message); }
    btn.textContent = 'Verify OTP';
  });

  document.getElementById('btnEmReqNewOtp')?.addEventListener('click', async (e) => {
    const btn = e.target; btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const data = await safeFetch('/api/admin/change-email/request-new', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ new_email: document.getElementById('emNewEmail').value })
      });
      step3.style.display = 'none'; step4.style.display = 'block';
      if (data.devMode) {
        const p = step4.querySelector('p');
        if(p) { p.textContent = 'DEV MODE: Check your terminal for OTP code!'; p.style.color = '#f59e0b'; }
      }
    } catch(err){ alert('Error: ' + err.message); }
    btn.disabled = false; btn.textContent = 'Send OTP to New Email';
  });



  document.getElementById('btnEmVerifyNew')?.addEventListener('click', async (e) => {
    const btn = e.target; btn.textContent = 'Verifying...';
    try {
      await safeFetch('/api/admin/change-email/verify-new', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ otp: document.getElementById('emNewOtp').value })
      });
      document.getElementById('profEmail').value = document.getElementById('emNewEmail').value;
      alert('Email successfully changed!');
      document.getElementById('btnCancelEmailFlow').click();
    } catch(err){ alert('Error: ' + err.message); }
    btn.textContent = 'Verify & Confirm New Email';
  });

  document.getElementById('formProfile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.textContent = 'Saving...';
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          full_name: document.getElementById('profName').value, 
          email: document.getElementById('profEmail').value 
        })
      });
      const data = await res.json();
      if(data.success) {
        btn.textContent = 'Saved!';
        const nameEl = document.getElementById('adminName');
        if(nameEl) {
          const newName = document.getElementById('profName').value;
          nameEl.textContent = newName;
          
          // Sync with LocalStorage for fast branding load
          localStorage.setItem('isp_admin_name', newName);
          
          const avatar = nameEl.closest('.admin-info')?.querySelector('.admin-avatar');
          if (avatar) avatar.textContent = newName.charAt(0).toUpperCase();
        }
      } else { alert('Error updating profile'); }
    } catch(err){ alert('Network error'); }
    setTimeout(() => btn.textContent = 'Save Profile', 2000);
  });

  document.getElementById('btnRequestOtp')?.addEventListener('click', async () => {
    const cp = document.getElementById('secCurrentPass').value;
    if(!cp) return alert('Enter current password');
    const btn = document.getElementById('btnRequestOtp');
    btn.textContent = 'Sending OTP...';
    try {
      const res = await fetch('/api/admin/change-password/request-otp', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ current_password: cp })
      });
      const data = await res.json();
      if(data.success) {
        document.getElementById('secStep1').style.display = 'none';
        document.getElementById('secStep2').style.display = 'block';
        if (data.devMode) {
          const p = document.querySelector('#secStep2 p');
          if (p) {
            p.textContent = 'DEV MODE: Check your server terminal window to see the OTP code!';
            p.style.color = '#f59e0b';
            p.style.fontWeight = 'bold';
          }
        }
      } else { alert(data.error); }
    } catch(err){ alert('Network error'); }
    btn.textContent = 'Send OTP to Email';
  });

  document.getElementById('btnCancelOtp')?.addEventListener('click', () => {
    document.getElementById('secStep1').style.display = 'block';
    document.getElementById('secStep2').style.display = 'none';
    document.getElementById('secCurrentPass').value = '';
    document.getElementById('secOtp').value = '';
    document.getElementById('secNewPass').value = '';
    document.getElementById('secConfirmPass').value = '';
  });

  document.getElementById('btnVerifyOtp')?.addEventListener('click', async () => {
    const otp = document.getElementById('secOtp').value;
    const np = document.getElementById('secNewPass').value;
    const cp = document.getElementById('secConfirmPass').value;
    if(!otp || !np) return alert('Please enter OTP and new password.');
    if(np !== cp) return alert('New passwords do not match.');
    
    const btn = document.getElementById('btnVerifyOtp');
    btn.textContent = 'Verifying...';
    try {
      const res = await fetch('/api/admin/change-password/verify', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ otp, new_password: np })
      });
      const data = await res.json();
      if(data.success) {
        alert('Password successfully changed! Please login again with your new password.');
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.href = 'login.html';
      } else { alert(data.error); }
    } catch(err){ alert('Network error'); }
    btn.textContent = 'Verify & Change Password';
  });
});

// ─── Common Utilities ───
function formatBps(bps) {
  if (bps >= 1e9) return (bps / 1e9).toFixed(1) + ' Gbps';
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps';
  if (bps >= 1e3) return (bps / 1e3).toFixed(1) + ' Kbps';
  return bps + ' bps';
}

// ─── PREMIUM MODAL ENGINE (Global) ───
window.showPremiumModal = (options) => {
    const overlay = document.getElementById('premiumModalOverlay');
    const icon = document.getElementById('modalIcon');
    const title = document.getElementById('modalTitle');
    const text = document.getElementById('modalText');
    const footer = document.getElementById('modalFooter');

    if (!overlay) return;

    // Set Content
    title.textContent = options.title || 'Notification';
    if (options.html) {
        text.innerHTML = options.html;
    } else {
        text.textContent = options.text || '';
    }
    
    // Set Icon & Theme
    icon.innerHTML = options.iconHtml || '';
    icon.style.background = options.iconBg || 'rgba(99, 102, 241, 0.1)';
    icon.style.color = options.iconColor || 'var(--primary)';

    // Generate Buttons
    footer.innerHTML = '';
    const btns = options.buttons || [{ text: 'Close', type: 'secondary', onClick: () => window.closePremiumModal() }];
    
    btns.forEach(b => {
        const btn = document.createElement('button');
        btn.className = `modal-btn modal-btn-${b.type || 'secondary'}`;
        btn.textContent = b.text;
        btn.onclick = () => {
            if (b.onClick) b.onClick();
            if (!b.preventClose) window.closePremiumModal();
        };
        footer.appendChild(btn);
    });

    overlay.classList.add('active');
};

window.closePremiumModal = () => {
    const modal = document.querySelector('.premium-modal');
    if (modal) modal.style.maxWidth = '400px'; 
    document.getElementById('premiumModalOverlay')?.classList.remove('active');
};

// Convenience Helpers
window.showSuccess = (title, text) => window.showPremiumModal({
    title, text,
    iconBg: 'rgba(16, 185, 129, 0.15)', iconColor: '#10b981',
    iconHtml: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:38px;height:38px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    buttons: [{ text: 'Great!', type: 'confirm' }]
});

window.showError = (title, text) => window.showPremiumModal({
    title, text,
    iconBg: 'rgba(239, 68, 68, 0.15)', iconColor: '#ef4444',
    iconHtml: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:38px;height:38px"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    buttons: [{ text: 'Dismiss', type: 'danger' }]
});

window.showConfirm = (title, text, confirmBtnText, onConfirm) => {
    const isHtml = typeof text === 'string' && (text.includes('<') || text.includes('>'));
    return window.showPremiumModal({
        title, 
        [isHtml ? 'html' : 'text']: text,
        iconBg: 'transparent', iconColor: '#f59e0b',
        iconHtml: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:42px;height:42px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        buttons: [
            { text: 'Cancel', type: 'secondary' },
            { text: confirmBtnText || 'Confirm', type: 'confirm', onClick: onConfirm }
        ]
    });
};

function formatCurrency(val) {
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0 });
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

// System Pulse Heartbeat
window.updateSystemPulse = function(status) {
    const pulseDot = document.querySelector('.pulse');
    const pulseText = document.querySelector('.status-badge');
    if (pulseDot && pulseText) {
        if (status === 'online') {
            pulseDot.style.background = 'var(--accent-green)';
            pulseText.innerHTML = '<div class="pulse"></div> Live | System Ready';
            pulseText.style.color = 'var(--accent-green)';
            pulseText.style.background = 'rgba(16, 185, 129, 0.1)';
        } else {
            pulseDot.style.background = 'var(--accent-red)';
            pulseText.innerHTML = '<div class="pulse"></div> Offline | System Halted';
            pulseText.style.color = 'var(--accent-red)';
            pulseText.style.background = 'rgba(239, 68, 68, 0.1)';
        }
    }
};

// ─── Dashboard Logic ───
window.loadDashboard = async function() {
  const isDashboard = document.getElementById('totalClients');
  if (!isDashboard && pageName !== 'dashboard') return;

  try {
    const res = await fetch('/api/admin/dashboard?_t=' + Date.now());
    if (res.status === 401) return window.location.href = 'login.html';
    const data = await res.json();
    
    const salesRes = await fetch('/api/admin/sales/summary?_t=' + Date.now());
    const salesData = await salesRes.json();

    window.recentSalesData = salesData;
    window.recentDashboardData = data;

    if (document.getElementById('totalClients')) document.getElementById('totalClients').textContent = data.stats.totalClients;
    if (document.getElementById('onlineClients')) document.getElementById('onlineClients').textContent = data.stats.activeClients;
    if (document.getElementById('offlineClients')) document.getElementById('offlineClients').textContent = data.stats.offlineClients;
    if (document.getElementById('disabledClients')) document.getElementById('disabledClients').textContent = data.stats.disabledClients;
    if (document.getElementById('totalRevenue')) document.getElementById('totalRevenue').textContent = formatCurrency(data.stats.totalRevenue);
    if (document.getElementById('newInstallDue')) document.getElementById('newInstallDue').textContent = data.stats.newInstallDueCount || 0;
    if (document.getElementById('overdueClients')) document.getElementById('overdueClients').textContent = salesData.overdue ? salesData.overdue.length : 0;
    if (document.getElementById('upcomingClients')) document.getElementById('upcomingClients').textContent = salesData.upcoming ? salesData.upcoming.length : 0;
    if (document.getElementById('unpaidCount')) document.getElementById('unpaidCount').textContent = data.stats.unpaidCount || 0;
    if (document.getElementById('totalRevStat')) document.getElementById('totalRevStat').textContent = '₱' + (salesData.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (document.getElementById('totalExpStat')) document.getElementById('totalExpStat').textContent = '₱' + (salesData.totalExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

    updateBadge('navAppBadge', data.stats.pendingApps);
    updateBadge('navTicketBadge', data.stats.openTickets);
    updateBadge('navProofBadge', data.stats.pendingProofsCount || salesData.pendingProofsCount);

    // 🌐 [NEW] Router Identity & IP Awareness
    const infoPill = document.getElementById('routerInfoPill');
    const identityText = document.getElementById('routerIdentityText');
    const connAlert = document.getElementById('connAlert');
    const currentHost = document.getElementById('currentHost');

    if (data.routerInfo) {
      if (infoPill) {
        infoPill.style.display = 'flex';
        const identity = data.routerInfo.identity || 'Unknown Router';
        const host = data.routerInfo.host || '0.0.0.0';
        identityText.innerHTML = `${identity} <span style="opacity:0.5; margin-left:4px; font-weight:400">(${host})</span>`;
        
        // Visual indicator if mismatch or disconnected
        if (!data.routerInfo.connected) {
          infoPill.classList.add('mismatch');
          if (connAlert) connAlert.style.display = 'flex';
        } else {
          infoPill.classList.remove('mismatch');
          if (connAlert) connAlert.style.display = 'none';
        }
      }
      if (currentHost) currentHost.textContent = data.routerInfo.host;
    }

    if (data.mikrotikDisabled) {
      if (document.getElementById('mikrotikTopTalkers')) document.getElementById('mikrotikTopTalkers').style.display = 'none';
      if (document.getElementById('mikrotikConnectionBoard')) document.getElementById('mikrotikConnectionBoard').style.display = 'none';
      if (document.getElementById('mikrotikStatsGrid')) document.getElementById('mikrotikStatsGrid').style.display = 'none';
      if (document.getElementById('mikrotikDisabledBanner')) document.getElementById('mikrotikDisabledBanner').style.display = 'block';
      if (infoPill) infoPill.style.display = 'none';
      if (connAlert) connAlert.style.display = 'none';
    } else {
      if (document.getElementById('mikrotikTopTalkers')) document.getElementById('mikrotikTopTalkers').style.display = 'block';
      if (document.getElementById('mikrotikConnectionBoard')) document.getElementById('mikrotikConnectionBoard').style.display = 'block';
      if (document.getElementById('mikrotikStatsGrid')) document.getElementById('mikrotikStatsGrid').style.display = 'grid';
      if (document.getElementById('mikrotikDisabledBanner')) document.getElementById('mikrotikDisabledBanner').style.display = 'none';
      
      if (data.accountStatusList) {
        renderStatusBoard(data.accountStatusList);
      }

      if (data.topTalkers) {
        renderWatchlist(data.topTalkers);
      }
    }

    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      lastUpdate.innerHTML = `<span class="pulse-dot"></span> Live • Updated ${dateStr} at ${timeStr}`;
    }
  } catch (err) {
    console.warn('Dashboard element not found, skipping stats loader.');
  }
}

function renderWatchlist(leaders) {
  const container = document.getElementById('leaderboardGrid');
  if (!container) return;

  if (!leaders || leaders.length === 0) {
    container.innerHTML = '<div class="leader-placeholder">Radar clean. No heavy consumers detected.</div>';
    return;
  }

  // Find max bytes for relative visualization
  const maxBytes = Math.max(...leaders.map(l => l.bytes || 1), 1);

  container.innerHTML = leaders.map((u, index) => {
    let hogClass = '';
    let barGradient = 'linear-gradient(90deg, #0ea5e9, #6366f1)';
    if (index === 0) {
      hogClass = 'hog-critical';
      barGradient = 'linear-gradient(90deg, #ef4444, #a855f7)';
    } else if (index < 3) {
      hogClass = 'hog-warning';
      barGradient = 'linear-gradient(90deg, #f59e0b, #6366f1)';
    }

    const percent = Math.min(100, Math.round(((u.bytes || 0) / maxBytes) * 100));

    return `
      <div class="watchlist-row ${hogClass}" style="position:relative;">
        <div class="row-rank">${index + 1}.</div>
        
        <div class="row-user">
          <span class="status-pulse"></span>
          <strong title="${u.name}">${u.name}</strong>
        </div>

        <div class="row-meta" title="IP Address">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          ${u.address}
        </div>

        <div class="row-uptime" title="Uptime">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${u.uptime || '0s'}
        </div>

        <div class="row-mtu" title="MTU">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          ${u.mtu || '1480'}
        </div>

        <div class="row-usage">${u.usage}</div>

        <!-- Relative Bandwidth Progress Indicator -->
        <div class="usage-bar-wrapper" style="grid-column: 1 / -1; margin-top: 8px;">
          <div class="usage-bar-bg" style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; width: 100%;">
            <div class="usage-bar-fill" style="height: 100%; width: ${percent}%; background: ${barGradient}; border-radius: 2px; transition: width 0.5s ease-out;"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}




window.jumpToHog = (username) => {
  const table = document.getElementById('sessionsTbody');
  if (!table) return;

  // 1. Find the row
  const rows = Array.from(table.querySelectorAll('tr'));
  const targetRow = rows.find(r => r.querySelector('strong')?.textContent.trim() === username);

  if (targetRow) {
    // 2. Scroll to it
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 3. Highlight it
    targetRow.classList.add('highlight-row');
    setTimeout(() => targetRow.classList.remove('highlight-row'), 3000);
    
    // 4. Focus search to clear filters
    const search = document.getElementById('sessionSearch');
    if (search && search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
    }
  } else {
    window.showCustomAlert('Not Found', `User ${username} is no longer in the active list.`, true);
  }
};



// ─── Modal Handlers for Sales / Dashboard ───
function openListModal(title, clients) {
  const titleEl = document.getElementById('listModalTitle');
  const tbody = document.getElementById('listModalTbody');
  if (titleEl) titleEl.textContent = title;
  if (!tbody) return;
  
  if (!clients || clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">No clients found</td></tr>';
  } else {
    tbody.innerHTML = clients.map(c => {
      let displayName = c.full_name || '';
      let isRouterOnly = false;
      if (displayName.includes('(Router Only)')) {
        displayName = displayName.replace('(Router Only)', '').trim();
        isRouterOnly = true;
      }

      let nameHtml = '';
      if (isRouterOnly) {
        nameHtml = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong>${displayName}</strong>
            <span class="router-only-tag">Router Only</span>
          </div>
        `;
      } else {
        nameHtml = `<strong>${displayName}</strong>`;
      }

      let accountIdHtml = '';
      if (c.account_id === 'ROUTER') {
        accountIdHtml = `<span class="router-acct-badge">Router Secret</span>`;
      } else {
        accountIdHtml = `<code>${c.account_id}</code>`;
      }

      let infoText = c.msg || 'N/A';
      let pillClass = 'offline';

      if (title === 'Overdue Clients' && c.next_due_date) {
        const due = window.safeParseDate(c.next_due_date);
        const now = new Date(); now.setHours(12,0,0,0); 
        if (due) {
          const diffTime = now - due;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          infoText = `${diffDays} Day${diffDays > 1 ? 's' : ''} Overdue`;
          pillClass = 'overdue';
        }
      } else if (title === 'Upcoming Due (7 Days)' && c.next_due_date) {
        infoText = `Due: ${window.formatDate(c.next_due_date)}`;
        pillClass = 'pending';
      } else {
        const lowerMsg = infoText.toLowerCase();
        if (lowerMsg.includes('disabled')) {
          infoText = 'Disabled';
          pillClass = 'disabled';
        } else if (lowerMsg.includes('offline')) {
          infoText = 'Offline';
          pillClass = 'offline';
        } else if (lowerMsg.includes('not found on router')) {
          infoText = 'Not Found on Router';
          pillClass = 'offline';
        }
      }

      return `
        <tr>
          <td>${nameHtml}</td>
          <td>${accountIdHtml}</td>
          <td><span class="status-pill ${pillClass}">${infoText}</span></td>
        </tr>
      `;
    }).join('');
  }
  
  const modal = document.getElementById('listModal');
  if (modal) modal.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  // Aggressively thwart browser autofill on search bars
  const clearSearchInputs = () => {
    document.querySelectorAll('.search-input').forEach(inp => inp.value = '');
  };
  clearSearchInputs();
  setTimeout(clearSearchInputs, 50);
  setTimeout(clearSearchInputs, 500);
  // Offline card click (only on dashboard)
  document.getElementById('offlineCard')?.addEventListener('click', () => {
    if(window.recentDashboardData && window.recentDashboardData.offlineClients) {
      openListModal('Offline (Disconnected)', window.recentDashboardData.offlineClients);
    }
  });

  // Disabled card click
  document.getElementById('disabledCard')?.addEventListener('click', () => {
    if(window.recentDashboardData && window.recentDashboardData.disabledClients) {
      openListModal('Disconnected (Disabled)', window.recentDashboardData.disabledClients);
    }
  });

  // Overdue card click
  document.getElementById('overdueCard')?.addEventListener('click', () => {
    if(window.recentSalesData) openListModal('Overdue Clients', window.recentSalesData.overdue);
  });

  // Upcoming card click
  document.getElementById('upcomingCard')?.addEventListener('click', () => {
    if(window.recentSalesData) openListModal('Upcoming Due (7 Days)', window.recentSalesData.upcoming);
  });

  // Unpaid card click
  document.getElementById('unpaidCard')?.addEventListener('click', () => {
    if(window.recentDashboardData && window.recentDashboardData.unpaidList) {
      openListModal('Users on UNPAID Profile', window.recentDashboardData.unpaidList);
    }
  });

  // Close List Modal
  document.getElementById('closeListModalBtn')?.addEventListener('click', () => {
    document.getElementById('listModal').classList.remove('active');
  });

  // Payment Record Modal Setup
  const recordPaymentBtn = document.getElementById('recordPaymentBtn');
  const paymentModal = document.getElementById('paymentModal');
  const closePaymentModalBtn = document.getElementById('closePaymentModalBtn');
  const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');

  if (recordPaymentBtn) {
    recordPaymentBtn.addEventListener('click', async () => {
      const r = await fetch('/api/admin/clients');
      const allClients = await r.json();
      const resultsDiv = document.getElementById('payClientResults');
      const searchInp = document.getElementById('payClientSearch');
      const hiddenId = document.getElementById('payClientSelect');
      
      searchInp.value = '';
      hiddenId.value = '';
      resultsDiv.classList.remove('active');
      const payDateInp = document.getElementById('payDate');
      if (payDateInp && payDateInp._flatpickr) {
        payDateInp._flatpickr.setDate(new Date());
      } else if (payDateInp) {
        const today = new Date();
        const yStr = today.getFullYear();
        const mStr = String(today.getMonth() + 1).padStart(2, '0');
        const dStr = String(today.getDate()).padStart(2, '0');
        payDateInp.value = `${mStr}/${dStr}/${yStr}`;
      }
      
      const autoDetectRemarks = (clientId) => {
        const paidDateVal = document.getElementById('payDate').value;
        const paidAmount = parseFloat(document.getElementById('payAmount').value) || 0;
        const hiddenRemarks = document.getElementById('payRemarks');
        const rText = document.getElementById('remarksText');
        const rColor = document.getElementById('remarksColor');
        const ndPreview = document.getElementById('ndPreview');

        if (!clientId || !paidDateVal || !rText) return;
        
        const client = allClients.find(c => String(c.id) === String(clientId) || c.account_id === clientId);
        if (!client) return;

        const hasNextDue = client.next_due_date && client.next_due_date !== "";
        const submitBtn = document.querySelector('#paymentForm button[type="submit"]');

        if (!hasNextDue) {
           hiddenRemarks.value = '⚠️ NO DUE DATE';
           rText.textContent = "Please EDIT this client and set a DUE DATE first.";
           rText.style.color = '#ef4444';
           rColor.style.background = '#ef4444';
           if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
           return;
        }

        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
        
        const pDate = window.safeParseDate(paidDateVal);
        const dDate = window.safeParseDate(client.next_due_date || client.installation_date); 
        
        if (!pDate || !dDate) return;
        
        const diff = dDate.getTime() - pDate.getTime();
        const daysDiff = diff / (1000 * 3600 * 24);
        
        let statusText = 'On Time';
        let statusColor = '#10b981'; // Green
        
        if (pDate > dDate) {
          statusText = 'Overdue';
          statusColor = '#ef4444'; // Red
        } else if (daysDiff > 5) {
          statusText = 'Pay Early';
          statusColor = '#f59e0b'; // Amber
        }
        
        hiddenRemarks.value = statusText;

        // ─── Calculate PREVIEW of New Due Date ───
        const monthlyRate = parseFloat(client.monthly_rate) || 1000;
        const monthsToPay = Math.max(1, Math.floor(paidAmount / monthlyRate));
        
        // Simulating the backend calculateNextDue/addMonths
        let previewDate = new Date(dDate);
        if (statusText === 'Overdue') {
            // Fair Reset logic: today + months
            previewDate = new Date(pDate);
        }
        
        // Add months logic
        previewDate.setMonth(previewDate.getMonth() + monthsToPay);
        
        if (ndPreview) {
          const formattedRes = previewDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const advanceNote = monthsToPay > 1 ? ` <span style="font-size:0.7rem; color:#6366f1;">(+${monthsToPay} Months Advance)</span>` : '';
          ndPreview.innerHTML = `${formattedRes}${advanceNote}`;
          ndPreview.style.fontWeight = 'bold';
          ndPreview.style.color = '#10b981';
          ndPreview.style.fontSize = '1.1rem';
        }

        rText.textContent = statusText;
        rText.style.color = statusColor;
        rColor.style.background = statusColor;
      };

      searchInp.oninput = () => {
        const query = searchInp.value.toLowerCase();
        if (!query) { resultsDiv.classList.remove('active'); return; }
        const matches = allClients.filter(c => 
          c.full_name.toLowerCase().includes(query) || 
          c.account_id.toLowerCase().includes(query)
        ).slice(0, 8);

        if (matches.length > 0) {
          resultsDiv.innerHTML = matches.map(c => {
            const isLocked = !c.next_due_date || c.next_due_date === "";
            return `
              <div class="search-item ${isLocked ? 'locked' : ''}" data-id="${c.id}" data-name="${c.full_name}" data-acc="${c.account_id}">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                  <div>
                    <span class="name">${c.full_name}</span>
                    <span class="meta">${c.account_id} • ${c.plan || 'No Plan'}</span>
                  </div>
                  ${isLocked ? '<span style="font-size:0.6rem; background:#7c2d12; color:#ffedd5; padding:2px 6px; border-radius:4px; font-weight:700">⚠️ NO DUE DATE</span>' : ''}
                </div>
              </div>
            `;
          }).join('');
          resultsDiv.classList.add('active');
          
          resultsDiv.querySelectorAll('.search-item').forEach(item => {
            item.onclick = () => {
              const id = item.dataset.id;
              searchInp.value = `${item.dataset.name} (${item.dataset.acc})`;
              hiddenId.value = id;
              resultsDiv.classList.remove('active');
              autoDetectRemarks(id);
            };
          });
        } else {
          resultsDiv.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:0.85rem">No clients found.</div>';
          resultsDiv.classList.add('active');
        }
      };

      document.addEventListener('click', (e) => {
        if (!searchInp.contains(e.target) && !resultsDiv.contains(e.target)) {
          resultsDiv.classList.remove('active');
        }
      });

      document.getElementById('payDate').onchange = () => autoDetectRemarks(hiddenId.value);
      document.getElementById('payAmount').oninput = () => autoDetectRemarks(hiddenId.value);
      paymentModal.classList.add('active');
    });
  }

  [closePaymentModalBtn, cancelPaymentBtn].forEach(el => {
    if(el) el.addEventListener('click', () => paymentModal.classList.remove('active'));
  });

  const payForm = document.getElementById('paymentForm');
  if (payForm) {
    payForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const ledgerDueDateEl = document.getElementById('payLedgerDueDate');
        const body = {
          client_id: document.getElementById('payClientSelect').value,
          amount: document.getElementById('payAmount').value,
          payment_method: document.getElementById('payMethod').value,
          date: document.getElementById('payDate').value,
          remarks: document.getElementById('payRemarks').value,
          requested_due_date: ledgerDueDateEl ? ledgerDueDateEl.value : null
        };
        const r = await fetch('/api/admin/payments', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body)
        });
        if(r.ok) {
           window.showCustomAlert('Thank You!', 'Payment recorded successfully. A confirmation email has been dispatched to the customer.', false);
           paymentModal.classList.remove('active');
           if (pageName === 'sales' && window.loadSales) window.loadSales();
           else if (pageName === 'dashboard' && window.loadDashboard) window.loadDashboard();
        } else {
           const data = await r.json();
           window.showCustomAlert('Error', data.error || 'Failed to save payment record.', true);
        }
      } catch(e) { 
        window.showCustomAlert('Network Error', 'Could not reach the billing server.', true); 
      }
    });
  }
});

function renderStatusBoard(accounts) {
  const tbody = document.getElementById('sessionsTbody');
  if (!tbody) return;
  if (!accounts || !accounts.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No accounts found on MikroTik</td></tr>';
    return;
  }

  let activeFilter = 'ALL';
  let searchTerm = '';

  const applyFilters = () => {
    let filtered = accounts;

    // 1. Apply status button filter
    if (activeFilter !== 'ALL') {
      filtered = filtered.filter(a => a.status === activeFilter);
    }

    // 2. Apply search text filter
    if (searchTerm) {
      filtered = filtered.filter(a => 
        (a.name || '').toLowerCase().includes(searchTerm) || 
        (a.address || '').toLowerCase().includes(searchTerm) || 
        (a.status || '').toLowerCase().includes(searchTerm)
      );
    }

    // Render results
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No matching accounts found</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(a => {
        const statusClass = `status-${a.status.toLowerCase()}`;
        const rowClass = a.status === 'ACTIVE' ? 'row-active' : (a.status === 'DISCONNECTED' ? 'row-disconnected' : '');

        return `
          <tr class="${rowClass}">
            <td><strong>${a.name}</strong></td>
            <td>
              <div class="data-with-icon" title="IP Address">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                ${a.address}
              </div>
            </td>
            <td><span class="status-pill ${statusClass}">${a.status}</span></td>
            <td style="font-weight:600; color:var(--accent)">${a.usage || '0 B'}</td>
            <td>
              <div class="data-with-icon" title="Uptime">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                ${a.uptime}
              </div>
            </td>
            <td><code style="font-size:0.8rem">${a.mtu}</code></td>
          </tr>
        `;
      }).join('');
    }
  };

  // Initial draw
  applyFilters();

  // Wire up filter button click listeners
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-status');
      applyFilters();
    };
  });

  // Wire up search input listener
  const searchInput = document.getElementById('sessionSearch');
  if (searchInput) {
    searchTerm = searchInput.value.toLowerCase();
    searchInput.oninput = (e) => {
      searchTerm = e.target.value.toLowerCase();
      applyFilters();
    };
  }
}

// ─── Client Management ───
async function loadClientsTable() {
  const tbody = document.getElementById('clientsTbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/clients?_t=' + Date.now());
    const clients = await res.json();

    const countEl = document.getElementById('totalClientsCount');
    if (countEl) countEl.textContent = `(Total: ${clients.length})`;

    tbody.innerHTML = clients.map(c => {
      const nd = c.next_due_date ? new Date(c.next_due_date + 'T00:00:00') : null;
      let ndColor = 'var(--text-dim)';
      let ndText = window.formatDate(c.next_due_date);
      let nextCycleText = '-';
      
      if (nd && !isNaN(nd.getTime())) {
        const now = new Date(); now.setHours(0,0,0,0);
        const in7 = new Date(now); in7.setDate(now.getDate() + 7);
        if (nd < now) ndColor = '#ef4444'; // Red (Overdue)
        else if (nd <= in7) ndColor = '#f59e0b'; // Amber (Soon)
        else ndColor = '#10b981'; // Green (Future)

        // Calculate Next Cycle accurately by preserving the same local day
        const nc = new Date(nd);
        nc.setMonth(nc.getMonth() + 1);
        const y = nc.getFullYear();
        const m = String(nc.getMonth() + 1).padStart(2, '0');
        const d = String(nc.getDate()).padStart(2, '0');
        nextCycleText = window.formatDate(`${y}-${m}-${d}`);
      }

      const status = c.status ? c.status.toLowerCase() : 'unknown';
      const isDisconnected = status === 'disconnected' || status === 'disabled';
      const todayStr = window.getLocalDateStr ? window.getLocalDateStr() : new Date().toISOString().split('T')[0];
      const in7DaysStr = window.getLocalDateStr ? window.getLocalDateStr(new Date(Date.now() + 7*24*60*60*1000)) : '';

      let statusText = 'PAID';
      let statusClass = 'active';

      if (isDisconnected) {
          statusText = 'DISCONNECTED';
          statusClass = 'disconnected';
      } else if (!c.total_paid || c.total_paid <= 0) {
          statusText = 'NO PAYMENT';
          statusClass = 'overdue';
      } else if (c.next_due_date && c.next_due_date < todayStr) {
          statusText = 'OVERDUE';
          statusClass = 'overdue';
      } else if (c.next_due_date && c.next_due_date <= in7DaysStr) {
          statusText = 'DUE SOON';
          statusClass = 'grace';
      }

      return `
        <tr class="${isDisconnected ? 'row-disconnected' : ''}">
          <td><div style="font-weight:700; color:var(--text-pure); font-size:1rem; font-family: 'Plus Jakarta Sans', sans-serif;">${c.full_name}</div></td>
          <td style="font-size:0.85rem; color:${c.email ? 'var(--accent-cyan)' : 'var(--text-dim)'}; font-weight:500;">${c.email || 'NO GMAIL'}</td>
          <td style="font-size:0.85rem; color:${c.contact ? 'var(--text-secondary)' : 'var(--text-dim)'}">${c.contact || 'NO PHONE'}</td>
          <td><span style="font-size:0.85rem; color:var(--accent-purple); font-weight:700;">${c.plan || '-'}</span></td>
          <td style="color:var(--success); font-weight:800; font-size:0.95rem;">₱${Number(c.monthly_rate || 0).toLocaleString()}</td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
          <td style="color:${isDisconnected ? 'var(--text-dim)' : ndColor};font-weight:800">${isDisconnected ? 'Suspended' : ndText}</td>
          <td style="color:var(--accent-indigo); font-size:0.85rem; font-weight:600;">${isDisconnected ? 'N/A' : nextCycleText}</td>
          <td>
            <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
              <button class="btn-icon" onclick="editClient(${c.id})" title="Edit" style="background:none;border:none;cursor:pointer;color:var(--text-dim)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon" onclick="window.toggleClientStatus(${c.id}, '${status}')" title="${isDisconnected ? 'Reconnect' : 'Disconnect'}" style="background:none;border:none;cursor:pointer;color:${isDisconnected ? 'var(--accent-blue)' : 'var(--text-dim)'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg>
              </button>
              <button class="btn-icon" onclick="deleteClient(${c.id})" title="Delete" style="background:none;border:none;cursor:pointer;color:#ef4444">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Table Render Error:', err);
    tbody.innerHTML = '<tr><td colspan="9">Failed to load clients</td></tr>';
  }
}

window.editClient = async (id) => {
  try {
    const res = await fetch(`/api/admin/clients/${id}`);
    const client = await res.json();
    
    document.getElementById('clientModalTitle').textContent = 'Edit Client';
    document.getElementById('saveClientBtn').textContent = 'Update Client';
    document.getElementById('client_id').value = id;


    const form = document.getElementById('addClientForm');
    form.full_name.value = client.full_name;
    form.email.value = client.email || '';
    form.contact.value = client.contact || '';
    form.plan.value = client.plan;
    form.address.value = client.address || '';
    if (form.next_due_date) {
        form.next_due_date.value = client.next_due_date || '';
    }

    // Load Latitude and Longitude
    form.latitude.value = client.latitude || '';
    form.longitude.value = client.longitude || '';
    
    // Load Dynamic Profiles and select the current plan
    await window.loadInternetPlans(client.plan);
    
    // Override input removed - all logic is now plan-based
    
    if (form.push_to_router) {
        form.push_to_router.checked = true;
    }
    
    document.getElementById('addClientModal').classList.add('active');
  } catch (err) {
    window.showError('Navigation Error', 'We could not fetch the client details. Please check your connectivity.');
  }
};

window.deleteClient = async (id) => {
    const title = 'Delete Client Permanently?';
    const confirmMsg = `
        <div style="text-align:center; padding:10px 0;">
            <div style="color:#ef4444; font-weight:800; font-size:1.1rem; margin-bottom:10px;">⚠️ CRITICAL WARNING</div>
            <p style="color:#fff; margin-bottom:15px; line-height:1.5;">
                Are you sure you want to delete this client?<br>
                This will <b style="color:#ef4444;">PERMANENTLY ERASE</b> everything:
            </p>
            <ul style="text-align:left; color:#94a3b8; font-size:0.9rem; margin:0 auto; width:fit-content; list-style:none; padding:0;">
                <li>❌ Client Profile & Account</li>
                <li>❌ All Payment Records & History</li>
            </ul>
            <p style="color:#ef4444; font-size:0.8rem; margin-top:15px; font-weight:600;">This action cannot be undone.</p>
        </div>
    `;

    window.showConfirm(title, confirmMsg, 'Yes, Delete Everything', async () => {
        try {
            const res = await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                loadClientsTable();
                window.showSuccess('Client Wiped', 'The client and all their records have been erased.');
            } else {
                window.showError('Deletion Failed', data.error || 'Could not remove this client.');
            }
        } catch (err) {
            window.showError('Network Error', 'Failed to reach server.');
        }
    });
};
window.toggleClientStatus = async (id, currentStatus) => {
  const status = String(currentStatus).toLowerCase();
  const action = (status === 'disconnected' || status === 'disabled') ? 'reconnect' : 'disconnect';
  const title = action === 'disconnect' ? 'Disconnect Client' : 'Reconnect Client';
  let confirmMsg = action === 'disconnect' 
      ? 'This will stop their billing cycle and notifications. Are you sure you want to proceed?'
      : '<label style="display:block; font-size:0.8rem; color:var(--text-dim); margin-bottom:5px;">SET NEXT DUE DATE:</label>' +
        '<input type="date" id="reconnectNextDueDateGlobal" style="width:100%; padding:10px; border-radius:8px; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:#fff; font-size:1rem;">';

  window.showConfirm(title, confirmMsg, action === 'disconnect' ? 'Yes, Disconnect' : 'Yes, Reconnect', async () => {
    try {
        let bodyData = { client_id: id };
        if (action === 'reconnect') {
            const dateInp = document.getElementById('reconnectNextDueDateGlobal');
            if (dateInp) bodyData.next_due_date = dateInp.value;
            
            if (!bodyData.next_due_date) {
                window.showError('Required', 'Please select a Next Due Date for reconnection.');
                return;
            }
        }

        const res = await fetch(`/api/admin/clients/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });
        const data = await res.json();
        if (data.success) {
            if (typeof loadClientsTable === 'function') loadClientsTable();
            if (window.showSuccess) window.showSuccess(data.message);
        } else {
            if (window.showError) window.showError(data.error);
            else alert('Action failed: ' + data.error);
        }
    } catch (err) {
        console.error('Toggle status failed:', err);
    }
  });
};

// ─── Initialize Page ───
// ─── PAGE DETECTION (Independent of Sidebar) ───
const getPageName = () => {
    const path = window.location.pathname;
    if (path.includes('clients')) return 'clients';
    if (path.includes('index') || path.endsWith('/admin/')) return 'dashboard';
    if (path.includes('events')) return 'events';
    if (path.includes('sales')) return 'sales';
    if (path.includes('maintenance')) return 'maintenance';
    if (path.includes('tickets')) return 'tickets';
    if (path.includes('applications')) return 'applications';
    if (path.includes('verify-payments')) return 'verify-payments';
    return document.body.dataset.page || '';
};
const pageName = getPageName();

if (pageName === 'dashboard') {
  window.loadDashboard();
  setInterval(window.loadDashboard, 10000); // Original 10s refresh
  
  const ctxSearch = document.getElementById('sessionSearch');
  if (ctxSearch) {
    ctxSearch.addEventListener('input', () => {
      const q = ctxSearch.value.toLowerCase();
      document.querySelectorAll('#sessionsTbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}

if (pageName === 'events') {
  let allEvents = [];

  let activeEventCategory = 'ALL';

  window.filterEventLogs = (category) => {
    activeEventCategory = category;
    
    // Update Tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (category === 'ALL') document.getElementById('tabEvAll')?.classList.add('active');
    if (category === 'BILLING') document.getElementById('tabEvBilling')?.classList.add('active');
    if (category === 'CONNECTION') document.getElementById('tabEvConn')?.classList.add('active');
    if (category === 'BROADCAST') document.getElementById('tabEvBc')?.classList.add('active');
    
    renderEvents();
  };

  const renderEvents = () => {
    const tbody = document.getElementById('eventsTbody');
    const searchInput = document.getElementById('eventSearch');
    if (!tbody) return;

    const query = searchInput ? searchInput.value.toLowerCase() : '';
    let filtered = allEvents.filter(e => 
      e.pppoe_user.toLowerCase().includes(query) || 
      (e.ip_address && e.ip_address.toLowerCase().includes(query)) ||
      (e.caller_id && e.caller_id.toLowerCase().includes(query))
    );

    // Apply Category Filter
    if (activeEventCategory === 'BILLING') {
      filtered = filtered.filter(e => ['SUSPENSION', 'SUSPENDED', 'PAYMENT_VERIFIED', 'RESTORATION', 'RESTORED'].includes(e.type));
    } else if (activeEventCategory === 'CONNECTION') {
      filtered = filtered.filter(e => ['CONNECT', 'DISCONNECT', 'RECONNECTED', 'DISCONNECTED'].includes(e.type));
    } else if (activeEventCategory === 'BROADCAST') {
      filtered = filtered.filter(e => e.type.includes('Reminder') || e.type.includes('Due Today'));
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">${allEvents.length ? 'No events match your search' : 'No events found'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      const type = e.type || '';
      let color = '#818cf8'; // Default Indigo
      let label = type || 'Event';
      
      if (type === 'CONNECT' || type === 'RECONNECTED') {
        color = '#10b981'; // Green
        label = 'CONNECTED';
      } else if (type === 'DISCONNECT' || type === 'DISCONNECTED') {
        color = '#ef4444'; // Red
        label = 'DISCONNECTED';
      } else if (type.includes('Reminder') || type.includes('Due Today')) {
        color = '#f59e0b'; // Amber
        label = 'REMINDER';
      } else if (type.includes('SUSPENSION')) {
        color = '#991b1b'; // Dark Red
        label = 'SUSPENSION';
      } else if (type.includes('PAYMENT_VERIFIED')) {
        color = '#6366f1'; // Indigo
        label = 'VERIFIED';
      } else if (type.includes('RESTORATION')) {
        color = '#10b981'; // Success Green
        label = 'RESTORED';
      }

      return `
        <tr>
          <td><span style="color:${color}; font-weight:800; font-size:0.75rem; letter-spacing:0.5px; text-transform:uppercase;">${label}</span></td>
          <td><strong>${e.pppoe_user}</strong></td>
          <td><code>${e.ip_address || '-'}</code></td>
          <td>${window.formatDateTime(e.timestamp)}</td>
        </tr>
      `;
    }).join('');
  };

  window.loadEvents = async () => {
    try {
      const res = await fetch('/api/admin/events?_t=' + Date.now());
      
      // ✨ SESSION AUTO-RECOVERY: If the session expired (401), redirect to login
      if (res.status === 401) {
        window.location.href = '/admin/login.html';
        return;
      }

      const data = await res.json();
      
      // ✨ FAILSAFE: Only update and render if data is a valid array
      if (Array.isArray(data)) {
        allEvents = data;
        renderEvents();
      } else {
        console.warn('Received invalid events data:', data);
      }
    } catch(e) { console.error('Failed to load events', e); }
  };

  // ✨ AUTO-LOAD & REFRESH: Run immediately and every 10 seconds
  window.loadEvents();
  setInterval(window.loadEvents, 10000);

  // Search logic
  document.getElementById('eventSearch')?.addEventListener('input', renderEvents);

  // Clear Logs Logic
  const btnClearLogs = document.getElementById('btnClearLogs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async () => {
      const confirmMsg = 'Are you sure you want to clear all Event Logs? This action is permanent and helps keep your system database fast and responsive.';
      if (!await window.customConfirmAsync('System Confirmation', confirmMsg)) return;
      
      const originalContent = btnClearLogs.innerHTML;
      btnClearLogs.disabled = true;
      btnClearLogs.innerHTML = `<span class="spinner-small" style="margin-right:8px;"></span> Clearing...`;

      try {
        const res = await fetch('/api/admin/maintenance/clear-logs', { method: 'POST' });
        const data = await res.json();
        
        if (res.ok && data.success) {
          window.showCustomAlert('Safe Maintenance', 'Event activity records have been successfully wiped to keep your dashboard fast.', false);
          if (typeof window.loadEvents === 'function') window.loadEvents();
        } else {
          window.showCustomAlert('Execution Failed', data.error || 'Failed to clear logs properly.', true);
        }
      } catch (err) {
        window.showCustomAlert('Connectivity Error', 'Could not reach the server. Please check your internet connection.', true);
      } finally {
        btnClearLogs.disabled = false;
        btnClearLogs.innerHTML = originalContent;
      }
    });
  }
}

// ─── Suspend & Resume Logic ───
window.suspendClient = async (id) => {
  if (!await window.customConfirmAsync('Safety Confirmation', 'Are you sure you want to SUSPEND this client? Their PPPoE connection will be DISABLED immediately and they will lose all internet access until restored.')) return;
  try {
    const res = await fetch(`/api/admin/clients/${id}/disconnect`, { method: 'POST' });
    if (res.ok) {
      loadClientsTable();
      window.showSuccess('Service Suspended', 'The client pppoe secret has been disabled and their session terminated.');
    } else window.showError('Action Failed', 'Could not suspend client service.');
  } catch(e) { window.showError('Network Error', 'Connection to router failed.'); }
};

window.resumeClient = async (id) => {
  if (!await window.customConfirmAsync('Safety Confirmation', 'Resume internet service for this client? This will restore their connection and internet access.')) return;
  try {
    const res = await fetch(`/api/admin/clients/${id}/reconnect`, { method: 'POST' });
    if (res.ok) {
      loadClientsTable();
      window.showSuccess('Service Restored', 'The client is now active and internet access has been enabled.');
    } else window.showError('Action Failed', 'Could not resume client service.');
  } catch(e) { window.showError('Network Error', 'Connection to server failed.'); }
};

// ─── System Settings Management ───
if (pageName === 'maintenance') {
  // Stats and License loading are handled by independent triggers to avoid global script crashes.
}

// Event logic consolidated above.

if (pageName === 'sales') {
  window.loadSales = async function() {
    try {
      const dData = await (await fetch('/api/admin/dashboard?_t=' + Date.now())).json();
      if(document.getElementById('salesTotalRevenue')) document.getElementById('salesTotalRevenue').textContent = formatCurrency(dData.stats.totalRevenue);
      
      const s = await (await fetch('/api/admin/sales-monitoring?_t=' + Date.now())).json();
      window.recentSalesData = s;
      
      if(document.getElementById('overdueClients')) document.getElementById('overdueClients').textContent = s.overdue ? s.overdue.length : 0;
      if(document.getElementById('upcomingClients')) document.getElementById('upcomingClients').textContent = s.upcoming ? s.upcoming.length : 0;
      if(document.getElementById('newInstallDueSales')) document.getElementById('newInstallDueSales').textContent = s.newInstallDueCount || 0;
      if(document.getElementById('totalClientsCount')) document.getElementById('totalClientsCount').textContent = s.clientSummaries ? s.clientSummaries.length : 0;
      
      const payments = s.payments || [];
      const clientSummaries = s.clientSummaries || [];

      if(document.getElementById('revWeekly') && s.breakdown) {
        document.getElementById('revWeekly').textContent = formatCurrency(s.breakdown.weekly);
        document.getElementById('revMonthly').textContent = formatCurrency(s.breakdown.monthly);
        document.getElementById('revSixMonths').textContent = formatCurrency(s.breakdown.sixMonths);
        document.getElementById('revYearly').textContent = formatCurrency(s.breakdown.yearly);
      }

      // ── SOA Table: Show ALL clients ──
      window.renderSalesTable = (search = '') => {
        const tbody = document.getElementById('salesTbody');
        if (!tbody) return;

        const filtered = search ? clientSummaries.filter(c => {
          const s = search.toLowerCase();
          return (
            c.full_name?.toLowerCase().includes(s) ||
            c.account_id?.toLowerCase().includes(s) ||
            (c.next_due_date && c.next_due_date.includes(s)) || // Fast Year/Date Search
            (c.plan && c.plan.toLowerCase().includes(s))
          );
        }) : clientSummaries;

        const safeParseDate = (dateStr) => {
          if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return null;
          let d;
          if (dateStr.includes('/')) {
            // Robust parsing for MM/DD/YYYY
            d = new Date(dateStr);
          } else {
            d = new Date(dateStr + 'T12:00:00');
          }
          return isNaN(d.getTime()) ? null : d;
        };

        if (!filtered || !filtered.length) {
          tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No matching clients found.</td></tr>';
        } else {
          tbody.innerHTML = filtered.map(c => {
            // Color-code next due date
            let ndColor = '#10b981';
            
            const nd = safeParseDate(c.next_due_date);
            
            // USE SYNCED TIME
            const now = window.serverToday ? new Date(window.serverToday + 'T00:00:00') : new Date();
            now.setHours(0,0,0,0);
            
            let isOverdue = false;
            let isUpcoming = false;
            
            if (nd && !isNaN(nd.getTime())) {
              const in7 = new Date(now); in7.setDate(now.getDate() + 7);
              if (nd < now) { ndColor = '#ef4444'; isOverdue = true; }
              else if (nd <= in7) { ndColor = '#f59e0b'; isUpcoming = true; }
            }

            // Find most recent payment for this client
            const lastPay = payments.find(p => p.client_id === c.id);
            let lastPayInfo = 'No payments';
            let lastMethod = '—';
            let lastRemarks = '—';
            
            // Determine status for pill (with Grace Period info)
            const graceMax = s.grace_period || 3;
            const hasDue = !!c.next_due_date && c.next_due_date !== 'null' && c.next_due_date !== '';
            
            let statusText = 'NOT SET';
            let statusClass = 'unpaid';
            
            if (isOverdue) {
              const now = new Date(); now.setHours(0,0,0,0);
              const diffTime = Math.abs(now - nd);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays <= graceMax) {
                statusText = `Overdue (Grace: ${diffDays}/${graceMax})`;
                statusClass = 'pending'; // Amber
              } else {
                statusText = `Overdue (Suspended)`;
                statusClass = 'overdue'; // Red
              }
            } else if (isUpcoming) {
              statusText = 'Upcoming';
              statusClass = 'pending';
            } else if (c.payment_count > 0) {
              statusText = 'Paid';
              statusClass = 'paid';
            } else if (hasDue) {
              statusText = 'No Payment';
              statusClass = 'unpaid';
            }

            if (lastPay) {
              lastPayInfo = window.formatDate(lastPay.created_at || lastPay.paid_date);
              lastMethod = lastPay.payment_method || lastPay.method || 'Cash';
              lastRemarks = lastPay.remarks || 'None';
            }

            return `
              <tr onclick="showClientLedger(${c.id})" style="cursor:pointer;" class="clickable-row">
                <td>
                  <div style="font-weight:600; color:var(--accent-main); text-decoration: underline;">${c.full_name}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted)">${c.account_id} • ${c.plan || 'No Plan'}</div>
                </td>
                <td>
                  <div style="color:${ndColor};font-weight:700;font-size:0.95rem;text-transform:uppercase;">${window.formatDate(c.next_due_date)}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted)">Next Cycle: ${window.formatDate(c.future_due_date)}</div>
                </td>
                <td style="color:#10b981;font-weight:600">₱${Number(c.total_paid).toLocaleString()}</td>
                <td style="font-size:0.85rem">${lastPayInfo}</td>
                <td>${lastMethod}</td>
                <td><span style="font-size:0.85rem;background:var(--border);padding:2px 6px;border-radius:4px">${lastRemarks}</span></td>
                <td><span class="status-pill ${statusClass}">${statusText}</span></td>
              </tr>
            `;
          }).join('');
        }
      };

      window.renderFullHistory = (search = '') => {
        const fullTbody = document.getElementById('fullHistoryTbody');
        if (!fullTbody) return;
        const filtered = search ? payments.filter(p => {
          const s = search.toLowerCase();
          return (
            p.full_name?.toLowerCase().includes(s) || 
            p.account_id?.toLowerCase().includes(s) ||
            p.payment_method?.toLowerCase().includes(s) ||
            p.method?.toLowerCase().includes(s) ||
            (p.paid_date && p.paid_date.includes(s))
          );
        }) : payments;

        if (!filtered || !filtered.length) {
          fullTbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No payment history found.</td></tr>';
        } else {
          fullTbody.innerHTML = filtered.map(p => {
             return `
              <tr>
                <td>
                  <div style="font-weight:600">${p.full_name}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted)">${p.account_id || ''}</div>
                </td>
                <td>
                  <div style="font-weight:600">${window.formatDate(p.paid_date)}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted)">Recorded: ${window.formatDateTime(p.created_at)}</div>
                </td>
                <td style="color:#10b981;font-weight:600">₱${Number(p.amount).toLocaleString()}</td>
                <td>${p.payment_method || p.method || 'Cash'}</td>
                <td><span style="font-size:0.85rem;background:var(--border);padding:2px 6px;border-radius:4px">${p.remarks || 'None'}</span></td>
                <td>
                  <button class="btn-void" onclick="openVoidModal(${p.id})" style="display: flex; align-items: center; gap: 4px; color: #ef4444; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s;" title="Void Payment">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">Void</span>
                  </button>
                </td>
              </tr>
            `;
          }).join('');
        }
      };

      const renderQuickHistory = () => {
        const qTbody = document.getElementById('quickHistoryTbody');
        if(!qTbody) return;
        const recent = payments.slice(0, 8); 
        if(!recent.length) { 
          qTbody.innerHTML = '<tr><td style="color:#64748b; font-size:0.85rem; text-align:center; padding:40px;">No recent activities</td></tr>'; 
          return; 
        }
        
        qTbody.innerHTML = recent.map(p => {
          const pdRaw = p.paid_date ? (p.paid_date.includes('T') ? p.paid_date.split('T')[0] : p.paid_date.split(' ')[0]) : null;
          const pdObj = pdRaw ? new Date(pdRaw + 'T12:00:00') : null;
          const dayStr = (pdObj && !isNaN(pdObj.getTime())) ? 
            `${String(pdObj.getMonth() + 1).padStart(2, '0')}/${String(pdObj.getDate()).padStart(2, '0')}/${pdObj.getFullYear()}` : '—';
          const initial = (p.full_name || 'U').charAt(0).toUpperCase();
          
          let mColor = '#94a3b8';
          let mBg = 'rgba(148,163,184,0.1)';
          const m = (p.payment_method || p.method || 'Cash').toLowerCase();
          if (m === 'gcash') { mColor = '#60a5fa'; mBg = 'rgba(96,165,250,0.1)'; }
          else if (m === 'cash') { mColor = '#34d399'; mBg = 'rgba(52,211,153,0.1)'; }
          else if (m === 'bank') { mColor = '#c084fc'; mBg = 'rgba(192,132,252,0.1)'; }

          return `
            <tr>
              <td style="padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width:36px; height:36px; border-radius:10px; background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2)); color: #6366f1; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem; border: 1px solid rgba(99,102,241,0.1);">
                    ${initial}
                  </div>
                  <div style="flex:1;">
                    <div style="font-weight:600; color:var(--text-main); font-size: 0.88rem; margin-bottom: 2px;">${p.full_name || 'Unknown Client'}</div>
                    <div style="display: flex; align-items:center; gap: 6px;">
                       <span style="font-size: 0.72rem; color: #64748b; font-weight:500;">${dayStr}</span>
                       <span style="color: #475569;">•</span>
                       <span style="font-size: 0.65rem; color: ${mColor}; background: ${mBg}; padding: 1px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${m}</span>
                    </div>
                  </div>
                  <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <button onclick="openVoidModal(${p.id})" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:2px; display:flex; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="Void Payment">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      <div style="color:#10b981; font-weight:700; font-size: 0.95rem;">+₱${Number(p.amount || 0).toLocaleString()}</div>
                    </div>
                    <div style="font-size: 0.65rem; color: #64748b; font-weight: 500;">Confirmed</div>
                  </div>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      };

      window.renderSalesTable();
      renderQuickHistory();
      window.renderFullHistory();
      
      // History Modal Events
      if (!window._historyEvAttached) {
        document.getElementById('btnOpenHistoryModal')?.addEventListener('click', () => {
          document.getElementById('historyModal').style.display = 'flex';
          const q = document.getElementById('historySearch')?.value || '';
          window.renderFullHistory(q);
        });
        document.getElementById('closeHistoryModalBtn')?.addEventListener('click', () => {
          document.getElementById('historyModal').style.display = 'none';
        });
        window._historyEvAttached = true;
      }
      document.getElementById('historySearch')?.addEventListener('input', (e) => {
        renderFullHistory(e.target.value);
      });

      // Revenue Modal
      let revenueChartInstance = null;
      const drawRevenueBarChart = (breakdown) => {
        const canvas = document.getElementById('revenueBarChart');
        if (!canvas) return;
        
        if (revenueChartInstance) revenueChartInstance.destroy();

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.6)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.1)');

        revenueChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['WEEKLY', 'MONTHLY', '6 MONTHS', 'YEARLY'],
            datasets: [{
              label: 'Revenue',
              data: [breakdown.weekly, breakdown.monthly, breakdown.sixMonths, breakdown.yearly],
              backgroundColor: gradient,
              borderColor: '#6366f1',
              borderWidth: 2,
              borderRadius: 12,
              borderSkipped: false,
              barThickness: 45,
              hoverBackgroundColor: '#8b5cf6',
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleFont: { size: 12, weight: 'bold', family: 'Outfit' },
                bodyFont: { size: 14, weight: 'bold', family: 'Outfit' },
                padding: 15,
                cornerRadius: 12,
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                callbacks: {
                  label: (ctx) => ' ₱' + ctx.raw.toLocaleString()
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                ticks: {
                  color: '#64748b',
                  font: { size: 10, weight: '500' },
                  callback: (val) => '₱' + (val >= 1000 ? (val/1000) + 'k' : val)
                }
              },
              x: {
                grid: { display: false, drawBorder: false },
                ticks: { color: '#94a3b8', font: { size: 10, weight: '700' } }
              }
            },
            animation: { duration: 1200, easing: 'easeOutQuart' }
          }
        });

        // 📈 Update Growth Indicators
        const updateGrowth = (id, current, previous) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (!previous || previous === 0) {
                el.textContent = 'NEW';
                el.className = 'growth-indicator growth-up';
                return;
            }
            const diff = ((current - previous) / previous) * 100;
            const text = (diff >= 0 ? '↑ ' : '↓ ') + Math.abs(diff).toFixed(1) + '%';
            el.textContent = text;
            
            if (diff > 0) el.className = 'growth-indicator growth-up';
            else if (diff < 0) el.className = 'growth-indicator growth-down';
            else el.className = 'growth-indicator growth-neutral';
        };

        updateGrowth('weeklyGrowth', breakdown.weekly, breakdown.lastWeekly);
        updateGrowth('monthlyGrowth', breakdown.monthly, breakdown.lastMonthly);
      };

      document.getElementById('revenueCard')?.addEventListener('click', () => {
        document.getElementById('revenueModal').classList.add('active');
        if (window.recentSalesData && window.recentSalesData.breakdown) {
          drawRevenueBarChart(window.recentSalesData.breakdown);
        }
      });
      document.getElementById('closeRevenueModalBtn')?.addEventListener('click', () => {
        document.getElementById('revenueModal').classList.remove('active');
      });

      // ── Donut Chart for Payment Methods ──
      const methodStats = {};
      payments.forEach(p => {
        const m = p.payment_method || p.method || 'Cash';
        methodStats[m] = (methodStats[m] || 0) + 1;
      });

      const canvas = document.getElementById('donutChart');
      const legend = document.getElementById('donutLegend');
      if (canvas && legend) {
        const keys = Object.keys(methodStats);
        const total = Object.values(methodStats).reduce((a, b) => a + b, 0);
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

        if (!keys.length || total === 0) {
          legend.innerHTML = '<p style="font-size:0.8rem;color:var(--text-dim)">No data yet</p>';
        } else {
          const ctx = canvas.getContext('2d');
          
          if (window.donutChartInstance) window.donutChartInstance.destroy();

          window.donutChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: keys,
              datasets: [{
                data: Object.values(methodStats),
                backgroundColor: colors,
                borderColor: 'rgba(15, 23, 42, 0.5)',
                borderWidth: 2,
                hoverOffset: 10
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '70%',
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  padding: 10,
                  cornerRadius: 8,
                  callbacks: {
                    label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${((ctx.raw/total)*100).toFixed(0)}%)`
                  }
                }
              }
            },
            plugins: [{
              id: 'centerText',
              afterDraw: (chart) => {
                const { ctx, chartArea: { left, top, width, height } } = chart;
                ctx.save();
                ctx.font = 'bold 22px Outfit';
                ctx.fillStyle = '#e2e8f0';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(total, left + width / 2, top + height / 2 - 5);
                
                ctx.font = '600 10px Inter';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('TOTAL', left + width / 2, top + height / 2 + 15);
                ctx.restore();
              }
            }]
          });

          // Custom Legend
          legend.innerHTML = keys.map((k, i) => `
            <div class="legend-item-pro" style="display:flex;align-items:center;gap:10px;padding:4px 0;">
              <span style="width:8px;height:8px;border-radius:50%;background:${colors[i % colors.length]};"></span>
              <span style="color:var(--text-dim);font-size:0.8rem;font-weight:600">${k}</span>
              <span style="color:var(--text-main);font-weight:700;margin-left:auto;font-size:0.85rem">${methodStats[k]}</span>
            </div>
          `).join('');
        }
      }


      // ── Business Intelligence: Efficiency Gauge ──
      const efficiencyCanvas = document.getElementById('efficiencyChart');
      if (efficiencyCanvas && s.breakdown) {
          const expected = s.breakdown.expectedMonthly || 0;
          const collected = s.breakdown.monthly || 0;
          const percent = expected > 0 ? Math.min(Math.round((collected / expected) * 100), 100) : 0;
          
          if(document.getElementById('efficiencyPercent')) document.getElementById('efficiencyPercent').textContent = percent + '%';
          if(document.getElementById('efficiencyTarget')) document.getElementById('efficiencyTarget').textContent = formatCurrency(expected);
          
          const ctx = efficiencyCanvas.getContext('2d');
          if (window.efficiencyChartInstance) window.efficiencyChartInstance.destroy();
          
          window.efficiencyChartInstance = new Chart(ctx, {
              type: 'doughnut',
              data: {
                  datasets: [{
                      data: [percent, 100 - percent],
                      backgroundColor: ['#6366f1', 'rgba(255,255,255,0.05)'],
                      borderWidth: 0,
                      circumference: 360,
                      rotation: 0,
                      cutout: '85%',
                      borderRadius: 10
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { tooltip: { enabled: false }, legend: { display: false } }
              }
          });
      }

      // ── Business Intelligence: Growth Trend ──
      const trendCanvas = document.getElementById('growthTrendChart');
      if (trendCanvas && s.breakdown && s.breakdown.monthlyTrends) {
          const trendData = s.breakdown.monthlyTrends;
          const ctx = trendCanvas.getContext('2d');
          if (window.growthTrendChartInstance) window.growthTrendChartInstance.destroy();
          
          const gradient = ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
          gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

          window.growthTrendChartInstance = new Chart(ctx, {
              type: 'line',
              data: {
                  labels: trendData.map(d => d.month),
                  datasets: [{
                      label: 'Revenue',
                      data: trendData.map(d => d.total),
                      borderColor: '#6366f1',
                      borderWidth: 3,
                      fill: true,
                      backgroundColor: gradient,
                      tension: 0.4,
                      pointBackgroundColor: '#6366f1',
                      pointRadius: 4,
                      pointHoverRadius: 6
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { display: false },
                      tooltip: {
                          backgroundColor: 'rgba(15, 23, 42, 0.9)',
                          padding: 12,
                          cornerRadius: 8,
                          callbacks: {
                              label: (ctx) => ` ₱${ctx.raw.toLocaleString()}`
                          }
                      }
                  },
                  scales: {
                      y: {
                          beginAtZero: true,
                          grid: { color: 'rgba(255,255,255,0.03)' },
                          ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => '₱' + v.toLocaleString() }
                      },
                      x: {
                          grid: { display: false },
                          ticks: { color: '#64748b', font: { size: 10 } }
                      }
                  }
              }
          });
      }

      document.getElementById('soaSearch')?.addEventListener('input', (e) => renderSalesTable(e.target.value));

    } catch(e) { console.error('Sales load error:', e); }

  };
  
  // Attach history search listener properly
  document.getElementById('historySearch')?.addEventListener('input', (e) => {
    if (window.renderFullHistory) window.renderFullHistory(e.target.value);
  });

  loadSales();
  setInterval(loadSales, 30000);
}

window.openVoidModal = (paymentId) => {
  const modal = document.getElementById('voidModal');
  if (!modal) return;
  
  window._activeVoidId = paymentId;
  modal.style.display = 'flex';
  
  // Set default checkbox state
  document.getElementById('voidRollbackCheck').checked = true;
};

document.addEventListener('DOMContentLoaded', () => {
    const vModal = document.getElementById('voidModal');
    const closeBtn = document.getElementById('closeVoidModalBtn');
    const cancelBtn = document.getElementById('cancelVoidBtn');
    const confirmBtn = document.getElementById('confirmVoidBtn');

    const hide = () => { if (vModal) vModal.style.display = 'none'; };
    if (closeBtn) closeBtn.onclick = hide;
    if (cancelBtn) cancelBtn.onclick = hide;

    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const pid = window._activeVoidId;
            const rollback = document.getElementById('voidRollbackCheck').checked;
            const reason = document.getElementById('voidReason').value;

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Voiding...';

            try {
                const res = await fetch(`/api/admin/payments/${pid}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rollback, reason })
                });

                const data = await res.json();
                if (res.ok) {
                    window.showSuccess('Payment Voided', `Record removed successfully.${rollback ? ' Billing date rolled back.' : ''}`);
                    hide();
                    if (window.loadSales) window.loadSales();
                    if (window.loadDashboard) window.loadDashboard();
                    if (window.broadcastUpdate) window.broadcastUpdate('payment_voided');
                } else {
                    window.showError('Void Failed', data.error || 'Server error');
                }
            } catch (err) {
                window.showCustomAlert('Error', 'Network connection failed.', true);
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirm Void';
            }
        };
    }
});

if (pageName === 'clients') {
  loadClientsTable();
  
  const syncMikrotikBtn = document.getElementById('syncMikrotikBtn');
  if (syncMikrotikBtn) {
    syncMikrotikBtn.addEventListener('click', async () => {
      const confirmMsg = 'Are you sure you want to sync client secrets from the MikroTik router? This will copy all PPPoE secrets that do not exist in the local directory.';
      if (!await window.customConfirmAsync('Sync from MikroTik', confirmMsg)) return;

      const originalContent = syncMikrotikBtn.innerHTML;
      syncMikrotikBtn.disabled = true;
      syncMikrotikBtn.innerHTML = `<span class="spinner" style="display:inline-block; margin-right:8px; width:14px; height:14px; border-width:2px; vertical-align:middle;"></span> Syncing...`;

      try {
        const res = await fetch('/api/admin/clients/sync-mikrotik', { method: 'POST' });
        const data = await res.json();
        
        if (res.ok && data.success) {
          window.showCustomAlert('Sync Completed', data.message, false);
          loadClientsTable();
          if (window.broadcastUpdate) window.broadcastUpdate('client_data_change');
        } else {
          window.showCustomAlert('Sync Failed', data.error || 'Failed to complete synchronization.', true);
        }
      } catch (err) {
        window.showCustomAlert('Connectivity Error', 'Could not reach the server. Please check your internet connection.', true);
      } finally {
        syncMikrotikBtn.disabled = false;
        syncMikrotikBtn.innerHTML = originalContent;
      }
    });
  }
  
  const addClientBtn = document.getElementById('addClientBtn');
  const addClientModal = document.getElementById('addClientModal');
  const addClientForm = document.getElementById('addClientForm');
  const dateInp = document.getElementById('installDateInput');
  const nextDueInp = document.getElementById('nextDueInput');

  // Due Date Picker configuration

  // Initialize Flatpickr
  if (typeof flatpickr !== 'undefined') {
    flatpickr(".datepicker", {
      dateFormat: "Y-m-d",
      allowInput: true,
      theme: "dark"
    });
  }

  if (addClientBtn) {
    addClientBtn.addEventListener('click', () => {
      document.getElementById('clientModalTitle').textContent = 'Add New Client';
      document.getElementById('saveClientBtn').textContent = 'Create Client';
      document.getElementById('client_id').value = '';
      

      addClientForm.reset();
      
      // Default to 17th of the Month for new clients
      if (document.getElementById('billingDaySelect')) {
          document.getElementById('billingDaySelect').value = '17';
      }
      // Load Dynamic Profiles from DB
      window.loadInternetPlans();
      
      addClientModal.classList.add('active');
    });
  }

  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.onclick = () => addClientModal.classList.remove('active');
  });

  if (addClientForm) {
    addClientForm.onsubmit = async (e) => {
      e.preventDefault();
      const clientId = document.getElementById('client_id').value;
      const isEdit = !!clientId;
      const saveBtn = document.getElementById('saveClientBtn');
      if (!saveBtn) return;
      
      saveBtn.disabled = true;
      const originalText = saveBtn.textContent;
      saveBtn.innerHTML = `<div class="spinner" style="width:14px;height:14px"></div> ${isEdit ? 'Updating...' : 'Saving...'}`;

      const formData = new FormData(addClientForm);
      const data = Object.fromEntries(formData.entries());
      
      // MikroTik Sync removed per user request

      try {
        const url = isEdit ? `/api/admin/clients/${clientId}` : '/api/admin/clients';
        const method = isEdit ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await res.json();
        if (res.ok) {
          window.showCustomAlert('System Update', isEdit ? 'Client updated successfully!' : 'New client added with Account ID: ' + result.account_id, false);
          addClientModal.classList.remove('active');
          addClientForm.reset();
          loadClientsTable();
          if (window.broadcastUpdate) window.broadcastUpdate('client_data_change');
        } else {
          window.showCustomAlert('Save Failed', result.error || 'Failed to save client data.', true);
        }
      } catch (err) {
        window.showCustomAlert('Network Error', 'Could not reach the database server.', true);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    };
  }

  const clientSearch = document.getElementById('clientSearch');
  if (clientSearch) {
    clientSearch.addEventListener('input', () => {
      const q = clientSearch.value.toLowerCase();
      document.querySelectorAll('#clientsTbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}

// ─── Global Features (Sync) ───


// ─── Dynamic Internet Plans (DB) ───
window.loadInternetPlans = async (selectedPlan = null) => {
  const planSelect = document.getElementById('planSelect');
  if (!planSelect) return;

  try {
    const res = await fetch('/api/admin/plans');
    const plans = await res.json();
    window.lastLoadedPlans = plans; 

    if (plans && plans.length > 0) {
      planSelect.innerHTML = plans.map(p => 
        `<option value="${p.name}" ${p.name === selectedPlan || p.id === selectedPlan ? 'selected' : ''}>${p.name}</option>`
      ).join('');
      
      if (!selectedPlan) {
        planSelect.selectedIndex = 0;
      }
    } else {
      planSelect.innerHTML = `<option value="">No plans configured. Go to Settings to add plans.</option>`;
    }
  } catch (err) {
    planSelect.innerHTML = `<option value="20mbps">20 Mbps (Fallback)</option>`;
  }
  
  planSelect.dispatchEvent(new Event('change'));
};

// Plan change listener removed because the monthly fee override was removed

// ─── Push to MikroTik Logic ───

// ─── Nav Badges (Global) ───
async function updateNavBadges() {
  try {
    const res = await fetch('/api/admin/dashboard');
    if (res.status === 401) return;
    const data = await res.json();
    updateBadge('navAppBadge', data.stats.pendingApps);
    updateBadge('navTicketBadge', data.stats.openTickets);
  } catch (e) {}
}

if (pageName !== 'dashboard') {
  updateNavBadges();
}

// ─── Maintenance Module Logic ───
if (pageName === 'maintenance') {
  const loadMaintenanceStats = async () => {
    try {
      const res = await fetch('/api/admin/maintenance/stats?_t=' + Date.now());
      if (!res.ok) throw new Error('Failed to fetch system stats');
      const data = await res.json();
      
      const elNode = document.getElementById('statNodeVersion');
      const elDb = document.getElementById('statDbSize');
      const elRam = document.getElementById('statRamUsage');
      const elUptime = document.getElementById('statUptime');

      if(elNode) elNode.textContent = data.nodeVersion || 'N/A';
      if(elDb) elDb.textContent = data.dbSize || '0 KB';
      if(elRam) elRam.textContent = data.ramUsage || '0 MB';
      if(elUptime) elUptime.textContent = data.uptime || '0 mins';
    } catch (err) {
      console.error('Maintenance stats error:', err);
    }
  };

  loadMaintenanceStats();
  setInterval(loadMaintenanceStats, 10000); // 10s refresh

  document.getElementById('btnMainBackup')?.addEventListener('click', () => {
    window.location.href = '/api/admin/backup';
  });

  document.getElementById('btnEmailBackup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnEmailBackup');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Sending to Gmail...';
    
    try {
      const res = await fetch('/api/admin/maintenance/email-backup', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('Database backup has been sent to your Gmail!');
      } else {
        alert('Failed to send backup: ' + (data.error || 'Server error'));
      }
    } catch(err) {
      alert('Error connecting to server.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  const btnAudit = document.getElementById('btnRunAuditScan');
  if (btnAudit) {
    btnAudit.addEventListener('click', async () => {
      const resultsArea = document.getElementById('auditResultsArea');
      const originalText = btnAudit.innerHTML;
      btnAudit.disabled = true;
      btnAudit.innerHTML = '<span class="loading-spinner" style="border-width:2px; width:12px; height:12px; margin-right:8px;"></span> ANALYZING...';
      
      try {
        const res = await fetch('/api/admin/billing/analyze');
        const data = await res.json();
        
        if (data.success) {
          resultsArea.style.display = 'block';
          resultsArea.innerHTML = `
            <div style="background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:16px; padding:1.5rem; animation: fadeIn 0.4s ease-out;">
              <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:15px; margin-bottom:20px;">
                 <div style="background:rgba(16, 185, 129, 0.1); border:1px solid rgba(16, 185, 129, 0.2); padding:15px; border-radius:12px; text-align:center;">
                    <div style="font-size:0.6rem; color:#10b981; font-weight:800; text-transform:uppercase; margin-bottom:5px;">Good Standing</div>
                    <div style="font-size:1.8rem; font-weight:900; color:#10b981; font-family:'Outfit';">${data.standing}</div>
                 </div>
                 <div style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.2); padding:15px; border-radius:12px; text-align:center;">
                    <div style="font-size:0.6rem; color:#f59e0b; font-weight:800; text-transform:uppercase; margin-bottom:5px;">Pending Notifications</div>
                    <div style="font-size:1.8rem; font-weight:900; color:#f59e0b; font-family:'Outfit';">${data.reminders.length}</div>
                 </div>
                 <div style="background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.2); padding:15px; border-radius:12px; text-align:center;">
                    <div style="font-size:0.6rem; color:#ef4444; font-weight:800; text-transform:uppercase; margin-bottom:5px;">Immediate Suspensions</div>
                    <div style="font-size:1.8rem; font-weight:900; color:#ef4444; font-family:'Outfit';">${data.suspensions.length}</div>
                 </div>
              </div>

              ${data.suspensions.length > 0 ? `
                <div style="margin-top:15px;">
                  <h5 style="font-size:0.7rem; color:#ef4444; font-weight:800; margin-bottom:8px;">🚨 CLIENTS TO BE SUSPENDED:</h5>
                  <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${data.suspensions.map(s => `<span style="background:rgba(239, 68, 68, 0.1); padding:4px 10px; border-radius:6px; font-size:0.75rem; color:#ef4444; border:1px solid rgba(239,68,68,0.2);">${s.name} (${s.days}d Overdue)</span>`).join('')}
                  </div>
                </div>
              ` : ''}

              <div style="margin-top:20px; text-align:center; padding-top:15px; border-top:1px solid var(--border);">
                 <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom:0;">These actions will trigger <strong>automatically</strong> at 12:00 AM Manila Time.</p>
              </div>
            </div>
          `;
        }
      } catch (err) {
        alert('Analysis failed: ' + err.message);
      } finally {
        btnAudit.disabled = false;
        btnAudit.innerHTML = originalText;
      }
    });
  }


  // Broadcast and Maintenance listeners already consolidated at the start of the block ───
  const bFilter = document.getElementById('broadcastFilter');
  const bSelectList = document.getElementById('clientSelectList');
  const bCheckboxContainer = document.getElementById('clientCheckboxContainer');
  
  // Communication Hub Logic Decommissioned

  document.getElementById('btnMainPush')?.addEventListener('click', () => {
    const pushBtn = document.getElementById('pushToMikroTikBtn');
    if (pushBtn) pushBtn.style.display = 'none';
  });

}

// Helper to get price from plan name
const getPlanPrice = (planName) => {
  if (!planName) return 999;
  const p = planName.toLowerCase();
  if (p.includes('10mbps')) return 799;
  if (p.includes('20mbps')) return 999;
  if (p.includes('30mbps')) return 1199;
  if (p.includes('50mbps')) return 1499;
  return 999; // Default
};

// ─── Customer Billing Ledger Logic (PRO WITH YEARLY FILTER) ───
window.showClientLedger = async (clientId) => {
  const modal = document.getElementById('ledgerModal');
  const tbody = document.getElementById('ledgerTbody');
  const title = document.getElementById('ledgerModalTitle');
  const subtitle = document.getElementById('ledgerModalSubtitle');
  const yearFilter = document.getElementById('ledgerYearFilter');
  const balDueEl = document.getElementById('ledgerBalanceDue');
  const totalPaidEl = document.getElementById('ledgerTotalAmountPaid');

  if (!modal || !tbody) return;
  modal.classList.add('active');
  tbody.innerHTML = '<tr><td colspan="5" class="loading-cell"><div class="spinner"></div> Loading Records...</td></tr>';
  
  try {
    const [cRes, pRes] = await Promise.all([
      fetch(`/api/admin/clients/${clientId}`),
      fetch(`/api/admin/payments?clientId=${clientId}`)
    ]);
    
    const client = await cRes.json();
    const allPayments = await pRes.json();
    
    // 🛡️ Safety: Ensure allPayments is an array
    const pArr = Array.isArray(allPayments) ? allPayments : [];

    const clientPayments = pArr.sort((a,b) => {
        const dateA = window.safeParseDate(a?.due_date || a?.paid_date || a?.created_at) || new Date(0);
        const dateB = window.safeParseDate(b?.due_date || b?.paid_date || b?.created_at) || new Date(0);
        return dateB - dateA;
    });

    const cleanName = (client?.full_name || 'Unknown Client').split(' | ')[0].trim();
    title.textContent = `Payment History: ${cleanName}`;
    subtitle.textContent = `Account ID: ${client?.account_id || 'N/A'} • Plan: ${client?.plan || 'No Plan'}`;

    // 🏷️ Populate Print Branding
    const pBrand = document.getElementById('ledgerPrintBrand');
    const pLogo = document.getElementById('ledgerPrintLogo');
    const pDate = document.getElementById('ledgerPrintDate');
    
    if (pBrand) pBrand.textContent = localStorage.getItem('isp_brand_name') || 'JKL FIBER';
    if (pDate) pDate.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (pLogo) {
        const cachedLogo = localStorage.getItem('isp_brand_logo');
        if (cachedLogo) pLogo.innerHTML = `<img src="${cachedLogo}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        else pLogo.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" style="width:40px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    }

    // 📅 Robust Year Extraction
    const years = new Set();
    clientPayments.forEach(p => {
        const d = window.safeParseDate(p?.due_date || p?.paid_date || p?.created_at);
        if (d && typeof d.getFullYear === 'function') years.add(d.getFullYear());
    });

    const yearList = Array.from(years).sort((a,b) => b - a);
    const currentYear = new Date().getFullYear();
    
    let filterToUse = currentYear;
    if (yearFilter) {
        yearFilter.innerHTML = `<option value="all">All Years</option>` + 
            yearList.map(y => `<option value="${y}">${y} Records</option>`).join('');
        
        if (years.has(currentYear)) yearFilter.value = currentYear;
        else if (yearList.length > 0) yearFilter.value = yearList[0];
        else yearFilter.value = 'all';

        filterToUse = yearFilter.value;

        // Clone to clear listeners
        const newFilter = yearFilter.cloneNode(true);
        yearFilter.parentNode.replaceChild(newFilter, yearFilter);
        newFilter.addEventListener('change', () => renderRows(newFilter.value));
    }

    const renderRows = (filterYear) => {
        try {
            const filtered = filterYear === 'all' 
                ? clientPayments 
                : clientPayments.filter(p => {
                    const d = window.safeParseDate(p?.due_date || p?.paid_date || p?.created_at);
                    return d && typeof d.getFullYear === 'function' && d.getFullYear().toString() === filterYear.toString();
                });

            // Calculate totals
            let totalAmountPaid = 0;
            let balanceDue = 0;
            
            clientPayments.forEach(p => {
                const isPaid = (p.status || '').toLowerCase() === 'paid';
                const amt = parseFloat(p.amount) || 0;
                
                if (isPaid) {
                    totalAmountPaid += amt;
                } else {
                    // Current balance due is the sum of all unpaid amounts
                    balanceDue += amt;
                }
            });

            // 🛡️ Fallback: If totals are 0, check the calendar to see if they are overdue
            if (balanceDue === 0 && client && client.next_due_date) {
                const today = new Date();
                const dDue = window.safeParseDate(client.next_due_date);
                // If today is past the due date by more than 1 day (grace)
                if (dDue && today > new Date(dDue.getTime() + (24 * 60 * 60 * 1000))) {
                    const diffMonths = (today.getFullYear() - dDue.getFullYear()) * 12 + (today.getMonth() - dDue.getMonth());
                    const monthsLate = Math.max(1, diffMonths + (today.getDate() >= dDue.getDate() ? 1 : 0));
                    const rate = parseFloat(client.monthly_rate) || 0;
                    balanceDue = monthsLate * rate;
                    totalOutstanding = balanceDue;
                    
                    // Visual Hint for Fallback
                    if (balDueEl) {
                        balDueEl.textContent = `₱${balanceDue.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                        balDueEl.innerHTML += `<div style="font-size:0.6rem; color:var(--danger); margin-top:2px; font-weight:600; text-transform:uppercase;">Auto-Calculated (Past Due)</div>`;
                    }
                    if (totalPaidEl) totalPaidEl.textContent = `₱${totalAmountPaid.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                } else {
                    if (balDueEl) balDueEl.textContent = `₱${balanceDue.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                    if (totalPaidEl) totalPaidEl.textContent = `₱${totalAmountPaid.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                }
            } else {
                if (balDueEl) balDueEl.textContent = `₱${balanceDue.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                if (totalPaidEl) totalPaidEl.textContent = `₱${totalAmountPaid.toLocaleString(undefined, {minimumFractionDigits:2})}`;
            }

            if (!filtered.length) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:3rem; color:var(--text-dim);">No records for ${filterYear}</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(p => {
                if (!p) return '';
                const pStatus = (p.status || 'pending').toLowerCase();
                const isPaid = pStatus === 'paid';
                const isOverdue = pStatus === 'overdue' || pStatus === 'unpaid';
                const amt = parseFloat(p.amount) || 0;

                let statusClass = 'status-paid';
                let statusIcon = 'fa-check-circle';
                if (isOverdue) { statusClass = 'status-overdue'; statusIcon = 'fa-exclamation-circle'; }
                else if (!isPaid) { statusClass = 'status-pending'; statusIcon = 'fa-clock'; }

                return `
                    <tr class="${!isPaid ? 'row-unpaid' : ''}">
                        <td>
                            <div style="font-weight:700; color:var(--text-main); font-size:0.9rem">${p.remarks || 'Standard Billing'}</div>
                            <div style="font-size:0.7rem; color:var(--text-dim)">Reference ID: #${p.id || 'N/A'}</div>
                        </td>
                        <td><span style="font-family:'JetBrains Mono', monospace; font-size:0.85rem; font-weight:600; color:var(--text-main)">${window.formatDate(p.due_date)}</span></td>
                        <td style="font-weight:800; font-size:1rem; color:var(--text-main)">₱${amt.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                        <td><span class="status-pill ${statusClass}" style="font-size:0.7rem; letter-spacing:0.5px"><i class="fas ${statusIcon}"></i> ${(p.status || 'PENDING').toUpperCase()}</span></td>
                        <td style="text-align:right">
                            <div style="font-size:0.75rem; color:var(--text-dim); font-weight:500;">
                                ${isPaid ? window.formatDateTime(p.paid_date || p.created_at) : '<span style="opacity:0.6; font-style:italic">Awaiting Payment</span>'}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (innerErr) {
            console.error('RenderRows Error:', innerErr);
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger)">Error rendering rows: ${innerErr.message}</td></tr>`;
        }
    };

    renderRows(filterToUse);

  } catch(e) { 
    console.error('Ledger Error:', e); 
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--danger)">Failed to load records.</td></tr>';
  }
};

window.printLedger = () => {
  const ledgerTitle = document.getElementById('ledgerModalTitle')?.textContent || 'Ledger';
  const originalTitle = document.title;
  document.title = `${ledgerTitle}_Statement`;
  window.print();
  document.title = originalTitle;
};
window.payViaLedger = (clientId, dueDate, amount) => {
  document.getElementById('ledgerModal').classList.remove('active');
  
  // Wait a bit for the ledger to close before opening payment modal
  setTimeout(() => {
    const recordBtn = document.getElementById('recordPaymentBtn');
    if (recordBtn) {
      recordBtn.click();
      
      // We need to wait for the client search results to be ready or just force set it
      // Since recording payment uses a search, let's wait 300ms for it to be ready
      setTimeout(async () => {
        const searchInp = document.getElementById('payClientSearch');
        const hiddenId = document.getElementById('payClientSelect');
        const amountInp = document.getElementById('payAmount');
        const dateInp = document.getElementById('payDate'); // Date Paid (Today)
        
        // Fetch client name for the search box
        const res = await fetch(`/api/admin/clients/${clientId}`);
        const client = await res.json();
        
        searchInp.value = `${client.full_name} (${client.account_id})`;
        hiddenId.value = clientId;
        amountInp.value = amount;
        
        // Set the Remarks to "Back-payment" or similar if needed
        const remarksInp = document.getElementById('payRemarks');
        if (remarksInp) remarksInp.value = 'Ledger Payment';
        
        // Optional: We can't easily change the "Due Date" in the current payment modal 
        // since it's calculated on top, but the API handles the due_date if we send it.
        // Let's add a hidden field in the form for due_date if it's from ledger.
        let ledgerDue = document.getElementById('payLedgerDueDate');
        if (!ledgerDue) {
          ledgerDue = document.createElement('input');
          ledgerDue.type = 'hidden';
          ledgerDue.id = 'payLedgerDueDate';
          document.getElementById('paymentForm').appendChild(ledgerDue);
        }
        ledgerDue.value = dueDate;
      }, 300);
    }
  }, 300);
};

// ─── Global Close Listeners ───
document.querySelectorAll('.close-ledger-btn').forEach(btn => {
  btn.onclick = () => document.getElementById('ledgerModal').classList.remove('active');
});

// Update window resize/click for ledger
window.addEventListener('click', (e) => {
  const modal = document.getElementById('ledgerModal');
  if (e.target === modal) modal.classList.remove('active');
});

// ─── System Licensing & Activation ───
window.copyMachineId = () => {
  const idElement = document.getElementById('licMachineId');
  if (!idElement || idElement.textContent === 'FETCHING...') return;
  navigator.clipboard.writeText(idElement.textContent).then(() => {
    const btn = document.querySelector('[onclick="copyMachineId()"]');
    const original = btn.innerHTML;
    btn.innerHTML = '<svg fill="none" stroke="#22c55e" stroke-width="2" viewBox="0 0 24 24" style="width:16px"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => btn.innerHTML = original, 2000);
  });
};

async function loadLicenseStatus() {
  const licCard = document.getElementById('licensingCard');
  if (!licCard) return;

  try {
    const res = await fetch('/api/admin/system/license');
    const data = await res.json();
    
    document.getElementById('licMachineId').textContent = data.machineId;
    const badge = document.getElementById('licStatusBadge');
    const hint = document.getElementById('licMaskedHint');
    
    hint.textContent = data.maskedKey !== 'NONE' ? `Current Key: ${data.maskedKey}` : 'No license key activated yet.';

    if (data.status === 'ACTIVE') {
      badge.textContent = 'ACTIVATED';
      badge.className = 'status-pill active';
      badge.style.background = '#065f46';
      badge.style.color = '#34d399';
    } else {
      badge.textContent = data.status;
      badge.className = 'status-pill overdue';
      badge.style.background = '#7f1d1d';
      badge.style.color = '#f87171';
    }
  } catch (e) {
    console.error('Failed to load license status', e);
  }
}

document.getElementById('btnUpdateLicense')?.addEventListener('click', async (e) => {
  const keyInput = document.getElementById('licKeyInput');
  const key = keyInput.value.trim();
  if (!key) return alert('Please enter a license key.');

  if (!await window.customConfirmAsync('Activate System', 'Applying a new license key will update your system configuration. Continue?')) return;

  const btn = e.target;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Activating...';

  try {
    const res = await fetch('/api/public/license-activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    
    if (data.success) {
      alert('System activated successfully! Reloading...');
      window.location.reload();
    } else {
      alert('Activation Failed: ' + (data.detail || data.error));
    }
  } catch (err) {
    alert('Server communication failed.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
});

// ─── Modal Close Listeners ───
document.addEventListener('DOMContentLoaded', () => {
    // Ledger Modal
    document.getElementById('closeLedgerModalBtn')?.addEventListener('click', () => {
        document.getElementById('ledgerModal').classList.remove('active');
    });
    document.querySelectorAll('.close-ledger-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('ledgerModal').classList.remove('active');
        });
    });
});

window.exportLedgerPDF = () => {
    if (typeof window.printLedger === 'function') {
        window.printLedger();
    } else {
        window.print();
    }
};

// ─── SMS Gateway Helpers ───
window.toggleSmsFields = () => {
    const andGroup = document.getElementById('group_sms_android');
    const featGroup = document.getElementById('group_feature_control');
    const descText = document.getElementById('sms_mode_desc_text');
    const modeIcon = document.getElementById('sms_mode_icon');
    if (!andGroup) return;

    andGroup.style.display = 'block';
    if (featGroup) featGroup.style.display = 'none';
    if (descText) descText.textContent = "Android Mode: Unlimited free SMS sending. Requires your phone to be on the same WiFi. Background queuing and auto-retry are fully active.";
    if (modeIcon) modeIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.28-2.28a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
};

document.getElementById('btnTestSms')?.addEventListener('click', async () => {
    const ip   = document.getElementById('cfg_sms_android_ip')?.value;
    const type = document.getElementById('cfg_sms_gateway_type')?.value;
    if (!ip) return alert('Enter Phone IP first');

    const btn = document.getElementById('btnTestSms');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Testing...';

    try {
        const res = await fetch('/api/admin/maintenance/sms/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, type })
        });
        
        const data = await res.json();
        if (res.ok) {
            if (window.showCustomAlert) {
                window.showCustomAlert('SMS Success', '✅ ' + data.message, false);
            } else {
                alert('✅ ' + data.message);
            }
        } else {
            const detail = data.detail || 'The server could not communicate with the phone.';
            if (window.showCustomAlert) {
                window.showCustomAlert('SMS Failure: ' + data.error, detail, true);
            } else {
                alert('❌ ' + data.error + '\n\n' + detail);
            }
        }
    } catch (err) {
        const msg = 'Could not reach the server. Make sure the ISP Monitor is running.';
        if (window.showCustomAlert) {
            window.showCustomAlert('Error', msg, true);
        } else {
            alert('❌ Network error testing link.');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
});


// Run on page load if maintenance tab active
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('maintenance')) {
    if (typeof loadLicenseStatus === 'function') loadLicenseStatus();
  }

  // ─── SMS WATCHDOG: SIDEBAR INJECTION & POLLING ───
  const injectSmsWatchdog = () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || document.querySelector('.gateway-status-widget')) return;

    const widget = document.createElement('div');
    widget.className = 'gateway-status-widget';
    widget.innerHTML = `
      <div class="status-pill-container" onclick="window.showSmsQueueViewer()" style="cursor: pointer;" title="Click to view pending queue">
        <div class="status-meta">
          <span class="status-pill-label">System Pulse</span>
          <span class="status-pill-value">
            <div id="smsStatusDot" class="pulsar-dot checking pulse"></div>
            <span id="smsStatusText">Checking...</span>
          </span>
        </div>
        <div class="status-icon-box" style="opacity: 0.2;">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.28-2.28a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        </div>
      </div>
    `;
    const footer = sidebar.querySelector('.sidebar-footer');
    if (footer) {
      sidebar.insertBefore(widget, footer);
    } else {
      sidebar.appendChild(widget);
    }
  };

  window.showSmsQueueViewer = async () => {
    const modalElement = document.querySelector('.premium-modal');
    if (modalElement) modalElement.style.maxWidth = '650px';

    window.showPremiumModal({
      title: 'Outgoing SMS Queue',
      html: `
        <div style="text-align:center; padding:20px; color:var(--text-dim);">
          <div class="pulsar-dot checking pulse" style="display:inline-block; margin-bottom:10px;"></div>
          <div>Loading outgoing queue logs...</div>
        </div>
      `,
      iconHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
      iconBg: 'rgba(99, 102, 241, 0.1)',
      iconColor: 'var(--primary)',
      buttons: [
        { text: 'Clear Entire Queue', type: 'danger', onClick: async () => {
            if (confirm('Are you sure you want to completely clear all queued messages?')) {
              await fetch('/api/admin/maintenance/sms/queue/clear', { method: 'POST' });
              window.showSmsQueueViewer();
            }
          }, preventClose: true 
        },
        { text: 'Refresh', type: 'confirm', onClick: () => window.showSmsQueueViewer(), preventClose: true },
        { text: 'Close', type: 'secondary', onClick: () => {
            if (modalElement) modalElement.style.maxWidth = '400px';
            window.closePremiumModal();
          } 
        }
      ]
    });

    try {
      const res = await fetch('/api/admin/maintenance/sms/logs');
      if (!res.ok) throw new Error('Failed to fetch SMS queue logs.');
      const logs = await res.json();

      let rowsHtml = '';
      if (!logs || logs.length === 0) {
        rowsHtml = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-dim); font-size:0.85rem;">No SMS queue logs found.</td></tr>`;
      } else {
        logs.forEach(l => {
          let statusColor = 'var(--text-dim)';
          let statusText = l.status || 'unknown';
          if (l.status === 'sent') {
            statusColor = '#10b981';
            statusText = 'Sent';
          } else if (l.status === 'failed') {
            statusColor = '#ef4444';
            statusText = 'Failed';
          } else if (l.status === 'pending') {
            statusColor = '#f59e0b';
            statusText = 'Pending';
          }

          const rawDate = l.created_at || l.sent_at || '';
          const dateStr = rawDate ? new Date(parseInt(rawDate) ? parseInt(rawDate) : rawDate).toLocaleString() : 'N/A';

          rowsHtml += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
              <td style="padding:10px; font-weight:700; color:var(--text);">${l.recipient_name || 'Customer'}</td>
              <td style="padding:10px; font-family:monospace; color:var(--primary);">${l.number || ''}</td>
              <td style="padding:10px; color:var(--text-dim); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${l.message || ''}">${l.message || ''}</td>
              <td style="padding:10px; text-align:right;"><span style="color:${statusColor}; font-weight:800; text-transform:uppercase; font-size:0.75rem;">${statusText}</span></td>
            </tr>
          `;
        });
      }

      window.showPremiumModal({
        title: 'Outgoing SMS Queue',
        html: `
          <div style="max-height:400px; overflow-y:auto; border:1px solid var(--border); border-radius:12px; background:rgba(0,0,0,0.2); margin-top:10px;">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:2px solid var(--border); font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">
                  <th style="padding:10px;">Recipient</th>
                  <th style="padding:10px;">Number</th>
                  <th style="padding:10px;">Message Preview</th>
                  <th style="padding:10px; text-align:right;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `,
        iconHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
        iconBg: 'rgba(99, 102, 241, 0.1)',
        iconColor: 'var(--primary)',
        buttons: [
          { text: 'Clear Entire Queue', type: 'danger', onClick: async () => {
              if (confirm('Are you sure you want to completely clear all queued messages?')) {
                await fetch('/api/admin/maintenance/sms/queue/clear', { method: 'POST' });
                window.showSmsQueueViewer();
              }
            }, preventClose: true 
          },
          { text: 'Refresh', type: 'confirm', onClick: () => window.showSmsQueueViewer(), preventClose: true },
          { text: 'Close', type: 'secondary', onClick: () => {
              if (modalElement) modalElement.style.maxWidth = '400px';
              window.closePremiumModal();
            } 
          }
        ]
      });
    } catch(err) {
      window.showError('Fetch Error', err.message);
    }
  };

  const pollSmsStatus = async () => {
    try {
      const res = await fetch('/api/admin/maintenance/sms/status');
      const data = await res.json();
      
      const dot = document.getElementById('smsStatusDot');
      const text = document.getElementById('smsStatusText');
      if (!dot || !text) return;

      dot.classList.remove('online', 'offline', 'checking', 'pulsing');
      
      if (data.status === 'online') {
        dot.classList.add('online', 'pulsing');
        text.textContent = 'Gateway Ready';
      } else if (data.status === 'offline') {
        dot.classList.add('offline');
        text.textContent = 'System Halted';
      } else if (data.status === 'inactive') {
        dot.classList.add('checking');
        text.textContent = 'Idle';
      } else {
        dot.classList.add('offline');
        text.textContent = 'Link Error';
      }

      // ─── ADDITION: Show Pending Count ───
      if (data.queueCount > 0) {
        text.innerHTML = `${text.textContent} <span style="color:var(--warning); font-size:0.7rem;">(${data.queueCount} Pending)</span>`;
      }

      // Update Broadcast Health Widget
      const qWidget = document.getElementById('bc_queue_widget');
      if (qWidget && data.queueCount !== undefined) {
        if (data.queueCount > 0) {
           qWidget.style.display = 'block';
           document.getElementById('bc_queue_count').textContent = data.queueCount;
           document.getElementById('bc_queue_text').textContent = data.status === 'online' ? 'Processing Queue...' : 'Phone Offline: Queue Paused';
           const percent = Math.min(100, Math.max(5, (data.queueCount / 20) * 100)); 
           document.getElementById('bc_queue_bar').style.width = percent + '%';
        } else {
           qWidget.style.display = 'none';
        }
      }

      // Update Live Status Badge in Maintenance Tab
      const liveDot = document.getElementById('sms_live_dot');
      const liveStatus = document.getElementById('sms_live_status');
      if (liveDot && liveStatus) {
         liveDot.className = dot.className; // Sync with sidebar dot
         liveStatus.textContent = text.innerText; 
         if (data.status === 'online') {
            liveStatus.style.color = '#10b981';
         } else if (data.status === 'offline') {
            liveStatus.style.color = '#ef4444';
         } else {
            liveStatus.style.color = 'var(--text-dim)';
         }
      }
    } catch (e) {
      console.error('Watchdog Poll Error:', e);
    }
  };

  window.loadSmsLogs = async () => {
    const container = document.getElementById('dispatchFeedTbody');
    if (!container) return;

    try {
      const res = await fetch('/api/admin/maintenance/sms/logs');
      const logs = await res.json();

      if (logs.length === 0) {
        container.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:15px;">No logs found</td></tr>';
        return;
      }

      container.innerHTML = logs.map(l => `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
          <td style="padding:8px 10px;">
            <div style="font-weight:600; color:var(--primary);">${l.recipient_name || 'System'}</div>
            <div style="font-size:0.65rem; color:var(--text-dim);">${l.number}</div>
          </td>
          <td style="padding:8px 10px;">
            <span class="badge" style="font-size:0.6rem; padding:2px 6px; background:${l.status === 'sent' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${l.status === 'sent' ? '#10b981' : '#ef4444'};">
              ${l.status.toUpperCase()}
            </span>
          </td>
          <td style="padding:8px 10px; color:var(--text-dim); font-size:0.65rem;">
            ${l.sent_at ? new Date(l.sent_at).toLocaleString() : 'Pending'}
          </td>
        </tr>
      `).join('');
    } catch (e) {
      container.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--danger);">Error loading logs</td></tr>';
    }
  };

  // Initial load if container exists
  setTimeout(loadSmsLogs, 500);

  window.repairDueDates = async () => {
    if (!confirm('This will scan all clients and reset those with due dates beyond 6 months into the future to a sane baseline. Proceed?')) return;
    try {
      const btn = document.querySelector('button[onclick="repairDueDates()"]');
      const originalText = btn.innerText;
      btn.innerText = 'Repairing...';
      btn.disabled = true;

      const res = await fetch('/api/admin/maintenance/repair-dates', { method: 'POST' });
      const data = await res.json();
      
      btn.innerText = originalText;
      btn.disabled = false;

      if (data.success) {
        if (window.showCustomAlert) window.showCustomAlert('Repair Complete', data.message, false);
        else alert(data.message);
        if (typeof loadClients === 'function') loadClients();
      }
    } catch (err) {
      alert('Repair failed: ' + err.message);
    }
  };

  window.runBillingScan = () => {
    window.showPremiumModal({
      title: 'Run Billing Scan?',
      text: 'This will immediately scan all active clients and send out any due SMS and Email billing reminders. Do you want to continue?',
      iconHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
      iconBg: 'rgba(16, 185, 129, 0.1)',
      iconColor: '#10b981',
      buttons: [
        {
          text: 'Cancel',
          type: 'secondary',
          onClick: () => window.closePremiumModal()
        },
        {
          text: 'Run Scan',
          type: 'primary',
          onClick: async () => {
            window.closePremiumModal();
            try {
              const btn = document.querySelector('button[onclick="runBillingScan()"]');
              const originalText = btn.innerText;
              btn.innerText = 'Scanning...';
              btn.disabled = true;

              const res = await fetch('/api/admin/system/run-billing-checks', { method: 'POST' });
              const data = await res.json();
              
              btn.innerText = originalText;
              btn.disabled = false;

              if (data.success) {
                if (window.showCustomAlert) window.showCustomAlert('Billing Scan Complete', data.message, false);
                else alert(data.message);
              } else {
                alert('Scan failed: ' + data.error);
              }
            } catch (err) {
              alert('Scan failed: ' + err.message);
              const btn = document.querySelector('button[onclick="runBillingScan()"]');
              if (btn) {
                  btn.innerText = 'Run Billing Scan';
                  btn.disabled = false;
              }
            }
          }
        }
      ]
    });
  };

  // Attach watchdog after sidebar is ready
  window.addEventListener('sidebarLoaded', () => {
    injectSmsWatchdog();
    pollSmsStatus();
  });
  
  setInterval(pollSmsStatus, 15000); // Poll status every 15s

window.togglePassVisibility = (inputId) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
};

  // BROADCAST AUTO-REFRESHER
  setInterval(() => {
    const bcTab = document.getElementById('viewTabBroadcast');
    if (bcTab && bcTab.classList.contains('active')) {
      loadBroadcastHistory();
      loadSmsLogs();
      pollSmsStatus(); // Update the queue counts
    }
  }, 5000); // 5s refresh while looking at broadcast
});

/* ─── MAP PICKER COMPONENT (LEAFLET) ─── */
let mapPicker = null;
let mapMarker = null;

window.openMapPicker = () => {
    const overlay = document.getElementById('mapPickerOverlay');
    overlay.classList.add('active');
    
    // Initialize map if not already done
    if (!mapPicker) {
        initMapPicker();
    }
    
    // Set marker from hidden inputs if they have values
    const lat = document.getElementById('clientLat').value;
    const lng = document.getElementById('clientLng').value;
    
    if (lat && lng) {
        const pos = [parseFloat(lat), parseFloat(lng)];
        mapMarker.setLatLng(pos);
        mapPicker.setView(pos, 16);
        document.getElementById('coordsDisplay').textContent = `Lat: ${lat}, Lng: ${lng}`;
    } else {
        // Automatically fly to the coverage zones
        flyToCoverage();
        document.getElementById('coordsDisplay').textContent = "Click on the map to set the pin";
        if (mapMarker) mapMarker.setLatLng([0,0]);
    }
    
    // Force map to recalculate size after showing modal
    setTimeout(() => mapPicker.invalidateSize(), 300);
};

function initMapPicker() {
    // Start centered on Service Area
    mapPicker = L.map('mapPickerContainer').setView([10.5385, 122.8415], 13);
    
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 20
    }).addTo(mapPicker);
    
    // Add Large Search Control using ArcGIS (Better for local stores/landmarks)
    const geocoder = L.Control.geocoder({
        geocoder: L.Control.Geocoder.arcgis(),
        defaultMarkGeocode: false,
        placeholder: "Search address, store, or house...",
        errorMessage: "Location not found.",
        collapsed: false,
        position: 'topleft'
    })
    .on('markgeocode', function(e) {
        const bbox = e.geocode.bbox;
        const poly = L.polygon([
            bbox.getSouthEast(),
            bbox.getNorthEast(),
            bbox.getNorthWest(),
            bbox.getSouthWest()
        ]);
        mapPicker.fitBounds(poly.getBounds());
        
        // Place marker at searched location
        const center = e.geocode.center;
        mapMarker.setLatLng(center);
        document.getElementById('coordsDisplay').textContent = `Lat: ${center.lat.toFixed(6)}, Lng: ${center.lng.toFixed(6)}`;
    })
    .addTo(mapPicker);
    
    mapMarker = L.marker([0,0]).addTo(mapPicker);
    
    mapPicker.on('click', (e) => {
        const { lat, lng } = e.latlng;
        mapMarker.setLatLng([lat, lng]);
        document.getElementById('coordsDisplay').textContent = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
    });

    // Load Coverage Zones onto the picker for context
    loadCoverageOnPicker();
}

async function flyToCoverage() {
    try {
        const res = await fetch('/api/admin/coverage-zones');
        const zones = await res.json();
        if (zones.length === 0) {
            // Fallback to Bago City if no zones exist
            mapPicker.flyTo([10.5385, 122.8415], 13);
            return;
        }

        const group = new L.FeatureGroup();
        zones.forEach(z => {
            if (z.type === 'polygon' && z.coordinates) {
                L.polygon(z.coordinates).addTo(group);
            } else if (z.type === 'circle' && z.center_lat) {
                L.circle([z.center_lat, z.center_lng], { radius: z.radius }).addTo(group);
            }
        });

        const bounds = group.getBounds();
        if (bounds.isValid()) {
            mapPicker.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
        }
    } catch (e) {
        console.error('Fly to coverage error:', e);
    }
}

async function loadCoverageOnPicker() {
    try {
        const res = await fetch('/api/admin/coverage-zones');
        const zones = await res.json();
        
        zones.forEach(z => {
            if (z.type === 'polygon' && z.coordinates) {
                L.polygon(z.coordinates, {
                    color: z.color || '#10b981',
                    fillColor: z.color || '#10b981',
                    fillOpacity: 0.1,
                    weight: 2,
                    dashArray: '5, 5',
                    interactive: false
                }).addTo(mapPicker);
            } else if (z.type === 'circle' && z.center_lat) {
                L.circle([z.center_lat, z.center_lng], {
                    radius: z.radius,
                    color: z.color || '#10b981',
                    fillColor: z.color || '#10b981',
                    fillOpacity: 0.1,
                    weight: 2,
                    dashArray: '5, 5',
                    interactive: false
                }).addTo(mapPicker);
            }
        });
    } catch (e) {
        console.error('Picker coverage load error:', e);
    }
}

window.closeMapPicker = () => {
    document.getElementById('mapPickerOverlay').classList.remove('active');
};

window.confirmLocation = () => {
    const pos = mapMarker.getLatLng();
    if (pos.lat === 0 && pos.lng === 0) {
        showError("Please click on the map to set a location first.");
        return;
    }
    
    document.getElementById('clientLat').value = pos.lat.toFixed(6);
    document.getElementById('clientLng').value = pos.lng.toFixed(6);
    
    window.closeMapPicker();
};

window.useCurrentLocation = () => {
    if (!navigator.geolocation) {
        showError("Geolocation is not supported by your browser.");
        return;
    }
    
    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        mapMarker.setLatLng([latitude, longitude]);
        mapPicker.setView([latitude, longitude], 17);
        document.getElementById('coordsDisplay').textContent = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
    }, () => {
        showError("Unable to retrieve your location. Please check your browser permissions.");
    });
};


