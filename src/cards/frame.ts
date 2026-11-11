// Rounded card frame with the header in the top border and short facts in the bottom border.

import type { Theme, ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { BOX, TEXT } from "./symbols.ts";

/** Lifecycle state of a card; it picks the border color and background. */
export type CardState = "pending" | "running" | "success" | "warning" | "error";

/** A body section. A label draws a titled divider above it; `separator` draws a plain one. */
export interface FrameSection {
	label?: string;
	lines: readonly string[];
	separator?: boolean;
}

/** Everything a frame draws, at one width. */
export interface FrameOptions {
	width: number;
	header?: string;
	headerMeta?: string;
	/** Facts drawn inside the bottom border, such as wall time and exit code. */
	footerMeta?: string;
	state?: CardState;
	sections?: readonly FrameSection[];
	/** Paint the state's background behind the card. */
	applyBg?: boolean;
	/** Override the state's border color. */
	borderColor?: ThemeColor;
}

/** Border cells between a corner and the label. */
const CAP_CELLS = 3;
// Border, one padding column, content, one padding column, border.
const FRAME_COLUMNS = 4;

/** Width left for body text inside a frame of the given outer width. */
export function frameContentWidth(width: number): number {
	return Math.max(1, width - FRAME_COLUMNS);
}

/** Border color for a state: accent while it runs, dim once it settles, red or yellow when it goes wrong. */
export function stateBorderColor(state: CardState | undefined): ThemeColor {
	if (state === "error") return "error";
	if (state === "warning") return "warning";
	if (state === "running" || state === "pending") return "accent";
	return "dim";
}

/** Background token for a state, matching pi's own tool rows. */
export function stateBg(state: CardState): ThemeBg {
	if (state === "error") return "toolErrorBg";
	if (state === "running" || state === "pending") return "toolPendingBg";
	return "toolSuccessBg";
}

/** Draw a framed card. Every returned line is exactly `width` columns wide. */
export function renderFrame(options: FrameOptions, theme: Theme): string[] {
	const width = Math.max(0, options.width);
	const color = options.borderColor ?? stateBorderColor(options.state);
	const border = (text: string) => theme.fg(color, text);
	const contentWidth = frameContentWidth(width);
	const cap = BOX.horizontal.repeat(CAP_CELLS);
	const lines: string[] = [bar(BOX.topLeft, BOX.topRight, joinLabel(options.header, options.headerMeta), width, border, cap)];

	const sections = options.sections?.length ? options.sections : [{ lines: [] }];
	sections.forEach((section, index) => {
		if (section.label || (section.separator && index > 0)) {
			lines.push(bar(BOX.teeRight, BOX.teeLeft, section.label, width, border, cap));
		}
		for (const line of section.lines.flatMap((entry) => entry.split("\n"))) {
			for (const wrapped of wrapTextWithAnsi(line.replace(/\t/g, "   ").trimEnd(), contentWidth)) {
				lines.push(contentRow(wrapped, contentWidth, border));
			}
		}
	});

	// A clipped bottom border would drop trailing facts such as the exit code, so a footer that does not fit
	// becomes body rows above a plain border.
	const footer = options.footerMeta;
	const footerFits = footer === undefined || visibleWidth(` ${footer} `) <= width - visibleWidth(BOX.bottomLeft + cap + BOX.bottomRight);
	if (footer !== undefined && !footerFits) {
		for (const wrapped of wrapTextWithAnsi(footer, contentWidth)) lines.push(contentRow(wrapped, contentWidth, border));
	}
	lines.push(bar(BOX.bottomLeft, BOX.bottomRight, footerFits ? footer : undefined, width, border, cap));

	const clipped = width < CAP_CELLS + FRAME_COLUMNS ? lines.map((line) => truncateToWidth(line, width, "")) : lines;
	if (!options.applyBg || !options.state) return clipped;
	const bgAnsi = theme.getBgAnsi(stateBg(options.state));
	// Inner resets would clear the card's background mid-line, so each one restores it.
	return clipped.map((line) => `${bgAnsi}${line.replace(/\x1b\[(?:0|49)?m/g, (reset) => `${reset}${bgAnsi}`)}\x1b[49m`);
}

function joinLabel(header: string | undefined, meta: string | undefined): string | undefined {
	const parts = [header, meta].filter((part): part is string => Boolean(part));
	return parts.length > 0 ? parts.join(TEXT.sep) : undefined;
}

function bar(left: string, right: string, label: string | undefined, width: number, border: (text: string) => string, cap: string): string {
	const head = left + cap;
	const room = Math.max(0, width - visibleWidth(head) - visibleWidth(right));
	const text = label ? truncateToWidth(` ${label} `, room, TEXT.ellipsis) : "";
	const fill = BOX.horizontal.repeat(Math.max(0, room - visibleWidth(text)));
	return `${border(head)}${text}${border(fill)}${border(right)}`;
}

function contentRow(text: string, contentWidth: number, border: (text: string) => string): string {
	const pad = " ".repeat(Math.max(0, contentWidth - visibleWidth(text)));
	return `${border(BOX.vertical)} ${text}${pad} ${border(BOX.vertical)}`;
}
