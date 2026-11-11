import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "./fixtures/node-test.ts";
import { createEventBus, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, visibleWidth, type Component, type KeybindingsManager, type OverlayOptions, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG, EDITOR_SHAPES, loadConfig, saveConfig, type FastTuiConfig } from "../../src/ui/config.ts";
import { installEditor } from "../../src/ui/editor.ts";
import fastTui, { getPendingUiChange } from "../../src/ui/index.ts";
import { installPopupMenus } from "../../src/ui/popup-menus.ts";
import { nextToolViewMode, registerSettingsCommand } from "../../src/ui/settings-command.ts";
import { preserveEnvironment, temporaryDirectory } from "./fixtures/test-helpers.ts";
import { setCardGlyphMode } from "../../src/cards/symbols.ts";

interface SettingsComponent extends Component {
	handleInput(data: string): void;
}

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

/** Classic inline layout; popup tests opt in with `popupMenus: true`. */
function classicConfig(): FastTuiConfig {
	return { ...structuredClone(DEFAULT_CONFIG), popupMenus: false };
}

async function openSettings(
	initialConfig = classicConfig(),
	onChange?: (config: FastTuiConfig) => void,
): Promise<{
	component: SettingsComponent;
	terminal: { columns: number; rows: number };
	getConfig: () => FastTuiConfig;
	isClosed: () => boolean;
	isOverlayClosed: () => boolean;
	waitForClose: () => Promise<void>;
	press: (key: string, count?: number) => void;
	overlayOptions: () => OverlayOptions | undefined;
}> {
	let customOptions: { overlay?: boolean; overlayOptions?: OverlayOptions | (() => OverlayOptions) } | undefined;
	let commandHandler: ((args: string, ctx: ExtensionContext) => Promise<void> | void) | undefined;
	let component: SettingsComponent | undefined;
	let config = initialConfig;
	let closed = false;
	let overlayClosed = false;

	const pi = {
		registerCommand: (_name: string, options: { handler: typeof commandHandler }) => {
			commandHandler = options.handler;
		},
	} as unknown as ExtensionAPI;

	registerSettingsCommand(pi, {
		getConfig: () => config,
		onConfigChanged: (nextConfig) => {
			config = nextConfig;
			onChange?.(nextConfig);
		},
		onOverlayClosed: () => {
			overlayClosed = true;
		},
	});

	const terminal = { columns: 80, rows: 24 };
	const tui = { terminal, requestRender() {} } as TUI;
	const ctx = {
		hasUI: true,
		mode: "tui",
		ui: {
			custom: (
				factory: (
					tui: TUI,
					theme: Theme,
					keybindings: KeybindingsManager,
					done: (value: void) => void,
				) => Component,
				options?: typeof customOptions,
			) => new Promise<void>((resolve) => {
				customOptions = options;
				component = factory(tui, theme, {} as KeybindingsManager, (_value: void) => {
					closed = true;
					resolve();
				}) as SettingsComponent;
			}),
		},
	} as unknown as ExtensionContext;

	assert.ok(commandHandler);
	const closePromise = Promise.resolve(commandHandler("", ctx));
	assert.ok(component);
	const mounted = component;

	return {
		component,
		terminal,
		getConfig: () => config,
		isClosed: () => closed,
		isOverlayClosed: () => overlayClosed,
		waitForClose: () => closePromise,
		press(key, count = 1) {
			for (let i = 0; i < count; i++) mounted.handleInput(key);
		},
		overlayOptions: () => {
			const options = customOptions?.overlayOptions;
			return typeof options === "function" ? options() : options;
		},
	};
}

/** The selection arrow, not the "←→" in the key hint. */
const SELECTED_ROW = /(?:^|[\s▕])→ /;

function selectedLine(component: SettingsComponent, width = 80): string {
	return component.render(width).find((line) => SELECTED_ROW.test(line)) ?? "";
}

// Configuration persistence.
test("reports whether configuration was saved", (t) => {
	const agentDir = temporaryDirectory(t, "fast-tui-save-");
	preserveEnvironment(t, ["PI_CODING_AGENT_DIR"]);
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const config = structuredClone(DEFAULT_CONFIG);
	config.header = false;
	assert.equal(saveConfig(config), true);
	assert.equal(loadConfig().header, false);
	const configPath = join(agentDir, "fast-tui.json");
	rmSync(configPath);
	mkdirSync(configPath);
	assert.equal(saveConfig(config), false);
});

// Navigation and live settings changes.
test("closes cleanly after enabling or disabling the UI", async () => {
	for (const enabled of [true, false]) {
		const config = classicConfig();
		config.enabled = enabled;
		const settings = await openSettings(config);

		settings.component.handleInput("\r");
		assert.equal(settings.getConfig().enabled, !enabled);
		assert.equal(settings.isClosed(), false);
		assert.equal(settings.isOverlayClosed(), false);

		settings.component.handleInput("q");
		assert.equal(settings.isClosed(), true);
		assert.equal(settings.isOverlayClosed(), false);
		await settings.waitForClose();
		assert.equal(settings.isOverlayClosed(), true);
	}
});

