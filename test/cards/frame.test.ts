import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { frameContentWidth, renderFrame } from "../../src/cards/frame.ts";
import { fgOf, plain, theme } from "./helpers.ts";

describe("renderFrame", () => {
	it("draws the header in the top border and every line at the full width", () => {
		const lines = renderFrame({ width: 40, header: "Bash", headerMeta: "2 lines", sections: [{ lines: ["one", "two"] }] }, theme);
		expect(plain(lines)).toBe(
			[
				"╭─── Bash · 2 lines ───────────────────╮",
				"│ one                                  │",
				"│ two                                  │",
				"╰──────────────────────────────────────╯",
			].join("\n"),
		);
		expect(lines.map((line) => visibleWidth(line))).toEqual([40, 40, 40, 40]);
	});

	it("draws labelled sections and footer facts inside the borders", () => {
		const lines = renderFrame(
			{ width: 40, header: "$ ls", footerMeta: "Wall: 0.2s", sections: [{ lines: ["$ ls"] }, { label: "Output", lines: ["a"] }] },
			theme,
		);
		expect(plain(lines)).toContain("├─── Output ──");
		expect(plain(lines).split("\n").at(-1)).toBe("╰─── Wall: 0.2s ───────────────────────╯");
	});

	it("wraps long ANSI lines without breaking the border", () => {
		const long = theme.fg("toolOutput", "word ".repeat(20).trim());
		const lines = renderFrame({ width: 30, sections: [{ lines: [long] }] }, theme);
		expect(lines.length).toBeGreaterThan(4);
		for (const line of lines) expect(visibleWidth(line)).toBe(30);
		for (const line of plain(lines).split("\n").slice(1, -1)) expect(line.startsWith("│ ") && line.endsWith(" │")).toBe(true);
		expect(frameContentWidth(30)).toBe(26);
	});

	it("moves a footer that does not fit into the body", () => {
		const footer = "Wall: 12.5s · Timeout: 300s · Exit: 2";
		const lines = renderFrame({ width: 24, footerMeta: footer, sections: [{ lines: ["x"] }] }, theme);
		const text = plain(lines);
		expect(text.split("\n").at(-1)).toBe("╰──────────────────────╯");
		expect(text.replace(/[│\s]/g, "")).toContain("Exit:2");
	});

	it("colors the border by state", () => {
		expect(renderFrame({ width: 20, state: "error" }, theme)[0]).toContain(fgOf("error"));
		expect(renderFrame({ width: 20, state: "running" }, theme)[0]).toContain(fgOf("accent"));
		expect(renderFrame({ width: 20, state: "success" }, theme)[0]).toContain(fgOf("dim"));
		expect(renderFrame({ width: 20, state: "warning" }, theme)[0]).toContain(fgOf("warning"));
	});

	it("keeps the state background across inner resets", () => {
		const lines = renderFrame({ width: 20, state: "error", applyBg: true, sections: [{ lines: ["a\x1b[0mb"] }] }, theme);
		const body = lines[1];
		expect(body.startsWith("\x1b[48;5;")).toBe(true);
		expect(body).toMatch(/\x1b\[0m\x1b\[48;5;\d+m/);
	});

	it("truncates a long header instead of overflowing", () => {
		const lines = renderFrame({ width: 20, header: "x".repeat(50) }, theme);
		expect(visibleWidth(lines[0])).toBe(20);
		expect(plain(lines)).toContain("…");
	});

	it("clips to very narrow widths", () => {
		for (const line of renderFrame({ width: 5, header: "Read", sections: [{ lines: ["abc"] }] }, theme)) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(5);
		}
	});
});
