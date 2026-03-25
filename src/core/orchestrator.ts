import { EventEmitter } from 'events';
import type { NYAIConfig } from '../types/config';
import type { State, OrchestratorState, PendingDecision } from '../types/state';
import type { AgentRole } from '../types/agent';
import type { EvalVerdict, EvalReport } from '../types/protocol';
import type { OrchestratorEvent } from '../types/events';
import { canTransition, transition, nextStateAfterEval } from './state-machine';
import { CostTracker } from './cost-tracker';
import { runAgent } from '../agents/agent-runner';
import { buildPlannerInvocation } from '../agents/planner';
import { buildGeneratorInvocation } from '../agents/generator';
import { buildEvaluatorInvocation } from '../agents/evaluator';
import { buildArchitectInvocation } from '../agents/architect';
import {
  ensureHarnessDir,
  parseEvalVerdict,
  isStuck,
  getLatestReport,
} from '../protocol/file-protocol';
import { saveState, loadState } from '../protocol/state-store';
import { appendDecision, readPendingDecisions } from '../protocol/decision-logger';
import { hasArchitectureRecord, readArchitectureRecord } from '../protocol/architecture';
import { appendProgress } from '../protocol/progress-logger';
import { gitAutoCommit } from '../protocol/git-integration';
import { readFeatureList, updateFeatureStatus, getNextPendingFeature } from '../protocol/feature-tracker';

export class Orchestrator extends EventEmitter {
  private config: NYAIConfig;
  private state: OrchestratorState;
  private costTracker: CostTracker;
  private harnessDir: string;
  private abortController: AbortController;
  private pendingDecisionResolve: ((resolution: string) => void) | null = null;

  constructor(config: NYAIConfig) {
    super();
    this.config = config;
    this.harnessDir = ensureHarnessDir(config.project.rootDir);
    this.costTracker = new CostTracker(config.budget.maxCostUsd);
    this.abortController = new AbortController();

    this.state = {
      state: 'IDLE',
      sprintId: '',
      round: 0,
      prompt: '',
      startedAt: 0,
      history: [],
      costSpent: 0,
      costBudget: config.budget.maxCostUsd,
      currentAgent: null,
      lastEvalVerdict: null,
      stuckCount: 0,
      failedAcIds: [],
      previouslyPassedAcs: [],
    };
  }

  getState(): OrchestratorState {
    return { ...this.state };
  }

  getHarnessDir(): string {
    return this.harnessDir;
  }

  // ─── Main Run Loop ─────────────────────────────────────────────

