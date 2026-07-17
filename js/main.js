// ==========================================================================
// SPA NAVIGATIONAL CONTROL
// ==========================================================================
function switchView(viewName) {
  // Update nav menu active states
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  
  const activeNav = document.getElementById(`nav-${viewName}`);
  if (activeNav) activeNav.classList.add('active');
  
  // Update panels active states
  const panels = document.querySelectorAll('.view-panel');
  panels.forEach(panel => panel.classList.remove('active'));
  
  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) activePanel.classList.add('active');
  
  // Close mobile sidebar if open
  const sidebar = document.getElementById('appSidebar');
  sidebar.classList.remove('mobile-open');
}

function toggleMobileMenu() {
  const sidebar = document.getElementById('appSidebar');
  sidebar.classList.toggle('mobile-open');
}

// ==========================================================================
// THEME CONTROL (LIGHT / DARK)
// ==========================================================================
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  html.setAttribute('data-theme', nextTheme);
  
  // Update slider/buttons state
  const darkBtn = document.getElementById('theme-dark-btn');
  const lightBtn = document.getElementById('theme-light-btn');
  
  if (nextTheme === 'light') {
    darkBtn.classList.remove('active');
    lightBtn.classList.add('active');
  } else {
    lightBtn.classList.remove('active');
    darkBtn.classList.add('active');
  }
}
