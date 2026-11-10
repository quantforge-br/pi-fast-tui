import { describe, expect, it } from "vitest";
import { formatOutputPane, splitTerminalLines } from "../../src/cards/output-pane.ts";
import { plain, theme } from "./helpers.ts";

const rows = ["1", "2", "3", "4", "5", "6"];

describe("formatOutputPane", () => {
	it("keeps the head and says how many lines are left", () => {
		const pane = formatOutputPane({ lines: rows, expanded: false, collapsedMaxLines: 4, expandHint: "ctrl+o to expand" }, theme);
		expect(plain(pane.lines)).toBe("1\n2\n3\n4\n… 2 more lines (ctrl+o to expand)");
		expect(pane.hidden).toBe(2);
	});

	it("keeps the tail with the marker on top", () => {
		const pane = formatOutputPane({ lines: rows, expanded: false, collapsedMaxLines: 2, edge: "tail", expandHint: "ctrl+o to expand" }, theme);
		expect(plain(pane.lines)).toBe("… (4 earlier lines, showing 2 of 6) (ctrl+o to expand)\n5\n6");
	});

	it("shows everything when expanded or short", () => {
		expect(formatOutputPane({ lines: rows, expanded: true, collapsedMaxLines: 2, expandHint: "" }, theme).lines).toHaveLength(6);
		expect(formatOutputPane({ lines: ["a"], expanded: false, collapsedMaxLines: 2, expandHint: "" }, theme).hidden).toBe(0);
	});

	it("styles each line", () => {
		const pane = formatOutputPane({ lines: ["a"], expanded: false, collapsedMaxLines: 2, styleLine: (line) => `>${line}`, expandHint: "" }, theme);
		expect(pane.lines).toEqual([">a"]);
	});
});

describe("splitTerminalLines", () => {
	it("keeps what a carriage return overwrote last", () => {
		expect(splitTerminalLines("10%\r50%\r100%\r\ndone")).toEqual(["100%", "done"]);
	});
});
