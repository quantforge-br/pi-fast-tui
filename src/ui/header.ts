import { VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
	center,
	collectPiCommandNames,
	formatCwd,
	formatModelLabel,
	formatThinkingLabel,
	headerColumnWidths,
	padRight,
	pickSlashCommandTips,
	truncateToWidth,
	visibleWidth,
} from "./utils.ts";

const LOGO = [
	"            ",
	"            ",
	"█████████   ",
	"███   ███   ",
	"██████   ███",
	"███      ███",
	"            ",
];

/** Terminals with fewer rows than this get the compact header. */
export const COMPACT_HEADER_BELOW_ROWS = 30;

function renderLogo(paintBrand: (text: string) => string): string[] {
	return LOGO.map((line) => line.replace(/███/g, paintBrand));
}

function borderLine(
	left: string,
	label: string,
	right: string,
	width: number,
	paint: (text: string) => string,
): string {
	if (width <= 1) return "";
	if (width < 8 || label.length === 0) {
		return paint(truncateToWidth(left + "─".repeat(Math.max(0, width - 2)) + right, width, ""));
	}

	const before = "─── ";
	const after = " ─────";
	const fixedWidth = visibleWidth(before) + visibleWidth(label) + visibleWidth(after);
	const fill = Math.max(0, width - 2 - fixedWidth);
	return `${paint(left)}${paint(before)}${label}${paint(after)}${paint("─".repeat(fill))}${paint(right)}`;
}

function boxedLine(content: string, width: number, paint: (text: string) => string): string {
	if (width <= 2) return truncateToWidth(content, width, "");
	return `${paint("│")}${padRight(content, width - 2)}${paint("│")}`;
}

/** One padding column on each side, content left-aligned and cut with `…`. */
function paddedLine(content: string, width: number, paint: (text: string) => string): string {
	const inner = Math.max(0, width - 4);
	return boxedLine(` ${padRight(content, inner, "…")} `, width, paint);
}

function twoColumn(
	left: string,
	right: string,
	leftWidth: number,
	rightWidth: number,
	paint: (text: string) => string,
): string {
	return `${padRight(left, leftWidth)} ${paint("│")} ${padRight(right, rightWidth, "…")}`;
}

export class FastTuiHeader implements Component {
	private readonly pi: ExtensionAPI;
	private readonly ctx: ExtensionContext;
	private readonly tui: TUI;
	private readonly tipCommands: string[];

	constructor(pi: ExtensionAPI, ctx: ExtensionContext, tui: TUI) {
		this.pi = pi;
		this.ctx = ctx;
		this.tui = tui;
		const pool = collectPiCommandNames(pi.getCommands());
		this.tipCommands = pickSlashCommandTips(pool, {
			fixed: ["fast-tui"],
			count: 3,
		});
	}

	render(width: number): string[] {
		const theme = this.ctx.ui.theme;
		const paint = (s: string) => theme.fg("accent", s);
		const muted = (s: string) => theme.fg("muted", s);
		const dim = (s: string) => theme.fg("dim", s);
		const bold = (s: string) => theme.bold(s);

		if (width < 24) return [truncateToWidth(paint(`Pi v${VERSION}`), width, "")];

		const model = formatModelLabel(this.ctx.model);
		const effort = formatThinkingLabel(this.pi.getThinkingLevel());
		const cwd = formatCwd(this.ctx.cwd);
		const title = `${paint("Pi")} v${VERSION}`;

		if (this.tui.terminal.rows < COMPACT_HEADER_BELOW_ROWS) {
			return [
				borderLine("╭", title, "╮", width, paint),
				paddedLine(muted(`${model} · ${effort}`), width, paint),
				paddedLine(dim(cwd), width, paint),
				paddedLine(muted(this.tipCommands.join(" · ")), width, paint),
				borderLine("╰", "", "╯", width, paint),
			].map((line) => truncateToWidth(line, width, ""));
		}

		const innerWidth = width - 2;
		const { leftWidth, rightWidth, useTips } = headerColumnWidths(innerWidth);

		const leftLines = [
			...renderLogo(paint).map((line) => center(line, leftWidth)),
			center(bold("Let's build something great"), leftWidth),
			center(muted(`${model} · ${effort}`), leftWidth),
			center(dim(cwd), leftWidth),
		];

		// One column short of the tips column, so the divider never touches the right border.
		const tipDivider = paint("─".repeat(Math.max(8, Math.min(rightWidth - 1, 22))));
		const [cmd0 = "", cmd1 = "", cmd2 = "", cmd3 = ""] = this.tipCommands;
		const tipLines = [
			"",
			paint(bold("Welcome")),
			muted("Ask Pi anything"),
			tipDivider,
			paint(bold("Commands")),
			muted(cmd0),
			muted(cmd1),
			muted(cmd2),
			muted(cmd3),
			"",
		];

		const lines = [borderLine("╭", title, "╮", width, paint)];
		for (let i = 0; i < leftLines.length; i++) {
			const content = useTips
				? twoColumn(leftLines[i] ?? "", tipLines[i] ?? "", leftWidth, rightWidth, paint)
				: padRight(leftLines[i] ?? "", leftWidth);
			lines.push(boxedLine(content, width, paint));
		}
		lines.push(borderLine("╰", "", "╯", width, paint));
		return lines.map((line) => truncateToWidth(line, width, ""));
	}

	invalidate(): void {}
}

export function installHeader(pi: ExtensionAPI, ctx: ExtensionContext): () => void {
	ctx.ui.setHeader((tui) => new FastTuiHeader(pi, ctx, tui));
	return () => ctx.ui.setHeader(undefined);
}