  async run(prompt: string): Promise<void> {
    const sprintId = `sprint-${Date.now()}`;
    this.state.sprintId = sprintId;
    this.state.prompt = prompt;
    this.state.startedAt = Date.now();
    this.state.round = 0;

    try {
      // Phase 0: Architect (optional — for new projects or when configured)
      if (
        !this.config.skipArchitect &&
        this.config.agents.architect &&
        !hasArchitectureRecord(this.harnessDir)
      ) {
        await this.transitionTo('ARCHITECTING', 'Starting architect phase');
        await this.runArchitectAgent(prompt, sprintId);
      }

      // Phase 1: Planning
      await this.transitionTo('PLANNING', 'Starting planning phase');
      await this.runPlannerAgent(prompt, sprintId);

      // Check for auto-decisions from planner
      const pendingAutoDecisions = readPendingDecisions(this.harnessDir)
        .filter((d) => d.autoDecision && !d.resolved);
      for (const decision of pendingAutoDecisions) {
        this.emitEvent({
          type: 'decision:needed',
          decision,
          timestamp: Date.now(),
        });
        // Auto-approve after timeout or immediately in headless
        if (this.config.autonomy.autoApproveDecisions) {
          this.emitEvent({
            type: 'decision:resolved',
            decisionId: decision.id,
            resolution: decision.options[0] ?? 'approved',
            timestamp: Date.now(),
          });
        }
      }

      // Check if task decomposition produced features
      if (this.config.taskDecomposition) {
        const featureList = readFeatureList(this.harnessDir);
        if (featureList && featureList.features.length > 1) {
          // Run each feature as a mini-sprint
          this.state.totalFeatures = featureList.features.length;
          for (let i = 0; i < featureList.features.length; i++) {
            if (this.abortController.signal.aborted) break;
            if (this.costTracker.isOverBudget()) break;

            const feature = featureList.features[i];
            if (feature.status === 'done' || feature.status === 'skipped') continue;

            this.state.currentFeatureIndex = i;
            const featureSprintId = `${sprintId}-F${i + 1}`;

            this.emitEvent({
              type: 'feature:progress',
              featureIndex: i,
              totalFeatures: featureList.features.length,
              featureTitle: feature.title,
              status: 'started',
              timestamp: Date.now(),
            });

            updateFeatureStatus(this.harnessDir, feature.id, 'in_progress', featureSprintId);
            await this.runFeatureSprint(featureSprintId, feature.title);
            updateFeatureStatus(this.harnessDir, feature.id, 'done', featureSprintId);

            this.emitEvent({
              type: 'feature:progress',
              featureIndex: i,
              totalFeatures: featureList.features.length,
              featureTitle: feature.title,
              status: 'completed',
              timestamp: Date.now(),
            });
          }

          // All features done
          await this.transitionTo('DONE', 'All features completed');
          this.emitEvent({
            type: 'done',
            summary: `Sprint ${sprintId} completed with ${featureList.features.length} features.`,
            totalCost: this.costTracker.getSpent(),
            totalDuration: Date.now() - this.state.startedAt,
            rounds: this.state.round,
            timestamp: Date.now(),
          });
          return;
        }
      }

      // Phase 2: Contracting (combined with planning in our flow)
      await this.transitionTo('CONTRACTING', 'Creating sprint contract');
      // The planner already writes spec + contract, so this is a quick transition
      await this.transitionTo('GENERATING', 'Starting generation phase');

      // Phase 3: Generate ↔ Evaluate loop
      let done = false;
      while (!done && !this.abortController.signal.aborted) {
        this.state.round++;

        // Budget guard
        if (this.costTracker.isOverBudget()) {
          this.emitEvent({
            type: 'error',
            message: `Budget exceeded: ${this.costTracker.getSummary()}`,
            timestamp: Date.now(),
          });
          await this.transitionTo('ERROR', 'Budget exceeded');
          return;
        }

        // Round guard
        if (this.state.round > this.config.budget.maxRounds) {
          this.emitEvent({
            type: 'error',
            message: `Max rounds (${this.config.budget.maxRounds}) exceeded`,
            timestamp: Date.now(),
          });
          await this.transitionTo('DONE', 'Max rounds reached');
          done = true;
          break;
        }

        // Generate
        if (this.state.state !== 'GENERATING') {
          await this.transitionTo('GENERATING', `Round ${this.state.round}`);
        }
        const prevReport = getLatestReport(this.harnessDir, sprintId);
        const prevFeedback = prevReport
          ? JSON.stringify(prevReport.failedAcs, null, 2)
          : undefined;

        // Detect regressions from previous report
        const lastRegressions = prevReport?.regressions ?? [];

        await this.runGeneratorAgent(
          sprintId,
          this.state.round,
          prevFeedback,
          this.state.previouslyPassedAcs,
          lastRegressions
        );

        // Evaluate
        await this.transitionTo('EVALUATING', `Evaluating round ${this.state.round}`);
        const evalOutput = await this.runEvaluatorAgent(
          sprintId,
          this.state.round,
          this.state.previouslyPassedAcs
        );

        // Parse verdict
        const evalResult = parseEvalVerdict(
          this.harnessDir,
          sprintId,
          this.state.round,
          evalOutput
        );

        if (evalResult) {
          const { verdict, report } = evalResult;
          this.state.lastEvalVerdict = verdict;

          this.emitEvent({
            type: 'eval:verdict',
            verdict,
            report,
            timestamp: Date.now(),
          });

          // Update previouslyPassedAcs — accumulate all ACs that ever passed
          for (const ac of report.passedAcs) {
            if (!this.state.previouslyPassedAcs.includes(ac)) {
              this.state.previouslyPassedAcs.push(ac);
            }
          }

          // Regression detection: check if any previously-passed AC is now failing
          const currentPassedSet = new Set(report.passedAcs);
          const regressions = this.state.previouslyPassedAcs
            .filter((ac) => !currentPassedSet.has(ac))
            .filter((ac) => report.failedAcs.some((f) => f.id === ac))
            .map((ac) => ({
              acId: ac,
              description: report.failedAcs.find((f) => f.id === ac)?.description ?? '',
              previousStatus: 'PASS' as const,
              currentStatus: 'FAIL' as const,
              round: this.state.round,
            }));

          if (regressions.length > 0) {
            // Add regressions to the report
            report.regressions = regressions;
            this.emitEvent({
              type: 'eval:regression',
              regressions,
              round: this.state.round,
              timestamp: Date.now(),
            });
          }

          // Stuck detection
          const currentFailedIds = report.failedAcs.map((f) => f.id);
          const stuck = isStuck(currentFailedIds, this.state.failedAcIds);
          this.state.failedAcIds = currentFailedIds;

          // Git auto-commit after each eval round
          if (this.config.gitAutoCommit) {
            const tag = `nyai/${sprintId}-round-${this.state.round}`;
            const commitMsg = `nyai: ${sprintId} round ${this.state.round} — ${verdict}`;
            gitAutoCommit(this.config.project.rootDir, commitMsg, tag);
          }

          if (stuck) {
            this.state.stuckCount++;
          } else {
            this.state.stuckCount = 0;
          }

          // Determine next state
          const nextState = nextStateAfterEval(
            verdict,
            this.state.round,
            this.config.budget.maxRounds,
            this.state.stuckCount >= 2
          );

          if (nextState === 'DONE') {
            await this.transitionTo('DONE', `Verdict: ${verdict}`);
            done = true;
          } else if (nextState === 'BLOCKED') {
            await this.transitionTo('BLOCKED', 'Stuck on same failures');
            // Create a decision for the user
            const decision: PendingDecision = {
              id: `decision-${Date.now()}`,
              timestamp: Date.now(),
              agentRole: 'evaluator',
              type: 'scope',
              summary: 'Stuck: same acceptance criteria failing repeatedly',
              details: `Failed ACs: ${currentFailedIds.join(', ')}. Suggestions: ${report.suggestions.join('; ')}`,
              options: ['Retry with more context', 'Skip failed ACs and finish', 'Abort'],
            };
            appendDecision(this.harnessDir, decision);
            this.emitEvent({
              type: 'decision:needed',
              decision,
              timestamp: Date.now(),
            });

            // Wait for user decision
            const resolution = await this.waitForDecision(decision);
            if (resolution === 'Abort') {
              await this.transitionTo('DONE', 'User aborted');
              done = true;
            } else if (resolution === 'Skip failed ACs and finish') {
              await this.transitionTo('DONE', 'User skipped failed ACs');
              done = true;
            } else {
              // Retry
              await this.transitionTo('GENERATING', 'Retrying after user decision');
            }
          }
          // nextState === 'GENERATING' → loop continues
        } else {
          // No verdict found — treat as error
          this.emitEvent({
            type: 'error',
            message: 'Could not parse evaluation verdict',
            timestamp: Date.now(),
          });
          // Continue anyway — try another round
        }

        this.persistState();
      }

      // Emit done
      if (this.state.state === 'DONE') {
        this.emitEvent({
          type: 'done',
          summary: `Sprint ${sprintId} completed. Verdict: ${this.state.lastEvalVerdict ?? 'N/A'}`,
          totalCost: this.costTracker.getSpent(),
          totalDuration: Date.now() - this.state.startedAt,
          rounds: this.state.round,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitEvent({
        type: 'error',
        message,
        timestamp: Date.now(),
      });
      if (canTransition(this.state.state, 'ERROR')) {
        await this.transitionTo('ERROR', message);
      }
    }
  }

  // ─── Agent Runners ─────────────────────────────────────────────

  private async runArchitectAgent(prompt: string, sprintId: string): Promise<void> {
    const invocation = buildArchitectInvocation(this.config, prompt, sprintId);
    const result = await this.runAgentWithEvents(invocation);

    // Try to parse and emit the architecture record
    const record = readArchitectureRecord(this.harnessDir);
    if (record) {
      this.emitEvent({
        type: 'architect:done',
        record,
        timestamp: Date.now(),
      });
    }
  }

  private async runPlannerAgent(prompt: string, sprintId: string): Promise<void> {
    const invocation = buildPlannerInvocation(this.config, prompt, sprintId);
    await this.runAgentWithEvents(invocation);
  }

  private async runGeneratorAgent(
    sprintId: string,
    round: number,
    previousFeedback?: string,
    previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[]
  ): Promise<void> {
    const invocation = buildGeneratorInvocation(
      this.config,
      sprintId,
      round,
      previousFeedback,
      previouslyPassedAcs,
      regressions
    );
    await this.runAgentWithEvents(invocation);
  }

  private async runEvaluatorAgent(
    sprintId: string,
    round: number,
    previouslyPassedAcs?: string[]
  ): Promise<string> {
    const invocation = buildEvaluatorInvocation(
      this.config,
      sprintId,
      round,
      previouslyPassedAcs
    );
    const result = await this.runAgentWithEvents(invocation);
    return result.output;
  }

  /**
   * Run a mini-sprint for a single feature (generate ↔ evaluate loop).
   * Extracted from the main run loop to support task decomposition.
   */
  private async runFeatureSprint(featureSprintId: string, featureTitle: string): Promise<void> {
    // Contracting
    await this.transitionTo('CONTRACTING', `Feature: ${featureTitle}`);
    await this.transitionTo('GENERATING', `Generating: ${featureTitle}`);

    let featureDone = false;
    let featureRound = 0;

    while (!featureDone && !this.abortController.signal.aborted) {
      featureRound++;
      this.state.round++;

      if (this.costTracker.isOverBudget()) break;
      if (featureRound > this.config.budget.maxRounds) break;

      // Generate
      if (this.state.state !== 'GENERATING') {
        await this.transitionTo('GENERATING', `Feature round ${featureRound}`);
      }
      const prevReport = getLatestReport(this.harnessDir, featureSprintId);
      const prevFeedback = prevReport
        ? JSON.stringify(prevReport.failedAcs, null, 2)
        : undefined;

      await this.runGeneratorAgent(featureSprintId, featureRound, prevFeedback);

      // Evaluate
      await this.transitionTo('EVALUATING', `Evaluating feature round ${featureRound}`);
      const evalOutput = await this.runEvaluatorAgent(featureSprintId, featureRound);

      const evalResult = parseEvalVerdict(
        this.harnessDir,
        featureSprintId,
        featureRound,
        evalOutput
      );

      if (evalResult) {
        const { verdict } = evalResult;
        if (verdict === 'PASS') {
          featureDone = true;
        } else if (featureRound >= this.config.budget.maxRounds) {
          featureDone = true; // give up
        }
      } else {
        featureDone = true; // no verdict, move on
      }

      this.persistState();
    }
  }

  private async runAgentWithEvents(
    invocation: ReturnType<typeof buildPlannerInvocation>
  ): Promise<import('../types/agent').AgentResult> {
    const { role } = invocation;
    this.state.currentAgent = role;

    this.emitEvent({
      type: 'agent:start',
      role,
      round: this.state.round,
      timestamp: Date.now(),
    });

    const result = await runAgent({
      invocation,
      onStderrLine: (line) => {
        this.emitEvent({
          type: 'agent:log',
          role,
          line,
          timestamp: Date.now(),
        });
      },
      abortSignal: this.abortController.signal,
    });

    this.costTracker.add(result.costUsd);
    this.state.costSpent = this.costTracker.getSpent();

    this.emitEvent({
      type: 'agent:done',
      role,
      result,
      timestamp: Date.now(),
    });

    this.emitEvent({
      type: 'cost:update',
      spent: this.costTracker.getSpent(),
      budget: this.costTracker.getBudget(),
      timestamp: Date.now(),
    });

    this.state.currentAgent = null;
    return result;
  }

  // ─── State Transitions ────────────────────────────────────────

  private async transitionTo(to: State, reason: string): Promise<void> {
    const from = this.state.state;
    if (!canTransition(from, to)) {
      // If we can't transition, log but don't crash
      this.emitEvent({
        type: 'error',
        message: `Cannot transition ${from} → ${to}: ${reason}`,
        timestamp: Date.now(),
      });
      return;
    }

    const entry = transition(from, to, reason);
    this.state.state = to;
    this.state.history.push(entry);

    this.emitEvent({
      type: 'state:change',
      from,
      to,
      timestamp: Date.now(),
    });

    this.persistState();
  }

  // ─── Decision Handling ─────────────────────────────────────────

  private waitForDecision(decision: PendingDecision): Promise<string> {
    if (this.config.autonomy.autoApproveDecisions) {
      return Promise.resolve(decision.options[0] ?? 'Retry with more context');
    }

    return new Promise<string>((resolve) => {
      this.pendingDecisionResolve = resolve;

      // Auto-approve timeout
      if (this.config.autonomy.autoApproveTimeoutMs > 0) {
        setTimeout(() => {
          if (this.pendingDecisionResolve === resolve) {
            this.resolveDecision(decision.options[0] ?? 'Retry with more context');
          }
        }, this.config.autonomy.autoApproveTimeoutMs);
      }
    });
  }

  resolveDecision(resolution: string): void {
    if (this.pendingDecisionResolve) {
      const resolve = this.pendingDecisionResolve;
      this.pendingDecisionResolve = null;

      this.emitEvent({
        type: 'decision:resolved',
        decisionId: 'current',
        resolution,
        timestamp: Date.now(),
      });

      resolve(resolution);
    }
  }

  // ─── Abort ─────────────────────────────────────────────────────

  abort(): void {
    this.abortController.abort();
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private emitEvent(event: OrchestratorEvent): void {
    // Log all events to progress file
    try {
      appendProgress(this.harnessDir, event.type, JSON.stringify(event));
    } catch {
      // Non-fatal
    }

    // Avoid Node's special 'error' event behavior (throws if no listener)
    if (event.type === 'error') {
      this.emit('nyai:error', event);
    } else {
      this.emit(event.type, event);
    }
    this.emit('*', event); // wildcard for catch-all listeners
  }

  private persistState(): void {
    try {
      saveState(this.harnessDir, this.state);
    } catch {
      // Non-fatal — state persistence is best-effort
    }
  }
}
