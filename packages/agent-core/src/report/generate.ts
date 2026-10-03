import { REPORT_SECTION_ORDER, REPORT_SECTION_TITLES, WeeklyWorkReportSchema, type AgentMode, type ReportSectionId, type WeeklyWorkReport } from '@mawa/shared';
import type { AggregatedContext } from '../context/aggregate.js';
import type { LLMProvider } from '../llm/types.js';
import { AGENT_SYSTEM_PROMPT, LLMReportSchema, analysisPrompt, llmReportJsonSchema, type AnalysisPrompt } from './prompt.js';

export interface GenerateReportResult {
  report: WeeklyWorkReport;
  droppedItems: number;
  warnings: string[];
}

/**
 * Asks the LLM for a report, then enforces source integrity mechanically:
 * items citing unknown source ids are dropped (and counted), and the final
 * object must pass WeeklyWorkReportSchema. The LLM never sees ids it could
 * not cite, and the UI never sees a bullet whose evidence does not exist.
 */
export async function generateReport(
  llm: LLMProvider,
  context: AggregatedContext,
  input: { runId: string; mode: AgentMode; prompt: string; generatedAt?: string; maskEmails?: boolean; onPrompt?: (p: AnalysisPrompt & { bytes: number }) => void },
): Promise<GenerateReportResult> {
  const prompt = analysisPrompt(context, input.prompt, input.maskEmails ?? true);
  input.onPrompt?.({ ...prompt, bytes: Buffer.byteLength(AGENT_SYSTEM_PROMPT) + Buffer.byteLength(prompt.text) });
  const response = await llm.complete({
    system: AGENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt.text }],
    responseFormat: { name: 'weekly_work_report', schema: llmReportJsonSchema() },
  });
  if (response.stopReason === 'refusal') throw new Error('The model declined to produce a report.');

  const parsed = LLMReportSchema.safeParse(parseJson(response.text));
  if (!parsed.success) {
    throw new Error(`Report JSON did not match schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  const known = new Set(context.sources.map((s) => s.id));
  const warnings: string[] = [];
  let droppedItems = 0;
  let counter = 0;

  const sections = parsed.data.sections
    .map((section) => {
      const items = section.items.flatMap((item) => {
        const unknown = item.sources.filter((id) => !known.has(id));
        if (unknown.length) {
          droppedItems += 1;
          warnings.push(`Dropped item citing unknown source(s) ${unknown.join(', ')}: "${item.text.slice(0, 80)}"`);
          return [];
        }
        if (item.confidence === 'observed' && item.sources.length === 0) {
          // Downgrade rather than drop: the statement may still be useful, but it is not evidence-backed.
          warnings.push(`Downgraded unsourced "observed" item to inferred: "${item.text.slice(0, 80)}"`);
          return [{ id: `item_${++counter}`, text: item.text, confidence: 'inferred' as const, sources: [], ...(item.priority ? { priority: item.priority } : {}), ...(item.reason ? { reason: item.reason.slice(0, 200) } : {}) }];
        }
        return [{ id: `item_${++counter}`, text: item.text, confidence: item.confidence, sources: item.sources, ...(item.priority ? { priority: item.priority } : {}), ...(item.reason ? { reason: item.reason.slice(0, 200) } : {}) }];
      });
      const id = section.id as ReportSectionId;
      return { id, title: REPORT_SECTION_TITLES[id], items };
    })
    .filter((s) => s.items.length > 0)
    .sort((a, b) => REPORT_SECTION_ORDER.indexOf(a.id) - REPORT_SECTION_ORDER.indexOf(b.id));

  const report = WeeklyWorkReportSchema.parse({
    runId: input.runId,
    mode: input.mode,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    period: context.period,
    title: 'Weekly Work Report',
    sources: context.sources,
    sections,
  });

  return { report, droppedItems, warnings };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Tolerate a fenced block or leading prose from less disciplined providers.
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model returned no JSON object');
    return JSON.parse(m[0]);
  }
}
