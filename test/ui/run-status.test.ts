import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import test from "./fixtures/node-test.ts";
import {
	createEventBus,
	type ExtensionAPI,
	type ExtensionContext,
	type ReadonlyFooterDataProvider,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG } from "../../src/ui/config.ts";
import fastTui from "../../src/ui/index.ts";

const theme = {
	fg: (color: string, text: string) => `<${color}>${text}`,
	bold: (text: string) => text,
} as unknown as Theme;

function assistant(stopReason: "stop" | "error" | "aborted") {
	return { role: "assistant", content: [], stopReason };
}

async function runStatusHarness(t: { after(fn: () => unknown): void }) {
	const handlers = new Map<string, Array<(event: any, ctx: ExtensionContext) => unknown>>();
	let footerFactory: ((...args: unknown[]) => Component) | undefined;
	const pi = {
		on(event: string, handler: (event: any, ctx: ExtensionContext) => unknown) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		registerCommand() {},
		registerToolRenderer() {},
		registerMarkdownTransformer() {},
		getCommands: () => [],
		events: createEventBus(),
		getThinkingLevel: () => "off",
	} as unknown as ExtensionAPI;
	const tui = {
		terminal: { columns: 200, rows: 40, write() {} },
		children: [],
		getShowHardwareCursor: () => false,
		setShowHardwareCursor() {},
		invalidate() {},
		requestRender() {},
	};
	let editorFactory: unknown;
	const ctx = {
		hasUI: true,
		mode: "tui",
		isIdle: () => false,
		cwd: process.cwd(),
		model: undefined,
		sessionManager: {
			getCwd: () => "/work/project",
			getLeafId: () => null,
			getEntries: () => [],
			getSessionName: () => undefined,
		},
		getContextUsage: () => undefined,
		ui: {
			theme,
			notify() {},
			setHeader() {},
			setFooter(factory?: (...args: unknown[]) => Component) {
				footerFactory = factory;
			},
			getEditorComponent: () => editorFactory,
			setEditorComponent(factory?: unknown) {
				editorFactory = factory;
				if (typeof factory === "function") {
					factory(tui, { borderColor: (text: string) => text }, { matches: () => false });
				}
			},
			setHiddenThinkingLabel() {},
		},
	} as unknown as ExtensionContext;
	const emit = async (event: string, payload: Record<string, unknown> = {}) => {
		for (const handler of handlers.get(event) ?? []) await handler({ type: event, ...payload }, ctx);
	};

	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const agentDir = await mkdtemp(join(tmpdir(), "fast-tui-run-status-"));
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const config = structuredClone(DEFAULT_CONFIG);
	config.icons.mode = "ascii";
	config.telemetry.enabled = false;
	config.thinkingPeek.lines = 0;
	config.footerSegments.gitBranch = false;
	config.footerSegments.gitStatus = false;
	config.footerSegments.runtime = false;
	await writeFile(join(agentDir, "fast-tui.json"), JSON.stringify(config), "utf8");
	t.after(async () => {
		await emit("session_shutdown");
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		await rm(agentDir, { recursive: true, force: true });
	});

	fastTui(pi);
	await emit("session_start", { reason: "startup" });
	assert.ok(footerFactory, "the footer is installed on session_start");
	const footerData = {
		onBranchChange: () => () => {},
		getExtensionStatuses: () => new Map(),
	} as unknown as ReadonlyFooterDataProvider;
	const component = footerFactory(tui, theme, footerData);
	const timer = () => component.render(200)[0]!;
	return { emit, timer };
}

test("footer run status stays working until agent_settled and measures from the first agent_start", async (t) => {
	vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
	t.after(() => vi.useRealTimers());
	const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
	const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
	t.after(() => {
		setIntervalSpy.mockRestore();
		clearIntervalSpy.mockRestore();
	});
	const { emit, timer } = await runStatusHarness(t);

	await emit("agent_start");
	assert.equal(setIntervalSpy.mock.calls.length, 1);
	vi.advanceTimersByTime(3_000);
	await emit("agent_end", { messages: [assistant("error")] });
	assert.match(timer(), /<dim>working <accent>3s/);
	assert.equal(clearIntervalSpy.mock.calls.length, 0, "agent_end keeps the working interval");

	// A retry inside the same run keeps the original start time.
	await emit("agent_start");
	assert.equal(setIntervalSpy.mock.calls.length, 1, "a retry does not restart the clock");
	vi.advanceTimersByTime(2_000);
	await emit("agent_end", { messages: [assistant("stop")] });
	assert.match(timer(), /<dim>working <accent>5s/);

	await emit("agent_settled", { aborted: false });
	assert.equal(clearIntervalSpy.mock.calls.length, 1, "agent_settled clears the working interval");
	assert.match(timer(), /<success>\+ <success>done <text>5s/);
});

test("footer run status reports failed and stopped runs and resets on session_start", async (t) => {
	vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
	t.after(() => vi.useRealTimers());
	const { emit, timer } = await runStatusHarness(t);

	await emit("agent_start");
	vi.advanceTimersByTime(1_000);
	await emit("agent_end", { messages: [assistant("stop"), { role: "toolResult" }, assistant("error")] });
	await emit("agent_settled", { aborted: false });
	assert.match(timer(), /<error>x <error>failed <text>1s/);

	await emit("agent_start");
	assert.doesNotMatch(timer(), /failed/);
	vi.advanceTimersByTime(2_000);
	await emit("agent_end", { messages: [assistant("aborted")] });
	await emit("agent_settled", { aborted: true });
	assert.match(timer(), /<muted>x <muted>stopped <text>2s/);

	await emit("session_start", { reason: "new" });
	assert.doesNotMatch(timer(), /stopped|done|failed|working/);
});
