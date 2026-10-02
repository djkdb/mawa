import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { PROJECT } from '@mawa/shared';
import { Edge, Eyebrow, Headline, Mono, Node, Rise, panelStyle } from '../primitives';
import { colors, fonts } from '../theme';

const C = { x: 960, y: 540 };
const SRC = [
  { x: 560, y: 380, label: 'GitHub' },
  { x: 1360, y: 380, label: 'Gmail' },
  { x: 960, y: 820, label: 'Calendar' },
];

/* 0–5 s */
export function Everywhere() {
  const frame = useCurrentFrame();
  const drift = (i: number) => ({ x: SRC[i]!.x + Math.sin(frame / 25 + i) * 40 + (i - 1) * 180, y: SRC[i]!.y + Math.cos(frame / 30 + i) * 30 });
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 0.55 }}>
        {SRC.map((s, i) => (
          <Node key={s.label} {...drift(i)} label={s.label} r={26} appear={i * 6} />
        ))}
      </svg>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Rise><Eyebrow>Every week</Eyebrow></Rise>
        <Rise delay={6}><Headline size={128}>Work is everywhere.</Headline></Rise>
        <Rise delay={14}><Mono>commits · emails · meetings · issues · reviews</Mono></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* 5–10 s */
export function Sources() {
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {SRC.map((s, i) => (
          <Node key={s.label} {...s} label={s.label} appear={i * 10} />
        ))}
      </svg>
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 90 }}>
        <Rise delay={30}><Mono color={colors.white}>Three systems. No shared context.</Mono></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* 10–15 s */
export function Protocol() {
  const frame = useCurrentFrame();
  const bus = interpolate(frame, [20, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {SRC.map((s, i) => (
          <Edge key={s.label} from={s} to={C} appear={i * 8} />
        ))}
        {SRC.map((s) => (
          <Node key={s.label} {...s} label={s.label} />
        ))}
        <circle cx={C.x} cy={C.y} r={70 * bus} fill="none" stroke={colors.accent} strokeWidth={3} strokeOpacity={0.8} />
        <circle cx={C.x} cy={C.y} r={110 * bus} fill="none" stroke={colors.accent} strokeWidth={1} strokeOpacity={0.3} />
        <text x={C.x} y={C.y + 12} textAnchor="middle" fontFamily={fonts.mono} fontSize={34} fontWeight={700} letterSpacing="0.3em" fill="#fff" opacity={bus}>MCP</text>
      </svg>
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 110 }}>
        <Rise><Eyebrow>Model Context Protocol</Eyebrow></Rise>
        <Rise delay={6}><Headline size={104}>One protocol.</Headline></Rise>
        <Rise delay={40}><Mono>tools/list · tools/call · one server per system</Mono></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* 15–22 s */
export function Agent() {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 8) * 0.04;
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {SRC.map((s) => (
          <Edge key={s.label} from={s} to={C} particles={8} />
        ))}
        {SRC.map((s) => (
          <Node key={s.label} {...s} label={s.label} r={28} />
        ))}
        <g transform={`translate(${C.x} ${C.y}) scale(${pulse})`}>
          <Node x={0} y={0} label="AI Agent" accent r={52} />
        </g>
      </svg>
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 110 }}>
        <Rise><Eyebrow>Understand context · choose the tool · execute</Eyebrow></Rise>
        <Rise delay={6}><Headline size={104}>One Agent.</Headline></Rise>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 70 }}>
        <Rise delay={60}><Mono>LLM provider is swappable · tools are discovered at runtime · every claim cites a source</Mono></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* 22–30 s */
const CALLS = [
  ['GitHub MCP', 'get_recent_commits()', '12 commits'],
  ['GitHub MCP', 'get_pull_requests()', '3 pull requests'],
  ['GitHub MCP', 'get_open_issues()', '4 open issues'],
  ['Calendar MCP', 'get_events()', '4 events'],
  ['Gmail MCP', 'search_project_emails()', '7 relevant emails'],
  ['Context', 'aggregated', '34 sources'],
];
export function Tools() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 180px', gap: 120 }}>
      <div style={{ flex: 1 }}>
        <Rise><Eyebrow>Agent activity</Eyebrow></Rise>
        <Rise delay={6}><Headline size={96}>Tool execution</Headline></Rise>
        <Rise delay={14}><div style={{ marginTop: 30, fontFamily: fonts.sans, fontSize: 30, color: colors.fog, maxWidth: 640, lineHeight: 1.4 }}>"{PROJECT.samplePrompt}"</div></Rise>
      </div>
      <div style={{ ...panelStyle, width: 820, padding: 40 }}>
        {CALLS.map(([server, fn, result], i) => {
          const at = 20 + i * 26;
          const p = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const done = frame > at + 18;
          return (
            <div key={fn} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '14px 0', opacity: p, transform: `translateX(${(1 - p) * -20}px)`, borderBottom: i < CALLS.length - 1 ? `1px solid ${colors.line}` : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, border: `2px solid ${done ? colors.emerald : colors.accent}`, display: 'grid', placeItems: 'center', color: colors.emerald, fontSize: 18 }}>{done ? '✓' : ''}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 22, color: colors.accentSoft, width: 190 }}>{server}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 22, color: '#fff', flex: 1 }}>{fn}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 18, color: colors.fog, opacity: done ? 1 : 0, whiteSpace: 'nowrap' }}>{result}</div>
            </div>
          );
        })}
        <div style={{ marginTop: 18, fontFamily: fonts.mono, fontSize: 16, color: colors.amber, letterSpacing: '0.2em' }}>DEMO MODE · SYNTHETIC DATA</div>
      </div>
    </AbsoluteFill>
  );
}

