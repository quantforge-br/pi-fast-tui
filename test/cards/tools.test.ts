import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { createCardRenderers } from "../../src/cards/card.ts";
import { bashCard, parseBashOutput } from "../../src/cards/tools/bash.ts";
import { splitNotice } from "../../src/cards/tools/common.ts";
import { diffCounts, editCard, editPairs } from "../../src/cards/tools/edit.ts";
import { READ_PREVIEW_LINES, readCard, readTarget } from "../../src/cards/tools/read.ts";
import { findCard, grepCard, lsCard, parseGrep, SEARCH_PREVIEW_LINES } from "../../src/cards/tools/search.ts";
import { writeCard } from "../../src/cards/tools/write.ts";
import { plain } from "./helpers.ts";
import { draw, newRow, type Row, text } from "./row.ts";

function plainRows(lines: readonly string[]): string[] {
	return plain(lines).split("\n");
}

const bash = createCardRenderers(bashCard);
const read = createCardRenderers(readCard);
const edit = createCardRenderers(editCard);
const write = createCardRenderers(writeCard);
const grep = createCardRenderers(grepCard);
const find = createCardRenderers(findCard);
const ls = createCardRenderers(lsCard);

function settled(args: unknown, output: string, options: { isError?: boolean; details?: unknown; durationMs?: number } = {}): Row {
	const row = newRow(args);
	row.argsComplete = true;
	row.executionStarted = true;
	row.isPartial = false;
	row.isError = options.isError ?? false;
	row.durationMs = options.durationMs;
	row.result = { content: [text(output)], details: options.details };
	return row;
}

function running(args: unknown, partial?: string): Row {
	const row = newRow(args);
	row.argsComplete = true;
	row.executionStarted = true;
	if (partial !== undefined) row.result = { content: [text(partial)] };
	return row;
}

describe("bash", () => {
	it("parses the facts pi appends to output", () => {
		expect(parseBashOutput("a\nb\n\nCommand exited with code 2")).toMatchObject({ output: "a\nb", exitCode: 2 });
		expect(parseBashOutput("x\n\nCommand timed out after 5 seconds")).toMatchObject({ output: "x", note: "timed out" });
		expect(parseBashOutput("Command aborted")).toMatchObject({ output: "", note: "aborted" });
		const cut = parseBashOutput("tail\n\n[Showing lines 10-20 of 20. Full output: /tmp/pi-bash-1.log]");
		expect(cut).toMatchObject({ output: "tail", truncated: "Showing lines 10-20 of 20", fullOutputPath: "/tmp/pi-bash-1.log" });
	});

	it("draws the command, output and wall time once done", () => {
		const drawn = draw(bash, settled({ command: "git status --short", timeout: 30 }, " M src/a.ts\n?? b.ts", { durationMs: 180 }));
		expect(drawn.split("\n")).toEqual([
			" ╭─── ✔ Bash ─────────────────────────────────────────────╮",
			" │ $ git status --short                                   │",
			" ├─── Output ─────────────────────────────────────────────┤",
			" │  M src/a.ts                                            │",
			" │ ?? b.ts                                                │",
			" ╰─── Wall: 0.18s · Timeout: 30s ─────────────────────────╯",
		]);
	});

	it("shows the exit code of a failed command", () => {
		const drawn = draw(bash, settled({ command: "tsc" }, "error TS2339\n\nCommand exited with code 2", { isError: true, durationMs: 5120 }));
		expect(drawn).toContain("✘ Bash");
		expect(drawn).toContain("error TS2339");
		expect(drawn).not.toContain("Command exited");
		expect(drawn.split("\n").at(-1)).toContain("Wall: 5.12s · Exit: 2");
	});

	it("follows the tail of streaming output", () => {
		const output = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n");
		const drawn = draw(bash, running({ command: "make" }, output), 80);
		expect(drawn).toContain("… (20 earlier lines, showing 10 of 30) (ctrl+o to expand)");
		expect(drawn).toContain("line 30");
		expect(drawn).not.toContain("line 20 ");
	});

	it("notes truncated output and no output", () => {
		expect(draw(bash, settled({ command: "true" }, "(no output)"))).toContain("(no output)");
		const cut = draw(bash, settled({ command: "seq 1 9" }, "9\n\n[Showing lines 9-9 of 9. Full output: /tmp/out.log]"), 80);
		expect(cut).toContain("Showing lines 9-9 of 9. Full output: /tmp/out.log");
	});
});

