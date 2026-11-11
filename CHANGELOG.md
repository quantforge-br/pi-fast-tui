# Changelog

## [0.7.0] - 2026-11-11

### Changed

- Popups (`/model`, `/settings`, `/scoped-models`, thinking level, `/fast-tui`) are at least 76 columns wide (70 columns of content on an 80-column terminal), and content rows wider than the panel end with `…` instead of being cut silently.
- `/fast-tui` dialog: ← and → change the selected setting's value (→ to the next value, ← to the previous one; boolean rows toggle either way). Tabs now switch only with Tab and Shift+Tab. The key hint says so in both languages.
- `/fast-tui` dialog: the key hint always fits on one row. When the full hint is too wide, a short form (`Tab tabs · ↑↓ move · ←→ change · Esc close`) is shown, and below that no hint at all.
- `/fast-tui` dialog: the `(n/total)` scroll indicator counts settings only, not section headings (the Footer tab reads `(1/16)` on its first setting), and section headings leave a space between the rule and the label (`── Extension ───`).
- `/fast-tui` dialog: the language row reads `Language / 语言` in both languages, so it can be found without reading the current one.
- `/fast-tui` dialog keeps one height across its four tabs, as a popup and as the classic overlay: shorter tabs are padded with blank rows, so the panel and its tab bar no longer jump when switching tabs.

## [0.6.0] - 2026-11-11

### Changed

- Footer run status: the timer stays on `working` from the first `agent_start` of a run until `agent_settled`, so retries and continuations no longer flash `done` or restart the clock. A run that settles on a provider error reads `failed <duration>` (error color) and a stopped run reads `stopped <duration>` (muted), both with a new `failed` glyph (`✘` / `✗` / `x`).
- Footer row 2: the model icon is followed by a space instead of the ` · ` separator (`<icon> Provider · Model · <thinking> effort`), in the regular and editor-border footers.
- Footer row 2 sheds stats detail first: the input breakdown `(U … + R …)`, then the cache-hit rate, then the provider name go before the model name is shortened. The thinking level, tokens and cost are now shown whole or not at all, and the thinking level is the last built-in item to go. The same rules apply to the editor-border footer and to rows with extension segments, whose `compactText` is used only after the built-in detail is shed.
- Cost no longer shows a doubled dollar sign under the `unicode` and `ascii` icon sets: the footer reads `$0.081` and the telemetry rate `$1.66/M`. The Nerd Font set keeps its cost icon.
- Turn telemetry fits the terminal width: when the line is too wide it first drops the input breakdown `(U … + R …)`, then wraps onto several lines, breaking only between metrics.
- Header: terminals shorter than 30 rows get a compact five-row header (version title, model and thinking level, cwd, commands) without the logo; it switches back when the terminal grows. The full header leaves a blank column between the tips divider and the right border.
- Grep, Find and Ls cards: rows longer than the card wrap with a hanging indent, under the tree rail (and, for grep lines, under the line-number gutter) instead of at the first column. Collapsed cards still show the same number of logical rows.
- Read card: long lines wrap to the right of the line-number gutter, so the number column holds only numbers. The collapsed preview and its `… N more lines` marker still count logical lines.

## [0.5.1] - 2026-11-11

### Changed

- README: credits pi-open-tui, which pi-fast-tui is based on, and no longer asks to remove other packages before installing.

## [0.5.0] - 2026-11-11

### Changed

- Popup colors: the fill is now black on dark themes and white on light ones instead of the gray `userMessageBg`, and the border uses the theme's `borderAccent` color (orange in Claude-style themes) instead of the neutral `border`.

## [0.4.1] - 2026-11-11

### Changed

- The popup border now sits outside the filled area: one-eighth blocks (`▁ ▔ ▕ ▏`) in the unfilled cells around the panel hug the edge that touches the fill. The line touches the fill on every side, with no empty band between them and no fill sticking out past it, and the lines meet at the corners of the fill instead of leaving a one-cell gap.

## [0.4.0] - 2026-11-11

### Added

- `popupMenus` setting (default on, **Appearance → Editor → Popup menus**): `/settings`, `/model` and ctrl+l, `/scoped-models`, the thinking selector, and `/fast-tui` open as a centered popup panel in the OpenCode style (filled `userMessageBg` background, a thin border on the edge of the fill, title with `esc` hint, padding, Pi's rules removed) while the input box stays visible. Turning it off restores Pi's inline menus.
- The model selector closes on the key that opened it (ctrl+l, following the `app.model.select` binding), the same way `esc` does, with popup menus on or off.

### Changed

- `opencode` input shape: the panel now opens with a half-height row in the panel color, matching the half-height closing row, so the indicators row no longer touches the transcript. Mouse mapping accounts for the extra row. The panel half of that row is the cell background (reverse video `▀` blocks), so terminals that draw block elements from the font, such as Termux, no longer show a dark line between it and the indicators row.

## [0.3.3] - 2026-11-10

### Changed

- The `opencode` panel closes with a half-height row instead of a full empty row, so the gap before the footer is half a row.
- The `opencode` rail is now a half block (`▌`) that ends in `▘` on the closing row, so it stops exactly where the panel background does.

## [0.3.2] - 2026-11-10

### Changed

- The `opencode` panel ends at its info row again and leaves an empty row without background before the footer, instead of a filled padding row.

## [0.3.1] - 2026-11-10

### Changed

- The `opencode` shape ends with a padding row, so its info row no longer touches the footer below.

## [0.3.0] - 2026-11-10

### Added

- `opencode` input shape: a filled panel with a `▎` accent rail, a padding row holding the working indicator and scroll indicators, the text, a blank row, and an info row with model, provider, and thinking level. With **Footer in editor border** on, the footer rows fill the padding and info rows.

## [0.2.0] - 2026-11-10

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
