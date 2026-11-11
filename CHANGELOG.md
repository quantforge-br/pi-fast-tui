# Changelog

## [Unreleased]

### Added

- `editorShape` setting with eight input shapes inspired by oh-my-pi's `composer.shape`: `rounded` (default), `square`, `heavy`, `double`, `ascii`, `native`, `claude` and `rule`. **Appearance → Editor → Input shape** switches it without a restart.
- The `claude` and `rule` shapes draw a `❯ ` prompt. The `rule` shape keeps only the top rule and shows both scroll indicators there.

### Changed

- The footer stays out of the editor when the shape has no bottom border (`rule`), even with **Footer in editor border** on.

## [0.1.0] - 2026-11-10

First release. pi-fast-tui merges pi-open-tui 0.4.4 and pi-omp-tools 0.1.0 into one extension and replaces both of them, along with pi-codemode-render.

### Added

- Header, responsive two-row footer, framed editor, turn telemetry, thinking peek, fullscreen Copy buttons, and the English/Simplified Chinese settings dialog from pi-open-tui.
- oh-my-pi style tool cards from pi-omp-tools: the call in the top border, facts in the bottom border, border color by state, live spinner and timer.
- Cards for `bash`, `read`, `edit`, `write`, `grep`, `find` and `ls`, a codemode card with a tree of nested calls, folded edit diffs and totals, and a generic card for MCP tools and other tools without a renderer.
- A third tool view mode, **Cards**, which is the default. **Tool view** in the settings dialog cycles Cards, Compact and Native.
- An ASCII glyph set for the cards, used when `icons.mode` is `ascii`.

### Changed

- The settings command is `/fast-tui` and the config file is `<agentDir>/fast-tui.json`. `open-tui.json` is not migrated.
- One tool renderer serves all three modes. `toolView.exclude` applies to cards as well, so excluded tools keep Pi's native rows.
- The codemode "title your script" prompt section is only added while the tool view is Cards.
- Tests run on vitest.

### Compatibility

- Footer segment events keep their `open-tui:footer:*` names, so extensions written for pi-open-tui work unchanged.
- Codemode edit diffs are still stored as `codemode-render-changes` session entries, so sessions recorded with pi-codemode-render or pi-omp-tools keep their diffs.
- Do not install pi-fast-tui next to pi-open-tui, pi-omp-tools or pi-codemode-render.
