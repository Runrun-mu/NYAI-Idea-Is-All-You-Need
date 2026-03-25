// Dashboard Page
const DashboardPage = (() => {
  function render(container) {
    const agents = MockDataManager.getAll();
    const log = MockDataManager.getActivityLog();

    const totalCount = agents.length;
    const runningCount = agents.filter(a => a.status === 'Running').length;
    const stoppedCount = agents.filter(a => a.status === 'Stopped').length;
    const errorCount = agents.filter(a => a.status === 'Error').length;
    const totalCost = agents.reduce((s, a) => s + (a.cost || 0), 0);

    container.innerHTML = `
      <div class="page-content">
        <div class="page-header">
          <h1>Dashboard</h1>
          <p>Overview of your AI agents and activity</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label">Total Agents</div>
            <div class="stat-card-value">${totalCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label">Running</div>
            <div class="stat-card-value running">${runningCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label">Stopped</div>
            <div class="stat-card-value stopped">${stoppedCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label">Total Cost</div>
            <div class="stat-card-value cost">$${totalCost.toFixed(2)}</div>
          </div>
        </div>

        <div class="dashboard-grid">
          <div class="dashboard-card">
            <div class="dashboard-card-title">📊 Agent Status Distribution</div>
            <div id="pieChartContainer"></div>
          </div>
          <div class="dashboard-card">
            <div class="dashboard-card-title">📋 Recent Activity</div>
            <div id="activityLogContainer"></div>
          </div>
        </div>
      </div>
    `;

    // Pie Chart
    Chart.renderPieChart(document.getElementById('pieChartContainer'), [
      { label: 'Running', value: runningCount, color: '#22c55e' },
      { label: 'Stopped', value: stoppedCount, color: '#f59e0b' },
      { label: 'Error', value: errorCount, color: '#ef4444' }
    ]);

    // Activity Log
    const logContainer = document.getElementById('activityLogContainer');
    const recentLog = log.slice(0, 10);

    if (recentLog.length === 0) {
      logContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">No recent activity</div>
        </div>
      `;
    } else {
      const list = document.createElement('ul');
      list.className = 'activity-list';
      recentLog.forEach(entry => {
        const item = document.createElement('li');
        item.className = 'activity-item';
        const time = new Date(entry.timestamp);
        const timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        item.innerHTML = `
          <div class="activity-action">${escapeHtml(entry.action)}</div>
          <div class="activity-time">${timeStr}</div>
        `;
        list.appendChild(item);
      });
      logContainer.appendChild(list);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render };
})();
