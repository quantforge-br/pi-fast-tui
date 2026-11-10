import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CardInput, createCardRenderers, hasTimer, TICK_MS } from "../../src/cards/card.ts";
import { formatDuration } from "../../src/cards/format.ts";
import { SPINNER_FRAMES } from "../../src/cards/symbols.ts";
import { draw, newRow, text } from "./row.ts";

const inputs: CardInput[] = [];
const renderers = createCardRenderers((input) => {
	inputs.push(input);
	const output = input.result?.content.map((block) => block.text ?? "").join("\n");
	return {
		variant: "framed",
		status: { title: "Echo", description: String(input.args.value ?? "") },
		footerMeta: input.elapsedMs === undefined ? undefined : `Wall: ${formatDuration(input.elapsedMs)}`,
		sections: output === undefined ? [{ lines: [] }] : [{ lines: [output] }],
	};
});

afterEach(() => {
	vi.useRealTimers();
	inputs.length = 0;
});

describe("merged card", () => {
	it("draws a pending card while arguments stream", () => {
		const row = newRow({ value: "hel" });
		const drawn = draw(renderers, row);
		expect(drawn.split("\n")[0]).toMatch(/^ ╭─── ◌ Echo: hel ─+╮$/);
		for (const line of row.callComponent?.render(60) ?? []) expect(visibleWidth(line)).toBe(60);
		expect(inputs.at(-1)?.phase).toBe("pending");
		expect(hasTimer(row.state)).toBe(false);
	});

	it("spins and counts time while running, then stops the timer once settled", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const row = newRow({ value: "hello" });
		row.argsComplete = true;
		row.executionStarted = true;
		const first = draw(renderers, row);
		expect(first).toContain(`${SPINNER_FRAMES[0]} Echo: hello`);
		expect(hasTimer(row.state)).toBe(true);

		vi.advanceTimersByTime(TICK_MS * 3);
		expect(row.invalidations).toBe(3);
		const later = draw(renderers, row);
		expect(later).toContain(`${SPINNER_FRAMES[3]} Echo: hello`);
		expect(later).toContain("Wall: 0.30s");
		expect(inputs.at(-1)?.phase).toBe("running");

		row.isPartial = false;
		row.durationMs = 1234;
		row.result = { content: [text("hello")] };
		const done = draw(renderers, row);
		expect(hasTimer(row.state)).toBe(false);
		expect(done.split("\n")).toEqual([
			" ╭─── ✔ Echo: hello ──────────────────────────────────────╮",
			" │ hello                                                  │",
			" ╰─── Wall: 1.23s ────────────────────────────────────────╯",
		]);
		vi.advanceTimersByTime(TICK_MS * 5);
		expect(row.invalidations).toBe(3);
	});

	it("draws the result in the call slot and leaves the result slot empty", () => {
		const row = newRow({ value: "x" });
		row.executionStarted = true;
		row.isPartial = false;
		row.result = { content: [text("out")] };
		draw(renderers, row);
		expect(row.resultComponent?.render(60)).toEqual([]);
		expect(row.callComponent?.render(60).join("\n")).toContain("out");
	});

	it("marks errors and keeps every line at the row width", () => {
		const row = newRow({ value: "x" });
		row.executionStarted = true;
		row.isPartial = false;
		row.isError = true;
		row.result = { content: [text("boom")] };
		const drawn = draw(renderers, row, 30);
		expect(drawn).toContain("✘ Echo: x");
		expect(inputs.at(-1)?.phase).toBe("error");
		for (const line of row.callComponent?.render(30) ?? []) expect(visibleWidth(line)).toBe(30);
		expect(hasTimer(row.state)).toBe(false);
	});

	it("passes the expanded state and the configured expand key", () => {
		const row = newRow({ value: "x" });
		row.expanded = true;
		draw(renderers, row);
		expect(inputs.at(-1)?.expanded).toBe(true);
		expect(inputs.at(-1)?.expandHint).toBe("ctrl+o to expand");
	});

	it("stops the timer when the row is no longer drawn", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const row = newRow({ value: "x" });
		row.executionStarted = true;
		draw(renderers, row);
		vi.advanceTimersByTime(6_000);
		expect(hasTimer(row.state)).toBe(false);
	});

	it("reuses the components across render passes", () => {
		const row = newRow({ value: "x" });
		draw(renderers, row);
		const first = row.callComponent;
		draw(renderers, row);
		expect(row.callComponent).toBe(first);
	});

	it("treats arguments that are not an object as empty", () => {
		const row = newRow("garbage");
		expect(draw(renderers, row).split("\n")[0]).toMatch(/^ ╭─── ◌ Echo ─+╮$/);
	});
});
