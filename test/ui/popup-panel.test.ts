import assert from "node:assert/strict";
import type { Component, TuiMouseEvent } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import test from "./fixtures/node-test.ts";
import { isHorizontalRule, PopupPanel } from "../../src/ui/popup-panel.ts";
import { stripAnsi } from "../../src/ui/utils.ts";

const BG = "\x1b[48;5;236m";

class FakeMenu implements Component {
	lastWidth = 0;
	inputs: string[] = [];
	mouse: TuiMouseEvent[] = [];
	constructor(private readonly lines: string[]) {}
	render(width: number): string[] {
		this.lastWidth = width;
		return this.lines;
	}
	invalidate(): void {}
	handleInput(data: string): void {
		this.inputs.push(data);
	}
	handleMouse(event: TuiMouseEvent) {
		this.mouse.push(event);
		return { handled: true };
	}
}

function nativeMenu(): FakeMenu {
	return new FakeMenu([
		"\x1b[38;5;240m" + "─".repeat(30) + "\x1b[39m",
		"",
		"  first item",
		"\x1b[7m→ selected\x1b[0m item",
		"",
		"\x1b[38;5;240m" + "─".repeat(30) + "\x1b[39m",
	]);
}

function panel(menu: Component, maxRows?: number) {
	return new PopupPanel(menu, {
		title: "Settings",
		hint: "esc",
		background: () => BG,
		border: (text) => `<${text}>`,
		maxRows: () => maxRows,
	});
}

function event(x: number, y: number): TuiMouseEvent {
	return { type: "press", button: "left", x, y, screenX: x, screenY: y, width: 40, height: 10, shift: false, alt: false, ctrl: false } as TuiMouseEvent;
}

test("detects Pi's full-width menu rules", () => {
	assert.equal(isHorizontalRule("\x1b[2m──────\x1b[22m"), true);
	assert.equal(isHorizontalRule("  ── Section ──"), false);
	assert.equal(isHorizontalRule(""), false);
});

test("draws a bordered panel with a title row and drops the native rules", () => {
	const menu = nativeMenu();
	const lines = panel(menu).render(40);
	const plain = lines.map((line) => stripAnsi(line).replace(/[<>]/g, ""));
	assert.equal(menu.lastWidth, 34, "content width leaves the border and two columns of padding per side");
	const row = (inner: string) => `│  ${inner.padEnd(34)}  │`;
	assert.deepEqual(plain, [
		"┌" + "─".repeat(38) + "┐",
		row(""),
		row("Settings" + " ".repeat(23) + "esc"),
		row(""),
		row("  first item"),
		row("→ selected item"),
		row(""),
		"└" + "─".repeat(38) + "┘",
	]);
	for (const line of lines) assert.equal(visibleWidth(line.replace(/[<>]/g, "")), 40);
});

test("fills only the area inside the border and re-opens the background after resets", () => {
	const lines = panel(nativeMenu()).render(40);
	assert.ok(!lines[0]!.includes(BG) && !lines.at(-1)!.includes(BG), "the top and bottom borders stay unfilled");
	for (const line of lines.slice(1, -1)) {
		assert.match(line, /^<│>/, "the left border cell stays unfilled");
		assert.match(line, /<│>$/, "the right border cell stays unfilled");
		assert.ok(line.startsWith(`<│>${BG}`), "the fill starts right inside the left border");
		assert.ok(line.endsWith("\x1b[49m<│>"), "the fill closes right before the right border");
	}
	assert.ok(lines[5]!.includes(`\x1b[0m${BG}`), "the background survives the content's own reset");
});

test("leaves rows unfilled when the theme has no background", () => {
	const lines = new PopupPanel(nativeMenu(), { title: "Model", background: () => "", border: (text) => text }).render(30);
	assert.ok(lines.every((line) => !line.includes("\x1b[48")));
	assert.ok(stripAnsi(lines[2]!).startsWith("│  Model"));
});

test("keeps the frame when the content is taller than the allowed rows", () => {
	const menu = new FakeMenu(Array.from({ length: 20 }, (_, i) => `item ${i}`));
	const lines = panel(menu, 20).render(30);
	assert.equal(lines.length, 20);
	assert.match(stripAnsi(lines.at(-1)!), /^<└─+┘>$/);
	assert.match(stripAnsi(lines.at(-3)!), /item 13/);
});

test("drops the padding rows in short terminals", () => {
	const menu = new FakeMenu(Array.from({ length: 20 }, (_, i) => `item ${i}`));
	const popup = panel(menu, 10);
	const lines = popup.render(30).map(stripAnsi);
	assert.equal(lines.length, 10);
	assert.match(lines[0]!, /^<┌─+┐>$/);
	assert.match(lines[1]!, /Settings/);
	assert.match(lines[2]!, /item 0/);
	assert.match(lines.at(-2)!, /item 6/);
	assert.match(lines.at(-1)!, /^<└─+┘>$/);
	popup.handleMouse(event(5, 3));
	assert.equal(menu.mouse[0]!.y, 1, "compact rows start right below the title");
});

test("keeps keys on the nested control a click focused", () => {
	// Pi focuses a nested list; a click makes pi-tui focus the overlay root (the panel).
	const list = { focused: true, inputs: [] as string[], render: () => [], invalidate() {}, handleInput(data: string) { this.inputs.push(data); } };
	const menu = {
		inputs: [] as string[],
		render: () => ["  item"],
		invalidate() {},
		handleInput(data: string) { this.inputs.push(data); },
		handleMouse: (mouse: TuiMouseEvent) => ({
			handled: true,
			focus: true,
			target: { component: list, originX: mouse.screenX - mouse.x, originY: mouse.screenY - mouse.y, width: mouse.width, height: mouse.height },
		}),
	};
	const popup = panel(menu as unknown as Component);
	popup.render(40);
	list.focused = false; // pi-tui unfocuses the previous target before focusing the panel
	popup.handleMouse(event(5, 4));
	popup.focused = true;
	popup.handleInput("\x1b[B");
	assert.deepEqual(list.inputs, ["\x1b[B"], "keys reach the clicked list");
	assert.deepEqual(menu.inputs, []);
	assert.equal(list.focused, true);
	assert.equal(popup.focused, true);
});

test("forwards input and maps mouse rows past the dropped rules", () => {
	const menu = nativeMenu();
	const popup = panel(menu);
	popup.render(40);
	popup.handleInput("\x1b[B");
	assert.deepEqual(menu.inputs, ["\x1b[B"]);
	assert.deepEqual(popup.handleMouse(event(5, 5)), { handled: true });
	assert.equal(menu.mouse[0]!.y, 3, "second content row is the menu's row 3");
	assert.equal(menu.mouse[0]!.x, 2);
	assert.equal(menu.mouse[0]!.width, 34);
	assert.deepEqual(popup.handleMouse(event(0, 0)), { handled: true, render: false }, "the frame swallows clicks");
	assert.equal(menu.mouse.length, 1);
});
