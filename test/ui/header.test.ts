import assert from "node:assert/strict";
import test from "./fixtures/node-test.ts";
import { VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { COMPACT_HEADER_BELOW_ROWS, FastTuiHeader } from "../../src/ui/header.ts";
import { stripAnsi } from "../../src/ui/utils.ts";

function createHeader(options: { rows: number; cwd?: string; commands?: string[] }) {
	const terminal = { rows: options.rows, columns: 80 };
	const header = new FastTuiHeader(
		{
			getCommands: () => (options.commands ?? ["login", "model", "quit"]).map((name) => ({ name })),
			getThinkingLevel: () => "medium",
		} as unknown as ExtensionAPI,
		{
			cwd: options.cwd ?? "/work/project",
			model: { provider: "mock", id: "mock-model" },
			ui: {
				theme: {
					fg: (color: string, text: string) => color === "accent" ? `\x1b[35m${text}\x1b[39m` : text,
					bold: (text: string) => text,
				},
			},
		} as unknown as ExtensionContext,
		{ terminal, requestRender() {} } as unknown as TUI,
	);
	return { header, terminal, render: (width: number) => header.render(width).map(stripAnsi) };
}

test("header renders the compact five-row form on short terminals", () => {
	const { render } = createHeader({ rows: COMPACT_HEADER_BELOW_ROWS - 1 });
	const lines = render(60);
	assert.equal(lines.length, 5);
	assert.match(lines[0]!, new RegExp(`^╭─── Pi v${VERSION.replaceAll(".", "\\.")} ─+╮$`));
	assert.match(lines[1]!, /^│ mock\/mock-model · medium effort +│$/);
	assert.match(lines[2]!, /^│ \/work\/project +│$/);
	assert.match(lines[3]!, /^│ \/fast-tui · \/\S+ · \/\S+ · \/\S+ +│$/);
	assert.match(lines[4]!, /^╰─+╯$/);
	assert.ok(!lines.join("\n").includes("█"), "the compact header has no logo");

	for (const width of [24, 40, 60, 80]) {
		for (const line of createHeader({ rows: 20 }).header.render(width)) {
			assert.equal(visibleWidth(line), width, `compact row width at ${width}`);
		}
	}
});

test("compact header rows end with an ellipsis when they overflow", () => {
	const { render } = createHeader({ rows: 20, cwd: `/work/${"deep/".repeat(20)}project` });
	const lines = render(24);
	assert.match(lines[2]!, /… │$/);
	assert.match(lines[3]!, /^│ \/fast-tui · .*… │$/);
	for (const line of lines) assert.equal(visibleWidth(line), 24);
});

test("header switches forms when the terminal height crosses the threshold", () => {
	const { render, terminal } = createHeader({ rows: COMPACT_HEADER_BELOW_ROWS });
	const full = render(80);
	assert.equal(full.length, 12);
	assert.ok(full.join("\n").includes("█"));
	terminal.rows = COMPACT_HEADER_BELOW_ROWS - 1;
	assert.equal(render(80).length, 5);
	terminal.rows = COMPACT_HEADER_BELOW_ROWS;
	assert.deepEqual(render(80), full);
	// Below 24 columns the header stays the single version line in both forms.
	for (const rows of [10, 40]) {
		terminal.rows = rows;
		assert.deepEqual(render(20), [`Pi v${VERSION}`.slice(0, 20)]);
	}
});

test("full header leaves a blank column between the tips divider and the right border", () => {
	const lines = createHeader({ rows: 40 }).render(80);
	const divider = lines.find((line) => /│ ─{8,} *│$/.test(line));
	assert.ok(divider, lines.join("\n"));
	assert.match(divider, /─ +│$/);
});
