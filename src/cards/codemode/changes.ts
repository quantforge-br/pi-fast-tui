// What a codemode script changed on disk, read from its nested edit results and kept in a session entry for reloaded rows.

import { resolve } from "node:path";
import { type SessionEntry, truncateHead } from "@earendil-works/pi-coding-agent";

/** Session entry type; pi-codemode-render wrote the same entries, so its sessions keep their diffs. */
export const CHANGES_ENTRY = "codemode-render-changes";

const MAX_DIFF_LINES = 400;
const MAX_DIFF_BYTES = 16 * 1024;
/** Stands for the unchanged lines between two hunks. */
const DIFF_GAP = "  ...";
/** Only outside a hunk, where a `+++` line is a header and not an added `++` line. */
const PATCH_FILE = /^\+\+\+ ([^\t]+)/;
const PATCH_HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export interface FileChange {
	path: string;
	added: number;
	removed: number;
	/** In the format of pi's `renderDiff()`: a sign, a line number, then the line. */
	diff: string;
	/** Line count of a whole-file write, which replaces a file of unknown length. */
	written?: number;
	/** The diff was cut to fit the session entry. */
	truncated?: boolean;
}

/** The fields of an edit tool's result this module reads. */
interface EditResult {
	details?: {
		diff?: unknown;
		patch?: unknown;
		path?: unknown;
		classification?: unknown;
		metrics?: { classification?: unknown };
		batch?: unknown;
	};
	structuredContent?: { path?: unknown };
}

interface ScriptChanges {
	toolCallId: string;
	changes: Record<string, FileChange>;
}

function numbered(sign: string, line: number, width: number, text: string): string {
	return `${sign}${String(line).padStart(width)} ${text}`;
}

/** Unified patches give real line numbers, where a tool's own diff may use anchors in their place. */
function parsePatch(patch: string): Omit<FileChange, "path"> & { path?: string } {
	const rows: { sign: string; line: number; text: string }[] = [];
	const gaps = new Set<number>();
	let path: string | undefined;
	let added = 0;
	let removed = 0;
	let oldLine = 0;
	let newLine = 0;
	let oldLeft = 0;
	let newLeft = 0;

	for (const line of patch.split("\n")) {
		if (oldLeft <= 0 && newLeft <= 0) {
			path = PATCH_FILE.exec(line)?.[1].trim() ?? path;
			const hunk = PATCH_HUNK.exec(line);
			if (hunk) {
				if (rows.length > 0) gaps.add(rows.length);
				oldLine = Number(hunk[1]);
				oldLeft = Number(hunk[2] ?? 1);
				newLine = Number(hunk[3]);
				newLeft = Number(hunk[4] ?? 1);
			}
			continue;
		}
		const sign = line[0];
		const text = line.slice(1);
		if (sign === "+") {
			rows.push({ sign, line: newLine++, text });
			newLeft--;
			added++;
		} else if (sign === "-") {
			rows.push({ sign, line: oldLine++, text });
			oldLeft--;
			removed++;
		} else if (sign !== "\\") {
			rows.push({ sign: " ", line: newLine, text });
			oldLine++;
			newLine++;
			oldLeft--;
			newLeft--;
		}
	}

	const width = String(Math.max(0, ...rows.map((row) => row.line))).length;
	const diff = rows.flatMap((row, index) => {
		const line = numbered(row.sign, row.line, width, row.text);
		return gaps.has(index) ? [DIFF_GAP, line] : [line];
	});
	return { path, added, removed, diff: diff.join("\n") };
}

function countSigned(diff: string, sign: string): number {
	return diff.split("\n").filter((line) => line.startsWith(sign)).length;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

function bounded(change: FileChange): FileChange {
	const { content, truncated } = truncateHead(change.diff, { maxLines: MAX_DIFF_LINES, maxBytes: MAX_DIFF_BYTES });
	return truncated ? { ...change, diff: content, truncated } : change;
}

function readWrite(path: string, content: string): FileChange {
	const lines = content.replace(/\n$/, "").split("\n");
	const width = String(lines.length).length;
	return bounded({
		path,
		added: 0,
		removed: 0,
		written: lines.length,
		diff: lines.map((line, index) => numbered("+", index + 1, width, line)).join("\n"),
	});
}

/** What a finished nested call changed, or undefined when it reported no change to a file. */
export function readChange(name: string, args: unknown, result: unknown, cwd: string): FileChange | undefined {
	const { details, structuredContent } = (result ?? {}) as EditResult;
	if (details?.classification === "noop" || details?.metrics?.classification === "noop") return undefined;

	const given = (args ?? {}) as { path?: unknown; file_path?: unknown; content?: unknown };
	const named = nonEmptyString(structuredContent?.path) ?? nonEmptyString(given.path) ?? nonEmptyString(given.file_path);
	const fallback = named ?? nonEmptyString(details?.path);

	const patch = nonEmptyString(details?.patch);
	if (patch) {
		const parsed = parsePatch(patch);
		const path = parsed.path ?? fallback;
		return path ? bounded({ ...parsed, path: resolve(cwd, path) }) : undefined;
	}
	if (!fallback) return undefined;

	const path = resolve(cwd, fallback);
	const diff = nonEmptyString(details?.diff);
	if (diff) return bounded({ path, diff, added: countSigned(diff, "+"), removed: countSigned(diff, "-") });
	if (name === "write" && typeof given.content === "string") return readWrite(path, given.content);
	// Edits queued in a batch report nothing; the batch's last edit carries the diff of them all.
	return details?.batch ? { path, added: 0, removed: 0, diff: "" } : undefined;
}

/** Two edits of one file as one change. */
export function mergeChanges(first: FileChange, second: FileChange): FileChange {
	const written = second.written ?? first.written;
	return {
		path: second.path,
		added: first.added + second.added,
		removed: first.removed + second.removed,
		diff: [first.diff, second.diff].filter(Boolean).join(`\n${DIFF_GAP}\n`),
		...(written === undefined ? {} : { written }),
		...(first.truncated || second.truncated ? { truncated: true } : {}),
	};
}

/** The changes of each script, keyed by the id of the nested call that made them. */
export class ChangeLog {
	private readonly scripts = new Map<string, Map<string, FileChange>>();

	record(parentId: string, id: string, change: FileChange): void {
		let changes = this.scripts.get(parentId);
		if (!changes) {
			changes = new Map();
			this.scripts.set(parentId, changes);
		}
		changes.set(id, change);
	}

	of(parentId: string): ReadonlyMap<string, FileChange> | undefined {
		return this.scripts.get(parentId);
	}

	/** What to persist for a finished script, or undefined when it changed nothing. */
	entry(parentId: string): ScriptChanges | undefined {
		const changes = this.scripts.get(parentId);
		return changes && { toolCallId: parentId, changes: Object.fromEntries(changes) };
	}

	/** Load what a session persisted, for every branch of its tree. */
	restore(entries: readonly SessionEntry[]): void {
		this.scripts.clear();
		for (const entry of entries) {
			if (entry.type !== "custom" || entry.customType !== CHANGES_ENTRY) continue;
			const { toolCallId, changes } = entry.data as ScriptChanges;
			this.scripts.set(toolCallId, new Map(Object.entries(changes)));
		}
	}
}