describe("read", () => {
	it("names the range from the arguments", () => {
		expect(readTarget("a.ts", 10, 5)).toBe("a.ts:10-14");
		expect(readTarget("a.ts", 3, undefined)).toBe("a.ts:3");
		expect(readTarget("a.ts", undefined, undefined)).toBe("a.ts");
	});

	it("is one line while it runs", () => {
		expect(draw(read, running({ path: "/project/src/a.ts", offset: 437, limit: 12 }))).toMatch(/^ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Read: src\/a\.ts:437-448$/);
	});

	it("numbers the lines from the offset and moves pi's notice to the bottom border", () => {
		const drawn = draw(read, settled({ path: "notes.txt", offset: 9, limit: 2 }, "nine\nten\n\n[Showing lines 9-10 of 40. Use offset=11 to continue.]"), 80);
		const rows = drawn.split("\n");
		expect(rows[0]).toContain("✔ Read: notes.txt:9-10");
		expect(rows[1]).toContain(" 9 nine");
		expect(rows[2]).toContain("10 ten");
		expect(rows.at(-1)).toContain("Showing lines 9-10 of 40. Use offset=11 to continue.");
	});

	it("caps long files and shows errors in red", () => {
		const long = Array.from({ length: 40 }, (_, index) => `row ${index}`).join("\n");
		expect(draw(read, settled({ path: "big.txt" }, long))).toContain("… 28 more lines (ctrl+o to expand)");
		const failed = draw(read, settled({ path: "missing.txt" }, "ENOENT: no such file or directory, open 'missing.txt'", { isError: true }), 80);
		expect(failed).toContain("✘ Read: missing.txt");
		expect(failed).toContain("ENOENT");
	});
	it("wraps long lines to the right of the line-number gutter", () => {
		const output = `export const value6 = "xxxx";\nexport const value7 = "${"x".repeat(44)}"; // line 7`;
		const rows = draw(read, settled({ path: "a.txt", offset: 6 }, output), 40).split("\n");
		expect(rows.slice(1, -1)).toEqual([
			' │ 6 export const value6 = "xxxx";    │',
			" │ 7 export const value7 =            │",
			' │   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx │',
			' │   xxxxxxxxxxxxx"; // line 7        │',
		]);
		const highlighted = settled({ path: "a.ts", offset: 6 }, output);
		draw(read, highlighted, 40);
		const body = (highlighted.callComponent?.render(40) ?? []).slice(1, -1);
		for (const line of body) expect(visibleWidth(line)).toBe(40);
		for (const line of plainRows(body)) expect(line.slice(3, 4)).toMatch(/^[\d ]$/);
		expect(plainRows(body).slice(2).every((line) => line.startsWith(" │   "))).toBe(true);
	});

	it("caps wrapped files by logical line", () => {
		const long = Array.from({ length: 20 }, (_, index) => `row ${index} ${"w".repeat(60)}`).join("\n");
		const rows = draw(read, settled({ path: "big.txt" }, long), 40).split("\n");
		expect(rows.filter((row) => /^ │\s+\d+ row /.test(row))).toHaveLength(READ_PREVIEW_LINES);
		expect(rows.join("\n")).toContain(`… ${20 - READ_PREVIEW_LINES} more lines (ctrl+o to expand)`);
	});
});

