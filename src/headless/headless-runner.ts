import type { Orchestrator } from '../core/orchestrator';
import type { OrchestratorEvent } from '../types/events';

/**
 * Headless runner — subscribes to orchestrator events and outputs via console.log.
 * Used for CI/script scenarios with --headless flag.
 */
export function runHeadless(orchestrator: Orchestrator): void {
  orchestrator.on('*', (event: OrchestratorEvent) => {
    const ts = new Date(event.timestamp).toISOString().slice(11, 19);

    switch (event.type) {
      case 'state:change':
        console.log(`[${ts}] 🔄 State: ${event.from} → ${event.to}`);
        break;

      case 'agent:start':
        console.log(`[${ts}] 🚀 Agent ${event.role} started (round ${event.round})`);
        break;

      case 'agent:log':
        console.log(`[${ts}] [${event.role}] ${event.line}`);
        break;

      case 'agent:done': {
        const icon = event.result.success ? '✅' : '❌';
        console.log(
          `[${ts}] ${icon} Agent ${event.role} done — cost: $${event.result.costUsd.toFixed(4)}, turns: ${event.result.numTurns}`
        );
        if (event.result.error) {
          console.error(`[${ts}] ⚠️  Error: ${event.result.error}`);
        }
        break;
      }

      case 'eval:verdict': {
        const vIcon =
          event.verdict === 'PASS' ? '✅' : event.verdict === 'PARTIAL' ? '⚠️' : '❌';
        console.log(`[${ts}] ${vIcon} Verdict: ${event.verdict} — ${event.report.summary}`);
        if (event.report.failedAcs.length > 0) {
          for (const ac of event.report.failedAcs) {
            console.log(`[${ts}]   ❌ ${ac.id}: ${ac.reason}`);
          }
        }
        break;
      }

      case 'decision:needed':
        console.log(`[${ts}] ⚠️  Decision needed: ${event.decision.summary}`);
        // In headless mode, auto-approve with first option
        console.log(`[${ts}] → Auto-approving: ${event.decision.options[0]}`);
        orchestrator.resolveDecision(event.decision.options[0]);
        break;

      case 'cost:update':
        console.log(`[${ts}] 💰 Cost: $${event.spent.toFixed(4)} / $${event.budget.toFixed(2)}`);
        break;

      case 'error':
        console.error(`[${ts}] ❌ Error: ${event.message}`);
        break;

      case 'done':
        console.log(`[${ts}] 🎉 Done! ${event.summary}`);
        console.log(
          `[${ts}] 📊 Total: $${event.totalCost.toFixed(4)} | ${event.rounds} rounds | ${Math.round(event.totalDuration / 1000)}s`
        );
        break;
    }
  });
}
