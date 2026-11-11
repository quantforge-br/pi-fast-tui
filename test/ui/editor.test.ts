import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "./fixtures/node-test.ts";
import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	CustomEditor,
	initTheme,
	SessionManager,
	SettingsManager,
	VERSION,
	type AgentSessionRuntime,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { Container, TuiMainScreen, type EditorComponent, type EditorTheme, type Terminal, type TUI, type TuiMouseEvent, visibleWidth } from "@earendil-works/pi-tui";
import { decorateFastTuiEditor, installEditor, repaintAfterStreamWrites, scrollThumbRange, type InlineFooterRenderer } from "../../src/ui/editor.ts";
import { FastTuiHeader } from "../../src/ui/header.ts";
import type { CursorStyle, EditorShape } from "../../src/ui/config.ts";
import { stripAnsi } from "../../src/ui/utils.ts";
import { mouseEvent } from "./fixtures/test-helpers.ts";

const tui = {
	terminal: { columns: 80, rows: 24 },
	requestRender() {},
} as TUI;

const editorTheme = {
	borderColor: (text: string) => text,
	selectList: {
		selectedPrefix: (text: string) => text,
		selectedText: (text: string) => text,
		description: (text: string) => text,
		scrollInfo: (text: string) => text,
		noMatch: (text: string) => text,
	},
} as EditorTheme;

function createFastTuiEditor(options: {
	tui?: TUI;
	theme?: EditorTheme;
	keybindings?: KeybindingsManager;
	cursorStyle?: CursorStyle;
	editorShape?: EditorShape;
	inlineFooter?: InlineFooterRenderer;
	panelBackground?: () => string;
} = {}) {
	const hostTui = options.tui ?? tui;
	const currentTheme = options.theme ?? editorTheme;
	const keybindings = options.keybindings ?? { matches: () => false } as unknown as KeybindingsManager;
	return decorateFastTuiEditor(
		new CustomEditor(hostTui, currentTheme, keybindings, { paddingX: 0 }),
		hostTui,
		{
			cursorStyle: options.cursorStyle ?? "block",
			editorShape: options.editorShape,
			inlineFooter: options.inlineFooter,
			panelBackground: options.panelBackground,
		},
	);
}

// Editor frame, content, and mouse coordinates.
test("compensates Pi editor padding for the custom left rail", () => {
	const editor = createFastTuiEditor();
	editor.setText("x");

	// Pi copies editorPaddingX after constructing a custom editor.
	editor.setPaddingX(2);
	const contentLine = stripAnsi(editor.render(40)[1] ?? "");

	assert.equal(contentLine.indexOf("x"), 2);
});

test("preserves legal editor text that resembles a border or scroll indicator", () => {
	for (const [width, text] of [
		[40, "↑ 3 more"],
		[40, "↓ 2 more"],
		[40, "─── ↑ 3 more ───"],
		[5, "─"],
	] as const) {
		const editor = createFastTuiEditor();
		editor.setText(`${text}\nx`);

		assert.equal(stripAnsi(editor.render(width)[1] ?? ""), `│ ${text.padEnd(width - 4)} │`);
	}
});

test("maps framed editor clicks to the Pi editor coordinate space", () => {
	const editor = createFastTuiEditor();
	editor.setText("abcdef");
	editor.render(40);

	const click = (x: number): void => {
		editor.handleMouse(mouseEvent("click", x, 1, { height: 8 }));
	};

	click(2);
	assert.equal(editor.getCursor().col, 0);
	click(3);
	assert.equal(editor.getCursor().col, 1);
	click(39);
	assert.equal(editor.getCursor().col, 6);
});

test("leaves narrow unframed editor mouse coordinates unchanged", () => {
	const editor = createFastTuiEditor();
	editor.setText("abc");
	editor.render(3);

	editor.handleMouse(mouseEvent("click", 0, 1, { width: 3, height: 8 }));

	assert.equal(editor.getCursor().col, 0);
});
test("embeds the working indicator in the editor top border", () => {
	const editor = createFastTuiEditor();
	editor.setWorkingStatusIndicator({
		renderInBorder: () => "◐ working",
		renderSpinnerInBorder: () => "◐",
	});

	assert.match(stripAnsi(editor.render(40)[0] ?? ""), /^╭── ◐ working ─+╮$/);
});

test("renders inline footer lines in the editor frame", () => {
	const editor = createFastTuiEditor({
		inlineFooter: {
			enabled: () => true,
			render: () => ({
				top: { left: "cwd", right: "context" },
				bottom: { left: "model", right: "stats" },
			}),
		},
	});

	const lines = editor.render(40).map(stripAnsi);
	assert.match(lines[0] ?? "", /^╭─ cwd ─+ context ─╮$/);
	assert.match(lines.at(-1) ?? "", /^╰─ model ─+ stats ─╯$/);
	assert.equal(visibleWidth(lines[0] ?? ""), 40);
	assert.equal(visibleWidth(lines.at(-1) ?? ""), 40);
});

test("keeps a narrow scrolled working border intact", () => {
	const editor = createFastTuiEditor();
	editor.setText(Array.from({ length: 10 }, (_, index) => `line ${index}`).join("\n"));
	let spinnerRenders = 0;
	editor.setWorkingStatusIndicator({
		renderInBorder: () => "◐ working status that ignores width",
		renderSpinnerInBorder: () => {
			spinnerRenders++;
			return "◐";
		},
	});

	const topBorder = stripAnsi(editor.render(30)[0] ?? "");

	assert.equal(spinnerRenders, 1);
	assert.equal(visibleWidth(topBorder), 30);
	assert.match(topBorder, /↑ 3 more/);
	assert.ok(topBorder.endsWith("╮"));
});

// Editor shapes.
const BOX_SHAPES = [
	["rounded", "╭╮╰╯", "─", "│"],
	["square", "┌┐└┘", "─", "│"],
	["heavy", "┏┓┗┛", "━", "┃"],
	["double", "╔╗╚╝", "═", "║"],
	["ascii", "++++", "-", "|"],
] as const satisfies readonly (readonly [EditorShape, string, string, string])[];

const inlineFooterStub: InlineFooterRenderer = {
	enabled: () => true,
	render: () => ({
		top: { left: "cwd", right: "context" },
		bottom: { left: "model", right: "stats" },
	}),
};

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const [shape, corners, h, v] of BOX_SHAPES) {
	const [tl, tr, bl, br] = [...corners].map(escapeRegExp);
	const hh = escapeRegExp(h);
	test(`draws the ${shape} editor frame`, () => {
		const editor = createFastTuiEditor({ editorShape: shape });
		editor.setText("x");

		const lines = editor.render(20).map(stripAnsi);
		assert.equal(lines[0], `${corners[0]}${h.repeat(18)}${corners[1]}`);
		assert.equal(lines[1], `${v} ${"x".padEnd(16)} ${v}`);
		assert.equal(lines[2], `${corners[2]}${h.repeat(18)}${corners[3]}`);
		for (const line of lines) assert.equal(visibleWidth(line), 20);
	});

	test(`embeds the working indicator and inline footer in the ${shape} frame`, () => {
		const editor = createFastTuiEditor({ editorShape: shape });
		editor.setWorkingStatusIndicator({ renderInBorder: () => "◐ working", renderSpinnerInBorder: () => "◐" });
		assert.match(stripAnsi(editor.render(40)[0] ?? ""), new RegExp(`^${tl}${hh}${hh} ◐ working ${hh}+${tr}$`));

		const framed = createFastTuiEditor({ editorShape: shape, inlineFooter: inlineFooterStub });
		const lines = framed.render(40).map(stripAnsi);
		assert.match(lines[0] ?? "", new RegExp(`^${tl}${hh} cwd ${hh}+ context ${hh}${tr}$`));
		assert.match(lines.at(-1) ?? "", new RegExp(`^${bl}${hh} model ${hh}+ stats ${hh}${br}$`));
	});

	test(`maps ${shape} frame clicks past the left rail`, () => {
		const editor = createFastTuiEditor({ editorShape: shape });
		editor.setText("abcdef");
		editor.render(40);
		editor.handleMouse(mouseEvent("click", 3, 1, { height: 8 }));
		assert.equal(editor.getCursor().col, 1);
	});
}

