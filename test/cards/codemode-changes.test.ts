import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { CHANGES_ENTRY, ChangeLog, mergeChanges, readChange } from "../../src/cards/codemode/changes.ts";

const CWD = "/home/user/project";

// Shapes taken from recorded `replace` and `edit` results.
const ANCHORED_RESULT = {
	details: {
		diff: " ...\n qsktf│  \"a\": 1,\n-vbnmr│  \"b\": 2\n+wertz│  \"b\": 3\n ...",
		patch: '--- src/config.json\n+++ src/config.json\n@@ -11,3 +11,3 @@\n   "a": 1,\n-  "b": 2\n+  "b": 3\n }\n',
		metrics: { classification: "applied", added_lines: 1, removed_lines: 1 },
	},
	structuredContent: { path: "src/config.json" },
};

describe("readChange", () => {
	it("takes the path and real line numbers from the patch, not the anchors", () => {
		expect(readChange("replace", { remove_from: "vbnmr", remove_to: "vbnmr", text: "x" }, ANCHORED_RESULT, CWD)).toEqual({
			path: `${CWD}/src/config.json`,
			added: 1,
			removed: 1,
			diff: ' 11   "a": 1,\n-12   "b": 2\n+12   "b": 3\n 13 }',
		});
	});

	it("separates hunks and ignores the no-newline marker", () => {
		const patch = "--- a.txt\n+++ a.txt\n@@ -1,1 +1,1 @@\n-a\n+b\n@@ -9 +9 @@\n-c\n\\ No newline at end of file\n+d\n";
		expect(readChange("edit", { path: "a.txt" }, { details: { diff: "x", patch } }, CWD)?.diff).toBe(
			"-1 a\n+1 b\n  ...\n-9 c\n+9 d",
		);
	});

	it("does not take an added line for a file header", () => {
		const patch = "--- a.txt\n+++ a.txt\n@@ -1 +1,2 @@\n a\n+++ b.txt\n";
		const change = readChange("edit", {}, { details: { patch } }, CWD);
		expect(change?.path).toBe(`${CWD}/a.txt`);
		expect(change?.added).toBe(1);
	});

	it("falls back on a tool's own diff", () => {
		const details = { diff: " 1 same\n-2 old\n+2 new\n+3 more", path: "b.ts" };
		expect(readChange("edit", {}, { details }, CWD)).toEqual({ path: `${CWD}/b.ts`, diff: details.diff, added: 2, removed: 1 });
	});

	it("shows a write as its content", () => {
		expect(readChange("write", { path: "/tmp/n.md", content: "a\nb\n" }, { details: {} }, CWD)).toEqual({
			path: "/tmp/n.md",
			added: 0,
			removed: 0,
			written: 2,
			diff: "+1 a\n+2 b",
		});
	});

	it("keeps a batch's queued edit, whose diff comes with the last one", () => {
		const result = { details: { diff: "", patch: "", batch: { id: 1, size: 2, last: false } }, structuredContent: { path: "a.ts" } };
		expect(readChange("replace", {}, result, CWD)).toEqual({ path: `${CWD}/a.ts`, added: 0, removed: 0, diff: "" });
	});

	it("ignores edits that changed nothing and tools that report no change", () => {
		const noop = { details: { diff: "", metrics: { classification: "noop" } }, structuredContent: { path: "a.ts" } };
		expect(readChange("replace", {}, noop, CWD)).toBeUndefined();
		expect(readChange("read", { path: "a.ts" }, { details: { truncation: {} } }, CWD)).toBeUndefined();
		expect(readChange("bash", { command: "ls" }, undefined, CWD)).toBeUndefined();
	});

	it("cuts long diffs to what a session entry should hold", () => {
		const content = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
		const change = readChange("write", { path: "big.txt", content }, {}, CWD);
		expect(change?.written).toBe(1000);
		expect(change?.truncated).toBe(true);
		expect(change?.diff.split("\n").length).toBeLessThan(1000);
	});
});

describe("mergeChanges", () => {
	it("adds up two edits of a file", () => {
		const first = { path: "a", added: 1, removed: 0, diff: "+1 a" };
		const second = { path: "a", added: 2, removed: 1, diff: "-9 b" };
		expect(mergeChanges(first, second)).toEqual({ path: "a", added: 3, removed: 1, diff: "+1 a\n  ...\n-9 b" });
	});

	it("skips the gap around a queued edit", () => {
		const queued = { path: "a", added: 0, removed: 0, diff: "" };
		expect(mergeChanges(queued, { path: "a", added: 1, removed: 0, diff: "+1 a" }).diff).toBe("+1 a");
	});
});

describe("ChangeLog", () => {
	it("survives a session reload through its entry", () => {
		const change = { path: "/a", added: 1, removed: 0, diff: "+1 a" };
		const log = new ChangeLog();
		log.record("script", "script/1", change);

		const data = JSON.parse(JSON.stringify(log.entry("script")));
		const entry = { type: "custom", customType: CHANGES_ENTRY, data } as unknown as SessionEntry;
		const other = { type: "custom", customType: "other", data: {} } as unknown as SessionEntry;
		const reloaded = new ChangeLog();
		reloaded.restore([other, entry]);
		expect(reloaded.of("script")?.get("script/1")).toEqual(change);
	});

	it("has nothing to persist for a script without changes", () => {
		expect(new ChangeLog().entry("script")).toBeUndefined();
	});
});
