# pi-fast-tui

A polished terminal interface for the [Pi](https://pi.dev) coding agent, with [oh-my-pi](https://github.com/can1357/oh-my-pi) style tool cards.

pi-fast-tui is based on [pi-open-tui](https://github.com/OldSuns/pi-open-tui) by OldSuns, which provides the header, footer, editor, telemetry, thinking peek, Copy buttons, and settings. On top of it, pi-fast-tui adds tool cards, a codemode card, and a generic MCP card, all sharing one config file, one settings dialog, one icon mode, and one tool renderer.

## Highlights

- **Pi header** with model, thinking level, working directory, and useful slash-command hints
- **Responsive footer** with Git state, detected runtime, context usage, tokens, cost, and extension status
- **Framed editor** with nine input shapes (rounded, square, heavy, double, ASCII, native, Claude, rule, and OpenCode) and block, bar, and underline cursors, preserving compatible editors from other extensions
- **Project awareness** for 50+ runtimes and detailed Git state, including ahead/behind, staged, modified, untracked, stash, and detached HEAD
- **Turn telemetry** with generation speed, time to first token, duration, stalls, tokens, and cost rate
- **Thinking peek** with a live preview of hidden reasoning while the model works
- **Tool cards** in the oh-my-pi style for built-in tools, codemode scripts, MCP tools, and other extension tools (default)
- **Compact tool view** with edit/write previews and optional support for extension and MCP tools, or Pi's **native** rows
- **Fullscreen Copy buttons** for code blocks and user messages
- **Popup menus** that open Pi's settings, model, scoped-models, and thinking menus (and `/fast-tui`) as a centered panel over the conversation
- **Interactive settings** in English and Simplified Chinese through `/fast-tui`

## Requirements

- Pi 1.5.0 or later
- Node.js 22.19.0 or later (Pi's minimum)
- A terminal with UTF-8 and color support
- A [Nerd Font](https://www.nerdfonts.com/font-downloads) for the full icon set (optional; Unicode and ASCII modes are available)

## Install

Install the extension:

```bash
pi install npm:pi-fast-tui
```

Or try it for one session:

```bash
pi -e npm:pi-fast-tui
```

## Font and icons

For the full icon set, install a [Nerd Font](https://www.nerdfonts.com/font-downloads), select it in your terminal profile, and restart the terminal. Installing the font in the OS alone is not enough for apps such as VS Code or Windows Terminal.

In `/fast-tui`, **Appearance → Icons** offers `auto`, `nerd`, `unicode`, and `ascii`. The default `auto` mode checks the terminal environment, not the installed font. If icons appear as boxes, choose `unicode`; if your terminal has a Nerd Font, you can force `nerd`, including over SSH. `ascii` draws everything pi-fast-tui renders (footer, telemetry, cards, popups, header, settings dialog, thinking peek) in plain ASCII; the input box follows its own shape setting.

See [icon detection and spacing](./docs/configuration.md#icons) for automatic selection rules and the Kitty spacing option.

## Configuration

Run `/fast-tui` to open the settings dialog. Its **General**, **Appearance**, **Footer**, and **Telemetry** tabs are available in English and Simplified Chinese and adapt to the terminal size. Use Tab/Shift+Tab or ←/→ to switch tabs, ↑/↓ to move, Enter/Space to change a value, and Esc/q to close.

Settings are stored in `fast-tui.json` inside Pi's agent directory (default: `~/.pi/agent`; overridden by `PI_CODING_AGENT_DIR`). If saving fails, a warning explains that the change applies only to the current session. Settings from pi-open-tui's `open-tui.json` are not imported; copy the values you want into `fast-tui.json`.

| Setting | Where to find it | Default |
| --- | --- | --- |
| Header and settings language | General → Interface | Header on, English |
| Thinking peek | General → Messages & tools | 1 line |
| Copy buttons | General → Messages & tools | On, fullscreen only |
| Tool view | General → Messages & tools | Cards |
| Footer in editor border | General → Footer | Off |
| Icons, cursor style, and input shape | Appearance | Auto icons, block cursor, rounded shape |
| Popup menus | Appearance → Editor | On |
| Footer fields and telemetry measurements | Footer / Telemetry | Individually configurable |

**Tool view** cycles through Cards, Compact, and Native. Selecting Compact reveals **Compact extension tools** as a child setting; switching to another mode hides it and retains its value. The [configuration reference](./docs/configuration.md#english) contains the complete JSON defaults, every option, and tool exclusions.

## Header, footer, and editor

The header provides model and project context with command hints. The two main footer rows keep location, Git state, runtime, a working/done timer, context usage, model details, tokens, and cost visible as space allows. Fields can be toggled individually; the layout shortens or hides lower-priority information in narrow terminals.

Footer token and cost totals include assistant responses, tool-reported usage, compaction and branch summaries, and cache warming. The cache-hit percentage describes the latest assistant response. Other extensions can use separate status rows or [contribute text directly to the main footer](./docs/footer-segments.md).

**Appearance → Editor → Input shape** changes the editor frame without a restart:

| Shape | Look |
| --- | --- |
| `rounded` (default) | `╭─╮` / `│ │` / `╰─╯` |
| `square` | `┌─┐` / `│ │` / `└─┘` |
| `heavy` | `┏━┓` / `┃ ┃` / `┗━┛` |
| `double` | `╔═╗` / `║ ║` / `╚═╝` |
| `ascii` | `+-+` / `\| \|` / `+-+` |
| `native` | Pi's own top and bottom rules, no side rails |
| `claude` | Top and bottom rules with a `❯ ` prompt on the first line |
| `rule` | Top rule only, with the `❯ ` prompt; scroll indicators move to that rule |
| `opencode` | Filled panel with a `▌` accent rail: a padding row with the working indicator, the text, a blank row, and a model · provider · thinking row, closed by a half-height row (the rail ends in `▘`) that leaves a small gap before the footer |

The shapes were inspired by oh-my-pi's `composer.shape`. In `fast-tui.json` the key is `editorShape`. See the [configuration reference](./docs/configuration.md#editor-shapes) for details.

Enable **Footer in editor border** to move the two main rows into the editor's top and bottom borders. Extension status rows remain below the editor. Compatible editors keep their input behavior, completion, and ghost text; editors that cannot be framed retain a separate footer. The `rule` shape has no bottom border, so it also keeps the footer separate. The `opencode` shape puts the two rows in its padding and info rows instead. See [editor compatibility and layout](./docs/implementation.md#editor-and-layout) for the integration boundaries.

## Popup menus

With **Appearance → Editor → Popup menus** on (the default), `/settings`, `/model` and ctrl+l, `/scoped-models`, the thinking-level selector, and `/fast-tui` open as a centered popup instead of replacing the input box. The popup has a filled background (black on dark themes, white on light ones, so it stands apart from the conversation), a thin border in the theme's `borderAccent` color (orange in Claude-style themes) of one-eighth blocks (`▁ ▔ ▕ ▏`) drawn just outside the filled area so the line touches the fill on every side, with no empty band and no fill past the line, the menu title on the left with `esc` on the right, and inner padding; Pi's horizontal rules inside the menu are dropped. The input box stays visible behind it, keys work as before, and in fullscreen mode the mouse works inside the popup. The model selector also closes on the key that opened it (ctrl+l, or whatever `app.model.select` is bound to), with popups on or off. Other Pi menus (resume, tree, fork, login, and so on) keep their usual place. Turn the option off to get Pi's inline menus back; the change applies to the next menu you open. In `fast-tui.json` the key is `popupMenus`. See [popup menus](./docs/implementation.md#popup-menus) for how the menus are intercepted.

## Turn telemetry

After each complete agent run, pi-fast-tui shows one transient result, combining its assistant turns:

```text
> TPS 42.5 tok/s | ~ TTFT 1.2s | + 29.7s | ↑ 567 | ↓ 1.2k | ! stall 1x / 4.3s | $ $3.60/M
```

TPS measures provider-reported output tokens over generation time, including waiting and stalls but excluding tool execution between turns. The working timer also shows an estimated live speed such as `~54 tok/s` during streaming. The `$ / M` field is the effective rate per million tokens for the run; the footer shows cumulative session cost.

Toggle notification fields under **Telemetry → Measurements**, or live speed under **Footer → Runtime → Live TPS**. See [measurement definitions](./docs/implementation.md#usage-and-telemetry) for formulas, timing boundaries, and cache accounting.

## Thinking peek

With Pi's **Hide thinking** enabled, pi-fast-tui replaces the hidden block's `Thinking...` label with the latest reasoning tail while the model works:

```text
~ think ⠋ previous thought
          latest thought
```

Choose **Off**, **1 line**, or **2 lines** under **General → Messages & tools → Thinking peek**. The ticker appears only when the model streams reasoning, settles on a check mark when the answer begins, and returns to Pi's native label after the task settles. It follows Pi's Hide thinking toggle immediately and clips text to fit the available width.

## Tool view

pi-fast-tui registers a single tool renderer. **General → Messages & tools → Tool view** picks how each new tool row is drawn:

| Mode | Rows |
| --- | --- |
| **Cards** (default) | One oh-my-pi style card per call |
| **Compact** | One call row plus a summary row |
| **Native** | Pi's own rendering |

Tools listed in `toolView.exclude` keep Pi's native rows in every mode. Changing the mode affects newly created rows; use `/reload` or a new session to apply it to the whole transcript.

### Cards

Each tool call becomes one card. The call sits in the top border, the result in the body, and the run's facts (wall time, timeout, exit code, totals) in the bottom border. The border color follows the call: accent while it runs, dim once it succeeds, yellow for a warning, red for an error. A running call shows a spinner and a live timer.

```text
 ╭─── ✔ Bash ─────────────────────────────────────────────────────────╮
 │ $ npm test                                                         │
 ├─── Output ─────────────────────────────────────────────────────────┤
 │ Test Files  9 passed (9)                                           │
 │      Tests  108 passed (108)                                       │
 ╰─── Wall: 1.84s · Timeout: 300s ────────────────────────────────────╯
 ╭─── ✔ Edit: src/config.ts ⟨+2/-1⟩ ──────────────────────────────────╮
 │  11 export const name = "pi";                                      │
 │ -12 export const retries = 3;                                      │
 │ +12 export const retries = 5;                                      │
 │ +13 export const backoffMs = 200;                                  │
 ╰────────────────────────────────────────────────────────────────────╯
 ✔ Grep: retries in src 2 matches · 2 files
 ├─ src/config.ts
 │  *12│ export const retries = 5;
 ├─ src/client.ts
 │  *40│ for (let i = 0; i < retries; i++) {
```

| Tool | Card |
| --- | --- |
| `bash` | The command, its output following the tail (10 rows collapsed), and `Wall · Timeout · Exit` in the bottom border. |
| `read` | One line while it runs; then the lines numbered from the offset, with Pi's "Use offset=…" notice in the bottom border. |
| `edit` | A diff preview built from the arguments while they stream, then Pi's diff with `⟨+added/-removed⟩` in the header. |
| `write` | The file, its line count, and the start of its content, highlighted. |
| `grep`, `find`, `ls` | One header line with counts, and the results as a tree; grep groups matches by file. |
| `codemode` | The script's title in the top border and one row per nested call (see below). |
| MCP tools (`mcp__*`) | A generic card: arguments inline, the result as a JSON tree or a four-line preview. |
| Anything else | Tools without a renderer get the same generic card. Tools whose extension draws them keep that drawing. |

`Ctrl+O` (or whatever `app.tools.expand` is bound to) expands every card: full output, the arguments as a tree, the whole diff. Clicking a card toggles it too. Colors come from the active theme, and cards respect Pi's `outputPad` setting. With **Appearance → Icons** set to `ascii`, cards switch to ASCII frames, tree connectors, and status icons.

### Codemode card

```text
 ╭─── ⚠ Codemode: Raise the retry limits ─────────────────────────────────────────╮
 │ ├─ ✔ read src/config.ts                                                    4ms │
 │ ├─ ✎ src/config.ts +2 −1                                                   3ms │
 │ │  -12 export const retries = 3;                                               │
 │ │  +12 export const retries = 5;                                               │
 │ │  +13 export const backoffMs = 200;                                           │
 │ ├─ ✔ $ npm test in packages/core                                          2.1s │
 │ └─ ✘ read missing.txt                                                      2ms │
 │    ENOENT: no such file or directory                                           │
 ├─── Output ─────────────────────────────────────────────────────────────────────┤
 │ Tests  47 passed (47)                                                          │
 ╰─── 4 actions · 1 file +2 −1 · 1 failed · 2.21s ────────────────────────────────╯
```

- While the model writes the script, the card follows its last lines.
- Each nested call is a row with its status, time, and cost; a running one spins and shows the last line of its output.
- Consecutive edits to one file fold into one row with their diff. Edits and failures stay in view when older actions are hidden.
- The bottom border totals actions, changed files and lines, failures, time, cost, and images. A finished script with a failed action gets a warning border.
- Expanded, the card shows the highlighted script, every action, full diffs, and the full output.
- In Cards mode the extension asks the model to start every script with a `// title` comment, which becomes the card's title.

Diffs of nested edits are kept in the session as `codemode-render-changes` entries, the same type pi-codemode-render wrote, so sessions recorded with it keep their diffs.

### Compact rows

Compact mode displays Pi's built-in tools (`read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`) as call and summary rows:

```text
● Read(src/ui/footer.ts:1-120)
  └  120 lines
● Edit(src/ui/footer.ts)
  └  +2 −1
● Bash(npm test)
  └  Done · 131 lines · 6.4s
```

- Successful `edit` and `write` calls show syntax-highlighted previews of up to 16 rows, with a hint to expand longer output.
- Running shell calls show recent output and elapsed time; errors retain their error summary.
- Click a row to expand its native card, or use `Ctrl+O` to expand all rows. Tools, arguments, results, and model-visible content are unchanged.
- Enable **Compact extension tools** to include extension and MCP tools. Recognized `@ff-labs/pi-fff` tools receive search-specific summaries.

See [tool rendering details](./docs/implementation.md#tool-rendering) for the selector, preview rules, extension summaries, and renderer compatibility.

## Copy buttons

In fullscreen mode (Pi's `tuiMode: "fullscreen"`), completed code blocks show a clickable `[Copy]` label in their rounded frame when there is enough width. User messages have a Copy label too. Clicking copies the source text and Pi flashes `Copied!`.

```text
╭─ sh ─────────────── [Copy] ╮
│ pi install npm:pi-fast-tui │
╰────────────────────────────╯
```

Code labels copy code without fences, preserving indentation and tabs. User-message labels copy the original message. Streaming code blocks gain their label when streaming finishes; regular mode and thinking blocks keep Pi's plain fences. Use Pi's `/copy` to copy a whole assistant reply.

Toggle **General → Messages & tools → Copy buttons** to enable or disable this feature. [Copy-button details](./docs/implementation.md#copy-button-behavior) cover width limits, cached blocks, and interaction with other renderers.

## Documentation

- [Configuration reference](./docs/configuration.md#english) — complete defaults, options, and icon selection
- [Implementation and compatibility](./docs/implementation.md#english) — measurement formulas, layout, rendering, and lifecycle
- [Extension footer segments](./docs/footer-segments.md) — public events and an integration example for extension authors
- [Changelog](./CHANGELOG.md) — released and upcoming changes

## Local development

```bash
npm install
npm test
npm run typecheck
pi -e .
```

Tests run on vitest; they use temporary agent directories and never write to `~/.pi/agent`. Built and tested against Pi 1.5.2. Keep all Pi packages on the same version. Use `pi -e .` to check terminal fonts, mouse interaction, and cursor support interactively.

## Acknowledgements

pi-fast-tui is based on **[pi-open-tui](https://github.com/OldSuns/pi-open-tui)** by OldSuns. Thanks to its author for the work this extension builds on. pi-fast-tui also builds on several Pi community packages:

- **[pi-haiku](https://github.com/nnocte/pi-haiku)** — two-line footer structure and working timer
- **[pi-claude-code-tui](https://github.com/Phoobobo/pi-claude-code-tui)** — Pi logo artwork and rounded editor border technique
- **[pi-zentui](https://github.com/lmilojevicc/pi-zentui)** — Starship-style footer segments, runtime detection, session lifecycle, and settings UI pattern
- **[pi-tps](https://github.com/monotykamary/pi-tps)** — turn timing, stall detection, and conservative TPS measurement
- **[pi-polish](https://github.com/Pringled/pi-extensions/blob/main/packages/pi-polish)** — compact tool-call rows and syntax-highlighted edit diffs
- **[oh-my-pi](https://github.com/can1357/oh-my-pi)** — card frame, status line, output preview, and JSON tree (MIT)
- **[pi-codemode-render](https://www.npmjs.com/package/pi-codemode-render)** — the codemode card's session entries

The logo artwork is derived from Pi's official install script (`pi.dev/install.sh`). Runtime detection and Git porcelain parsing borrow structure from `pi-zentui`.

Special thanks to the **[LINUX DO](https://linux.do)** community for its support.

## License

[MIT](./LICENSE). The license file keeps the notices of pi-open-tui and oh-my-pi.
