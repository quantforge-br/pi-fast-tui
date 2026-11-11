import type { Theme } from "@earendil-works/pi-coding-agent";
import { backgroundAnsi, getKeybindings, rgbColor, type Component, type Container, type Keybinding, type OverlayHandle, type OverlayOptions, type TUI } from "@earendil-works/pi-tui";
import { PopupPanel, type PopupPanelOptions } from "./popup-panel.ts";

/** Pi menus shown as popups, by component class name, with the panel title for each. */
const POPUP_MENU_TITLES: Readonly<Record<string, string>> = {
	SettingsSelectorComponent: "Settings",
	ModelSelectorComponent: "Select model",
	ScopedModelsSelectorComponent: "Model Configuration",
	ThinkingSelectorComponent: "Thinking Level",
};

/** Pi menus that close again on the key that opened them: class name → Pi keybinding id. */
const MENU_TOGGLE_KEYBINDINGS: Readonly<Record<string, string>> = {
	ModelSelectorComponent: "app.model.select",
};

/** Share of the terminal width the popup covers, clamped to a readable range. */
const POPUP_WIDTH_RATIO = 0.7;
const POPUP_MIN_WIDTH = 60;
const POPUP_MAX_WIDTH = 100;
/** Share of the terminal height the popup may cover. */
const POPUP_MAX_HEIGHT = 0.85;

/** Popup width for a terminal width: 70% of it, kept within 60–100 columns and the screen. */
export function popupWidth(columns: number): number {
	const width = Math.round(columns * POPUP_WIDTH_RATIO);
	return Math.max(1, Math.min(columns, Math.max(POPUP_MIN_WIDTH, Math.min(POPUP_MAX_WIDTH, width))));
}

/** Most rows a popup may use on a terminal with this many rows. */
export function popupMaxRows(rows: number): number {
	return Math.max(8, Math.floor(rows * POPUP_MAX_HEIGHT));
}

/** Centered overlay options; the width follows terminal resizes because Pi reads it on every render. */
export function popupOverlayOptions(tui: TUI, extra: Partial<OverlayOptions> = {}): OverlayOptions {
	return {
		anchor: "center",
		get width() {
			return popupWidth(tui.terminal.columns);
		},
		maxHeight: `${Math.round(POPUP_MAX_HEIGHT * 100)}%`,
		...extra,
	};
}

/**
 * Popup fill: the far end of the theme's own background, black on dark themes and white on light
 * ones, so the panel stands apart from the conversation behind it. Falls back to the input panel
 * background when the theme cannot report its appearance or color mode.
 */
export function popupBackground(theme: Theme): string {
	try {
		const appearance = theme.appearance;
		if (appearance === "dark" || appearance === "light") {
			const level = appearance === "dark" ? 0 : 255;
			return backgroundAnsi(rgbColor(level, level, level), theme.getColorMode());
		}
	} catch {
		// Older or partial themes: use the token below.
	}
	return theme.getBgAnsi?.("userMessageBg") ?? "";
}

/** Panel look shared by every popup: a contrasting fill, an accent border, title and an "esc" hint. */
export function popupPanelOptions(tui: TUI, theme: Theme, title: PopupPanelOptions["title"]): PopupPanelOptions {
	return {
		title,
		hint: "esc",
		background: () => popupBackground(theme),
		border: (text) => theme.fg("borderAccent", text),
		titleStyle: (text) => theme.bold(theme.fg("text", text)),
		hintStyle: (text) => theme.fg("dim", text),
		maxRows: () => popupMaxRows(tui.terminal.rows),
	};
}

/** Title of the popup for a Pi menu component, or undefined when it stays inline. */
export function popupMenuTitle(component: unknown): string | undefined {
	if (!component || typeof component !== "object") return undefined;
	const name = (component as { constructor?: { name?: unknown } }).constructor?.name;
	return typeof name === "string" && Object.hasOwn(POPUP_MENU_TITLES, name) ? POPUP_MENU_TITLES[name] : undefined;
}

function matchesKeybinding(data: string, keybinding: string): boolean {
	try {
		return getKeybindings().matches(data, keybinding as Keybinding);
	} catch {
		return false;
	}
}

/**
 * Makes a Pi menu close on the key that opened it (ctrl+l for the model selector), the same
 * way its cancel key does. Menus without a toggle key or a cancel callback are left untouched.
 */
