import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCardRenderers } from "../../src/cards/card.ts";
import { createCodemodeCard } from "../../src/cards/codemode/card.ts";
import { ChangeLog, type FileChange } from "../../src/cards/codemode/changes.ts";
import { LiveCalls } from "../../src/cards/codemode/live.ts";
import { draw, newRow, type Row, text } from "./row.ts";

// row.ts gives every row this id.
const ID = "call-1";
const header = (seconds: number) => text(`Script completed\nWall time ${seconds} seconds\nOutput:\n`);

function renderers(live = new LiveCalls(), changes = new ChangeLog()) {
	return createCardRenderers(createCodemodeCard(live, changes));
}

function settled(code: string, content: ReturnType<typeof text>[], calls: unknown[], options: { isError?: boolean; durationMs?: number; fullOutputPath?: string } = {}): Row {
	const row = newRow({ code });
	row.argsComplete = true;
	row.executionStarted = true;
	row.isPartial = false;
	row.isError = options.isError ?? false;
	row.durationMs = options.durationMs;
	row.result = { content, details: { calls, fullOutputPath: options.fullOutputPath } };
	return row;
}

function changeLog(changes: Record<string, FileChange>): ChangeLog {
	const log = new ChangeLog();
	for (const [id, change] of Object.entries(changes)) log.record(ID, id, change);
	return log;
}

