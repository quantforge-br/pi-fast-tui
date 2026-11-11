# Configuration reference / 配置参考

[English](#english) | [简体中文](#简体中文) | [Default JSON / 默认 JSON](#default-json)

## English

For installation and feature examples, see the [README](../README.md). This reference covers all settings accepted by `fast-tui.json`. The sources are [config.ts](../src/ui/config.ts), [settings-command.ts](../src/ui/settings-command.ts), and [icons.ts](../src/ui/icons.ts).

### Storage and loading

The file is stored in Pi's agent directory: `~/.pi/agent/fast-tui.json` by default, or `<PI_CODING_AGENT_DIR>/fast-tui.json` when that environment variable is set. The extension creates the file with defaults if it is missing and the directory is writable.

You only need to specify values you want to change; missing fields inherit [the defaults](#default-json). Flags must be JSON booleans, not strings such as `"false"`. Invalid known values fall back to their defaults, and unreadable or malformed JSON falls back to the default configuration with a warning. Direct file edits are loaded on `/reload` or a new session. If saving from `/fast-tui` fails, the new values still apply to the current session and a warning asks you to check directory permissions and free space.

### Settings dialog

| Tab | Sections |
| --- | --- |
| General | Extension, Interface, Messages & tools, Footer |
| Appearance | Icons, Editor |
| Footer | Location, Git, Runtime, Usage, Other |
| Telemetry | Enabled (standalone master switch), Measurements |

Tab/Shift+Tab switches tabs; ↑/↓ or Page Up/Page Down moves between settings; → (or Enter/Space) changes a value to the next one and ← to the previous one; Esc/q closes the dialog. Dim section headings occupy rows but cannot be selected or changed. The scroll position counts settings only.

**Tool view** cycles Cards → Compact → Native. **Compact extension tools** appears only while **Tool view** is Compact. Switching to another mode hides it while retaining its value. Installing or removing the UI through the **Enabled** switch is deferred until the dialog closes. Existing configuration files need no migration.

### General options

| Key | Default | Values and behavior |
| --- | --- | --- |
| `enabled` | `true` | Master switch for fast-tui |
| `header` | `true` | Replaces the header; disable to leave that slot to Pi or another extension. Terminals shorter than 30 rows get a compact five-row form (version, model and thinking level, cwd, commands) without the logo |
| `inlineFooter` | `false` | Moves the two main footer rows into a compatible editor's borders; extension status rows remain separate |
| `copyButtons` | `true` | Code-block and user-message Copy labels in fullscreen mode |
| `settingsLanguage` | `"en"` | `"en"` or `"zh"`; changes the settings interface language |
| `cursorStyle` | `"block"` | `"block"`, `"bar"`, or `"underline"`; the latter two need terminal cursor-shape support |
| `editorShape` | `"rounded"` | `"rounded"`, `"square"`, `"heavy"`, `"double"`, `"ascii"`, `"native"`, `"claude"`, `"rule"`, or `"opencode"`; see [Editor shapes](#editor-shapes) |
| `popupMenus` | `true` | Opens `/settings`, `/model` (ctrl+l), `/scoped-models`, the thinking selector, and `/fast-tui` as a centered popup; see [Popup menus](#popup-menus) |
| `icons.mode` | `"auto"` | `"auto"`, `"nerd"`, `"unicode"`, or `"ascii"`; see [Icons](#icons). `"ascii"` also draws every pi-fast-tui surface in ASCII; the other modes keep Unicode frames and punctuation |
| `thinkingPeek.lines` | `1` | `0` (off), `1`, or `2`; visible while Pi's Hide thinking setting is on and reasoning is streamed |
| `toolView.mode` | `"cards"` | `"cards"`, `"compact"`, or `"native"`; selected when Pi creates each tool row |
| `toolView.extensionTools` | `false` | In compact mode, includes extension, MCP, and replacement tools |
| `toolView.exclude` | `[]` | Exact tool names that keep native rendering, including built-ins; edited in the JSON file only |

For example, `"toolView": { "mode": "compact", "extensionTools": true, "exclude": ["edit", "subagent_wait"] }` enables compact rendering while preserving those two tools' native cards. Exclusions apply in every mode, so excluded tools also skip the cards. Use `/reload` or a new session to rebuild existing rows with the new tool-view settings.

### Editor shapes

`editorShape` selects how the input box is drawn. **Appearance → Editor → Input shape** cycles through the shapes and applies the change to the mounted editor immediately.

| Value | Frame | Notes |
| --- | --- | --- |
| `"rounded"` | `╭╮│╰╯` | Default; same look as earlier releases |
| `"square"` | `┌┐│└┘` | |
| `"heavy"` | `┏┓┃┗┛` and `━` | |
| `"double"` | `╔╗║╚╝` and `═` | |
| `"ascii"` | `+`, `-`, `\|` | For terminals or fonts without box-drawing glyphs |
| `"native"` | Pi's top and bottom rules | No side rails or extra inset; text uses the full width |
| `"claude"` | Top and bottom rules | `❯ ` before the first line; later lines are indented to match |
| `"rule"` | Top rule only | `❯ ` prompt like `claude`; both `↑/↓ N more` scroll indicators move to the top rule |
| `"opencode"` | `▌` accent rail ending in `▘`, no rules | Filled panel (theme `userMessageBg`): padding row with the working indicator and scroll indicators on the right, the text, a blank row, and an info row with model, provider, and thinking level; a closing row of `▀` half blocks in the panel color adds half a row of padding and leaves half a row of space before the footer (blank when the theme background is not a 256-color or truecolor value) |

The working indicator, cursor style, completion list, and mouse positions work with every shape. **Footer in editor border** needs a bottom border, so with `"rule"` the footer stays in its separate rows even when `inlineFooter` is `true`. With `"opencode"`, the footer's first row moves into the padding row and its second row replaces the model info row. Unknown values fall back to `"rounded"`.

### Popup menus

`popupMenus` (**Appearance → Editor → Popup menus**) shows Pi's settings, model (`/model` and ctrl+l), scoped-models, and thinking-level menus, plus `/fast-tui`, as a centered popup over the conversation. The popup is 70% of the terminal width, kept between 76 and 100 columns, and at most 85% of its height. Its background is black on dark themes and white on light ones (the theme's `userMessageBg` when the theme reports no appearance), and it has a thin border in the theme's `borderAccent` color of one-eighth blocks (`▁ ▔ ▕ ▏`) in the unfilled cells around the panel, each hugging the edge that touches the fill, so the line sits right against the filled area with no empty band and no fill past it (corner cells stay blank, leaving a one-eighth notch; with `icons.mode` set to `ascii` the border is a plain `+`, `-`, `|` box instead), the menu title on the left and `esc` on the right, and two columns of padding; in terminals shorter than 19 rows the blank padding rows are dropped. Pi's own rules around the menu are removed; the menu items, search, and keys are Pi's. The input box stays mounted behind the popup. Toggling the option applies to the next menu opened. Non-boolean values fall back to `true`. Independently of this option, the model selector closes on its own opening key (`app.model.select`, ctrl+l by default), just like `esc`.

### Footer options

All keys below are booleans inside `footerSegments`.

| Key | Default | Content or effect |
| --- | --- | --- |
| `cwd` | `true` | Current working directory, shortened when needed |
| `hostname` | `false` | Short host name (before the first dot) with a server icon |
| `sessionName` | `false` | Session name, when one is set |
| `gitBranch` | `true` | Branch name, or `HEAD` and a short commit hash in detached HEAD state |
| `gitStatus` | `true` | Conflicted, deleted, modified, renamed, staged, untracked, stashed, and ahead/behind counts |
| `gitCommit` | `false` | Tag pointing at the detached HEAD commit; only used when `gitBranch` is on |
| `runtime` | `true` | Detected project runtime and its version when available |
| `context` | `true` | Context bar, percentage, and token usage |
| `contextBar` | `true` | Progress bar and its icon; `false` keeps only the percentage and token usage |
| `tokens` | `true` | Cumulative input/output tokens and the latest assistant cache-hit percentage |
| `cost` | `true` | Cumulative session cost reported by Pi |
| `liveTps` | `true` | Estimated streaming speed beside the working timer |
| `extensionStatuses` | `true` | Separate `ctx.ui.setStatus()` rows, including MCP status |
| `extensionSegments` | `true` | Contributions embedded in the main rows through the [footer event API](./footer-segments.md) |
| `capitalizeProviderName` | `true` | Capitalizes the provider's first character; disable to retain original casing |
| `nerdIconSpacing` | `false` | Adds one blank cell after Nerd Font icons, including runtime icons |

The provider/model and working/done timer do not have separate visibility switches; `liveTps` controls only the speed estimate. `extensionSegments` controls visibility, so hidden contributions still receive updates and their lifecycle stays available. It is independent of `extensionStatuses`.

### Telemetry options

All keys below are booleans inside `telemetry` and default to `true`.

| Key | Effect |
| --- | --- |
| `enabled` | Master switch for the end-of-run notification |
| `tps` | Provider-based output tokens per second |
| `ttft` | Time to first output |
| `duration` | Full agent-run duration |
| `tokens` | Assistant input/output counts for measured turns |
| `stalls` | Stream pauses, shown only when detected |
| `cost` | Effective dollar rate per million reported tokens |

The footer's live-speed estimate has its own `footerSegments.liveTps` switch. See [usage and telemetry](./implementation.md#usage-and-telemetry) for measurement definitions and limitations.

### Icons

| `icons.mode` | Selection |
| --- | --- |
| `auto` | ASCII when stdout is not a TTY, `TERM=dumb`, or the first configured locale (`LC_ALL`, `LC_CTYPE`, `LANG`) is not UTF-8. Otherwise Unicode when `SSH_TTY` or `SSH_CONNECTION` is set, and Nerd Font locally. An unset locale passes the UTF-8 check |
| `nerd` | Always use Nerd Font glyphs |
| `unicode` | Portable Unicode symbols; emoji use the terminal's own fallback font |
| `ascii` | Plain-text symbols |

With `ascii`, everything pi-fast-tui draws stays within ASCII: the footer (token counts read `i`/`o`, separators ` | `, ellipses `...`), turn telemetry, tool cards and compact rows (`+`, `-`, `|` frames, `x` for failures, a `| / - \` spinner), popup borders (`+`, `-`, `|`), the Copy code frame, the header (frame, tips divider, a logo of `#` cells), the `/fast-tui` dialog (the `>` selection marker, `-` section rules, and arrows named `Up/Down`, `Left/Right` in the key hint), and the thinking peek. Switching the mode redraws the transcript at once. Two things are not covered: the editor frame follows `editorShape` (pick `ascii` there for an ASCII input box), and content drawn by Pi or returned by tools (model output, file contents, Pi's own menus and the `Language / 语言` row) is shown unchanged.

Auto detection does not inspect installed fonts. Configure a Nerd Font in the terminal profile or choose `unicode`/`ascii` if symbols are missing. If the SSH client terminal has a Nerd Font, select `nerd` explicitly.

For wide Nerd glyphs that consume the gap before a label, enable **Footer → Other → Extra space after Nerd icons** (`footerSegments.nerdIconSpacing`). This affects regular and inline footers; Unicode/ASCII icons and compact Git flags are unchanged. In Kitty, `narrow_symbols U+E000-U+F8FF 1` in `kitty.conf` is an alternative.

## 简体中文

安装和功能示例见 [README](../README.md)。本参考列出 `fast-tui.json` 接受的全部设置，依据为 [config.ts](../src/ui/config.ts)、[settings-command.ts](../src/ui/settings-command.ts) 和 [icons.ts](../src/ui/icons.ts)。

### 存储与加载

配置位于 Pi 的 agent 目录，默认路径为 `~/.pi/agent/fast-tui.json`；设置 `PI_CODING_AGENT_DIR` 后则使用 `<PI_CODING_AGENT_DIR>/fast-tui.json`。文件不存在且目录可写时，扩展会创建默认配置。

只需填写要修改的值，缺失字段会补入[默认值](#default-json)。布尔开关应使用 JSON 布尔值，不能写成 `"false"` 这样的字符串。已知字段的无效值会回退到默认值；无法读取或解析 JSON 时，会提示警告并使用默认配置。直接编辑文件后，执行 `/reload` 或新开会话加载。如果从 `/fast-tui` 保存失败，新值仍在当前会话生效，并提示检查目录权限和可用空间。

### 设置窗口

| 页面 | 分组 |
| --- | --- |
| 常规 | 扩展、界面、消息与工具、底栏 |
| 外观 | 图标、输入框 |
| 底栏 | 位置、Git、运行环境、用量、其他 |
| 遥测 | 启用（独立总开关）、测量指标 |

Tab/Shift+Tab 切页，↑/↓ 或 Page Up/Page Down 移动，→（或 Enter/Space）切换到下一个值，← 切换到上一个值，Esc/q 关闭。暗色分组标题占一行，但不能选中或修改；滚动位置只统计设置行。

**工具视图**按卡片 → 紧凑 → 原生循环切换。**紧凑显示扩展工具**仅在**工具视图**为紧凑时显示；切换到其他模式后隐藏，但保留开关值。通过**启用**开关安装或移除界面会延迟到窗口关闭后执行。现有配置文件无需迁移。

### 常规选项

| 键 | 默认值 | 可选值与行为 |
| --- | --- | --- |
| `enabled` | `true` | fast-tui 总开关 |
| `header` | `true` | 替换顶栏；关闭后把位置留给 Pi 或其他扩展。终端少于 30 行时显示不含标志的五行紧凑版（版本、模型与思考级别、工作目录、命令） |
| `inlineFooter` | `false` | 将两条主底栏行移入兼容编辑器的边框，扩展状态行保持独立 |
| `copyButtons` | `true` | 全屏模式中代码块和用户消息的复制标签 |
| `settingsLanguage` | `"en"` | `"en"` 或 `"zh"`，控制设置界面的语言 |
| `cursorStyle` | `"block"` | `"block"`、`"bar"` 或 `"underline"`，后两种需要终端支持光标形状控制 |
| `editorShape` | `"rounded"` | `"rounded"`、`"square"`、`"heavy"`、`"double"`、`"ascii"`、`"native"`、`"claude"`、`"rule"` 或 `"opencode"`，见[输入框样式](#输入框样式) |
| `popupMenus` | `true` | 以居中弹窗打开 `/settings`、`/model`（ctrl+l）、`/scoped-models`、思考等级选择器和 `/fast-tui`，见[弹出式菜单](#弹出式菜单) |
| `icons.mode` | `"auto"` | `"auto"`、`"nerd"`、`"unicode"` 或 `"ascii"`，见[图标](#图标)。`"ascii"` 还会让 pi-fast-tui 绘制的所有界面只使用 ASCII 字符；其他模式保留 Unicode 边框与标点 |
| `thinkingPeek.lines` | `1` | `0`（关闭）、`1` 或 `2`；Pi 开启 Hide thinking 且模型输出推理时可见 |
| `toolView.mode` | `"cards"` | `"cards"`、`"compact"` 或 `"native"`，每条工具行创建时确定 |
| `toolView.extensionTools` | `false` | 紧凑模式下包含扩展、MCP 和替换内置工具的扩展 |
| `toolView.exclude` | `[]` | 保持原生渲染的完整工具名，可包含内置工具；仅在 JSON 文件中编辑 |

例如 `"toolView": { "mode": "compact", "extensionTools": true, "exclude": ["edit", "subagent_wait"] }` 会启用紧凑模式，并让这两个工具保留原生卡片。排除列表在所有模式下生效，被排除的工具也不会绘制为卡片。执行 `/reload` 或新开会话，可让已有工具行按新设置重建。

### 输入框样式

`editorShape` 决定输入框的绘制方式。**外观 → 输入框 → 输入框样式**可循环切换，修改会立即作用于当前编辑器，无需重启。

| 值 | 边框 | 说明 |
| --- | --- | --- |
| `"rounded"` | `╭╮│╰╯` | 默认值，与旧版本外观一致 |
| `"square"` | `┌┐│└┘` | |
| `"heavy"` | `┏┓┃┗┛` 与 `━` | |
| `"double"` | `╔╗║╚╝` 与 `═` | |
| `"ascii"` | `+`、`-`、`\|` | 适合不支持制表符的终端或字体 |
| `"native"` | Pi 原生的上下横线 | 无左右边线和额外缩进，文本使用完整宽度 |
| `"claude"` | 上下横线 | 第一行前显示 `❯ `，后续行对齐缩进 |
| `"rule"` | 仅上横线 | 与 `claude` 相同的 `❯ ` 提示符；`↑/↓ N more` 滚动提示都移到上横线 |
| `"opencode"` | `▌` 强调竖条（末端为 `▘`），无横线 | 填充背景面板（主题 `userMessageBg`）：顶部留白行右侧显示工作指示和滚动提示，然后是文本、空行，以及显示模型、提供商和思考等级的信息行；最后一行用面板颜色的 `▀` 半格字符收尾，留出半行内边距，并与底栏隔开半行（主题背景不是 256 色或真彩色时为空行） |

工作指示、光标样式、补全列表和鼠标位置在所有样式下均正常工作。**底栏嵌入输入框**需要下边框，因此 `"rule"` 样式下即使 `inlineFooter` 为 `true`，底栏仍独立显示。`"opencode"` 样式会把底栏第一行放进顶部留白行，第二行替换模型信息行。未知值回退为 `"rounded"`。

### 弹出式菜单

`popupMenus`（**外观 → 输入框 → 弹出式菜单**）让 Pi 的设置、模型（`/model` 与 ctrl+l）、作用域模型和思考等级菜单，以及 `/fast-tui`，以居中弹窗显示在对话上方。弹窗宽度为终端宽度的 70%，限制在 76 到 100 列之间，高度最多为终端高度的 85%。深色主题下背景为黑色，浅色主题下为白色（主题未声明明暗时使用 `userMessageBg`），带主题 `borderAccent` 颜色、由八分之一方块（`▁ ▔ ▕ ▏`）组成的细边框，画在面板外侧未填充的单元格中并紧贴填充区域的边缘，因此边框线与填充之间没有空白带，填充也不会越过边框线（角落单元格留空，只留下八分之一的缺口；`icons.mode` 为 `ascii` 时改为 `+`、`-`、`|` 组成的普通边框），首行左侧为菜单标题、右侧为 `esc`，左右各留两列内边距；终端少于 19 行时省略空白留白行。菜单周围的 Pi 横线会被移除，菜单项、搜索和按键仍由 Pi 处理。输入框在弹窗后方保持挂载。切换该选项后，从下一次打开的菜单开始生效。非布尔值回退为 `true`。无论该选项是否开启，模型选择器都可以用打开它的按键（`app.model.select`，默认 ctrl+l）关闭，效果与 `esc` 相同。

### 底栏选项

下面各键均为 `footerSegments` 内的布尔值。

| 键 | 默认值 | 内容或作用 |
| --- | --- | --- |
| `cwd` | `true` | 当前工作目录，必要时缩短 |
| `hostname` | `false` | 主机短名称，即第一个点之前的部分，配合服务器图标 |
| `sessionName` | `false` | 会话名称，仅在已设置名称时显示 |
| `gitBranch` | `true` | 分支名称；分离 HEAD 时显示 `HEAD` 和短提交哈希 |
| `gitStatus` | `true` | 冲突、删除、修改、重命名、已暂存、未跟踪、stash 和 ahead/behind 数量 |
| `gitCommit` | `false` | 指向分离 HEAD 提交的标签，仅在 `gitBranch` 开启时使用 |
| `runtime` | `true` | 检测到的项目运行环境，以及可获取时的版本号 |
| `context` | `true` | 上下文进度条、百分比和 Token 用量 |
| `contextBar` | `true` | 进度条及其图标；关闭后仅保留百分比和 Token 用量 |
| `tokens` | `true` | 累计输入/输出 Token，以及最新助手回复的缓存命中率 |
| `cost` | `true` | Pi 报告的会话累计费用 |
| `liveTps` | `true` | 工作计时器旁的流式速度估算 |
| `extensionStatuses` | `true` | 独立的 `ctx.ui.setStatus()` 状态行，包括 MCP 状态 |
| `extensionSegments` | `true` | 扩展通过[底栏事件接口](./footer-segments.md)嵌入主信息行的内容 |
| `capitalizeProviderName` | `true` | 将服务商名称首字母大写；关闭后保留原始大小写 |
| `nerdIconSpacing` | `false` | Nerd Font 图标后额外留一格，包括运行环境图标 |

服务商/模型和工作/完成计时器没有独立显示开关，`liveTps` 仅控制速度估算。`extensionSegments` 只控制可见性，隐藏内容仍接收更新，生命周期仍保持可用；它与 `extensionStatuses` 相互独立。

### 遥测选项

下面各键均为 `telemetry` 内的布尔值，默认全部为 `true`。

| 键 | 作用 |
| --- | --- |
| `enabled` | 运行结束通知的总开关 |
| `tps` | 基于服务商用量的每秒输出 Token |
| `ttft` | 首次输出延迟 |
| `duration` | Agent 完整运行耗时 |
| `tokens` | 被统计轮次的助手输入/输出数量 |
| `stalls` | 流式输出停顿，仅检测到时显示 |
| `cost` | 每百万报告 Token 的综合美元费率 |

底栏实时速度使用独立的 `footerSegments.liveTps` 开关。指标定义和限制见[用量与遥测](./implementation.md#用量与遥测)。

### 图标

| `icons.mode` | 选择规则 |
| --- | --- |
| `auto` | stdout 不是 TTY、`TERM=dumb`，或首个已设置的 locale（依次为 `LC_ALL`、`LC_CTYPE`、`LANG`）不是 UTF-8 时使用 ASCII。否则，存在 `SSH_TTY` 或 `SSH_CONNECTION` 时使用 Unicode，本地使用 Nerd Font。未设置 locale 时通过 UTF-8 检查 |
| `nerd` | 始终使用 Nerd Font 字形 |
| `unicode` | 可移植 Unicode 图标，emoji 使用终端自身的回退字体 |
| `ascii` | 纯文本图标 |

使用 `ascii` 时，pi-fast-tui 绘制的所有内容都只使用 ASCII 字符：底栏（令牌数显示为 `i`/`o`，分隔符为 ` | `，省略号为 `...`）、回合遥测、工具卡片与紧凑行（`+`、`-`、`|` 边框，失败用 `x`，旋转指示为 `| / - \`）、弹窗边框（`+`、`-`、`|`）、复制按钮的代码框、顶栏（边框、提示分隔线、由 `#` 组成的标志）、`/fast-tui` 对话框（选中标记 `>`、`-` 分节线，按键提示中的方向键写作 `Up/Down`、`Left/Right`）以及思考预览。切换模式后记录会立即重绘。以下内容不受影响：输入框边框跟随 `editorShape`（需要 ASCII 输入框时请在那里选择 `ascii`）；由 Pi 绘制或由工具返回的内容（模型输出、文件内容、Pi 自身的菜单以及 `Language / 语言` 行）原样显示。

自动检测不会检查已安装字体。图标缺失时，请在终端配置中选中 Nerd Font，或切换到 `unicode`/`ascii`。SSH 客户端终端已配置 Nerd Font 时，可显式选择 `nerd`。

如果较宽的 Nerd Font 图标占用了标签前的间隔，可开启**底栏 → 其他 → Nerd 图标后额外留空**（`footerSegments.nerdIconSpacing`）。普通和内嵌底栏都适用，Unicode/ASCII 图标和紧凑 Git 状态标记不受影响。Kitty 用户也可在 `kitty.conf` 中设置 `narrow_symbols U+E000-U+F8FF 1`。

## Default JSON

The complete default configuration is shared by both language references. Set `settingsLanguage` to `"zh"` for the Chinese settings interface.

以下为两种语言共用的完整默认配置。将 `settingsLanguage` 改为 `"zh"` 即可使用中文设置界面。

```json
{
  "enabled": true,
  "header": true,
  "inlineFooter": false,
  "copyButtons": true,
  "settingsLanguage": "en",
  "cursorStyle": "block",
  "editorShape": "rounded",
  "popupMenus": true,
  "icons": {
    "mode": "auto"
  },
  "footerSegments": {
    "cwd": true,
    "hostname": false,
    "sessionName": false,
    "gitBranch": true,
    "gitStatus": true,
    "gitCommit": false,
    "runtime": true,
    "context": true,
    "contextBar": true,
    "tokens": true,
    "cost": true,
    "liveTps": true,
    "extensionSegments": true,
    "extensionStatuses": true,
    "capitalizeProviderName": true,
    "nerdIconSpacing": false
  },
  "telemetry": {
    "enabled": true,
    "tps": true,
    "ttft": true,
    "duration": true,
    "tokens": true,
    "stalls": true,
    "cost": true
  },
  "thinkingPeek": {
    "lines": 1
  },
  "toolView": {
    "mode": "cards",
    "extensionTools": false,
    "exclude": []
  }
}
```
