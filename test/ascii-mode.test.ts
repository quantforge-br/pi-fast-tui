// Under the ASCII glyph set and icon mode, every surface pi-fast-tui draws stays within ASCII.

import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { keyHint, keyText } from "@earendil-works/pi-coding-agent";
import type { Component, KeybindingsManager, MarkdownTheme, TUI } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCardRenderers } from "../src/cards/card.ts";
import { createCodemodeCard } from "../src/cards/codemode/card.ts";
import { ChangeLog } from "../src/cards/codemode/changes.ts";
import { LiveCalls } from "../src/cards/codemode/live.ts";
import { setCardGlyphMode } from "../src/cards/symbols.ts";
import { bashCard } from "../src/cards/tools/bash.ts";
import { editCard } from "../src/cards/tools/edit.ts";
import { createGenericCard } from "../src/cards/tools/generic.ts";
import { readCard } from "../src/cards/tools/read.ts";
import { findCard, grepCard, lsCard } from "../src/cards/tools/search.ts";
import { writeCard } from "../src/cards/tools/write.ts";
import { DEFAULT_CONFIG, type FastTuiConfig } from "../src/ui/config.ts";
import { renderFramedCode } from "../src/ui/copy-buttons.ts";
import { installFooter } from "../src/ui/footer.ts";
import { emptyGitStatus } from "../src/ui/git.ts";
import { FastTuiHeader } from "../src/ui/header.ts";
import { resolveGlyphs } from "../src/ui/icons.ts";
import { buildPeekLabel } from "../src/ui/peek.ts";
import { PopupPanel } from "../src/ui/popup-panel.ts";
import { registerSettingsCommand } from "../src/ui/settings-command.ts";
import { invalidateUsageCache, type FooterState } from "../src/ui/state.ts";
import { formatTurnTelemetry, type TurnTelemetry } from "../src/ui/telemetry.ts";
import { createCompactRenderers } from "../src/ui/tool-view.ts";
import { draw, newRow, type Row, text } from "./cards/row.ts";

const ASCII = /^[\x00-\x7F]*$/;

const theme = {
	fg: (_color: string, value: string) => `\x1b[33m${value}\x1b[39m`,
	bg: (_color: string, value: string) => value,
	bold: (value: string) => value,
	italic: (value: string) => value,
	underline: (value: string) => value,
	inverse: (value: string) => value,
	getBgAnsi: () => "",
	getColorMode: () => "256color",
	colors: {},
} as unknown as Theme;

/** Fail with the surface name and the offending line when a line leaves ASCII. */
function expectAscii(surface: string, lines: readonly string[]): void {
	expect(lines.length, `${surface} drew nothing`).toBeGreaterThan(0);
	for (const line of lines) expect(stripVTControlCharacters(line), surface).toMatch(ASCII);
}

beforeEach(() => {
	setCardGlyphMode("ascii");
});

afterEach(() => {
	setCardGlyphMode("unicode");
});

