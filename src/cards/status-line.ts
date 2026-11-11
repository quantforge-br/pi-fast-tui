// One-line card header: status icon or spinner, title, description, badge and short facts.

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { BRACKET, SPINNER_FRAMES, STATUS_GLYPHS, TEXT } from "./symbols.ts";

/** What the header's icon says about the call. */
export type StatusIcon = "pending" | "running" | "success" | "error" | "warning" | "info";

/** Fields of a header row. */
export interface StatusLineOptions {
	icon?: StatusIcon;
	/** Animates a running icon. */
	spinnerFrame?: number;
	title: string;
	titleColor?: ThemeColor;
	description?: string;
	badge?: { label: string; color: ThemeColor };
	meta?: readonly string[];
}

const ICON_COLORS: Record<Exclude<StatusIcon, "running">, ThemeColor> = {
	pending: "muted",
	success: "success",
	error: "error",
	warning: "warning",
	info: "accent",
};

/** The styled glyph for an icon; a running icon is the spinner frame when one is given. */
export function statusIcon(icon: StatusIcon, theme: Theme, spinnerFrame?: number): string {
	if (icon === "running") {
		const glyph = spinnerFrame === undefined ? STATUS_GLYPHS.running : SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]!;
		return theme.fg("accent", glyph);
	}
	return theme.fg(ICON_COLORS[icon], STATUS_GLYPHS[icon]);
}

/** Draw a header row. Newlines inside fields become spaces so the row stays one line. */
export function renderStatusLine(options: StatusLineOptions, theme: Theme): string {
	const flat = (text: string) => text.replace(/\r\n?|\n/g, " ");
	let line = theme.fg(options.titleColor ?? "accent", flat(options.title));
	if (options.icon) line = `${statusIcon(options.icon, theme, options.spinnerFrame)} ${line}`;
	if (options.description) line += `: ${theme.fg("muted", flat(options.description))}`;
	if (options.badge) {
		line += ` ${theme.fg(options.badge.color, `${BRACKET.left}${flat(options.badge.label)}${BRACKET.right}`)}`;
	}
	const meta = (options.meta ?? []).map(flat).filter((value) => value.trim().length > 0);
	if (meta.length > 0) line += ` ${theme.fg("dim", meta.join(TEXT.sep))}`;
	return line;
}
