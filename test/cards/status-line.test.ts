import { describe, expect, it } from "vitest";
import { renderStatusLine, statusIcon } from "../../src/cards/status-line.ts";
import { SPINNER_FRAMES } from "../../src/cards/symbols.ts";
import { fgOf, plain, theme } from "./helpers.ts";

describe("renderStatusLine", () => {
	it("joins icon, title, description, badge and meta", () => {
		const line = renderStatusLine(
			{ icon: "success", title: "Grep", description: "useState", badge: { label: "+2/-1", color: "success" }, meta: ["5 matches", "", "3 files"] },
			theme,
		);
		expect(plain([line])).toBe("✔ Grep: useState ⟨+2/-1⟩ 5 matches · 3 files");
	});

	it("flattens newlines so the header stays one row", () => {
		expect(plain([renderStatusLine({ title: "a\nb", description: "c\r\nd" }, theme)])).toBe("a b: c d");
	});

	it("animates a running icon with the spinner frame", () => {
		expect(plain([statusIcon("running", theme, 3)])).toBe(SPINNER_FRAMES[3]);
		expect(plain([statusIcon("running", theme, SPINNER_FRAMES.length + 1)])).toBe(SPINNER_FRAMES[1]);
		expect(statusIcon("error", theme)).toContain(fgOf("error"));
	});
});