const call = (id: string, name: string, args: unknown, status = "ok", extra: Record<string, unknown> = {}) => ({
	id,
	name,
	args: typeof args === "string" ? args : JSON.stringify(args),
	status,
	...extra,
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("codemode card", () => {
	it("follows the tail of the script while the model writes it", () => {
		const code = ["// Raise the limits", ...Array.from({ length: 12 }, (_, i) => `const v${i} = ${i};`)].join("\n");
		const drawn = draw(renderers(), newRow({ code }), 80);
		const lines = drawn.split("\n");
		expect(lines[0]).toMatch(/◌ Codemode: Raise the limits/);
		expect(drawn).toContain("… (5 earlier lines, showing 8 of 13)");
		expect(drawn).toContain("const v11 = 11;");
		expect(drawn).not.toContain("const v3 = 3;");
		expect(lines.at(-1)).toContain("13 lines");
	});

	it("lists actions in a tree with times on the right, then the output and totals", () => {
		const row = settled("// Check status\nawait tools.bash({command: 'git status'});", [header(0.5), text("<console_output>\nhello\n</console_output>")], [
			call(`${ID}/1`, "bash", { command: "cd /project && git status" }, "ok", { durationMs: 176 }),
			call(`${ID}/2`, "read", { path: "/project/a.ts", offset: 10, limit: 5 }, "ok", { durationMs: 4 }),
		]);
		const lines = draw(renderers(), row, 70).split("\n");
		expect(lines[0]).toMatch(/^ ╭─── ✔ Codemode: Check status ─+╮$/);
		expect(lines[1]).toMatch(/^ │ ├─ ✔ \$ git status +176ms │$/);
		expect(lines[2]).toMatch(/^ │ └─ ✔ read a\.ts:10-14 +4ms │$/);
		expect(lines[3]).toMatch(/^ ├─── Output ─+┤$/);
		expect(lines[4]).toMatch(/^ │ hello +│$/);
		expect(lines[5]).toMatch(/^ ╰─── 2 actions · 0\.50s ─+╯$/);
		expect(lines.join("\n")).not.toContain("console_output");
		for (const line of row.callComponent?.render(70) ?? []) expect(visibleWidth(line)).toBe(70);
	});

	it("prefers the recorded duration over the result header", () => {
		const drawn = draw(renderers(), settled("x()", [header(240.1)], [], { durationMs: 1500 }));
		expect(drawn.split("\n").at(-1)).toContain("1.50s");
		expect(draw(renderers(), settled("x()", [header(240.1)], [])).split("\n").at(-1)).toContain("4m 0s");
	});

	it("shows the code of a script that called no tools", () => {
		const drawn = draw(renderers(), settled('console.log(await describeTool("x"));', [header(0.1)], []), 80);
		expect(drawn).toContain('describeTool("x")');
	});

	it("marks nested failures as a warning and keeps their first line", () => {
		const row = settled("x()", [header(0.1)], [call(`${ID}/1`, "read", { path: "gone" }, "error", { error: "ENOENT\nstack" })]);
		const drawn = draw(renderers(), row, 70);
		expect(drawn.split("\n")[0]).toContain("⚠ Codemode");
		expect(drawn).toContain("✘ read gone");
		expect(drawn).toContain("ENOENT");
		expect(drawn).not.toContain("stack");
		expect(drawn.split("\n").at(-1)).toContain("1 failed");
	});

	it("shows a failed script in red with its error output", () => {
		const row = settled("x()", [text("Script failed\nWall time 0.1 seconds\nOutput:\n"), text("Script error: boom")], [], { isError: true });
		const drawn = draw(renderers(), row, 70);
		expect(drawn.split("\n")[0]).toContain("✘ Codemode");
		expect(drawn).toContain("Script error: boom");
	});

	it("limits collapsed actions and shows the script and every action when expanded", () => {
		const calls = Array.from({ length: 12 }, (_, i) => call(`${ID}/${i}`, "read", { path: `f${i}` }));
		const row = settled("// Read all\nfor (const f of files) await tools.read({ path: f });", [header(0.1)], calls);
		const collapsed = draw(renderers(), row, 70);
		expect(collapsed).toContain("├─ … 4 earlier actions");
		expect(collapsed).not.toContain("read f3 ");
		expect(collapsed).not.toContain("for (const f");
		row.expanded = true;
		const expanded = draw(renderers(), row, 70);
		expect(expanded).toContain("Script");
		expect(expanded).toContain("for (const f of files)");
		expect(expanded).toContain("Actions");
		expect(expanded).toContain("read f0");
	});

	it("counts wrapped rows of long output and names the full output file", () => {
		const row = settled("x()", [header(0.1), text("x ".repeat(200))], [], { fullOutputPath: "/tmp/out.txt" });
		const drawn = draw(renderers(), row, 60);
		expect(drawn).toMatch(/… \d+ more lines/);
		expect(drawn).toContain("Full output: /tmp/out.txt");
	});

	it("spins running actions and shows the last line of their output", () => {
		vi.useFakeTimers();
		vi.setSystemTime(10_000);
		const live = new LiveCalls();
		live.start(ID, `${ID}/2`, "bash");
		live.update(ID, `${ID}/2`, "[42/537] Building CXX");
		const row = newRow({ code: "// Build\nawait tools.bash({command: 'make'});" });
		row.argsComplete = true;
		row.executionStarted = true;
		draw(renderers(live), row);
		vi.setSystemTime(13_000);
		row.result = { content: [], details: { calls: [call(`${ID}/1`, "read", { path: "a" }, "ok", { durationMs: 5 }), call("?", "bash", { command: "make" }, "running")] } };
		const drawn = draw(renderers(live), row, 70);
		expect(drawn).toMatch(/└─ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] \$ make +3\.0s/);
		expect(drawn).toContain("[42/537] Building CXX");
		expect(drawn.split("\n").at(-1)).toContain("1 of 2 actions done · 3.00s");
	});

	describe("edits", () => {
		const edit = (id: string) => call(id, "edit", '{"path":"abcde"}', "ok", { durationMs: 10 });
		const change = (path: string, added: number, removed: number, diff: string): FileChange => ({ path, added, removed, diff });

		it("names the file, counts lines and shows the diff", () => {
			const log = changeLog({ [`${ID}/1`]: change("/project/src/a.ts", 1, 1, "-1 before\n+1 after") });
			const drawn = draw(renderers(new LiveCalls(), log), settled("x()", [header(0.1)], [edit(`${ID}/1`)]), 70);
			expect(drawn).toMatch(/└─ ✎ src\/a\.ts \+1 −1 +10ms/);
			expect(drawn).toContain("+1 after");
			expect(drawn.split("\n").at(-1)).toContain("1 action · 1 file +1 −1 · 0.10s");
		});

		it("folds a run of edits to one file", () => {
			const log = changeLog({
				[`${ID}/1`]: change("/project/a.ts", 2, 1, "+1 one"),
				[`${ID}/2`]: change("/project/a.ts", 3, 0, "+9 two"),
				[`${ID}/3`]: change("/project/b.ts", 1, 0, "+1 three"),
			});
			const row = settled("x()", [header(0.1)], [edit(`${ID}/1`), edit(`${ID}/2`), edit(`${ID}/3`)]);
			const drawn = draw(renderers(new LiveCalls(), log), row, 70);
			expect(drawn).toMatch(/✎ a\.ts \+5 −1 · 2 edits +20ms/);
			expect(drawn).toContain("3 actions · 2 files +6 −1");
		});

		it("limits the collapsed diff and shows all of it when expanded", () => {
			const long = Array.from({ length: 12 }, (_, i) => `+${i + 1} line${i}`).join("\n");
			const log = changeLog({ [`${ID}/1`]: change("/project/a.ts", 12, 0, ` 1 kept\n${long}`) });
			const row = settled("x()", [header(0.1)], [edit(`${ID}/1`)]);
			const collapsed = draw(renderers(new LiveCalls(), log), row, 70);
			expect(collapsed).toContain("line7");
			expect(collapsed).not.toContain("line8");
			expect(collapsed).not.toContain("kept");
			expect(collapsed).toContain("… 4 more lines (ctrl+o to expand)");
			row.expanded = true;
			const expanded = draw(renderers(new LiveCalls(), log), row, 70);
			expect(expanded).toContain("kept");
			expect(expanded).toContain("line11");
		});

		it("keeps failures and edits in view when older actions are hidden", () => {
			const reads = Array.from({ length: 10 }, (_, i) => call(`${ID}/${i + 3}`, "read", { path: `f${i}` }));
			const failed = call(`${ID}/1`, "read", { path: "gone" }, "error", { error: "ENOENT" });
			const log = changeLog({ [`${ID}/2`]: change("/project/a.ts", 1, 0, "+1 x") });
			const drawn = draw(renderers(new LiveCalls(), log), settled("x()", [header(0.1)], [failed, edit(`${ID}/2`), ...reads]), 70);
			expect(drawn).toContain("✘ read gone");
			expect(drawn).toContain("✎ a.ts");
			expect(drawn).toContain("… 2 earlier actions");
		});
	});

	it("does not treat a reloaded row as being written", () => {
		const row = newRow({ code: "// Title\nx()" });
		row.isPartial = false;
		row.result = { content: [header(0.2)], details: { calls: [] } };
		expect(draw(renderers(), row).split("\n")[0]).toContain("✔ Codemode: Title");
	});

	it("flags a code argument that is not a string", () => {
		expect(draw(renderers(), newRow({ code: 42 }))).toContain("[invalid arg]");
	});
});