test("leaves fullscreen wheel speed to Pi settings", async () => {
	const settings = await openSettings();
	assert.doesNotMatch(settings.component.render(80).join("\n"), /wheel speed/i);
	assert.equal("fullscreen" in settings.getConfig(), false);
});

test("previews cursor styles from the Appearance tab", async () => {
	const writes: string[] = [];
	let editorInstalls = 0;
	let editorFactory: unknown;
	let hardwareCursor = false;
	const editorTui = {
		terminal: { columns: 80, rows: 24, write: (data: string) => writes.push(data) },
		requestRender() {},
		getShowHardwareCursor: () => hardwareCursor,
		setShowHardwareCursor: (enabled: boolean) => {
			hardwareCursor = enabled;
		},
	} as unknown as TUI;
	const editor = installEditor({} as ExtensionAPI, {
		ui: {
			getEditorComponent: () => editorFactory,
			setEditorComponent: (factory: unknown) => {
				editorFactory = factory;
				editorInstalls++;
				if (typeof factory === "function") {
					factory(editorTui, {
						borderColor: (text: string) => text,
						selectList: {},
					}, { matches: () => false });
				}
			},
		},
	} as unknown as ExtensionContext);
	const settings = await openSettings(undefined, (config) => editor.setCursorStyle(config.cursorStyle));

	settings.component.handleInput("\t");
	settings.component.handleInput("\x1b[B");
	settings.component.handleInput("\r");

	assert.equal(settings.getConfig().cursorStyle, "bar");
	assert.equal(settings.isClosed(), false);
	assert.equal(editorInstalls, 1);
	assert.equal(hardwareCursor, true);
	assert.ok(writes.includes("\x1b[6 q"));

	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().cursorStyle, "underline");
	assert.ok(writes.includes("\x1b[4 q"));

	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().cursorStyle, "block");
	assert.equal(hardwareCursor, false);
	assert.ok(writes.includes("\x1b[0 q"));
	assert.equal(editorInstalls, 1);
	assert.match(selectedLine(settings.component), /Cursor style/);
	assert.match(settings.component.render(80).join("\n"), /\[Appearance\].*Icon mode.*Cursor style/s);

	settings.component.handleInput("q");
	await settings.waitForClose();
	assert.equal(settings.isOverlayClosed(), true);
	editor.cleanup();
});

test("cycles editor shapes from the Appearance tab without remounting the editor", async () => {
	let editorInstalls = 0;
	let editorFactory: unknown;
	let mounted: { render(width: number): string[] } | undefined;
	const editorTui = {
		terminal: { columns: 80, rows: 24, write() {} },
		requestRender() {},
		getShowHardwareCursor: () => false,
		setShowHardwareCursor() {},
	} as unknown as TUI;
	const editor = installEditor({} as ExtensionAPI, {
		ui: {
			getEditorComponent: () => editorFactory,
			setEditorComponent: (factory: unknown) => {
				editorFactory = factory;
				editorInstalls++;
				if (typeof factory === "function") {
					mounted = factory(editorTui, {
						borderColor: (text: string) => text,
						selectList: {},
					}, { matches: () => false });
				}
			},
		},
	} as unknown as ExtensionContext);
	const settings = await openSettings(undefined, (config) => editor.setEditorShape(config.editorShape));
	const topLeft: Record<string, RegExp> = {
		rounded: /^╭/,
		square: /^┌/,
		heavy: /^┏/,
		double: /^╔/,
		ascii: /^\+/,
		native: /^─/,
		claude: /^─/,
		rule: /^─/,
		opencode: /^▌/,
	};

	settings.component.handleInput("\t");
	settings.press("\x1b[B", 2);
	assert.match(selectedLine(settings.component), /Input shape.*Rounded/);
	assert.match(mounted!.render(40)[0]!, topLeft.rounded!);

	for (const shape of [...EDITOR_SHAPES.slice(1), EDITOR_SHAPES[0]]) {
		settings.component.handleInput("\r");
		assert.equal(settings.getConfig().editorShape, shape);
		const lines = mounted!.render(40);
		if (shape === "opencode") assert.equal(lines[0], " ".repeat(40));
		assert.match(lines[shape === "opencode" ? 1 : 0]!, topLeft[shape]!, shape);
		assert.match(selectedLine(settings.component), /Input shape/);
	}
	assert.equal(editorInstalls, 1);
	assert.equal(settings.isClosed(), false);

	settings.component.handleInput("q");
	await settings.waitForClose();
	editor.cleanup();
});