export function bindMenuToggleKey(menu: unknown): void {
	if (!menu || typeof menu !== "object") return;
	const name = (menu as { constructor?: { name?: unknown } }).constructor?.name;
	if (typeof name !== "string" || !Object.hasOwn(MENU_TOGGLE_KEYBINDINGS, name)) return;
	const keybinding = MENU_TOGGLE_KEYBINDINGS[name]!;
	const target = menu as {
		handleInput?: (data: string) => void;
		dispose?: () => void;
		onCancelCallback?: () => void;
		onCancel?: () => void;
	};
	const handleInput = target.handleInput;
	if (typeof handleInput !== "function") return;
	if (typeof target.onCancelCallback !== "function" && typeof target.onCancel !== "function") return;
	target.handleInput = function (this: unknown, data: string) {
		const cancel = typeof target.onCancelCallback === "function" ? target.onCancelCallback : target.onCancel;
		if (typeof cancel === "function" && matchesKeybinding(data, keybinding)) {
			// Same steps as the menu's own cancel key: release its resources, then let Pi close it.
			target.dispose?.();
			cancel.call(target);
			return;
		}
		handleInput.call(this, data);
	};
}

function isEditorLike(component: unknown): boolean {
	const candidate = component as Record<string, unknown> | undefined;
	return typeof candidate?.getText === "function" && typeof candidate.setText === "function"
		&& typeof candidate.handleInput === "function" && typeof candidate.onSubmit === "function";
}

/** The container that swaps Pi's editor for its menus (`showSelector`). */
function findEditorContainer(tui: TUI): Container | undefined {
	const pending: Component[] = [tui];
	const visited = new Set<Component>();
	while (pending.length > 0) {
		const component = pending.pop()!;
		if (visited.has(component)) continue;
		visited.add(component);
		const container = component as Partial<Container>;
		if (!Array.isArray(container.children)) continue;
		if (container.children.some(isEditorLike) && typeof container.addChild === "function" && typeof container.clear === "function") {
			return container as Container;
		}
		pending.push(...container.children);
	}
	return undefined;
}

/** Wraps a Pi menu in a centered popup panel, or returns undefined when the TUI cannot host one. */
export function showMenuPopup(tui: TUI, menu: Component, title: string, theme: Theme): OverlayHandle | undefined {
	if (typeof tui.showOverlay !== "function") return undefined;
	const panel = new PopupPanel(menu, popupPanelOptions(tui, theme, title));
	// Pi focuses the menu itself right after mounting it; a non-capturing overlay leaves that focus alone.
	return tui.showOverlay(panel, popupOverlayOptions(tui, { nonCapturing: true }));
}

/**
 * Shows Pi's settings, model, scoped-models and thinking menus as centered popups.
 *
 * Pi mounts these menus by clearing the editor container and adding the menu in place of
 * the editor; closing them clears the container and re-adds the editor. The patched
 * container keeps the editor mounted and moves the menu into an overlay instead.
 */
export function installPopupMenus(options: {
	getTui: () => TUI | undefined;
	getTheme: () => Theme;
	isEnabled: () => boolean;
}): { cleanup: () => void; hide: () => void } {
	let overlay: OverlayHandle | undefined;
	const hide = () => {
		const current = overlay;
		overlay = undefined;
		current?.hide();
	};
	const tui = options.getTui();
	const container = tui ? findEditorContainer(tui) : undefined;
	if (!tui || !container) return { cleanup: hide, hide };

	const originalClear = container.clear;
	const originalAddChild = container.addChild;
	const clearDescriptor = Object.getOwnPropertyDescriptor(container, "clear");
	const addChildDescriptor = Object.getOwnPropertyDescriptor(container, "addChild");
	let editors: Component[] = [];
	let installed = true;

	const patchedClear: typeof originalClear = function (this: Container) {
		hide();
		if (installed) editors = this.children.filter(isEditorLike);
		originalClear.call(this);
	};
	const patchedAddChild: typeof originalAddChild = function (this: Container, child) {
		if (installed && this.children.length === 0) bindMenuToggleKey(child);
		const title = installed && options.isEnabled() && this.children.length === 0 ? popupMenuTitle(child) : undefined;
		if (title !== undefined) {
			let handle: OverlayHandle | undefined;
			try {
				handle = showMenuPopup(tui, child, title, options.getTheme());
			} catch {
				handle = undefined;
			}
			if (handle) {
				overlay = handle;
				// The editor stays visible behind the popup; Pi moves focus to the menu.
				for (const editor of editors) originalAddChild.call(this, editor);
				return;
			}
		}
		originalAddChild.call(this, child);
	};
	container.clear = patchedClear;
	container.addChild = patchedAddChild;

	const restore = (key: "clear" | "addChild", patched: unknown, descriptor: PropertyDescriptor | undefined) => {
		if (container[key] !== patched) return;
		if (descriptor) Object.defineProperty(container, key, descriptor);
		else Reflect.deleteProperty(container, key);
	};
	return {
		hide,
		cleanup() {
			if (!installed) return;
			installed = false;
			restore("clear", patchedClear, clearDescriptor);
			restore("addChild", patchedAddChild, addChildDescriptor);
			hide();
		},
	};
}
