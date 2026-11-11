import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { MIN_HANGING_ROOM, wrapHanging } from "../../src/cards/wrap.ts";

describe("wrapHanging", () => {
	it("wraps the text after the prefix and indents later rows as wide as the prefix", () => {
		expect(wrapHanging("ab ", "x".repeat(30), 13)).toBe(["ab xxxxxxxxxx", "   xxxxxxxxxx", "   xxxxxxxxxx"].join("\n"));
	});

	it("starts later rows with the given continuation", () => {
		expect(wrapHanging("├─ ", "y".repeat(16), 11, "│  ")).toBe(["├─ yyyyyyyy", "│  yyyyyyyy"].join("\n"));
	});

	it("leaves the row alone when too few columns remain", () => {
		const prefix = "p".repeat(10);
		expect(wrapHanging(prefix, "z".repeat(40), 10 + MIN_HANGING_ROOM - 1)).toBe(prefix + "z".repeat(40));
	});

	it("keeps rows that fit, expands tabs and trims the end", () => {
		expect(wrapHanging("1 ", "a\tb  ", 40)).toBe("1 a   b");
		expect(wrapHanging("1 ", "", 40)).toBe("1 ");
	});

	it("never exceeds the width with styled text", () => {
		const styled = `\x1b[31m${"word ".repeat(20)}\x1b[39m`;
		for (const row of wrapHanging("\x1b[2m12\x1b[22m ", styled, 20).split("\n")) expect(visibleWidth(row)).toBeLessThanOrEqual(20);
	});
});
