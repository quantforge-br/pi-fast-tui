import { describe, expect, it } from "vitest";
import { createCardRenderers } from "../../src/cards/card.ts";
import { createGenericCard, parseTreeJson } from "../../src/cards/tools/generic.ts";
import { draw, newRow, type Row, text } from "./row.ts";

const mcp = createCardRenderers(createGenericCard("mcp__perplexity__search"));

function settled(args: unknown, output: string, isError = false): Row {
	const row = newRow(args);
	row.argsComplete = true;
	row.executionStarted = true;
	row.isPartial = false;
	row.isError = isError;
	row.result = { content: [text(output)] };
	return row;
}

describe("generic card", () => {
	it("names MCP tools by server and shows the arguments inline while it runs", () => {
		const row = newRow({ query: "pi themes", limit: 5 });
		row.argsComplete = true;
		row.executionStarted = true;
		const lines = draw(mcp, row, 80).split("\n");
		expect(lines[0]).toMatch(/^ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] perplexity › search$/);
		expect(lines[1]).toBe(' └─ query="pi themes", limit=5');
	});

	it("previews four lines of text output with the expand key", () => {
		const output = Array.from({ length: 7 }, (_, index) => `result ${index + 1}`).join("\n");
		const drawn = draw(mcp, settled({ query: "x" }, output), 80);
		expect(drawn.split("\n")[0]).toBe(" ✔ perplexity › search");
		expect(drawn).toContain("result 4");
		expect(drawn).not.toContain("result 5");
		expect(drawn).toContain("… 3 more lines (ctrl+o to expand)");
	});

	it("draws JSON output as a tree, bounded until expanded", () => {
		const payload = JSON.stringify({ answer: "use a theme", sources: Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, url: `https://example.com/${i}/${"p".repeat(60)}` })) });
		const row = settled({ query: "x" }, payload);
		const collapsed = draw(mcp, row, 100);
		expect(collapsed).toContain('├─ answer: "use a theme"');
		expect(collapsed).toContain("(ctrl+o to expand)");
		row.expanded = true;
		const expanded = draw(mcp, row, 100);
		expect(expanded).toContain("Args");
		expect(expanded).toContain("Output");
		expect(expanded).toContain("t9");
	});

	it("keeps raw text for JSON that would lose precision or does not parse", () => {
		expect(parseTreeJson('{"id": 12345678901234567890}')).toBeUndefined();
		expect(parseTreeJson("[not json")).toBeUndefined();
		expect(parseTreeJson('{"a":1}')).toEqual({ a: 1 });
	});

	it("shows errors in red and empty output as such", () => {
		const failed = draw(mcp, settled({}, "MCP error -32602: invalid params", true), 80);
		expect(failed).toBe(" ✘ perplexity › search\n MCP error -32602: invalid params");
		expect(draw(mcp, settled({}, ""), 80)).toBe(" ✔ perplexity › search\n (no output)");
	});

	it("uses plain tool names as they are", () => {
		expect(draw(createCardRenderers(createGenericCard("get_goal")), newRow({}))).toBe(" ◌ get_goal");
	});
});
