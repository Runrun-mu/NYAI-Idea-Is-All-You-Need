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

const program = new Command();

program
  .name('nyai')
  .description('NYAI — Autonomous AI Agent Orchestrator')
  .version('0.2.0');

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
      'state.json\ndecisions.log\nprogress.log\n',
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
  .argument('<prompt>', 'The requirement/prompt to implement')
  .option('--headless', 'Run without TUI (for CI/scripts)')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .option('--budget <usd>', 'Max cost in USD', parseFloat)
  .option('--max-rounds <n>', 'Max generate/evaluate rounds', parseInt)
  .option('--skip-architect', 'Skip the Architect agent phase')
  .option('--backend <type>', 'Backend to use: claude, codex, opencode')
  .option('--no-test-first', 'Disable test-first mode')
  .option('--decompose', 'Enable task decomposition into features')
  .option('--git-auto-commit', 'Auto-commit after each eval round')
  .description('Run NYAI to implement a requirement')
  .action(async (prompt: string, opts: {
    headless?: boolean;
    dir: string;
    budget?: number;
    maxRounds?: number;
    skipArchitect?: boolean;
    backend?: string;
    testFirst?: boolean;
    decompose?: boolean;
    gitAutoCommit?: boolean;
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

    config.project.rootDir = rootDir;

    const orchestrator = new Orchestrator(config);

    if (opts.headless) {
      // Headless mode
      runHeadless(orchestrator);

      // Auto-approve decisions in headless mode
      config.autonomy.autoApproveDecisions = true;

      await orchestrator.run(prompt);
      process.exit(0);
    } else {
      // TUI mode
      const { waitUntilExit } = render(
        React.createElement(App, { orchestrator, config, prompt })
      );

      // Start orchestrator in background
      orchestrator.run(prompt).catch((err) => {
        console.error('Orchestrator error:', err);
      });

      await waitUntilExit();
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
