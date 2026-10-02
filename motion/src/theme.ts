export const FPS = 30;
export const DURATION_SEC = 45;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const colors = {
  ink: '#05070d',
  navy: '#0b1020',
  panel: 'rgba(15, 23, 42, 0.7)',
  line: '#1e293b',
  fog: '#94a3b8',
  white: '#e2e8f0',
  accent: '#5b8cff',
  accentSoft: '#9db7ff',
  amber: '#fbbf24',
  emerald: '#6ee7b7',
};

export const fonts = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Story beats in seconds, matching the brief. */
export const BEATS = {
  everywhere: [0, 5],
  sources: [5, 10],
  protocol: [10, 15],
  agent: [15, 22],
  tools: [22, 30],
  report: [30, 38],
  outro: [38, 45],
} as const;
