// Smart navigation helper
function getAppUrl(page) {
  if (window.location.protocol === 'file:') return page;
  const pathname = window.location.pathname;
  if (pathname.includes('/admin/')) {
    const base = pathname.substring(0, pathname.indexOf('/admin/') + 7);
    return base + page;
  }
  return page;
}


// AbsenKu - Core JavaScript Utilities & Theme Manager

// ========== THEME MANAGEMENT ==========
function getTheme() {
  return localStorage.getItem('absenku_theme') || 'dark';
}

function getSunIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
}

function getMoonIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

function setTheme(theme) {
  localStorage.setItem('absenku_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);

  // Update all logos (dark logo on light mode, light logo on dark mode)
  const logos = document.querySelectorAll('.logo-img, .sidebar-logo, .app-logo, #header-logo');
  const logoSrc = theme === 'light' ? 'img/logo-dark.png' : 'img/logo-light.png';
  logos.forEach(img => {
    img.src = logoSrc;
  });

  // Update theme toggle buttons
  const toggleBtns = document.querySelectorAll('.btn-theme-toggle');
  toggleBtns.forEach(btn => {
    btn.setAttribute('title', theme === 'light' ? 'Ubah ke Mode Gelap' : 'Ubah ke Mode Terang');
    btn.innerHTML = theme === 'light' ? getMoonIcon() : getSunIcon();
  });
}

function toggleTheme() {
  const current = getTheme();
  setTheme(current === 'light' ? 'dark' : 'light');
}

// Initialize theme immediately
(function initTheme() {
  const theme = getTheme();
  document.documentElement.setAttribute('data-theme', theme);
  document.addEventListener('DOMContentLoaded', () => {
    setTheme(theme);
  });
})();

// ========== TOAST SYSTEM ==========
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${icons[type] || icons.info}
    <span class="toast-message">${message}</span>
    <button class="toast-close" title="Tutup" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px) scale(0.96)';
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

