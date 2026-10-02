/** Hero illustration: data flows from three sources through MCP to the agent and out as a report. Pure SVG, source hues. */
export function Pipeline() {
  const src = [
    { y: 40, label: 'GitHub', color: 'var(--color-github)' },
    { y: 110, label: 'Gmail', color: 'var(--color-gmail)' },
    { y: 180, label: 'Calendar', color: 'var(--color-calendar)' },
  ];
  const path = (y: number) => `M 112 ${y} C 170 ${y}, 170 110, 230 110`;
  return (
    <svg viewBox="0 0 520 220" role="img" aria-label="GitHub, Gmail, Google Calendar에서 MCP를 거쳐 AI 에이전트로 데이터가 흐르고 주간 리포트가 만들어지는 흐름" className="h-auto w-full max-w-[520px]">
      {src.map((s) => (
        <g key={s.label}>
          <path d={path(s.y)} fill="none" stroke={s.color} strokeOpacity="0.35" strokeWidth="1.5" />
          <circle r="3" fill={s.color} className="flow-dot" style={{ offsetPath: `path("${path(s.y)}")`, animationDelay: `${s.y / 90}s` }} />
          <rect x="8" y={s.y - 16} width="104" height="32" rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
          <circle cx="26" cy={s.y} r="4" fill={s.color} />
          <text x="40" y={s.y + 4} fill="var(--color-text)" fontSize="12" fontWeight="600">{s.label}</text>
        </g>
      ))}
      <rect x="230" y="78" width="64" height="64" rx="12" fill="var(--color-surface-2)" stroke="var(--color-line)" />
      <text x="262" y="106" textAnchor="middle" fill="var(--color-text)" fontSize="12" fontWeight="700">MCP</text>
      <text x="262" y="122" textAnchor="middle" fill="var(--color-text-3)" fontSize="9">tools/list · call</text>
      <path d="M 294 110 L 340 110" stroke="var(--color-accent)" strokeOpacity="0.6" strokeWidth="1.5" />
      <circle r="3" fill="var(--color-accent)" className="flow-dot" style={{ offsetPath: 'path("M 294 110 L 340 110")', animationDuration: '1.6s' }} />
      <rect x="340" y="70" width="80" height="80" rx="14" fill="var(--color-accent-2)" stroke="var(--color-accent)" strokeOpacity="0.6" />
      <text x="380" y="106" textAnchor="middle" fill="var(--color-text)" fontSize="12" fontWeight="700">AI Agent</text>
      <text x="380" y="122" textAnchor="middle" fill="var(--color-text-2)" fontSize="9">도구 선택 · 검증</text>
      <path d="M 420 110 L 462 110" stroke="var(--color-ok)" strokeOpacity="0.6" strokeWidth="1.5" />
      <circle r="3" fill="var(--color-ok)" className="flow-dot" style={{ offsetPath: 'path("M 420 110 L 462 110")', animationDuration: '1.6s', animationDelay: '0.8s' }} />
      <rect x="462" y="80" width="50" height="60" rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
      {[94, 104, 114, 124].map((y, i) => <rect key={y} x="470" y={y} width={i === 0 ? 24 : 34 - i * 4} height="3" rx="1.5" fill={i === 0 ? 'var(--color-ok)' : 'var(--color-text-3)'} />)}
      <text x="487" y="158" textAnchor="middle" fill="var(--color-text-2)" fontSize="9">주간 리포트</text>
    </svg>
  );
}