test("keeps Pi's native rules without side rails", () => {
	const editor = createFastTuiEditor({ editorShape: "native" });
	editor.setText("x");

	const lines = editor.render(20).map(stripAnsi);
	assert.deepEqual(lines, ["─".repeat(20), "x".padEnd(20), "─".repeat(20)]);
	editor.handleMouse(mouseEvent("click", 1, 1, { width: 20, height: 8 }));
	assert.equal(editor.getCursor().col, 1);
});

test("draws the claude prompt between two rules", () => {
	const editor = createFastTuiEditor({ editorShape: "claude" });
	editor.setText("first\nsecond");

	const lines = editor.render(20).map(stripAnsi);
	assert.deepEqual(lines, ["─".repeat(20), `❯ ${"first".padEnd(18)}`, `  ${"second".padEnd(18)}`, "─".repeat(20)]);
	for (const line of lines) assert.equal(visibleWidth(line), 20);
	editor.handleMouse(mouseEvent("click", 4, 2, { width: 20, height: 8 }));
	assert.deepEqual(editor.getCursor(), { line: 1, col: 2 });
});

test("draws the rule shape with only a top rule", () => {
	const editor = createFastTuiEditor({ editorShape: "rule" });
	editor.setText("x");

	const lines = editor.render(20).map(stripAnsi);
	assert.deepEqual(lines, ["─".repeat(20), `❯ ${"x".padEnd(18)}`]);
	editor.handleMouse(mouseEvent("click", 2, 1, { width: 20, height: 8 }));
	assert.equal(editor.getCursor().col, 0);
});

test("moves both scroll indicators to the top rule of the rule shape", () => {
	const editor = createFastTuiEditor({ editorShape: "rule" });
	editor.setText(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"));
	for (let i = 0; i < 12; i++) editor.handleInput("\x1b[A");

	const lines = editor.render(60).map(stripAnsi);
	assert.match(lines[0] ?? "", /^─{4} ↑ \d+ more ↓ \d+ more ─+$/);
	assert.equal(visibleWidth(lines[0] ?? ""), 60);
	assert.ok(lines.slice(1).every((line) => line.startsWith("❯ ") || line.startsWith("  ")));
	assert.ok(!lines.slice(1).some((line) => /^─+$/.test(line)));
});

test("draws the borderless shape as a bare prompt without rules", () => {
	const editor = createFastTuiEditor({ editorShape: "borderless" });
	editor.setText("first\nsecond");

	const lines = editor.render(20).map(stripAnsi);
	assert.deepEqual(lines, [`❯ ${"first".padEnd(18)}`, `  ${"second".padEnd(18)}`]);
	editor.handleMouse(mouseEvent("click", 4, 1, { width: 20, height: 8 }));
	assert.deepEqual(editor.getCursor(), { line: 1, col: 2 });
});

test("draws the field shape as filled rows between accent end caps", () => {
	const open = "\x1b[48;5;236m";
	const editor = createFastTuiEditor({ editorShape: "field", panelBackground: () => open });
	editor.setText("first\nsecond");

	const raw = editor.render(20);
	assert.deepEqual(raw.map(stripAnsi), [`▐ ${"first".padEnd(16)} ▌`, `▐ ${"second".padEnd(16)} ▌`, " ".repeat(20)]);
	for (const line of raw.slice(0, 2)) {
		assert.ok(line.startsWith(`▐${open}`), JSON.stringify(line));
		assert.ok(line.endsWith("\x1b[49m▌"), JSON.stringify(line));
	}
	editor.handleMouse(mouseEvent("click", 4, 1, { width: 20, height: 8 }));
	assert.deepEqual(editor.getCursor(), { line: 1, col: 2 });
});

test("draws the rail shape as filled rows beside one accent rail", () => {
	const open = "\x1b[48;5;236m";
	const editor = createFastTuiEditor({ editorShape: "rail", panelBackground: () => open });
	editor.setText("x");

	const raw = editor.render(20);
	assert.deepEqual(raw.map(stripAnsi), [`▎ ${"x".padEnd(18)}`, " ".repeat(20)]);
	assert.ok(raw[0]!.startsWith(`▎${open}`));
	assert.ok(raw[0]!.endsWith("\x1b[49m"));
});

test("paints the field and rail caps with the accent color", () => {
	for (const [shape, caps] of [["field", ["▐", "▌"]], ["rail", ["▎"]]] as const) {
		const editor = decorateFastTuiEditor(
			new CustomEditor(tui, editorTheme, { matches: () => false } as unknown as KeybindingsManager, { paddingX: 0 }),
			tui,
			{ editorShape: shape, accentColor: (text) => `\x1b[35m${text}\x1b[39m` },
		);
		const row = editor.render(20)[0] ?? "";
		for (const cap of caps) assert.ok(row.includes(`\x1b[35m${cap}\x1b[39m`), `${shape} ${cap}`);
	}
});

for (const shape of ["borderless", "field", "rail"] as const) {
	test(`draws the working indicator on a status row above the ${shape} input`, () => {
		const editor = createFastTuiEditor({ editorShape: shape });
		editor.setText("abc");
		editor.setWorkingStatusIndicator({ renderInBorder: () => "◐ working", renderSpinnerInBorder: () => "◐" });

		const lines = editor.render(30).map(stripAnsi);
		assert.equal(lines[0], `  ${"◐ working".padEnd(28)}`);
		assert.ok(lines[1]!.includes("abc"));
		assert.ok(!lines.some((line) => line.includes("─")));
		editor.handleMouse(mouseEvent("click", 3, 1, { width: 30, height: 8 }));
		assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });
	});
}

