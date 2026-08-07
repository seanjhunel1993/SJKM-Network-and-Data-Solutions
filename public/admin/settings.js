// ─── SJKM NETWORK DATA LINK SYSTEM CONFIGURATION CONTROLLER ───

let identityUnlocked = true;
let currentSettingsTab = 'integration';

document.addEventListener('DOMContentLoaded', () => {
  const settingsForm = document.getElementById('systemSettingsForm');
  if (!settingsForm) return;

  // Initialize page components
  loadSystemSettings();
  loadPlansMgmt();
  load2FAStatus();
  loadBroadcastHistory();

  // Branding live preview listeners
  const nameInput = document.getElementById('cfg_company_name');
  const namePreview = document.getElementById('cfg_name_preview');
  const taglinePreview = document.getElementById('cfg_tagline_preview');

  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      const val = e.target.value || 'SJKM NETWORK DATA LINK';
      if (namePreview) namePreview.textContent = val;
      if (taglinePreview) {
        if (val.toUpperCase() !== 'SJKM NETWORK DATA LINK') {
          taglinePreview.textContent = '';
        } else {
          taglinePreview.textContent = 'Network and Data Solution';
        }
      }
    });
  }

  // Save Settings submission handler
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn    = document.getElementById('btnSaveSettings');
    const status = document.getElementById('settingsSaveStatus');
    const errMsg = document.getElementById('settingsErrMsg');
    const g = (id) => document.getElementById(id)?.value?.trim() || '';

    btn.disabled = true;
    btn.textContent = 'Saving...';
    if (errMsg) errMsg.style.display = 'none';

    try {
      const payload = {
        company_name:       g('cfg_company_name'),
        support_email:      g('cfg_support_email'),
        support_phone:      g('cfg_support_phone'),
        facebook_url:       g('cfg_facebook_url'),
        sms_gateway_type:   g('cfg_sms_gateway_type'),
        sms_android_ip:     g('cfg_sms_android_ip'),
        // Toggles
        enable_sms_billing:  document.getElementById('cfg_enable_sms_billing')?.checked ? 1 : 0,
        enable_sms_receipts: document.getElementById('cfg_enable_sms_receipts')?.checked ? 1 : 0,
        email_enabled:       document.getElementById('cfg_email_enabled')?.checked ? 1 : 0,
        disable_mikrotik:    document.getElementById('cfg_enable_mikrotik')?.checked ? 0 : 1,
// SMS Templates
        sms_receipt_template: g('cfg_sms_receipt_template'),
        sms_billing_reminder_template: g('cfg_sms_billing_reminder_template'),
        sms_due_today_template: g('cfg_sms_due_today_template'),
        sms_overdue_template: g('cfg_sms_overdue_template'),
        sms_app_received_template: g('cfg_sms_app_received_template'),
        sms_app_approved_template: g('cfg_sms_app_approved_template'),
        sms_app_rejected_template: g('cfg_sms_app_rejected_template'),
        sms_welcome_template: g('cfg_sms_welcome_template')
      };

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const newName = g('cfg_company_name');
        if (newName) {
          localStorage.setItem('isp_brand_name', newName);
          localStorage.removeItem('isp_brand_logo');
          if (typeof applyBranding === 'function') {
            applyBranding(newName, '');
          }
        }
        if (status) {
          status.style.display = 'inline';
          setTimeout(() => status.style.display = 'none', 3000);
        }
      } else {
        if (errMsg) {
          errMsg.textContent = data.error || 'Save failed.';
          errMsg.style.display = 'inline';
        }
      }
    } catch(e) {
      if (errMsg) {
        errMsg.textContent = 'Connection error.';
        errMsg.style.display = 'inline';
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:8px;"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>SAVE ALL SETTINGS`;
    }
  });

  // Auto-save and Security Lock when MikroTik toggle is clicked
  const mikrotikToggle = document.getElementById('cfg_enable_mikrotik');
  const mikrotikModal = document.getElementById('mikrotikSecurityModal');
  const mikrotikConfirmPwdInput = document.getElementById('mikrotikConfirmPassword');
  const btnConfirmMikrotikVerify = document.getElementById('btnConfirmMikrotikVerify');
  const btnCancelMikrotikVerify = document.getElementById('btnCancelMikrotikVerify');
  const mikrotikPasswordError = document.getElementById('mikrotikPasswordError');
  const btnToggleMikrotikPassword = document.getElementById('btnToggleMikrotikPassword');
  
  if (mikrotikToggle && mikrotikModal) {
    let pendingIsChecked = false;

    mikrotikToggle.addEventListener('change', (e) => {
      pendingIsChecked = mikrotikToggle.checked;
      mikrotikToggle.checked = !pendingIsChecked; // Revert visually immediately

      // Show the modal
      mikrotikConfirmPwdInput.value = '';
      mikrotikPasswordError.style.display = 'none';
      mikrotikModal.style.display = 'flex';
      mikrotikConfirmPwdInput.focus();
    });

const submitMikrotikVerify = () => {
      const pass = mikrotikConfirmPwdInput.value;
      if (!pass) return;
      btnConfirmMikrotikVerify.disabled = true;
      btnConfirmMikrotikVerify.textContent = 'Verifying...';
      mikrotikPasswordError.style.display = 'none';

      fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          mikrotikModal.style.display = 'none';
          mikrotikToggle.checked = pendingIsChecked; // Apply the change
          const btn = document.getElementById('btnSaveSettings');
          if (btn) btn.click(); // Auto-save
        } else {
          mikrotikPasswordError.style.display = 'block';
        }
      })
      .catch(() => {
        mikrotikPasswordError.style.display = 'block';
        mikrotikPasswordError.textContent = 'Verification error. Please try again.';
      })
      .finally(() => {
        btnConfirmMikrotikVerify.disabled = false;
        btnConfirmMikrotikVerify.textContent = 'Verify Access';
      });
    };

    btnConfirmMikrotikVerify?.addEventListener('click', submitMikrotikVerify);
    
    mikrotikConfirmPwdInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitMikrotikVerify();
      }
    });

    btnCancelMikrotikVerify?.addEventListener('click', () => {
      mikrotikModal.style.display = 'none';
    });
    
    btnToggleMikrotikPassword?.addEventListener('click', () => {
      if (mikrotikConfirmPwdInput.type === 'password') {
        mikrotikConfirmPwdInput.type = 'text';
        document.getElementById('mEyeOpenIcon').style.display = 'none';
        document.getElementById('mEyeClosedIcon').style.display = 'block';
      } else {
        mikrotikConfirmPwdInput.type = 'password';
        document.getElementById('mEyeOpenIcon').style.display = 'block';
        document.getElementById('mEyeClosedIcon').style.display = 'none';
      }
    });
  }

  // Internet Plans form listeners
  document.getElementById('btnAddNewPlan')?.addEventListener('click', () => {
    document.getElementById('planFormTitle').textContent = 'Add Plan';
    document.getElementById('planFormIdOriginal').value = '';
    document.getElementById('planFormName').value = '';
    document.getElementById('planFormSpeed').value = '';
    document.getElementById('planFormPrice').value = '';
    document.getElementById('planFormPopular').checked = false;
    document.getElementById('planEditFormContainer').style.display = 'flex';
  });

  document.getElementById('btnCancelPlanForm')?.addEventListener('click', () => {
    document.getElementById('planEditFormContainer').style.display = 'none';
  });

  document.getElementById('btnSavePlan')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSavePlan');
    const origId = document.getElementById('planFormIdOriginal').value;
    const isEdit = !!origId;
    const planName = document.getElementById('planFormName').value.trim();

    const payload = {
      id: isEdit ? origId : planName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      name: planName,
      speed: document.getElementById('planFormSpeed').value,
      price: document.getElementById('planFormPrice').value,
      is_popular: document.getElementById('planFormPopular').checked
    };

    if (!payload.name || !payload.price) {
      window.showCustomAlert('Error', 'Plan Name and Price are required.', true);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const url = isEdit ? '/api/admin/plans/' + encodeURIComponent(origId) : '/api/admin/plans';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        cachedPlans = data.plans;
        renderPlansMgmt();
        document.getElementById('planEditFormContainer').style.display = 'none';
      } else {
        window.showCustomAlert('Error', data.error || 'Save failed', true);
      }
    } catch(e) {
      console.error(e);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Internet Plan';
    }
  });

  // 2FA action listeners
  document.getElementById('btnToggle2FA')?.addEventListener('click', async () => {
    const label = document.getElementById('label2FAStatus');
    const isEnabled = label?.textContent?.trim() === 'Active';

    if (isEnabled) {
      if (!confirm('Warning: Disabling 2FA will lower your account security. Proceed?')) return;
      const res = await fetch('/api/admin/2fa/disable', { method: 'POST' });
      if (res.ok) window.load2FAStatus();
    } else {
      const res = await fetch('/api/admin/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        document.getElementById('setup2FAArea').style.display = 'block';
        document.getElementById('btnToggle2FA').style.display = 'none';
        
        const emailDiv = document.getElementById('setup2FAEmailMasked');
        if (emailDiv) emailDiv.textContent = data.emailMasked || 'Your registered email';
      } else {
        window.showError('Setup Failed', data.error || 'Failed to initiate security setup.');
      }
    }
  });

  document.getElementById('btnConfirm2FA')?.addEventListener('click', async () => {
    const code = document.getElementById('input2FAVerify').value;
    if (!code) return alert('Enter the 6-digit code');

    const res = await fetch('/api/admin/2fa/verify-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.success) {
      window.showSuccess('Security Enabled', '2FA is now active! All future logins will require a Gmail OTP verification.');
      document.getElementById('btnToggle2FA').style.display = 'block';
      window.load2FAStatus();
    } else {
      window.showError('Invalid Code', data.error || 'The OTP entered is incorrect or has expired.');
    }
  });

  // Test gateway link listener
  document.getElementById('btnTestSms')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnTestSms');
    const ip = document.getElementById('cfg_sms_android_ip')?.value?.trim();
    if (!ip) {
      alert('Please enter an IP address first.');
      return;
    }
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'TESTING...';
    try {
      const res = await fetch('/api/admin/maintenance/sms/test-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      const data = await res.json();
      if (data.success) {
        alert('Gateway Connected successfully! Device status: ' + data.status);
      } else {
        alert('Connection failed: ' + (data.error || 'Gateway offline or unreachable.'));
      }
    } catch (err) {
      alert('Network error testing link.');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  // ─── CHANGE PASSWORD LISTENERS ───
  const btnRequestPwdOtp = document.getElementById('btnRequestPwdOtp');
  const btnConfirmPwdReset = document.getElementById('btnConfirmPwdReset');
  const btnCancelPwdReset = document.getElementById('btnCancelPwdReset');

  btnRequestPwdOtp?.addEventListener('click', async () => {
    const currentPassword = document.getElementById('pwd_current').value;
    if (!currentPassword) {
      alert('Please enter your current password.');
      return;
    }

    btnRequestPwdOtp.disabled = true;
    btnRequestPwdOtp.textContent = 'REQUESTING OTP...';

    try {
      const res = await fetch('/api/admin/change-password/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword })
      });
      const data = await res.json();
      if (res.ok) {
        document.getElementById('pwd_step_request').style.display = 'none';
        document.getElementById('pwd_step_verify').style.display = 'block';
        
        const devNotice = document.getElementById('pwd_dev_otp_notice');
        if (data.devMode && devNotice) {
          devNotice.innerHTML = `⚠️ <strong>Developer Mode Active</strong><br>Check server terminal logs for the OTP.`;
          devNotice.style.background = 'rgba(245, 158, 11, 0.05)';
          devNotice.style.borderColor = 'rgba(245, 158, 11, 0.2)';
          devNotice.style.color = 'var(--warning)';
        }
      } else {
        alert(data.error || 'Failed to request OTP.');
      }
    } catch (err) {
      alert('Network error requesting OTP.');
    } finally {
      btnRequestPwdOtp.disabled = false;
      btnRequestPwdOtp.textContent = 'REQUEST CHANGE OTP';
    }
  });

  btnCancelPwdReset?.addEventListener('click', () => {
    document.getElementById('pwd_step_request').style.display = 'block';
    document.getElementById('pwd_step_verify').style.display = 'none';
    document.getElementById('pwd_current').value = '';
    document.getElementById('pwd_otp').value = '';
    document.getElementById('pwd_new').value = '';
  });

  btnConfirmPwdReset?.addEventListener('click', async () => {
    const otp = document.getElementById('pwd_otp').value.trim();
    const newPassword = document.getElementById('pwd_new').value;

    if (!otp) {
      alert('Please enter the 6-digit OTP.');
      return;
    }
    if (!newPassword) {
      alert('Please enter your new password.');
      return;
    }

    btnConfirmPwdReset.disabled = true;
    btnConfirmPwdReset.textContent = 'RESETTING...';

    try {
      const res = await fetch('/api/admin/change-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, new_password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Password changed successfully! Please log in again.');
        window.location.reload();
      } else {
        alert(data.error || 'Failed to change password.');
      }
    } catch (err) {
      alert('Network error resetting password.');
    } finally {
      btnConfirmPwdReset.disabled = false;
      btnConfirmPwdReset.textContent = 'CONFIRM RESET';
    }
  });

  // ─── Identity & Branding Password Lock Listeners ───
  const identityModal = document.getElementById('identityPasswordModal');
  const confirmPwdInput = document.getElementById('identityConfirmPassword');
  const btnToggleEye = document.getElementById('btnToggleIdentityPassword');
  const eyeOpen = document.getElementById('eyeOpenIcon');
  const eyeClosed = document.getElementById('eyeClosedIcon');
  const errSpan = document.getElementById('identityPasswordError');
  const btnConfirmVerify = document.getElementById('btnConfirmIdentityVerify');
  const btnCancelVerify = document.getElementById('btnCancelIdentityVerify');

  if (identityModal) {
    let successCallback = null;
    let cancelCallback = null;

    window.showSettingsPasswordPrompt = (onSuccess, onCancel) => {
      successCallback = onSuccess;
      cancelCallback = onCancel;
      confirmPwdInput.value = '';
      errSpan.style.display = 'none';
      identityModal.style.display = 'flex';
      confirmPwdInput.focus();
    };

    btnToggleEye?.addEventListener('click', () => {
      if (confirmPwdInput.type === 'password') {
        confirmPwdInput.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
      } else {
        confirmPwdInput.type = 'password';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
      }
    });

    const submitVerification = async () => {
      const password = confirmPwdInput.value;
      if (!password) return;
      btnConfirmVerify.disabled = true;
      btnConfirmVerify.textContent = 'Verifying...';
      errSpan.style.display = 'none';

      try {
        const res = await fetch('/api/admin/verify-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          identityModal.style.display = 'none';
          if (successCallback) successCallback();
        } else {
          errSpan.style.display = 'block';
          errSpan.textContent = data.error || 'Incorrect password.';
        }
      } catch (err) {
        errSpan.style.display = 'block';
        errSpan.textContent = 'Verification error.';
      } finally {
        btnConfirmVerify.disabled = false;
        btnConfirmVerify.textContent = 'Verify Identity';
      }
    };

    btnConfirmVerify?.addEventListener('click', submitVerification);
    
    confirmPwdInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitVerification();
      }
    });

    btnCancelVerify?.addEventListener('click', () => {
      identityModal.style.display = 'none';
      if (cancelCallback) cancelCallback();
    });
  }
});

