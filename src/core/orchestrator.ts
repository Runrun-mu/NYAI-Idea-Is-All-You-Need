import { EventEmitter } from 'events';
import type { NYAIConfig } from '../types/config';
import type { State, OrchestratorState, PendingDecision } from '../types/state';
import type { AgentRole, AgentResult } from '../types/agent';
import type { EvalVerdict, EvalReport, TimeoutContext } from '../types/protocol';
import type { OrchestratorEvent } from '../types/events';
import type { KnowledgeEntry } from '../types/memory';
import { canTransition, transition, nextStateAfterEval } from './state-machine';
import { CostTracker } from './cost-tracker';
import { runAgent } from '../agents/agent-runner';
import { buildPlannerInvocation, buildReplanInvocation, type TimeoutHistory } from '../agents/planner';
import { buildGeneratorInvocation } from '../agents/generator';
import { buildEvaluatorInvocation } from '../agents/evaluator';
import { buildArchitectInvocation } from '../agents/architect';
import { isTimeoutResult, snapshotGitHead, buildTimeoutContext } from '../agents/timeout-handler';
import { splitWork, runParallelGenerators, mergeParallelResults } from '../agents/parallel-generator';
import {
  ensureHarnessDir,
  parseEvalVerdict,
  isStuck,
  getLatestReport,
  readSpec,
  readTestPlan,
} from '../protocol/file-protocol';
import { saveState, loadState } from '../protocol/state-store';
import { appendDecision, readPendingDecisions } from '../protocol/decision-logger';
import { hasArchitectureRecord, readArchitectureRecord } from '../protocol/architecture';
import { appendProgress } from '../protocol/progress-logger';
import { gitAutoCommit } from '../protocol/git-integration';
import { readFeatureList, updateFeatureStatus, getNextPendingFeature } from '../protocol/feature-tracker';
import {
  buildMemoryContext,
  formatMemoryForPrompt,
  appendRetrospective,
  addKnowledge,
} from '../protocol/memory-store';
import { buildRetrospective } from '../protocol/retrospective';
import { markItemDone } from '../protocol/backlog-store';

