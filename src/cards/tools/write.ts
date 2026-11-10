// Write card: the file, how many lines it gets, and the start of its content.

import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import type { CardBuilder } from "../card.ts";
import { plural } from "../format.ts";
import { formatOutputPane } from "../output-pane.ts";
import { lines, pathArg, resultText, stringArg } from "./common.ts";

/** Content lines a collapsed write card shows. */
export const WRITE_PREVIEW_LINES = 10;

/** Draws a write call. */
export const writeCard: CardBuilder = (input) => {
	const { theme } = input;
	const path = pathArg(input);
	const text = resultText(input.result);
	if (input.isError && text !== undefined) {
		return { variant: "framed", status: { title: "Write", description: path }, sections: [{ lines: lines(text).map((line) => theme.fg("error", line)) }] };
	}
	const content = stringArg(input.args, "content") ?? "";
	const raw = content ? lines(content) : [];
	const rawPath = stringArg(input.args, "path");
	const language = rawPath ? getLanguageFromPath(rawPath) : undefined;
	let styled = raw.map((line) => theme.fg("toolOutput", line));
	if (language && raw.length > 0) {
		try {
			styled = highlightCode(raw.join("\n").replace(/\t/g, "   "), language);
		} catch {
			// Unknown grammar: the plain lines stay.
		}
	}
	const pane = formatOutputPane({ lines: styled, expanded: input.expanded, collapsedMaxLines: WRITE_PREVIEW_LINES, expandHint: input.expandHint }, theme);
	return {
		variant: "framed",
		status: { title: "Write", description: path },
		headerMeta: raw.length > 0 ? theme.fg("dim", plural(raw.length, "line")) : undefined,
		sections: [{ lines: pane.lines.length > 0 ? pane.lines : [theme.fg("dim", "(empty)")] }],
	};
};
