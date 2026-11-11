import { Container, type Component, type OverlayHandle, type OverlayOptions, type TUI } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { installPopupMenus, popupMenuTitle } from "../../src/ui/popup-menus.ts";
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
