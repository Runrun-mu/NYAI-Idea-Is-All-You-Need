// Agent Detail / Edit Page
const AgentDetailPage = (() => {
  let currentAgent = null;
  let editMode = false;

  function render(container, agentId) {
    currentAgent = MockDataManager.getById(agentId);
    editMode = false;

    if (!currentAgent) {
      container.innerHTML = `
        <div class="page-content">
          <div class="page-header">
            <h1>Agent Not Found</h1>
            <p>The requested agent does not exist.</p>
          </div>
          <a href="#/agents" class="btn btn-ghost">← Back to Agents</a>
        </div>
      `;
      return;
    }

    renderDetail(container);
  }

  function renderDetail(container) {
    const agent = currentAgent;
    const statusClass = agent.status.toLowerCase();
    const created = new Date(agent.createdAt).toLocaleString();

    container.innerHTML = `
      <div class="page-content">
        <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h1>${escapeHtml(agent.name)}</h1>
            <p>${escapeHtml(agent.description)}</p>
          </div>
          <div style="display:flex;gap:8px;">
            <a href="#/agents" class="btn btn-ghost">← Back</a>
            <button class="btn btn-primary" id="editBtn">Edit</button>
            <button class="btn btn-danger" id="deleteBtn">Delete</button>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Agent Information</div>
          <div class="detail-info-grid">
            <div class="detail-info-item">
              <span class="detail-info-label">ID</span>
              <span class="detail-info-value" style="font-family:var(--font-mono);font-size:12px;">${agent.id}</span>
            </div>
            <div class="detail-info-item">
              <span class="detail-info-label">Type</span>
              <span class="detail-info-value"><span class="type-badge">${agent.type}</span></span>
            </div>
            <div class="detail-info-item">
              <span class="detail-info-label">Status</span>
              <span class="detail-info-value"><span class="status-badge ${statusClass}"><span class="status-dot ${statusClass}"></span>${agent.status}</span></span>
            </div>
            <div class="detail-info-item">
              <span class="detail-info-label">Model</span>
              <span class="detail-info-value model-tag">${agent.model}</span>
            </div>
            <div class="detail-info-item">
              <span class="detail-info-label">Max Turns</span>
              <span class="detail-info-value">${agent.maxTurns}</span>
            </div>
            <div class="detail-info-item">
              <span class="detail-info-label">Total Cost</span>
              <span class="detail-info-value cost-value">$${agent.cost.toFixed(2)}</span>
            </div>
            <div class="detail-info-item">
              <span class="detail-info-label">Created</span>
              <span class="detail-info-value">${created}</span>
            </div>
          </div>

          <div style="margin-top:16px;">
            <div class="detail-info-label" style="margin-bottom:8px;">System Prompt</div>
            <div style="background:var(--bg-primary);padding:12px;border-radius:var(--radius-md);font-size:13px;color:var(--text-secondary);line-height:1.6;border:1px solid var(--border-color);">${escapeHtml(agent.systemPrompt)}</div>
          </div>

          <div style="margin-top:16px;">
            <div class="detail-info-label" style="margin-bottom:8px;">Allowed Tools</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${agent.allowedTools.map(t => `<span class="type-badge">${escapeHtml(t)}</span>`).join('')}
              ${agent.allowedTools.length === 0 ? '<span style="color:var(--text-muted);font-size:13px;">None</span>' : ''}
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Run History</div>
          <div id="runHistoryContainer"></div>
        </div>

        <div id="editFormContainer" style="display:none;"></div>
      </div>
    `;

    // Edit button
    document.getElementById('editBtn').addEventListener('click', () => {
      renderEditForm(container);
    });

    // Delete button
    document.getElementById('deleteBtn').addEventListener('click', () => {
      Modal.showModal({
        title: 'Delete Agent',
        message: `Are you sure you want to delete "${agent.name}"? This action cannot be undone.`,
        onConfirm: () => {
          MockDataManager.delete(agent.id);
          Toast.showToast(`Agent "${agent.name}" deleted`, 'success');
          window.location.hash = '#/agents';
        }
      });
    });

    // Run history
    renderRunHistory();
  }

  function renderRunHistory() {
    const historyContainer = document.getElementById('runHistoryContainer');
    if (!currentAgent.history || currentAgent.history.length === 0) {
      historyContainer.innerHTML = `<div class="empty-state"><div class="empty-state-text">No run history</div></div>`;
      return;
    }

    const rows = currentAgent.history.map((run, idx) => {
      const time = new Date(run.timestamp).toLocaleString();
      const durationSec = (run.duration / 1000).toFixed(1);
      const statusClass = run.status;
      return `
        <tr>
          <td style="font-family:var(--font-mono);font-size:12px;">${run.runId}</td>
          <td>${time}</td>
          <td><span class="run-status ${statusClass}">●  ${run.status}</span></td>
          <td>${durationSec}s</td>
          <td>${run.tokensUsed.toLocaleString()}</td>
          <td class="cost-value">$${run.cost.toFixed(4)}</td>
        </tr>
      `;
    }).join('');

    historyContainer.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="run-history-table">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Timestamp</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Tokens</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderEditForm(container) {
    const agent = currentAgent;

    container.innerHTML = `
      <div class="page-content">
        <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h1>Edit: ${escapeHtml(agent.name)}</h1>
            <p>Modify agent configuration</p>
          </div>
          <div style="display:flex;gap:8px;">
            <a href="#/agents" class="btn btn-ghost">← Back</a>
            <button class="btn btn-danger" id="deleteBtn">Delete</button>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Edit Agent</div>
          <form id="editAgentForm">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label required">Name</label>
                <input type="text" class="form-input" id="editName" value="${escapeAttr(agent.name)}">
                <div class="form-error" id="editNameError"></div>
              </div>
              <div class="form-group">
                <label class="form-label">Model</label>
                <select class="form-select" id="editModel">
                  ${MockDataManager.MODELS.map(m => `<option value="${m}" ${m === agent.model ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-textarea" id="editDescription" rows="3">${escapeHtml(agent.description)}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">System Prompt</label>
              <textarea class="form-textarea" id="editSystemPrompt" rows="4">${escapeHtml(agent.systemPrompt)}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Max Turns</label>
              <input type="number" class="form-input" id="editMaxTurns" value="${agent.maxTurns}" min="1" max="100" style="max-width:200px;">
            </div>

            <div class="form-group">
              <label class="form-label">Allowed Tools</label>
              <div class="checkbox-group" id="editToolsGroup">
                ${MockDataManager.AVAILABLE_TOOLS.map(tool => {
                  const checked = agent.allowedTools.includes(tool);
                  return `
                    <label class="checkbox-item ${checked ? 'checked' : ''}">
                      <input type="checkbox" value="${tool}" ${checked ? 'checked' : ''}>
                      <span class="checkbox-mark">${checked ? '✓' : ''}</span>
                      <span>${tool}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Save Changes</button>
              <button type="button" class="btn btn-ghost" id="cancelEditBtn">Cancel</button>
            </div>
          </form>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Run History</div>
          <div id="runHistoryContainer"></div>
        </div>
      </div>
    `;

    // Checkbox toggle styling
    document.querySelectorAll('#editToolsGroup .checkbox-item').forEach(label => {
      const cb = label.querySelector('input[type="checkbox"]');
      const mark = label.querySelector('.checkbox-mark');
      label.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        cb.checked = !cb.checked;
        label.classList.toggle('checked', cb.checked);
        mark.textContent = cb.checked ? '✓' : '';
      });
      cb.addEventListener('change', () => {
        label.classList.toggle('checked', cb.checked);
        mark.textContent = cb.checked ? '✓' : '';
      });
    });

    // Form submit
    document.getElementById('editAgentForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveAgent();
    });

    // Cancel
    document.getElementById('cancelEditBtn').addEventListener('click', () => {
      currentAgent = MockDataManager.getById(currentAgent.id);
      renderDetail(container);
    });

    // Delete
    document.getElementById('deleteBtn').addEventListener('click', () => {
      Modal.showModal({
        title: 'Delete Agent',
        message: `Are you sure you want to delete "${agent.name}"? This action cannot be undone.`,
        onConfirm: () => {
          MockDataManager.delete(agent.id);
          Toast.showToast(`Agent "${agent.name}" deleted`, 'success');
          window.location.hash = '#/agents';
        }
      });
    });

    renderRunHistory();
  }

  function saveAgent() {
    const name = document.getElementById('editName').value.trim();
    const nameError = document.getElementById('editNameError');
    nameError.textContent = '';

    if (!name) {
      nameError.textContent = 'Name is required';
      document.getElementById('editName').classList.add('error');
      return;
    }

    if (MockDataManager.nameExists(name, currentAgent.id)) {
      nameError.textContent = 'An agent with this name already exists';
      document.getElementById('editName').classList.add('error');
      return;
    }

    const tools = [];
    document.querySelectorAll('#editToolsGroup input[type="checkbox"]:checked').forEach(cb => {
      tools.push(cb.value);
    });

    const updated = MockDataManager.update(currentAgent.id, {
      name: name,
      description: document.getElementById('editDescription').value.trim(),
      model: document.getElementById('editModel').value,
      systemPrompt: document.getElementById('editSystemPrompt').value.trim(),
      maxTurns: parseInt(document.getElementById('editMaxTurns').value) || 10,
      allowedTools: tools
    });

    if (updated) {
      currentAgent = updated;
      Toast.showToast('Agent updated successfully', 'success');
      renderDetail(document.getElementById('mainContent'));
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { render };
})();
