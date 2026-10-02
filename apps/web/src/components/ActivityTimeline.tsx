import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import type { RunPhase } from '../lib/useAgentRun.js';

interface Step {
  key: string;
  label: string;
  detail?: string;
  state: 'done' | 'active' | 'failed';
}

const SERVER_LABEL: Record<string, string> = { github: 'GitHub MCP', gmail: 'Gmail MCP', calendar: 'Calendar MCP' };

/** Collapses the raw event stream into the timeline the user sees. Never shows model reasoning. */
export function stepsFromEvents(events: AgentEvent[], phase: RunPhase): Step[] {
  const steps: Step[] = [];
  const toolSteps = new Map<string, Step>();
  for (const e of events) {
    switch (e.type) {
      case 'agent_run_started':
        steps.push({ key: 'start', label: 'Request understood', state: 'done' });
        break;
      case 'tool_discovery_started':
        steps.push({ key: 'discover', label: 'Discovering MCP tools', detail: e.servers.map((s) => SERVER_LABEL[s] ?? s).join(' · '), state: 'active' });
        break;
      case 'tool_discovered': {
        const s = steps.find((x) => x.key === 'discover');
        if (s) {
          s.state = 'done';
          s.label = `${e.tools.length} tools discovered`;
        }
        break;
      }
      case 'tool_call_started': {
        const step: Step = { key: e.call.id, label: SERVER_LABEL[e.call.server] ?? e.call.server, detail: `${e.call.name}(${formatArgs(e.call.input)})`, state: 'active' };
        toolSteps.set(e.call.id, step);
        steps.push(step);
        break;
      }
      case 'tool_call_completed': {
        const s = toolSteps.get(e.call.id);
        if (s) {
          s.state = 'done';
          s.detail = `${e.call.name}() → ${e.result.output.summary} · ${e.result.durationMs}ms`;
        }
        break;
      }
      case 'tool_call_failed': {
        const s = toolSteps.get(e.call.id);
        if (s) {
          s.state = 'failed';
          s.detail = `${e.call.name}() ✕ ${e.result.error.message}`;
        }
        break;
      }
      case 'context_aggregated':
        steps.push({ key: 'ctx', label: 'Context aggregated', detail: `${e.totalItems} items · ${Object.entries(e.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`, state: 'done' });
        steps.push({ key: 'analyze', label: 'Analyzing with LLM', state: 'active' });
        break;
      case 'report_generated': {
        const s = steps.find((x) => x.key === 'analyze');
        if (s) {
          s.state = 'done';
          s.label = 'Report generated';
          s.detail = `${e.report.sections.length} sections · ${e.report.sections.reduce((n, sec) => n + sec.items.length, 0)} items${e.droppedItems ? ` · ${e.droppedItems} unsourced item(s) dropped` : ''}`;
        }
        break;
      }
      case 'agent_run_completed':
        if (e.status === 'error') {
          for (const s of steps) if (s.state === 'active') s.state = 'failed';
          steps.push({ key: 'end', label: 'Run failed', detail: e.error ?? '', state: 'failed' });
        }
        break;
    }
  }
  if (phase === 'starting' && steps.length === 0) steps.push({ key: 'boot', label: 'Starting MCP servers', state: 'active' });
  return steps;
}

function formatArgs(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (!entries.length) return '';
  return entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`).join(', ').slice(0, 80);
}

export function ActivityTimeline({ events, phase }: { events: AgentEvent[]; phase: RunPhase }) {
  const steps = stepsFromEvents(events, phase);
  if (phase === 'idle') return null;
  return (
    <section aria-live="polite" className="rounded-2xl border border-line/70 bg-panel/60 p-5">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">Agent activity</h2>
      <ol className="mt-4 space-y-2.5">
        <AnimatePresence initial={false}>
          {steps.map((s) => (
            <motion.li key={s.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {s.state === 'done' && <Check className="h-4 w-4 text-emerald-300" aria-label="done" />}
                {s.state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-accent" aria-label="in progress" />}
                {s.state === 'failed' && <AlertTriangle className="h-4 w-4 text-rose-300" aria-label="failed" />}
              </span>
              <div className="min-w-0">
                <div className={`text-sm ${s.state === 'failed' ? 'text-rose-200' : 'text-white'}`}>{s.label}</div>
                {s.detail && <div className="truncate font-mono text-[11px] text-fog">{s.detail}</div>}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
