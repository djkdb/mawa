import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties, ReactNode } from 'react';
import { colors, fonts } from './theme';

export function Background() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 700px at ${30 + Math.sin(frame / 90) * 8}% -10%, #14213d 0%, transparent 60%), ${colors.ink}` }}>
      <Stars />
    </AbsoluteFill>
  );
}

const STARS = Array.from({ length: 140 }, (_, i) => ({ x: (i * 977) % 1920, y: (i * 613) % 1080, r: 1 + ((i * 7) % 3) * 0.5, s: (i % 5) + 2 }));
function Stars() {
  const frame = useCurrentFrame();
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#64748b" opacity={0.25 + 0.25 * Math.sin(frame / (10 * s.s) + i)} />
      ))}
    </svg>
  );
}

/** Spring-in from below; `delay` in frames relative to the enclosing Sequence. */
export function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 28}px)`, ...style }}>{children}</div>;
}

/** Fades out over the last `frames` of the enclosing Sequence of length `total`. */
export function FadeOut({ total, frames = 12, children }: { total: number; frames?: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const o = frames > 0 ? interpolate(frame, [total - frames, total], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.4em', color: colors.accent, textTransform: 'uppercase' }}>{children}</div>;
}

export function Headline({ children, size = 110 }: { children: ReactNode; size?: number }) {
  return <div style={{ fontFamily: fonts.sans, fontSize: size, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.02em', color: '#fff' }}>{children}</div>;
}

export function Mono({ children, color = colors.fog, size = 24 }: { children: ReactNode; color?: string; size?: number }) {
  return <div style={{ fontFamily: fonts.mono, fontSize: size, color, letterSpacing: '0.08em' }}>{children}</div>;
}

export interface NodeSpec { x: number; y: number; label: string; accent?: boolean; r?: number }

/** A glowing node (SVG) at absolute coordinates. */
export function Node({ x, y, label, accent, r = 34, appear = 0 }: NodeSpec & { appear?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - appear, fps, config: { damping: 14, stiffness: 140 } });
  const color = accent ? colors.accent : colors.white;
  return (
    <g transform={`translate(${x} ${y}) scale(${p})`} opacity={p}>
      {accent && <circle r={r * 2.2} fill={colors.accent} opacity={0.08} />}
      <circle r={r} fill={color} />
      <circle r={r * 0.6} cx={-r * 0.25} cy={-r * 0.25} fill="#fff" opacity={accent ? 0.25 : 0.5} />
      <text y={r + 34} textAnchor="middle" fontFamily={fonts.mono} fontSize={20} letterSpacing="0.3em" fill={accent ? colors.accentSoft : colors.fog}>
        {label.toUpperCase()}
      </text>
    </g>
  );
}

/** Line between two points that draws itself in, with particles travelling along it. */
export function Edge({ from, to, appear = 0, particles = 6 }: { from: { x: number; y: number }; to: { x: number; y: number }; appear?: number; particles?: number }) {
  const frame = useCurrentFrame();
  const draw = interpolate(frame - appear, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ex = from.x + (to.x - from.x) * draw;
  const ey = from.y + (to.y - from.y) * draw;
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={ex} y2={ey} stroke={colors.accent} strokeOpacity={0.4} strokeWidth={2} />
      {draw >= 1 &&
        Array.from({ length: particles }, (_, i) => {
          const t = ((frame - appear) / 60 + i / particles) % 1;
          return <circle key={i} cx={from.x + (to.x - from.x) * t} cy={from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 10} r={4} fill={colors.accentSoft} opacity={0.9} />;
        })}
    </g>
  );
}

export const panelStyle: CSSProperties = { background: colors.panel, border: `1px solid rgba(148,163,184,0.16)`, borderRadius: 24, backdropFilter: 'blur(10px)' };