test("lists the scroll labels on the borderless status row", () => {
	const editor = createFastTuiEditor({ editorShape: "borderless" });
	editor.setText(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"));
	for (let i = 0; i < 12; i++) editor.handleInput("\x1b[A");

	const lines = editor.render(60).map(stripAnsi);
	assert.match(lines[0] ?? "", /^ {2}↑ \d+ more ↓ \d+ more +$/);
	assert.ok(lines.slice(1).every((line) => line.startsWith("❯ ") || line.startsWith("  ")));
});

test("draws a scroll thumb in the right column of the field and rail shapes", () => {
	for (const shape of ["field", "rail"] as const) {
		const editor = createFastTuiEditor({ editorShape: shape });
		editor.setText(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"));
		for (let i = 0; i < 12; i++) editor.handleInput("\x1b[A");

		const lines = editor.render(40).map(stripAnsi);
		const thumbRows = lines.filter((line) => line.endsWith("█"));
		assert.ok(thumbRows.length >= 1, shape);
		assert.ok(thumbRows.length < lines.length - 1, shape);
		assert.ok(!lines.some((line) => /more/.test(line)), shape);
		for (const line of lines) assert.equal(visibleWidth(line), 40, shape);
	}
});

test("sizes the scroll thumb by the share of visible lines and places it by the scroll position", () => {
	assert.equal(scrollThumbRange(5, 0, 0), undefined);
	assert.deepEqual(scrollThumbRange(5, 0, 20), { start: 0, end: 1 });
	assert.deepEqual(scrollThumbRange(5, 20, 0), { start: 4, end: 5 });
	assert.deepEqual(scrollThumbRange(10, 5, 5), { start: 3, end: 8 });
});

test("keeps the footer out of the rule-less shapes", () => {
	for (const shape of ["borderless", "field", "rail"] as const) {
		const editor = createFastTuiEditor({ editorShape: shape, inlineFooter: inlineFooterStub });
		const lines = editor.render(40).map(stripAnsi);
		assert.ok(!lines.some((line) => /cwd|model/.test(line)), shape);
	}
});

for (const shape of ["native", "claude", "rule"] as const) {
	test(`embeds the working indicator in the ${shape} top rule`, () => {
		const editor = createFastTuiEditor({ editorShape: shape });
		editor.setWorkingStatusIndicator({ renderInBorder: () => "◐ working", renderSpinnerInBorder: () => "◐" });
		const top = stripAnsi(editor.render(40)[0] ?? "");
		assert.match(top, /^─── ◐ working ─+$/);
		assert.equal(visibleWidth(top), 40);
	});
}

test("embeds the inline footer in the native and claude rules", () => {
	for (const shape of ["native", "claude"] as const) {
		const editor = createFastTuiEditor({ editorShape: shape, inlineFooter: inlineFooterStub });
		const lines = editor.render(40).map(stripAnsi);
		assert.match(lines[0] ?? "", /^── cwd ─+ context ──$/);
		assert.match(lines.at(-1) ?? "", /^── model ─+ stats ──$/);
	}
});

test("keeps the footer out of the bottom-less rule shape", () => {
	const editor = createFastTuiEditor({ editorShape: "rule", inlineFooter: inlineFooterStub });
	const lines = editor.render(40).map(stripAnsi);
	assert.equal(lines[0], "─".repeat(40));
	assert.ok(!lines.some((line) => /cwd|model/.test(line)));
});

const modelInfoStub: InlineFooterRenderer = {
	enabled: () => false,
	render: () => undefined,
	renderInfo: () => "Opus 4.5 Anthropic · high",
};

test("draws the opencode panel with a rail, top spacing and an info row", () => {
	const editor = createFastTuiEditor({ editorShape: "opencode", inlineFooter: modelInfoStub });
	editor.setText("first\nsecond");

	const lines = editor.render(30).map(stripAnsi);
	assert.deepEqual(lines, [
		" ".repeat(30),
		`▌${" ".repeat(29)}`,
		`▌ ${"first".padEnd(28)}`,
		`▌ ${"second".padEnd(28)}`,
		`▌${" ".repeat(29)}`,
		`▌ ${"Opus 4.5 Anthropic · high".padEnd(28)}`,
		" ".repeat(30),
	]);
	for (const line of lines) assert.equal(visibleWidth(line), 30);
});

test("fills the opencode panel background past embedded resets", () => {
	const open = "\x1b[48;5;236m";
	const editor = createFastTuiEditor({
		editorShape: "opencode",
		panelBackground: () => open,
		inlineFooter: { ...modelInfoStub, renderInfo: () => "a\x1b[0mb" },
	});
	editor.setText("x");

	const lines = editor.render(20);
	assert.equal(lines[0], `▖\x1b[38;5;236m\x1b[7m${"▀".repeat(19)}\x1b[27;39m`, "the opening row is half gap, half panel");
	assert.equal(lines.at(-1), `▘\x1b[38;5;236m${"▀".repeat(19)}\x1b[39m`, "the closing row is half panel, half gap");
	for (const line of lines.slice(1, -1)) {
		assert.ok(line.startsWith(`▌${open}`), JSON.stringify(line));
		assert.ok(line.endsWith("\x1b[49m"), JSON.stringify(line));
	}
	assert.ok(lines.at(-2)!.includes(`a\x1b[0m${open}b`));
});

test("puts the working indicator and scroll labels below the opencode half-row margin", () => {
	const editor = createFastTuiEditor({ editorShape: "opencode", panelBackground: () => "\x1b[48;5;236m" });
	editor.setWorkingStatusIndicator({ renderInBorder: () => "◐ working", renderSpinnerInBorder: () => "◐" });
	const initialLines = editor.render(40).map(stripAnsi);
	assert.equal(initialLines[0], `▖${"▀".repeat(39)}`);
	assert.match(initialLines[1] ?? "", /^▌ +◐ working $/);

	editor.setText(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"));
	for (let i = 0; i < 12; i++) editor.handleInput("\x1b[A");
	const lines = editor.render(60).map(stripAnsi);
	assert.match(lines[1] ?? "", /^▌ +◐ working ↑ \d+ more ↓ \d+ more $/);
	assert.ok(lines.slice(1, -1).every((line) => line.startsWith("▌") && visibleWidth(line) === 60));
	assert.ok(!lines.some((line) => line.includes("─")));
});

test("embeds both inline footer lines in the opencode panel", () => {
	const editor = createFastTuiEditor({ editorShape: "opencode", inlineFooter: inlineFooterStub });
	const lines = editor.render(40).map(stripAnsi);
	assert.equal(lines[0], " ".repeat(40));
	assert.match(lines[1] ?? "", /^▌ cwd +context $/);
	assert.match(lines.at(-2) ?? "", /^▌ model +stats $/);
	assert.equal(lines.at(-1), " ".repeat(40));
});

test("maps opencode panel clicks past the rail and half-row margin", () => {
	const editor = createFastTuiEditor({ editorShape: "opencode" });
	editor.setText("abcdef\nuvwxyz");
	editor.render(40);
	editor.handleMouse(mouseEvent("click", 3, 2, { width: 40, height: 8 }));
	assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });
	editor.handleMouse(mouseEvent("click", 4, 3, { width: 40, height: 8 }));
	assert.deepEqual(editor.getCursor(), { line: 1, col: 2 });
});

test("leaves the opencode half-height edge rows blank without a 256-color or truecolor background", () => {
	for (const panelBackground of [undefined, () => "", () => "\x1b[100m"]) {
		const editor = createFastTuiEditor({ editorShape: "opencode", panelBackground });
		const lines = editor.render(20).map(stripAnsi);
		assert.equal(lines[0], " ".repeat(20));
		assert.equal(lines.at(-1), " ".repeat(20));
	}
	const truecolor = createFastTuiEditor({ editorShape: "opencode", panelBackground: () => "\x1b[48;2;33;59;73m" });
	assert.equal(truecolor.render(20)[0], `▖\x1b[38;2;33;59;73m\x1b[7m${"▀".repeat(19)}\x1b[27;39m`);
	assert.equal(truecolor.render(20).at(-1), `▘\x1b[38;2;33;59;73m${"▀".repeat(19)}\x1b[39m`);
});

test("maps clicks on the opencode info and closing rows to Pi's bottom rule", () => {
	const inner = new CustomEditor(tui, editorTheme, { matches: () => false } as unknown as KeybindingsManager, { paddingX: 0 });
	const rows: number[] = [];
	inner.handleMouse = (event) => {
		rows.push(event.y);
		return undefined;
	};
	const editor = decorateFastTuiEditor(inner, tui, { editorShape: "opencode" });
	assert.equal(editor.render(40).length, 6);
	for (const y of [3, 4, 5]) editor.handleMouse(mouseEvent("click", 5, y, { width: 40, height: 8 }));
	assert.deepEqual(rows, [2, 2, 2]);
});

test("maps clicks below the frame to Pi's completion rows without the frame inset", () => {
	for (const [shape, yOffset] of [["rounded", 0], ["claude", 0], ["rule", 1], ["borderless", 2], ["field", 2], ["rail", 2], ["opencode", -3]] as const) {
		const inner = new CustomEditor(tui, editorTheme, { matches: () => false } as unknown as KeybindingsManager, { paddingX: 0 });
		const events: TuiMouseEvent[] = [];
		inner.handleMouse = (event) => {
			events.push(event);
			return undefined;
		};
		const editor = decorateFastTuiEditor(inner, tui, { editorShape: shape });
		const rows = editor.render(40).length;
		editor.handleMouse(mouseEvent("click", 5, rows, { width: 40, height: 8 }));
		const contentRow = shape === "opencode" ? 2 : ["borderless", "field", "rail"].includes(shape) ? 0 : 1;
		editor.handleMouse(mouseEvent("click", 5, contentRow, { width: 40, height: 8 }));
		assert.equal(events[0]?.x, 5, `${shape} completion x`);
		assert.equal(events[0]?.y, rows + yOffset, `${shape} completion y`);
		assert.equal(events[1]?.x, 3, `${shape} content x`);
		assert.equal(events[1]?.y, 1, `${shape} content y`);
	}
});

test("switches the editor shape at runtime without rebuilding the editor", () => {
	let renders = 0;
	const hostTui = { ...tui, requestRender() { renders++; } } as TUI;
	const editor = createFastTuiEditor({ tui: hostTui });
	editor.setText("x");
	assert.equal(stripAnsi(editor.render(20)[0] ?? "")[0], "╭");

	editor.setEditorShape("double");
	assert.equal(renders, 1);
	assert.equal(stripAnsi(editor.render(20)[0] ?? "")[0], "╔");
});


// Hardware cursor and fullscreen settings.
test("uses the terminal hardware cursor for non-block styles", () => {
	for (const [cursorStyle, sequence] of [
		["bar", "\x1b[6 q"],
		["underline", "\x1b[4 q"],
	] as const) {
		const writes: string[] = [];
		let hardwareCursor: boolean | undefined;
		const hardwareTui = {
			...tui,
			terminal: {
				rows: 24,
				write: (data: string) => writes.push(data),
			},
			getShowHardwareCursor: () => hardwareCursor === true,
			setShowHardwareCursor: (enabled: boolean) => {
				hardwareCursor = enabled;
			},
		} as unknown as TUI;
		const editor = createFastTuiEditor({ tui: hardwareTui, cursorStyle });

		const lines = editor.render(40);

		assert.equal(hardwareCursor, true);
		assert.ok(writes.includes(sequence), `${cursorStyle} cursor sequence was sent`);
		assert.ok(lines.every((line) => !line.includes("\x1b_pi:fc")), "software block cursor was removed");
	}
});

test("shows a hardware cursor while previewing a non-block style under an overlay", () => {
	const cursorEvents: string[] = [];
	const terminal = {
		columns: 80,
		rows: 24,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		write() {},
		hideCursor: () => cursorEvents.push("hide"),
		showCursor: () => cursorEvents.push("show"),
	} as unknown as Terminal;
	const overlayTui = new TuiMainScreen(terminal, false);
	const editor = createFastTuiEditor({ tui: overlayTui });
	overlayTui.addChild(editor);
	overlayTui.setFocus(editor);
	overlayTui.showOverlay({ render: () => ["settings"], invalidate() {} });
	cursorEvents.length = 0;

	editor.setCursorStyle("bar");
	(overlayTui as unknown as { doRender(): void }).doRender();

	assert.equal(cursorEvents.at(-1), "show");

	overlayTui.hideOverlay();
	(overlayTui as unknown as { doRender(): void }).doRender();
	overlayTui.showOverlay({ render: () => ["other overlay"], invalidate() {} });
	cursorEvents.length = 0;
	(overlayTui as unknown as { doRender(): void }).doRender();
	assert.equal(cursorEvents.at(-1), "hide");
	overlayTui.stop();
});

test("preserves block hardware cursor settings", () => {
	let changes = 0;
	const hardwareTui = {
		...tui,
		getShowHardwareCursor: () => true,
		setShowHardwareCursor: () => changes++,
	} as unknown as TUI;

	createFastTuiEditor({ tui: hardwareTui });

	assert.equal(changes, 0);
});

test("does not override Pi's native fullscreen wheel setting", () => {
	let wheelSettingChanges = 0;
	const fullscreenTui = {
		...tui,
		mode: "fullscreen",
		terminal: { columns: 80, rows: 24, write() {} },
		getShowHardwareCursor: () => false,
		setShowHardwareCursor() {},
		setWheelScrollLines: () => wheelSettingChanges++,
	} as unknown as TUI;
	const host = createEditorHost(undefined, fullscreenTui);
	const editor = installEditor({} as ExtensionAPI, host.ctx);
	assert.equal(wheelSettingChanges, 0);
	assert.equal(editor.getTui(), fullscreenTui);
	editor.cleanup();
	assert.equal(wheelSettingChanges, 0);
});

type EditorFactory = NonNullable<Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]>;