test("toggles popup menus from the Appearance tab and applies it to the next menu", async () => {
	class SettingsSelectorComponent extends Container {}
	const editor = Object.assign(new Container(), { getText: () => "", setText() {}, handleInput() {}, onSubmit() {} });
	const editorContainer = new Container();
	editorContainer.addChild(editor);
	const root = new Container();
	root.addChild(editorContainer);
	let overlays = 0;
	const tui = Object.assign(root, {
		terminal: { columns: 80, rows: 24 },
		showOverlay: () => {
			overlays++;
			return { hide() {} };
		},
	}) as unknown as TUI;
	let current = { ...classicConfig(), popupMenus: true };
	const popups = installPopupMenus({ getTui: () => tui, getTheme: () => ({ fg: (_c: string, t: string) => t, bold: (t: string) => t }) as unknown as Theme, isEnabled: () => current.popupMenus });
	const openMenu = () => {
		const menu = new SettingsSelectorComponent();
		editorContainer.clear();
		editorContainer.addChild(menu);
		const inline = editorContainer.children.includes(menu);
		editorContainer.clear();
		editorContainer.addChild(editor);
		return inline;
	};
	assert.equal(openMenu(), false);
	const settings = await openSettings(current, (config) => {
		current = config;
	});
	settings.press("\t");
	// Icon mode → Cursor style → Input shape → Popup menus
	settings.press("\x1b[B", 3);
	assert.match(selectedLine(settings.component), /Popup menus.*On/);
	settings.press("\r");
	assert.equal(current.popupMenus, false);
	assert.match(selectedLine(settings.component), /Popup menus.*Off/);
	assert.equal(openMenu(), true);
	settings.press("\r");
	assert.equal(current.popupMenus, true);
	assert.equal(openMenu(), false);
	assert.equal(overlays, 2);
	popups.cleanup();
});

test("labels popup menus in Chinese", async () => {
	const config = classicConfig();
	config.settingsLanguage = "zh";
	const settings = await openSettings(config);
	settings.press("\t");
	settings.press("\x1b[B", 3);
	assert.match(selectedLine(settings.component), /弹出式菜单.*关闭/);
});

test("labels editor shapes in Chinese", async () => {
	const config = classicConfig();
	config.settingsLanguage = "zh";
	config.editorShape = "rule";
	const settings = await openSettings(config);

	settings.component.handleInput("\t");
	settings.press("\x1b[B", 2);
	assert.match(selectedLine(settings.component), /输入框样式.*顶部横线/);
	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().editorShape, "opencode");
	assert.match(selectedLine(settings.component), /输入框样式.*OpenCode/);
	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().editorShape, "rounded");
	assert.match(selectedLine(settings.component), /输入框样式.*圆角/);
});

test("reconciles enabled changes with the installed UI", () => {
	assert.equal(getPendingUiChange(true, false), "install");
	assert.equal(getPendingUiChange(false, true), "uninstall");
	assert.equal(getPendingUiChange(true, true), undefined);
	assert.equal(getPendingUiChange(false, false), undefined);
});

test("keeps the changed setting selected", async () => {
	const settings = await openSettings();

	settings.component.handleInput("\t");
	settings.component.handleInput("\t");
	settings.component.handleInput("\x1b[B");
	settings.component.handleInput("\x1b[B");
	settings.component.handleInput("\x1b[B");
	assert.match(selectedLine(settings.component), /Git branch/);

	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().footerSegments.gitBranch, false);
	assert.match(selectedLine(settings.component), /Git branch/);
});

test("remembers the selection for each tab", async () => {
	const settings = await openSettings();

	settings.component.handleInput("\t");
	settings.component.handleInput("\t");
	settings.component.handleInput("\x1b[B");
	settings.component.handleInput("\x1b[B");
	settings.component.handleInput("\x1b[B");
	settings.component.handleInput("\t");
	settings.component.handleInput("\t");
	settings.component.handleInput("\t");
	settings.component.handleInput("\t");

	assert.match(selectedLine(settings.component), /Git branch/);
});

test("toggles live TPS from the Footer tab", async () => {
	const settings = await openSettings();

	settings.press("\t", 2);
	settings.press("\x1b[B", 9);
	assert.match(selectedLine(settings.component), /Live TPS/);

	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().footerSegments.liveTps, false);
	assert.equal(settings.getConfig().telemetry.tps, true);
});

test("configures telemetry from its own tab", async () => {
	const settings = await openSettings();

	settings.press("\t", 3);
	assert.match(selectedLine(settings.component), /Enabled/);

	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().telemetry.enabled, false);
	settings.component.handleInput("\x1b[B");
	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().telemetry.tps, false);
});

