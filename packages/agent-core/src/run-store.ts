import type { AgentEvent, AgentMode, WeeklyWorkReport } from '@mawa/shared';

export type RunStatus = 'running' | 'success' | 'error';

export interface RunRecord {
  runId: string;
  mode: AgentMode;
  prompt: string;
  status: RunStatus;
  createdAt: string;
  events: AgentEvent[];
  report: WeeklyWorkReport | null;
  warnings: string[];
  error?: string;
  llm: { provider: string; model: string };
}

/** Persistence seam. v1 ships only the in-memory implementation (ADR-004). */
export interface RunStore {
  create(record: RunRecord): Promise<void>;
  get(runId: string): Promise<RunRecord | null>;
  update(runId: string, patch: Partial<RunRecord>): Promise<void>;
  appendEvent(runId: string, event: AgentEvent): Promise<void>;
  list(limit?: number): Promise<RunRecord[]>;
}

export class MemoryRunStore implements RunStore {
  private runs = new Map<string, RunRecord>();
  constructor(private readonly maxRuns = 50) {}

  async create(record: RunRecord) {
    this.runs.set(record.runId, record);
    if (this.runs.size > this.maxRuns) {
      const oldest = this.runs.keys().next().value;
      if (oldest) this.runs.delete(oldest);
    }
  }
  async get(runId: string) {
    return this.runs.get(runId) ?? null;
  }
  async update(runId: string, patch: Partial<RunRecord>) {
    const r = this.runs.get(runId);
    if (r) Object.assign(r, patch);
  }
  async appendEvent(runId: string, event: AgentEvent) {
    this.runs.get(runId)?.events.push(event);
  }
  async list(limit = 20) {
    return [...this.runs.values()].reverse().slice(0, limit);
  }
}