// ─── SETTINGS GLOBAL WINDOW HANDLERS ───

window.switchSettingsTab = (tab) => {
  if ((tab === 'identity' || tab === 'sms') && !identityUnlocked) {
    if (typeof window.showSettingsPasswordPrompt === 'function') {
      window.showSettingsPasswordPrompt(() => {
        identityUnlocked = true;
        currentSettingsTab = tab;
        proceedToTab(tab);
      }, () => {
        // Revert active button styling back to previous tab
        document.querySelectorAll('.tab-btn').forEach(b => {
          if (b.id === 'btnTab' + currentSettingsTab.charAt(0).toUpperCase() + currentSettingsTab.slice(1)) {
            b.classList.add('active');
          } else if (b.id.startsWith('btnTab')) {
            b.classList.remove('active');
          }
        });
      });
      return;
    }
  }
  currentSettingsTab = tab;
  proceedToTab(tab);
};

function proceedToTab(tab) {
  document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.id.startsWith('btnTab')) b.classList.remove('active');
  });

  const view = document.getElementById('viewTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  const btn = document.getElementById('btnTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (view) {
    view.classList.add('active');
    view.style.display = 'block';
  }
  if (btn) btn.classList.add('active');

  if (tab === 'plans') {
    loadPlansMgmt();
  }
  if (tab === 'security') {
    load2FAStatus();
  }
  if (tab === 'broadcast') {
    loadBroadcastHistory();
  }
}