function createEditorHost(initialFactory?: EditorFactory, hostTui: TUI = tui) {
	let factory: EditorFactory | undefined = initialFactory;
	let editor: EditorComponent | undefined;
	const ctx = {
		ui: {
			getEditorComponent: () => factory,
			setEditorComponent(next: EditorFactory | undefined) {
				factory = next;
				editor = next?.(hostTui, editorTheme, { matches: () => false } as unknown as KeybindingsManager)
					?? new CustomEditor(hostTui, editorTheme, { matches: () => false } as unknown as KeybindingsManager);
				editor?.setPaddingX?.(2);
			},
		},
	} as unknown as ExtensionContext;
	return { ctx, get registeredFactory() { return factory; }, get editor() { assert.ok(editor); return editor; } };
}

function createInnerEditor() {
	return new CustomEditor(tui, editorTheme, { matches: () => false } as unknown as KeybindingsManager);
}

const mouseClick = mouseEvent("click", 5, 1, { height: 8 });

// Editor factory composition, replacement, and cleanup.
test("preserves editor identity, input and cleanup in either registration order", () => {
	for (const fastTuiFirst of [false, true]) {
		const inner = createInnerEditor();
		let tabPresses = 0;
		const input = inner.handleInput.bind(inner);
		inner.handleInput = (data) => { if (data === "\t") tabPresses++; input(data); };
		const original = {
			render: inner.render, mouse: inner.handleMouse, padding: inner.setPaddingX,
			status: inner.setWorkingStatusIndicator, embed: inner.embedWorkingStatus,
		};
		const upstream = () => inner;
		const host = createEditorHost(fastTuiFirst ? undefined : upstream);
		const ui = host.ctx.ui;
		const get = ui.getEditorComponent;
		const set = ui.setEditorComponent;
		const handle = installEditor({} as ExtensionAPI, host.ctx);
		if (fastTuiFirst) ui.setEditorComponent(upstream);
		const mounted = host.registeredFactory!;
		assert.equal(host.editor, inner);
		inner.handleInput("\t");
		assert.equal(tabPresses, 1);
		assert.equal(ui.getEditorComponent(), upstream);
		assert.equal(stripAnsi(inner.render(40).join("\n")).match(/╭/g)?.length, 1);
		assert.equal(inner.getPaddingX(), 0);
		handle.cleanup();
		assert.equal(ui.getEditorComponent, get);
		assert.equal(ui.setEditorComponent, set);
		assert.equal(ui.getEditorComponent(), upstream);
		assert.equal(host.editor, inner);
		assert.equal(inner.render, original.render);
		assert.equal(inner.handleMouse, original.mouse);
		assert.equal(inner.setPaddingX, original.padding);
		assert.equal(inner.setWorkingStatusIndicator, original.status);
		assert.equal(inner.embedWorkingStatus, original.embed);
		assert.equal(inner.getPaddingX(), 2);
		assert.ok(!Object.hasOwn(inner, "setCursorStyle"));
		assert.doesNotMatch(stripAnsi(mounted(tui, editorTheme, {} as KeybindingsManager).render(40)[0]!), /^╭/);
		const reinstalled = installEditor({} as ExtensionAPI, host.ctx);
		assert.match(stripAnsi(inner.render(40)[0]!), /^╭/);
		reinstalled.cleanup();
		assert.equal(inner.render, original.render);
	}
});

