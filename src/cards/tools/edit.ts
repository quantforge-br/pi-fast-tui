// Edit card: the file and its diff, with added and removed line counts in the header.

import { renderDiff } from "@earendil-works/pi-coding-agent";
import type { CardBuilder, CardInput } from "../card.ts";
import { formatOutputPane } from "../output-pane.ts";
import { lines, pathArg, resultText } from "./common.ts";

/** Diff lines a collapsed edit card shows. */
export const EDIT_PREVIEW_LINES = 12;

/** Lines pi's display diff added and removed. */
export function diffCounts(diff: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+")) added++;
		else if (line.startsWith("-")) removed++;
	}
	return { added, removed };
}

interface EditPair {
	oldText: string;
	newText: string;
}

/** The replacements of an edit call, as far as they have streamed; models send them as an array, one object or a JSON string. */
export function editPairs(args: Record<string, unknown>): EditPair[] {
	let edits: unknown = args.edits;
	if (typeof edits === "string") {
		try {
			edits = JSON.parse(edits);
		} catch {
			return [];
		}
	}
	if (edits !== null && typeof edits === "object" && !Array.isArray(edits)) edits = [edits];
	if (!Array.isArray(edits)) return [];
	return edits.flatMap((edit: unknown) => {
		if (edit === null || typeof edit !== "object") return [];
		const { oldText, newText } = edit as Record<string, unknown>;
		return typeof oldText === "string" || typeof newText === "string"
			? [{ oldText: typeof oldText === "string" ? oldText : "", newText: typeof newText === "string" ? newText : "" }]
			: [];
	});
}

/** A diff preview built from the arguments, before pi has computed the real one. */
function previewDiff(input: CardInput): string[] {
	const { theme } = input;
	return editPairs(input.args).flatMap((pair, index) => [
		...(index > 0 ? [theme.fg("dim", "…")] : []),
		...(pair.oldText ? lines(pair.oldText).map((line) => theme.fg("toolDiffRemoved", `-${line}`)) : []),
		...(pair.newText ? lines(pair.newText).map((line) => theme.fg("toolDiffAdded", `+${line}`)) : []),
	]);
}

/** Draws an edit call. */
export const editCard: CardBuilder = (input) => {
	const { theme } = input;
	const path = pathArg(input);
	const text = resultText(input.result);
	if (input.isError && text !== undefined) {
		return { variant: "framed", status: { title: "Edit", description: path }, sections: [{ lines: lines(text).map((line) => theme.fg("error", line)) }] };
	}
	const details = input.result?.details as { diff?: unknown } | undefined;
	const diff = typeof details?.diff === "string" && !input.isPartial ? details.diff : undefined;
	if (diff === undefined) {
		const preview = previewDiff(input);
		const pane = formatOutputPane({ lines: preview, expanded: input.expanded, collapsedMaxLines: EDIT_PREVIEW_LINES, expandHint: input.expandHint }, theme);
		return {
			variant: "framed",
			status: { title: "Edit", description: path },
			footerMeta: preview.length > 0 ? theme.fg("dim", "preview") : undefined,
			sections: [{ lines: pane.lines }],
		};
	}
	const { added, removed } = diffCounts(diff);
	const rendered = renderDiff(diff).split("\n");
	const pane = formatOutputPane({ lines: rendered, expanded: input.expanded, collapsedMaxLines: EDIT_PREVIEW_LINES, expandHint: input.expandHint }, theme);
	return {
		variant: "framed",
		status: { title: "Edit", description: path, badge: { label: `+${added}/-${removed}`, color: added >= removed ? "success" : "warning" } },
		sections: [{ lines: pane.lines }],
	};
};