test("supports localized settings and keyboard shortcuts", async () => {
	const settings = await openSettings();
	assert.match(settings.component.render(80).join("\n"), /Fast TUI Settings.*General.*Language/s);

	settings.press("\x1b[B", 2);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().settingsLanguage, "zh");
	assert.match(settings.component.render(80).join("\n"), /Fast TUI 设置.*常规.*语言.*简体中文/s);
	assert.match(selectedLine(settings.component), /语言/);

	const reopened = await openSettings(structuredClone(settings.getConfig()));
	assert.match(reopened.component.render(80).join("\n"), /Fast TUI 设置.*简体中文/s);

	reopened.press("\x1b[B", 2);
	reopened.component.handleInput("\t");
	assert.match(reopened.component.render(80).join("\n"), /\[外观\].*图标模式.*光标样式/s);
	reopened.component.handleInput("\x1b[Z");
	assert.match(selectedLine(reopened.component), /语言/);
	reopened.component.handleInput("q");
	assert.equal(reopened.isClosed(), true);
});

test("configures inline footer from General settings", async () => {
	const settings = await openSettings();
	// Headers are skipped: Enabled → Header → Language → Thinking peek → Copy buttons → Tool view → Footer in editor border.
	settings.press("\x1b[B", 6);
	assert.match(selectedLine(settings.component), /Footer in editor border/);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().inlineFooter, true);
});

test("toggles copy buttons from General settings", async () => {
	const settings = await openSettings();
	assert.equal(settings.getConfig().copyButtons, true);
	// Enabled → Header → Language → Thinking peek → Copy buttons
	settings.press("\x1b[B", 4);
	assert.match(selectedLine(settings.component), /Copy buttons/);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().copyButtons, false);
});

test("tool view defaults to Cards and cycles Cards → Compact → Native", async () => {
	assert.equal(nextToolViewMode("cards"), "compact");
	assert.equal(nextToolViewMode("compact"), "native");
	assert.equal(nextToolViewMode("native"), "cards");
	const settings = await openSettings();
	// Enabled → Header → Language → Thinking peek → Copy buttons → Tool view
	for (let i = 0; i < 5; i++) settings.component.handleInput("\x1b[B");
	assert.match(selectedLine(settings.component), /Tool view\s+Cards/);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().toolView.mode, "compact");
	assert.match(selectedLine(settings.component), /Tool view\s+Compact/);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().toolView.mode, "native");
	assert.match(selectedLine(settings.component), /Tool view\s+Native/);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().toolView.mode, "cards");
});

test("tool view shows the Cards option in Chinese", async () => {
	const config = classicConfig();
	config.settingsLanguage = "zh";
	const settings = await openSettings(config);
	for (let i = 0; i < 5; i++) settings.component.handleInput("\x1b[B");
	assert.match(selectedLine(settings.component), /工具视图\s+卡片/);
});

test("toggling tool view settings keeps the other tool view options", async () => {
	const config = classicConfig();
	config.toolView.exclude = ["subagent_wait"];
	const settings = await openSettings(config);
	// Enabled → Header → Language → Thinking peek → Copy buttons → Tool view
	for (let i = 0; i < 5; i++) settings.component.handleInput("\x1b[B");
	assert.match(selectedLine(settings.component), /Tool view/);
	settings.component.handleInput(" ");
	settings.component.handleInput("\x1b[B");
	assert.match(selectedLine(settings.component), /Compact extension tools/);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().toolView.extensionTools, true);
	assert.deepEqual(settings.getConfig().toolView, { mode: "compact", extensionTools: true, exclude: ["subagent_wait"] });
});

test("toggles the header without resetting a disabled slot and warns when persistence fails", async (t) => {
	const agentDir = temporaryDirectory(t, "pi-fast-tui-");
	preserveEnvironment(t, ["PI_CODING_AGENT_DIR"]);
	process.env.PI_CODING_AGENT_DIR = agentDir;
	// Pinned to Unicode: under the non-TTY test runner `auto` resolves to ASCII and would switch the card glyph set.
	writeFileSync(join(agentDir, "fast-tui.json"), JSON.stringify({ ...DEFAULT_CONFIG, header: false, icons: { ...DEFAULT_CONFIG.icons, mode: "unicode" } }));
	t.after(() => setCardGlyphMode("unicode"));
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
	let command: ((args: string, ctx: ExtensionContext) => unknown) | undefined;
	let settings: SettingsComponent | undefined;
	const headers: unknown[] = [];
	let editorFactory: unknown;
	const notifications: Array<{ message: string; level: string }> = [];
	const pi = {
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => handlers.set(event, handler),
		events: createEventBus(),
		registerCommand: (_name: string, options: { handler: typeof command }) => (command = options.handler),
		registerToolRenderer() {},
		registerMarkdownTransformer() {},
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: true,
		mode: "tui",
		// Git/runtime probes spawn in cwd; keeping them out of agentDir lets Windows delete it.
		cwd: process.cwd(),
		ui: {
			setFooter() {},
			getEditorComponent: () => editorFactory,
			setEditorComponent(factory: unknown) { editorFactory = factory; },
			setHeader: (factory: unknown) => headers.push(factory),
			notify: (message: string, level: string) => notifications.push({ message, level }),
			custom: (factory: (tui: TUI, theme: Theme) => SettingsComponent) =>
				void (settings = factory({ terminal: { columns: 80, rows: 24 }, requestRender() {} } as TUI, theme)),
		},
	} as unknown as ExtensionContext;
	fastTui(pi);
	await handlers.get("session_start")?.({ type: "session_start" }, ctx);
	assert.deepEqual(headers, [], "a disabled header must not reset another extension's header");
	void command?.("", ctx);
	assert.ok(settings);
	settings.handleInput("\x1b[B");
	assert.match(selectedLine(settings), /Override header/);
	settings.handleInput(" ");
	assert.equal(notifications.length, 0);
	rmSync(join(agentDir, "fast-tui.json"));
	mkdirSync(join(agentDir, "fast-tui.json"));
	settings.handleInput(" ");
	assert.equal(notifications.length, 1);
	assert.equal(notifications[0]?.level, "warning");
	assert.match(notifications[0]?.message ?? "", /apply for this session but could not be saved/);
	assert.equal(typeof headers[0], "function");
	assert.deepEqual(headers.slice(1), [undefined], "disabling restores Pi's built-in header once");
});

