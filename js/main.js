// ==========================================================================
// STATE
// ==========================================================================
let sidebarCollapsed = false;
let toolsMenuOpen    = false;
let mobileSidebarOpen = false;

const VIEW_LABELS = {
  profile:    'Profile',
  tools:      'Tools Hub',
  'steel-calc': 'Steel Section',
  'civil-est':  'Civil Estimator',
  letters:    'Letters',
};

// ==========================================================================
// VIEW SWITCHING
// ==========================================================================
function switchView(viewName) {
  // Deactivate all nav items
  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(el => el.classList.remove('active'));

  // Activate the matching nav item
  const navEl = document.getElementById(`nav-${viewName}`);
  if (navEl) navEl.classList.add('active');

  // If a tool sub-item is active, also highlight the group parent
  if (viewName === 'steel-calc' || viewName === 'civil-est') {
    const group = document.getElementById('nav-tools-group');
    if (group) group.classList.add('active');
    openToolsMenu(); // keep submenu open
  }

  // Deactivate all panels, activate target
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`view-${viewName}`);
  if (panel) panel.classList.add('active');

  // Update mobile topbar label
  const titleEl = document.getElementById('mobilePageTitle');
  if (titleEl) titleEl.textContent = VIEW_LABELS[viewName] || viewName;

  // Civil Estimator: collapse sidebar so iframe gets maximum space
  if (viewName === 'civil-est') {
    collapseSidebar();
  }

  // Close mobile sidebar
  closeMobileSidebar();
}

// ==========================================================================
// SIDEBAR COLLAPSE (DESKTOP)
// ==========================================================================
function collapseSidebar() {
  sidebarCollapsed = true;
  const sidebar = document.getElementById('appSidebar');
  const container = document.getElementById('appContainer');
  if (sidebar) sidebar.classList.add('collapsed');
  if (container) container.classList.add('sidebar-collapsed');

  // Flip chevron icon
  const btn = document.getElementById('sidebarCollapseBtn');
  if (btn) btn.classList.add('flipped');
}

function expandSidebar() {
  sidebarCollapsed = false;
  const sidebar = document.getElementById('appSidebar');
  const container = document.getElementById('appContainer');
  if (sidebar) sidebar.classList.remove('collapsed');
  if (container) container.classList.remove('sidebar-collapsed');

  const btn = document.getElementById('sidebarCollapseBtn');
  if (btn) btn.classList.remove('flipped');
}

function toggleSidebar() {
  sidebarCollapsed ? expandSidebar() : collapseSidebar();
}

// ==========================================================================
// TOOLS SUB-MENU
// ==========================================================================
function openToolsMenu() {
  toolsMenuOpen = true;
  const submenu = document.getElementById('toolsSubmenu');
  const group   = document.getElementById('nav-tools-group');
  if (submenu) submenu.classList.add('open');
  if (group)   group.classList.add('submenu-open');
}

function closeToolsMenu() {
  toolsMenuOpen = false;
  const submenu = document.getElementById('toolsSubmenu');
  const group   = document.getElementById('nav-tools-group');
  if (submenu) submenu.classList.remove('open');
  if (group)   group.classList.remove('submenu-open');
}

function toggleToolsMenu() {
  toolsMenuOpen ? closeToolsMenu() : openToolsMenu();
}

// ==========================================================================
// MOBILE SIDEBAR
// ==========================================================================
function toggleMobileSidebar() {
  mobileSidebarOpen ? closeMobileSidebar() : openMobileSidebar();
}

function openMobileSidebar() {
  mobileSidebarOpen = true;
  document.getElementById('appSidebar').classList.add('mobile-open');
  document.getElementById('sidebarOverlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  mobileSidebarOpen = false;
  document.getElementById('appSidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  document.body.style.overflow = '';
}

// ==========================================================================
// THEME — persistent via localStorage, no-flash
// ==========================================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  const darkBtn  = document.getElementById('theme-dark-btn');
  const lightBtn = document.getElementById('theme-light-btn');
  if (theme === 'dark') {
    darkBtn?.classList.add('active');
    lightBtn?.classList.remove('active');
  } else {
    lightBtn?.classList.add('active');
    darkBtn?.classList.remove('active');
  }

  // Update mobile icon
  const icon = document.getElementById('mobileThemeIcon');
  if (icon) {
    icon.innerHTML = theme === 'dark'
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>'
      : '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ==========================================================================
// RESPONSIVE: auto-collapse sidebar below 768 px
// ==========================================================================
const mq = window.matchMedia('(max-width: 768px)');

function handleBreakpoint(e) {
  const sidebar = document.getElementById('appSidebar');
  if (!sidebar) return;
  if (e.matches) {
    // mobile — sidebar driven by mobile-open class only
    sidebar.classList.remove('collapsed');
  }
}

mq.addEventListener('change', handleBreakpoint);

// ==========================================================================
// INIT
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  // Sync theme toggle buttons with the theme already set by the inline script
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);

  // Start on profile
  switchView('profile');
});