test("frames reused editors from real Pi shortcut contexts and restores status", async () => {
	const { InteractiveMode } = await import(new URL(
		"./modes/interactive/interactive-mode.js",
		import.meta.resolve("@earendil-works/pi-coding-agent"),
	).href);
	const cwd = await mkdtemp(join(tmpdir(), "pi-editor-host-"));
	let runtime: AgentSessionRuntime | undefined;
	let stopHost: (() => void) | undefined;
	const extension: {
		handle?: ReturnType<typeof installEditor>;
		ui?: ExtensionContext["ui"];
		shortcutUi?: ExtensionContext["ui"];
	} = {};
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = cwd;
	try {
		const settingsManager = SettingsManager.inMemory({
			tuiMode: "regular", showHardwareCursor: false, theme: "dark",
		});
		settingsManager.setShowTerminalProgress(false);
		runtime = await createAgentSessionRuntime(async (options) => {
			const services = await createAgentSessionServices({
				cwd: options.cwd, agentDir: options.agentDir, settingsManager,
				resourceLoaderOptions: {
					noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true,
					extensionFactories: [(pi) => {
						pi.on("session_start", (_event, ctx) => {
							extension.ui = ctx.ui;
							extension.handle = installEditor(pi, ctx, "bar", {
								enabled: () => true,
								render: () => ({ top: { left: "branch", right: "" }, bottom: { left: "model", right: "" } }),
							});
						});
						pi.registerShortcut("ctrl+a", {
							description: "Replace the editor from a fresh extension context",
							handler: (ctx) => {
								extension.shortcutUi = ctx.ui;
								ctx.ui.setEditorComponent(upstream);
							},
						});
					}],
				},
			});
			assert.deepEqual(services.resourceLoader.getExtensions().errors, []);
			const result = await createAgentSessionFromServices({
				services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent,
			});
			return { ...result, services, diagnostics: services.diagnostics };
		}, { cwd, agentDir: cwd, sessionManager: SessionManager.inMemory(cwd) });
		initTheme("dark");
		const host = new InteractiveMode(runtime, { tuiMode: "regular", initialThemeSetting: "dark" });
		stopHost = () => {
			try {
				host.stop();
			} finally {
				host.ui.stop();
			}
		};
		// Mount the real renderer without starting terminal input or submitting prompts.
		host.mountInteractiveTui(host.renderer, [host.editorContainer, host.statusContainer]);
		host.setupKeyHandlers();
		host.setupEditorSubmitHandler();
		const ui = host.createExtensionUIContext();
		ui.setWorkingMessage("working");
		ui.setWorkingIndicator({ frames: ["*"] });
		host.showWorkingStatusIndicator();
		const indicator = host.activeStatusIndicator;
		const inner = new CustomEditor(host.ui, editorTheme, host.keybindings);
		const render = inner.render.bind(inner);
		let calls = 0;
		let resetRender = false;
		const upstream: EditorFactory = () => {
			calls++;
			if (resetRender) inner.render = (width) => render(width);
			return inner;
		};
		await runtime.session.bindExtensions({ uiContext: ui, mode: "tui" });
		host.setupExtensionShortcuts(runtime.session.extensionRunner);
		assert.ok(extension.handle);
		assert.equal(typeof host.defaultEditor.onSubmit, "function");
		assert.equal(typeof host.defaultEditor.onChange, "function");
		for (const reset of [false, true]) {
			resetRender = reset;
			const before = calls;
			assert.equal(host.defaultEditor.onExtensionShortcut("\x01"), true);
			assert.notEqual(extension.shortcutUi, extension.ui);
			assert.equal(calls, before + 1, "mounting must not call the factory again");
			assert.equal(host.editor, inner);
			assert.equal(inner.onSubmit, host.defaultEditor.onSubmit);
			assert.equal(extension.handle.isFramed(), true);
			const lines = stripAnsi(inner.render(60).join("\n"));
			assert.equal(lines.match(/╭/g)?.length, 1);
			assert.match(lines, /╭.*working.*branch/);
			assert.match(lines, /model/);
			assert.equal(host.statusContainer.children.length, 0);
		}
		extension.handle.cleanup();
		assert.equal(ui.getEditorComponent(), upstream);
		assert.equal(host.editor, inner);
		assert.equal(host.activeWorkingIndicatorEmbedded, false);
		assert.deepEqual(host.statusContainer.children, [indicator]);
		assert.equal(host.ui.getShowHardwareCursor(), false);
		assert.doesNotMatch(stripAnsi(inner.render(60)[0]!), /^╭/);
	} finally {
		try {
			extension.handle?.cleanup();
			stopHost?.();
		} finally {
			try {
				await runtime?.dispose();
			} finally {
				if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
				else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
				await rm(cwd, { recursive: true, force: true });
			}
		}
	}
});

test("keeps factory composition outside the frame without recursion or duplicated borders", () => {
	const host = createEditorHost();
	const handle = installEditor({} as ExtensionAPI, host.ctx);
	let calls = 0;
	const upstream: EditorFactory = () => { calls++; return createInnerEditor(); };
	host.ctx.ui.setEditorComponent(upstream);
	const previous = host.ctx.ui.getEditorComponent()!;
	assert.equal(previous, upstream);
	let widthSeen = 0;
	const wrapped: EditorFactory = (...args) => {
		const editor = previous(...args);
		const render = editor.render.bind(editor);
		editor.render = (width) => { widthSeen = width; return render(width); };
		return editor;
	};
	calls = 0;
	host.ctx.ui.setEditorComponent(wrapped);
	assert.equal(calls, 1);
	assert.equal(host.ctx.ui.getEditorComponent(), wrapped);
	const lines = stripAnsi(host.editor.render(40).join("\n"));
	assert.equal(lines.match(/╭/g)?.length, 1);
	assert.equal(widthSeen, 36);
	handle.cleanup();
	assert.equal(host.ctx.ui.getEditorComponent(), wrapped);
	host.editor.render(40);
	assert.equal(widthSeen, 40);
});

