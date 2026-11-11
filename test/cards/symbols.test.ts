import { afterEach, describe, expect, it } from "vitest";
import { BOX, BRACKET, cardGlyphEpoch, cardGlyphMode, MARKS, setCardGlyphMode, SPINNER_FRAMES, STATUS_GLYPHS, TREE } from "../../src/cards/symbols.ts";

const isAscii = (value: string): boolean => /^[\x20-\x7e]*$/.test(value);

describe("card glyph modes", () => {
	afterEach(() => {
		setCardGlyphMode("unicode");
	});

	it("starts with the unicode set", () => {
		expect(cardGlyphMode()).toBe("unicode");
		expect(BOX.topLeft).toBe("╭");
		expect(STATUS_GLYPHS.success).toBe("✔");
		expect(SPINNER_FRAMES).toHaveLength(10);
	});

	it("swaps every glyph for ASCII in place and back", () => {
		expect(setCardGlyphMode("ascii")).toBe(true);
		expect(setCardGlyphMode("ascii")).toBe(false);
		expect(cardGlyphMode()).toBe("ascii");
		const all = [...Object.values(BOX), ...Object.values(TREE), ...Object.values(BRACKET), ...Object.values(STATUS_GLYPHS), ...Object.values(MARKS), ...SPINNER_FRAMES];
		for (const glyph of all) expect(isAscii(glyph), glyph).toBe(true);
		expect(SPINNER_FRAMES).toHaveLength(4);

		expect(setCardGlyphMode("unicode")).toBe(true);
		expect(BOX.topLeft).toBe("╭");
		expect(TREE.last).toBe("└─");
		expect(SPINNER_FRAMES[0]).toBe("⠋");
	});

	it("counts glyph set changes in the epoch", () => {
		const start = cardGlyphEpoch();
		expect(setCardGlyphMode("unicode")).toBe(false);
		expect(cardGlyphEpoch()).toBe(start);
		expect(setCardGlyphMode("ascii")).toBe(true);
		expect(cardGlyphEpoch()).toBe(start + 1);
		expect(setCardGlyphMode("ascii")).toBe(false);
		expect(cardGlyphEpoch()).toBe(start + 1);
	});
});