describe("edit", () => {
	const diff = ["  87 const offset = 1;", "-88 const limit = 2000;", "+88 const limit = 4000;", "+89 const extra = true;", "  90 return;"].join("\n");

	it("reads the replacements however the model sent them", () => {
		expect(editPairs({ edits: [{ oldText: "a", newText: "b" }] })).toEqual([{ oldText: "a", newText: "b" }]);
		expect(editPairs({ edits: { oldText: "a", newText: "b" } })).toHaveLength(1);
		expect(editPairs({ edits: '[{"oldText":"a","newText":"b"}]' })).toHaveLength(1);
		expect(editPairs({ edits: "[{" })).toEqual([]);
		expect(editPairs({ edits: [{ oldText: "a" }] })).toEqual([{ oldText: "a", newText: "" }]);
	});

	it("previews the arguments while they stream", () => {
		const row = newRow({ path: "src/read.ts", edits: [{ oldText: "const limit = 2000;", newText: "const limit = 4000;" }] });
		const drawn = draw(edit, row);
		expect(drawn).toContain("◌ Edit: src/read.ts");
		expect(drawn).toContain("-const limit = 2000;");
		expect(drawn).toContain("+const limit = 4000;");
		expect(drawn.split("\n").at(-1)).toContain("preview");
	});

	it("draws pi's diff with counts once done", () => {
		expect(diffCounts(diff)).toEqual({ added: 2, removed: 1 });
		const drawn = draw(edit, settled({ path: "src/read.ts", edits: [] }, "Successfully replaced 1 block(s) in src/read.ts.", { details: { diff, patch: "" } }));
		expect(drawn.split("\n")[0]).toContain("✔ Edit: src/read.ts ⟨+2/-1⟩");
		expect(drawn).toContain("+88 const limit = 4000;");
		expect(drawn).not.toContain("Successfully");
	});

	it("shows why an edit failed", () => {
		const drawn = draw(edit, settled({ path: "a.ts", edits: [] }, "Could not find the exact text in a.ts.", { isError: true }));
		expect(drawn).toContain("✘ Edit: a.ts");
		expect(drawn).toContain("Could not find the exact text");
	});
});

describe("write", () => {
	it("counts lines and previews the content", () => {
		const content = Array.from({ length: 15 }, (_, index) => `line ${index}`).join("\n");
		const drawn = draw(write, settled({ path: "out.txt", content }, "Successfully wrote to out.txt"));
		expect(drawn.split("\n")[0]).toContain("✔ Write: out.txt · 15 lines");
		expect(drawn).toContain("… 5 more lines (ctrl+o to expand)");
	});

	it("shows errors", () => {
		expect(draw(write, settled({ path: "/root/x", content: "a" }, "EACCES: permission denied", { isError: true }))).toContain("EACCES");
	});
});

describe("grep", () => {
	const output = ["src/a.tsx:18: const [q] = useState();", "src/a.tsx-19- return q;", "src/b.tsx:27: const [e] = useState(false);"].join("\n");

	it("groups pi's rows by file", () => {
		expect(parseGrep(output)).toEqual([
			{ path: "src/a.tsx", lines: [{ line: 18, text: "const [q] = useState();", match: true }, { line: 19, text: "return q;", match: false }] },
			{ path: "src/b.tsx", lines: [{ line: 27, text: "const [e] = useState(false);", match: true }] },
		]);
		expect(parseGrep("not grep output")).toBeUndefined();
	});

	it("draws an inline tree with counts", () => {
		const drawn = draw(grep, settled({ pattern: "useState", path: "/project/src" }, output), 80);
		expect(drawn.split("\n")).toEqual([
			" ✔ Grep: useState in src 2 matches · 2 files",
			" ├─ src/a.tsx",
			" │  *18│ const [q] = useState();",
			" │   19│ return q;",
			" ├─ src/b.tsx",
			" │  *27│ const [e] = useState(false);",
		]);
	});

	it("says how many matches it left out and keeps pi's notice", () => {
		const many = Array.from({ length: 20 }, (_, index) => `f.ts:${index + 1}: hit`).join("\n");
		const drawn = draw(grep, settled({ pattern: "hit" }, `${many}\n\n[20 matches limit reached. Use limit=40 for more, or refine pattern]`), 80);
		expect(drawn).toContain("└─ … 13 more matches (ctrl+o to expand)");
		expect(drawn).toContain("20 matches limit reached");
		expect(drawn.split("\n")[0]).toContain("⚠ Grep: hit");
	});

	it("handles no matches and errors", () => {
		expect(draw(grep, settled({ pattern: "zzz" }, "No matches found"))).toBe(" ✔ Grep: zzz No matches found");
		expect(draw(grep, settled({ pattern: "(" }, "regex parse error", { isError: true }))).toContain("regex parse error");
	});
	it("wraps long rows under the tree rail and the line-number gutter", () => {
		const long = `src/config/a/very/long/path/to/some/file.ts:77: export const value77 = "${"x".repeat(30)}";`;
		const rows = draw(grep, settled({ pattern: "v" }, long), 40).split("\n");
		expect(rows.slice(1)).toEqual([
			" ├─ src/config/a/very/long/path/to/some",
			" │  /file.ts",
			" │  *77│ export const value77 =",
			' │     │ "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
			' │     │ x";',
		]);
	});

	it("caps wrapped matches by logical row and keeps the hidden count", () => {
		const many = Array.from({ length: 20 }, (_, index) => `f.ts:${index + 1}: hit ${"h".repeat(60)}`).join("\n");
		const rows = draw(grep, settled({ pattern: "hit" }, many), 40).split("\n");
		expect(rows.filter((row) => /^ │  \*\s*\d+│ hit/.test(row))).toHaveLength(SEARCH_PREVIEW_LINES - 1);
		expect(rows.join(" ")).toContain(`└─ … ${20 - SEARCH_PREVIEW_LINES + 1} more matches (ctrl+o to`);
		expect(rows.filter((row) => row.startsWith(" │     │ h"))).toHaveLength(2 * (SEARCH_PREVIEW_LINES - 1));
	});
});

