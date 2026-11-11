// Codemode card: the script's title in the top border, one row per nested call in a tree, the output, and the run's totals in the bottom border.

import type { CodemodeToolDetails, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { highlightCode, renderDiff } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { CardBuilder, CardInput, CardSnapshot } from "../card.ts";
import type { FrameSection } from "../frame.ts";
import { formatDuration, plural } from "../format.ts";
import { formatOutputPane } from "../output-pane.ts";
import { MARKS, SPINNER_FRAMES, STATUS_GLYPHS, TEXT, TREE } from "../symbols.ts";
import { type ChangeLog, type FileChange, mergeChanges } from "./changes.ts";
import type { LiveCall, LiveCalls } from "./live.ts";
import { formatActionTime, formatCost, parseScriptOutput, scriptTitle, shortenPath, summarizeCall } from "./summarize.ts";

/** Actions a collapsed card lists; edits and failures stay in view beyond it. */
export const ACTION_PREVIEW_COUNT = 8;
/** Changed lines of all diffs together that a collapsed card shows. */
export const DIFF_PREVIEW_LINES = 8;
/** Output rows, after wrapping, that a collapsed card shows. */
export const OUTPUT_PREVIEW_LINES = 3;
/** Script lines shown while it streams in, and for a script that called no tools. */
export const STREAMING_SCRIPT_LINES = 8;
export const SCRIPT_PREVIEW_LINES = 3;

type NestedCall = CodemodeToolDetails["calls"][number];

/** One drawn action: its row, the time on the right, and lines under it. */
interface ActionRow {
	left: string;
	right: string;
	below: string[];
	/** Shown even when the action is too old for the preview. */
	pinned: boolean;
	change?: FileChange;
}

/** A call, or a run of calls that edited one file. */
interface ActionGroup {
	calls: NestedCall[];
	change?: FileChange;
}

/** Builds the codemode card from what the live calls and the change log know. */
export function createCodemodeCard(live: LiveCalls, changes: ChangeLog): CardBuilder {
	return (input) => {
		const code = typeof input.args.code === "string" ? input.args.code : "";
		const title = scriptTitle(code);
		const status = { title: "Codemode", description: title };
		if (input.args.code !== undefined && typeof input.args.code !== "string") {
			return { variant: "inline", status: { title: "Codemode", description: input.theme.fg("error", "[invalid arg]") } };
		}
		if (!input.result && !input.executionStarted && input.isPartial) return streamingCard(input, code, status);
		return runCard(input, code, status, live, changes);
	};
}

/** While the model writes the script: its last lines, following the tail like omp's eval cells. */
function streamingCard(input: CardInput, code: string, status: CardSnapshot["status"]): CardSnapshot {
	const rows = highlightScript(code);
	const pane = formatOutputPane(
		{ lines: rows, expanded: input.expanded, collapsedMaxLines: STREAMING_SCRIPT_LINES, edge: "tail", expandHint: input.expandHint },
		input.theme,
	);
	const count = code ? code.split("\n").length : 0;
	return {
		variant: "framed",
		status,
		footerMeta: count > 0 ? input.theme.fg("dim", plural(count, "line")) : undefined,
		sections: [{ lines: code ? pane.lines : [] }],
	};
}

function runCard(input: CardInput, code: string, status: CardSnapshot["status"], live: LiveCalls, changes: ChangeLog): CardSnapshot {
	const { theme, expanded } = input;
	const details = input.result?.details as Partial<CodemodeToolDetails> | undefined;
	const calls = details?.calls ?? [];
	const output = input.result ? parseScriptOutput(input.result.content) : undefined;
	const running = live.list(input.toolCallId);
	const groups = groupActions(calls, changes.of(input.toolCallId));
	const rows = groups.map(({ calls: grouped, change }) => {
		if (change) return changeRow(grouped, change, theme, input.cwd);
		const [call] = grouped;
		const liveCall = call.status === "running" ? takeLiveCall(running, call.name) : undefined;
		return actionRow(call, liveCall, input, expanded);
	});
	const oldest = rows.length - ACTION_PREVIEW_COUNT;
	const shown = expanded ? rows : rows.filter((row, index) => row.pinned || index >= oldest);
	addDiffs(shown, expanded, theme, input.expandHint);

	const sections: FrameSection[] = [];
	if (expanded && code.trim()) sections.push({ label: theme.fg("dim", "Script"), lines: highlightScript(code) });
	if (shown.length > 0) {
		const lines = actionLines(shown, rows.length - shown.length, input);
		sections.push(expanded ? { label: theme.fg("dim", "Actions"), lines } : { lines });
	} else if (!expanded && code.trim()) {
		// A script that called no tools has no actions to show, so its code is all there is to say about it.
		const pane = formatOutputPane(
			{ lines: highlightScript(code), expanded: false, collapsedMaxLines: SCRIPT_PREVIEW_LINES, expandHint: input.expandHint },
			theme,
		);
		sections.push({ lines: pane.lines });
	}
	if (!input.isPartial && output?.text) {
		const color = input.isError ? "error" : "toolOutput";
		const styled = output.text.replace(/\t/g, "   ").split("\n").map((line) => theme.fg(color, line));
		// Script output is often one long JSON line, so the preview counts wrapped rows.
		const wrapped = expanded ? styled : styled.flatMap((line) => wrapTextWithAnsi(line, input.contentWidth));
		const pane = formatOutputPane({ lines: wrapped, expanded, collapsedMaxLines: OUTPUT_PREVIEW_LINES, expandHint: input.expandHint }, theme);
		const lines = [...pane.lines];
		if (details?.fullOutputPath && !expanded) lines.push(theme.fg("muted", `Full output: ${details.fullOutputPath}`));
		sections.push({ label: theme.fg("dim", "Output"), lines });
	}

	const durationMs = input.elapsedMs ?? (input.isPartial ? undefined : output?.wallTimeMs);
	const fileChanges = groups.flatMap(({ change }) => (change ? [change] : []));
	const failed = calls.filter((call) => call.status === "error").length;
	return {
		variant: "framed",
		status,
		footerMeta: footer(calls, fileChanges, durationMs, input.isPartial, output?.images ?? 0, theme),
		sections: sections.length > 0 ? sections : [{ lines: [] }],
		state: !input.isPartial && !input.isError && failed > 0 ? "warning" : undefined,
	};
}

function highlightScript(code: string): string[] {
	const clean = code.replace(/\r/g, "").replace(/\t/g, "   ").trimEnd();
	if (!clean) return [];
	try {
		return highlightCode(clean, "javascript");
	} catch {
		return clean.split("\n");
	}
}

/** Pairs running records with live calls, which share the order in which the script started them. */
function takeLiveCall(live: LiveCall[], name: string): LiveCall | undefined {
	const index = live.findIndex((call) => call.name === name);
	return index === -1 ? undefined : live.splice(index, 1)[0];
}

const NESTED_STATUS: Record<Exclude<NestedCall["status"], "running">, { icon: () => string; color: ThemeColor }> = {
	ok: { icon: () => STATUS_GLYPHS.success, color: "success" },
	error: { icon: () => STATUS_GLYPHS.error, color: "error" },
	cancelled: { icon: () => MARKS.cancelled, color: "muted" },
};

function timing(durationMs: number | undefined, cost: number | undefined, theme: Theme): string {
	const parts = [durationMs === undefined ? "" : formatActionTime(durationMs), cost ? formatCost(cost) : ""];
	return theme.fg("dim", parts.filter(Boolean).join(" "));
}

function actionRow(call: NestedCall, live: LiveCall | undefined, input: CardInput, expanded: boolean): ActionRow {
	const { theme } = input;
	const icon =
		call.status === "running"
			? theme.fg("accent", SPINNER_FRAMES[(input.spinnerFrame ?? 0) % SPINNER_FRAMES.length]!)
			: theme.fg(NESTED_STATUS[call.status].color, NESTED_STATUS[call.status].icon());
	const summary = summarizeCall(call.name, call.args, input.cwd);
	let left = `${icon} ${theme.fg("toolTitle", summary.label)}`;
	if (summary.detail) left += ` ${theme.fg("toolOutput", summary.detail)}`;
	if (summary.where) left += ` ${theme.fg("dim", `in ${summary.where}`)}`;

	const durationMs = call.durationMs ?? (live ? Date.now() - live.startedAt : undefined);
	const below: string[] = [];
	if (live?.tail) below.push(theme.fg("dim", live.tail));
	if (call.error) {
		const lines = call.error.split("\n");
		for (const line of expanded ? lines : lines.slice(0, 1)) below.push(theme.fg("error", line));
	}
	return { left, right: timing(durationMs, call.cost, theme), below, pinned: call.status === "error" };
}

function lineCounts(added: number, removed: number, theme: Theme): string {
	return [added > 0 ? theme.fg("toolDiffAdded", `+${added}`) : "", removed > 0 ? theme.fg("toolDiffRemoved", `−${removed}`) : ""]
		.filter(Boolean)
		.join(" ");
}

function changeRow(calls: NestedCall[], change: FileChange, theme: Theme, cwd: string): ActionRow {
	const counts = lineCounts(change.added, change.removed, theme);
	const left = [
		`${theme.fg("success", MARKS.edit)} ${theme.fg("toolTitle", shortenPath(change.path, cwd))}`,
		change.written === undefined ? counts : theme.fg("muted", `wrote ${plural(change.written, "line")}`),
		calls.length > 1 ? theme.fg("muted", `· ${calls.length} edits`) : "",
	];
	const durationMs = calls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0);
	return { left: left.filter(Boolean).join(" "), right: timing(durationMs, undefined, theme), below: [], pinned: true, change };
}

