import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDown, Check, ExternalLink } from 'lucide-react';
import { PROJECT, type AgentEvent, type WeeklyWorkReport } from '@mawa/shared';
import { Eyebrow, Title } from '../components/Slide.js';
import { LINKS } from '../lib/links.js';
import catalog from '../data/mcp-catalog.json';
import demoRun from '../data/demo-run.json';

const fade = (i = 0) => ({ initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: false, amount: 0.4 }, transition: { delay: 0.08 * i, duration: 0.5 } });

/* 01 ------------------------------------------------------------------ */
export function Hero({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="text-center lg:max-w-2xl lg:text-left">
      <Eyebrow>AI × MCP × AX</Eyebrow>
      <Title size="xl">{PROJECT.name}</Title>
      <p className="mx-auto mt-6 max-w-xl text-lg text-slate-300 sm:text-2xl lg:mx-0">
        {PROJECT.tagline.map((t) => (
          <span key={t} className="block">{t}</span>
        ))}
      </p>
      <p className="mx-auto mt-5 max-w-lg text-sm text-fog lg:mx-0">{PROJECT.descriptionKo}</p>
      <button type="button" onClick={onExplore} className="mt-10 inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/10 px-6 py-3 font-mono text-xs uppercase tracking-[0.3em] text-white transition hover:bg-accent/20">
        Explore project <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* 02 ------------------------------------------------------------------ */
export function Problem() {
  return (
    <div>
      <Eyebrow>01 · Problem</Eyebrow>
      <Title>Your work already has the data.<br />It's just scattered everywhere.</Title>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ['GitHub', 'Commits, pull requests, issues. What you actually shipped.'],
          ['Gmail', 'Reviews, requests, deadlines, decisions. Buried in threads.'],
          ['Calendar', 'Meetings and blocked time. What the week looked like.'],
        ].map(([name, desc], i) => (
          <motion.div key={name} {...fade(i)} className="glass rounded-2xl p-5">
            <div className="font-mono text-xs tracking-[0.3em] text-white">{name!.toUpperCase()}</div>
            <p className="mt-2 text-sm text-fog">{desc}</p>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-rose-300/80">No shared context</p>
          </motion.div>
        ))}
      </div>
      <p className="mt-8 max-w-2xl text-sm text-slate-300">Each system is complete on its own and blind to the others. Every weekly update is a human re-aggregating what the tools already know.</p>
    </div>
  );
}

/* 03 ------------------------------------------------------------------ */
export function Solution() {
  const steps = ['GitHub · Gmail · Calendar', 'MCP', 'AI Agent', 'Weekly Report'];
  return (
    <div>
      <Eyebrow>02 · Solution</Eyebrow>
      <Title>One Agent.<br />Connected Context.</Title>
      <div className="mt-10 flex flex-col items-start gap-2 font-mono text-sm">
        {steps.map((s, i) => (
          <motion.div key={s} {...fade(i)} className="flex items-center gap-3">
            <span className={`glass rounded-lg px-4 py-2 ${i === 2 ? 'border-accent/50 text-white' : 'text-slate-200'}`}>{s}</span>
            {i < steps.length - 1 && <ArrowDown className="h-4 w-4 text-accent" />}
          </motion.div>
        ))}
      </div>
      <p className="mt-8 max-w-2xl text-sm text-slate-300">
        The agent does not hard-code an integration. It discovers tools from MCP servers at runtime, decides which ones a request needs, aggregates the results into one context, and turns that into a report where every claim cites its source.
      </p>
    </div>
  );
}

/* 04 ------------------------------------------------------------------ */
const ARCH: Array<{ id: string; label: string; detail: string; code: string; level: number }> = [
  { id: 'user', label: 'USER', detail: 'A natural-language request, e.g. "이번 주 내 개발 프로젝트 진행 상황을 정리해줘."', code: 'apps/web', level: 0 },
  { id: 'agent', label: 'AI AGENT', detail: 'runAgent(): discover → plan (LLM) → execute → aggregate → analyze → validate. Emits typed events; never emits reasoning.', code: 'packages/agent-core/src/agent.ts', level: 1 },
  { id: 'llm', label: 'LLM PROVIDER', detail: 'One interface, swappable adapters: Anthropic (default), OpenAI, OpenAI-compatible, and a scripted fallback for Demo Mode.', code: 'packages/agent-core/src/llm/', level: 1 },
  { id: 'client', label: 'MCP CLIENT', detail: 'One official-SDK Client per server over stdio. tools/list for discovery, tools/call for execution. Child processes get only their own token.', code: 'packages/agent-core/src/tools/mcp-executor.ts', level: 2 },
  { id: 'github', label: 'GitHub MCP', detail: 'get_recent_commits · get_pull_requests · get_open_issues · get_repository_activity', code: 'mcp-servers/github', level: 3 },
  { id: 'gmail', label: 'Gmail MCP', detail: 'search_emails · get_email · search_project_emails', code: 'mcp-servers/gmail', level: 3 },
  { id: 'calendar', label: 'Calendar MCP', detail: 'get_events · get_upcoming_events · search_events', code: 'mcp-servers/calendar', level: 3 },
  { id: 'ext', label: 'EXTERNAL SERVICES', detail: 'GitHub REST (user token), Gmail API and Calendar API. Only read endpoints are called; Google scopes are read-only, GitHub OAuth App scope is not (documented). In Demo Mode the servers serve fixtures instead.', code: 'mcp-servers/*/src/providers/', level: 4 },
];