export class Orchestrator extends EventEmitter {
  private config: NYAIConfig;
  private state: OrchestratorState;
  private costTracker: CostTracker;
  private harnessDir: string;
  private abortController: AbortController;
  private pendingDecisionResolve: ((resolution: string) => void) | null = null;
  private memoryContextStr: string | null = null;
  private backlogItemId: string | null = null;

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
      timeoutRetryCount: 0,
      totalGeneratorTimeMs: 0,
    };
  }

  getState(): OrchestratorState {
    return { ...this.state };
  }

  getHarnessDir(): string {
    return this.harnessDir;
  }

  // ─── Timeout helpers ──────────────────────────────────────────────

  private getGeneratorTimeoutMs(): number {
    return this.config.budget.generatorTimeoutMs ?? 1_200_000; // 20 min
  }

  private getEvaluatorTimeoutMs(): number {
    return this.config.budget.evaluatorTimeoutMs ?? 900_000; // 15 min
  }

  private getPlannerTimeoutMs(): number {
    return this.config.budget.plannerTimeoutMs ?? 900_000; // 15 min
  }

  private getTimeoutForRole(role: AgentRole): number {
    switch (role) {
      case 'generator': return this.getGeneratorTimeoutMs();
      case 'evaluator': return this.getEvaluatorTimeoutMs();
      case 'planner': return this.getPlannerTimeoutMs();
      case 'architect': return this.getPlannerTimeoutMs(); // same as planner
    }
  }

  private isOverTimeBudget(): boolean {
    const elapsed = Date.now() - this.state.startedAt;
    const maxMs = this.config.budget.maxDurationMinutes * 60 * 1000;
    return elapsed >= maxMs;
  }

  // ─── Memory helpers ─────────────────────────────────────────────

  private loadMemoryContext(): void {
    const memoryEnabled = this.config.memory?.enabled !== false; // default true
    if (!memoryEnabled) {
      this.memoryContextStr = null;
      return;
    }

    try {
      const ctx = buildMemoryContext(this.harnessDir);
      this.memoryContextStr = ctx ? formatMemoryForPrompt(ctx) : null;
    } catch {
      this.memoryContextStr = null;
    }
  }

  private async generateRetrospective(): Promise<void> {
    try {
      const finalCostUsd = this.costTracker.getSpent();
      const finalDurationMs = Date.now() - this.state.startedAt;

      const retro = buildRetrospective(
        this.harnessDir,
        this.state,
        finalCostUsd,
        finalDurationMs
      );

      appendRetrospective(
        this.harnessDir,
        this.config.project.name,
        retro
      );

      // Extract knowledge from retrospective
      const knowledge = this.extractKnowledge(retro);
      if (knowledge.length > 0) {
        addKnowledge(this.harnessDir, this.config.project.name, knowledge);
      }

      this.emitEvent({
        type: 'retrospective:done',
        sprintId: this.state.sprintId,
        timestamp: Date.now(),
      });
    } catch {
      // Non-fatal — retrospective is best-effort
    }
  }

  private extractKnowledge(retro: import('../types/memory').SprintRetrospective): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const now = Date.now();

    // Patterns → knowledge entries
    for (const pattern of retro.patterns) {
      entries.push({
        id: `k-${now}-${entries.length}`,
        category: 'pattern',
        content: pattern,
        source: retro.sprintId,
        confidence: 0.5,
        createdAt: now,
        lastReferencedAt: now,
      });
    }

    // Decisions → knowledge entries
    for (const decision of retro.decisions) {
      entries.push({
        id: `k-${now}-${entries.length}`,
        category: 'decision',
        content: decision,
        source: retro.sprintId,
        confidence: 0.7,
        createdAt: now,
        lastReferencedAt: now,
      });
    }

    // Challenges that were resolved → gotcha entries
    for (const challenge of retro.challenges) {
      if (challenge.resolvedInRound !== undefined) {
        entries.push({
          id: `k-${now}-${entries.length}`,
          category: 'gotcha',
          content: `${challenge.description} → ${challenge.resolution}`,
          source: retro.sprintId,
          confidence: 0.6,
          createdAt: now,
          lastReferencedAt: now,
        });
      }
    }

    return entries;
  }

  // ─── Main Run Loop ─────────────────────────────────────────────

  async run(prompt: string, backlogItemId?: string): Promise<void> {
    const sprintId = `sprint-${Date.now()}`;
    this.state.sprintId = sprintId;
    this.state.prompt = prompt;
    this.state.startedAt = Date.now();
    this.state.round = 0;
    this.backlogItemId = backlogItemId ?? null;

    // Load memory context
    this.loadMemoryContext();

    // Emit backlog picked event
    if (backlogItemId) {
      this.emitEvent({
        type: 'backlog:picked',
        itemId: backlogItemId,
        title: prompt,
        timestamp: Date.now(),
      });
    }

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

          // Generate retrospective before emitting done
          await this.generateRetrospective();

          // Mark backlog item done
          this.markBacklogDone();

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
      await this.runGenerateEvaluateLoop(sprintId);

      // Generate retrospective before emitting done
      if (this.state.state === 'DONE') {
        await this.generateRetrospective();

        // Mark backlog item done
        this.markBacklogDone();

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

  // ─── Resume Sprint ──────────────────────────────────────────────

  async resume(): Promise<void> {
    const savedState = loadState(this.harnessDir);
    if (!savedState) {
      this.emitEvent({
        type: 'error',
        message: 'No saved state found to resume',
        timestamp: Date.now(),
      });
      return;
    }

    // Check if state is resumable
    const nonResumableStates: State[] = ['DONE', 'ERROR', 'IDLE'];
    if (nonResumableStates.includes(savedState.state)) {
      this.emitEvent({
        type: 'error',
        message: `Cannot resume from state: ${savedState.state}`,
        timestamp: Date.now(),
      });
      return;
    }

    // Restore state
    this.state = savedState;
    this.costTracker = new CostTracker(this.config.budget.maxCostUsd);
    // Re-add already spent cost
    if (savedState.costSpent > 0) {
      this.costTracker.add(savedState.costSpent);
    }

    // Load memory context
    this.loadMemoryContext();

    const fromState = savedState.state;
    const fromRound = savedState.round;
    const sprintId = savedState.sprintId;

    this.emitEvent({
      type: 'sprint:resumed',
      sprintId,
      fromState,
      fromRound,
      timestamp: Date.now(),
    });

    try {
      // Determine where to resume from
      switch (fromState) {
        case 'PLANNING':
        case 'ARCHITECTING':
          // Re-run planner
          await this.transitionTo('PLANNING', 'Resumed: re-running planner');
          await this.runPlannerAgent(this.state.prompt, sprintId);
          await this.transitionTo('CONTRACTING', 'Creating sprint contract');
          await this.transitionTo('GENERATING', 'Starting generation phase');
          await this.runGenerateEvaluateLoop(sprintId);
          break;

        case 'CONTRACTING':
        case 'GENERATING':
        case 'EVALUATING':
        case 'REPLANNING':
        case 'BLOCKED':
          // Resume into generate ↔ evaluate loop
          if (this.state.state !== 'GENERATING') {
            await this.transitionTo('GENERATING', `Resumed from ${fromState}`);
          }
          await this.runGenerateEvaluateLoop(sprintId);
          break;
      }

      // Generate retrospective
      if (this.state.state === 'DONE') {
        await this.generateRetrospective();
        this.markBacklogDone();

        this.emitEvent({
          type: 'done',
          summary: `Sprint ${sprintId} resumed and completed. Verdict: ${this.state.lastEvalVerdict ?? 'N/A'}`,
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

  // ─── Generate ↔ Evaluate Loop ──────────────────────────────────

  private async runGenerateEvaluateLoop(sprintId: string): Promise<void> {
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

      // Time budget guard
      if (this.isOverTimeBudget()) {
        this.emitEvent({
          type: 'error',
          message: `Time budget exceeded: ${this.config.budget.maxDurationMinutes} minutes`,
          timestamp: Date.now(),
        });
        await this.transitionTo('DONE', 'Time budget exceeded');
        done = true;
        break;
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

      // Generate (with timeout retry)
      if (this.state.state !== 'GENERATING') {
        await this.transitionTo('GENERATING', `Round ${this.state.round}`);
      }
      const prevReport = getLatestReport(this.harnessDir, sprintId);
      const prevFeedback = prevReport
        ? JSON.stringify(prevReport.failedAcs, null, 2)
        : undefined;

      // Detect regressions from previous report
      const lastRegressions = prevReport?.regressions ?? [];

      const genResult = await this.runGeneratorAgentWithRetry(
        sprintId,
        this.state.round,
        prevFeedback,
        this.state.previouslyPassedAcs,
        lastRegressions
      );

      // Check if we ended up in REPLANNING state (simplify path)
      if (this.state.state === 'REPLANNING') {
        // After replanning, transition back to GENERATING for next round
        await this.transitionTo('GENERATING', 'Retrying after replan');
        continue;
      }

      // If the result was abort, the generator effectively failed
      // Continue to evaluation anyway to assess what was completed

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
  }

  // ─── Backlog helpers ────────────────────────────────────────────

  private markBacklogDone(): void {
    if (this.backlogItemId) {
      try {
        markItemDone(this.harnessDir, this.backlogItemId);
        this.emitEvent({
          type: 'backlog:done',
          itemId: this.backlogItemId,
          timestamp: Date.now(),
        });
      } catch {
        // Non-fatal
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
    const invocation = buildPlannerInvocation(this.config, prompt, sprintId, this.memoryContextStr ?? undefined);
    await this.runAgentWithEvents(invocation);
  }

  private async runGeneratorAgent(
    sprintId: string,
    round: number,
    previousFeedback?: string,
    previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[]
  ): Promise<AgentResult> {
    const parallelCount = this.config.parallelGenerators ?? 1;

    // Read test plan for generator consumption (v0.5)
    const testPlan = readTestPlan(this.harnessDir, sprintId);

    // Parallel generator path
    if (parallelCount > 1) {
      return this.runParallelGeneratorPath(
        sprintId, round, parallelCount, previousFeedback, previouslyPassedAcs, regressions
      );
    }

    // Single generator path
    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
    const invocation = buildGeneratorInvocation(
      this.config,
      sprintId,
      round,
      previousFeedback,
      previouslyPassedAcs,
      regressions,
      memCtx,
      testPlan ?? undefined
    );
    return this.runAgentWithEvents(invocation);
  }

  /**
   * Run generator(s) with Evaluator-driven timeout retry.
   * No fixed retry limit — Evaluator decides each time.
   */
  private async runGeneratorAgentWithRetry(
    sprintId: string,
    round: number,
    previousFeedback?: string,
    previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[]
  ): Promise<AgentResult> {
    let currentTimeoutMs = this.getGeneratorTimeoutMs();
    let retryCount = 0;
    let totalTimeSpent = this.state.totalGeneratorTimeMs;

    while (true) {
      // Safety valve: total time budget
      if (this.isOverTimeBudget()) {
        break;
      }

      // Safety valve: cost budget
      if (this.costTracker.isOverBudget()) {
        break;
      }

      // Snapshot git HEAD before generator run
      const beforeRef = snapshotGitHead(this.config.project.rootDir);

      // Run generator with current timeout
      const result = await this.runGeneratorAgentSingle(
        sprintId, round, currentTimeoutMs, previousFeedback, previouslyPassedAcs, regressions
      );

      // Track time
      this.state.totalGeneratorTimeMs += result.durationMs;
      totalTimeSpent += result.durationMs;

      // If no timeout, return normally
      if (!isTimeoutResult(result)) {
        return result;
      }

      // ─── Timeout occurred ─────────────────────────────────────
      retryCount++;
      this.state.timeoutRetryCount++;

      // Build timeout context
      const timeoutCtx = buildTimeoutContext(
        result, round, this.config.project.rootDir, beforeRef, retryCount, totalTimeSpent
      );

      // Emit timeout event
      this.emitEvent({
        type: 'agent:timeout',
        role: 'generator',
        round,
        retryCount,
        durationMs: result.durationMs,
        filesModified: timeoutCtx.filesModified,
        timestamp: Date.now(),
      });

      // Ask Evaluator to assess the timeout
      await this.transitionTo('EVALUATING', `Timeout evaluation (retry ${retryCount})`);
      const evalResult = await this.runTimeoutEvaluation(sprintId, round, previouslyPassedAcs, timeoutCtx);

      // Parse the evaluator's recommendation
      const recommendation = evalResult.timeoutRecommendation ?? 'abort';

      if (recommendation === 'continue') {
        // Evaluator says continue — use suggested time or bump timeout
        const suggestedTime = evalResult.estimatedAdditionalTimeMs;
        currentTimeoutMs = suggestedTime && suggestedTime > 0
          ? suggestedTime
          : Math.round(currentTimeoutMs * 1.5); // 50% more time if no estimate

        // Transition back to GENERATING
        await this.transitionTo('GENERATING', `Retrying after timeout (eval: continue, timeout: ${Math.round(currentTimeoutMs / 1000)}s)`);
        continue;

      } else if (recommendation === 'simplify') {
        // Transition to REPLANNING
        await this.transitionTo('REPLANNING', 'Evaluator recommended simplification');
        await this.runReplanAgent(sprintId, this.state.prompt, {
          retryCount,
          totalTimeSpentMs: totalTimeSpent,
          timeoutReason: evalResult.timeoutReason,
          filesModified: timeoutCtx.filesModified,
        });

        this.emitEvent({
          type: 'planner:replan',
          reason: evalResult.timeoutReason ?? 'Timeout — task too complex',
          originalFeature: this.state.prompt,
          timestamp: Date.now(),
        });

        // After replanning, the main loop will pick up from GENERATING
        return result;

      } else {
        // abort — treat as failure, let normal eval flow handle it
        return result;
      }
    }

    // If we broke out due to safety valves, return a synthetic failure
    return {
      role: 'generator',
      success: false,
      output: '',
      costUsd: 0,
      durationMs: 0,
      numTurns: 0,
      sessionId: '',
      error: 'Generator stopped: time or cost budget exceeded',
      timedOut: true,
    };
  }

  /**
   * Run a single generator invocation with specific timeout.
   */
  private async runGeneratorAgentSingle(
    sprintId: string,
    round: number,
    timeoutMs: number,
    previousFeedback?: string,
    previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[]
  ): Promise<AgentResult> {
    const parallelCount = this.config.parallelGenerators ?? 1;

    if (parallelCount > 1) {
      return this.runParallelGeneratorPath(
        sprintId, round, parallelCount, previousFeedback, previouslyPassedAcs, regressions, timeoutMs
      );
    }

    // Read test plan for generator consumption (v0.5)
    const testPlan = readTestPlan(this.harnessDir, sprintId);

    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
    const invocation = buildGeneratorInvocation(
      this.config,
      sprintId,
      round,
      previousFeedback,
      previouslyPassedAcs,
      regressions,
      memCtx,
      testPlan ?? undefined
    );
    return this.runAgentWithEvents(invocation, timeoutMs);
  }

  /**
   * Run parallel generators with AC-based work splitting.
   */
  private async runParallelGeneratorPath(
    sprintId: string,
    round: number,
    parallelCount: number,
    previousFeedback?: string,
    previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[],
    timeoutMs?: number
  ): Promise<AgentResult> {
    // Try to read spec to extract ACs
    const spec = readSpec(this.harnessDir, sprintId);
    let acIds: string[] = [];
    if (spec) {
      // Extract AC IDs from spec (look for AC-N patterns)
      const acMatches = spec.matchAll(/\b(AC-\d+)\b/g);
      acIds = [...new Set([...acMatches].map(m => m[1]))];
    }

    // If we can't split meaningfully, fall back to single generator
    if (acIds.length < parallelCount) {
      const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
      const invocation = buildGeneratorInvocation(
        this.config, sprintId, round, previousFeedback, previouslyPassedAcs, regressions, memCtx
      );
      return this.runAgentWithEvents(invocation, timeoutMs);
    }

    // Split work
    const assignments = splitWork(acIds, parallelCount);

    this.emitEvent({
      type: 'parallel:batch',
      generatorCount: assignments.length,
      assignments,
      timestamp: Date.now(),
    });

    // Run parallel generators
    const results = await runParallelGenerators({
      config: this.config,
      sprintId,
      round,
      assignments,
      allAcIds: acIds,
      previousFeedback,
      previouslyPassedAcs,
      regressions,
      timeoutMs: timeoutMs ?? this.getGeneratorTimeoutMs(),
      onStderrLine: (role, line) => {
        this.emitEvent({
          type: 'agent:log',
          role: 'generator',
          line: `[parallel] ${line}`,
          timestamp: Date.now(),
        });
      },
      abortSignal: this.abortController.signal,
    });

    // Merge results
    const merged = mergeParallelResults(results);

    // Track costs
    this.costTracker.add(merged.costUsd);
    this.state.costSpent = this.costTracker.getSpent();

    this.emitEvent({
      type: 'agent:done',
      role: 'generator',
      result: merged,
      timestamp: Date.now(),
    });

    this.emitEvent({
      type: 'cost:update',
      spent: this.costTracker.getSpent(),
      budget: this.costTracker.getBudget(),
      timestamp: Date.now(),
    });

    return merged;
  }

  /**
   * Run evaluator in timeout assessment mode.
   */
  private async runTimeoutEvaluation(
    sprintId: string,
    round: number,
    previouslyPassedAcs?: string[],
    timeoutContext?: TimeoutContext
  ): Promise<EvalReport> {
    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;

    // Read architecture record and test plan for evaluator (v0.5)
    const archRecord = readArchitectureRecord(this.harnessDir);
    const testPlan = readTestPlan(this.harnessDir, sprintId);

    const invocation = buildEvaluatorInvocation(
      this.config,
      sprintId,
      round,
      previouslyPassedAcs,
      timeoutContext,
      memCtx,
      archRecord,
      testPlan
    );
    const result = await this.runAgentWithEvents(invocation, this.getEvaluatorTimeoutMs());

    // Try to parse the evaluation report
    const evalResult = parseEvalVerdict(
      this.harnessDir,
      sprintId,
      round,
      result.output
    );

    if (evalResult) {
      return evalResult.report;
    }

    // If we can't parse, return a default abort recommendation
    return {
      sprintId,
      round,
      verdict: 'FAIL',
      timestamp: Date.now(),
      summary: 'Timeout evaluation could not parse report',
      passedAcs: [],
      failedAcs: [],
      suggestions: [],
      timeoutRecommendation: 'abort',
      timeoutReason: 'Could not parse evaluator output after timeout',
    };
  }

  private async runEvaluatorAgent(
    sprintId: string,
    round: number,
    previouslyPassedAcs?: string[]
  ): Promise<string> {
    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;

    // Read architecture record and test plan for evaluator (v0.5)
    const archRecord = readArchitectureRecord(this.harnessDir);
    const testPlan = readTestPlan(this.harnessDir, sprintId);

    const invocation = buildEvaluatorInvocation(
      this.config,
      sprintId,
      round,
      previouslyPassedAcs,
      undefined,
      memCtx,
      archRecord,
      testPlan
    );
    const result = await this.runAgentWithEvents(invocation, this.getEvaluatorTimeoutMs());
    return result.output;
  }

  /**
   * Run Planner in replan (simplification) mode.
   */
  private async runReplanAgent(
    sprintId: string,
    featureTitle: string,
    timeoutHistory: TimeoutHistory
  ): Promise<void> {
    const invocation = buildReplanInvocation(
      this.config,
      sprintId,
      featureTitle,
      timeoutHistory,
      this.memoryContextStr ?? undefined
    );
    await this.runAgentWithEvents(invocation, this.getPlannerTimeoutMs());
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
      if (this.isOverTimeBudget()) break;

      // Generate
      if (this.state.state !== 'GENERATING') {
        await this.transitionTo('GENERATING', `Feature round ${featureRound}`);
      }
      const prevReport = getLatestReport(this.harnessDir, featureSprintId);
      const prevFeedback = prevReport
        ? JSON.stringify(prevReport.failedAcs, null, 2)
        : undefined;

      await this.runGeneratorAgentWithRetry(featureSprintId, featureRound, prevFeedback);

      // If we ended up in REPLANNING, transition back
      if (this.state.state === 'REPLANNING') {
        await this.transitionTo('GENERATING', 'Retrying after replan');
        continue;
      }

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
    invocation: ReturnType<typeof buildPlannerInvocation>,
    timeoutMs?: number
  ): Promise<AgentResult> {
    const { role } = invocation;
    this.state.currentAgent = role;

    this.emitEvent({
      type: 'agent:start',
      role,
      round: this.state.round,
      timestamp: Date.now(),
    });

    const effectiveTimeout = timeoutMs ?? this.getTimeoutForRole(role);

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
      timeoutMs: effectiveTimeout,
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