describe("find and ls", () => {
	it("lists found files", () => {
		const drawn = draw(find, settled({ pattern: "*.ts" }, "a.ts\nb.ts"));
		expect(drawn.split("\n")).toEqual([" ✔ Find: *.ts 2 files", " ├─ a.ts", " └─ b.ts"]);
		expect(draw(find, settled({ pattern: "*.zz" }, "No files found matching pattern"))).toContain("No files found");
	});

	it("lists directory entries and caps long lists", () => {
		const entries = Array.from({ length: 12 }, (_, index) => `e${index}${index % 2 ? "/" : ""}`).join("\n");
		const drawn = draw(ls, settled({ path: "/project/src" }, entries));
		expect(drawn.split("\n")[0]).toBe(" ✔ Ls: src 12 entries");
		expect(drawn).toContain("└─ … 4 more (ctrl+o to expand)");
		expect(draw(ls, settled({}, "(empty directory)"))).toBe(" ✔ Ls: . (empty directory)");
	});
	it("wraps long items under their connector", () => {
		const output = `${"a/".repeat(25)}x.ts\n${"b/".repeat(25)}y/`;
		expect(draw(find, settled({ pattern: "*" }, output), 40).split("\n").slice(1)).toEqual([
			" ├─ a/a/a/a/a/a/a/a/a/a/a/a/a/a/a/a/a/a",
			" │  /a/a/a/a/a/a/a/x.ts",
			" └─ b/b/b/b/b/b/b/b/b/b/b/b/b/b/b/b/b/b",
			"    /b/b/b/b/b/b/b/y/",
		]);
		expect(draw(ls, settled({}, output), 40).split("\n").slice(1)).toEqual([
			" ├─ a/a/a/a/a/a/a/a/a/a/a/a/a/a/a/a/a/a",
			" │  /a/a/a/a/a/a/a/x.ts",
			" └─ b/b/b/b/b/b/b/b/b/b/b/b/b/b/b/b/b/b",
			"    /b/b/b/b/b/b/b/y/",
		]);
	});
});

describe("notices", () => {
	it("splits only pi's own notices", () => {
		expect(splitNotice("a\n\n[100 entries limit reached. Use limit=200 for more]")).toEqual({ body: "a", notice: "100 entries limit reached. Use limit=200 for more" });
		expect(splitNotice("a\n\n[tool.ruff]")).toEqual({ body: "a\n\n[tool.ruff]", notice: undefined });
	});
});

describe("widths", () => {
	it("keeps every native card within the row width", () => {
		const rows: [ReturnType<typeof createCardRenderers>, Row][] = [
			[bash, settled({ command: "x".repeat(200) }, "y".repeat(300))],
			[read, settled({ path: "a.ts" }, "z".repeat(300))],
			[grep, settled({ pattern: "p" }, `${"d/".repeat(40)}f.ts:1: ${"w".repeat(300)}`)],
			[find, settled({ pattern: "*" }, `${"d/".repeat(40)}f.ts\n${"e".repeat(90)}`)],
			[ls, settled({}, `${"d".repeat(90)}/\n${"e".repeat(90)}`)],
		];
		for (const [renderers, row] of rows) {
			draw(renderers, row, 40);
			for (const line of row.callComponent?.render(40) ?? []) expect(visibleWidth(line)).toBe(40);
		}
	});
});