export function Architecture() {
  const [hover, setHover] = useState<string>('agent');
  const current = ARCH.find((a) => a.id === hover)!;
  const rows = [0, 1, 2, 3, 4].map((l) => ARCH.filter((a) => a.level === l));
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <Eyebrow>03 · Architecture</Eyebrow>
        <Title>Interactive architecture</Title>
        <div className="mt-8 flex flex-col items-center gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="flex flex-wrap justify-center gap-2">
                {row.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onMouseEnter={() => setHover(n.id)}
                    onFocus={() => setHover(n.id)}
                    onClick={() => setHover(n.id)}
                    className={`glass rounded-lg px-4 py-2 font-mono text-xs tracking-[0.2em] transition ${hover === n.id ? 'border-accent/70 text-white shadow-lg shadow-accent/20' : 'text-slate-300 hover:text-white'}`}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
              {i < rows.length - 1 && <ArrowDown className="h-4 w-4 text-accent/70" />}
            </div>
          ))}
        </div>
      </div>
      <aside className="glass self-center rounded-2xl p-5">
        <div className="font-mono text-xs tracking-[0.3em] text-accent">{current.label}</div>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{current.detail}</p>
        <p className="mt-4 font-mono text-[10px] text-fog">{current.code}</p>
      </aside>
    </div>
  );
}

/* 05 ------------------------------------------------------------------ */
type DemoRun = { recordedAt: string; prompt: string; events: AgentEvent[]; report: WeeklyWorkReport };
const RUN = demoRun as unknown as DemoRun;