describe("footer", () => {
	const entries = [{
		id: "usage-1",
		timestamp: Date.now(),
		type: "message",
		message: {
			role: "assistant",
			usage: { input: 90, output: 12, cacheRead: 5000, cacheWrite: 27009, cost: { total: 0.01 } },
		},
	}];

	function footer(state: Partial<FooterState>): Component {
		let factory: NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]> | undefined;
		const ctx = {
			model: { provider: "openai", contextWindow: 1_000 },
			ui: { setFooter: (next: typeof factory) => { factory = next; } },
			sessionManager: {
				getCwd: () => "/work/projects/a-rather-long-project-name",
				getLeafId: () => entries.at(-1)!.id,
				getEntries: () => entries,
				getSessionName: () => "session",
			},
			getContextUsage: () => ({ tokens: 250, contextWindow: 1_000, percent: 25 }),
		} as unknown as ExtensionContext;
		const config = structuredClone(DEFAULT_CONFIG);
		config.icons.mode = "ascii";
		config.footerSegments.sessionName = true;
		const footerState: FooterState = {
			git: { ...emptyGitStatus(), branch: "feature/a-very-long-branch-name", ahead: 1, behind: 2, modified: 3, untracked: 1, staged: 2, stashed: 1 },
			runtime: { name: "nodejs", version: "24.6.0" },
			workingSince: undefined,
			lastDoneIn: undefined,
			lastOutcome: undefined,
			...state,
		};
		installFooter(
			ctx,
			() => footerState,
			() => config,
			() => ({ provider: "OpenAI", model: "gpt-5", effort: "high" }),
			{ setRequestRender() {}, scheduleGitRefresh() {} },
		);
		const data = { onBranchChange: () => () => {}, getExtensionStatuses: () => new Map() } as unknown as ReadonlyFooterDataProvider;
		return factory!({ requestRender() {} } as TUI, theme, data) as Component;
	}

	afterEach(() => invalidateUsageCache());

	for (const [name, state] of [
		["working", { workingSince: Date.now() - 2_000 }],
		["done", { lastDoneIn: 3_000, lastOutcome: "done" }],
		["failed", { lastDoneIn: 3_000, lastOutcome: "failed" }],
	] as const) {
		it(`draws both rows in ASCII while ${name}`, () => {
			const component = footer(state);
			for (const width of [160, 80, 40, 20]) expectAscii(`footer ${name} at ${width}`, component.render(width));
		});
	}
});

describe("telemetry", () => {
	const telemetry: TurnTelemetry = {
		tps: null, ttftMs: 200, totalMs: 900, inputTokens: 50, outputTokens: 20, cacheReadTokens: 5_000,
		stallMs: 800, stallCount: 1, rateUsdPerMTokens: 4, generationMs: 700, totalTokens: 70, costUsd: 0.00028,
		measurementMs: 400,
	};

	it("draws a missing TPS value and a stall in ASCII", () => {
		for (const width of [undefined, 60, 30]) {
			expectAscii(`telemetry at ${width}`, formatTurnTelemetry(telemetry, theme, DEFAULT_CONFIG.telemetry, "ascii", width).split("\n"));
		}
	});
});

