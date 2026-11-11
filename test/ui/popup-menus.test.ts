import {
	Container,
	getKeybindings,
	KeybindingsManager,
	setKeybindings,
	TUI_KEYBINDINGS,
	type Component,
	type OverlayHandle,
	type OverlayOptions,
	type TUI,
} from "@earendil-works/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindMenuToggleKey, installPopupMenus, popupBackground, popupMenuTitle, popupPanelOptions, popupWidth } from "../../src/ui/popup-menus.ts";
import { PopupPanel } from "../../src/ui/popup-panel.ts";

class FakeEditor implements Component {
	onSubmit = () => {};
	getText() { return ""; }
	setText() {}
	handleInput() {}
	render(width: number) { return ["─".repeat(width), "", "─".repeat(width)]; }
	invalidate() {}
}

class SettingsSelectorComponent extends Container {}
class ThinkingSelectorComponent extends Container {}
class SessionSelectorComponent extends Container {}

/** Mirrors Pi's ModelSelectorComponent: typed keys go to its search, escape cancels. */
class ModelSelectorComponent extends Container {
	typed: string[] = [];
	disposed = 0;
	constructor(private onCancelCallback: () => void) { super(); }
	handleInput(data: string) {
		if (data === "\x1b") {
			this.dispose();
			this.onCancelCallback();
			return;
		}
		this.typed.push(data);
	}
	dispose() { this.disposed += 1; }
}

const CTRL_L = "\x0c";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	getBgAnsi: () => "",
};

function setup(enabled = true) {
	const editor = new FakeEditor();
	const editorContainer = new Container();
	editorContainer.addChild(editor);
	const root = new Container();
	root.addChild(new Container());
	root.addChild(editorContainer);
	const overlays: Array<{ component: Component; options?: OverlayOptions; hidden: boolean }> = [];
	const tui = Object.assign(root, {
		terminal: { rows: 40, columns: 120 },
		showOverlay: vi.fn((component: Component, options?: OverlayOptions): OverlayHandle => {
			const entry = { component, options, hidden: false };
			overlays.push(entry);
			return { hide: () => { entry.hidden = true; } } as unknown as OverlayHandle;
		}),
	}) as unknown as TUI;
	let on = enabled;
	const popups = installPopupMenus({ getTui: () => tui, getTheme: () => theme as never, isEnabled: () => on });
	// Pi's showSelector: swap the editor for the menu, then back on done().
	const open = (menu: Component) => { editorContainer.clear(); editorContainer.addChild(menu); };
	const close = () => { editorContainer.clear(); editorContainer.addChild(editor); };
	return { editor, editorContainer, tui, overlays, popups, open, close, setEnabled: (value: boolean) => { on = value; } };
}

describe("popup menus", () => {
	it("names the Pi menus that become popups", () => {
		expect(popupMenuTitle(new SettingsSelectorComponent())).toBe("Settings");
		expect(popupMenuTitle(new ThinkingSelectorComponent())).toBe("Thinking Level");
		expect(popupMenuTitle(new SessionSelectorComponent())).toBeUndefined();
		expect(popupMenuTitle(undefined)).toBeUndefined();
	});

	it("moves a target menu into a centered non-capturing overlay and keeps the editor mounted", () => {
		const { editor, editorContainer, overlays, open } = setup();
		const menu = new SettingsSelectorComponent();
		open(menu);
		expect(editorContainer.children).toEqual([editor]);
		expect(overlays).toHaveLength(1);
		const panel = overlays[0]!.component as PopupPanel;
		expect(panel).toBeInstanceOf(PopupPanel);
		expect(panel.content).toBe(menu);
		expect(overlays[0]!.options).toMatchObject({ anchor: "center", nonCapturing: true });
	});

	it("hides the popup when Pi closes the menu", () => {
		const { editor, editorContainer, overlays, open, close } = setup();
		open(new ThinkingSelectorComponent());
		close();
		expect(overlays[0]!.hidden).toBe(true);
		expect(editorContainer.children).toEqual([editor]);
	});

	it("leaves other menus and disabled popups inline", () => {
		const { editorContainer, overlays, open, close, setEnabled } = setup();
		const other = new SessionSelectorComponent();
		open(other);
		expect(editorContainer.children).toEqual([other]);
		close();
		setEnabled(false);
		const settings = new SettingsSelectorComponent();
		open(settings);
		expect(editorContainer.children).toEqual([settings]);
		expect(overlays).toHaveLength(0);
	});

	it("restores the container on cleanup", () => {
		const { editorContainer, overlays, popups, open } = setup();
		popups.cleanup();
		expect(Object.hasOwn(editorContainer, "addChild")).toBe(false);
		expect(Object.hasOwn(editorContainer, "clear")).toBe(false);
		const settings = new SettingsSelectorComponent();
		open(settings);
		expect(editorContainer.children).toEqual([settings]);
		expect(overlays).toHaveLength(0);
	});

	it("falls back to the inline menu when the TUI has no overlays", () => {
		const { editorContainer, tui, open } = setup();
		(tui as { showOverlay?: unknown }).showOverlay = undefined;
		const settings = new SettingsSelectorComponent();
		open(settings);
		expect(editorContainer.children).toEqual([settings]);
	});
});