export function LiveDemo({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const toolEvents = useMemo(() => RUN.events.filter((e) => e.type === 'tool_call_completed' || e.type === 'tool_call_failed'), []);
  const total = toolEvents.length + 3;
  useEffect(() => {
    if (!active) return undefined;
    setStep(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= total) clearInterval(id);
    }, 420);
    return () => clearInterval(id);
  }, [active, total]);

  const report = RUN.report;
  const overview = report.sections.find((s) => s.id === 'overview');
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <Eyebrow>04 · Live demo</Eyebrow>
        <Title>The agent at work</Title>
        <div className="mt-6 glass rounded-2xl p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-fog">Ask your workspace</div>
          <p className="mt-2 text-base text-white">{RUN.prompt}</p>
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-fog">Agent activity</div>
          <ol className="mt-2 space-y-1.5 font-mono text-xs">
            <li className={`flex items-center gap-2 ${step >= 1 ? 'text-slate-200' : 'text-fog/40'}`}><Check className="h-3.5 w-3.5 text-emerald-300" /> Request understood</li>
            {toolEvents.map((e, i) => (
              <li key={i} className={`flex items-center gap-2 transition ${step >= i + 2 ? 'text-slate-200' : 'text-fog/40'}`}>
                <Check className="h-3.5 w-3.5 text-emerald-300" />
                <span className="text-accent">{e.call.server} MCP</span>
                <span className="truncate">{e.call.name}()</span>
              </li>
            ))}
            <li className={`flex items-center gap-2 ${step >= total - 1 ? 'text-slate-200' : 'text-fog/40'}`}><Check className="h-3.5 w-3.5 text-emerald-300" /> Context aggregated</li>
            <li className={`flex items-center gap-2 ${step >= total ? 'text-slate-200' : 'text-fog/40'}`}><Check className="h-3.5 w-3.5 text-emerald-300" /> Report generated</li>
          </ol>
        </div>
      </div>
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-fog">Weekly Work Report</div>
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-300">Demo mode</span>
        </div>
        <p className="mt-2 text-[11px] text-amber-200/80">Recorded demo run replayed from a real execution over the MCP servers in demo mode (scripted provider, synthetic fixtures). Not live, not real data.</p>
        <motion.div animate={{ opacity: step >= total ? 1 : 0.25 }} className="mt-4 space-y-4">
          {[overview, ...report.sections.filter((s) => s.id !== 'overview').slice(0, 3)].map((s) => s && (
            <div key={s.id}>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent">{s.title}</div>
              <ul className="mt-1 space-y-1">
                {s.items.slice(0, 2).map((it) => (
                  <li key={it.id} className="flex items-start gap-2 text-xs text-slate-200">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${it.confidence === 'observed' ? 'bg-emerald-300' : 'bg-violet-300'}`} />
                    <span className="line-clamp-2">{it.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </motion.div>
        <a href={LINKS.liveApp} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-accent hover:underline">
          Open the live agent UI <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/* 06 ------------------------------------------------------------------ */
type Catalog = { generatedAt: string; servers: Record<string, { tools: Array<{ name: string; description: string; inputSchema: unknown; sampleInput: unknown; outputExample: unknown }> }> };
const CATALOG = catalog as unknown as Catalog;

export function McpExplorer() {
  const servers = Object.keys(CATALOG.servers);
  const [server, setServer] = useState(servers[0] ?? 'github');
  const [toolName, setToolName] = useState(CATALOG.servers[server]?.tools[0]?.name ?? '');
  const tools = CATALOG.servers[server]?.tools ?? [];
  const tool = tools.find((t) => t.name === toolName) ?? tools[0];
  return (
    <div>
      <Eyebrow>05 · MCP explorer</Eyebrow>
      <Title>Three servers, ten tools</Title>
      <div className="mt-6 grid gap-4 lg:grid-cols-[200px_240px_1fr]">
        <div className="flex gap-2 lg:flex-col">
          {servers.map((s) => (
            <button key={s} type="button" onClick={() => { setServer(s); setToolName(CATALOG.servers[s]?.tools[0]?.name ?? ''); }} className={`glass rounded-lg px-4 py-2 text-left font-mono text-xs tracking-[0.2em] ${server === s ? 'border-accent/70 text-white' : 'text-slate-300'}`}>
              {s.toUpperCase()} MCP
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-col">
          {tools.map((t) => (
            <button key={t.name} type="button" onClick={() => setToolName(t.name)} className={`rounded-md px-3 py-1.5 text-left font-mono text-xs ${tool?.name === t.name ? 'bg-accent/20 text-white' : 'text-fog hover:text-white'}`}>
              {t.name}
            </button>
          ))}
        </div>
        {tool && (
          <div className="glass max-h-[60vh] overflow-auto rounded-2xl p-5 text-xs">
            <div className="font-mono text-sm text-white">{tool.name}</div>
            <p className="mt-1 text-slate-300">{tool.description}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-accent">Input schema</div>
                <pre className="mt-1 overflow-auto rounded-lg bg-ink/70 p-3 font-mono text-[10px] leading-relaxed text-slate-300">{JSON.stringify(tool.inputSchema, null, 1)}</pre>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-accent">Output example (demo data)</div>
                <pre className="mt-1 overflow-auto rounded-lg bg-ink/70 p-3 font-mono text-[10px] leading-relaxed text-slate-300">{JSON.stringify(tool.outputExample, null, 1)}</pre>
              </div>
            </div>
            <p className="mt-3 font-mono text-[10px] text-fog">Snapshot generated from the running servers via tools/list and tools/call on {new Date(CATALOG.generatedAt).toLocaleDateString()}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* 07 ------------------------------------------------------------------ */
export function AxThinking() {
  return (
    <div>
      <Eyebrow>06 · AX thinking</Eyebrow>
      <Title>From automation to agents</Title>
      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <motion.div {...fade(0)} className="glass rounded-2xl p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-fog">Automation</div>
          <p className="mt-3 text-2xl text-white">"If this happens,<br />do this."</p>
          <p className="mt-3 text-sm text-fog">Fixed triggers, fixed steps. Breaks when the input changes shape.</p>
        </motion.div>
        <ArrowDown className="mx-auto h-5 w-5 text-accent md:-rotate-90" />
        <motion.div {...fade(1)} className="glass rounded-2xl border-accent/40 p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">AI Agent</div>
          <p className="mt-3 text-2xl text-white">"Understand the context,<br />choose the tool,<br />execute the task."</p>
          <p className="mt-3 text-sm text-fog">Tools are discovered, not hard-wired. The policy, not the script, is what you design.</p>
        </motion.div>
      </div>
      <p className="mt-10 text-xl text-slate-200 sm:text-3xl">AX is about redesigning <span className="text-white">how work gets done.</span></p>
    </div>
  );
}

/* 08 ------------------------------------------------------------------ */
export function Learnings() {
  const items: Array<[string, string]> = [
    ['MCP Architecture', 'Servers own credentials and schemas; the agent only sees tools/list and tools/call.'],
    ['Tool Calling', 'The model proposes calls; a policy (allow-list, budget, timeout) decides what runs.'],
    ['Agent Workflow', 'discover → plan → execute → aggregate → analyze → validate, as explicit events.'],
    ['API Integration', 'OAuth code flow server-side, read-only API usage, tokens encrypted at rest.'],
    ['Context Aggregation', 'Every tool row becomes a Source with a stable id; de-dup, sort, cap.'],
    ['AI Evaluation', 'Reports are validated mechanically: unknown citations are dropped, not trusted.'],
    ['Automation', 'The same pipeline runs on fixtures or live data; Demo Mode is a mode, not a mock.'],
    ['Human-AI Collaboration', 'observed vs inferred is visible in the UI so people know what to verify.'],
  ];
  return (
    <div>
      <Eyebrow>07 · Technical learnings</Eyebrow>
      <Title>What I had to learn to make it real</Title>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([t, d], i) => (
          <motion.div key={t} {...fade(i)} className="glass rounded-xl p-4">
            <div className="font-mono text-[11px] tracking-[0.2em] text-white">{t.toUpperCase()}</div>
            <p className="mt-2 text-xs leading-relaxed text-fog">{d}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* 09 ------------------------------------------------------------------ */
export function About() {
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <Eyebrow>08 · About me</Eyebrow>
        <Title>{PROJECT.author.name.toUpperCase()}</Title>
        <p className="mt-4 text-lg text-slate-300">{PROJECT.author.affiliation}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {['AI', 'Agent', 'Automation', 'AX', 'AI Coding'].map((t) => (
            <span key={t} className="glass rounded-full px-3 py-1 font-mono text-xs tracking-widest text-slate-200">{t}</span>
          ))}
        </div>
        <p className="mt-8 max-w-xl text-sm leading-relaxed text-fog">
          I started this project after reading an AX Engineer job description and realizing I wanted to understand, hands-on, how AI agents and MCP work inside real workflows. It is a personal learning and portfolio project, built in public.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 font-mono text-xs">
          <a href={LINKS.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">Instagram {LINKS.instagramHandle} <ExternalLink className="h-3 w-3" /></a>
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">GitHub <ExternalLink className="h-3 w-3" /></a>
        </div>
      </div>
      <div className="glass rounded-2xl p-4 text-center">
        <QRCodeSVG value={LINKS.instagram} size={132} bgColor="transparent" fgColor="#e2e8f0" level="M" />
        <div className="mt-2 font-mono text-[10px] tracking-widest text-fog">{LINKS.instagramHandle}</div>
      </div>
    </div>
  );
}

/* 10 ------------------------------------------------------------------ */
export function Final() {
  return (
    <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <Eyebrow>Let's build the next workflow.</Eyebrow>
        <Title size="xl">{PROJECT.name}</Title>
        <p className="mt-4 font-mono text-lg tracking-[0.3em] text-accent">AI × MCP × AX</p>
        <p className="mt-6 text-sm text-fog">Built by {PROJECT.author.name}</p>
        <div className="mt-6 flex flex-wrap gap-4 font-mono text-xs">
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="glass rounded-lg px-4 py-2 text-slate-200 hover:text-white">GitHub</a>
          <a href={LINKS.instagram} target="_blank" rel="noreferrer" className="glass rounded-lg px-4 py-2 text-slate-200 hover:text-white">Instagram</a>
          {LINKS.email ? <a href={`mailto:${LINKS.email}`} className="glass rounded-lg px-4 py-2 text-slate-200 hover:text-white">Email</a> : <span className="glass rounded-lg px-4 py-2 text-fog/60" title="Set VITE_CONTACT_EMAIL to enable">Email</span>}
        </div>
        <div className="mt-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.4em] text-white">Build in public</div>
          <div className="mt-1 font-mono text-2xl text-accent">{LINKS.instagramHandle}</div>
        </div>
      </div>
      <div className="flex gap-4">
        {[
          ['This portfolio', LINKS.portfolio],
          ['Instagram', LINKS.instagram],
        ].map(([label, url]) => (
          <div key={label} className="glass rounded-2xl p-4 text-center">
            <QRCodeSVG value={url || 'https://example.invalid'} size={116} bgColor="transparent" fgColor="#e2e8f0" level="M" />
            <div className="mt-2 font-mono text-[10px] tracking-widest text-fog">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
