// Renders the sidebar HTML into the page cleanly without unnecessary icons or emoji
function renderSidebar() {
  const sidebarEl = document.querySelector('.sidebar');
  if (!sidebarEl) return;

  // Insert backdrop for mobile if not present
  if (!document.getElementById('sidebar-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'sidebar-backdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const currentTheme = getTheme ? getTheme() : (localStorage.getItem('absenku_theme') || 'dark');
  const logoSrc = currentTheme === 'light' ? 'img/logo-dark.png' : 'img/logo-light.png';

  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-header-left">
        <img src="${logoSrc}" alt="AbsenKu" class="sidebar-logo">
        <div class="sidebar-brand">
          <h2>AbsenKu</h2>
          <span>Panel Admin</span>
        </div>
      </div>
      <button class="sidebar-close-btn" id="sidebar-close-btn" aria-label="Tutup Menu">✕</button>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-section-title">Menu Utama</div>
        <a class="nav-item" data-page="dashboard.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
          <span>Beranda</span>
        </a>
        <a class="nav-item" data-page="employees.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Karyawan</span>
        </a>
        <a class="nav-item" data-page="attendance.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Kehadiran</span>
        </a>
        <a class="nav-item" data-page="tasks.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span>Tugas</span>
        </a>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">Lainnya</div>
        <a class="nav-item" data-page="leaves.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Izin & Cuti</span>
        </a>
        <a class="nav-item" data-page="reports.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <span>Laporan</span>
        </a>
        <a class="nav-item" data-page="settings.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Pengaturan</span>
        </a>
        <a class="nav-item" data-page="ai-assistant.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><rect x="4" y="8" width="16" height="12" rx="4"/><circle cx="9" cy="14" r="1.5"/><circle cx="15" cy="14" r="1.5"/><path d="M9 17h6"/></svg>
          <span>Asisten AI</span>
        </a>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="user-avatar" id="sidebar-user-avatar">AD</div>
        <div>
          <div class="user-name" id="sidebar-user-name">Admin</div>
          <div class="user-role" id="sidebar-user-role">Administrator</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-block mt-1" id="btn-logout" style="font-size:12px;">Keluar</button>
    </div>
  `;
}
