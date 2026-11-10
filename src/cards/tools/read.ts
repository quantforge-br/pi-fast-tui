// Read card: the path and line range while it runs, then the lines with their numbers in a frame.

import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import type { CardBuilder } from "../card.ts";
import { formatOutputPane } from "../output-pane.ts";
import { lines, numberArg, pathArg, resultText, splitNotice, stringArg } from "./common.ts";

/** Lines a collapsed read card shows. */
export const READ_PREVIEW_LINES = 12;

/** `path:10-29` from the path, offset and limit arguments. */
export function readTarget(path: string, offset: number | undefined, limit: number | undefined): string {
	if (offset === undefined && limit === undefined) return path;
	const start = Math.max(1, Math.floor(offset ?? 1));
	return limit === undefined ? `${path}:${start}` : `${path}:${start}-${start + Math.max(1, Math.floor(limit)) - 1}`;
}

/** Draws a read call. */
export const readCard: CardBuilder = (input) => {
	const { theme } = input;
	const offset = numberArg(input.args, "offset");
	const target = readTarget(pathArg(input), offset, numberArg(input.args, "limit"));
	const text = resultText(input.result);
	if (text === undefined || input.isPartial) {
		return { variant: "inline", status: { title: "Read", description: target } };
	}
	if (input.isError) {
		return { variant: "framed", status: { title: "Read", description: target }, sections: [{ lines: lines(text).map((line) => theme.fg("error", line)) }] };
	}
	if (input.result?.content.some((block) => block.type === "image")) {
		return { variant: "inline", status: { title: "Read", description: target }, headerMeta: theme.fg("dim", lines(text)[0] ?? "image") };
	}

	const { body, notice } = splitNotice(text);
	const raw = lines(body);
	const path = stringArg(input.args, "path");
	const language = path ? getLanguageFromPath(path) : undefined;
	const highlighted = language ? safeHighlight(raw.join("\n"), language) ?? raw : raw.map((line) => theme.fg("toolOutput", line));
	const first = Math.max(1, Math.floor(offset ?? 1));
	const gutter = String(first + raw.length - 1).length;
	const numbered = highlighted.map((line, index) => `${theme.fg("dim", String(first + index).padStart(gutter))} ${line}`);
	const pane = formatOutputPane({ lines: numbered, expanded: input.expanded, collapsedMaxLines: READ_PREVIEW_LINES, expandHint: input.expandHint }, theme);
	return {
		variant: "framed",
		status: { title: "Read", description: target },
		footerMeta: notice ? theme.fg("dim", notice) : undefined,
		sections: [{ lines: pane.lines }],
	};
};

function safeHighlight(code: string, language: string): string[] | undefined {
	try {
		return highlightCode(code.replace(/\t/g, "   "), language);
	} catch {
		return undefined;
	}
}
