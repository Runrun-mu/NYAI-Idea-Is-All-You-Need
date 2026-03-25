// Sidebar Component
const Sidebar = (() => {
  let collapsed = false;

  function render() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-logo">A</div>
        <span class="sidebar-title">Agent Admin</span>
      </div>
      <nav class="sidebar-nav">
        <a href="#/dashboard" class="nav-item" data-route="dashboard">
          <span class="nav-item-icon">📊</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/agents" class="nav-item" data-route="agents">
          <span class="nav-item-icon">🤖</span>
          <span class="nav-item-label">Agents</span>
        </a>
        <a href="#/agents/new" class="nav-item" data-route="agents-new">
          <span class="nav-item-icon">➕</span>
          <span class="nav-item-label">Create Agent</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <button class="collapse-btn" id="collapseBtn">
          <span class="nav-item-icon">◀</span>
          <span class="nav-item-label">Collapse</span>
        </button>
      </div>
    `;

    document.getElementById('collapseBtn').addEventListener('click', toggleCollapse);

    // Mobile hamburger
    const mobileHeader = document.getElementById('mobileHeader');
    if (mobileHeader) {
      mobileHeader.innerHTML = `
        <button class="hamburger-btn" id="hamburgerBtn">☰</button>
        <span class="mobile-title">Agent Admin</span>
      `;
      document.getElementById('hamburgerBtn').addEventListener('click', toggleMobile);
    }

    // Overlay click to close mobile sidebar
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
      });
    }

    // Close mobile sidebar on nav item click
    sidebar.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
      });
    });
  }

  function toggleCollapse() {
    const sidebar = document.getElementById('sidebar');
    collapsed = !collapsed;
    sidebar.classList.toggle('collapsed', collapsed);
  }

  function toggleMobile() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('mobile-open');
  }

  function updateActiveNav(route) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });

    let activeRoute = 'dashboard';
    if (route === '/agents/new') {
      activeRoute = 'agents-new';
    } else if (route === '/agents' || route.startsWith('/agents/')) {
      activeRoute = 'agents';
    } else {
      activeRoute = 'dashboard';
    }

    const activeItem = sidebar.querySelector(`[data-route="${activeRoute}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }
  }

  return { render, updateActiveNav };
})();
