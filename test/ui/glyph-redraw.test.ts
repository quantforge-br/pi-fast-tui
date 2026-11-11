import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "./fixtures/node-test.ts";
import { createEventBus, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { cardGlyphMode, setCardGlyphMode } from "../../src/cards/symbols.ts";
import { DEFAULT_CONFIG, type FastTuiConfig } from "../../src/ui/config.ts";
import fastTui from "../../src/ui/index.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as unknown as Theme;

/** Run as an interactive UTF-8 terminal (`tty`) or as a non-TTY with a C locale, restored after the test. */
function terminal(t: { after(fn: () => unknown): void }, tty: boolean): void {
	const keys = ["TERM", "LC_ALL", "LC_CTYPE", "LANG", "SSH_TTY", "SSH_CONNECTION"] as const;
	const saved = keys.map((key) => [key, process.env[key]] as const);
	const ownIsTTY = Object.hasOwn(process.stdout, "isTTY");
	const isTTY = process.stdout.isTTY;
	for (const key of keys) delete process.env[key];
	process.env.TERM = "xterm-256color";
	process.env.LANG = tty ? "C.UTF-8" : "C";
	Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: tty });
	t.after(() => {
		for (const [key, value] of saved) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		if (ownIsTTY) Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: isTTY });
		else delete (process.stdout as { isTTY?: boolean }).isTTY;
	});
}

async function harness(t: { after(fn: () => unknown): void }, edit: (config: FastTuiConfig) => void = () => {}) {
	const handlers = new Map<string, Array<(event: any, ctx: ExtensionContext) => unknown>>();
	let command: ((args: string, ctx: ExtensionContext) => unknown) | undefined;
	const calls: string[] = [];
	const tui = {
		terminal: { columns: 120, rows: 40, write() {} },
		children: [],
		getShowHardwareCursor: () => false,
		setShowHardwareCursor() {},
		invalidate: () => calls.push("invalidate"),
		requestRender: () => calls.push("requestRender"),
	};
	const pi = {
		on(event: string, handler: (event: any, ctx: ExtensionContext) => unknown) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		registerCommand: (name: string, options: { handler: typeof command }) => {
			if (name === "fast-tui") command = options.handler;
		},
		registerToolRenderer() {},
		registerMarkdownTransformer() {},
		getCommands: () => [],
		events: createEventBus(),
		getThinkingLevel: () => "off",
	} as unknown as ExtensionAPI;
	let editorFactory: unknown;
	let settings: (Component & { handleInput(data: string): void }) | undefined;
	const ctx = {
		hasUI: true,
		mode: "tui",
		isIdle: () => true,
		cwd: process.cwd(),
		model: undefined,
		sessionManager: { getCwd: () => "/work", getLeafId: () => null, getEntries: () => [], getSessionName: () => undefined },
		getContextUsage: () => undefined,
		ui: {
			theme,
			notify() {},
			setHeader() {},
			setFooter() {},
			getEditorComponent: () => editorFactory,
			setEditorComponent(factory?: unknown) {
				editorFactory = factory;
				if (typeof factory === "function") factory(tui, { borderColor: (text: string) => text }, { matches: () => false });
			},
			setHiddenThinkingLabel() {},
			custom: (factory: (tui: TUI, theme: Theme, kb: unknown, done: () => void) => typeof settings) =>
				new Promise<void>(() => {
					settings = factory(tui as unknown as TUI, theme, {}, () => {});
				}),
		},
	} as unknown as ExtensionContext;
	const emit = async (event: string) => {
		for (const handler of handlers.get(event) ?? []) await handler({ type: event, reason: "startup" }, ctx);
	};

	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const agentDir = await mkdtemp(join(tmpdir(), "fast-tui-glyphs-"));
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const config = { ...structuredClone(DEFAULT_CONFIG), popupMenus: false };
	config.footerSegments.gitBranch = false;
	config.footerSegments.gitStatus = false;
	config.footerSegments.runtime = false;
	edit(config);
	await writeFile(join(agentDir, "fast-tui.json"), JSON.stringify(config), "utf8");
	t.after(async () => {
		await emit("session_shutdown");
		setCardGlyphMode("unicode");
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		await rm(agentDir, { recursive: true, force: true });
	});

	fastTui(pi);
	await emit("session_start");
	const openSettings = () => {
		void command?.("", ctx);
		assert.ok(settings);
		return settings;
	};
	return { calls, openSettings };
}

test("redraws the transcript only when /fast-tui changes the glyph set", async (t) => {
	terminal(t, true);
	const { calls, openSettings } = await harness(t);
	const settings = openSettings();
	settings.handleInput("\t");
	// Icon mode: Auto → Nerd → Unicode keeps the Unicode card glyphs.
	calls.length = 0;
	settings.handleInput("\x1b[C");
	settings.handleInput("\x1b[C");
	assert.equal(cardGlyphMode(), "unicode");
	assert.equal(calls.includes("invalidate"), false);
	// Unicode → ASCII switches the set and redraws everything.
	settings.handleInput("\x1b[C");
	assert.equal(cardGlyphMode(), "ascii");
	assert.ok(calls.includes("invalidate"));
	assert.ok(calls.lastIndexOf("requestRender") > calls.indexOf("invalidate"));
});

test("applies an ASCII icon mode from the configuration file at session start", async (t) => {
	setCardGlyphMode("unicode");
	await harness(t, (config) => {
		config.icons.mode = "ascii";
	});
	assert.equal(cardGlyphMode(), "ascii");
});

test("auto icon mode that falls back to ASCII switches the cards to ASCII at session start", async (t) => {
	setCardGlyphMode("unicode");
	terminal(t, false);
	await harness(t, (config) => {
		config.icons.mode = "auto";
	});
	assert.equal(cardGlyphMode(), "ascii");
});

test("auto icon mode on a UTF-8 terminal keeps the Unicode cards", async (t) => {
	setCardGlyphMode("ascii");
	terminal(t, true);
	await harness(t, (config) => {
		config.icons.mode = "auto";
	});
	assert.equal(cardGlyphMode(), "unicode");
});