test("tracks runtime replacement, clearing and unframed editors", () => {
	let hardware = false;
	const hostTui = {
		...tui, terminal: { columns: 80, rows: 24, write() {} },
		getShowHardwareCursor: () => hardware,
		setShowHardwareCursor: (value: boolean) => { hardware = value; },
	} as unknown as TUI;
	const host = createEditorHost(undefined, hostTui);
	const handle = installEditor({} as ExtensionAPI, host.ctx, "bar");
	assert.equal(hardware, true);
	const first = createInnerEditor();
	host.ctx.ui.setEditorComponent(() => first);
	assert.equal(handle.isFramed(), true);
	const custom: EditorComponent = { render: () => ["custom"], invalidate() {}, getText: () => "", setText() {}, handleInput() {} };
	host.ctx.ui.setEditorComponent(() => custom);
	assert.equal(handle.isFramed(), false);
	assert.equal(host.editor, custom);
	assert.equal(hardware, false);
	assert.doesNotMatch(stripAnsi(first.render(40)[0]!), /^╭/);

	host.ctx.ui.setEditorComponent(undefined);
	assert.equal(host.ctx.ui.getEditorComponent(), undefined);
	assert.equal(handle.isFramed(), true);
	assert.equal(hardware, true);
	assert.match(stripAnsi(host.editor.render(40)[0]!), /^╭/);
	const latest = () => createInnerEditor();
	host.ctx.ui.setEditorComponent(latest);
	handle.cleanup();
	assert.equal(host.ctx.ui.getEditorComponent(), latest);
	assert.equal(hardware, false);
	const reset = installEditor({} as ExtensionAPI, host.ctx);
	host.ctx.ui.setEditorComponent(undefined);
	reset.cleanup();
	assert.equal(host.ctx.ui.getEditorComponent(), undefined);
});

test("saved registration proxies pass through after cleanup and later API wrappers survive", () => {
	const host = createEditorHost(createInnerEditor);
	const handle = installEditor({} as ExtensionAPI, host.ctx);
	const get = host.ctx.ui.getEditorComponent;
	const set = host.ctx.ui.setEditorComponent;
	const laterGet = () => get();
	const laterSet: typeof set = (next) => set(next);
	host.ctx.ui.getEditorComponent = laterGet;
	host.ctx.ui.setEditorComponent = laterSet;
	handle.cleanup();
	assert.equal(host.ctx.ui.getEditorComponent, laterGet);
	assert.equal(host.ctx.ui.setEditorComponent, laterSet);
	const next = createInnerEditor;
	laterSet(next);
	assert.equal(laterGet(), next);
	assert.doesNotMatch(stripAnsi(host.editor.render(40)[0]!), /^╭/);

	const reinstalled = installEditor({} as ExtensionAPI, host.ctx);
	assert.match(stripAnsi(host.editor.render(40)[0]!), /^╭/);
	reinstalled.cleanup();
	assert.equal(host.ctx.ui.getEditorComponent, laterGet);
	assert.equal(host.ctx.ui.setEditorComponent, laterSet);
	assert.doesNotMatch(stripAnsi(host.editor.render(40)[0]!), /^╭/);
});

test("falls back to the default editor when the previous factory throws", () => {
	const host = createEditorHost(() => { throw new Error("broken editor"); });
	const handle = installEditor({} as ExtensionAPI, host.ctx);
	assert.match(stripAnsi(host.editor.render(40)[0] ?? ""), /^╭/);
	handle.cleanup();
	assert.equal(host.ctx.ui.getEditorComponent(), undefined);
});

test("cleanup preserves later method and factory wrappers as passthroughs", () => {
	const cursorCalls: Array<[string, boolean | undefined]> = [];
	const inner = Object.assign(createInnerEditor(), {
		setCursorStyle(style: string, hardware?: boolean) { cursorCalls.push([style, hardware]); },
	});
	let received: TuiMouseEvent | undefined;
	inner.handleMouse = (event) => { received = event; return undefined; };
	const host = createEditorHost(() => inner);
	const handle = installEditor({} as ExtensionAPI, host.ctx);
	const inherited = host.ctx.ui.getEditorComponent()!;
	const render = CustomEditor.prototype.render.bind(inner);
	const laterFactory: EditorFactory = (...args) => {
		const editor = inherited(...args);
		editor.render = (width) => [...render(width), "later wrapper"];
		return editor;
	};
	host.ctx.ui.setEditorComponent(laterFactory);
	const mouse = inner.handleMouse.bind(inner);
	const padding = inner.setPaddingX.bind(inner);
	inner.handleMouse = (event) => mouse(event);
	inner.setPaddingX = (value) => padding(value);
	const cursor = inner.setCursorStyle.bind(inner);
	inner.setCursorStyle = (style, hardware) => cursor(style, hardware);
	inner.setCursorStyle("block", true);
	assert.deepEqual(cursorCalls, [], "fast-tui owns cursor styling while active");

	handle.cleanup();
	handle.cleanup();
	assert.equal(host.ctx.ui.getEditorComponent(), laterFactory);
	assert.doesNotMatch(stripAnsi(inner.render(40)[0] ?? ""), /^╭/);
	assert.equal(inner.render(40).at(-1), "later wrapper");
	inner.handleMouse(mouseClick);
	assert.deepEqual(received, mouseClick);
	inner.setPaddingX(3);
	assert.equal(inner.getPaddingX(), 3);
	inner.setCursorStyle("underline", true);
	assert.deepEqual(cursorCalls, [["underline", true]]);

	// 后续扩展再次调用已卸载的工厂，也不会重新启用边框。
	host.ctx.ui.setEditorComponent(laterFactory);
	assert.doesNotMatch(stripAnsi(host.editor.render(40)[0] ?? ""), /^╭/);
});

// Custom layouts and frame integration.
test("leaves custom layouts, mouse coordinates, padding and status capabilities intact", () => {
	const widths: number[] = [];
	let received: TuiMouseEvent | undefined;
	let padding = 0;
	const custom = {
		render: (width: number) => { widths.push(width); return [`custom ${width}`]; },
		invalidate() {}, getText: () => "", setText() {}, handleInput() {},
		handleMouse(event: TuiMouseEvent) { received = event; return undefined; },
		setPaddingX(value: number) { padding = value; },
	};
	const render = custom.render;
	const host = createEditorHost(() => custom);
	const handle = installEditor({} as ExtensionAPI, host.ctx, "bar");
	assert.equal(host.editor, custom);
	assert.equal(handle.isFramed(), false);
	assert.equal(custom.render, render);
	assert.equal("embedWorkingStatus" in custom, false);
	assert.deepEqual(custom.render(40), ["custom 40"]);
	assert.deepEqual(widths, [40]);
	custom.handleMouse(mouseClick);
	assert.deepEqual(received, mouseClick);
	assert.equal(padding, 2);
	handle.cleanup();
});