// ========== CONFIRM & PROMPT MODALS ==========
function showConfirm({
  title = 'Konfirmasi',
  message = 'Apakah Anda yakin ingin melanjutkan?',
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    document.querySelectorAll('.confirm-dialog-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    const iconSvg = danger
      ? `<svg class="confirm-dialog-icon danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : `<svg class="confirm-dialog-icon primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

    overlay.innerHTML = `
      <div class="confirm-dialog-card" role="dialog" aria-modal="true">
        <div class="confirm-dialog-header">
          ${iconSvg}
          <h3 class="confirm-dialog-title">${title}</h3>
        </div>
        <div class="confirm-dialog-message">${message.replace(/\n/g, '<br>')}</div>
        <div class="confirm-dialog-actions">
          ${cancelText ? `<button class="btn btn-ghost btn-cancel" type="button">${cancelText}</button>` : ''}
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-confirm" type="button">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const cancelBtn = overlay.querySelector('.btn-cancel');
    const confirmBtn = overlay.querySelector('.btn-confirm');

    function close(result) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') close(false);
    }

    if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKey);

    if (danger) {
      cancelBtn.focus();
    } else {
      confirmBtn.focus();
    }
  });
}

function showPrompt({
  title = 'Input Data',
  message = '',
  placeholder = '',
  defaultValue = '',
  confirmText = 'Simpan',
  cancelText = 'Batal'
} = {}) {
  return new Promise((resolve) => {
    document.querySelectorAll('.confirm-dialog-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog-card" role="dialog" aria-modal="true">
        <div class="confirm-dialog-header">
          <h3 class="confirm-dialog-title">${title}</h3>
        </div>
        ${message ? `<div class="confirm-dialog-message">${message.replace(/\n/g, '<br>')}</div>` : ''}
        <div class="confirm-dialog-input-group">
          <input type="text" class="form-control prompt-input" placeholder="${placeholder}" value="${defaultValue}">
        </div>
        <div class="confirm-dialog-actions">
          <button class="btn btn-ghost btn-cancel" type="button">${cancelText}</button>
          <button class="btn btn-primary btn-confirm" type="button">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const input = overlay.querySelector('.prompt-input');
    const cancelBtn = overlay.querySelector('.btn-cancel');
    const confirmBtn = overlay.querySelector('.btn-confirm');

    function close(result) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') close(input.value.trim());
    }

    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => close(input.value.trim()));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    document.addEventListener('keydown', onKey);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  });
}

// ========== FORMATTERS ==========
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

// Clean status badge without extra decorative clutter
function statusBadge(status) {
  const labels = {
    present: 'Hadir',
    late: 'Terlambat',
    absent: 'Tidak Hadir',
    leave: 'Izin',
    half_day: 'Setengah Hari',
    todo: 'Belum Dikerjakan',
    in_progress: 'Sedang Dikerjakan',
    done: 'Selesai',
    cancelled: 'Dibatalkan',
    low: 'Rendah',
    medium: 'Sedang',
    high: 'Tinggi',
    urgent: 'Mendesak',
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    active: 'Aktif',
    inactive: 'Nonaktif'
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function priorityBadge(priority) {
  const labels = { urgent: 'Mendesak', high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
  return `<span class="badge badge-${priority}">${labels[priority] || priority}</span>`;
}

// ========== MODAL UTILITIES ==========
function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

// Close modals when clicking overlay
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ========== AUTH CHECK ==========
function checkAuth() {
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('user_data');
  if (!token || !user) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autologin') === 'admin') {
      window.location.href = getAppUrl('index.html') + '?autologin=admin&redirect=' + encodeURIComponent(window.location.pathname);
      return false;
    }
    window.location.href = getAppUrl('index.html');
    return false;
  }
  return JSON.parse(user);
}

// ========== SIDEBAR & NAVIGATION SETUP ==========
function setupSidebar(activePage) {
  const user = checkAuth();
  if (!user) return;

  // Set active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.page === activePage) item.classList.add('active');
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) window.location.href = getAppUrl(page);
    });
  });

  // User details in sidebar
  const userAvatar = document.getElementById('sidebar-user-avatar');
  const userName = document.getElementById('sidebar-user-name');
  const userRole = document.getElementById('sidebar-user-role');
  if (userAvatar) userAvatar.textContent = getInitials(user.name);
  if (userName) userName.textContent = user.name;
  if (userRole) userRole.textContent = user.role === 'admin' ? 'Administrator' : 'Karyawan';

  // Logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      api.clearToken();
      window.location.href = getAppUrl('index.html');
    });
  }

  // Sidebar Toggle (Desktop Collapse & Mobile Drawer)
  const toggleBtn = document.getElementById('sidebar-toggle');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const backdrop = document.getElementById('sidebar-backdrop');
  const sidebar = document.querySelector('.sidebar');

  // Check persisted desktop collapse state
  if (window.innerWidth > 768 && localStorage.getItem('absenku_sidebar_collapsed') === 'true') {
    document.body.classList.add('sidebar-collapsed');
  }

  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      // Mobile: drawer with backdrop
      const isOpen = sidebar && sidebar.classList.contains('open');
      if (isOpen) {
        closeSidebar();
      } else {
        if (sidebar) sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('active');
      }
    } else {
      // Desktop: toggle collapsed state
      const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('absenku_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    }
  }

  function closeSidebar() {
    if (window.innerWidth <= 768) {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    } else {
      document.body.classList.add('sidebar-collapsed');
      localStorage.setItem('absenku_sidebar_collapsed', 'true');
    }
  }

  if (toggleBtn) {
    toggleBtn.onclick = toggleSidebar;
  }
  if (closeBtn) {
    closeBtn.onclick = closeSidebar;
  }
  if (backdrop) {
    backdrop.onclick = closeSidebar;
  }

  // Handle window resize cleanly
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
      document.body.classList.remove('sidebar-collapsed');
    } else {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
      if (localStorage.getItem('absenku_sidebar_collapsed') === 'true') {
        document.body.classList.add('sidebar-collapsed');
      }
    }
  });

  // Esc key to close sidebar or modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
  });

  // Wire up theme toggles on header if present
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
}

// ========== EXPORT UTILITY ==========
function exportToCSV(data, filename) {
  if (!data || data.length === 0) return showToast('Tidak ada data untuk diexport', 'warning');
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  data.forEach(row => {
    csvRows.push(headers.map(h => {
      const val = row[h] !== null && row[h] !== undefined ? String(row[h]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    }).join(','));
  });
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export CSV berhasil!', 'success');
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ========== CUSTOM DROPDOWN (THEMED SELECT SYSTEM) ==========
function initCustomSelect(select) {
  if (!select) return null;
  if (select._customSelectWrapper) {
    refreshSelect(select);
    return select._customSelectWrapper;
  }

  // Check if adjacent wrapper already exists
  if (select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-wrapper')) {
    select.nextElementSibling.remove();
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  if (select.style.width === 'auto' || select.classList.contains('select-inline')) {
    wrapper.classList.add('inline');
  }

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.tabIndex = 0;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'custom-select-label';

  const arrowBox = document.createElement('div');
  arrowBox.className = 'custom-select-arrow-box';
  arrowBox.innerHTML = `<svg class="custom-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  trigger.appendChild(label);
  trigger.appendChild(arrowBox);

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);

  // Hide the native select and put custom wrapper directly after it
  select.style.display = 'none';
  select.setAttribute('tabindex', '-1');
  select.parentNode.insertBefore(wrapper, select.nextSibling);

  select._customSelectWrapper = wrapper;
  wrapper._targetSelect = select;

  // Toggle on trigger click
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      const rect = wrapper.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > 220) {
        wrapper.classList.add('dropup');
      } else {
        wrapper.classList.remove('dropup');
      }
      wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  // Keyboard navigation
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger.click();
    } else if (e.key === 'Escape') {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const validOptions = Array.from(select.options).filter(o => !o.disabled);
      if (validOptions.length === 0) return;
      const currentIdx = validOptions.findIndex(o => o.value === select.value);
      let nextIdx = currentIdx + (e.key === 'ArrowDown' ? 1 : -1);
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= validOptions.length) nextIdx = validOptions.length - 1;
      select.value = validOptions[nextIdx].value;
      refreshSelect(select);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Observe option changes inside native select
  const observer = new MutationObserver(() => {
    refreshSelect(select);
  });
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  // Sync when native select changes
  select.addEventListener('change', () => {
    refreshSelect(select);
  });

  refreshSelect(select);
  return wrapper;
}

