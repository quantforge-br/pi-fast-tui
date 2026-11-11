// Card for tools without one of their own, such as MCP tools: arguments inline, the result as a JSON tree or a short preview.

import type { CardBuilder } from "../card.ts";
import { displayName } from "../codemode/summarize.ts";
import { formatArgsInline, JSON_TREE_COLLAPSED, JSON_TREE_EXPANDED, renderJsonTree } from "../json-tree.ts";
import { formatOutputPane } from "../output-pane.ts";
import { TEXT, TREE } from "../symbols.ts";
import { lines, resultText } from "./common.ts";

/** Output rows a collapsed generic card shows. */
export const GENERIC_PREVIEW_LINES = 4;

// Parsing a huge payload only to cut its tree to a few rows would stall the UI.
const JSON_TREE_MAX_CHARS = 64 * 1024;
// Integers this long may not survive a round trip through a double, so they keep the raw view.
const UNSAFE_INTEGER = /(?<![\w.])-?\d{16,}(?![\w.])/;

/** The output as JSON when it can be drawn as a tree without losing anything the raw text shows. */
export function parseTreeJson(text: string): unknown {
	const trimmed = text.trim();
	if (!(trimmed.startsWith("{") || trimmed.startsWith("[")) || trimmed.length > JSON_TREE_MAX_CHARS || UNSAFE_INTEGER.test(trimmed)) {
		return undefined;
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

/** Builds a generic card titled with the tool's name. */
export function createGenericCard(toolName: string): CardBuilder {
	const title = displayName(toolName);
	return (input) => {
		const { theme, expanded } = input;
		const sections = [];
		const hasArgs = Object.keys(input.args).length > 0;
		if (!expanded && hasArgs) {
			const inline = formatArgsInline(input.args, Math.max(20, input.contentWidth - 3));
			sections.push({ lines: [`${theme.fg("dim", TREE.last)} ${theme.fg("dim", inline)}`] });
		}
		if (expanded && hasArgs) {
			const tree = renderJsonTree(input.args, theme, JSON_TREE_EXPANDED);
			sections.push({ label: "Args", lines: tree.truncated ? [...tree.lines, theme.fg("dim", TEXT.ellipsis)] : tree.lines });
		}

		const text = resultText(input.result);
		if (text !== undefined && !(input.isPartial && text.trim() === "")) {
			const output = text.trimEnd();
			const color = input.isError ? "error" : "toolOutput";
			const parsed = input.isError ? undefined : parseTreeJson(output);
			const tree = parsed === undefined ? undefined : renderJsonTree(parsed, theme, expanded ? JSON_TREE_EXPANDED : JSON_TREE_COLLAPSED);
			let rows: string[];
			if (!output) {
				rows = [theme.fg("dim", "(no output)")];
			} else if (tree && tree.lines.length > 0 && !(expanded && tree.truncated)) {
				// An expanded tree that hit a bound would show less than the raw text, so expanding falls through to it.
				rows = tree.truncated ? [...tree.lines, `${theme.fg("dim", `${TEXT.ellipsis} (`)}${input.expandHint}${theme.fg("dim", ")")}`] : tree.lines;
			} else {
				rows = formatOutputPane(
					{ lines: lines(output), expanded, collapsedMaxLines: GENERIC_PREVIEW_LINES, styleLine: (line) => theme.fg(color, line), expandHint: input.expandHint },
					theme,
				).lines;
			}
			sections.push(expanded && hasArgs ? { label: "Output", lines: rows } : { lines: rows });
		}
		return { variant: "inline", status: { title }, sections };
	};
}
