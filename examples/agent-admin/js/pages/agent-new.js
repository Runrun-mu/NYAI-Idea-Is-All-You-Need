// Create Agent Page
const AgentNewPage = (() => {
  function render(container) {
    container.innerHTML = `
      <div class="page-content">
        <div class="page-header">
          <h1>Create New Agent</h1>
          <p>Configure a new AI agent</p>
        </div>

        <div class="detail-section">
          <form id="createAgentForm">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label required">Name</label>
                <input type="text" class="form-input" id="newName" placeholder="Enter agent name">
                <div class="form-error" id="newNameError"></div>
              </div>
              <div class="form-group">
                <label class="form-label">Type</label>
                <select class="form-select" id="newType">
                  <option value="Planner">Planner</option>
                  <option value="Generator">Generator</option>
                  <option value="Evaluator">Evaluator</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-textarea" id="newDescription" rows="3" placeholder="Describe what this agent does..."></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Model</label>
                <select class="form-select" id="newModel">
                  ${MockDataManager.MODELS.map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Max Turns</label>
                <input type="number" class="form-input" id="newMaxTurns" value="10" min="1" max="100">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">System Prompt</label>
              <textarea class="form-textarea" id="newSystemPrompt" rows="4" placeholder="Enter system prompt..."></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Allowed Tools</label>
              <div class="checkbox-group" id="newToolsGroup">
                ${MockDataManager.AVAILABLE_TOOLS.map(tool => `
                  <label class="checkbox-item">
                    <input type="checkbox" value="${tool}">
                    <span class="checkbox-mark"></span>
                    <span>${tool}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Create Agent</button>
              <a href="#/agents" class="btn btn-ghost">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    `;

    // Checkbox toggle styling
    document.querySelectorAll('#newToolsGroup .checkbox-item').forEach(label => {
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
    document.getElementById('createAgentForm').addEventListener('submit', (e) => {
      e.preventDefault();
      createAgent();
    });
  }

  function createAgent() {
    const name = document.getElementById('newName').value.trim();
    const nameError = document.getElementById('newNameError');
    const nameInput = document.getElementById('newName');
    nameError.textContent = '';
    nameInput.classList.remove('error');

    // Validate name required
    if (!name) {
      nameError.textContent = 'Name is required';
      nameInput.classList.add('error');
      return;
    }

    // Validate name uniqueness
    if (MockDataManager.nameExists(name)) {
      nameError.textContent = 'An agent with this name already exists';
      nameInput.classList.add('error');
      return;
    }

    const tools = [];
    document.querySelectorAll('#newToolsGroup input[type="checkbox"]:checked').forEach(cb => {
      tools.push(cb.value);
    });

    MockDataManager.create({
      name: name,
      type: document.getElementById('newType').value,
      description: document.getElementById('newDescription').value.trim(),
      model: document.getElementById('newModel').value,
      systemPrompt: document.getElementById('newSystemPrompt').value.trim(),
      maxTurns: parseInt(document.getElementById('newMaxTurns').value) || 10,
      allowedTools: tools
    });

    Toast.showToast('Agent created successfully', 'success');
    window.location.hash = '#/agents';
  }

  return { render };
})();
