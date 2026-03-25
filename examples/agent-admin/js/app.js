// App Router & Initialization
const App = (() => {
  function init() {
    // Initialize mock data
    MockDataManager.init();

    // Render sidebar
    Sidebar.render();

    // Listen for hash changes
    window.addEventListener('hashchange', handleRoute);

    // Handle initial route
    handleRoute();
  }

  function handleRoute() {
    const hash = window.location.hash || '';
    const path = hash.replace('#', '') || '/';

    // Default redirect
    if (path === '/' || path === '') {
      window.location.hash = '#/dashboard';
      return;
    }

    const mainContent = document.getElementById('mainContent');

    // Route matching
    if (path === '/dashboard') {
      Sidebar.updateActiveNav('/dashboard');
      DashboardPage.render(mainContent);
    } else if (path === '/agents/new') {
      Sidebar.updateActiveNav('/agents/new');
      AgentNewPage.render(mainContent);
    } else if (path === '/agents') {
      Sidebar.updateActiveNav('/agents');
      AgentListPage.render(mainContent);
    } else if (path.match(/^\/agents\/(.+)$/)) {
      const agentId = path.match(/^\/agents\/(.+)$/)[1];
      Sidebar.updateActiveNav('/agents/' + agentId);
      AgentDetailPage.render(mainContent, agentId);
    } else {
      // Fallback to dashboard
      window.location.hash = '#/dashboard';
    }
  }

  return { init };
})();

// Boot the app
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