window.insertSmsTag = (id, tag) => {
  const el = document.getElementById(id);
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value;
  el.value = text.substring(0, start) + tag + text.substring(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + tag.length;
};

window.resetSmsTemplate = (type) => {
  const defReceipt = `{{company_name}} OFFICIAL RECEIPT\n------------------\nHi Good day {{name}}.\nWe Recieve your payment.\n\nAmount: P{{amount}}\nDate: {{date}}\nStatus: {{status}}\nNew Due Date: {{due_date}}\n\n------------------\nThank you for your payment!`;
  const defBilling = `{{company_name}} {{status}}\n------------------\nHi Good Day {{name}}! this is A friendly Reminder For your Internet Subscription\n\nDue Date: {{due_date}}\nLast Payment: P{{last_payment}}\nTotal Due: P{{amount}}\n\n------------------\nPlease settle your balance to avoid service interruption. Thank you!`;
  const defDueToday = `{{company_name}} DUE TODAY\n------------------\nHi Good Day {{name}}! Today is the DUE DATE of your Internet Subscription.\n\nAmount Due: P{{amount}}\n\n------------------\nPlease pay immediately via GCash/Maya to avoid service interruption. Thank you!`;
  const defOverdue = `{{company_name}} OVERDUE NOTICE\n------------------\nHi Good Day {{name}}! Your Internet Subscription is now OVERDUE.\n\nTotal Due: P{{amount}}\nStatus: {{status}}\n\n------------------\nPlease settle your balance immediately to restore or maintain your service. Thank you!`;

if (type === 'receipt') {
    const el = document.getElementById('cfg_sms_receipt_template');
    if (el) el.value = defReceipt;
  } else if (type === 'billing') {
    const el = document.getElementById('cfg_sms_billing_reminder_template');
    if (el) el.value = defBilling;
  } else if (type === 'due_today') {
    const el = document.getElementById('cfg_sms_due_today_template');
    if (el) el.value = defDueToday;
  } else if (type === 'overdue') {
    const el = document.getElementById('cfg_sms_overdue_template');
    if (el) el.value = defOverdue;
  } else if (type === 'app_received') {
    const el = document.getElementById('cfg_sms_app_received_template');
    if (el) el.value = `{{company_name}}\n\nApplication Received\nHi {{name}}, we received your internet application. Our team will contact you for the next steps. Thank you!`;
  } else if (type === 'app_approved') {
    const el = document.getElementById('cfg_sms_app_approved_template');
    if (el) el.value = `{{company_name}}\n\nApplication Approved\nHi {{name}}, your application has been approved! Installation date: {{date}}. Welcome to our service!`;
  } else if (type === 'app_rejected') {
    const el = document.getElementById('cfg_sms_app_rejected_template');
    if (el) el.value = `{{company_name}}\n\nApplication Update\nHi {{name}}, we regret to inform you that your application was not approved at this time. Thank you for your interest.`;
  } else if (type === 'welcome') {
    const el = document.getElementById('cfg_sms_welcome_template');
    if (el) el.value = `{{company_name}}\n\nWelcome to our service, {{name}}!\n\nAccount No: {{account_id}}\nPassword: {{password}}\n\nPlease log in to our portal and change your password after first login.`;
  }
};

window.insertTag = (textareaId, tag) => {
  const el = document.getElementById(textareaId);
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value;
  el.value = text.substring(0, start) + tag + text.substring(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + tag.length;
};

// ─── 2FA & SECURITY HELPERS ───

window.load2FAStatus = async () => {
  try {
    const res = await fetch('/api/admin/2fa/status');
    if (!res.ok) return;
    const status = await res.json();
    update2FAUI(status.enabled, status.trustedDevices);
  } catch (err) {
    console.error('2FA status load failed', err);
  }
};

const update2FAUI = (enabled, devices = []) => {
  const label = document.getElementById('label2FAStatus');
  const desc = document.getElementById('desc2FA');
  const btn = document.getElementById('btnToggle2FA');
  const setupArea = document.getElementById('setup2FAArea');
  const deviceList = document.getElementById('trustedDevicesList');

  if (!label || !btn) return;

  if (enabled) {
    label.textContent = 'Active';
    label.className = 'status-pill status-active';
    desc.textContent = 'Your account is protected by Two-Factor Authentication.';
    btn.textContent = 'Disable Security';
    btn.classList.add('btn-secondary');
    btn.classList.remove('btn-primary');
    setupArea.style.display = 'none';
    btn.style.display = 'block';
  } else {
    label.textContent = 'Disabled';
    label.className = 'status-pill status-inactive';
    desc.textContent = 'Your account only requires a password to log in.';
    btn.textContent = 'Enable Security';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
    setupArea.style.display = 'none';
    btn.style.display = 'block';
  }

  if (deviceList) {
    if (devices.length === 0) {
      deviceList.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim); font-size:0.85rem; border:1px dashed var(--border); border-radius:12px;">No trusted devices recorded yet.</div>';
    } else {
      deviceList.innerHTML = devices.map((d, i) => `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
           <div>
              <div style="font-size:0.85rem; font-weight:700; color:var(--accent-light);">Device #${i+1}</div>
              <div style="font-size:0.7rem; color:var(--text-dim);">Expires: ${new Date(d.expiry).toLocaleDateString()}</div>
           </div>
           <button type="button" onclick="revokeDevice('${d.token}')" style="background:transparent; border:none; color:var(--danger); cursor:pointer; font-size:0.75rem; font-weight:700;">Revoke</button>
        </div>
      `).join('');
    }
  }
};

window.revokeDevice = async (token) => {
  if (!await window.customConfirmAsync('Revoke Access', 'Are you sure you want to revoke this trusted device? You will need to re-verify via 2FA on that device.')) return;

  try {
    const res = await fetch('/api/admin/2fa/revoke-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (res.ok) {
      window.showSuccess('Device Revoked', 'Trust token has been invalidated.');
      window.load2FAStatus();
    } else {
      window.showError('Revoke Failed', data.error || 'Server error');
    }
  } catch (err) {
    window.showError('Network Error', 'Could not reach server to revoke device.');
  }
};

// ─── INTERNET PLANS HELPERS ───

let cachedPlans = [];

window.loadPlansMgmt = async () => {
  try {
    const res = await fetch('/api/admin/plans');
    cachedPlans = await res.json();
    renderPlansMgmt();
  } catch(err) {}
};

const PLAN_COLORS = [
  { accent: '#6366f1', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)' },
  { accent: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  { accent: '#ec4899', bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.25)' },
  { accent: '#06b6d4', bg: 'rgba(6,182,212,0.08)',  border: 'rgba(6,182,212,0.25)'  },
  { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
];

function renderPlansMgmt() {
  const list = document.getElementById('plansListContainer');
  if (!list) return;

  if (!cachedPlans || cachedPlans.length === 0) {
    list.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding:40px; color:var(--text-dim); border:1px dashed var(--border); border-radius:20px;">No plans created yet. Click "Create Plan" above.</div>`;
    return;
  }

  list.innerHTML = cachedPlans.map((plan, i) => {
    const color = PLAN_COLORS[i % PLAN_COLORS.length];
    const displayPrice = plan.price ? parseFloat(plan.price).toLocaleString() : '0';
    
    return `
      <div class="plan-mgmt-card" style="border-left: 4px solid ${color.accent};">
        <div class="plan-mgmt-info">
          <h4>
            ${plan.name}
            ${plan.is_popular ? `<span class="plan-popular-tag">Popular</span>` : ''}
          </h4>
          <div class="plan-mgmt-meta">
            <span>⚡ ${plan.speed || 'N/A'}</span>
            <span>₱${displayPrice}/mo</span>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" onclick="editPlanMgmt('${plan.id}')" class="btn btn-secondary" style="padding:6px 12px; font-size:0.75rem;">Edit</button>
          <button type="button" onclick="deletePlanMgmt('${plan.id}')" class="btn btn-danger-soft" style="padding:6px 12px; font-size:0.75rem; border:1px solid rgba(239,68,68,0.2);">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

window.editPlanMgmt = (id) => {
  const p = cachedPlans.find(plan => plan.id === id);
  if (!p) return;
  document.getElementById('planFormTitle').textContent = 'Edit Plan';
  document.getElementById('planFormIdOriginal').value = p.id;
  document.getElementById('planFormName').value = p.name;
  document.getElementById('planFormSpeed').value = p.speed;
  document.getElementById('planFormPrice').value = p.price;
  document.getElementById('planFormPopular').checked = !!p.is_popular;
  document.getElementById('planEditFormContainer').style.display = 'flex';
};

window.deletePlanMgmt = async (id) => {
  if (!await window.customConfirmAsync('Delete Plan', 'Are you sure you want to delete this plan? Clients already using it will keep their pricing.')) return;
  try {
    const res = await fetch('/api/admin/plans/' + encodeURIComponent(id), { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      cachedPlans = data.plans;
      renderPlansMgmt();
    } else {
      window.showCustomAlert('Error', data.error || 'Delete failed', true);
    }
  } catch(e) {}
};

// ─── BROADCAST & OUTGOING QUEUE HELPERS ───

window.clearSmsQueue = async () => {
  window.showPremiumModal({
    title: 'Wipe SMS Queue?',
    text: 'Are you sure you want to permanently delete all pending and halted messages? This action cannot be undone.',
    iconHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>',
    iconBg: 'rgba(239, 68, 68, 0.1)',
    iconColor: '#ef4444',
    buttons: [
      { text: 'Keep Messages', type: 'secondary', onClick: () => window.closePremiumModal() },
      { 
        text: 'Wipe Everything', 
        type: 'danger', 
        onClick: async () => {
          window.closePremiumModal();
          try {
            const res = await fetch('/api/admin/maintenance/sms/clear-queue', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              window.showPremiumModal({
                title: 'Queue Cleared',
                text: 'All pending SMS messages have been successfully removed.',
                iconHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"></path></svg>',
                iconBg: 'rgba(16, 185, 129, 0.1)',
                iconColor: '#10b981'
              });
            }
          } catch (err) {
            alert('Failed to clear queue.');
          }
        }
      }
    ]
  });
};

window.sendMaintenanceBroadcast = async () => {
  const subject = document.getElementById('bc_subject').value;
  const message = document.getElementById('bc_message').value;
  const target = document.getElementById('bc_target').value;
  const useSms = document.getElementById('bc_use_sms').checked;
  const useEmail = document.getElementById('bc_use_email').checked;

  if (!message || message.trim().length === 0) {
    alert('Please enter a message to broadcast.');
    return;
  }

  if (!useSms && !useEmail) {
    alert('Please select at least one delivery channel (SMS or Email).');
    return;
  }

  const confirmText = `You are about to send this maintenance notice via ${useSms ? 'SMS' : ''}${useSms && useEmail ? ' & ' : ''}${useEmail ? 'Email' : ''} to ${target === 'active' ? 'ALL ACTIVE' : 'ALL'} clients. This action cannot be undone.`;

  window.showPremiumModal({
    title: 'Initiate Broadcast?',
    text: confirmText,
    iconHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path></svg>',
    iconBg: 'rgba(99, 102, 241, 0.1)',
    iconColor: '#818cf8',
    buttons: [
      { 
        text: 'Cancel', 
        type: 'secondary', 
        onClick: () => window.closePremiumModal() 
      },
      { 
        text: 'Confirm & Send', 
        type: 'primary', 
        onClick: async () => {
          try {
            const btn = document.getElementById('btnSendBroadcast');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<div class="spinner"></div> BROADCASTING...';
            btn.disabled = true;

            const res = await fetch('/api/admin/maintenance/broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subject, message, target, useSms, useEmail })
            });

            const data = await res.json();
            btn.innerHTML = originalHtml;
            btn.disabled = false;

            if (data.success) {
              if (window.showCustomAlert) window.showCustomAlert('Broadcast Initiated', data.message, false);
              else alert(data.message);
              document.getElementById('bc_message').value = '';
              loadBroadcastHistory();
            } else {
              alert(data.error || 'Failed to initiate broadcast.');
            }
          } catch (err) {
            alert('Error sending broadcast: ' + err.message);
            document.getElementById('btnSendBroadcast').disabled = false;
          } finally {
            window.closePremiumModal();
          }
        }
      }
    ]
  });
};

window.loadBroadcastHistory = async () => {
  const tbody = document.getElementById('bc_history_body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/system/broadcast/history');
    const data = await res.json();
    
    tbody.innerHTML = data.map(b => {
      const rawDate = b.created_at ? b.created_at.replace(' ', 'T') : null;
      const dateObj = rawDate ? new Date(rawDate) : new Date();
      const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      
      let statusHtml = '';
      if (b.type.includes('SMS')) {
        statusHtml += `<div style="font-size:0.65rem; color:var(--text-dim);">SMS: <span style="color:#10b981;">${b.sms_success || 0}</span> / <span style="color:#ef4444;">${b.sms_failed || 0}</span></div>`;
      }
      if (b.type.includes('EMAIL')) {
        statusHtml += `<div style="font-size:0.65rem; color:var(--text-dim);">Mail: <span style="color:#10b981;">${b.email_success || 0}</span> / <span style="color:#ef4444;">${b.email_failed || 0}</span></div>`;
      }

      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:12px; color:var(--text-dim); font-size:0.75rem;">${dateStr}</td>
          <td style="padding:12px;">
            <div style="font-weight:700; color:var(--text);">${b.subject || 'Untitled'}</div>
            <div style="font-size:0.65rem; color:var(--primary); font-weight:800;">${b.type}</div>
          </td>
          <td style="padding:12px; text-align:right;">
            <div style="font-weight:800; color:var(--secondary);">${b.recipients_count}</div>
            ${statusHtml}
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="3" style="padding:20px; text-align:center; color:var(--text-muted);">No broadcast history found.</td></tr>';
  } catch (err) {
    console.error('Failed to load history:', err);
  }
};

window.clearBroadcastHistory = () => {
  window.showPremiumModal({
    title: 'Wipe History?',
    text: 'Are you sure you want to permanently delete all broadcast records? This action cannot be reversed.',
    iconHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>',
    iconBg: 'rgba(239, 68, 68, 0.1)',
    iconColor: '#ef4444',
    buttons: [
      { text: 'Cancel', type: 'secondary', onClick: () => window.closePremiumModal() },
      { 
        text: 'Confirm Wipe', 
        type: 'danger', 
        onClick: async () => {
          window.closePremiumModal();
          try {
            const res = await fetch('/api/admin/system/broadcast/history/clear', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              loadBroadcastHistory();
              if (window.showCustomAlert) window.showCustomAlert('Success', 'Broadcast history cleared.', false);
            }
          } catch (err) {
            alert('Error clearing: ' + err.message);
          }
        }
      }
    ]
  });
};

// ─── IDENTITY PREVIEW LOADER ───

async function loadSystemSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    if (!res.ok) return;
    const s = await res.json();
    const f = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    f('cfg_company_name',     s.company_name);
    f('cfg_hero_logo_url',    s.hero_logo_url);
    f('cfg_support_email',    s.support_email);
    f('cfg_support_phone',    s.support_phone);
    f('cfg_facebook_url',     s.facebook_url);

    const namePreview = document.getElementById('cfg_name_preview');
    const logoPreview = document.getElementById('cfg_logo_preview');
    const taglinePreview = document.getElementById('cfg_tagline_preview');
    if (namePreview) namePreview.textContent = s.company_name || 'SJKM NETWORK DATA LINK';
    if (taglinePreview) {
      if (s.company_name && s.company_name.toUpperCase() !== 'SJKM NETWORK DATA LINK') {
        taglinePreview.textContent = '';
      } else {
        taglinePreview.textContent = 'Network and Data Solution';
      }
    }
    if (logoPreview) {
      if (s.hero_logo_url) {
        logoPreview.innerHTML = `<img src="${s.hero_logo_url}" style="max-height:80px; max-width:180px; object-fit:contain; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3));" />`;
      } else {
        logoPreview.innerHTML = `<div style="width: 80px; height: 80px; background: rgba(255,255,255,0.05); border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 2rem;">🏢</div>`;
      }
    }

    // Connectivity
    f('cfg_sms_gateway_type', s.sms_gateway_type || 'android');
    f('cfg_sms_android_ip',   s.sms_android_ip);

    // Notification Toggles
    const b_bill = document.getElementById('cfg_enable_sms_billing');
    const b_rect = document.getElementById('cfg_enable_sms_receipts');
    const b_em = document.getElementById('cfg_email_enabled');
    const b_mtk = document.getElementById('cfg_enable_mikrotik');

    if (b_bill) b_bill.checked = (s.enable_sms_billing === 1);
    if (b_rect) b_rect.checked = (s.enable_sms_receipts === 1);
    if (b_em) b_em.checked = (s.email_enabled === 1);
    if (b_mtk) b_mtk.checked = (s.disable_mikrotik !== 1);

    // SMS Templates
    const defReceipt = `{{company_name}} OFFICIAL RECEIPT\n------------------\nHi Good day {{name}}.\nWe Recieve your payment.\n\nAmount: P{{amount}}\nDate: {{date}}\nStatus: {{status}}\nNew Due Date: {{due_date}}\n\n------------------\nThank you for your payment!`;
    const defBilling = `{{company_name}} {{status}}\n------------------\nHi Good Day {{name}}! this is A friendly Reminder For your Internet Subscription\n\nDue Date: {{due_date}}\nLast Payment: P{{last_payment}}\nTotal Due: P{{amount}}\n\n------------------\nPlease settle your balance to avoid service interruption. Thank you!`;
    const defDueToday = `{{company_name}} DUE TODAY\n------------------\nHi Good Day {{name}}! Today is the DUE DATE of your Internet Subscription.\n\nAmount Due: P{{amount}}\n\n------------------\nPlease pay immediately via GCash/Maya to avoid service interruption. Thank you!`;
    const defOverdue = `{{company_name}} OVERDUE NOTICE\n------------------\nHi Good Day {{name}}! Your Internet Subscription is now OVERDUE.\n\nTotal Due: P{{amount}}\nStatus: {{status}}\n\n------------------\nPlease settle your balance immediately to restore or maintain your service. Thank you!`;

const elRec = document.getElementById('cfg_sms_receipt_template');
    const elBil = document.getElementById('cfg_sms_billing_reminder_template');
    const elDue = document.getElementById('cfg_sms_due_today_template');
    const elOvr = document.getElementById('cfg_sms_overdue_template');
    const elARec = document.getElementById('cfg_sms_app_received_template');
    const elAApp = document.getElementById('cfg_sms_app_approved_template');
    const elARej = document.getElementById('cfg_sms_app_rejected_template');
    const elWel = document.getElementById('cfg_sms_welcome_template');
    
    if (elRec) elRec.value = s.sms_receipt_template || defReceipt;
    if (elBil) elBil.value = s.sms_billing_reminder_template || defBilling;
    if (elDue) elDue.value = s.sms_due_today_template || defDueToday;
    if (elOvr) elOvr.value = s.sms_overdue_template || defOverdue;
    if (elARec) elARec.value = s.sms_app_received_template || `{{company_name}}\n\nApplication Received\nHi {{name}}, we received your internet application. Our team will contact you for the next steps. Thank you!`;
    if (elAApp) elAApp.value = s.sms_app_approved_template || `{{company_name}}\n\nApplication Approved\nHi {{name}}, your application has been approved! Installation date: {{date}}. Welcome to our service!`;
    if (elARej) elARej.value = s.sms_app_rejected_template || `{{company_name}}\n\nApplication Update\nHi {{name}}, we regret to inform you that your application was not approved at this time. Thank you for your interest.`;
    if (elWel) elWel.value = s.sms_welcome_template || `{{company_name}}\n\nWelcome to our service, {{name}}!\n\nAccount No: {{account_id}}\nPassword: {{password}}\n\nPlease log in to our portal and change your password after first login.`;

  } catch(e) {
    console.error('Failed to load settings:', e);
  }
}