function refreshSelect(select) {
  if (typeof select === 'string') {
    select = document.getElementById(select);
  }
  if (!select) return;
  const wrapper = select._customSelectWrapper || (select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-wrapper') ? select.nextElementSibling : null);
  if (!wrapper) return;

  const label = wrapper.querySelector('.custom-select-label');
  const menu = wrapper.querySelector('.custom-select-menu');
  const options = Array.from(select.options);

  if (options.length === 0) {
    label.textContent = 'Pilih...';
    menu.innerHTML = '<div class="custom-select-empty">Tidak ada pilihan</div>';
    return;
  }

  // Find active option
  let selectedOption = options.find(o => o.selected) || options.find(o => o.value === select.value) || options[0];
  label.textContent = selectedOption ? selectedOption.text : 'Pilih...';

  menu.innerHTML = '';
  options.forEach((opt, idx) => {
    const isSelected = opt === selectedOption || opt.value === select.value;
    const item = document.createElement('div');
    item.className = 'custom-select-option' + (isSelected ? ' selected' : '') + (opt.disabled ? ' disabled' : '');
    item.dataset.value = opt.value;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');

    item.innerHTML = `
      <span class="custom-select-text">${opt.text}</span>
      ${isSelected ? `<svg class="custom-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
    `;

    if (!opt.disabled) {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = opt.value;
        select.selectedIndex = idx;
        wrapper.classList.remove('open');
        wrapper.querySelector('.custom-select-trigger').setAttribute('aria-expanded', 'false');
        refreshSelect(select);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    menu.appendChild(item);
  });
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
    w.classList.remove('open');
    const trigger = w.querySelector('.custom-select-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

function initCustomSelects(root = document) {
  const selects = root.querySelectorAll('select.form-control, select[data-custom-select]');
  selects.forEach(sel => initCustomSelect(sel));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-select-wrapper')) {
    closeAllCustomSelects();
  }
});

// Auto initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initCustomSelects();
});