describe("cards", () => {
	function settled(args: unknown, output: string, options: { isError?: boolean; details?: unknown; expanded?: boolean } = {}): Row {
		const row = newRow(args);
		row.argsComplete = true;
		row.executionStarted = true;
		row.isPartial = false;
		row.isError = options.isError ?? false;
		row.expanded = options.expanded ?? false;
		row.durationMs = 1_234;
		row.result = { content: [text(output)], details: options.details };
		return row;
	}

	const many = Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(i * 3)}`).join("\n");
	const cases: Array<[string, ToolRenderers, unknown, string, { details?: unknown }?]> = [
		["bash", createCardRenderers(bashCard), { command: "npm test -- --reporter verbose", timeout: 30 }, `${many}\n\nCommand exited with code 2`],
		["read", createCardRenderers(readCard), { path: "src/a.ts", offset: 1, limit: 40 }, many],
		["edit", createCardRenderers(editCard), { path: "src/a.ts", edits: [{ oldText: "a", newText: "b" }] }, "Edited", {
			details: { diff: " 1 keep\n-2 old line\n+2 new line\n    ...\n 9 tail" },
		}],
		["write", createCardRenderers(writeCard), { path: "src/b.ts", content: many }, "Successfully wrote"],
		["grep", createCardRenderers(grepCard), { pattern: "line", path: "src" }, Array.from({ length: 20 }, (_, i) => `src/f${i}.ts:${i}: line ${"y".repeat(80)}`).join("\n")],
		["find", createCardRenderers(findCard), { pattern: "*.ts" }, Array.from({ length: 30 }, (_, i) => `src/deep/path/${i}/file-${"z".repeat(70)}.ts`).join("\n")],
		["ls", createCardRenderers(lsCard), { path: "." }, "src/\ntest/\nREADME.md\npackage.json"],
		["generic", createCardRenderers(createGenericCard("wiki_lookup")), { query: "a ".repeat(80), nested: { list: [1, 2, 3] } }, JSON.stringify({ items: [{ title: "x".repeat(120) }] })],
	];

	for (const [name, renderers, args, output, extra] of cases) {
		it(`draws the ${name} card in ASCII collapsed, expanded and failed`, () => {
			for (const expanded of [false, true]) {
				for (const isError of [false, true]) {
					for (const width of [80, 40]) {
						const drawn = draw(renderers, settled(args, output, { ...extra, expanded, isError }), width);
						expectAscii(`${name} expanded=${expanded} error=${isError} at ${width}`, drawn.split("\n"));
					}
				}
			}
			const running = newRow(args);
			running.argsComplete = true;
			running.executionStarted = true;
			expectAscii(`${name} running`, draw(renderers, running, 60).split("\n"));
		});
	}

	it("draws the codemode card in ASCII collapsed, expanded and failed", () => {
		const id = "call-1";
		const calls = [
			{ id: `${id}/1`, name: "read", args: JSON.stringify({ path: "src/a.ts" }), status: "ok", durationMs: 5 },
			{ id: `${id}/2`, name: "edit", args: JSON.stringify({ path: "src/a.ts" }), status: "ok", durationMs: 10 },
			{ id: `${id}/3`, name: "bash", args: JSON.stringify({ command: "make" }), status: "error", error: "boom\nstack" },
		];
		const changes = new ChangeLog();
		changes.record(id, `${id}/2`, { path: "/project/src/a.ts", added: 1, removed: 1, diff: "-1 before\n+1 after" });
		const renderers = createCardRenderers(createCodemodeCard(new LiveCalls(), changes));
		const code = "// Fix the build\nconst files = await tools.read({ path: 'src/a.ts' });\nawait tools.bash({ command: 'make' });";
		for (const expanded of [false, true]) {
			for (const isError of [false, true]) {
				const row = newRow({ code });
				row.argsComplete = true;
				row.executionStarted = true;
				row.isPartial = false;
				row.isError = isError;
				row.expanded = expanded;
				row.durationMs = 1_500;
				const status = isError ? "Script failed" : "Script completed";
				row.result = {
					content: [text(`${status}\nWall time 1.5 seconds\nOutput:\n`), text(isError ? "Script error: boom" : `<console_output>\n${many}\n</console_output>`)],
					details: { calls },
				};
				expectAscii(`codemode expanded=${expanded} error=${isError}`, draw(renderers, row, 70).split("\n"));
			}
		}
		expectAscii("codemode streaming", draw(renderers, newRow({ code }), 70).split("\n"));
	});
});

describe("compact rows", () => {
	function context(overrides: Record<string, unknown>) {
		return {
			keyText, keyHint, args: {}, toolCallId: "call-1", invalidate() {}, lastComponent: undefined, state: {},
			cwd: "/repo", executionStarted: true, argsComplete: true, isPartial: false, expanded: false,
			showImages: false, isError: false, durationMs: 1_234, outputPad: 1, ...overrides,
		} as unknown as Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
	}

	for (const [tool, args, output] of [
		["bash", { command: "npm test" }, "one\ntwo\nthree"],
		["edit", { path: "src/a.ts" }, "Edited"],
		["grep", { pattern: "x" }, "a.ts:1: x\nb.ts:9: y"],
		["wiki_lookup", { query: "a ".repeat(60) }, "found"],
	] as const) {
		it(`draws a ${tool} row in ASCII when it succeeds, fails and runs`, () => {
			const compact = createCompactRenderers(tool, undefined, () => resolveGlyphs("ascii"), undefined, tool === "wiki_lookup");
			for (const overrides of [{}, { isError: true }, { isPartial: true, durationMs: undefined }]) {
				const ctx = context({ ...overrides, state: {} });
				const details = tool === "edit" ? { diff: " 1 a\n-2 b\n+2 c" } : undefined;
				const result = { content: [{ type: "text" as const, text: output }], details };
				const lines = [
					...compact.renderCall!(args, theme, ctx).render(60),
					...compact.renderResult!(result, { expanded: false, isPartial: ctx.isPartial }, theme, ctx).render(60),
				];
				expectAscii(`${tool} ${JSON.stringify(overrides)}`, lines);
			}
		});
	}
});

it("draws the popup panel border, title and a clipped row in ASCII", () => {
	const menu: Component = { render: () => ["x".repeat(120), "short"], invalidate() {} };
	const panel = new PopupPanel(menu, {
		title: "A rather long popup title that will not fit",
		hint: "esc",
		background: () => "",
		border: (value) => value,
		maxRows: () => undefined,
	});
	expectAscii("popup", panel.render(30));
});

it("draws the Copy code frame in ASCII", () => {
	const markdownTheme = {
		codeBlock: (value: string) => value,
		codeBlockBorder: (value: string) => value,
	} as unknown as MarkdownTheme;
	expectAscii("copy frame", renderFramedCode(markdownTheme, "const a = 1;\n" + "y".repeat(80), "a-very-long-language-name", 30, "[Copy]"));
});

describe("header", () => {
	function header(rows: number): FastTuiHeader {
		return new FastTuiHeader(
			{ getCommands: () => ["login", "model", "quit"].map((name) => ({ name })), getThinkingLevel: () => "medium" } as unknown as ExtensionAPI,
			{ cwd: `/work/${"deep/".repeat(20)}project`, model: { provider: "mock", id: "mock-model" }, ui: { theme } } as unknown as ExtensionContext,
			{ terminal: { rows, columns: 80 }, requestRender() {} } as unknown as TUI,
		);
	}

	it("draws the full and compact headers in ASCII", () => {
		for (const width of [100, 60, 30]) {
			expectAscii(`full header at ${width}`, header(40).render(width));
			expectAscii(`compact header at ${width}`, header(20).render(width));
		}
	});
});

it("draws every tab of the English /fast-tui dialog in ASCII, except the language row", async () => {
	let handler: ((args: string, ctx: ExtensionContext) => Promise<void> | void) | undefined;
	let component: (Component & { handleInput(data: string): void }) | undefined;
	let config: FastTuiConfig = { ...structuredClone(DEFAULT_CONFIG), icons: { ...DEFAULT_CONFIG.icons, mode: "ascii" } };
	registerSettingsCommand({ registerCommand: (_name: string, options: { handler: typeof handler }) => { handler = options.handler; } } as unknown as ExtensionAPI, {
		getConfig: () => config,
		onConfigChanged: (next) => { config = next; },
		onOverlayClosed() {},
	});
	const ctx = {
		hasUI: true,
		mode: "tui",
		ui: {
			custom: (factory: (tui: TUI, theme: Theme, keys: KeybindingsManager, done: () => void) => Component) => new Promise<void>(() => {
				component = factory({ terminal: { columns: 80, rows: 24 }, requestRender() {} } as unknown as TUI, theme, {} as KeybindingsManager, () => {}) as typeof component;
			}),
		},
	} as unknown as ExtensionContext;
	void handler!("", ctx);
	for (let tab = 0; tab < 4; tab++) {
		for (const width of [100, 60]) {
			const lines = component!.render(width).filter((line) => !line.includes("Language"));
			expectAscii(`/fast-tui tab ${tab} at ${width}`, lines);
		}
		component!.handleInput("\t");
	}
});

it("draws the thinking-peek label in ASCII while thinking, done and idle", () => {
	const glyphs = resolveGlyphs("ascii");
	for (const width of [80, 20]) {
		for (const lines of [1, 2]) {
			expectAscii("peek idle", buildPeekLabel({ phase: "idle", tail: "" }, 0, glyphs, width, lines).split("\n"));
			expectAscii("peek done", buildPeekLabel({ phase: "done", tail: "" }, 0, glyphs, width, lines).split("\n"));
			for (let frame = 0; frame < 4; frame++) {
				const state = { phase: "thinking" as const, tail: `first thought\n${"deriving the answer ".repeat(10)}` };
				expectAscii("peek thinking", buildPeekLabel(state, frame, glyphs, width, lines).split("\n"));
			}
		}
	}
});
