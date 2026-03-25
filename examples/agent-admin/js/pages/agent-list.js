// Agent List Page
const AgentListPage = (() => {
  let searchQuery = '';
  let statusFilter = 'All';
  let sortColumn = 'name';
  let sortDirection = 'asc';
  let currentPage = 1;
  const pageSize = 10;

  function render(container) {
    container.innerHTML = `
      <div class="page-content">
        <div class="page-header">
          <h1>Agents</h1>
          <p>Manage your AI agents</p>
        </div>

        <div class="toolbar">
          <div class="search-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="agentSearch" placeholder="Search agents by name..." value="${escapeAttr(searchQuery)}">
          </div>
          <select class="filter-select" id="statusFilter">
            <option value="All" ${statusFilter === 'All' ? 'selected' : ''}>All Status</option>
            <option value="Running" ${statusFilter === 'Running' ? 'selected' : ''}>Running</option>
            <option value="Stopped" ${statusFilter === 'Stopped' ? 'selected' : ''}>Stopped</option>
            <option value="Error" ${statusFilter === 'Error' ? 'selected' : ''}>Error</option>
          </select>
          <div class="toolbar-right">
            <a href="#/agents/new" class="btn btn-primary">+ New Agent</a>
          </div>
        </div>

        <div class="table-container">
          <table class="data-table" id="agentTable">
            <thead>
              <tr>
                <th data-sort="name">Name <span class="sort-icon">↕</span></th>
                <th data-sort="type">Type <span class="sort-icon">↕</span></th>
                <th data-sort="status">Status <span class="sort-icon">↕</span></th>
                <th data-sort="model">Model <span class="sort-icon">↕</span></th>
                <th data-sort="createdAt">Created <span class="sort-icon">↕</span></th>
                <th data-sort="cost">Cost <span class="sort-icon">↕</span></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="agentTableBody"></tbody>
          </table>
        </div>

        <div id="paginationContainer"></div>
      </div>
    `;

    // Event listeners
    document.getElementById('agentSearch').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('statusFilter').addEventListener('change', (e) => {
      statusFilter = e.target.value;
      currentPage = 1;
      renderTable();
    });

    // Sort headers
    document.querySelectorAll('#agentTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderTable();
      });
    });

    renderTable();
  }

  function renderTable() {
    let agents = MockDataManager.getAll();

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      agents = agents.filter(a => a.name.toLowerCase().includes(q));
    }

    // Filter by status
    if (statusFilter !== 'All') {
      agents = agents.filter(a => a.status === statusFilter);
    }

    // Sort
    agents.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (sortColumn === 'cost' || sortColumn === 'maxTurns') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else if (sortColumn === 'createdAt') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // Update sort indicators
    document.querySelectorAll('#agentTable th[data-sort]').forEach(th => {
      th.classList.remove('sorted');
      const icon = th.querySelector('.sort-icon');
      icon.textContent = '↕';
      if (th.dataset.sort === sortColumn) {
        th.classList.add('sorted');
        icon.textContent = sortDirection === 'asc' ? '↑' : '↓';
      }
    });

    // Pagination
    const totalItems = agents.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageAgents = agents.slice(start, start + pageSize);

    // Render rows
    const tbody = document.getElementById('agentTableBody');
    if (pageAgents.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No agents found</td></tr>
      `;
    } else {
      tbody.innerHTML = pageAgents.map(agent => {
        const statusClass = agent.status.toLowerCase();
        const created = new Date(agent.createdAt).toLocaleDateString();
        return `
          <tr>
            <td><a class="agent-name-link" href="#/agents/${agent.id}">${escapeHtml(agent.name)}</a></td>
            <td><span class="type-badge">${escapeHtml(agent.type)}</span></td>
            <td><span class="status-badge ${statusClass}"><span class="status-dot ${statusClass}"></span>${agent.status}</span></td>
            <td><span class="model-tag">${escapeHtml(agent.model)}</span></td>
            <td>${created}</td>
            <td><span class="cost-value">$${agent.cost.toFixed(2)}</span></td>
            <td>
              <div class="actions-cell">
                <a href="#/agents/${agent.id}" class="btn btn-ghost btn-sm">View</a>
                <button class="btn btn-danger btn-sm delete-agent-btn" data-id="${agent.id}" data-name="${escapeAttr(agent.name)}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Delete buttons
      tbody.querySelectorAll('.delete-agent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const name = btn.dataset.name;
          Modal.showModal({
            title: 'Delete Agent',
            message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
            onConfirm: () => {
              MockDataManager.delete(id);
              Toast.showToast(`Agent "${name}" deleted`, 'success');
              renderTable();
            }
          });
        });
      });
    }

    // Pagination
    Pagination.renderPagination(document.getElementById('paginationContainer'), {
      totalItems,
      pageSize,
      currentPage,
      onPageChange: (page) => {
        currentPage = page;
        renderTable();
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { render };
})();
