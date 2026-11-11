import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Container, OverlayHandle, TUI } from "@earendil-works/pi-tui";
import { PopupPanel } from "./popup-panel.ts";

/** Pi menus shown as popups, by component class name, with the panel title for each. */
const POPUP_MENU_TITLES: Readonly<Record<string, string>> = {
	SettingsSelectorComponent: "Settings",
	ModelSelectorComponent: "Select model",
	ScopedModelsSelectorComponent: "Model Configuration",
	ThinkingSelectorComponent: "Thinking Level",
};

/** Share of the terminal the popup may cover. */
const POPUP_WIDTH = "70%";
const POPUP_MAX_HEIGHT = 0.85;
const POPUP_MIN_WIDTH = 60;

/** Title of the popup for a Pi menu component, or undefined when it stays inline. */
export function popupMenuTitle(component: unknown): string | undefined {
	if (!component || typeof component !== "object") return undefined;
	const name = (component as { constructor?: { name?: unknown } }).constructor?.name;
	return typeof name === "string" && Object.hasOwn(POPUP_MENU_TITLES, name) ? POPUP_MENU_TITLES[name] : undefined;
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
	const panel = new PopupPanel(menu, {
		title,
		hint: "esc",
		background: () => theme.getBgAnsi?.("userMessageBg") ?? "",
		border: (text) => theme.fg("border", text),
		titleStyle: (text) => theme.bold(theme.fg("text", text)),
		hintStyle: (text) => theme.fg("dim", text),
		maxRows: () => Math.max(8, Math.floor(tui.terminal.rows * POPUP_MAX_HEIGHT)),
	});
	// Pi focuses the menu itself right after mounting it; a non-capturing overlay leaves that focus alone.
	return tui.showOverlay(panel, {
		anchor: "center",
		width: POPUP_WIDTH,
		minWidth: Math.min(POPUP_MIN_WIDTH, tui.terminal.columns),
		maxHeight: `${Math.round(POPUP_MAX_HEIGHT * 100)}%`,
		nonCapturing: true,
	});
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