const nonNativeLayouts = [
	[],
	["only content"],
	["first content", "middle content", "last content"],
	["────────", "middle content", "last content"],
	["first content", "middle content", "────────"],
];

test("leaves unsupported or throwing layouts untouched during installation", () => {
	for (const content of [...nonNativeLayouts, new Error("editor not ready during probe")]) {
		const inner = createInnerEditor();
		inner.setPaddingX(2);
		inner.render = () => {
			if (content instanceof Error) throw content;
			return [...content];
		};
		const originalRender = inner.render;
		const originalMouse = inner.handleMouse;
		const originalPadding = inner.setPaddingX;
		const originalStatus = inner.setWorkingStatusIndicator;
		let hardware = false;
		const writes: string[] = [];
		const hostTui = {
			...tui,
			terminal: { columns: 80, rows: 24, write: (data: string) => writes.push(data) },
			getShowHardwareCursor: () => hardware,
			setShowHardwareCursor: (value: boolean) => { hardware = value; },
		} as unknown as TUI;
		let factoryCalls = 0;
		const upstream = () => { factoryCalls++; return inner; };
		const host = createEditorHost(upstream, hostTui);
		const handle = installEditor({} as ExtensionAPI, host.ctx, "bar", {
			enabled: () => true,
			render: () => ({ top: { left: "branch", right: "" }, bottom: { left: "model", right: "" } }),
		});
		try {
			assert.equal(factoryCalls, 1);
			assert.equal(host.editor, inner);
			assert.equal(handle.isFramed(), false, "the footer must remain outside this editor");
			if (content instanceof Error) assert.throws(() => inner.render(40), content);
			else assert.deepEqual(inner.render(40), content);
			assert.equal(inner.render, originalRender);
			assert.equal(inner.handleMouse, originalMouse);
			assert.equal(inner.setPaddingX, originalPadding);
			assert.equal(inner.getPaddingX(), 2);
			assert.equal(inner.setWorkingStatusIndicator, originalStatus);
			assert.equal(inner.embedWorkingStatus, false);
			assert.equal(hardware, false);
			assert.deepEqual(writes, []);
		} finally {
			handle.cleanup();
		}
		assert.equal(host.ctx.ui.getEditorComponent(), upstream);
	}
});

test("preserves changing layouts, full width and mouse geometry with either footer mode", () => {
	for (const inlineFooter of [false, true]) {
		const inner = createInnerEditor();
		const nativeRender = inner.render.bind(inner);
		let layout = nativeRender;
		let received: TuiMouseEvent | undefined;
		inner.render = (width) => layout(width);
		inner.handleMouse = (event) => { received = event; return undefined; };
		const host = createEditorHost(() => inner);
		const handle = installEditor({} as ExtensionAPI, host.ctx, "block", {
			enabled: () => inlineFooter,
			render: () => ({ top: { left: "branch", right: "" }, bottom: { left: "model", right: "" } }),
		});
		const click = { ...mouseClick, width: 80 };
		try {
			assert.match(stripAnsi(inner.render(80)[0]!), /^╭/);
			inner.handleMouse(click);
			assert.deepEqual(received, { ...click, x: 3, width: 76 });
			for (const content of nonNativeLayouts) {
				layout = () => [...content];
				assert.deepEqual(inner.render(80), content);
				inner.handleMouse(click);
				assert.deepEqual(received, click);
			}
			layout = (width) => ["x".repeat(width)];
			assert.deepEqual(inner.render(80), ["x".repeat(80)]);
			layout = nativeRender;
			assert.match(stripAnsi(inner.render(80)[0]!), /^╭/);
			inner.handleMouse(click);
			assert.deepEqual(received, { ...click, x: 3, width: 76 });
			inner.render(3);
			const narrowClick = { ...click, width: 3 };
			inner.handleMouse(narrowClick);
			assert.deepEqual(received, narrowClick);
		} finally {
			handle.cleanup();
		}
		inner.handleMouse(click);
		assert.deepEqual(received, click);
	}
});

test("checks the layout rendered at the frame inner width", () => {
	const inner = createInnerEditor();
	const nativeRender = inner.render.bind(inner);
	const content = ["first content", "middle content", "last content"];
	const widths: number[] = [];
	inner.render = (width) => {
		widths.push(width);
		return width >= 80 ? nativeRender(width) : [...content];
	};
	const host = createEditorHost(() => inner);
	const handle = installEditor({} as ExtensionAPI, host.ctx);
	try {
		assert.deepEqual(widths, [80]);
		assert.deepEqual(inner.render(80), nativeRender(80));
		assert.deepEqual(widths, [80, 76, 80]);
		assert.match(stripAnsi(inner.render(84)[0]!), /^╭/);
	} finally {
		handle.cleanup();
	}
});

test("recognizes native borders with ghost text and completion rows below the editor", () => {
	const inner = createInnerEditor();
	const render = inner.render.bind(inner);
	inner.render = (width) => {
		const lines = render(width);
		lines[0] = `\x1b[36m${lines[0]}\x1b[0m`;
		lines[1] = (lines[1] ?? "").replace(/ {3,}$/, " ghost suggestion");
		return [...lines, "completion candidate"];
	};
	let calls = 0;
	const host = createEditorHost(() => { calls++; return inner; });
	const handle = installEditor({} as ExtensionAPI, host.ctx);
	try {
		assert.equal(calls, 1);
		assert.equal(handle.isFramed(), true);
		assert.equal(decorateFastTuiEditor(inner, tui), inner);
		const lines = inner.render(60).map(stripAnsi);
		assert.equal(lines.join("\n").match(/╭/g)?.length, 1);
		assert.match(lines[1]!, /^│ .*ghost suggestion.* │$/);
		assert.equal(visibleWidth(lines[1]!), 60);
		assert.match(lines.at(-2)!, /^╰/);
		assert.equal(lines.at(-1), "completion candidate");
	} finally {
		handle.cleanup();
	}
});

test("restores cursor shape and visibility when the editor is removed", () => {
	const writes: string[] = [];
	const visibility: boolean[] = [];
	const hardwareTui = {
		...tui,
		terminal: {
			columns: 80,
			rows: 24,
			write: (data: string) => writes.push(data),
		},
		getShowHardwareCursor: () => false,
		setShowHardwareCursor: (enabled: boolean) => visibility.push(enabled),
	} as unknown as TUI;
	const host = createEditorHost(undefined, hardwareTui);
	const editor = installEditor({} as ExtensionAPI, host.ctx, "bar");
	editor.cleanup();

	assert.ok(writes.includes("\x1b[0 q"), "cursor shape was reset");
	assert.deepEqual(visibility, [true, false]);
});

test("frame recolors via borderColor (bash mode / thinking level hook)", () => {
	const painted: string[] = [];
	const theme = {
		...editorTheme,
		borderColor: (text: string) => {
			painted.push(text);
			return text;
		},
	} as EditorTheme;
	const editor = createFastTuiEditor({ theme });
	editor.setText("hi");
	editor.setWorkingStatusIndicator({
		renderInBorder: () => "◐ working",
		renderSpinnerInBorder: () => "◐",
	});

	const lines = editor.render(40);
	const top = stripAnsi(lines[0] ?? "");
	const body = stripAnsi(lines[1] ?? "");

	// Frame shape stays intact and working corners route through borderColor.
	assert.ok(top.startsWith("╭") && top.endsWith("╮"), `top border shape: ${top!}`);
	assert.ok(body.startsWith("│") && body.endsWith("│"), `body rails: ${body!}`);
	assert.ok(painted.some((text) => text.startsWith("╭")), "left top corner bypassed borderColor");
	assert.ok(painted.some((text) => text.endsWith("╮")), "right top corner bypassed borderColor");
});

