# apps/web design rules

Hard constraints for the agent demo UI. Anything that violates these is a bug.

- **Type**: Pretendard Variable (self-hosted via npm, dynamic subset). Body 16px / 1.65, headings 600–700 with `letter-spacing: -0.02em`, `word-break: keep-all`. Mono only for tool names and source ids.
- **Color**: two dark surfaces (`--bg`, `--surface`) plus `--surface-2` for hover/selection. Text in three steps (`--text`, `--text-2`, `--text-3`). One accent (`--accent`) used only for actions and the selected state. Semantic colors (ok / caution / inferred) are not accents.
- **No** gradients, glows, coloured shadows, glassmorphism, ALL-CAPS labels, emoji, numbered markers that are not a real sequence, badge rows, 3-identical-card rows for decoration.
- **Borders**: hairline (`--line`) only where a surface step is not enough. Radius 8–12px.
- **Spacing**: 8px grid. Layout with flex/grid `gap`, not margins.
- **Motion**: only state changes that convey progress (a step appearing, a chevron rotating). Respect `prefers-reduced-motion`.
- **Copy**: Korean first, plain sentences, verbs for actions ("에이전트 실행", "출처 3건"). English only for product names, tool names and ids. Say "샘플 데이터" once, where it matters, not on every panel.
- **Honesty**: the demo badge, the sample-data note and the "recorded run" wording come from data (`mode`, build flag), never from decoration.