/** Folds the edits a script makes to one file in a row, which are one change to whoever reads them. */
function groupActions(calls: NestedCall[], changes: ReadonlyMap<string, FileChange> | undefined): ActionGroup[] {
	const groups: ActionGroup[] = [];
	for (const call of calls) {
		const change = changes?.get(call.id);
		const last = groups.at(-1);
		if (change && last?.change?.path === change.path) {
			last.calls.push(call);
			last.change = mergeChanges(last.change, change);
		} else {
			groups.push({ calls: [call], change });
		}
	}
	return groups;
}

/** Adds each change's diff under its row: all of it when expanded, else the changed lines that fit. */
function addDiffs(rows: ActionRow[], expanded: boolean, theme: Theme, expandHint: string): void {
	let budget = DIFF_PREVIEW_LINES;
	for (const row of rows) {
		const { change } = row;
		if (!change?.diff || (!expanded && budget === 0)) continue;
		const lines = change.diff.split("\n");
		const changed = expanded ? lines : lines.filter((line) => line[0] === "+" || line[0] === "-");
		const shown = expanded ? changed : changed.slice(0, budget);
		if (!expanded) budget -= shown.length;
		row.below.push(...renderDiff(shown.join("\n")).split("\n"));
		const hidden = changed.length - shown.length;
		if (hidden > 0) row.below.push(`${theme.fg("dim", `… ${plural(hidden, "more line")} (`)}${expandHint}${theme.fg("dim", ")")}`);
		if (expanded && change.truncated) row.below.push(theme.fg("muted", "… diff cut short"));
	}
}

/** The actions as a tree, each row with its time aligned right, cut to the width while collapsed. */
function actionLines(rows: ActionRow[], earlier: number, input: CardInput): string[] {
	const { theme, contentWidth, expanded } = input;
	const lines: string[] = [];
	if (earlier > 0) lines.push(`${theme.fg("dim", TREE.branch)} ${theme.fg("dim", `… ${plural(earlier, "earlier action")}`)}`);
	rows.forEach((row, index) => {
		const last = index === rows.length - 1;
		const branch = theme.fg("dim", last ? TREE.last : TREE.branch);
		const indent = last ? "   " : `${theme.fg("dim", TREE.vertical)}  `;
		const room = contentWidth - 3;
		const rightWidth = visibleWidth(row.right);
		if (expanded) {
			const wrapped = wrapTextWithAnsi(`${row.left} ${row.right}`, room);
			lines.push(`${branch} ${wrapped[0] ?? ""}`, ...wrapped.slice(1).map((line) => `${indent}${line}`));
			for (const below of row.below) lines.push(...wrapTextWithAnsi(below, room).map((line) => `${indent}${line}`));
			return;
		}
		const left = truncateToWidth(row.left, Math.max(1, room - rightWidth - 1));
		const gap = " ".repeat(Math.max(1, room - visibleWidth(left) - rightWidth));
		lines.push(`${branch} ${left}${gap}${row.right}`);
		for (const below of row.below) lines.push(`${indent}${truncateToWidth(below, room)}`);
	});
	return lines;
}

function changeSummary(changes: FileChange[], theme: Theme): string {
	const files = new Set(changes.map((change) => change.path)).size;
	if (files === 0) return "";
	const added = changes.reduce((sum, change) => sum + change.added, 0);
	const removed = changes.reduce((sum, change) => sum + change.removed, 0);
	const counts = lineCounts(added, removed, theme);
	return `${theme.fg("dim", plural(files, "file"))}${counts ? ` ${counts}` : ""}`;
}

/** The run's totals for the bottom border: actions, files changed, failures, time, cost and images. */
function footer(
	calls: NestedCall[],
	changes: FileChange[],
	durationMs: number | undefined,
	isPartial: boolean,
	images: number,
	theme: Theme,
): string | undefined {
	const finished = calls.filter((call) => call.status !== "running").length;
	const failed = calls.filter((call) => call.status === "error").length;
	const cost = calls.reduce((sum, call) => sum + (call.cost ?? 0), 0);
	const dim = (text: string) => (text ? theme.fg("dim", text) : "");
	const parts = [
		dim(isPartial ? (calls.length > 0 ? `${finished} of ${plural(calls.length, "action")} done` : "") : calls.length > 0 ? plural(calls.length, "action") : ""),
		changeSummary(changes, theme),
		failed > 0 ? theme.fg("error", `${failed} failed`) : "",
		dim(durationMs === undefined ? "" : formatDuration(durationMs)),
		dim(cost > 0 ? formatCost(cost) : ""),
		dim(images > 0 ? plural(images, "image") : ""),
	].filter(Boolean);
	return parts.length > 0 ? parts.join(theme.fg("dim", TEXT.sep)) : undefined;
}
