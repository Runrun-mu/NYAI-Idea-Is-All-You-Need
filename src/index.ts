#!/usr/bin/env bun

import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { NYAIConfig } from './types/config';
import type { BackendType } from './types/agent';
import { defaultConfig } from './types/config';
import { Orchestrator } from './core/orchestrator';
import { App } from './tui/App';
import { runHeadless } from './headless/headless-runner';
import { loadState } from './protocol/state-store';
import { readDecisions } from './protocol/decision-logger';
import { getLatestReport } from './protocol/file-protocol';
import { readFeatureList } from './protocol/feature-tracker';
import {
  addBacklogItem,
  getNextItem,
  markItemInProgress,
  markItemDone,
  markItemCancelled,
  listPendingItems,
  listAllItems,
} from './protocol/backlog-store';
import { readMemory } from './protocol/memory-store';

const program = new Command();

program
  .name('nyai')
  .description('NYAI — Autonomous AI Agent Orchestrator')
  .version('0.3.0');

// ─── nyai init ──────────────────────────────────────────────────

program
  .command('init')
  .argument('[name]', 'Project name', 'my-project')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Initialize a NYAI project')
  .action((name: string, opts: { dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');

    if (existsSync(harnessDir)) {
      console.log('Warning: .harness/ already exists. Skipping init.');
      return;
    }

    // Create directories
    for (const sub of ['specs', 'contracts', 'reports']) {
      mkdirSync(join(harnessDir, sub), { recursive: true });
    }

    // Write default config
    const config = defaultConfig(name, rootDir);
    writeFileSync(
      join(harnessDir, 'config.yaml'),
      stringifyYaml(config),
      'utf-8'
    );

    // Write .gitignore
    writeFileSync(
      join(harnessDir, '.gitignore'),
      'state.json\ndecisions.log\nprogress.log\nmemory.json\nbacklog.json\n',
      'utf-8'
    );

    // Create progress.log placeholder
    writeFileSync(join(harnessDir, 'progress.log'), '', 'utf-8');

    console.log(`Initialized NYAI project "${name}" in ${harnessDir}`);
    console.log('   Edit .harness/config.yaml to customize settings.');
  });

// ─── nyai run ───────────────────────────────────────────────────

program
  .command('run')
  .argument('[prompt]', 'The requirement/prompt to implement')
  .option('--headless', 'Run without TUI (for CI/scripts)')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .option('--budget <usd>', 'Max cost in USD', parseFloat)
  .option('--max-rounds <n>', 'Max generate/evaluate rounds', parseInt)
  .option('--skip-architect', 'Skip the Architect agent phase')
  .option('--backend <type>', 'Backend to use: claude, codex, opencode')
  .option('--no-test-first', 'Disable test-first mode')
  .option('--decompose', 'Enable task decomposition into features')
  .option('--git-auto-commit', 'Auto-commit after each eval round')
  .option('--deploy', 'Deploy to Vercel after successful build')
  .option('--generator-timeout <ms>', 'Generator timeout in ms (default: 1200000)', parseInt)
  .option('--evaluator-timeout <ms>', 'Evaluator timeout in ms (default: 900000)', parseInt)
  .option('--parallel-generators <n>', 'Number of parallel generators (default: 1)', parseInt)
  .option('--from-backlog', 'Pick next item from backlog as the sprint prompt')
  .description('Run NYAI to implement a requirement')
  .action(async (prompt: string | undefined, opts: {
    headless?: boolean;
    dir: string;
    budget?: number;
    maxRounds?: number;
    skipArchitect?: boolean;
    backend?: string;
    testFirst?: boolean;
    decompose?: boolean;
    gitAutoCommit?: boolean;
    deploy?: boolean;
    generatorTimeout?: number;
    evaluatorTimeout?: number;
    parallelGenerators?: number;
    fromBacklog?: boolean;
  }) => {
    const rootDir = resolve(opts.dir);
    const config = loadConfig(rootDir);

    // Override config with CLI flags
    if (opts.budget !== undefined) config.budget.maxCostUsd = opts.budget;
    if (opts.maxRounds !== undefined) config.budget.maxRounds = opts.maxRounds;
    if (opts.skipArchitect) config.skipArchitect = true;
    if (opts.backend) config.backend = opts.backend as BackendType;
    if (opts.testFirst === false) config.testFirst = false;
    if (opts.decompose) config.taskDecomposition = true;
    if (opts.gitAutoCommit) config.gitAutoCommit = true;
    if (opts.deploy) config.deploy = { enabled: true, target: 'vercel' };
    if (opts.generatorTimeout !== undefined) config.budget.generatorTimeoutMs = opts.generatorTimeout;
    if (opts.evaluatorTimeout !== undefined) config.budget.evaluatorTimeoutMs = opts.evaluatorTimeout;
    if (opts.parallelGenerators !== undefined) config.parallelGenerators = opts.parallelGenerators;

    config.project.rootDir = rootDir;

    // Handle --from-backlog
    let effectivePrompt = prompt ?? '';
    let backlogItemId: string | undefined;

    if (opts.fromBacklog) {
      const harnessDir = join(rootDir, '.harness');
      const nextItem = getNextItem(harnessDir);
      if (!nextItem) {
        console.log('No pending items in backlog.');
        return;
      }
      effectivePrompt = nextItem.description
        ? `${nextItem.title}\n\n${nextItem.description}`
        : nextItem.title;
      backlogItemId = nextItem.id;
      const sprintId = `sprint-${Date.now()}`;
      markItemInProgress(harnessDir, nextItem.id, sprintId);
      console.log(`📋 Picked backlog item: [${nextItem.id}] ${nextItem.title} (${nextItem.priority})`);
    }

    if (!effectivePrompt) {
      console.error('Error: prompt is required (or use --from-backlog)');
      process.exit(1);
    }

    const orchestrator = new Orchestrator(config);

    if (opts.headless) {
      // Headless mode
      runHeadless(orchestrator);

      // Auto-approve decisions in headless mode
      config.autonomy.autoApproveDecisions = true;

      await orchestrator.run(effectivePrompt, backlogItemId);
      process.exit(0);
    } else {
      // TUI mode
      const { waitUntilExit } = render(
        React.createElement(App, { orchestrator, config, prompt: effectivePrompt })
      );

      // Start orchestrator in background
      orchestrator.run(effectivePrompt, backlogItemId).catch((err) => {
        console.error('Orchestrator error:', err);
      });

      await waitUntilExit();
    }
  });

// ─── nyai resume ────────────────────────────────────────────────

program
  .command('resume')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .option('--headless', 'Run without TUI (for CI/scripts)')
  .description('Resume an interrupted sprint')
  .action(async (opts: { dir: string; headless?: boolean }) => {
    const rootDir = resolve(opts.dir);
    const config = loadConfig(rootDir);
    config.project.rootDir = rootDir;

    const orchestrator = new Orchestrator(config);

    if (opts.headless) {
      runHeadless(orchestrator);
      config.autonomy.autoApproveDecisions = true;
      await orchestrator.resume();
      process.exit(0);
    } else {
      // Check if there's a state to resume
      const harnessDir = join(rootDir, '.harness');
      const state = loadState(harnessDir);
      if (!state) {
        console.log('No saved state found to resume.');
        return;
      }

      const { waitUntilExit } = render(
        React.createElement(App, { orchestrator, config, prompt: `[Resume] ${state.prompt}` })
      );

      orchestrator.resume().catch((err) => {
        console.error('Orchestrator error:', err);
      });

      await waitUntilExit();
    }
  });

// ─── nyai backlog ───────────────────────────────────────────────

const backlogCmd = program
  .command('backlog')
  .description('Manage the project backlog');

backlogCmd
  .command('add')
  .argument('<title>', 'Title of the backlog item')
  .option('--type <type>', 'Item type: feature, bug, improvement, chore', 'feature')
  .option('--priority <priority>', 'Priority: critical, high, medium, low', 'medium')
  .option('--description <desc>', 'Detailed description')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Add an item to the backlog')
  .action((title: string, opts: {
    type: string;
    priority: string;
    description?: string;
    tags?: string;
    dir: string;
  }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');

    const item = addBacklogItem(harnessDir, {
      type: opts.type as 'feature' | 'bug' | 'improvement' | 'chore',
      title,
      description: opts.description,
      priority: opts.priority as 'critical' | 'high' | 'medium' | 'low',
      submittedBy: 'user',
      tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()) : undefined,
    });

    console.log(`✅ Added to backlog: [${item.id}] ${item.title} (${item.priority} ${item.type})`);
  });