/* 30–38 s */
const SECTIONS = [
  ['Overview', '12 commits, 3 PRs, 4 open issues across 2 repos; 4 events, 8 emails.', 'observed'],
  ['Major Activities', 'my-ai-work-agent: agent-core, MCP servers, SSE timeline.', 'observed'],
  ['Schedule', 'PR #14 review sync · Capstone check-in · Demo day Oct 10.', 'observed'],
  ['Potential Risks', 'OAuth refresh token rotation (#17) may block the demo.', 'inferred'],
  ['Next Actions', 'Resolve #17 · address review on PR #14 · rehearse demo.', 'inferred'],
];
export function Report() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 180px', gap: 120 }}>
      <div style={{ ...panelStyle, width: 900, padding: 44 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: fonts.sans, fontSize: 40, fontWeight: 600, color: '#fff' }}>Weekly Work Report</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.2em', color: colors.amber, border: `1px solid ${colors.amber}66`, borderRadius: 999, padding: '6px 14px' }}>DEMO MODE</div>
        </div>
        {SECTIONS.map(([title, text, conf], i) => {
          const at = 14 + i * 24;
          const p = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={title} style={{ marginTop: 24, opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.3em', color: colors.accent, textTransform: 'uppercase' }}>{title}</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginTop: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, marginTop: 10, background: conf === 'observed' ? colors.emerald : '#c4b5fd' }} />
                <div style={{ fontFamily: fonts.sans, fontSize: 24, color: colors.white, lineHeight: 1.35 }}>{text}</div>
                <div style={{ marginLeft: 'auto', fontFamily: fonts.mono, fontSize: 14, color: colors.fog, whiteSpace: 'nowrap', marginTop: 6 }}>Source: {i < 2 ? 'GitHub' : i === 2 ? 'Calendar' : 'GitHub'}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1 }}>
        <Rise><Eyebrow>Actionable report</Eyebrow></Rise>
        <Rise delay={6}><Headline size={96}>Weekly Report</Headline></Rise>
        <Rise delay={14}><div style={{ marginTop: 26, fontFamily: fonts.sans, fontSize: 28, color: colors.fog, lineHeight: 1.45, maxWidth: 560 }}>Every item is <span style={{ color: colors.emerald }}>observed</span> from a cited source or marked <span style={{ color: '#c4b5fd' }}>inferred</span>. Unknown citations are dropped by schema validation, not trusted.</div></Rise>
      </div>
    </AbsoluteFill>
  );
}

/* 38–45 s */
export function Outro() {
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
        {SRC.map((s) => (
          <Edge key={s.label} from={{ x: (s.x - C.x) * 0.7 + 1480, y: (s.y - C.y) * 0.7 + 640 }} to={{ x: 1480, y: 640 }} particles={5} />
        ))}
        {SRC.map((s) => (
          <Node key={s.label} x={(s.x - C.x) * 0.7 + 1480} y={(s.y - C.y) * 0.7 + 640} label={s.label} r={20} />
        ))}
        <Node x={1480} y={640} label="AI Agent" accent r={36} />
      </svg>
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 180 }}>
        <Rise><Eyebrow>Let's build the next workflow.</Eyebrow></Rise>
        <Rise delay={6}><Headline size={118}>{PROJECT.name}</Headline></Rise>
        <Rise delay={16}><div style={{ marginTop: 18, fontFamily: fonts.mono, fontSize: 40, letterSpacing: '0.35em', color: colors.accent }}>AI × MCP × AX</div></Rise>
        <Rise delay={30}><div style={{ marginTop: 56, fontFamily: fonts.sans, fontSize: 30, color: colors.fog }}>Built by {PROJECT.author.name}</div></Rise>
        <Rise delay={40}><div style={{ marginTop: 10, fontFamily: fonts.mono, fontSize: 30, color: '#fff' }}>{PROJECT.author.instagram.handle} <span style={{ color: colors.fog, fontSize: 20, letterSpacing: '0.3em', marginLeft: 16 }}>BUILD IN PUBLIC</span></div></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
