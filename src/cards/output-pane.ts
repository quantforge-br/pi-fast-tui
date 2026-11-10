// Caps tool output to a preview, from the head or the tail, with a marker that says what was left out.

import type { Theme } from "@earendil-works/pi-coding-agent";

/** Which end of the output stays visible when it is capped. */
export type PaneEdge = "head" | "tail";

/** Output to cap and how. */
export interface OutputPaneOptions {
	lines: readonly string[];
	expanded: boolean;
	collapsedMaxLines: number;
	edge?: PaneEdge;
	styleLine?: (line: string) => string;
	/** The configured expand key, such as `ctrl+o to expand`, from the render context. */
	expandHint: string;
}

/** The visible rows and how many were hidden. */
export interface OutputPane {
	lines: string[];
	hidden: number;
}

/** Split terminal output into rows. Text after a bare CR wins, as a progress bar overwrites its line. */
export function splitTerminalLines(text: string): string[] {
	return text.split(/\r?\n/).map((line) => line.slice(line.lastIndexOf("\r") + 1));
}

/** Cap and style output rows. Expanded output is never capped. */
export function formatOutputPane(options: OutputPaneOptions, theme: Theme): OutputPane {
	const edge = options.edge ?? "head";
	const styled = options.lines.map((line) => options.styleLine?.(line) ?? line);
	const limit = Math.max(0, options.collapsedMaxLines);
	if (options.expanded || styled.length <= limit) return { lines: styled, hidden: 0 };

	const hidden = styled.length - limit;
	const shown = edge === "tail" ? styled.slice(styled.length - limit) : styled.slice(0, limit);
	const label =
		edge === "tail"
			? `… (${hidden} earlier ${hidden === 1 ? "line" : "lines"}, showing ${limit} of ${styled.length})`
			: `… ${hidden} more ${hidden === 1 ? "line" : "lines"}`;
	const marker = `${theme.fg("dim", `${label} (`)}${options.expandHint}${theme.fg("dim", ")")}`;
	return { lines: edge === "tail" ? [marker, ...shown] : [...shown, marker], hidden };
}
