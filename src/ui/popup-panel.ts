import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { fillBackground, stripAnsi } from "./utils.ts";

/** Box glyphs of the popup border. */
const BORDER = { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" } as const;

/** Columns of space between the border and the content. */
export const POPUP_PADDING_X = 2;

/** Rows above the content: top border, padding, title, gap. */
const HEADER_ROWS = 4;
/** Rows below the content: padding, bottom border. */
const FOOTER_ROWS = 2;
/** Below this many rows the panel drops its blank padding rows. */
const COMPACT_BELOW_ROWS = 16;

/** Whether a panel limited to `maxRows` uses the compact layout without padding rows. */
function isCompact(maxRows: number | undefined): boolean {
	return maxRows !== undefined && maxRows < COMPACT_BELOW_ROWS;
}

/** Rows the panel adds around its content when limited to `maxRows`. */
export function popupChromeRows(maxRows: number | undefined): number {
	return isCompact(maxRows) ? 3 : HEADER_ROWS + FOOTER_ROWS;
}

export interface PopupPanelOptions {
	/** Bold title on the left of the first panel row; a function is read on every render. */
	title: string | (() => string);
	/** Dim hint on the right of the title row. */
	hint?: string;
	/** SGR that opens the panel background; empty for no fill. */
	background: () => string;
	/** Paints the border glyphs. */
	border: (text: string) => string;
	/** Paints the title. */
	titleStyle?: (text: string) => string;
	/** Paints the hint. */
	hintStyle?: (text: string) => string;
	/** Most rows the panel may use, or undefined for no limit. */
	maxRows?: () => number | undefined;
}

/** A row made only of the horizontal rules Pi draws around its menus (`DynamicBorder`). */
export function isHorizontalRule(line: string): boolean {
	const plain = stripAnsi(line).trim();
	return plain.length > 0 && /^─+$/.test(plain);
}

function fit(line: string, width: number): string {
	const clipped = truncateToWidth(line, width, "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/**
 * Wraps a menu component in a bordered, filled panel with a title row, in the style of
 * OpenCode dialogs. The content keeps its own rendering, input and mouse handling; only
 * the full-width rules it draws around itself are dropped.
 */
export class PopupPanel implements Component {
	/** Original content row of each rendered content row, for mouse mapping. */
	private contentRows: number[] = [];
	private lastWidth = 0;
	/** Rows above the content in the last render. */
	private headerRows = HEADER_ROWS;
	/**
	 * Component that receives keys. Pi focuses a nested control (e.g. the settings
	 * list), but a click hands focus to the overlay root, this panel; keys must then
	 * still reach the control that was clicked rather than the menu container.
	 */
	private inputTarget: Component | undefined;

	constructor(
		readonly content: Component,
		private readonly options: PopupPanelOptions,
	) {}

	private get keyTarget(): Component {
		return this.inputTarget ?? this.content;
	}

	get focused(): boolean {
		return (this.keyTarget as { focused?: boolean }).focused === true;
	}

	set focused(value: boolean) {
		const target = this.keyTarget as { focused?: boolean };
		if ("focused" in target) target.focused = value;
	}

	render(width: number): string[] {
		this.lastWidth = width;
		const innerWidth = Math.max(1, width - 2 - POPUP_PADDING_X * 2);
		const raw = this.content.render(innerWidth);
		const titleText = typeof this.options.title === "function" ? this.options.title() : this.options.title;
		const kept: number[] = [];
		raw.forEach((line, index) => {
			if (!isHorizontalRule(line)) kept.push(index);
		});
		// Pi pads its menus with blank rows inside the rules; the panel has its own padding.
		while (kept.length > 0 && stripAnsi(raw[kept[0]!]!).trim() === "") kept.shift();
		// Menus that print their own title would repeat the panel title.
		if (kept.length > 0 && stripAnsi(raw[kept[0]!]!).trim() === titleText) {
			kept.shift();
			while (kept.length > 0 && stripAnsi(raw[kept[0]!]!).trim() === "") kept.shift();
		}
		while (kept.length > 0 && stripAnsi(raw[kept.at(-1)!]!).trim() === "") kept.pop();
		const maxRows = this.options.maxRows?.();
		const compact = isCompact(maxRows);
		if (maxRows !== undefined) kept.splice(Math.max(0, maxRows - popupChromeRows(maxRows)));
		this.contentRows = kept;

		const open = this.options.background();
		const border = this.options.border;
		const pad = " ".repeat(POPUP_PADDING_X);
		const row = (inner: string) => fillBackground(open, `${border(BORDER.vertical)}${pad}${fit(inner, innerWidth)}${pad}${border(BORDER.vertical)}`);
		const rule = (left: string, right: string) => fillBackground(open, border(`${left}${BORDER.horizontal.repeat(Math.max(0, width - 2))}${right}`));

		const hint = this.options.hint ? (this.options.hintStyle ?? ((text: string) => text))(this.options.hint) : "";
		const titleWidth = Math.max(0, innerWidth - (hint ? visibleWidth(hint) + 1 : 0));
		const title = truncateToWidth((this.options.titleStyle ?? ((text: string) => text))(titleText), titleWidth, "…");
		const titleRow = `${title}${" ".repeat(Math.max(0, innerWidth - visibleWidth(title) - visibleWidth(hint)))}${hint}`;

		const content = kept.map((index) => row(raw[index]!));
		this.headerRows = compact ? 2 : HEADER_ROWS;
		if (compact) return [rule(BORDER.topLeft, BORDER.topRight), row(titleRow), ...content, rule(BORDER.bottomLeft, BORDER.bottomRight)];
		return [
			rule(BORDER.topLeft, BORDER.topRight),
			row(""),
			row(titleRow),
			row(""),
			...content,
			row(""),
			rule(BORDER.bottomLeft, BORDER.bottomRight),
		];
	}

	invalidate(): void {
		this.content.invalidate();
	}

	handleInput(data: string): void {
		this.keyTarget.handleInput?.(data);
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		const handler = (this.content as { handleMouse?: (event: TuiMouseEvent) => TuiMouseEventResult | undefined }).handleMouse;
		const row = event.y - this.headerRows;
		const x = event.x - 1 - POPUP_PADDING_X;
		const innerWidth = Math.max(1, this.lastWidth - 2 - POPUP_PADDING_X * 2);
		// Clicks on the frame are swallowed so they do not reach the transcript behind the popup.
		if (!handler || row < 0 || row >= this.contentRows.length || x < 0 || x >= innerWidth) return { handled: true, render: false };
		const result = handler.call(this.content, { ...event, x, y: this.contentRows[row]!, width: innerWidth });
		if (!result) return { handled: true, render: false };
		const target = "target" in result ? (result.target as { component?: Component } | undefined)?.component : undefined;
		if (result.focus && target && target !== this.inputTarget && typeof target.handleInput === "function") {
			const previous = this.keyTarget as { focused?: boolean };
			const wasFocused = previous.focused === true;
			if (wasFocused) previous.focused = false;
			this.inputTarget = target;
			if (wasFocused && "focused" in target) (target as { focused?: boolean }).focused = true;
		}
		return result;
	}
}