test("keeps a hardware cursor after Pi re-applies its runtime settings", () => {
	const cursorEvents: string[] = [];
	const terminal = {
		columns: 80,
		rows: 24,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		write() {},
		hideCursor: () => cursorEvents.push("hide"),
		showCursor: () => cursorEvents.push("show"),
	} as unknown as Terminal;
	const hostTui = new TuiMainScreen(terminal, false);
	const editor = createFastTuiEditor({ tui: hostTui, cursorStyle: "bar" });
	hostTui.addChild(editor);
	hostTui.setFocus(editor);

	// Pi re-applies settings.showHardwareCursor after session_start on /reload,
	// which would leave no cursor at all: the software cursor is stripped for
	// non-block styles.
	hostTui.setShowHardwareCursor(false);
	cursorEvents.length = 0;
	(hostTui as unknown as { doRender(): void }).doRender();
	assert.equal(cursorEvents.at(-1), "show");

	assert.ok(
		editor.render(40).every((line) => !line.includes("\x1b_pi:fc")),
		"software cursor stays stripped",
	);
	hostTui.stop();
});

test("hides the block cursor while a popup overlay holds focus", () => {
	const terminal = {
		columns: 80,
		rows: 24,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		write() {},
		hideCursor() {},
		showCursor() {},
	} as unknown as Terminal;
	const hostTui = new TuiMainScreen(terminal, false);
	const editor = createFastTuiEditor({ tui: hostTui });
	hostTui.addChild(editor);
	hostTui.setFocus(editor);
	const hasCursor = () => editor.render(40).some((line) => line.includes("\x1b_pi:fc"));
	assert.ok(hasCursor(), "focused editor draws its block cursor");

	const menu = { render: () => ["menu"], invalidate() {}, handleInput() {}, focused: false };
	const overlay = hostTui.showOverlay(menu, { nonCapturing: true });
	hostTui.setFocus(menu);
	assert.ok(!hasCursor(), "no editor cursor behind the focused popup");

	overlay.hide();
	hostTui.setFocus(editor);
	assert.ok(hasCursor(), "cursor returns with focus");
	hostTui.stop();
});

// Header layout and colors.
function createHeader(accent = "\x1b[35m"): FastTuiHeader {
	return new FastTuiHeader(
		{
			getCommands: () => [],
			getThinkingLevel: () => "off",
		} as unknown as ExtensionAPI,
		{
			cwd: process.cwd(),
			ui: {
				theme: {
					fg: (color: string, text: string) => color === "accent" ? `${accent}${text}\x1b[39m` : text,
					bold: (text: string) => text,
				},
			},
		} as unknown as ExtensionContext,
		{ ...tui, terminal: { columns: 80, rows: 40 } } as TUI,
	);
}

test("clips the compact header to every narrow viewport width", () => {
	const header = createHeader();
	for (let width = 0; width < 24; width++) {
		const lines = header.render(width);
		assert.equal(lines.length, 1);
		assert.ok(lines.every((line) => visibleWidth(line) <= width), `header width ${width}`);
		assert.equal(stripAnsi(lines[0] ?? ""), `Pi v${VERSION}`.slice(0, width));
	}
});

test("keeps the static seven-row logo shape, spacing, and per-cell theme coloring", () => {
	const logo = [
		"            ",
		"            ",
		"█████████   ",
		"███   ███   ",
		"██████   ███",
		"███      ███",
		"            ",
	];
	for (const accent of ["\x1b[35m", "\x1b[36m"]) {
		const header = createHeader(accent);
		const paint = (text: string) => `${accent}${text}\x1b[39m`;
		const expected = logo.map((line) =>
			`${paint("│")}${" ".repeat(13)}${line.replace(/███/g, paint)}${" ".repeat(13)}${paint("│")}`,
		);
		assert.deepEqual(header.render(40).slice(1, 8), expected);
		header.invalidate();
		assert.deepEqual(header.render(40).slice(1, 8), expected);
	}
});

// Stream-write contract and repaint cleanup.
function fakeTtyStream(written: string[], isTTY = true) {
	const write = (chunk: string, ...rest: unknown[]) => {
		written.push(chunk);
		const callback = rest.find((arg): arg is (error?: Error | null) => void => typeof arg === "function");
		setImmediate(() => callback?.(chunk === "fail" ? new Error("closed") : null));
		return false;
	};
	return { stream: { isTTY, write } as unknown as NodeJS.WriteStream, write };
}

const flushImmediates = () => new Promise((resolve) => setImmediate(resolve));

test("repaints after each raw TTY write without changing the write contract", async () => {
	const written: string[] = [];
	const { stream } = fakeTtyStream(written);
	let repaints = 0;
	repaintAfterStreamWrites(() => repaints++, stream);

	const errors: (Error | null | undefined)[] = [];
	assert.equal(stream.write("plain\n"), false, "return value passes through");
	stream.write("encoded\n", "utf8", (error) => errors.push(error));
	stream.write("fail", (error) => errors.push(error));
	assert.equal(repaints, 0, "repaint waits for the write to finish");
	await flushImmediates();

	assert.deepEqual(written, ["plain\n", "encoded\n", "fail"]);
	assert.equal(repaints, 3);
	assert.equal(errors[0], null);
	assert.equal(errors[1]?.message, "closed");

	const throwing = fakeTtyStream([]).stream;
	repaintAfterStreamWrites(() => {
		throw new Error("render failed");
	}, throwing);
	let called = false;
	throwing.write("x", () => {
		called = true;
	});
	await flushImmediates();
	assert.equal(called, true, "a failed repaint still runs the caller callback");
});

test("stream restore stops repaints and keeps later wrappers", async () => {
	const written: string[] = [];
	const { stream, write: originalWrite } = fakeTtyStream(written);
	let repaints = 0;

	const restore = repaintAfterStreamWrites(() => repaints++, stream);
	stream.write("pending");
	restore();
	assert.equal(stream.write, originalWrite as unknown, "restores the original write");
	await flushImmediates();
	assert.equal(repaints, 0, "a write pending at cleanup does not repaint");

	const restoreAgain = repaintAfterStreamWrites(() => repaints++, stream);
	const ours = stream.write as unknown as (...args: unknown[]) => boolean;
	const outer = ((...args: unknown[]) => ours(...args)) as typeof stream.write;
	stream.write = outer;
	restoreAgain();
	assert.equal(stream.write, outer, "keeps a later wrapper in place");
	stream.write("through outer");
	await flushImmediates();
	assert.equal(written.at(-1), "through outer");
	assert.equal(repaints, 0, "the disabled wrapper only passes writes through");

	const pipe = fakeTtyStream([], false);
	repaintAfterStreamWrites(() => repaints++, pipe.stream);
	assert.equal(pipe.stream.write, pipe.write as unknown, "non-TTY streams are left alone");
});
