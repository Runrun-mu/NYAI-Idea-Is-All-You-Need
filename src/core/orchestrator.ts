import { EventEmitter } from 'events';
import type { NYAIConfig } from '../types/config';
import type { State, OrchestratorState, PendingDecision } from '../types/state';
import type { AgentRole, AgentResult } from '../types/agent';
import type { EvalVerdict, EvalReport, TimeoutContext, Issue, IssueSeverity, CheckpointReport } from '../types/protocol';
import type { OrchestratorEvent } from '../types/events';
import type { KnowledgeEntry } from '../types/memory';
import { canTransition, transition, nextStateAfterEval } from './state-machine';
import { CostTracker } from './cost-tracker';
import { runAgent } from '../agents/agent-runner';
import { buildPlannerInvocation, buildReplanInvocation, type TimeoutHistory } from '../agents/planner';
import { buildGeneratorInvocation } from '../agents/generator';
import { buildEvaluatorInvocation, buildReviewInvocation, buildGoalAcceptanceInvocation } from '../agents/evaluator';
import { buildArchitectInvocation } from '../agents/architect';
import { buildDeployerInvocation } from '../agents/deployer';
import { buildReporterInvocation } from '../agents/reporter';
import { readDeployment } from '../protocol/deployment-store';
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
import { readCriticalPath, writeCheckpoint, buildCheckpointReport } from '../protocol/checkpoint';

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
      // v0.6
      completedFeatures: [],
      goalAcceptanceAttempts: 0,
      issues: [],
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
      case 'architect': return this.getPlannerTimeoutMs();
    }
  }

  private isOverTimeBudget(): boolean {
    const elapsed = Date.now() - this.state.startedAt;
    const maxMs = this.config.budget.maxDurationMinutes * 60 * 1000;
    return elapsed >= maxMs;
  }

  // ─── Issue Severity System (v0.6) ─────────────────────────────────

  /**
   * Raise an issue with P0-P4 severity.
   * P0: immediate escalation to human, blocks flow
   * P1: retry once, then escalate
   * P2: retry twice, then escalate
   * P3/P4: log only, continue
   */
  raiseIssue(params: {
    severity: IssueSeverity;
    title: string;
    description: string;
    featureId?: string;
    source: Issue['source'];
    options?: string[];
  }): Issue {
    const issue: Issue = {
      id: `issue-${Date.now()}-${this.state.issues.length}`,
      severity: params.severity,
      title: params.title,
      description: params.description,
      featureId: params.featureId,
      source: params.source,
      needsDecision: params.severity === 'P0' || params.severity === 'P1',
      options: params.options,
      createdAt: Date.now(),
    };

    this.state.issues.push(issue);

    this.emitEvent({
      type: 'issue:raised',
      issue,
      timestamp: Date.now(),
    });

    return issue;
  }

  /**
   * Handle escalation based on severity.
   * Returns the user's decision for P0/P1, or auto-resolves for P2+.
   */
  private async handleIssueEscalation(issue: Issue): Promise<string> {
    if (issue.severity === 'P0') {
      // Immediate escalation — must get human decision
      const decision: PendingDecision = {
        id: `decision-${issue.id}`,
        timestamp: Date.now(),
        agentRole: issue.source as AgentRole,
        type: 'risk',
        severity: issue.severity,
        summary: `[P0 CRITICAL] ${issue.title}`,
        details: issue.description,
        options: issue.options ?? ['Fix and retry', 'Skip', 'Abort'],
      };
      appendDecision(this.harnessDir, decision);
      this.emitEvent({ type: 'decision:needed', decision, timestamp: Date.now() });
      return this.waitForDecision(decision);
    }

    if (issue.severity === 'P1') {
      // Escalate after retry fails
      const decision: PendingDecision = {
        id: `decision-${issue.id}`,
        timestamp: Date.now(),
        agentRole: issue.source as AgentRole,
        type: 'scope',
        severity: issue.severity,
        summary: `[P1 EMERGENCY] ${issue.title}`,
        details: issue.description,
        options: issue.options ?? ['Retry with more context', 'Skip and continue', 'Abort'],
      };
      appendDecision(this.harnessDir, decision);
      this.emitEvent({ type: 'decision:needed', decision, timestamp: Date.now() });
      return this.waitForDecision(decision);
    }

    // P2-P4: auto-resolve
    issue.resolvedAt = Date.now();
    issue.resolution = 'auto-resolved';
    return 'auto-resolved';
  }

  // ─── Memory helpers ─────────────────────────────────────────────

  private loadMemoryContext(): void {
    const memoryEnabled = this.config.memory?.enabled !== false;
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

  // ─── Deployer (v0.4) ───────────────────────────────────────────

  private async runDeployer(sprintId: string): Promise<void> {
    try {
      await this.transitionTo('DEPLOYING', 'Starting deployment');
      this.state.currentAgent = 'deployer';

      const invocation = buildDeployerInvocation(this.config, sprintId);
      const result = await runAgent({
        invocation,
        onStderrLine: (line: string) => {
          this.emitEvent({ type: 'agent:log', role: 'deployer', line, timestamp: Date.now() });
        },
        abortSignal: this.abortController.signal,
      });

      this.costTracker.add(result.costUsd);

      const deployment = readDeployment(this.harnessDir);
      if (deployment) {
        this.emitEvent({
          type: 'deployer:done',
          deployment,
          timestamp: Date.now(),
        });
        appendProgress(this.harnessDir, 'deployer', `Deployment: ${deployment.status} → ${deployment.url ?? 'no URL'}`);
      }

      this.state.currentAgent = null;
    } catch (err) {
      this.state.currentAgent = null;
      appendProgress(this.harnessDir, 'deployer', `Deployer error: ${(err as Error).message}`);
    }
  }

  // ─── Reporter (v0.4) ──────────────────────────────────────────

  private async runReporter(sprintId: string): Promise<void> {
    try {
      const invocation = buildReporterInvocation(this.config, sprintId);
      this.state.currentAgent = 'reporter';

      const result = await runAgent({
        invocation,
        onStderrLine: (line: string) => {
          this.emitEvent({ type: 'agent:log', role: 'reporter', line, timestamp: Date.now() });
        },
        abortSignal: this.abortController.signal,
      });

      this.costTracker.add(result.costUsd);

      // Find the generated report file
      const reportsDir = `${this.harnessDir}/reports`;
      try {
        const { readdirSync } = await import('fs');
        const htmlReports = readdirSync(reportsDir).filter((f: string) => f.startsWith('progress-') && f.endsWith('.html'));
        if (htmlReports.length > 0) {
          const latestReport = htmlReports.sort().pop()!;
          this.emitEvent({
            type: 'reporter:done',
            reportPath: `${reportsDir}/${latestReport}`,
            timestamp: Date.now(),
          });
        }
      } catch {
        // reports dir may not exist
      }

      this.state.currentAgent = null;
    } catch (err) {
      this.state.currentAgent = null;
      appendProgress(this.harnessDir, 'reporter', `Reporter error: ${(err as Error).message}`);
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
      // Non-fatal
    }
  }

  private extractKnowledge(retro: import('../types/memory').SprintRetrospective): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const now = Date.now();

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

    this.loadMemoryContext();

    if (backlogItemId) {
      this.emitEvent({
        type: 'backlog:picked',
        itemId: backlogItemId,
        title: prompt,
        timestamp: Date.now(),
      });
    }

    try {
      // Phase 0: Architect (optional)
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

      // Phase 1.5 (v0.6): Evaluator reviews critical path + spec
      const criticalPath = readCriticalPath(this.harnessDir, sprintId);
      if (criticalPath) {
        await this.transitionTo('REVIEWING', 'Evaluator reviewing critical path and acceptance criteria');
        await this.runReviewAgent(sprintId);
      }

      // Check for auto-decisions from planner
      const pendingAutoDecisions = readPendingDecisions(this.harnessDir)
        .filter((d) => d.autoDecision && !d.resolved);
      for (const decision of pendingAutoDecisions) {
        this.emitEvent({ type: 'decision:needed', decision, timestamp: Date.now() });
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
          await this.runMultiFeatureSprint(sprintId, featureList);
          return;
        }
      }

      // Phase 2: Contracting
      await this.transitionTo('CONTRACTING', 'Creating sprint contract');
      await this.transitionTo('GENERATING', 'Starting generation phase');

      // Phase 3: Generate ↔ Evaluate loop
      await this.runGenerateEvaluateLoop(sprintId);

      // Finalize
      if (this.state.state === 'DONE') {
        await this.generateRetrospective();
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
      this.emitEvent({ type: 'error', message, timestamp: Date.now() });
      if (canTransition(this.state.state, 'ERROR')) {
        await this.transitionTo('ERROR', message);
      }
    }
  }

  // ─── Multi-Feature Sprint with Goal-Driven Convergence (v0.6) ───

  private async runMultiFeatureSprint(
    sprintId: string,
    featureList: import('../types/protocol').FeatureList
  ): Promise<void> {
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

      // v0.6: pass previouslyPassedAcs to feature sprint for cross-feature regression
      await this.runFeatureSprint(featureSprintId, feature.title);

      updateFeatureStatus(this.harnessDir, feature.id, 'done', featureSprintId);
      this.state.completedFeatures.push(feature.id);

      this.emitEvent({
        type: 'feature:progress',
        featureIndex: i,
        totalFeatures: featureList.features.length,
        featureTitle: feature.title,
        status: 'completed',
        timestamp: Date.now(),
      });

      // v0.6: Checkpoint after each feature — run critical-path regression
      await this.runFeatureCheckpoint(sprintId, feature, featureList, i);
    }

    // v0.6: Goal Acceptance — verify overall product works
    const goalPassed = await this.runGoalAcceptance(sprintId, featureList);

    if (goalPassed) {
      // v0.4: Deploy if enabled
      if (this.config.deploy?.enabled) {
        await this.runDeployer(sprintId);
      }
      await this.transitionTo('DONE', 'Goal acceptance PASS — all features verified');
    } else {
      // Goal acceptance failed even after retries — finish with what we have
      await this.transitionTo('DONE', 'Goal acceptance did not fully pass, finishing with current state');
    }

    // v0.4: Generate progress report (async, non-blocking)
    await this.runReporter(sprintId);

    await this.generateRetrospective();
    this.markBacklogDone();

    this.emitEvent({
      type: 'done',
      summary: `Sprint ${sprintId} completed with ${featureList.features.length} features. Goal: ${goalPassed ? 'PASS' : 'PARTIAL'}`,
      totalCost: this.costTracker.getSpent(),
      totalDuration: Date.now() - this.state.startedAt,
      rounds: this.state.round,
      timestamp: Date.now(),
    });
  }

  // ─── Feature Checkpoint (v0.6) ──────────────────────────────────

  private async runFeatureCheckpoint(
    sprintId: string,
    feature: import('../types/protocol').FeatureItem,
    featureList: import('../types/protocol').FeatureList,
    featureIndex: number
  ): Promise<void> {
    try {
      await this.transitionTo('CHECKPOINT', `Checkpoint after feature: ${feature.title}`);

      const criticalPath = readCriticalPath(this.harnessDir, sprintId);
      const completedTitles = this.state.completedFeatures;
      const remainingTitles = featureList.features
        .filter((f) => !completedTitles.includes(f.id))
        .map((f) => f.title);

      // Run critical path regression if available
      let cpStatus: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_RUN' = 'NOT_RUN';
      const cpResults: { stepId: string; status: 'PASS' | 'FAIL' | 'SKIP'; actualOutput?: string }[] = [];

      if (criticalPath && criticalPath.steps.length > 0) {
        // We ask the evaluator to run the critical path commands
        const cpEvalOutput = await this.runCriticalPathCheck(sprintId, criticalPath);
        // Parse results from evaluator output
        try {
          const jsonMatch = cpEvalOutput.match(/\{[\s\S]*"criticalPathStatus"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            cpStatus = parsed.criticalPathStatus ?? 'NOT_RUN';
            if (parsed.criticalPathResults) {
              cpResults.push(...parsed.criticalPathResults);
            }
          }
        } catch {
          // Couldn't parse — leave as NOT_RUN
        }
      }

      // Build checkpoint report
      const issues: Issue[] = [];
      if (cpStatus === 'FAIL') {
        const issue = this.raiseIssue({
          severity: 'P1',
          title: `Critical path regression after ${feature.title}`,
          description: `Critical path check failed after completing feature ${feature.title}. Some steps are broken.`,
          featureId: feature.id,
          source: 'orchestrator',
          options: ['Fix regression and continue', 'Skip and continue', 'Abort'],
        });
        issues.push(issue);
      }

      const checkpoint = buildCheckpointReport({
        type: 'feature',
        sprintId,
        featureId: feature.id,
        completedFeatures: completedTitles,
        remainingFeatures: remainingTitles,
        criticalPathStatus: cpStatus,
        criticalPathResults: cpResults,
        testSummary: { total: 0, passed: 0, failed: 0, skipped: 0 }, // filled by evaluator
        artifacts: [],
        issues,
        narrative: `Completed feature ${featureIndex + 1}/${featureList.features.length}: "${feature.title}". Critical path: ${cpStatus}.`,
      });

      writeCheckpoint(this.harnessDir, checkpoint);

      this.emitEvent({
        type: 'checkpoint:ready',
        checkpoint,
        timestamp: Date.now(),
      });

      // Handle P1 escalation if critical path failed
      if (cpStatus === 'FAIL' && issues.length > 0) {
        const resolution = await this.handleIssueEscalation(issues[0]);
        if (resolution === 'Abort') {
          this.abortController.abort();
          return;
        }
        // "Fix regression and continue" or "Skip and continue" — proceed to next feature
      }

      // Transition out of CHECKPOINT — go to next feature's GENERATING or GOAL_ACCEPTANCE
      // The caller handles the next transition
    } catch {
      // Checkpoint is best-effort — don't block the sprint
    }
  }

  /**
   * Run evaluator to check critical path steps.
   */
  private async runCriticalPathCheck(
    sprintId: string,
    criticalPath: import('../types/protocol').CriticalPath
  ): Promise<string> {
    const invocation = buildGoalAcceptanceInvocation(
      this.config,
      sprintId,
      this.state.prompt,
      criticalPath,
      this.state.completedFeatures,
      'checkpoint' // mode
    );
    const result = await this.runAgentWithEvents(invocation, this.getEvaluatorTimeoutMs());
    return result.output;
  }

  // ─── Goal Acceptance (v0.6) ─────────────────────────────────────

  /**
   * After all features pass, run goal acceptance to verify the overall product.
   * If it fails, do incremental replanning and retry (up to 3 times).
   */
  private async runGoalAcceptance(
    sprintId: string,
    featureList: import('../types/protocol').FeatureList
  ): Promise<boolean> {
    const maxGoalAttempts = 3;

    for (let attempt = 1; attempt <= maxGoalAttempts; attempt++) {
      if (this.abortController.signal.aborted) return false;
      if (this.costTracker.isOverBudget()) return false;

      this.state.goalAcceptanceAttempts = attempt;
      await this.transitionTo('GOAL_ACCEPTANCE', `Goal acceptance attempt ${attempt}`);

      const criticalPath = readCriticalPath(this.harnessDir, sprintId);
      if (!criticalPath) {
        // No critical path defined — assume pass
        this.emitEvent({
          type: 'goal:acceptance',
          verdict: 'PASS',
          criticalPathStatus: 'NOT_RUN',
          attempt,
          timestamp: Date.now(),
        });
        return true;
      }

      // Run goal acceptance evaluator
      const invocation = buildGoalAcceptanceInvocation(
        this.config,
        sprintId,
        this.state.prompt,
        criticalPath,
        this.state.completedFeatures,
        'goal' // mode
      );
      const result = await this.runAgentWithEvents(invocation, this.getEvaluatorTimeoutMs());

      // Detect human-intervention-required patterns (e.g. browser auth, interactive login)
      const humanInterventionPatterns = [
        /auth.*browser/i, /browser.*auth/i, /login.*required/i,
        /interactive.*required/i, /manual.*intervention/i,
        /open.*browser/i, /oauth.*callback/i, /localhost.*auth/i,
        /waiting.*authentication/i, /codex.*auth/i,
      ];
      const needsHuman = humanInterventionPatterns.some(p => p.test(result.output));
      if (needsHuman) {
        this.raiseIssue({
          severity: 'P0',
          title: 'Human intervention required: interactive authentication',
          description: 'Goal acceptance test requires browser-based authentication that cannot be automated in headless mode. A human must complete this step manually.',
          source: 'orchestrator',
          options: ['Mark as passed (human verified)', 'Skip this check', 'Abort'],
        });
        // Transition to BLOCKED instead of retrying
        await this.transitionTo('DONE', 'Blocked: requires human intervention for auth');
        return false;
      }

      // Parse goal acceptance result
      let goalPassed = false;
      let cpStatus: 'PASS' | 'FAIL' | 'PARTIAL' = 'FAIL';
      let missingItems: string[] = [];

      try {
        const jsonMatch = result.output.match(/\{[\s\S]*"goalVerdict"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          goalPassed = parsed.goalVerdict === 'PASS';
          cpStatus = parsed.criticalPathStatus ?? 'FAIL';
          missingItems = parsed.missingItems ?? [];
        }
      } catch {
        // Can't parse — treat as fail
      }

      this.emitEvent({
        type: 'goal:acceptance',
        verdict: goalPassed ? 'PASS' : 'FAIL',
        criticalPathStatus: cpStatus,
        missingItems,
        attempt,
        timestamp: Date.now(),
      });

      // Write goal checkpoint
      const goalCheckpoint = buildCheckpointReport({
        type: 'goal',
        sprintId,
        completedFeatures: this.state.completedFeatures,
        remainingFeatures: [],
        criticalPathStatus: cpStatus,
        testSummary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        artifacts: [],
        issues: [],
        narrative: `Goal acceptance attempt ${attempt}: ${goalPassed ? 'PASS' : 'FAIL'}. ${missingItems.length > 0 ? `Missing: ${missingItems.join(', ')}` : ''}`,
      });
      writeCheckpoint(this.harnessDir, goalCheckpoint);

      this.emitEvent({
        type: 'checkpoint:ready',
        checkpoint: goalCheckpoint,
        timestamp: Date.now(),
      });

      if (goalPassed) {
        return true;
      }

      // Goal failed — raise P1 issue
      const issue = this.raiseIssue({
        severity: 'P1',
        title: `Goal acceptance failed (attempt ${attempt}/${maxGoalAttempts})`,
        description: `Product does not meet the original goal. Missing: ${missingItems.join(', ')}. Critical path status: ${cpStatus}.`,
        source: 'orchestrator',
        options: ['Incremental fix and retry', 'Accept current state', 'Abort'],
      });

      const resolution = await this.handleIssueEscalation(issue);

      if (resolution === 'Abort') {
        return false;
      }
      if (resolution === 'Accept current state') {
        return false; // not a true pass, but user accepts
      }

      // Incremental fix: re-run planner for just the missing items, then generate+evaluate
      if (attempt < maxGoalAttempts && missingItems.length > 0) {
        const fixSprintId = `${sprintId}-goalfix-${attempt}`;
        await this.transitionTo('PLANNING', `Incremental fix for goal acceptance (attempt ${attempt})`);

        // Run planner with narrowed scope
        const fixPrompt = `Fix the following issues to meet the original goal:\n\nOriginal goal: ${this.state.prompt}\n\nMissing/broken items:\n${missingItems.map((m) => `- ${m}`).join('\n')}\n\nDo NOT re-implement already working features. Only fix what's broken.`;
        await this.runPlannerAgent(fixPrompt, fixSprintId);

        await this.transitionTo('CONTRACTING', 'Fix sprint contract');
        await this.transitionTo('GENERATING', 'Generating fix');
        await this.runGenerateEvaluateLoop(fixSprintId);
      }
    }

    return false;
  }

  // ─── Resume Sprint ──────────────────────────────────────────────

  async resume(): Promise<void> {
    const savedState = loadState(this.harnessDir);
    if (!savedState) {
      this.emitEvent({ type: 'error', message: 'No saved state found to resume', timestamp: Date.now() });
      return;
    }

    const nonResumableStates: State[] = ['DONE', 'ERROR', 'IDLE'];
    if (nonResumableStates.includes(savedState.state)) {
      this.emitEvent({ type: 'error', message: `Cannot resume from state: ${savedState.state}`, timestamp: Date.now() });
      return;
    }

    this.state = savedState;
    this.costTracker = new CostTracker(this.config.budget.maxCostUsd);
    if (savedState.costSpent > 0) {
      this.costTracker.add(savedState.costSpent);
    }

    this.loadMemoryContext();

    const fromState = savedState.state;
    const fromRound = savedState.round;
    const sprintId = savedState.sprintId;

    this.emitEvent({ type: 'sprint:resumed', sprintId, fromState, fromRound, timestamp: Date.now() });

    try {
      switch (fromState) {
        case 'PLANNING':
        case 'ARCHITECTING':
        case 'REVIEWING':
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
        case 'CHECKPOINT':
        case 'GOAL_ACCEPTANCE':
          if (this.state.state !== 'GENERATING') {
            await this.transitionTo('GENERATING', `Resumed from ${fromState}`);
          }
          await this.runGenerateEvaluateLoop(sprintId);
          break;
      }

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
      this.emitEvent({ type: 'error', message, timestamp: Date.now() });
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

      if (this.costTracker.isOverBudget()) {
        this.emitEvent({ type: 'error', message: `Budget exceeded: ${this.costTracker.getSummary()}`, timestamp: Date.now() });
        await this.transitionTo('ERROR', 'Budget exceeded');
        return;
      }

      if (this.isOverTimeBudget()) {
        this.emitEvent({ type: 'error', message: `Time budget exceeded: ${this.config.budget.maxDurationMinutes} minutes`, timestamp: Date.now() });
        await this.transitionTo('DONE', 'Time budget exceeded');
        done = true;
        break;
      }

      if (this.state.round > this.config.budget.maxRounds) {
        this.emitEvent({ type: 'error', message: `Max rounds (${this.config.budget.maxRounds}) exceeded`, timestamp: Date.now() });
        await this.transitionTo('DONE', 'Max rounds reached');
        done = true;
        break;
      }

      // Generate
      if (this.state.state !== 'GENERATING') {
        await this.transitionTo('GENERATING', `Round ${this.state.round}`);
      }
      const prevReport = getLatestReport(this.harnessDir, sprintId);
      const prevFeedback = prevReport ? JSON.stringify(prevReport.failedAcs, null, 2) : undefined;
      const lastRegressions = prevReport?.regressions ?? [];

      const genResult = await this.runGeneratorAgentWithRetry(
        sprintId, this.state.round, prevFeedback, this.state.previouslyPassedAcs, lastRegressions
      );

      if (this.state.state === 'REPLANNING') {
        await this.transitionTo('GENERATING', 'Retrying after replan');
        continue;
      }

      // Evaluate
      await this.transitionTo('EVALUATING', `Evaluating round ${this.state.round}`);
      const evalOutput = await this.runEvaluatorAgent(sprintId, this.state.round, this.state.previouslyPassedAcs);

      // Detect human-intervention-required patterns in evaluator output
      const evalHumanPatterns = [
        /auth.*browser/i, /browser.*auth/i, /login.*required/i,
        /interactive.*required/i, /manual.*intervention/i,
        /open.*browser/i, /oauth.*callback/i, /localhost.*auth/i,
        /waiting.*authentication/i, /codex.*auth/i,
      ];
      if (evalHumanPatterns.some(p => p.test(evalOutput))) {
        this.raiseIssue({
          severity: 'P0',
          title: 'Evaluator blocked: requires human interaction',
          description: 'Evaluation step requires interactive authentication (browser login). Cannot proceed in headless mode.',
          source: 'evaluator',
          options: ['Mark as passed (human verified)', 'Skip this check', 'Abort'],
        });
        await this.transitionTo('DONE', 'Blocked: evaluator requires human intervention');
        done = true;
        break;
      }

      const evalResult = parseEvalVerdict(this.harnessDir, sprintId, this.state.round, evalOutput);

      if (evalResult) {
        const { verdict, report } = evalResult;
        this.state.lastEvalVerdict = verdict;

        this.emitEvent({ type: 'eval:verdict', verdict, report, timestamp: Date.now() });

        // Update previouslyPassedAcs
        for (const ac of report.passedAcs) {
          if (!this.state.previouslyPassedAcs.includes(ac)) {
            this.state.previouslyPassedAcs.push(ac);
          }
        }

        // Regression detection
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
          report.regressions = regressions;
          this.emitEvent({ type: 'eval:regression', regressions, round: this.state.round, timestamp: Date.now() });
        }

        // Stuck detection
        const currentFailedIds = report.failedAcs.map((f) => f.id);
        const stuck = isStuck(currentFailedIds, this.state.failedAcIds);
        this.state.failedAcIds = currentFailedIds;

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

        const nextState = nextStateAfterEval(verdict, this.state.round, this.config.budget.maxRounds, this.state.stuckCount >= 2);

        if (nextState === 'DONE') {
          await this.transitionTo('DONE', `Verdict: ${verdict}`);
          done = true;
        } else if (nextState === 'BLOCKED') {
          await this.transitionTo('BLOCKED', 'Stuck on same failures');
          const decision: PendingDecision = {
            id: `decision-${Date.now()}`,
            timestamp: Date.now(),
            agentRole: 'evaluator',
            type: 'scope',
            severity: 'P2',
            summary: 'Stuck: same acceptance criteria failing repeatedly',
            details: `Failed ACs: ${currentFailedIds.join(', ')}. Suggestions: ${report.suggestions.join('; ')}`,
            options: ['Retry with more context', 'Skip failed ACs and finish', 'Abort'],
          };
          appendDecision(this.harnessDir, decision);
          this.emitEvent({ type: 'decision:needed', decision, timestamp: Date.now() });

          const resolution = await this.waitForDecision(decision);
          if (resolution === 'Abort') {
            await this.transitionTo('DONE', 'User aborted');
            done = true;
          } else if (resolution === 'Skip failed ACs and finish') {
            await this.transitionTo('DONE', 'User skipped failed ACs');
            done = true;
          } else {
            await this.transitionTo('GENERATING', 'Retrying after user decision');
          }
        }
      } else {
        this.emitEvent({ type: 'error', message: 'Could not parse evaluation verdict', timestamp: Date.now() });
      }

      this.persistState();
    }
  }

  // ─── Backlog helpers ────────────────────────────────────────────

  private markBacklogDone(): void {
    if (this.backlogItemId) {
      try {
        markItemDone(this.harnessDir, this.backlogItemId);
        this.emitEvent({ type: 'backlog:done', itemId: this.backlogItemId, timestamp: Date.now() });
      } catch {
        // Non-fatal
      }
    }
  }

  // ─── Agent Runners ─────────────────────────────────────────────

  private async runArchitectAgent(prompt: string, sprintId: string): Promise<void> {
    const invocation = buildArchitectInvocation(this.config, prompt, sprintId);
    const result = await this.runAgentWithEvents(invocation);

    const record = readArchitectureRecord(this.harnessDir);
    if (record) {
      this.emitEvent({ type: 'architect:done', record, timestamp: Date.now() });
    }
  }

  private async runPlannerAgent(prompt: string, sprintId: string): Promise<void> {
    const invocation = buildPlannerInvocation(this.config, prompt, sprintId, this.memoryContextStr ?? undefined);
    await this.runAgentWithEvents(invocation);
  }

  /**
   * v0.6: Run evaluator in review mode — reviews critical path and spec before generation.
   */
  private async runReviewAgent(sprintId: string): Promise<void> {
    const invocation = buildReviewInvocation(this.config, sprintId);
    await this.runAgentWithEvents(invocation, this.getEvaluatorTimeoutMs());
  }

  private async runGeneratorAgent(
    sprintId: string,
    round: number,
    previousFeedback?: string,
    previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[]
  ): Promise<AgentResult> {
    const parallelCount = this.config.parallelGenerators ?? 1;
    const testPlan = readTestPlan(this.harnessDir, sprintId);

    if (parallelCount > 1) {
      return this.runParallelGeneratorPath(
        sprintId, round, parallelCount, previousFeedback, previouslyPassedAcs, regressions
      );
    }

    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
    const invocation = buildGeneratorInvocation(
      this.config, sprintId, round, previousFeedback, previouslyPassedAcs, regressions, memCtx, testPlan ?? undefined
    );
    return this.runAgentWithEvents(invocation);
  }

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
      if (this.isOverTimeBudget()) break;
      if (this.costTracker.isOverBudget()) break;

      const beforeRef = snapshotGitHead(this.config.project.rootDir);

      const result = await this.runGeneratorAgentSingle(
        sprintId, round, currentTimeoutMs, previousFeedback, previouslyPassedAcs, regressions
      );

      this.state.totalGeneratorTimeMs += result.durationMs;
      totalTimeSpent += result.durationMs;

      if (!isTimeoutResult(result)) {
        return result;
      }

      retryCount++;
      this.state.timeoutRetryCount++;

      const timeoutCtx = buildTimeoutContext(result, round, this.config.project.rootDir, beforeRef, retryCount, totalTimeSpent);

      this.emitEvent({
        type: 'agent:timeout', role: 'generator', round, retryCount,
        durationMs: result.durationMs, filesModified: timeoutCtx.filesModified, timestamp: Date.now(),
      });

      await this.transitionTo('EVALUATING', `Timeout evaluation (retry ${retryCount})`);
      const evalResult = await this.runTimeoutEvaluation(sprintId, round, previouslyPassedAcs, timeoutCtx);

      const recommendation = evalResult.timeoutRecommendation ?? 'abort';

      if (recommendation === 'continue') {
        const suggestedTime = evalResult.estimatedAdditionalTimeMs;
        currentTimeoutMs = suggestedTime && suggestedTime > 0
          ? suggestedTime : Math.round(currentTimeoutMs * 1.5);

        await this.transitionTo('GENERATING', `Retrying after timeout (eval: continue, timeout: ${Math.round(currentTimeoutMs / 1000)}s)`);
        continue;
      } else if (recommendation === 'simplify') {
        await this.transitionTo('REPLANNING', 'Evaluator recommended simplification');
        await this.runReplanAgent(sprintId, this.state.prompt, {
          retryCount, totalTimeSpentMs: totalTimeSpent,
          timeoutReason: evalResult.timeoutReason, filesModified: timeoutCtx.filesModified,
        });
        this.emitEvent({
          type: 'planner:replan', reason: evalResult.timeoutReason ?? 'Timeout — task too complex',
          originalFeature: this.state.prompt, timestamp: Date.now(),
        });
        return result;
      } else {
        return result;
      }
    }

    return {
      role: 'generator', success: false, output: '', costUsd: 0, durationMs: 0,
      numTurns: 0, sessionId: '', error: 'Generator stopped: time or cost budget exceeded', timedOut: true,
    };
  }

  private async runGeneratorAgentSingle(
    sprintId: string, round: number, timeoutMs: number,
    previousFeedback?: string, previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[]
  ): Promise<AgentResult> {
    const parallelCount = this.config.parallelGenerators ?? 1;

    if (parallelCount > 1) {
      return this.runParallelGeneratorPath(
        sprintId, round, parallelCount, previousFeedback, previouslyPassedAcs, regressions, timeoutMs
      );
    }

    const testPlan = readTestPlan(this.harnessDir, sprintId);
    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
    const invocation = buildGeneratorInvocation(
      this.config, sprintId, round, previousFeedback, previouslyPassedAcs, regressions, memCtx, testPlan ?? undefined
    );
    return this.runAgentWithEvents(invocation, timeoutMs);
  }

  private async runParallelGeneratorPath(
    sprintId: string, round: number, parallelCount: number,
    previousFeedback?: string, previouslyPassedAcs?: string[],
    regressions?: import('../types/protocol').RegressionInfo[], timeoutMs?: number
  ): Promise<AgentResult> {
    const spec = readSpec(this.harnessDir, sprintId);
    let acIds: string[] = [];
    if (spec) {
      const acMatches = spec.matchAll(/\b(AC-\d+)\b/g);
      acIds = [...new Set([...acMatches].map(m => m[1]))];
    }

    if (acIds.length < parallelCount) {
      const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
      const invocation = buildGeneratorInvocation(
        this.config, sprintId, round, previousFeedback, previouslyPassedAcs, regressions, memCtx
      );
      return this.runAgentWithEvents(invocation, timeoutMs);
    }

    const assignments = splitWork(acIds, parallelCount);

    this.emitEvent({ type: 'parallel:batch', generatorCount: assignments.length, assignments, timestamp: Date.now() });

    const results = await runParallelGenerators({
      config: this.config, sprintId, round, assignments, allAcIds: acIds,
      previousFeedback, previouslyPassedAcs, regressions,
      timeoutMs: timeoutMs ?? this.getGeneratorTimeoutMs(),
      onStderrLine: (_role, line) => {
        this.emitEvent({ type: 'agent:log', role: 'generator', line: `[parallel] ${line}`, timestamp: Date.now() });
      },
      abortSignal: this.abortController.signal,
    });

    const merged = mergeParallelResults(results);
    this.costTracker.add(merged.costUsd);
    this.state.costSpent = this.costTracker.getSpent();

    this.emitEvent({ type: 'agent:done', role: 'generator', result: merged, timestamp: Date.now() });
    this.emitEvent({ type: 'cost:update', spent: this.costTracker.getSpent(), budget: this.costTracker.getBudget(), timestamp: Date.now() });

    return merged;
  }

  private async runTimeoutEvaluation(
    sprintId: string, round: number, previouslyPassedAcs?: string[], timeoutContext?: TimeoutContext
  ): Promise<EvalReport> {
    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
    const archRecord = readArchitectureRecord(this.harnessDir);
    const testPlan = readTestPlan(this.harnessDir, sprintId);

    const invocation = buildEvaluatorInvocation(
      this.config, sprintId, round, previouslyPassedAcs, timeoutContext, memCtx, archRecord, testPlan
    );
    const result = await this.runAgentWithEvents(invocation, this.getEvaluatorTimeoutMs());

    const evalResult = parseEvalVerdict(this.harnessDir, sprintId, round, result.output);

    if (evalResult) {
      return evalResult.report;
    }

    return {
      sprintId, round, verdict: 'FAIL', timestamp: Date.now(),
      summary: 'Timeout evaluation could not parse report', passedAcs: [], failedAcs: [],
      suggestions: [], timeoutRecommendation: 'abort',
      timeoutReason: 'Could not parse evaluator output after timeout',
    };
  }

  private async runEvaluatorAgent(sprintId: string, round: number, previouslyPassedAcs?: string[]): Promise<string> {
    const memCtx = round === 1 ? (this.memoryContextStr ?? undefined) : undefined;
    const archRecord = readArchitectureRecord(this.harnessDir);
    const testPlan = readTestPlan(this.harnessDir, sprintId);

    const invocation = buildEvaluatorInvocation(
      this.config, sprintId, round, previouslyPassedAcs, undefined, memCtx, archRecord, testPlan
    );
    const result = await this.runAgentWithEvents(invocation, this.getEvaluatorTimeoutMs());
    return result.output;
  }

  private async runReplanAgent(sprintId: string, featureTitle: string, timeoutHistory: TimeoutHistory): Promise<void> {
    const invocation = buildReplanInvocation(
      this.config, sprintId, featureTitle, timeoutHistory, this.memoryContextStr ?? undefined
    );
    await this.runAgentWithEvents(invocation, this.getPlannerTimeoutMs());
  }

  /**
   * Run a mini-sprint for a single feature.
   * v0.6: passes previouslyPassedAcs for cross-feature regression detection.
   */
  private async runFeatureSprint(featureSprintId: string, featureTitle: string): Promise<void> {
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

      if (this.state.state !== 'GENERATING') {
        await this.transitionTo('GENERATING', `Feature round ${featureRound}`);
      }
      const prevReport = getLatestReport(this.harnessDir, featureSprintId);
      const prevFeedback = prevReport ? JSON.stringify(prevReport.failedAcs, null, 2) : undefined;

      // v0.6: pass previouslyPassedAcs for cross-feature regression
      await this.runGeneratorAgentWithRetry(
        featureSprintId, featureRound, prevFeedback,
        this.state.previouslyPassedAcs,
        prevReport?.regressions ?? []
      );

      if (this.state.state === 'REPLANNING') {
        await this.transitionTo('GENERATING', 'Retrying after replan');
        continue;
      }

      await this.transitionTo('EVALUATING', `Evaluating feature round ${featureRound}`);
      const evalOutput = await this.runEvaluatorAgent(
        featureSprintId, featureRound,
        this.state.previouslyPassedAcs  // v0.6: cross-feature regression detection
      );

      const evalResult = parseEvalVerdict(this.harnessDir, featureSprintId, featureRound, evalOutput);

      if (evalResult) {
        const { verdict, report } = evalResult;

        // v0.6: accumulate passed ACs across features
        for (const ac of report.passedAcs) {
          if (!this.state.previouslyPassedAcs.includes(ac)) {
            this.state.previouslyPassedAcs.push(ac);
          }
        }

        // v0.6: cross-feature regression detection
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
          report.regressions = regressions;
          this.emitEvent({ type: 'eval:regression', regressions, round: this.state.round, timestamp: Date.now() });
        }

        if (verdict === 'PASS') {
          featureDone = true;
        } else if (featureRound >= this.config.budget.maxRounds) {
          featureDone = true;
        }
      } else {
        featureDone = true;
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

    this.emitEvent({ type: 'agent:start', role, round: this.state.round, timestamp: Date.now() });

    const effectiveTimeout = timeoutMs ?? this.getTimeoutForRole(role);

    const result = await runAgent({
      invocation,
      onStderrLine: (line) => {
        this.emitEvent({ type: 'agent:log', role, line, timestamp: Date.now() });
      },
      abortSignal: this.abortController.signal,
      timeoutMs: effectiveTimeout,
    });

    this.costTracker.add(result.costUsd);
    this.state.costSpent = this.costTracker.getSpent();

    this.emitEvent({ type: 'agent:done', role, result, timestamp: Date.now() });
    this.emitEvent({ type: 'cost:update', spent: this.costTracker.getSpent(), budget: this.costTracker.getBudget(), timestamp: Date.now() });

    this.state.currentAgent = null;
    return result;
  }

  // ─── State Transitions ────────────────────────────────────────

  private async transitionTo(to: State, reason: string): Promise<void> {
    const from = this.state.state;
    if (!canTransition(from, to)) {
      this.emitEvent({ type: 'error', message: `Cannot transition ${from} → ${to}: ${reason}`, timestamp: Date.now() });
      return;
    }

    const entry = transition(from, to, reason);
    this.state.state = to;
    this.state.history.push(entry);

    this.emitEvent({ type: 'state:change', from, to, timestamp: Date.now() });
    this.persistState();
  }

  // ─── Decision Handling ─────────────────────────────────────────

  private waitForDecision(decision: PendingDecision): Promise<string> {
    if (this.config.autonomy.autoApproveDecisions) {
      return Promise.resolve(decision.options[0] ?? 'Retry with more context');
    }

    return new Promise<string>((resolve) => {
      this.pendingDecisionResolve = resolve;

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

      this.emitEvent({ type: 'decision:resolved', decisionId: 'current', resolution, timestamp: Date.now() });
      resolve(resolution);
    }
  }

  // ─── Abort ─────────────────────────────────────────────────────

  abort(): void {
    this.abortController.abort();
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private emitEvent(event: OrchestratorEvent): void {
    try {
      appendProgress(this.harnessDir, event.type, JSON.stringify(event));
    } catch {
      // Non-fatal
    }

    if (event.type === 'error') {
      this.emit('nyai:error', event);
    } else {
      this.emit(event.type, event);
    }
    this.emit('*', event);
  }

  private persistState(): void {
    try {
      saveState(this.harnessDir, this.state);
    } catch {
      // Non-fatal
    }
  }
}