describe("popup panel title", () => {
	it("drops the menu's own title row when it repeats the panel title", () => {
		const menu = new Container();
		menu.render = () => ["─".repeat(40), "", "Thinking Level", "", "low", "─".repeat(40)];
		const panel = new PopupPanel(menu, { title: "Thinking Level", background: () => "", border: (text) => text });
		const rows = panel.render(40).map((row) => row.replace(/\x1b\[[0-9;]*m/g, ""));
		expect(rows.filter((row) => row.includes("Thinking Level"))).toHaveLength(1);
		expect(rows[4]).toContain("low");
	});
});

describe("menu toggle keys", () => {
	let previous: KeybindingsManager;
	beforeEach(() => {
		previous = getKeybindings();
		setKeybindings(new KeybindingsManager({
			...TUI_KEYBINDINGS,
			"app.model.select": { defaultKeys: "ctrl+l", description: "Open model selector" },
		}));
	});
	afterEach(() => setKeybindings(previous));

	it("closes the model selector on the key that opened it", () => {
		const { editor, editorContainer, overlays, open, close } = setup();
		const menu = new ModelSelectorComponent(() => close());
		open(menu);
		menu.handleInput("a");
		menu.handleInput(CTRL_L);
		expect(menu.typed).toEqual(["a"]);
		expect(menu.disposed).toBe(1);
		expect(overlays[0]!.hidden).toBe(true);
		expect(editorContainer.children).toEqual([editor]);
	});

	it("closes the inline model selector too when popups are off", () => {
		const { editor, editorContainer, overlays, open, close } = setup(false);
		const menu = new ModelSelectorComponent(() => close());
		open(menu);
		expect(editorContainer.children).toEqual([menu]);
		menu.handleInput(CTRL_L);
		expect(overlays).toHaveLength(0);
		expect(editorContainer.children).toEqual([editor]);
	});

	it("follows a rebound model selector key", () => {
		setKeybindings(new KeybindingsManager(
			{ ...TUI_KEYBINDINGS, "app.model.select": { defaultKeys: "ctrl+l", description: "Open model selector" } },
			{ "app.model.select": "ctrl+o" },
		));
		const onCancel = vi.fn();
		const menu = new ModelSelectorComponent(onCancel);
		bindMenuToggleKey(menu);
		menu.handleInput(CTRL_L);
		expect(onCancel).not.toHaveBeenCalled();
		expect(menu.typed).toEqual([CTRL_L]);
		menu.handleInput("\x0f");
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("leaves menus without a toggle key alone", () => {
		const menu = Object.assign(new SettingsSelectorComponent(), { handleInput: () => {}, onCancel: () => {} });
		const handleInput = menu.handleInput;
		bindMenuToggleKey(menu);
		expect(menu.handleInput).toBe(handleInput);
	});
});

describe("popup colors", () => {
	const colorTheme = (appearance: unknown, mode = "truecolor") => ({
		appearance,
		getColorMode: () => mode,
		getBgAnsi: (token: string) => `<bg:${token}>`,
		fg: (token: string, text: string) => `<${token}>${text}`,
		bold: (text: string) => text,
	}) as unknown as Parameters<typeof popupBackground>[0];
	const tui = { terminal: { rows: 40, columns: 120 } } as unknown as TUI;

	it("fills dark themes with black and light themes with white", () => {
		expect(popupBackground(colorTheme("dark"))).toBe("\x1b[48;2;0;0;0m");
		expect(popupBackground(colorTheme("light"))).toBe("\x1b[48;2;255;255;255m");
		expect(popupBackground(colorTheme("dark", "256color"))).toMatch(/^\x1b\[48;5;\d+m$/);
	});

	it("falls back to the input panel background without an appearance", () => {
		expect(popupBackground(colorTheme(undefined))).toBe("<bg:userMessageBg>");
	});

	it("draws the border in the theme's accent border color", () => {
		expect(popupPanelOptions(tui, colorTheme("dark"), "Settings").border("─")).toBe("<borderAccent>─");
	});
});

describe("popupWidth", () => {
	it("covers 70% of the terminal, kept between 76 and 100 columns and the screen", () => {
		const table: [number, number][] = [[40, 40], [60, 60], [76, 76], [80, 76], [100, 76], [120, 84], [143, 100], [200, 100]];
		for (const [columns, width] of table) expect(popupWidth(columns)).toBe(width);
		for (let n = 1; n <= 300; n++) {
			expect(popupWidth(n + 1)).toBeGreaterThanOrEqual(popupWidth(n));
			expect(popupWidth(n)).toBeLessThanOrEqual(n);
		}
	});
});