test("configures the hostname footer segment", async () => {
	const settings = await openSettings();
	settings.press("\t", 2);
	settings.component.handleInput("\x1b[B");
	assert.match(selectedLine(settings.component), /Hostname/);

	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().footerSegments.hostname, true);
	assert.match(selectedLine(settings.component), /Hostname/);
});

test("configures the extension status line with Space", async () => {
	const settings = await openSettings();
	settings.press("\t", 2);
	for (let i = 0; i < 12; i++) settings.component.handleInput("\x1b[B");
	assert.match(selectedLine(settings.component), /Extension status line/);

	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().footerSegments.extensionStatuses, false);
	assert.match(selectedLine(settings.component), /Extension status line/);
});

test("Left and Right change the selected value in both directions", async () => {
	const settings = await openSettings();
	settings.press("\t");
	settings.press("\x1b[B", 2);
	assert.match(selectedLine(settings.component), /Input shape.*Rounded/);
	settings.press("\x1b[C");
	assert.equal(settings.getConfig().editorShape, "square");
	assert.match(selectedLine(settings.component), /Input shape.*Square/);
	settings.press("\x1b[D", 2);
	assert.equal(settings.getConfig().editorShape, "opencode");
	assert.match(selectedLine(settings.component), /Input shape.*OpenCode/);
	assert.match(settings.component.render(80).join("\n"), /\[Appearance\]/);
});

test("Right then Left restores every multi-value row and both toggle a boolean row", async () => {
	// [tab presses, down presses, read value]
	const rows: [number, number, (config: FastTuiConfig) => unknown][] = [
		[1, 0, (config) => config.icons.mode],
		[1, 1, (config) => config.cursorStyle],
		[1, 2, (config) => config.editorShape],
		[0, 5, (config) => config.toolView.mode],
		[0, 3, (config) => config.thinkingPeek.lines],
		[0, 2, (config) => config.settingsLanguage],
	];
	for (const [tabs, downs, read] of rows) {
		const settings = await openSettings();
		settings.press("\t", tabs);
		settings.press("\x1b[B", downs);
		const start = read(settings.getConfig());
		settings.press("\x1b[C");
		assert.notEqual(read(settings.getConfig()), start);
		settings.press("\x1b[D");
		assert.equal(read(settings.getConfig()), start);
	}
	const settings = await openSettings();
	settings.press("\x1b[B");
	assert.match(selectedLine(settings.component), /Override header/);
	settings.press("\x1b[C");
	assert.equal(settings.getConfig().header, false);
	settings.press("\x1b[D");
	assert.equal(settings.getConfig().header, true);
	assert.match(selectedLine(settings.component), /Override header/);
	assert.match(settings.component.render(80).join("\n"), /\[General\]/);
});

test("Tab and Shift+Tab switch tabs and wrap at both ends", async () => {
	const settings = await openSettings();
	const active = () => /\[(\w+)\]/.exec(settings.component.render(80).join("\n"))?.[1];
	assert.equal(active(), "General");
	settings.press("\x1b[Z");
	assert.equal(active(), "Telemetry");
	settings.press("\t");
	assert.equal(active(), "General");
	settings.press("\t", 3);
	assert.equal(active(), "Telemetry");
	settings.press("\t");
	assert.equal(active(), "General");
});

test("hints name Tab/Shift+Tab for tabs and Left/Right for values", async () => {
	for (const language of ["en", "zh"] as const) {
		const config = classicConfig();
		config.settingsLanguage = language;
		const settings = await openSettings(config);
		settings.terminal.columns = 200;
		settings.terminal.rows = 50;
		const output = settings.component.render(200).join("\n");
		assert.match(output, /Tab\/Shift\+Tab[:：]/);
		assert.match(output, /←\/→\/Enter\/Space[:：]/);
	}
});

