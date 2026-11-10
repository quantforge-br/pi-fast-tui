// One-line card header: status icon or spinner, title, description, badge and short facts.

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { BRACKET, SEP, SPINNER_FRAMES } from "./symbols.ts";

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

const ICONS: Record<Exclude<StatusIcon, "running">, { glyph: string; color: ThemeColor }> = {
	pending: { glyph: "◌", color: "muted" },
	success: { glyph: "✔", color: "success" },
	error: { glyph: "✘", color: "error" },
	warning: { glyph: "⚠", color: "warning" },
	info: { glyph: "•", color: "accent" },
};

/** The styled glyph for an icon; a running icon is the spinner frame when one is given. */
export function statusIcon(icon: StatusIcon, theme: Theme, spinnerFrame?: number): string {
	if (icon === "running") {
		const glyph = spinnerFrame === undefined ? "⟳" : SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
		return theme.fg("accent", glyph);
	}
	const { glyph, color } = ICONS[icon];
	return theme.fg(color, glyph);
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
	if (meta.length > 0) line += ` ${theme.fg("dim", meta.join(SEP))}`;
	return line;
}