backlogCmd
  .command('list')
  .option('--all', 'Show all items including completed/cancelled')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('List backlog items')
  .action((opts: { all?: boolean; dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');

    const items = opts.all ? listAllItems(harnessDir) : listPendingItems(harnessDir);

    if (items.length === 0) {
      console.log(opts.all ? 'Backlog is empty.' : 'No pending items in backlog.');
      return;
    }

    console.log(`Backlog (${items.length} items):\n`);
    for (const item of items) {
      const statusIcon =
        item.status === 'done' ? '✅'
          : item.status === 'in_progress' ? '🔄'
            : item.status === 'cancelled' ? '❌'
              : '⬚';
      const priorityIcon =
        item.priority === 'critical' ? '🔴'
          : item.priority === 'high' ? '🟠'
            : item.priority === 'medium' ? '🟡'
              : '🟢';

      console.log(`${statusIcon} ${priorityIcon} [${item.id}] ${item.title} (${item.type})`);
      if (item.description) console.log(`   ${item.description}`);
      if (item.sprintId) console.log(`   Sprint: ${item.sprintId}`);
      if (item.source) console.log(`   Source: ${item.source}`);
      if (item.tags && item.tags.length > 0) console.log(`   Tags: ${item.tags.join(', ')}`);
    }
  });

backlogCmd
  .command('remove')
  .argument('<id>', 'Backlog item ID to cancel')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Cancel a backlog item')
  .action((id: string, opts: { dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');
    markItemCancelled(harnessDir, id, 'Removed by user');
    console.log(`❌ Cancelled backlog item: ${id}`);
  });

// ─── nyai watch ────────────────────────────────────────────────

program
  .command('watch')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .option('--interval <seconds>', 'Poll interval in seconds', '30')
  .description('Watch backlog and auto-run sprints for new items')
  .action(async (opts: { dir: string; interval: string }) => {
    const rootDir = resolve(opts.dir);
    const config = loadConfig(rootDir);
    config.project.rootDir = rootDir;
    config.autonomy.autoApproveDecisions = true;

    const intervalMs = parseInt(opts.interval) * 1000;
    const harnessDir = join(rootDir, '.harness');

    console.log(`👀 Watching backlog (poll every ${opts.interval}s). Press Ctrl+C to stop.\n`);

    let running = false;

    const poll = async () => {
      if (running) return;

      const nextItem = getNextItem(harnessDir);
      if (!nextItem) return;

      running = true;
      console.log(`\n📋 Found backlog item: [${nextItem.id}] ${nextItem.title}`);

      const sprintId = `sprint-${Date.now()}`;
      markItemInProgress(harnessDir, nextItem.id, sprintId);

      const orchestrator = new Orchestrator(config);
      runHeadless(orchestrator);

      const prompt = nextItem.description
        ? `${nextItem.title}\n\n${nextItem.description}`
        : nextItem.title;

      try {
        await orchestrator.run(prompt, nextItem.id);
      } catch (err) {
        console.error(`❌ Sprint failed:`, err);
      }

      running = false;
    };

    // Initial poll
    await poll();

    // Set up interval
    const timer = setInterval(poll, intervalMs);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(timer);
      console.log('\n👋 Watch mode stopped.');
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {}); // never resolves
  });

// ─── nyai memory ────────────────────────────────────────────────

program
  .command('memory')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Show project memory (cross-sprint knowledge)')
  .action((opts: { dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');
    const memory = readMemory(harnessDir);

    if (!memory) {
      console.log('No project memory found. Complete a sprint to generate memory.');
      return;
    }

    console.log(`🧠 Project Memory: ${memory.projectName}\n`);

    // Stats
    const s = memory.stats;
    console.log('📊 Stats:');
    console.log(`   Total sprints: ${s.totalSprints}`);
    console.log(`   Total rounds: ${s.totalRounds}`);
    console.log(`   Total cost: $${s.totalCostUsd.toFixed(2)}`);
    console.log(`   Pass rate: ${(s.passRate * 100).toFixed(0)}%`);
    console.log(`   Avg rounds/sprint: ${s.avgRoundsPerSprint.toFixed(1)}`);

    // Recent sprints
    if (memory.sprints.length > 0) {
      console.log(`\n📋 Recent Sprints (last ${Math.min(5, memory.sprints.length)}):`);
      for (const sprint of memory.sprints.slice(-5)) {
        const date = new Date(sprint.timestamp).toLocaleDateString();
        const verdict = sprint.verdict ?? 'N/A';
        console.log(`   [${date}] ${sprint.sprintId} — ${verdict} (${sprint.rounds} rounds, $${sprint.costUsd.toFixed(3)})`);
        if (sprint.built.length > 0) {
          console.log(`      Built: ${sprint.built.slice(0, 3).join(', ')}${sprint.built.length > 3 ? '...' : ''}`);
        }
      }
    }

    // Knowledge
    if (memory.knowledge.length > 0) {
      console.log(`\n💡 Knowledge (${memory.knowledge.length} entries):`);
      for (const k of memory.knowledge.slice(0, 10)) {
        console.log(`   [${k.category}] ${k.content} (confidence: ${k.confidence.toFixed(1)})`);
      }
    }
  });

// ─── nyai status ────────────────────────────────────────────────

program
  .command('status')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Show current orchestrator state')
  .action((opts: { dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');
    const state = loadState(harnessDir);

    if (!state) {
      console.log('No active state found. Run `nyai run` first.');
      return;
    }

    console.log('NYAI Status');
    console.log(`   State: ${state.state}`);
    console.log(`   Sprint: ${state.sprintId}`);
    console.log(`   Round: ${state.round}`);
    console.log(`   Cost: $${state.costSpent.toFixed(4)} / $${state.costBudget.toFixed(2)}`);
    console.log(`   Last Verdict: ${state.lastEvalVerdict ?? 'N/A'}`);
    if (state.currentAgent) {
      console.log(`   Active Agent: ${state.currentAgent}`);
    }
    if (state.currentFeatureIndex !== undefined && state.totalFeatures) {
      console.log(`   Feature: ${state.currentFeatureIndex + 1} / ${state.totalFeatures}`);
    }
    if (state.previouslyPassedAcs.length > 0) {
      console.log(`   Passed ACs: ${state.previouslyPassedAcs.join(', ')}`);
    }
  });

// ─── nyai decisions ─────────────────────────────────────────────

program
  .command('decisions')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Show autonomous decisions log')
  .action((opts: { dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');
    const decisions = readDecisions(harnessDir);

    if (decisions.length === 0) {
      console.log('No decisions logged yet.');
      return;
    }

    console.log('Decisions Log');
    for (const d of decisions) {
      const status = d.resolved ? 'resolved' : 'pending';
      const ts = new Date(d.timestamp).toLocaleString();
      console.log(`\n[${status}] [${ts}] ${d.summary}`);
      console.log(`   Agent: ${d.agentRole} | Type: ${d.type}${d.autoDecision ? ' | auto' : ''}`);
      if (d.resolved) {
        console.log(`   Resolution: ${d.resolution}`);
      }
    }
  });

// ─── nyai report ────────────────────────────────────────────────

program
  .command('report')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Show latest evaluation report')
  .action((opts: { dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');
    const state = loadState(harnessDir);

    if (!state) {
      console.log('No active state found.');
      return;
    }

    const report = getLatestReport(harnessDir, state.sprintId);
    if (!report) {
      console.log('No evaluation reports found.');
      return;
    }

    console.log(`Evaluation Report — Round ${report.round}`);
    console.log(`   Verdict: ${report.verdict}`);
    if (report.score !== undefined) console.log(`   Score: ${report.score}`);
    console.log(`\n   Summary: ${report.summary}`);

    if (report.passedAcs.length > 0) {
      console.log(`\n   Passed: ${report.passedAcs.join(', ')}`);
    }
    if (report.failedAcs.length > 0) {
      console.log(`\n   Failed:`);
      for (const ac of report.failedAcs) {
        console.log(`      ${ac.id}: ${ac.reason}`);
      }
    }
    if (report.regressions && report.regressions.length > 0) {
      console.log(`\n   Regressions:`);
      for (const r of report.regressions) {
        console.log(`      ${r.acId}: was PASS, now FAIL (round ${r.round})`);
      }
    }
    if (report.suggestions.length > 0) {
      console.log(`\n   Suggestions:`);
      for (const s of report.suggestions) {
        console.log(`      - ${s}`);
      }
    }
  });

// ─── nyai features ──────────────────────────────────────────────

program
  .command('features')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .description('Show feature decomposition status')
  .action((opts: { dir: string }) => {
    const rootDir = resolve(opts.dir);
    const harnessDir = join(rootDir, '.harness');
    const featureList = readFeatureList(harnessDir);

    if (!featureList) {
      console.log('No features.json found. Run with --decompose to generate features.');
      return;
    }

    console.log(`Features for: ${featureList.parentPrompt}`);
    console.log(`Total: ${featureList.features.length} features\n`);

    for (const f of featureList.features) {
      const statusIcon =
        f.status === 'done' ? '[done]'
          : f.status === 'in_progress' ? '[in_progress]'
            : f.status === 'skipped' ? '[skipped]'
              : '[pending]';

      console.log(`${statusIcon} ${f.id}: ${f.title}`);
      console.log(`   ${f.description}`);
      if (f.sprintId) console.log(`   Sprint: ${f.sprintId}`);
      if (f.acceptanceCriteria.length > 0) {
        for (const ac of f.acceptanceCriteria) {
          console.log(`   - ${ac}`);
        }
      }
      console.log('');
    }
  });

// ─── Config Loading ──────────────────────────────────────────────

function loadConfig(rootDir: string): NYAIConfig {
  const configPath = join(rootDir, '.harness', 'config.yaml');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(raw) as NYAIConfig;
    parsed.project.rootDir = rootDir;
    return parsed;
  } catch {
    // Return default config if no config file exists
    return defaultConfig('project', rootDir);
  }
}

// ─── Main ────────────────────────────────────────────────────────

program.parse(process.argv);
