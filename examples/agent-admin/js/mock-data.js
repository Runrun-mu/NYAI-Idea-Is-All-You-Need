// Mock Data Manager - handles all data operations with localStorage persistence
const MockDataManager = (() => {
  const STORAGE_KEY = 'agent_admin_data';
  const LOG_KEY = 'agent_admin_activity_log';

  const AVAILABLE_TOOLS = [
    'web_search', 'code_interpreter', 'file_reader', 'api_caller',
    'database_query', 'email_sender', 'slack_notifier', 'image_generator',
    'pdf_parser', 'calculator'
  ];

  const MODELS = [
    'claude-3.5-sonnet', 'claude-3-opus', 'claude-3-haiku', 'gpt-4', 'gpt-4-turbo', 'gemini-pro'
  ];

  function generateId() {
    return 'agent_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  }

  function generateRunId() {
    return 'run_' + Math.random().toString(36).substr(2, 8);
  }

  function randomDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
    d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
    return d.toISOString();
  }

  function randomRunHistory(count) {
    const statuses = ['success', 'success', 'success', 'failed', 'running'];
    const runs = [];
    for (let i = 0; i < count; i++) {
      runs.push({
        runId: generateRunId(),
        timestamp: randomDate(30),
        status: statuses[Math.floor(Math.random() * statuses.length)],
        duration: Math.floor(Math.random() * 120000) + 1000,
        tokensUsed: Math.floor(Math.random() * 50000) + 500,
        cost: parseFloat((Math.random() * 2 + 0.01).toFixed(4))
      });
    }
    runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return runs;
  }

  function seedAgents() {
    const agents = [
      { name: 'Strategic Planner Alpha', type: 'Planner', status: 'Running', model: 'claude-3-opus', description: 'High-level strategic planning agent for complex multi-step tasks.', systemPrompt: 'You are a strategic planner. Break down complex goals into actionable steps.', maxTurns: 20, allowedTools: ['web_search', 'calculator', 'file_reader'], cost: 45.23 },
      { name: 'Code Generator Pro', type: 'Generator', status: 'Running', model: 'claude-3.5-sonnet', description: 'Generates production-ready code across multiple languages.', systemPrompt: 'You are a code generation specialist. Write clean, tested code.', maxTurns: 15, allowedTools: ['code_interpreter', 'file_reader', 'api_caller'], cost: 78.56 },
      { name: 'Quality Evaluator', type: 'Evaluator', status: 'Running', model: 'gpt-4', description: 'Evaluates output quality and provides detailed scoring.', systemPrompt: 'You evaluate content quality on accuracy, clarity, and completeness.', maxTurns: 10, allowedTools: ['web_search', 'calculator'], cost: 23.10 },
      { name: 'Custom Research Bot', type: 'Custom', status: 'Running', model: 'gpt-4-turbo', description: 'Custom agent for deep research and fact-checking tasks.', systemPrompt: 'You are a research assistant. Find and verify information.', maxTurns: 25, allowedTools: ['web_search', 'pdf_parser', 'database_query'], cost: 56.78 },
      { name: 'Task Decomposer', type: 'Planner', status: 'Stopped', model: 'claude-3.5-sonnet', description: 'Breaks down large projects into manageable sub-tasks.', systemPrompt: 'Decompose complex tasks into ordered sub-tasks with dependencies.', maxTurns: 12, allowedTools: ['calculator', 'file_reader'], cost: 12.34 },
      { name: 'Content Writer', type: 'Generator', status: 'Stopped', model: 'claude-3-opus', description: 'Creates high-quality articles, blog posts, and documentation.', systemPrompt: 'You are a professional content writer. Produce engaging, well-structured content.', maxTurns: 18, allowedTools: ['web_search', 'image_generator'], cost: 34.89 },
      { name: 'Performance Reviewer', type: 'Evaluator', status: 'Stopped', model: 'claude-3-haiku', description: 'Reviews and scores agent performance metrics.', systemPrompt: 'Evaluate agent outputs against defined KPIs and provide scores.', maxTurns: 8, allowedTools: ['calculator', 'database_query'], cost: 8.45 },
      { name: 'Data Pipeline Agent', type: 'Custom', status: 'Stopped', model: 'gemini-pro', description: 'Manages ETL pipelines and data transformations.', systemPrompt: 'You manage data pipelines. Monitor, transform, and validate data flows.', maxTurns: 30, allowedTools: ['database_query', 'api_caller', 'file_reader'], cost: 67.12 },
      { name: 'Sprint Planner', type: 'Planner', status: 'Error', model: 'gpt-4', description: 'Plans sprint tasks and allocates resources for development teams.', systemPrompt: 'Plan development sprints based on backlog priority and team capacity.', maxTurns: 15, allowedTools: ['calculator', 'slack_notifier'], cost: 19.67 },
      { name: 'Email Composer', type: 'Generator', status: 'Error', model: 'claude-3-haiku', description: 'Generates professional email drafts and responses.', systemPrompt: 'Compose professional, context-aware email responses.', maxTurns: 5, allowedTools: ['email_sender', 'web_search'], cost: 3.21 },
      { name: 'Compliance Checker', type: 'Evaluator', status: 'Error', model: 'gpt-4-turbo', description: 'Checks documents and processes for regulatory compliance.', systemPrompt: 'Evaluate documents for compliance with regulations and policies.', maxTurns: 20, allowedTools: ['pdf_parser', 'web_search', 'database_query'], cost: 41.56 },
      { name: 'Workflow Automator', type: 'Custom', status: 'Running', model: 'claude-3.5-sonnet', description: 'Automates repetitive workflows and integrations.', systemPrompt: 'Automate workflows by connecting services and triggering actions.', maxTurns: 50, allowedTools: ['api_caller', 'email_sender', 'slack_notifier', 'database_query'], cost: 92.34 },
      { name: 'Meeting Summarizer', type: 'Generator', status: 'Running', model: 'claude-3-haiku', description: 'Summarizes meeting transcripts into actionable notes.', systemPrompt: 'Create concise meeting summaries with action items and decisions.', maxTurns: 8, allowedTools: ['file_reader', 'slack_notifier'], cost: 15.67 },
      { name: 'Risk Assessor', type: 'Evaluator', status: 'Stopped', model: 'gpt-4', description: 'Assesses project and business risks with mitigation strategies.', systemPrompt: 'Evaluate risks and provide mitigation recommendations.', maxTurns: 12, allowedTools: ['calculator', 'web_search', 'database_query'], cost: 28.90 },
      { name: 'API Integration Bot', type: 'Custom', status: 'Running', model: 'gemini-pro', description: 'Handles API integrations and webhook management.', systemPrompt: 'Manage API integrations, handle webhooks, and sync data between services.', maxTurns: 40, allowedTools: ['api_caller', 'database_query', 'slack_notifier'], cost: 53.21 },
      { name: 'Report Generator', type: 'Generator', status: 'Stopped', model: 'claude-3-opus', description: 'Creates detailed analytical reports from data sources.', systemPrompt: 'Generate comprehensive reports with charts, summaries, and recommendations.', maxTurns: 20, allowedTools: ['database_query', 'calculator', 'pdf_parser'], cost: 37.45 }
    ];

    return agents.map((a, i) => ({
      id: 'agent_' + (i + 1).toString().padStart(3, '0'),
      name: a.name,
      type: a.type,
      status: a.status,
      model: a.model,
      description: a.description,
      systemPrompt: a.systemPrompt,
      maxTurns: a.maxTurns,
      allowedTools: a.allowedTools,
      createdAt: randomDate(90),
      cost: a.cost,
      history: randomRunHistory(Math.floor(Math.random() * 3) + 3)
    }));
  }

  function seedActivityLog(agents) {
    const log = [];
    agents.forEach(a => {
      log.push({
        timestamp: a.createdAt,
        agentName: a.name,
        action: `Agent "${a.name}" was created`
      });
    });
    log.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return log.slice(0, 20);
  }

  function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch(e) { /* fall through to seed */ }
    }
    const agents = seedAgents();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    const log = seedActivityLog(agents);
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
    return agents;
  }

  function saveData(agents) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  }

  function loadLog() {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch(e) { /* ignore */ }
    }
    return [];
  }

  function saveLog(log) {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  }

  function addLogEntry(agentName, action) {
    const log = loadLog();
    log.unshift({
      timestamp: new Date().toISOString(),
      agentName: agentName,
      action: action
    });
    // keep last 100 entries
    if (log.length > 100) log.length = 100;
    saveLog(log);
  }

  // Public API
  return {
    AVAILABLE_TOOLS,
    MODELS,

    init() {
      loadData();
    },

    getAll() {
      return loadData();
    },

    getById(id) {
      const agents = loadData();
      return agents.find(a => a.id === id) || null;
    },

    create(agentData) {
      const agents = loadData();
      const newAgent = {
        id: generateId(),
        name: agentData.name,
        type: agentData.type || 'Custom',
        status: 'Stopped',
        model: agentData.model || 'claude-3.5-sonnet',
        description: agentData.description || '',
        systemPrompt: agentData.systemPrompt || '',
        maxTurns: agentData.maxTurns || 10,
        allowedTools: agentData.allowedTools || [],
        createdAt: new Date().toISOString(),
        cost: 0,
        history: []
      };
      agents.push(newAgent);
      saveData(agents);
      addLogEntry(newAgent.name, `Agent "${newAgent.name}" was created`);
      return newAgent;
    },

    update(id, data) {
      const agents = loadData();
      const idx = agents.findIndex(a => a.id === id);
      if (idx === -1) return null;
      const updated = { ...agents[idx], ...data, id: agents[idx].id };
      agents[idx] = updated;
      saveData(agents);
      addLogEntry(updated.name, `Agent "${updated.name}" was updated`);
      return updated;
    },

    delete(id) {
      const agents = loadData();
      const agent = agents.find(a => a.id === id);
      if (!agent) return false;
      const filtered = agents.filter(a => a.id !== id);
      saveData(filtered);
      addLogEntry(agent.name, `Agent "${agent.name}" was deleted`);
      return true;
    },

    getActivityLog() {
      return loadLog();
    },

    nameExists(name, excludeId) {
      const agents = loadData();
      return agents.some(a => a.name.toLowerCase() === name.toLowerCase() && a.id !== excludeId);
    }
  };
})();