test("shows the widest key hint that fits on one row", async () => {
	const cases: [language: "en" | "zh", columns: number, inner: number, hint: RegExp | undefined][] = [
		["en", 160, 94, /Tab\/Shift\+Tab: tabs · ↑\/↓: move · ←\/→\/Enter\/Space: change · Esc\/q: close/],
		["en", 80, 70, /Tab tabs · ↑↓ move · ←→ change · Esc close/],
		["en", 40, 34, undefined],
		["zh", 60, 54, /Tab 切页 · ↑↓ 移动 · ←→ 更改 · Esc 关闭/],
	];
	for (const [language, columns, inner, hint] of cases) {
		const settings = await openSettings({ ...classicConfig(), popupMenus: true, settingsLanguage: language });
		settings.terminal.columns = columns;
		settings.terminal.rows = 50;
		const width = settings.overlayOptions()?.width as number;
		assert.equal(width - 6, inner);
		const lines = settings.component.render(width).map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));
		const hintRows = lines.filter((line) => /Tab.*Esc/.test(line));
		if (hint === undefined) {
			assert.equal(hintRows.length, 0, lines.join("\n"));
		} else {
			assert.equal(hintRows.length, 1, lines.join("\n"));
			assert.match(hintRows[0]!, hint);
		}
	}
});

test("counts only settings in the scroll indicator and spaces the section rule from its label", async () => {
	const settings = await openSettings();
	settings.terminal.rows = 12;
	settings.press("\t", 2);
	const counter = () => settings.component.render(80).map((line) => line.trim()).find((line) => /^\(\d+\/\d+\)$/.test(line));
	assert.equal(counter(), "(1/16)");
	settings.press("\x1b[B", 15);
	assert.match(selectedLine(settings.component), /Extra space after Nerd icons/);
	assert.equal(counter(), "(16/16)");
	settings.press("\x1b[Z", 2);
	const lines = settings.component.render(80);
	const header = lines.find((line) => line.includes("Extension") && line.includes("──"))!;
	assert.match(header, /── Extension ─+/);
	for (const line of lines) assert.ok(visibleWidth(line) <= 80);
});

test("labels the language row in both languages", async () => {
	for (const language of ["en", "zh"] as const) {
		const settings = await openSettings({ ...classicConfig(), popupMenus: true, settingsLanguage: language });
		settings.terminal.columns = 60;
		settings.press("\x1b[B", 2);
		const line = selectedLine(settings.component, 60);
		assert.match(line, /Language \/ 语言: (English|简体中文)/);
	}
});

test("keeps one height and the tab bar row across tabs", async () => {
	const strip = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");
	for (const popupMenus of [true, false]) {
		for (const [columns, rows] of [[200, 50], [80, 24]] as const) {
			const settings = await openSettings({ ...classicConfig(), popupMenus });
			settings.terminal.columns = columns;
			settings.terminal.rows = rows;
			const width = popupMenus ? settings.overlayOptions()?.width as number : 80;
			const heights = new Set<number>();
			const tabRows = new Set<number>();
			for (let tab = 0; tab < 4; tab++) {
				const lines = settings.component.render(width).map(strip);
				heights.add(lines.length);
				tabRows.add(lines.findIndex((line) => line.includes("[")));
				settings.press("\t");
			}
			const label = `${popupMenus ? "popup" : "classic"} ${columns}x${rows}`;
			assert.equal(heights.size, 1, `${label}: ${[...heights].join(", ")}`);
			assert.equal(tabRows.size, 1, label);
		}
	}
});

test("pads a short tab with blank rows inside the popup that select nothing", async () => {
	const settings = await openSettings({ ...classicConfig(), popupMenus: true });
	settings.terminal.columns = 200;
	settings.terminal.rows = 50;
	const width = settings.overlayOptions()?.width as number;
	settings.press("\t", 3);
	const lines = settings.component.render(width).map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));
	const last = lines.findLastIndex((line) => /Price per 1M tokens/.test(line));
	const padding = lines.slice(last + 1, -1);
	assert.ok(padding.length > 2, lines.join("\n"));
	for (const line of padding) assert.match(line, /^▕ +▏$/);
	const before = structuredClone(settings.getConfig());
	const component = settings.component as SettingsComponent & { handleMouse(event: TuiMouseEvent): unknown };
	const click = (y: number) => {
		for (const type of ["press", "click"] as const) {
			component.handleMouse({ type, button: "left", x: 10, y, screenX: 10, screenY: y, width, height: lines.length, shift: false, alt: false, ctrl: false } as TuiMouseEvent);
		}
	};
	click(last + 2);
	assert.deepEqual(settings.getConfig(), before);
	click(last);
	assert.equal(settings.getConfig().telemetry.cost, !before.telemetry.cost);
});

// Width, height, and localization.
test("keeps localized settings and values within narrow widths", async () => {
	const config = classicConfig();
	config.settingsLanguage = "zh";
	const settings = await openSettings(config);

	for (const width of [24, 36, 48]) {
		const lines = settings.component.render(width);
		for (const line of lines) {
			assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}: ${line}`);
		}
		const output = lines.join("\n");
		assert.match(output, /开启/);
		settings.press("\x1b[B", 2);
		assert.match(selectedLine(settings.component, width), /简体中文/);
		settings.press("\x1b[A", 2);
	}
});

test("keeps every Footer selection visible in short terminals", async () => {
	for (const language of ["en", "zh"] as const) {
		for (const width of [24, 36, 48, 80]) {
			const config = classicConfig();
			config.settingsLanguage = language;
			const settings = await openSettings(config);
			settings.terminal.columns = width;
			settings.terminal.rows = 12;
			settings.press("\t", 2);
			for (let i = 0; i < 16; i++) {
				const lines = settings.component.render(width);
				assert.ok(lines.length <= 12, `${language} ${width}x12: ${lines.length} rows`);
				assert.ok(lines.slice(0, 12).some((line) => SELECTED_ROW.test(line)));
				for (const line of lines) assert.ok(visibleWidth(line) <= width);
				settings.component.handleInput("\x1b[B");
			}
		}
	}
});

test("opens /fast-tui as a centered popup panel when popup menus are on", async () => {
	const settings = await openSettings({ ...classicConfig(), popupMenus: true });
	const options = settings.overlayOptions();
	assert.equal(options?.anchor, "center");
	assert.equal(options?.width, 76);
	assert.equal(options?.maxHeight, "85%");
	settings.terminal.columns = 200;
	assert.equal(settings.overlayOptions()?.width, 100);
	settings.terminal.columns = 80;
	const lines = settings.component.render(60).map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));
	assert.match(lines[0]!, /^ ▁+ $/);
	assert.match(lines[2]!, /^▕ {2}Fast TUI Settings +esc {2}▏$/);
	assert.match(lines.at(-1)!, /^ ▔+ $/);
	assert.equal(lines.filter((line) => line.includes("Fast TUI Settings")).length, 1);
	for (const line of lines) assert.equal(visibleWidth(line), 60);
	settings.press("\t");
	assert.ok(settings.component.render(60).some((line) => SELECTED_ROW.test(line)));
	settings.press("\x1b");
	assert.equal(settings.isClosed(), true);
});

test("keeps the popup within short terminals with the selection visible", async () => {
	for (const width of [24, 48, 80]) {
		const settings = await openSettings({ ...classicConfig(), popupMenus: true });
		settings.terminal.columns = width;
		settings.terminal.rows = 12;
		settings.press("\t", 2);
		for (let i = 0; i < 16; i++) {
			const lines = settings.component.render(width);
			assert.ok(lines.length <= 12, `${width}x12: ${lines.length} rows`);
			assert.ok(lines.some((line) => SELECTED_ROW.test(line)), `${width}x12 step ${i}`);
			settings.component.handleInput("\x1b[B");
		}
	}
});

test("keeps the classic /fast-tui overlay when popup menus are off", async () => {
	const settings = await openSettings();
	assert.equal(settings.overlayOptions(), undefined);
	assert.doesNotMatch(settings.component.render(80)[0]!, /▁/);
});

test("relayouts on height and width changes without losing the selection", async () => {
	const settings = await openSettings();
	settings.press("\t", 2);
	settings.press("\x1b[B", 14);
	assert.match(selectedLine(settings.component), /Capitalize provider name/);

	for (const [width, rows] of [[80, 12], [80, 24], [48, 12], [24, 12], [36, 12], [80, 24]] as const) {
		settings.terminal.columns = width;
		settings.terminal.rows = rows;
		const lines = settings.component.render(width);
		assert.ok(lines.length <= rows, `${width}x${rows}: ${lines.length} rows`);
		assert.match(lines.join("\n"), /→ .*On/);
	}
	assert.match(selectedLine(settings.component), /Capitalize provider name/);
	settings.component.handleInput(" ");
	assert.equal(settings.getConfig().footerSegments.capitalizeProviderName, false);
});

test("preserves long Footer labels' current values at narrow widths", async () => {
	for (const language of ["en", "zh"] as const) {
		const config = classicConfig();
		config.settingsLanguage = language;
		const settings = await openSettings(config);
		settings.press("\t", 2);
		settings.press("\x1b[B", 12);
		for (const id of ["extensionStatuses", "extensionSegments", "capitalizeProviderName", "nerdIconSpacing"] as const) {
			for (const toggle of [false, true]) {
				if (toggle) settings.component.handleInput(" ");
				const enabled = settings.getConfig().footerSegments[id];
				const value = language === "en" ? (enabled ? "On" : "Off") : (enabled ? "开启" : "关闭");
				for (const width of [24, 36, 48, 60]) {
					const line = selectedLine(settings.component, width);
					assert.ok(line.trimEnd().endsWith(`: ${value}`), line);
					assert.ok(visibleWidth(line) <= width);
				}
			}
			settings.component.handleInput("\x1b[B");
		}
	}
});

test("normalizes invalid settings values", (t) => {
	const agentDir = temporaryDirectory(t, "pi-fast-tui-");
	preserveEnvironment(t, ["PI_CODING_AGENT_DIR"]);
	process.env.PI_CODING_AGENT_DIR = agentDir;
	writeFileSync(join(agentDir, "fast-tui.json"), JSON.stringify({
		settingsLanguage: "de",
		cursorStyle: "invalid",
		editorShape: "band",
		header: "no",
		inlineFooter: "yes",
		copyButtons: "no",
		popupMenus: "off",
		thinkingPeek: { lines: 9 },
		toolView: { mode: "hidden", extensionTools: "yes", exclude: ["keep", 1, null] },
		fullscreen: { wheelScrollLines: 10 },
	}), "utf8");
	const loaded = loadConfig();
	assert.equal(loaded.settingsLanguage, "en");
	assert.equal(loaded.cursorStyle, "block");
	assert.equal(loaded.editorShape, "rounded");
	assert.equal(loaded.header, true);
	assert.equal(loaded.inlineFooter, false);
	assert.equal(loaded.copyButtons, true);
	assert.equal(loaded.popupMenus, true);
	assert.equal(loaded.thinkingPeek.lines, 1);
	assert.deepEqual(loaded.toolView, { mode: "cards", extensionTools: false, exclude: ["keep"] });
	assert.equal("fullscreen" in loaded, true);
});

test("loads valid editor shapes and defaults a missing one", (t) => {
	const agentDir = temporaryDirectory(t, "pi-fast-tui-");
	preserveEnvironment(t, ["PI_CODING_AGENT_DIR"]);
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const path = join(agentDir, "fast-tui.json");
	for (const shape of EDITOR_SHAPES) {
		writeFileSync(path, JSON.stringify({ editorShape: shape }), "utf8");
		assert.equal(loadConfig().editorShape, shape);
	}
	writeFileSync(path, JSON.stringify({ cursorStyle: "bar" }), "utf8");
	assert.equal(loadConfig().editorShape, "rounded");
});

test("loads popup menus and defaults a missing value to on", (t) => {
	const agentDir = temporaryDirectory(t, "pi-fast-tui-");
	preserveEnvironment(t, ["PI_CODING_AGENT_DIR"]);
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const path = join(agentDir, "fast-tui.json");
	writeFileSync(path, JSON.stringify({ popupMenus: false }), "utf8");
	assert.equal(loadConfig().popupMenus, false);
	writeFileSync(path, JSON.stringify({ cursorStyle: "bar" }), "utf8");
	assert.equal(loadConfig().popupMenus, true);
});

test("cycles the thinking peek line count from General settings", async () => {
	const config = classicConfig();
	const settings = await openSettings(config);
	// Enabled → Header → Language → Thinking peek
	settings.press("\x1b[B", 3);
	assert.match(selectedLine(settings.component), /Thinking peek/);
	assert.match(selectedLine(settings.component), /1 line/);
	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().thinkingPeek.lines, 2);
	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().thinkingPeek.lines, 0);
	settings.component.handleInput("\r");
	assert.equal(settings.getConfig().thinkingPeek.lines, 1);
	settings.component.handleInput("q");
});

test("the ASCII glyph set draws every English tab in ASCII, except the language row", async (t) => {
	setCardGlyphMode("ascii");
	t.after(() => setCardGlyphMode("unicode"));
	const settings = await openSettings({ ...classicConfig(), icons: { ...DEFAULT_CONFIG.icons, mode: "ascii" } });
	for (let tab = 0; tab < 4; tab++) {
		for (const width of [80, 50]) {
			const lines = settings.component.render(width);
			assert.ok(lines.some((line) => /^\s*> /.test(line)), "the selected row is marked with >");
			for (const line of lines.filter((row) => !row.includes("Language"))) assert.match(line, /^[\x00-\x7F]*$/, line);
		}
		settings.press("\t");
	}
	const hint = settings.component.render(120).join("\n");
	assert.match(hint, /Up\/Down: move \| Left\/Right\/Enter\/Space: change/);
	assert.match(settings.component.render(60).join("\n"), /Tab tabs \| Up\/Dn move \| Lt\/Rt change \| Esc close/);
	assert.match(hint, /  -- \S.* -+\s*$/m, "section rules are drawn with -");
});
